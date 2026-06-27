// Deep-merges every scratch-i18n/*.json fragment into app/src/locales/{fr,en}.json
// Fragment shape: { "fr": { "<ns>": { ... } }, "en": { "<ns>": { ... } } }
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'app', 'src', 'locales');

function deepMerge(target, src, path = '') {
  for (const [k, v] of Object.entries(src)) {
    const keyPath = path ? `${path}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      target[k] = target[k] && typeof target[k] === 'object' ? target[k] : {};
      deepMerge(target[k], v, keyPath);
    } else {
      if (target[k] !== undefined && target[k] !== v) {
        console.log(`  ~ overwrite ${keyPath}: "${target[k]}" -> "${v}"`);
      }
      target[k] = v;
    }
  }
}

const fr = JSON.parse(readFileSync(join(localesDir, 'fr.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8'));

const fragments = readdirSync(here).filter(f => f.endsWith('.json'));
let count = 0;
for (const f of fragments) {
  const frag = JSON.parse(readFileSync(join(here, f), 'utf8'));
  if (frag.fr) { console.log(`merging ${f} (fr)`); deepMerge(fr, frag.fr); }
  if (frag.en) { console.log(`merging ${f} (en)`); deepMerge(en, frag.en); }
  count++;
}

writeFileSync(join(localesDir, 'fr.json'), JSON.stringify(fr, null, 2) + '\n', 'utf8');
writeFileSync(join(localesDir, 'en.json'), JSON.stringify(en, null, 2) + '\n', 'utf8');
console.log(`\nMerged ${count} fragment(s). fr keys top-level: ${Object.keys(fr).length}, en: ${Object.keys(en).length}`);
