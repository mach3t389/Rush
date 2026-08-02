import React from 'react';

const URL_OR_MENTION = /(@\S+|https?:\/\/[^\s<]+|www\.[^\s<]+)/g;

function isUrl(part: string): boolean {
  return /^(https?:\/\/|www\.)/.test(part);
}

export function linkify(text: string): React.ReactNode[] {
  return text.split(URL_OR_MENTION).map((part, i) => {
    if (part.startsWith('@')) {
      return <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>;
    }
    if (isUrl(part)) {
      // Ne pas avaler la ponctuation finale (., ,, ;, :, !, ?, ), ]) dans le lien —
      // sinon "voir https://exemple.com." pointe vers une URL avec un point collé.
      const trailingMatch = part.match(/[.,;:!?)\]]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const linkText = trailing ? part.slice(0, -trailing.length) : part;
      const href = linkText.startsWith('www.') ? `https://${linkText}` : linkText;
      return (
        <React.Fragment key={i}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {linkText}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    return part;
  });
}
