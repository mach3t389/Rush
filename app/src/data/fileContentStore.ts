// Stockage du contenu réel des fichiers importés.
//
// Demo sessions (isDemoSession() === true): unchanged blob-URL + base64
// localStorage behavior, exactly as before this migration.
//
// Real sessions: backed by Cloudflare R2 via the "file-storage" Supabase
// Edge Function, which holds the R2 credentials and resolves the caller's
// studio_id server-side. Every upload uses R2's multipart upload API (even
// tiny files — one code path, no size special-casing), tracked in
// localStorage so an interrupted upload can resume on the same
// device/browser instead of restarting from zero.

import { isDemoSession } from './authStore';
import { supabase } from './supabaseClient';

const LS_PREFIX = 'sf_fc_';
const MAX_PERSIST = 3 * 1024 * 1024; // 3 Mo
const PART_SIZE = 50 * 1024 * 1024; // 50 Mo
const UPLOAD_RECORD_PREFIX = 'sf_upload_';
const UPLOAD_DONE_PREFIX = 'sf_upload_done_';

// ── Demo (blob + base64) path ────────────────────────────────────────────────

const blobUrls = new Map<string, string>();

function loadFromStorage(id: string): string | null {
  try { return localStorage.getItem(LS_PREFIX + id); } catch { return null; }
}

function saveToStorage(id: string, dataUrl: string): void {
  try { localStorage.setItem(LS_PREFIX + id, dataUrl); } catch { /* quota dépassé */ }
}

function removeFromStorage(id: string): void {
  try { localStorage.removeItem(LS_PREFIX + id); } catch { /* noop */ }
}

// ── Real (R2-backed) session state ──────────────────────────────────────────

export type UploadState = 'uploading' | 'done' | 'error';

export interface UploadStatus {
  state: UploadState;
  progress: number; // 0..1
  bytesUploaded: number;
  totalBytes: number;
}

interface StoredUploadRecord {
  uploadId: string;
  key: string;
  fileName: string;
  fileSize: number;
  partSize: number;
  completedParts: number[];
}

function loadUploadRecord(id: string): StoredUploadRecord | null {
  try {
    const raw = localStorage.getItem(UPLOAD_RECORD_PREFIX + id);
    return raw ? (JSON.parse(raw) as StoredUploadRecord) : null;
  } catch { return null; }
}

function saveUploadRecord(id: string, record: StoredUploadRecord): void {
  try { localStorage.setItem(UPLOAD_RECORD_PREFIX + id, JSON.stringify(record)); } catch { /* quota */ }
}

function clearUploadRecord(id: string): void {
  try { localStorage.removeItem(UPLOAD_RECORD_PREFIX + id); } catch { /* noop */ }
}

function markUploadDone(id: string): void {
  try { localStorage.setItem(UPLOAD_DONE_PREFIX + id, '1'); } catch { /* noop */ }
}

function isMarkedDone(id: string): boolean {
  try { return localStorage.getItem(UPLOAD_DONE_PREFIX + id) === '1'; } catch { return false; }
}

function clearDoneMark(id: string): void {
  try { localStorage.removeItem(UPLOAD_DONE_PREFIX + id); } catch { /* noop */ }
}

const _uploadStatus = new Map<string, UploadStatus>();
const _getUrlCache = new Map<string, { url: string; expiresAt: number }>();
const _listeners = new Set<() => void>();
const _uploadGeneration = new Map<string, number>();

function isCurrentUpload(id: string, generation: number): boolean {
  return _uploadGeneration.get(id) === generation;
}

function notify() { _listeners.forEach((fn) => fn()); }

