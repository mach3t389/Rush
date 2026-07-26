// Real submissions collected through a form resource's public link
// (/f/:resourceId — see PublicFormFill.tsx), plus the two calls that page
// itself needs (reading the public-facing form definition, submitting an
// answer) — both fully unauthenticated, so they go through security-definer
// Postgres functions rather than direct table access. See
// docs/superpowers/specs/2026-07-25-public-form-submission-migration.sql.
//
// Demo sessions (isDemoSession() === true): unchanged localStorage
// behavior. Real sessions: studio-side reads go through the `form_submissions`
// table (RLS-scoped to the caller's studio); the public page's read/write
// go through get_public_form / submit_public_form.

import { loadPersisted, savePersisted } from './persist';
import { isDemoSession } from './authStore';
import { supabase } from './supabaseClient';
import { getResources } from './resourceStore';
import { getResourceContent } from './resourceContentStore';
import { setFileContent, getFileContent } from './fileContentStore';

const STORAGE_KEY = 'sf_form_submissions';

export interface FormSubmission {
  id: string;
  resourceId: string;
  submittedAt: string;
  respondentName?: string;
  respondentEmail?: string;
  answers: Record<string, string | string[]>;
}

export interface PublicFormData {
  resourceId: string;
  title: string;
  description: string;
  collectIdentity: boolean;
  questions: unknown[];
}

// ── Demo-session working set ─────────────────────────────────────────────────
let _demoSubmissions: FormSubmission[] = loadPersisted<FormSubmission[]>(STORAGE_KEY, []);
function persistDemo() { savePersisted(STORAGE_KEY, _demoSubmissions); }

// ── Real-session per-resource cache ─────────────────────────────────────────
const _cache = new Map<string, FormSubmission[]>();
const _fetchStarted = new Set<string>();
const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(fn => fn()); }

interface SubmissionRow {
  id: string;
  resource_id: string;
  answers: Record<string, string | string[]>;
  respondent_name: string | null;
  respondent_email: string | null;
  submitted_at: string;
}

function toSubmission(row: SubmissionRow): FormSubmission {
  return {
    id: row.id,
    resourceId: row.resource_id,
    submittedAt: row.submitted_at,
    respondentName: row.respondent_name ?? undefined,
    respondentEmail: row.respondent_email ?? undefined,
    answers: row.answers,
  };
}

async function fetchSubmissions(resourceId: string): Promise<void> {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, resource_id, answers, respondent_name, respondent_email, submitted_at')
    .eq('resource_id', resourceId)
    .order('submitted_at', { ascending: false });
  if (error) { console.error('fetchSubmissions failed', error); return; }
  _cache.set(resourceId, (data as SubmissionRow[]).map(toSubmission));
  notify();
}

