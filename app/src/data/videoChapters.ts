// Extraction des chapitres intégrés dans un fichier vidéo (piste de
// chapitres façon QuickTime — produite par Premiere/Final Cut/DaVinci à
// l'export). Ne récupère que le début du fichier, jamais la vidéo entière.
//
// Limite acceptée : si les métadonnées (moov) ne sont pas dans les premiers
// octets récupérés, on ne trouve aucun chapitre — pas de deuxième tentative
// sur la fin du fichier (voir le design doc).

import { createFile, MP4BoxBuffer } from 'mp4box';
import type { ISOFile, Movie, Sample, Track } from 'mp4box';

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
// référence via `track.references` (champ public documenté du type `Track`)
// avec une entrée de type `chap`.
function findChapterTrackId(info: Movie): number | null {
  for (const track of info.tracks as Track[]) {
    const ref = track.references.find(r => r.type === 'chap');
    if (!ref) continue;
    const ids = Array.from(ref.track_ids);
    if (ids.length > 0) return ids[0];
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
    const mp4boxFile: ISOFile = createFile();
    let settled = false;
    const finish = (chapters: Chapter[]) => {
      if (settled) return;
      settled = true;
      resolve(chapters);
    };

    mp4boxFile.onError = () => finish([]);

    mp4boxFile.onReady = (info: Movie) => {
      const trackId = findChapterTrackId(info);
      if (trackId === null) { finish([]); return; }

      mp4boxFile.onSamples = (_id: number, _user: unknown, samples: Sample[]) => {
        const chapters: Chapter[] = [];
        for (const sample of samples) {
          if (!sample.data) continue;
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

      mp4boxFile.setExtractionOptions(trackId, undefined, { nbSamples: Infinity });
      mp4boxFile.start();
    };

    mp4boxFile.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0));
    mp4boxFile.flush();

    // `onReady` n'est déclenché que si les métadonnées (moov) ont été
    // trouvées dans les octets récupérés — sinon on abandonne proprement
    // plutôt que de laisser la promesse en attente indéfiniment.
    setTimeout(() => finish([]), 0);
  });
}