export function subscribeUploadStatus(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getUploadStatus(id: string): UploadStatus | null {
  if (isDemoSession()) return { state: 'done', progress: 1, bytesUploaded: 0, totalBytes: 0 };
  return _uploadStatus.get(id) ?? null;
}

interface FileStorageResponse {
  uploadId?: string;
  key?: string;
  url?: string;
  parts?: { partNumber: number; size: number; etag: string }[];
  ok?: boolean;
  error?: string;
}

async function callFileStorage(action: string, body: Record<string, unknown>): Promise<FileStorageResponse> {
  const { data, error } = await supabase.functions.invoke('file-storage', {
    body: { action, ...body },
  });
  if (error) throw error;
  return data as FileStorageResponse;
}

function xhrUploadPart(url: string, blob: Blob, onProgress: (loadedBytes: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag');
        if (!etag) { reject(new Error('missing ETag in R2 response — check the bucket CORS ExposeHeaders setting')); return; }
        resolve(etag);
      } else {
        reject(new Error(`part upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('network error during part upload'));
    xhr.send(blob);
  });
}

async function uploadReal(id: string, file: File): Promise<void> {
  const myGeneration = (_uploadGeneration.get(id) ?? 0) + 1;
  _uploadGeneration.set(id, myGeneration);

  const existing = loadUploadRecord(id);
  let record: StoredUploadRecord;

  if (existing && existing.fileName === file.name && existing.fileSize === file.size) {
    record = existing;
  } else {
    if (existing) {
      try { await callFileStorage('abort-upload', { key: existing.key, uploadId: existing.uploadId }); } catch { /* best-effort cleanup */ }
      clearUploadRecord(id);
    }
    const initiated = await callFileStorage('initiate-upload', {
      fileItemId: id,
      contentType: file.type || 'application/octet-stream',
    });
    if (!initiated.uploadId || !initiated.key) throw new Error('initiate-upload did not return an uploadId/key');
    record = { uploadId: initiated.uploadId, key: initiated.key, fileName: file.name, fileSize: file.size, partSize: PART_SIZE, completedParts: [] };
    saveUploadRecord(id, record);
  }

  const totalParts = Math.max(1, Math.ceil(file.size / record.partSize));
  const doneSet = new Set(record.completedParts);

  if (doneSet.size > 0) {
    const { parts } = await callFileStorage('list-parts', { key: record.key, uploadId: record.uploadId });
    const remoteDone = new Set((parts ?? []).map((p) => p.partNumber));
    for (const p of Array.from(doneSet)) if (!remoteDone.has(p)) doneSet.delete(p);
  }

  let bytesDone = 0;
  for (const p of doneSet) bytesDone += Math.min(record.partSize, file.size - (p - 1) * record.partSize);

  if (!isCurrentUpload(id, myGeneration)) return;
  _uploadStatus.set(id, { state: 'uploading', progress: file.size === 0 ? 1 : bytesDone / file.size, bytesUploaded: bytesDone, totalBytes: file.size });
  notify();

  try {
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      if (doneSet.has(partNumber)) continue;

      const start = (partNumber - 1) * record.partSize;
      const end = Math.min(start + record.partSize, file.size);
      const blob = file.slice(start, end);

      let etag: string | null = null;
      let attempts = 0;
      let lastError: unknown = null;
      let maxLoadedThisPart = 0;
      while (attempts < 3 && !etag) {
        attempts++;
        try {
          const { url } = await callFileStorage('sign-part', { key: record.key, uploadId: record.uploadId, partNumber });
          if (!url) throw new Error('sign-part did not return a url');
          etag = await xhrUploadPart(url, blob, (loaded) => {
            if (!isCurrentUpload(id, myGeneration)) return;
            if (loaded > maxLoadedThisPart) maxLoadedThisPart = loaded;
            const currentBytes = bytesDone + maxLoadedThisPart;
            _uploadStatus.set(id, { state: 'uploading', progress: currentBytes / file.size, bytesUploaded: currentBytes, totalBytes: file.size });
            notify();
          });
        } catch (err) {
          lastError = err;
        }
      }
      if (!etag) throw lastError ?? new Error(`failed to upload part ${partNumber} after retries`);

      bytesDone += (end - start);
      record.completedParts = [...record.completedParts.filter((p) => p !== partNumber), partNumber];
      if (!isCurrentUpload(id, myGeneration)) return;
      saveUploadRecord(id, record);
      _uploadStatus.set(id, { state: 'uploading', progress: bytesDone / file.size, bytesUploaded: bytesDone, totalBytes: file.size });
      notify();
    }

    const { parts: finalParts } = await callFileStorage('list-parts', { key: record.key, uploadId: record.uploadId });
    if (!isCurrentUpload(id, myGeneration)) return;
    await callFileStorage('complete-upload', {
      key: record.key,
      uploadId: record.uploadId,
      parts: (finalParts ?? []).map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
    });

    if (!isCurrentUpload(id, myGeneration)) return;
    clearUploadRecord(id);
    markUploadDone(id);
    _uploadStatus.set(id, { state: 'done', progress: 1, bytesUploaded: file.size, totalBytes: file.size });
    notify();
  } catch (err) {
    console.error('uploadReal failed', err);
    if (!isCurrentUpload(id, myGeneration)) return;
    _uploadStatus.set(id, { state: 'error', progress: file.size === 0 ? 0 : bytesDone / file.size, bytesUploaded: bytesDone, totalBytes: file.size });
    notify();
  }
}

async function fetchSignedGetUrl(id: string): Promise<void> {
  try {
    const { url } = await callFileStorage('sign-get', { fileItemId: id });
    if (!url) return;
    _getUrlCache.set(id, { url, expiresAt: Date.now() + 9 * 60 * 1000 });
    notify();
  } catch (err) {
    console.error('fetchSignedGetUrl failed', err);
  }
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export function setFileContent(id: string, file: File): void {
  if (isDemoSession()) {
    const url = URL.createObjectURL(file);
    blobUrls.set(id, url);

    if (file.size <= MAX_PERSIST) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') saveToStorage(id, reader.result);
      };
      reader.readAsDataURL(file);
    }
    return;
  }

  void uploadReal(id, file);
}

export function getFileContent(id: string): string | null {
  if (isDemoSession()) {
    if (blobUrls.has(id)) return blobUrls.get(id)!;
    return loadFromStorage(id);
  }

  const cached = _getUrlCache.get(id);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  void fetchSignedGetUrl(id);
  return cached?.url ?? null;
}

export function removeFileContent(id: string): void {
  if (isDemoSession()) {
    const url = blobUrls.get(id);
    if (url) { URL.revokeObjectURL(url); blobUrls.delete(id); }
    removeFromStorage(id);
    return;
  }

  const inProgress = loadUploadRecord(id);
  void (async () => {
    try {
      if (inProgress) {
        await callFileStorage('abort-upload', { key: inProgress.key, uploadId: inProgress.uploadId });
      } else {
        await callFileStorage('delete-object', { fileItemId: id });
      }
    } catch (err) {
      console.error('removeFileContent failed', err);
    }
  })();

  _uploadGeneration.set(id, (_uploadGeneration.get(id) ?? 0) + 1);
  clearUploadRecord(id);
  clearDoneMark(id);
  _uploadStatus.delete(id);
  _getUrlCache.delete(id);
  notify();
}

export function hasFileContent(id: string): boolean {
  if (isDemoSession()) return blobUrls.has(id) || loadFromStorage(id) !== null;
  return getUploadStatus(id)?.state === 'done' || isMarkedDone(id);
}