function ensureFetchStarted(resourceId: string): void {
  if (_fetchStarted.has(resourceId)) return;
  _fetchStarted.add(resourceId);
  void fetchSubmissions(resourceId);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getFormSubmissions(resourceId: string): FormSubmission[] {
  if (isDemoSession()) return _demoSubmissions.filter(s => s.resourceId === resourceId);
  ensureFetchStarted(resourceId);
  return _cache.get(resourceId) ?? [];
}

export function subscribeFormSubmissions(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// Called from the public /f/:resourceId page — never assume an authenticated
// session (a genuine visitor has none).
export async function getPublicForm(resourceId: string): Promise<PublicFormData | null> {
  if (isDemoSession()) {
    const resource = getResources().find(r => r.id === resourceId);
    if (!resource || resource.type !== 'form') return null;
    const content = getResourceContent<{ questions?: unknown[]; formTitle?: string; formDesc?: string; collectIdentity?: boolean }>(resourceId);
    return {
      resourceId,
      title: content?.formTitle || resource.title,
      description: content?.formDesc ?? '',
      collectIdentity: content?.collectIdentity ?? true,
      questions: content?.questions ?? [],
    };
  }

  const { data, error } = await supabase.rpc('get_public_form', { p_resource_id: resourceId });
  if (error) { console.error('getPublicForm failed', error); return null; }
  if (!data) return null;
  return {
    resourceId: data.resourceId,
    title: data.title,
    description: data.description ?? '',
    collectIdentity: data.collectIdentity ?? true,
    questions: data.questions ?? [],
  };
}

export async function submitPublicForm(
  resourceId: string,
  answers: Record<string, string | string[]>,
  respondentName?: string,
  respondentEmail?: string
): Promise<{ ok: boolean }> {
  if (isDemoSession()) {
    _demoSubmissions = [{
      id: `fs${Date.now()}`,
      resourceId,
      submittedAt: new Date().toISOString(),
      respondentName,
      respondentEmail,
      answers,
    }, ..._demoSubmissions];
    persistDemo();
    notify();
    return { ok: true };
  }

  const { error } = await supabase.rpc('submit_public_form', {
    p_resource_id: resourceId,
    p_answers: answers,
    p_respondent_name: respondentName ?? null,
    p_respondent_email: respondentEmail ?? null,
  });
  if (error) { console.error('submitPublicForm failed', error); return { ok: false }; }
  return { ok: true };
}

// ── "Upload de fichier" question type ───────────────────────────────────────
//
// Demo sessions reuse fileContentStore's local blob/base64 path directly
// (no notion of "studio" needed there). Real sessions can't go through
// fileContentStore's uploadReal() — that requires an authenticated studio
// JWT, which a genuine anonymous visitor never has — so this calls two
// dedicated unauthenticated actions on the file-storage Edge Function
// (form-sign-put / form-sign-get) instead. See the comment above those
// actions in supabase/functions/file-storage/index.ts.

// Called from the public /f/:resourceId page when a visitor picks a file
// for an "upload" question. Returns the fileId to embed in the answer
// (via encodeUploadAnswer in ResourceDetail.tsx), or null on failure.
export async function uploadPublicFormFile(resourceId: string, file: File): Promise<string | null> {
  if (isDemoSession()) {
    const fileId = `pf${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFileContent(fileId, file);
    return fileId;
  }

  try {
    const { data, error } = await supabase.functions.invoke('file-storage', {
      body: { action: 'form-sign-put', resourceId, contentType: file.type || 'application/octet-stream' },
    });
    if (error) throw error;
    const { url, fileId } = data as { url: string; key: string; fileId: string };
    const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    if (!res.ok) throw new Error(`upload failed with status ${res.status}`);
    return fileId;
  } catch (err) {
    console.error('uploadPublicFormFile failed', err);
    return null;
  }
}

async function fetchFormFileUrl(resourceId: string, fileId: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  try {
    const { data, error } = await supabase.functions.invoke('file-storage', {
      body: { action: 'form-sign-get', resourceId, fileId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw error;
    return (data as { url: string }).url;
  } catch (err) {
    console.error('fetchFormFileUrl failed', err);
    return null;
  }
}

const _fileUrlCache = new Map<string, string>();
const _fileUrlFetching = new Set<string>();

// Called from the studio-side Réponses tab to resolve a submitted upload
// answer's download URL. Synchronous + cached like fileContentStore's
// getFileContent — returns null on the first call while the real URL is
// fetched in the background, then notifies subscribeFormSubmissions
// listeners once ready (the Réponses tab already subscribes to that for
// the submissions list, so this piggybacks on the same re-render).
export function getFormFileUrlSync(resourceId: string, fileId: string): string | null {
  if (isDemoSession()) return getFileContent(fileId);

  const cacheKey = `${resourceId}:${fileId}`;
  const cached = _fileUrlCache.get(cacheKey);
  if (cached) return cached;

  if (!_fileUrlFetching.has(cacheKey)) {
    _fileUrlFetching.add(cacheKey);
    void (async () => {
      const url = await fetchFormFileUrl(resourceId, fileId);
      if (url) _fileUrlCache.set(cacheKey, url);
      _fileUrlFetching.delete(cacheKey);
      notify();
    })();
  }
  return null;
}
