# Binary File Storage (Cloudflare R2) — Design

**Status:** Approved by user (2026-07-06). Sub-project 2 of 3 for the "Fichiers/Ressources" chantier (Phase 2 backend migration, 7th chantier overall).

## Goal

Migrate `fileContentStore.ts` (currently in-memory blob URLs + base64 localStorage for files ≤3 MB) to real, durable object storage on Cloudflare R2, supporting files up to at least 100 GB (confirmed real-world requirement — some source video files are that large), with resumable multipart upload so a multi-hour upload survives a dropped connection or a closed browser tab, and confidential access via short-lived signed URLs rather than permanently public files.

## Scope

**In scope:** the actual binary content of a `FileItem` (upload, resumable multipart transfer, progress reporting, secure download/preview access), and the ~6 consumer screens that currently call `setFileContent`/`getFileContent`/`removeFileContent`/`hasFileContent`.

**Explicitly out of scope, deferred to sub-project 3:** `resourceContentStore.ts` (rich text documents, video review comments, checklists, storyboards — a separate, heterogeneous content system unrelated to raw file bytes).

**Not building in this sub-project:** cross-device upload resume (resuming an interrupted upload from a different computer than the one it started on) — confirmed with the user as unnecessary for now. Same-device resume (including across a full browser restart) is in scope.

## Why Cloudflare R2 for all file types, not just video

The originally recorded architecture decision called for R2 specifically for video (R2 has zero bandwidth/egress cost, vs. Supabase Storage's $0.09/GB — a real cost risk for frequently-streamed client-review video). This sub-project extends that to **all** file types stored by the app: PDFs, images, and documents are also downloaded/previewed repeatedly during client review, the same cost argument applies at a smaller scale, and running one storage backend instead of two removes an entire category of integration complexity (one upload/download flow, one set of credentials, one code path) for a solo non-technical operator to maintain.

## Architecture: signed URLs via a Supabase Edge Function

The browser cannot hold R2's secret access key (it would be exposed to anyone opening dev tools), so a small serverless function is required as a signing intermediary — this is a Supabase Edge Function, part of the platform already chosen, not a new vendor. The function:
1. Verifies the caller's Supabase auth JWT and resolves their `studio_id` server-side (independently of whatever the client claims, to prevent a malicious client from forging access to another studio's files).
2. Holds the R2 account credentials as Edge Function secrets (never sent to the browser).
3. Exposes a handful of actions (below) that each return a signed URL or a small JSON response — the actual file bytes always flow directly between the browser and R2, never through this function or any other server.

### R2 object key convention

Every file is stored at `${studioId}/${fileItemId}` — no file extension or original name in the key (that metadata already lives in the `file_items` row from sub-project 1). This keeps keys stable even if a file is renamed, and groups every studio's files under one prefix.

### Always-multipart upload (even for small files)

Rather than having two code paths (a simple single-PUT for small files and multipart for large ones), every upload uses R2's S3-compatible multipart upload API, split into ~50 MB parts. A single-part "multipart" upload is valid for any file down to a few bytes (the last part has no minimum size), so this one code path handles everything from a 10 KB PDF to a 100+ GB video with no special-casing. At 50 MB/part, a 100 GB file is ~2,000 parts — comfortably under R2's 10,000-parts-per-upload ceiling, leaving headroom for files up to roughly 500 GB before the part size would need to grow.

### Edge Function actions

- `initiate-upload` — body `{ fileItemId, contentType }`. Creates an R2 multipart upload, returns `{ uploadId, key }`.
- `sign-part` — body `{ key, uploadId, partNumber }`. Returns a presigned PUT URL valid for a few minutes, scoped to that exact part.
- `list-parts` — body `{ key, uploadId }`. Returns the parts R2 already has recorded (`{ partNumber, size, etag }[]`) — used to resume.
- `complete-upload` — body `{ key, uploadId, parts: { partNumber, etag }[] }`. Finalizes the object in R2.
- `abort-upload` — body `{ key, uploadId }`. Cancels and cleans up an incomplete multipart upload (called when the user explicitly cancels, or when starting a fresh upload for the same file id after deciding not to resume).
- `sign-get` — body `{ fileItemId }`. Verifies the caller's studio owns this file, returns a presigned GET URL valid for ~10 minutes.
- `delete-object` — body `{ fileItemId }`. Verifies ownership, issues an R2 object delete for the corresponding key.

## `fileContentStore.ts` — new shape

The public API is rewritten around the reality that upload is now a multi-step, resumable, long-running process, while keeping the module's existing demo-session behavior (blob URL + ≤3 MB base64 localStorage) completely unchanged.

