// One-off script to generate public/favicon.ico from public/favicon.svg —
// Vercel's project-icon auto-import looks for the classic /favicon.ico path,
// which this repo didn't have (only the modern SVG favicon). Run with:
//   node scripts/gen-favicon.mjs
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, '..', 'public', 'favicon.svg');
const icoPath = path.join(__dirname, '..', 'public', 'favicon.ico');
const pngPath = path.join(__dirname, '..', 'public', 'favicon-512.png');

const svg = readFileSync(svgPath);
const sizes = [16, 32, 48];

const run = async () => {
  const pngBuffers = await Promise.all(
    sizes.map(size => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer())
  );
  const icoBuffer = await pngToIco(pngBuffers);
  writeFileSync(icoPath, icoBuffer);

  // Also keep a larger PNG around for places that want a raster favicon
  // (e.g. app manifest, social previews) instead of the SVG.
  const largePng = await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer();
  writeFileSync(pngPath, largePng);

  console.log('Wrote', icoPath, 'and', pngPath);
};

run();
