import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'http'

const BLOCKED_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-xss-protection',
  'content-encoding',
  'transfer-encoding',
  'connection',
]);

// Resolve a potentially-relative URL against a base URL
function resolveUrl(val: string, base: string): string {
  if (!val || val.startsWith('data:') || val.startsWith('javascript:') || val.startsWith('#') || val.startsWith('mailto:')) return val;
  try { return new URL(val, base).href; } catch { return val; }
}

function rewriteHtml(html: string, pageUrl: string, proxyBase: string): string {
  const origin = new URL(pageUrl).origin;

  // Rewrite <link> tags: stylesheets go through proxy (so fonts can be rewritten too); others get absolute URL
  html = html.replace(/<link([^>]*?)(\/?)?>/gis, (tag: string, attrs: string, selfClose: string) => {
    const isStylesheet = /rel=["']stylesheet["']/i.test(attrs) || /type=["']text\/css["']/i.test(attrs);
    const rewritten = attrs.replace(/(href)=(["'])([^"']*)\2/gi, (_m: string, attr: string, q: string, val: string) => {
      const abs = resolveUrl(val, pageUrl);
      if (isStylesheet) return `${attr}=${q}${proxyBase}${encodeURIComponent(abs)}${q}`;
      return `${attr}=${q}${abs}${q}`;
    });
    return `<link${rewritten}${selfClose ?? ''}>`;
  });

  // Rewrite <script src> — absolute (blocked by sandbox but needed for URL resolution)
  html = html.replace(/<script([^>]*?)>/gis, (tag: string, attrs: string) => {
    const rewritten = attrs.replace(/(src)=(["'])([^"']*)\2/gi, (_m: string, attr: string, q: string, val: string) =>
      `${attr}=${q}${resolveUrl(val, pageUrl)}${q}`
    );
    return `<script${rewritten}>`;
  });

  // Rewrite <img>, <source>, <video>, <audio>, <input> src/poster
  html = html.replace(/<(img|source|video|audio|input)([^>]*?)(\/?)?>/gis, (tag: string, tagName: string, attrs: string, selfClose: string) => {
    const rewritten = attrs
      .replace(/(src|poster|data-src|data-lazy)=(["'])([^"']*)\2/gi, (_m: string, attr: string, q: string, val: string) =>
        `${attr}=${q}${resolveUrl(val, pageUrl)}${q}`
      )
      .replace(/srcset=(["'])([^"']*)\2/gi, (_m: string, q: string, val: string) => {
        const rw = val.replace(/([^\s,]+)(\s+\S+)?/g, (part: string, url: string, descriptor: string) =>
          resolveUrl(url, pageUrl) + (descriptor ?? '')
        );
        return `srcset=${q}${rw}${q}`;
      });
    return `<${tagName}${rewritten}${selfClose ?? ''}>`;
  });

  // Rewrite <form action>
  html = html.replace(/<form([^>]*?)>/gis, (tag: string, attrs: string) => {
    const rewritten = attrs.replace(/(action)=(["'])([^"']*)\2/gi, (_m: string, attr: string, q: string, val: string) =>
      `${attr}=${q}${resolveUrl(val, pageUrl)}${q}`
    );
    return `<form${rewritten}>`;
  });

  // Rewrite <a href> through proxy for navigation
  html = html.replace(/<a([^>]*?)>/gis, (tag: string, attrs: string) => {
    const rewritten = attrs.replace(/(href)=(["'])([^"']*)\2/gi, (_m: string, attr: string, q: string, val: string) => {
      if (!val || val.startsWith('#') || val.startsWith('javascript:') || val.startsWith('mailto:') || val.startsWith('tel:')) return `${attr}=${q}${val}${q}`;
      const abs = resolveUrl(val, pageUrl);
      return `${attr}=${q}${proxyBase}${encodeURIComponent(abs)}${q}`;
    });
    return `<a${rewritten}>`;
  });

  // Remove CSP meta tags
  html = html.replace(/<meta[^>]+content-security-policy[^>]*>/gi, '');

  // Inject <base> + early error-suppression script to prevent framework overlays (Next.js etc.)
  // allow-same-origin + allow-scripts means the iframe can reach same-origin APIs, but in our
  // dev proxy context (everything on localhost) this is acceptable.
  const errorGuard = `<script>(function(){window.onerror=function(){return true};window.addEventListener('unhandledrejection',function(e){e.preventDefault()});if(window.MutationObserver){new window.MutationObserver(function(){document.querySelectorAll('nextjs-portal,[data-nextjs-dialog],[data-nextjs-dialog-overlay],#__next-build-watcher').forEach(function(el){el.remove()})}).observe(document.documentElement,{childList:true,subtree:true})}})()</script>`;
  if (!html.match(/<base\s/i)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${origin}/">${errorGuard}`);
  } else {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${errorGuard}`);
  }

  return html;
}

function rewriteCss(css: string, cssUrl: string, proxyBase: string): string {
  // Rewrite url() — route everything through proxy so fonts/images are same-origin
  css = css.replace(/url\((['"]?)([^'")\s]+)\1\)/gi, (_m: string, q: string, val: string) => {
    if (val.startsWith('data:')) return _m;
    const abs = resolveUrl(val, cssUrl);
    return `url(${q}${proxyBase}${encodeURIComponent(abs)}${q})`;
  });
  // Rewrite @import
  css = css.replace(/@import\s+(['"])([^'"]+)\1/gi, (_m: string, q: string, val: string) => {
    const abs = resolveUrl(val, cssUrl);
    return `@import ${q}${proxyBase}${encodeURIComponent(abs)}${q}`;
  });
  css = css.replace(/@import\s+url\((['"]?)([^'")\s]+)\1\)/gi, (_m: string, q: string, val: string) => {
    const abs = resolveUrl(val, cssUrl);
    return `@import url(${q}${proxyBase}${encodeURIComponent(abs)}${q})`;
  });
  return css;
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'web-proxy',
      configureServer(server) {
        server.middlewares.use('/web-proxy', async (req: IncomingMessage, res: ServerResponse) => {
          const rawUrl = req.url?.slice(1);
          if (!rawUrl) { res.statusCode = 400; res.end('Missing URL'); return; }

          const targetUrl = decodeURIComponent(rawUrl);
          const proxyBase = '/web-proxy/';

          try {
            const upstream = await fetch(targetUrl, {
              redirect: 'follow',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
              },
            });

            const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';

            upstream.headers.forEach((value, key) => {
              if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
                try { res.setHeader(key, value); } catch { /* skip */ }
              }
            });
            res.setHeader('Access-Control-Allow-Origin', '*');

            if (contentType.includes('text/html')) {
              let html = await upstream.text();
              html = rewriteHtml(html, targetUrl, proxyBase);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(html);
            } else if (contentType.includes('text/css')) {
              let css = await upstream.text();
              css = rewriteCss(css, targetUrl, proxyBase);
              res.setHeader('Content-Type', 'text/css; charset=utf-8');
              res.end(css);
            } else {
              res.setHeader('Content-Type', contentType);
              res.end(Buffer.from(await upstream.arrayBuffer()));
            }
          } catch (err: any) {
            res.statusCode = 502;
            res.end(`Proxy error: ${err?.message ?? err}`);
          }
        });
      },
    },
  ],
})