- `setFileContent(id: string, file: File): void` — **unchanged signature**, but for real sessions it now kicks off (or resumes) a multipart upload in the background rather than synchronously reading the file into base64. Progress and completion are observed via the new `subscribeUploadStatus`/`getUploadStatus` pair below, matching this codebase's established pub-sub pattern rather than returning a Promise from `setFileContent` itself (keeping the call site unchanged, `void`-returning, for both sessions).
- `getUploadStatus(id: string): UploadStatus | null` (new) — synchronous, returns `{ state: 'uploading' | 'done' | 'error', progress: number, bytesUploaded: number, totalBytes: number }` or `null` if no upload has ever been tracked for this id. Demo sessions always return `{ state: 'done', progress: 1, ... }` immediately (uploads are instant/synchronous there) so consumers can use one code path for both session types.
- `subscribeUploadStatus(fn: () => void): () => void` (new) — same pub-sub shape as every other store's `subscribe*`.
- `getFileContent(id: string): string | null` — **unchanged signature and synchronous contract.** For real sessions, this reads an in-memory cache of `{ url, expiresAt }` keyed by file id; if the cached URL is missing or within ~1 minute of expiring, it returns the last-known value (or `null`) immediately and kicks off a background `sign-get` call that updates the cache and calls `notify()` when the fresh URL arrives — the exact same "stay-sync-via-cache" pattern used by every Supabase-backed store so far in this app, just applied to short-lived URLs instead of database rows.
- `removeFileContent(id: string): void` — **unchanged signature.** For real sessions, this calls `abort-upload` if an upload is still in progress, otherwise issues an R2 object delete via a new Edge Function action `delete-object` (added alongside the six above), and clears the local upload-status/URL caches for that id.
- `hasFileContent(id: string): boolean` — **unchanged signature.** Returns `true` once `getUploadStatus(id)?.state === 'done'` (real sessions) or the existing blob/base64 presence check (demo sessions).

## Resumable upload — client-side state

Upload progress is tracked in `localStorage` under a per-file key (e.g. `sf_upload_${fileId}`), storing `{ uploadId, key, fileName, fileSize, partSize, completedParts: number[] }`. When `setFileContent` is called for a file id that already has an in-progress record matching the same file name and size, it calls `list-parts` to confirm which parts R2 actually has, skips those, and only uploads the missing ones — rather than trusting the local record blindly (R2 is the source of truth; the local record is just an optimization to avoid re-listing on every retry). This record is deleted once `complete-upload` succeeds. If the file name or size doesn't match the stored record (the user picked a different file for the same slot), the old record is discarded and an `abort-upload` is issued for the stale `uploadId` before starting fresh.

Each part upload uses `XMLHttpRequest` (not `fetch`, which has no upload-progress event) so real byte-level progress can be reported through `getUploadStatus`. A failed part retries a small number of times before the whole upload is marked `state: 'error'` (surfaced to the user, who can retry — which resumes rather than restarts, per the logic above).

## Size limits

No new artificial ceiling is imposed by this app — the practical limit is R2's own (multipart uploads support files up into the tens of terabytes). The only soft constraint worth surfacing in the UI is a friendly warning if a selected file is unusually large, not a hard block.

## Testing / verification plan

Same E2E rigor as every prior chantier, adapted for this sub-project's nature (mostly UI-driven, not database-row-driven):
- Demo-session regression: uploading/viewing/removing a file still behaves exactly as before (blob URL + ≤3 MB base64), no console errors.
- Real-session small-file upload: upload a small PDF, confirm `getUploadStatus` reaches `done`, confirm `getFileContent` returns a working signed URL that actually loads the file, confirm the URL naturally expires and a fresh one is fetched after ~10 minutes (or force it by manipulating the cached expiry in a console check).
- Real-session large-file multipart upload: upload a file large enough to span multiple parts (doesn't need to be 100 GB for verification — a few hundred MB split into ~50 MB parts is enough to exercise the multipart path), confirm progress reporting moves incrementally, confirm the finished file downloads correctly and matches the original (e.g. compare file size, or a checksum if convenient).
- Resume: start a multi-part upload, deliberately interrupt it (close the tab or navigate away mid-upload), reopen and re-trigger the same file, confirm via network inspection that already-uploaded parts are NOT re-sent (only the remaining ones are), and that the file completes correctly.
- Cross-studio access denial: confirm `sign-get`/`sign-part` reject a request for a `fileItemId` that doesn't belong to the caller's studio.
- Final typecheck/lint diff against the 185-error/338-problem baseline confirmed at the end of sub-project 1.
