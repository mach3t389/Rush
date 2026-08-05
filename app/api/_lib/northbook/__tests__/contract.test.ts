import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, normalizeDeliveryDate, serializeBillingRequest, serializeClient, serializeProject, serializeTask } from '../serializers.js';
import { hashSecret, verifyPkce } from '../auth.js';
import { parseTaskStatus } from '../types.js';

describe('Northbook v1 integration contract', () => {
  it('keeps every public route in the canonical OpenAPI document', () => {
    const contract = readFileSync(resolve(process.cwd(), '..', 'docs', 'api', 'northbook-v1.openapi.yaml'), 'utf8');
    for (const route of [
      '/oauth/authorize:', '/oauth/token:', '/connections:', '/connections/{connectionId}:', '/bootstrap:', '/changes:',
      '/tasks/{taskId}/status:',
      '/portal/documents/{northbookInvoiceId}/pdf:',
      '/billing-requests/{id}/{action}:', '/accounting/documents/{northbookInvoiceId}:',
      '/accounting/project-summaries/{projectId}:', '/accounting/documents/{northbookInvoiceId}/pdf-upload:',
      '/accounting/documents/{northbookInvoiceId}/deliver:',
    ]) expect(contract).toContain(route);
    expect(contract).toContain('openapi: 3.1.0');
    expect(contract).toContain('version: 1.0.0');
    expect(contract).toContain('required: [revision, snapshotHash, rushClientId');
  });

  it('round-trips opaque cursors and rejects malformed cursors', () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42);
    expect(decodeCursor('not-a-cursor')).toBe(-1);
  });

  it('validates PKCE S256 without exposing the verifier', () => {
    const verifier = 'x'.repeat(64);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(`${verifier}y`, challenge)).toBe(false);
    expect(hashSecret(verifier)).not.toContain(verifier);
  });

  it('serializes all money across the boundary as minor units', () => {
    expect(serializeClient({ id: 'c1', name: 'ACME', created_at: '2026-01-01' })).toMatchObject({ id: 'c1', archived: false });
    expect(serializeProject({ id: 'p1', name: 'Launch', budget: 12.34, created_at: '2026-01-01' }).budgetMinor).toBe(1234);
    expect(serializeBillingRequest({ id: 'b1', client_id: 'c1', title: 'Phase 1', currency: 'CAD', lines: [], status: 'submitted', created_at: 'x', updated_at: 'x' }))
      .toMatchObject({ id: 'b1', currency: 'CAD', status: 'submitted' });
  });

  it('serializes tasks without coupling the API to a board layout', () => {
    expect(serializeTask({
      id: 't1', project_id: 'p1', data: { title: 'Montage', projectName: 'Campagne', status: 'review',
        statusLabel: 'En révision', checked: false, priority: 'high', dueDate: '2026-08-12',
        assignees: [{ name: 'Ada' }, { fullName: 'Grace' }, { email: 'linus@example.test' }] },
    })).toEqual({
      id: 't1', projectId: 'p1', projectName: 'Campagne', title: 'Montage', status: 'review',
      statusLabel: 'En révision', checked: false, priority: 'high', dueDate: '2026-08-12',
      assigneeNames: ['Ada', 'Grace', 'linus@example.test'], version: '',
    });
    expect(serializeTask({ id: 't2', project_id: 'p1', data: null })).toMatchObject({ status: '', dueDate: null, assigneeNames: [] });
  });

  it('accepts every current Rush status, including no status, and rejects arbitrary writes', () => {
    for (const status of ['', 'warn', 'info', 'review', 'danger', 'ok']) expect(parseTaskStatus(status)).toBe(status);
    for (const status of ['accent', 'done', null, 42, {}]) {
      expect(() => parseTaskStatus(status)).toThrow(expect.objectContaining({ status: 422, code: 'invalid_task_status' }));
    }
  });

  it('ships an organization-scoped atomic task migration', () => {
    const migration = readFileSync(resolve(process.cwd(), '..', 'supabase', 'migrations', '202608050003_northbook_tasks.sql'), 'utf8');
    expect(migration).toContain("northbook_capture_change('task')");
    expect(migration).toContain('where studio_id = p_studio_id');
    expect(migration).toContain('and id = p_task_id');
    expect(migration).toContain("grant execute on function public.northbook_update_task_status(uuid, text, text) to service_role");
    expect(migration).toContain("'tasks:write'");
    expect(migration).not.toContain('grant execute on function public.northbook_update_task_status(uuid, text, text) to authenticated');
  });

  it('normalizes localized Rush delivery dates at the API boundary', () => {
    expect(normalizeDeliveryDate('2 août. 2026')).toBe('2026-08-02');
    expect(normalizeDeliveryDate('February 29 2024')).toBeNull();
    expect(normalizeDeliveryDate('2024-02-29T12:00:00Z')).toBe('2024-02-29');
    expect(normalizeDeliveryDate('2025-02-29')).toBeNull();
    expect(serializeProject({ id: 'p1', delivery_date: '2 août. 2026' }).deliveryDate).toBe('2026-08-02');
  });
});
