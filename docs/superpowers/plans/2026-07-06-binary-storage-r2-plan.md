# Binary File Storage (Cloudflare R2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `fileContentStore.ts`'s in-memory/localStorage file content with real, durable, resumable object storage on Cloudflare R2 for real (non-demo) studios, supporting files from a few KB up to 100+ GB.

**Architecture:** A Supabase Edge Function acts as the only party that holds R2 credentials, resolving the caller's `studio_id` server-side and issuing short-lived signed URLs for every R2 operation. The browser always talks to R2 directly for the actual bytes (never through our own server), using S3-compatible multipart upload for every file regardless of size, with per-part progress and resumability tracked client-side in `localStorage`.

**Tech Stack:** Supabase Edge Functions (Deno runtime), AWS SDK v3 for JavaScript (S3-compatible, works against R2's endpoint), Cloudflare R2, React 19 + TypeScript on the client.

## Global Constraints

- Demo-session behavior in `fileContentStore.ts` stays byte-for-byte identical to today: blob URL (any size, in-memory) + base64 in `localStorage` for files ≤3 MB, fully synchronous.
- Every exported function keeps its exact current signature: `setFileContent(id: string, file: File): void`, `getFileContent(id: string): string | null`, `removeFileContent(id: string): void`, `hasFileContent(id: string): boolean`. Existing call sites in `DocumentReview.tsx`, `ImageReview.tsx`, and `VideoReview.tsx` need zero changes.
- R2 object keys are always `${studioId}/${fileItemId}`, and `studioId` is resolved **server-side** inside the Edge Function from the caller's Supabase auth JWT — never trusted from a client-supplied value. Every action that receives a client-supplied `key` must verify it starts with the caller's own resolved `studioId` prefix before touching R2.
- Every upload uses R2's multipart upload API, even for a single small file — one code path, no special-casing by size. Part size is 50 MB (`PART_SIZE = 50 * 1024 * 1024`).
- Resume works same-device/same-browser only (the `localStorage`-tracked upload record is not synced anywhere else) — this is a deliberate, confirmed scope boundary, not a gap to fix later.
- Do not touch `resourceContentStore.ts`, `fileStore.ts`, or `resourceStore.ts` — out of scope (already shipped or a separate later sub-project).
- This repo has no existing `supabase/functions` directory or Supabase CLI project structure — Task 2 creates it from scratch, but the Edge Function is deployed manually by the user via the Supabase Dashboard's Edge Functions editor (same "give the user something to paste and run" pattern already used for every prior chantier's SQL, applied here to a different artifact type).

---

### Task 1: Cloudflare R2 account, bucket, and CORS setup (manual — user does it)

**Files:**
- None (external dashboard configuration, not a code change)

**Interfaces:**
- Produces: an R2 bucket name, account id, and an API token (access key id + secret access key) that Task 2's Edge Function needs as secrets.

- [ ] **Step 1: Hand the user these instructions**

```
1. Go to https://dash.cloudflare.com and sign up / log in.
2. In the left sidebar, click "R2 Object Storage". Enable R2 if this is the first time (it will ask for a payment method, but R2 has a generous free tier and the pay-as-you-go rates already noted in our architecture decision — no bandwidth charge applies to what we're building here).
3. Click "Create bucket". Name it something like "rush-files" (any name works, you'll tell me what you picked). Leave location as "Automatic". Create it.
4. Click into the new bucket → "Settings" tab → "CORS Policy" → "Add CORS policy". Paste this (replace nothing yet, this allows your local dev server and will need updating later for your production domain):

[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]

   Save it. (The "ExposeHeaders: ETag" part is required — without it, the browser cannot read the ETag response header after uploading a part, and our upload code depends on that.)

5. Go back to the R2 home page → "Manage R2 API Tokens" → "Create API Token".
   - Permissions: "Object Read & Write".
   - Specify the bucket you just created (scope it to that bucket only, not "Apply to all buckets").
   - Create it, and copy the three values it shows you ONCE: Access Key ID, Secret Access Key, and the Account ID shown in the token details (or visible in your Cloudflare dashboard's right sidebar on the R2 overview page).
6. Send me: the bucket name, and confirm you've saved the Account ID, Access Key ID, and Secret Access Key somewhere safe (you'll paste them into Supabase in Task 2 — don't send them to me in chat).
```

- [ ] **Step 2: Confirm with the user that the bucket exists, CORS is saved, and they have the three credential values ready**

- [ ] **Step 3: Record in the progress ledger that Task 1 is done, noting the bucket name (not the secrets)**

---

### Task 2: Supabase Edge Function (manual deploy by user, code provided complete)

**Files:**
- Create: `supabase/functions/file-storage/index.ts`
- Create: `supabase/config.toml` (minimal, only if needed for local reference — the actual deploy happens via the Supabase Dashboard, not the CLI, so this file is for documentation/reference only)

