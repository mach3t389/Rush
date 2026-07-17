# Video Chapters + Manual Timecode Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic chapter extraction (from QuickTime-style MP4 chapter tracks), chapter markers + navigation buttons, and manual timecode entry to the video review tool (`VideoReview.tsx`).

**Architecture:** A new, isolated `videoChapters.ts` module does all MP4-parsing (via `mp4box.js`, fed only the first 2 MB of the file via a bounded-read `fetch`) and returns a plain `Chapter[]`. `VideoReview.tsx` calls it once per video version, caches the result on that version (which already persists via the existing `resourceContentStore` snapshot mechanism — no new persistence code needed), and renders markers/nav buttons/timecode entry from that cached array.

**Tech Stack:** React 19 + TypeScript, `mp4box.js` (new dependency) for MP4 box parsing, no test framework in this project — verification is `tsc` + manual browser checks via the existing preview workflow.

## Global Constraints

- No automated test suite exists in this project — every task's "testing" step is `npx tsc --noEmit -p tsconfig.app.json` plus a manual browser check (per `CLAUDE.md`: "La vérification se fait via le serveur de preview").
- Never hard-code user-facing text — every new string goes through `t('review.xxx')` with keys added to both `app/src/locales/fr.json` and `app/src/locales/en.json` (per `CLAUDE.md`'s i18n rule).
- Chapter extraction only fetches the first 2 MB of the video file (bounded, regardless of whether the server honors the `Range` header) — never the whole file, per the design spec.
- **Task 3 requires a real MP4 file that the user confirms contains QuickTime-style chapter markers.** Without one, extraction can only be verified to "not crash," never to actually work — ask the user for this file before starting Task 3 if it hasn't been provided yet.

---

### Task 1: Add the `mp4box` dependency and its type declarations

**Files:**
- Modify: `app/package.json` (via `npm install`)
- Create: `app/src/types/mp4box.d.ts`

**Interfaces:**
- Produces: ambient module `mp4box` exporting `default MP4Box: { createFile(): MP4File }`, plus the types `MP4File`, `MP4Info`, `MP4TrackInfo`, `MP4TrackReference`, `MP4Sample` — consumed by Task 2's `videoChapters.ts`.

- [ ] **Step 1: Install the dependency**

Run (from `app/`):
```bash
cd "D:/Vibe Coding/Rush/app" && npm install mp4box
```
Expected: `package.json`'s `dependencies` gains a `"mp4box": "^..."` line.

- [ ] **Step 2: Check whether the installed package ships its own TypeScript types**

Run:
```bash
cat "D:/Vibe Coding/Rush/app/node_modules/mp4box/package.json" | grep -i "\"types\"\|\"typings\""
```
- If this prints a `types`/`typings` field pointing to a real file: open that file, confirm it exports something usable for `createFile()`, `onReady`, `onSamples`, `appendBuffer`, `flush`, `setExtractionOptions`, `start`. If it does, **skip Step 3** and instead write `import MP4Box from 'mp4box'` directly in Task 2 without a custom ambient module (adjust Task 2's imports to match whatever shape the real types export — the logic in Task 2 stays the same either way, only the import line and type names might need to match the real package's exports instead of the ones below).
- If nothing prints (most likely — `mp4box` on npm does not bundle types as of this writing): continue to Step 3.

- [ ] **Step 3: Write the ambient type declaration**

Create `app/src/types/mp4box.d.ts`:

```ts
declare module 'mp4box' {
  export interface MP4TrackReference {
    type: string;
    track_ids: number[];
  }

  export interface MP4TrackInfo {
    id: number;
    type: string;
    references?: MP4TrackReference[];
  }

  export interface MP4Info {
    tracks: MP4TrackInfo[];
  }

  export interface MP4Sample {
    data: Uint8Array;
    cts: number;
    timescale: number;
  }

  export interface MP4File {
    onReady: (info: MP4Info) => void;
    onError: (error: string) => void;
    onSamples: (id: number, user: unknown, samples: MP4Sample[]) => void;
    appendBuffer(buffer: ArrayBuffer & { fileStart: number }): void;
    flush(): void;
    setExtractionOptions(id: number, user: unknown, options: { nbSamples: number }): void;
    start(): void;
    moov?: unknown;
  }

  const MP4Box: {
    createFile(): MP4File;
  };

  export default MP4Box;
}
```

- [ ] **Step 4: Verify the project still typechecks**

Run:
```bash
cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json
```
Expected: no output (clean pass) — the new `.d.ts` isn't imported by anything yet, this just confirms it doesn't conflict with anything.

- [ ] **Step 5: Commit**

```bash
cd "D:/Vibe Coding/Rush" && git add app/package.json app/package-lock.json app/src/types/mp4box.d.ts && git commit -m "chore: add mp4box dependency + ambient types for video chapter parsing"
```

---

### Task 2: `videoChapters.ts` — MP4 chapter-track extraction module

**Files:**
- Create: `app/src/data/videoChapters.ts`

**Interfaces:**
- Consumes: `MP4Box` default export + `MP4File`/`MP4Info`/`MP4Sample` types from `mp4box` (Task 1).
- Produces: `export interface Chapter { id: string; label: string; timeSeconds: number }` and `export async function extractChapters(url: string): Promise<Chapter[]>` — consumed by Task 3.

- [ ] **Step 1: Write the module**

Create `app/src/data/videoChapters.ts`:

```ts
// Extraction des chapitres intégrés dans un fichier vidéo (piste de
// chapitres façon QuickTime — produite par Premiere/Final Cut/DaVinci à
// l'export). Ne récupère que le début du fichier, jamais la vidéo entière.
//
// Limite acceptée : si les métadonnées (moov) ne sont pas dans les premiers
// octets récupérés, on ne trouve aucun chapitre — pas de deuxième tentative
// sur la fin du fichier (voir le design doc).

import MP4Box from 'mp4box';
import type { MP4File, MP4Info, MP4Sample } from 'mp4box';

export interface Chapter {
  id: string;
  label: string;
  timeSeconds: number;
}

const HEAD_BYTES = 2 * 1024 * 1024; // 2 Mo — voir le design doc

// Récupère au plus `maxBytes` octets depuis le début de `url`, en coupant la
// requête réseau dès qu'on en a assez — même si le serveur ignore l'en-tête
// Range et renvoie le fichier complet en 200, on ne lit jamais plus que ça.
async function fetchHeadBytes(url: string, maxBytes: number): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  let res: Response;
  try {
    res = await fetch(url, { headers: { Range: `bytes=0-${maxBytes - 1}` }, signal: controller.signal });
  } catch {
    return null;
  }
  if (!res.ok || !res.body) { controller.abort(); return null; }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    return null;
  } finally {
    controller.abort();
  }

  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = merged.length - offset;
    if (remaining <= 0) break;
    const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
    merged.set(slice, offset);
    offset += slice.byteLength;
  }
  return merged.buffer;
}

// Trouve l'id de la piste de chapitres QuickTime : une piste vidéo/audio la
// référence via une boîte `tref` de sous-type `chap`. mp4box.js l'expose
// soit via le champ public documenté `track.references`, soit seulement
// dans l'arbre de boîtes brut `moov` selon la version — on essaie les deux.
function findChapterTrackId(mp4boxFile: MP4File, info: MP4Info): number | null {
  for (const track of info.tracks) {
    const ref = track.references?.find(r => r.type === 'chap');
    if (ref && ref.track_ids.length > 0) return ref.track_ids[0];
  }

  const moovBoxes = (mp4boxFile.moov as { boxes?: unknown[] } | undefined)?.boxes ?? [];
  for (const trak of moovBoxes as Array<{ type?: string; boxes?: unknown[] }>) {
    if (trak.type !== 'trak') continue;
    const tref = (trak.boxes ?? []).find((b): b is { type: string; boxes?: unknown[] } =>
      typeof b === 'object' && b !== null && (b as { type?: string }).type === 'tref');
    if (!tref) continue;
    const chap = (tref.boxes ?? []).find((b): b is { type: string; track_ids?: number[] } =>
      typeof b === 'object' && b !== null && (b as { type?: string }).type === 'chap');
    if (chap?.track_ids?.length) return chap.track_ids[0];
  }

  return null;
}

// Décode un échantillon de piste texte QuickTime : les 2 premiers octets
// (big-endian) donnent la longueur du texte UTF-8 qui suit — format
// standard des "TextSample" utilisés pour les titres de chapitres.
function decodeTextSample(data: Uint8Array): string {
  if (data.byteLength < 2) return '';
  const len = (data[0] << 8) | data[1];
  const textBytes = data.subarray(2, 2 + len);
  return new TextDecoder('utf-8').decode(textBytes);
}

export async function extractChapters(url: string): Promise<Chapter[]> {
  const buffer = await fetchHeadBytes(url, HEAD_BYTES);
  if (!buffer) return [];

  return new Promise<Chapter[]>(resolve => {
    const mp4boxFile = MP4Box.createFile();
    let settled = false;
    const finish = (chapters: Chapter[]) => {
      if (settled) return;
      settled = true;
      resolve(chapters);
    };

    mp4boxFile.onError = () => finish([]);

    mp4boxFile.onReady = (info: MP4Info) => {
      const trackId = findChapterTrackId(mp4boxFile, info);
      if (trackId === null) { finish([]); return; }

      mp4boxFile.onSamples = (_id: number, _user: unknown, samples: MP4Sample[]) => {
        const chapters: Chapter[] = [];
        for (const sample of samples) {
          const label = decodeTextSample(sample.data);
          if (!label) continue;
          chapters.push({
            id: `chap-${sample.cts}`,
            label,
            timeSeconds: sample.cts / sample.timescale,
          });
        }
        chapters.sort((a, b) => a.timeSeconds - b.timeSeconds);
        finish(chapters);
      };

      mp4boxFile.setExtractionOptions(trackId, null, { nbSamples: Infinity });
      mp4boxFile.start();
    };

    const mp4boxBuffer = buffer as ArrayBuffer & { fileStart: number };
    mp4boxBuffer.fileStart = 0;
    mp4boxFile.appendBuffer(mp4boxBuffer);
    mp4boxFile.flush();

    // `onReady` n'est déclenché que si les métadonnées (moov) ont été
    // trouvées dans les octets récupérés — sinon on abandonne proprement
    // plutôt que de laisser la promesse en attente indéfiniment.
    setTimeout(() => finish([]), 0);
  });
}
```

- [ ] **Step 2: Verify it typechecks**

Run:
```bash
cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json
```
Expected: no output. If Task 1's Step 2 found bundled types with different export names, fix the import line and any mismatched type names here until this passes.

- [ ] **Step 3: Commit**

```bash
cd "D:/Vibe Coding/Rush" && git add app/src/data/videoChapters.ts && git commit -m "feat(video-chapters): add MP4 chapter-track extraction module"
```

---

### Task 3: Wire extraction into `VideoReview.tsx` and cache per version

**Files:**
- Modify: `app/src/screens/VideoReview.tsx:56-66` (the `LocalVersion` interface)
- Modify: `app/src/screens/VideoReview.tsx:1` (imports)
- Modify: `app/src/screens/VideoReview.tsx:278-279` (add the extraction effect right after the existing version-change effect)

**Interfaces:**
- Consumes: `extractChapters`, `type Chapter` from `../data/videoChapters` (Task 2).
- Produces: `LocalVersion.chapters?: Chapter[]` — consumed by Task 4 (markers) and Task 5 (nav buttons). `activeVer.chapters` becomes readable anywhere else in the component.

- [ ] **Step 1: Add the import**

In `app/src/screens/VideoReview.tsx`, the file currently starts with:
```ts
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { SFPill, SFAvatar, SFButton, SFIcon } from '../components/ui';
```
Add a new import line right after those, before the `VIDEO_COMMENTS` import:
```ts
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { SFPill, SFAvatar, SFButton, SFIcon } from '../components/ui';
import { extractChapters, type Chapter } from '../data/videoChapters';
```

- [ ] **Step 2: Add `chapters` to `LocalVersion`**

Find (around line 56):
```ts
interface LocalVersion {
  v: string;
  status: Status;
  label: string;
  date: string;
  author: typeof USERS.lea;
  size?: number; // octets — taille du fichier de la version (visible dans la vue Stockage)
  mediaFileId?: string; // clé fileContentStore du média réel déposé (vidéo/audio)
  mediaName?: string;
  mediaType?: string;   // type MIME du média déposé
}
```
Replace with:
```ts
interface LocalVersion {
  v: string;
  status: Status;
  label: string;
  date: string;
  author: typeof USERS.lea;
  size?: number; // octets — taille du fichier de la version (visible dans la vue Stockage)
  mediaFileId?: string; // clé fileContentStore du média réel déposé (vidéo/audio)
  mediaName?: string;
  mediaType?: string;   // type MIME du média déposé
  chapters?: Chapter[]; // résultat (mis en cache) de l'extraction automatique — undefined = pas encore tenté
}
```

- [ ] **Step 3: Add the extraction effect**

Find (around line 278-279):
```ts
  // Réinitialise la durée/lecture au changement de version (média différent)
  useEffect(() => { setMediaDuration(null); setCurrentTime(0); setPlaying(false); }, [activeVersion]);
```
Replace with:
```ts
  // Réinitialise la durée/lecture au changement de version (média différent)
  useEffect(() => { setMediaDuration(null); setCurrentTime(0); setPlaying(false); }, [activeVersion]);

  // Extraction automatique des chapitres (piste QuickTime) — une seule fois
  // par version ; le résultat (même vide) est mis en cache dans `versions`,
  // qui est déjà persisté via le snapshot existant plus bas.
  useEffect(() => {
    if (!mediaUrl || !activeVer || activeVer.chapters !== undefined) return;
    let cancelled = false;
    extractChapters(mediaUrl)
      .then(chapters => {
        if (cancelled) return;
        setVersions(prev => prev.map(v => v.v === activeVersion ? { ...v, chapters } : v));
      })
      .catch(() => {
        if (cancelled) return;
        setVersions(prev => prev.map(v => v.v === activeVersion ? { ...v, chapters: [] } : v));
      });
    return () => { cancelled = true; };
  }, [mediaUrl, activeVersion, activeVer]);
```

- [ ] **Step 4: Verify it typechecks**

Run:
```bash
cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json
```
Expected: no output.

- [ ] **Step 5: Manual verification with a real chapter-containing file**

This is the step that actually proves extraction works — everything before it only proves the code compiles.

1. Start the dev server: `cd "D:/Vibe Coding/Rush/app" && npm run dev` (or reuse the one already running in this session).
2. Open the app, log in, navigate to any project's Fichiers → a video resource (or create one), open it in `VideoReview`.
3. Drop in the real MP4 file that the user has confirmed contains QuickTime chapter markers.
4. Open the browser console. Temporarily add `console.log('chapters:', chapters)` right after the `extractChapters(...)` `.then()` line from Step 3 (or inspect via the React DevTools / a breakpoint) to confirm the returned array is non-empty and each entry has a sensible `label`/`timeSeconds`.
5. If the array comes back empty on a file the user swears has chapters:
   - Confirm the file's `moov` atom is actually near the start (`ffprobe -show_format <file>` or similar — if `moov` is at the end, this is the accepted limitation from the design doc, not a bug).
   - If `moov` is near the start, add a temporary `console.log(info)` inside `onReady` in `videoChapters.ts` to inspect the real shape mp4box.js returned for this file/version, and adjust `findChapterTrackId`'s box-tree fallback in Task 2 to match what's actually there.
6. Once a real file produces a correct chapters array, remove any temporary `console.log` added for this step.

- [ ] **Step 6: Commit**

```bash
cd "D:/Vibe Coding/Rush" && git add app/src/screens/VideoReview.tsx && git commit -m "feat(video-chapters): extract and cache chapters per video version"
```

---

### Task 4: Chapter markers on the scrubber timeline

**Files:**
- Modify: `app/src/screens/VideoReview.tsx:1006-1011` (inside the video scrubber's track div)

**Interfaces:**
- Consumes: `activeVer.chapters` (Task 3), `TOTAL`, `seekTo` (both already exist in this file).

- [ ] **Step 1: Add chapter markers to the scrubber track**

Find (this is inside the video-frame scrubber, right after the tasks `.map` and right before the "Playhead thumb" comment):
```tsx
                {tasks.filter(t => t.timeLabel && !t.done).map(t => {
                  const [m, s] = (t.timeLabel ?? '0:0').split(':').map(Number);
                  const secs = m * 60 + s;
                  return <div key={t.id} title={t.title} style={{ position: 'absolute', top: '50%', left: `${(secs / TOTAL) * 100}%`, transform: 'translate(-50%, -50%)', width: 8, height: 8, borderRadius: 2, background: 'var(--warn)', border: '2px solid var(--bg)', zIndex: 1 }} />;
                })}
                {/* Playhead thumb */}
```
Replace with:
```tsx
                {tasks.filter(t => t.timeLabel && !t.done).map(t => {
                  const [m, s] = (t.timeLabel ?? '0:0').split(':').map(Number);
                  const secs = m * 60 + s;
                  return <div key={t.id} title={t.title} style={{ position: 'absolute', top: '50%', left: `${(secs / TOTAL) * 100}%`, transform: 'translate(-50%, -50%)', width: 8, height: 8, borderRadius: 2, background: 'var(--warn)', border: '2px solid var(--bg)', zIndex: 1 }} />;
                })}
                {/* Chapter markers */}
                {(activeVer?.chapters ?? []).map(chap => (
                  <div key={chap.id}
                    title={chap.label}
                    onClick={e => { e.stopPropagation(); seekTo(chap.timeSeconds); }}
                    style={{ position: 'absolute', top: 0, bottom: 0, left: `${(chap.timeSeconds / TOTAL) * 100}%`, width: 2, background: 'var(--text-3)', cursor: 'pointer', zIndex: 1 }}
                  />
                ))}
                {/* Playhead thumb */}
```

- [ ] **Step 2: Verify it typechecks**

Run:
```bash
cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json
```
Expected: no output.

- [ ] **Step 3: Manual verification**

With the same chapter-containing file from Task 3 loaded in `VideoReview`: confirm thin vertical tick marks appear along the scrubber at the chapter positions, hovering one shows its label as a tooltip, and clicking one seeks the video there.

- [ ] **Step 4: Commit**

```bash
cd "D:/Vibe Coding/Rush" && git add app/src/screens/VideoReview.tsx && git commit -m "feat(video-chapters): show chapter markers on the scrubber timeline"
```

---

### Task 5: Prev/Next chapter navigation buttons + locale keys

**Files:**
- Modify: `app/src/screens/VideoReview.tsx:601` (add `goPrevChapter`/`goNextChapter` next to the existing comment-nav functions)
- Modify: `app/src/screens/VideoReview.tsx:1025-1054` (transport controls row)
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Consumes: `activeVer.chapters` (Task 3), `seekTo`, `currentTime` (both already exist).

- [ ] **Step 1: Add the chapter navigation functions**

Find (around line 598-601):
```ts
  const versionComments = comments.filter(c => c.versionId === activeVersion);
  const timedComments = versionComments.filter(c => c.timeSeconds !== null && c.status !== 'resolved').sort((a, b) => a.timeSeconds! - b.timeSeconds!);
  const goNextComment = () => { const next = timedComments.find(c => c.timeSeconds! > currentTime + 0.3); if (next) jumpToComment(next); };
  const goPrevComment = () => { const prev = [...timedComments].reverse().find(c => c.timeSeconds! < currentTime - 0.3); if (prev) jumpToComment(prev); };
```
Replace with:
```ts
  const versionComments = comments.filter(c => c.versionId === activeVersion);
  const timedComments = versionComments.filter(c => c.timeSeconds !== null && c.status !== 'resolved').sort((a, b) => a.timeSeconds! - b.timeSeconds!);
  const goNextComment = () => { const next = timedComments.find(c => c.timeSeconds! > currentTime + 0.3); if (next) jumpToComment(next); };
  const goPrevComment = () => { const prev = [...timedComments].reverse().find(c => c.timeSeconds! < currentTime - 0.3); if (prev) jumpToComment(prev); };

  const sortedChapters = [...(activeVer?.chapters ?? [])].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const goNextChapter = () => { const next = sortedChapters.find(c => c.timeSeconds > currentTime + 0.3); if (next) seekTo(next.timeSeconds); };
  const goPrevChapter = () => { const prev = [...sortedChapters].reverse().find(c => c.timeSeconds < currentTime - 0.3); if (prev) seekTo(prev.timeSeconds); };
```

- [ ] **Step 2: Add the buttons to the transport controls**

Find (the whole "Center: transport controls" block):
```tsx
              {/* Center: transport controls */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {/* Prev comment */}
                <button onClick={goPrevComment} title={t('review.prevComment')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, cursor: timedComments.some(c => c.timeSeconds! < currentTime - 0.3) ? 'pointer' : 'default', flexShrink: 0, color: 'var(--text-2)', opacity: timedComments.some(c => c.timeSeconds! < currentTime - 0.3) ? 1 : 0.35 }}>
                  <SFIcon name="chevron-left" size={12} />
                  <SFIcon name="message-circle" size={13} />
                </button>
                {/* Rewind -15s */}
                <button onClick={() => seekBy(-15)} title={t('review.rewind15')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, color: 'var(--text-2)' }}>
                  <SFIcon name="arrow-left" size={13} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, fontWeight: 700 }}>15s</span>
                </button>
                {/* Play/Pause — large, centered */}
                <button onClick={togglePlay} title={playing ? t('review.pauseSpace') : t('review.playSpace')}
                  style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 0 18px rgba(249,255,0,0.25)' }}>
                  <SFIcon name={playing ? 'pause' : currentTime >= TOTAL ? 'rotate-ccw' : 'play'} size={20} color="var(--on-accent)" />
                </button>
                {/* Forward +15s */}
                <button onClick={() => seekBy(15)} title={t('review.forward15')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, color: 'var(--text-2)' }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, fontWeight: 700 }}>15s</span>
                  <SFIcon name="arrow-right" size={13} />
                </button>
                {/* Next comment */}
                <button onClick={goNextComment} title={t('review.nextComment')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, cursor: timedComments.some(c => c.timeSeconds! > currentTime + 0.3) ? 'pointer' : 'default', flexShrink: 0, color: 'var(--text-2)', opacity: timedComments.some(c => c.timeSeconds! > currentTime + 0.3) ? 1 : 0.35 }}>
                  <SFIcon name="message-circle" size={13} />
                  <SFIcon name="chevron-right" size={12} />
                </button>
              </div>
```
Replace with:
```tsx
              {/* Center: transport controls */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {/* Prev chapter */}
                <button onClick={goPrevChapter} title={t('review.prevChapter')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, cursor: sortedChapters.some(c => c.timeSeconds < currentTime - 0.3) ? 'pointer' : 'default', flexShrink: 0, color: 'var(--text-2)', opacity: sortedChapters.some(c => c.timeSeconds < currentTime - 0.3) ? 1 : 0.35 }}>
                  <SFIcon name="chevron-left" size={12} />
                  <SFIcon name="bookmark" size={13} />
                </button>
                {/* Prev comment */}
                <button onClick={goPrevComment} title={t('review.prevComment')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, cursor: timedComments.some(c => c.timeSeconds! < currentTime - 0.3) ? 'pointer' : 'default', flexShrink: 0, color: 'var(--text-2)', opacity: timedComments.some(c => c.timeSeconds! < currentTime - 0.3) ? 1 : 0.35 }}>
                  <SFIcon name="chevron-left" size={12} />
                  <SFIcon name="message-circle" size={13} />
                </button>
                {/* Rewind -15s */}
                <button onClick={() => seekBy(-15)} title={t('review.rewind15')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, color: 'var(--text-2)' }}>
                  <SFIcon name="arrow-left" size={13} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, fontWeight: 700 }}>15s</span>
                </button>
                {/* Play/Pause — large, centered */}
                <button onClick={togglePlay} title={playing ? t('review.pauseSpace') : t('review.playSpace')}
                  style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 0 18px rgba(249,255,0,0.25)' }}>
                  <SFIcon name={playing ? 'pause' : currentTime >= TOTAL ? 'rotate-ccw' : 'play'} size={20} color="var(--on-accent)" />
                </button>
                {/* Forward +15s */}
                <button onClick={() => seekBy(15)} title={t('review.forward15')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, color: 'var(--text-2)' }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, fontWeight: 700 }}>15s</span>
                  <SFIcon name="arrow-right" size={13} />
                </button>
                {/* Next comment */}
                <button onClick={goNextComment} title={t('review.nextComment')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, cursor: timedComments.some(c => c.timeSeconds! > currentTime + 0.3) ? 'pointer' : 'default', flexShrink: 0, color: 'var(--text-2)', opacity: timedComments.some(c => c.timeSeconds! > currentTime + 0.3) ? 1 : 0.35 }}>
                  <SFIcon name="message-circle" size={13} />
                  <SFIcon name="chevron-right" size={12} />
                </button>
                {/* Next chapter */}
                <button onClick={goNextChapter} title={t('review.nextChapter')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, cursor: sortedChapters.some(c => c.timeSeconds > currentTime + 0.3) ? 'pointer' : 'default', flexShrink: 0, color: 'var(--text-2)', opacity: sortedChapters.some(c => c.timeSeconds > currentTime + 0.3) ? 1 : 0.35 }}>
                  <SFIcon name="bookmark" size={13} />
                  <SFIcon name="chevron-right" size={12} />
                </button>
              </div>
```

- [ ] **Step 3: Add locale keys**

In `app/src/locales/fr.json`, find:
```json
    "prevComment": "Commentaire précédent",
    "rewind15": "Retour de 15 secondes",
    "pauseSpace": "Pause (Espace)",
    "playSpace": "Lecture (Espace)",
    "forward15": "Avance de 15 secondes",
    "nextComment": "Commentaire suivant",
```
Replace with:
```json
    "prevComment": "Commentaire précédent",
    "prevChapter": "Chapitre précédent",
    "rewind15": "Retour de 15 secondes",
    "pauseSpace": "Pause (Espace)",
    "playSpace": "Lecture (Espace)",
    "forward15": "Avance de 15 secondes",
    "nextComment": "Commentaire suivant",
    "nextChapter": "Chapitre suivant",
```

In `app/src/locales/en.json`, find:
```json
    "prevComment": "Previous comment",
    "rewind15": "Rewind 15 seconds",
    "pauseSpace": "Pause (Space)",
    "playSpace": "Play (Space)",
    "forward15": "Forward 15 seconds",
    "nextComment": "Next comment",
```
Replace with:
```json
    "prevComment": "Previous comment",
    "prevChapter": "Previous chapter",
    "rewind15": "Rewind 15 seconds",
    "pauseSpace": "Pause (Space)",
    "playSpace": "Play (Space)",
    "forward15": "Forward 15 seconds",
    "nextComment": "Next comment",
    "nextChapter": "Next chapter",
```

- [ ] **Step 4: Verify it typechecks**

Run:
```bash
cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json
```
Expected: no output.

- [ ] **Step 5: Manual verification**

With the chapter-containing file loaded: confirm two new buttons (bookmark icon + chevron) appear flanking the existing comment-nav buttons, dimmed/inert when there's no chapter in that direction from the current position, and clicking them jumps to the correct chapter start time. Also load a video with zero chapters and confirm both new buttons render fully dimmed and inert (never crash, never look broken).

- [ ] **Step 6: Commit**

```bash
cd "D:/Vibe Coding/Rush" && git add app/src/screens/VideoReview.tsx app/src/locales/fr.json app/src/locales/en.json && git commit -m "feat(video-chapters): add prev/next chapter navigation buttons"
```

---

### Task 6: Manual timecode entry (click the time display to type an exact time)

**Files:**
- Modify: `app/src/screens/VideoReview.tsx` (new state near the other player state, a new `parseTimecode` helper near `secsToLabel`, and the timecode `<span>` in the transport controls)
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Consumes: `seekTo`, `secsToLabel`, `currentTime`, `TOTAL` (all already exist).
- Produces: `parseTimecode(input: string): number | null` — pure helper, not consumed elsewhere in this plan but kept exported-from-file-scope style (module-level function) for testability/clarity.

- [ ] **Step 1: Add the `parseTimecode` helper**

Find (around line 79-83):
```ts
function secsToLabel(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
```
Replace with:
```ts
function secsToLabel(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Accepte "SS", "MM:SS" ou "H:MM:SS" — chaque segment séparé par ":" décale
// le total précédent d'un facteur 60. Retourne null si le format est invalide.
function parseTimecode(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map(p => p.trim());
  if (parts.some(p => p === '' || Number.isNaN(Number(p)))) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + Number(part);
  return seconds;
}
```

- [ ] **Step 2: Add the editing state**

Find (around line 239-240):
```ts
  const [volume, setVolume]       = useState(1);
  const [showVolume, setShowVolume] = useState(false);
```
Replace with:
```ts
  const [volume, setVolume]       = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const [editingTimecode, setEditingTimecode] = useState(false);
  const [timecodeDraft, setTimecodeDraft] = useState('');
```

- [ ] **Step 3: Make the timecode display clickable/editable**

Find (the "Left: timecode" block in the transport controls):
```tsx
              {/* Left: timecode */}
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, minWidth: 96 }}>
                {secsToLabel(currentTime)} / {secsToLabel(TOTAL)}
              </span>
```
Replace with:
```tsx
              {/* Left: timecode */}
              {editingTimecode ? (
                <input
                  autoFocus
                  value={timecodeDraft}
                  onChange={e => setTimecodeDraft(e.target.value)}
                  onBlur={() => setEditingTimecode(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const parsed = parseTimecode(timecodeDraft);
                      if (parsed !== null) seekTo(parsed);
                      setEditingTimecode(false);
                    }
                    if (e.key === 'Escape') setEditingTimecode(false);
                  }}
                  style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text)', background: 'var(--surface-3)', border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 4px', flexShrink: 0, minWidth: 96, width: 96, outline: 'none' }}
                />
              ) : (
                <span
                  onClick={() => { setTimecodeDraft(secsToLabel(currentTime)); setEditingTimecode(true); }}
                  title={t('review.editTimecode')}
                  style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, minWidth: 96, cursor: 'text' }}>
                  {secsToLabel(currentTime)} / {secsToLabel(TOTAL)}
                </span>
              )}
```

- [ ] **Step 4: Add the locale key**

In `app/src/locales/fr.json`, find:
```json
    "prevComment": "Commentaire précédent",
    "prevChapter": "Chapitre précédent",
```
Replace with:
```json
    "prevComment": "Commentaire précédent",
    "prevChapter": "Chapitre précédent",
    "editTimecode": "Cliquer pour entrer un temps exact",
```

In `app/src/locales/en.json`, find:
```json
    "prevComment": "Previous comment",
    "prevChapter": "Previous chapter",
```
Replace with:
```json
    "prevComment": "Previous comment",
    "prevChapter": "Previous chapter",
    "editTimecode": "Click to enter an exact time",
```

- [ ] **Step 5: Verify it typechecks**

Run:
```bash
cd "D:/Vibe Coding/Rush/app" && npx tsc --noEmit -p tsconfig.app.json
```
Expected: no output.

- [ ] **Step 6: Manual verification**

Load any video. Click the `M:SS / M:SS` text at the bottom-left of the player controls — it should turn into an editable text box pre-filled with the current time. Test each format:
- Type `45`, press Enter → jumps to 0:45.
- Type `2:10`, press Enter → jumps to 2:10.
- Type `1:02:10` on a video long enough to hold that time → jumps to 1:02:10 (3730s).
- Type something invalid (`abc`), press Enter → nothing happens, field just closes (no crash, no jump).
- Open the field, press Escape → closes without changing the current time.
- Open the field, click elsewhere (blur) → closes without changing the current time.

- [ ] **Step 7: Commit**

```bash
cd "D:/Vibe Coding/Rush" && git add app/src/screens/VideoReview.tsx app/src/locales/fr.json app/src/locales/en.json && git commit -m "feat(video-chapters): add manual timecode entry"
```

---

### Task 7: Full build + push

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full production build**

Run:
```bash
cd "D:/Vibe Coding/Rush/app" && npm run build
```
Expected: build succeeds (same warnings as the rest of the project are fine — e.g. the pre-existing chunk-size and dynamic-import notices; no new errors).

- [ ] **Step 2: Push**

```bash
cd "D:/Vibe Coding/Rush" && git push
```
Expected: push succeeds. If it doesn't (this repo has had Vercel deployment issues this session, unrelated to this feature), that's a deployment-pipeline concern, not a reason to consider this plan incomplete — the code is done and correct once Steps 1-6 of every prior task pass.
