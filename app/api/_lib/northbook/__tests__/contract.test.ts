import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, normalizeDeliveryDate, serializeBillingRequest, serializeClient, serializeProject } from '../serializers.js';
import { hashSecret, verifyPkce } from '../auth.js';

describe('Northbook v1 integration contract', () => {
  it('keeps every public route in the canonical OpenAPI document', () => {
    const contract = readFileSync(resolve(process.cwd(), '..', 'docs', 'api', 'northbook-v1.openapi.yaml'), 'utf8');
    for (const route of [
      '/oauth/authorize:', '/oauth/token:', '/connections:', '/connections/{connectionId}:', '/bootstrap:', '/changes:',
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

  it('normalizes localized Rush delivery dates at the API boundary', () => {
    expect(normalizeDeliveryDate('2 août. 2026')).toBe('2026-08-02');
    expect(normalizeDeliveryDate('February 29 2024')).toBeNull();
    expect(normalizeDeliveryDate('2024-02-29T12:00:00Z')).toBe('2024-02-29');
    expect(normalizeDeliveryDate('2025-02-29')).toBeNull();
    expect(serializeProject({ id: 'p1', delivery_date: '2 août. 2026' }).deliveryDate).toBe('2026-08-02');
  });
});