**Interfaces:**
- Consumes: R2 credentials as Edge Function secrets (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`), plus the automatically-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables every Supabase Edge Function has access to.
- Produces: a single Edge Function named `file-storage`, invoked via `supabase.functions.invoke('file-storage', { body: { action, ...params } })` from the client (Task 3 depends on this exact invocation shape). Exposes 7 actions: `initiate-upload`, `sign-part`, `list-parts`, `complete-upload`, `abort-upload`, `sign-get`, `delete-object`.

- [ ] **Step 1: Create `supabase/functions/file-storage/index.ts` with this exact content**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET_NAME")!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function resolveStudioId(jwt: string): Promise<string> {
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !user) throw new Error("unauthenticated");

  const { data: membership, error: memberError } = await supabaseAdmin
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) throw memberError;
  if (membership) return membership.studio_id as string;

  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("studios")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (owned) return owned.id as string;

  throw new Error("no studio found for this user");
}

function assertOwnKey(key: string, studioId: string): void {
  if (!key.startsWith(`${studioId}/`)) {
    throw new Error("forbidden: key does not belong to caller's studio");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("missing Authorization header");
    const jwt = authHeader.replace("Bearer ", "");
    const studioId = await resolveStudioId(jwt);

    const { action, ...body } = await req.json();

    switch (action) {
      case "initiate-upload": {
        const { fileItemId, contentType } = body as { fileItemId: string; contentType?: string };
        const key = `${studioId}/${fileItemId}`;
        const result = await s3.send(new CreateMultipartUploadCommand({
          Bucket: R2_BUCKET,
          Key: key,
          ContentType: contentType || "application/octet-stream",
        }));
        return json({ uploadId: result.UploadId, key });
      }

      case "sign-part": {
        const { key, uploadId, partNumber } = body as { key: string; uploadId: string; partNumber: number };
        assertOwnKey(key, studioId);
        const url = await getSignedUrl(
          s3,
          new UploadPartCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
          { expiresIn: 300 },
        );
        return json({ url });
      }

      case "list-parts": {
        const { key, uploadId } = body as { key: string; uploadId: string };
        assertOwnKey(key, studioId);
        const result = await s3.send(new ListPartsCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }));
        const parts = (result.Parts ?? []).map((p) => ({
          partNumber: p.PartNumber,
          size: p.Size,
          etag: p.ETag,
        }));
        return json({ parts });
      }

      case "complete-upload": {
        const { key, uploadId, parts } = body as {
          key: string; uploadId: string; parts: { partNumber: number; etag: string }[];
        };
        assertOwnKey(key, studioId);
        await s3.send(new CompleteMultipartUploadCommand({
          Bucket: R2_BUCKET,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
        }));
        return json({ ok: true });
      }

      case "abort-upload": {
        const { key, uploadId } = body as { key: string; uploadId: string };
        assertOwnKey(key, studioId);
        await s3.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }));
        return json({ ok: true });
      }

      case "sign-get": {
        const { fileItemId } = body as { fileItemId: string };
        const key = `${studioId}/${fileItemId}`;
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
          { expiresIn: 600 },
        );
        return json({ url });
      }

      case "delete-object": {
        const { fileItemId } = body as { fileItemId: string };
        const key = `${studioId}/${fileItemId}`;
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return json({ error: message }, 400);
  }
});
```

- [ ] **Step 2: Hand the user these deployment instructions**

```
1. Go to your Supabase project dashboard → "Edge Functions" in the left sidebar.
2. Click "Deploy a new function" (or "Create a function").
3. Name it exactly: file-storage
4. Paste the full contents of supabase/functions/file-storage/index.ts (the file just created in this repo) into the code editor.
5. Deploy it.
6. Go to "Edge Functions" → "file-storage" → "Secrets" (or your project's global "Edge Function Secrets" settings, depending on your Supabase dashboard version) and add these four secrets:
   - R2_ACCOUNT_ID = <your Cloudflare account id from Task 1>
   - R2_ACCESS_KEY_ID = <your R2 access key id from Task 1>
   - R2_SECRET_ACCESS_KEY = <your R2 secret access key from Task 1>
   - R2_BUCKET_NAME = <the bucket name you chose in Task 1>
7. Redeploy the function if the dashboard doesn't automatically pick up new secrets.
8. Confirm the function shows as "Active"/deployed with no errors in its logs.
```

- [ ] **Step 3: Confirm with the user that the function is deployed and shows no startup errors in the Supabase dashboard's function logs**

- [ ] **Step 4: Commit the function source (even though deployment itself is manual, the code lives in the repo)**

```bash
git add supabase/functions/file-storage/index.ts
git commit -m "feat: add file-storage Edge Function for R2-backed uploads/downloads"
```

---

### Task 3: `fileContentStore.ts` full rewrite

**Files:**
- Modify: `app/src/data/fileContentStore.ts` (full rewrite, same 4 existing exported function signatures, plus 2 new exports)

**Interfaces:**
- Consumes: `isDemoSession` from `../data/authStore`; `supabase` from `../data/supabaseClient`. Calls the Task 2 Edge Function via `supabase.functions.invoke('file-storage', { body: { action, ...params } })`.
- Produces (unchanged): `setFileContent(id: string, file: File): void`, `getFileContent(id: string): string | null`, `removeFileContent(id: string): void`, `hasFileContent(id: string): boolean`. New: `getUploadStatus(id: string): UploadStatus | null`, `subscribeUploadStatus(fn: () => void): () => void`, and the exported type `UploadStatus`.

- [ ] **Step 1: Replace the full contents of `app/src/data/fileContentStore.ts` with:**

```ts
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
      while (attempts < 3 && !etag) {
        attempts++;
        try {
          const { url } = await callFileStorage('sign-part', { key: record.key, uploadId: record.uploadId, partNumber });
          if (!url) throw new Error('sign-part did not return a url');
          etag = await xhrUploadPart(url, blob, (loaded) => {
            const currentBytes = bytesDone + loaded;
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
      saveUploadRecord(id, record);
      _uploadStatus.set(id, { state: 'uploading', progress: bytesDone / file.size, bytesUploaded: bytesDone, totalBytes: file.size });
      notify();
    }

    const { parts: finalParts } = await callFileStorage('list-parts', { key: record.key, uploadId: record.uploadId });
    await callFileStorage('complete-upload', {
      key: record.key,
      uploadId: record.uploadId,
      parts: (finalParts ?? []).map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
    });

    clearUploadRecord(id);
    markUploadDone(id);
    _uploadStatus.set(id, { state: 'done', progress: 1, bytesUploaded: file.size, totalBytes: file.size });
    notify();
  } catch (err) {
    console.error('uploadReal failed', err);
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
```

- [ ] **Step 2: Run the app's typecheck to confirm no consumer breaks**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors introduced by this file (the confirmed baseline is 185 errors elsewhere in the repo)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/fileContentStore.ts
git commit -m "feat: fileContentStore.ts real R2-backed resumable multipart upload"
```

---

### Task 4: Upload progress UI in `FichiersGlobal.tsx`

**Files:**
- Modify: `app/src/screens/FichiersGlobal.tsx` (small, localized addition — not a rewrite)

**Interfaces:**
- Consumes: `getUploadStatus, subscribeUploadStatus` from `../data/fileContentStore` (new exports from Task 3); `SFBar` from `../components/ui` (already exists, unmodified).
- Produces: nothing consumed by later tasks — this is a leaf UI addition.

- [ ] **Step 1: Add the new imports**

Find the existing import line for `fileContentStore` functions in `app/src/screens/FichiersGlobal.tsx` (it currently imports `setFileContent, getFileContent, removeFileContent, hasFileContent`) and add the two new names to it:

```ts
import { setFileContent, getFileContent, removeFileContent, hasFileContent, getUploadStatus, subscribeUploadStatus } from '../data/fileContentStore';
```

Also confirm `SFBar` is already imported from `../components/ui` in this file (grep for it first — if it's not already imported, add it to the existing `../components/ui` import line).

- [ ] **Step 2: Track in-flight upload ids and subscribe to status changes**

Find the component that contains `processUploadedFiles` (the top-level `FichiersGlobal` component function). Add near its other `useState`/`useEffect` declarations:

```tsx
const [uploadingIds, setUploadingIds] = useState<{ id: string; name: string }[]>([]);
const [uploadTick, setUploadTick] = useState(0);
useEffect(() => subscribeUploadStatus(() => setUploadTick((n) => n + 1)), []);
```

- [ ] **Step 3: Update `processUploadedFiles` to track new uploads and clean up finished ones**

Replace the existing `processUploadedFiles` function:

```ts
  const processUploadedFiles = useCallback((files: File[]) => {
    const { scope, scopeId, folderId } = location;
    for (const file of files) {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      const type = fileTypeFromExt(ext);
      const newFile = addFile({
        name: file.name, type, ext,
        size: file.size,
        parentFolderId: folderId,
        projectId: scope === 'project' ? scopeId : undefined,
        clientId:  scope === 'client'  ? scopeId : undefined,
      });
      setFileContent(newFile.id, file);
    }
  }, [location]);
```

with:

```ts
  const processUploadedFiles = useCallback((files: File[]) => {
    const { scope, scopeId, folderId } = location;
    for (const file of files) {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      const type = fileTypeFromExt(ext);
      const newFile = addFile({
        name: file.name, type, ext,
        size: file.size,
        parentFolderId: folderId,
        projectId: scope === 'project' ? scopeId : undefined,
        clientId:  scope === 'client'  ? scopeId : undefined,
      });
      setUploadingIds((prev) => [...prev, { id: newFile.id, name: file.name }]);
      setFileContent(newFile.id, file);
    }
  }, [location]);

  useEffect(() => {
    if (uploadingIds.length === 0) return;
    const stillUploading = uploadingIds.filter((u) => getUploadStatus(u.id)?.state === 'uploading');
    if (stillUploading.length !== uploadingIds.length) setUploadingIds(stillUploading);
  }, [uploadingIds, uploadTick]);
```

`uploadTick` is the actual trigger: every `subscribeUploadStatus` notification increments it, which both (a) changes this effect's dependency so it re-runs and prunes any upload that has since finished, and (b) forces the component to re-render so the inline `getUploadStatus(u.id)` calls in Step 4's JSX show fresh percentages. Do not swap this for the `setUploadTick` setter itself — setters are referentially stable in React and would never trigger the effect to re-run.

- [ ] **Step 4: Render the progress panel**

Find the top-level return statement's outermost JSX element in `FichiersGlobal.tsx` (the component's root `<div>` or fragment). Add this as its last child, before the closing tag:

```tsx
      {uploadingIds.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, width: 320, zIndex: 500,
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {uploadingIds.map((u) => {
            const status = getUploadStatus(u.id);
            const pct = status ? Math.round(status.progress * 100) : 0;
            return (
              <div key={u.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{u.name}</span>
                  <span>{pct}%</span>
                </div>
                <SFBar value={pct} max={100} />
              </div>
            );
          })}
        </div>
      )}
```

- [ ] **Step 5: Run typecheck and lint**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: no new errors/warnings introduced (confirmed baseline is 185 typecheck errors / 338 lint problems)

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/FichiersGlobal.tsx
git commit -m "feat: show real upload progress in the file browser"
```

---

### Task 5: End-to-end manual verification

**Files:**
- None (manual browser verification, no code changes expected unless a bug is found)

**Interfaces:**
- Consumes: everything built in Tasks 1-4.

- [ ] **Step 1: Demo-session regression check**

Log in as a demo account. Import a small file via drag-and-drop or the file picker in `/fichiers`. Confirm it previews correctly, exactly as before this chantier. No console errors.

- [ ] **Step 2: Real-session small-file upload**

Log in as (or sign up) a real account. Import a small file (e.g. a PDF a few hundred KB). Confirm:
- The progress panel appears briefly and disappears once done.
- `getFileContent()` returns a working URL that actually loads the file (open it in the preview).
- Reload the page, open the file again — it still loads (the signed GET URL is refetched transparently).
- Check the R2 bucket in the Cloudflare dashboard: an object exists at `<studioId>/<fileItemId>`.

- [ ] **Step 3: Real-session multi-part upload with visible progress**

Upload a file large enough to span multiple 50 MB parts (a few hundred MB is enough to verify the mechanism without needing an actual 100 GB file). Confirm:
- The progress bar advances incrementally, not in one jump.
- The finished file downloads/plays correctly and its size matches the original.

- [ ] **Step 4: Interrupted-and-resumed upload**

Start uploading the same multi-part file from Step 3. Partway through (visible progress > 0 and < 100%), close the browser tab entirely. Reopen the app, log back in, and re-select the exact same file for upload into the same slot (re-triggering `setFileContent` for the same file id is the realistic scenario — coordinate with whatever UI flow re-attempts an upload for an existing `FileItem` row whose content never finished). Using the browser's network tab, confirm:
- A `list-parts` call happens before any part is re-uploaded.
- Parts that were already confirmed uploaded before the interruption are NOT re-sent (fewer PUT requests than the total part count).
- The upload completes successfully and the final file is correct.

- [ ] **Step 5: Cross-studio access denial check**

Using the browser console on a real, authenticated session, call `supabase.functions.invoke('file-storage', { body: { action: 'sign-get', fileItemId: 'some-id-that-belongs-to-a-different-studio-you-tested-earlier' } })` — confirm the response is an error (since `sign-get` always resolves the key from the CALLER's own studio_id, this should just generate a signed URL for a key that doesn't exist under their prefix — expected behavior is either an R2 404 when the resulting URL is fetched, or an application-level "not found," not a leak of another studio's actual file). Confirm no scenario allows constructing a request that returns a live URL to another studio's actual content.

- [ ] **Step 6: Final typecheck/lint diff against baseline**

Run:
```bash
cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "^src/"
npm run lint 2>&1 | tail -3
```
Expected: typecheck error count is 185 and lint reports 338 problems (308 errors, 30 warnings) or fewer.

- [ ] **Step 7: Record final verification results in the progress ledger**
