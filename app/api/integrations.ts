import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  adminClient,
  assertStudioAdministrator,
  authenticateIntegration,
  authenticatedRushUser,
  hashSecret,
  issueTokenPair,
  randomSecret,
  verifyPkce,
} from './_lib/northbook/auth.js';
import { deliverInvoice } from './_lib/northbook/delivery.js';
import { decodeCursor, encodeCursor, serializeBillingRequest, serializeChange, serializeClient, serializeProject, serializeTask } from './_lib/northbook/serializers.js';
import { assertPdfExists, createPdfDownload, createPdfUpload } from './_lib/northbook/storage.js';
import {
  HttpError,
  asRecord,
  assertCurrency,
  assertIsoDate,
  assertSafeInteger,
  optionalString,
  parseBillingLines,
  parseScopes,
  requiredString,
  parseTaskStatus,
  type AccountingDocumentInput,
  type ProjectSummaryInput,
} from './_lib/northbook/types.js';

const CALLBACK_URI = 'northbook://rush/callback';

function routePath(req: VercelRequest): string[] {
  const value = req.query.path;
  return (Array.isArray(value) ? value : String(value ?? '').split('/')).filter(Boolean);
}

function method(req: VercelRequest, expected: string): void {
  if (req.method !== expected) throw new HttpError(405, 'method_not_allowed');
}

function body(req: VercelRequest): Record<string, unknown> {
  return asRecord(req.body ?? {});
}

function queryString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function authorize(req: VercelRequest, res: VercelResponse) {
  method(req, 'POST');
  const input = body(req);
  const studioId = requiredString(input.studioId, 'studioId', 64);
  const codeChallenge = requiredString(input.codeChallenge, 'codeChallenge', 128);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) throw new HttpError(400, 'invalid_code_challenge');
  const state = requiredString(input.state, 'state', 256);
  if (state.length < 16) throw new HttpError(400, 'invalid_state');
  const redirectUri = requiredString(input.redirectUri, 'redirectUri', 100);
  if (redirectUri !== CALLBACK_URI) throw new HttpError(400, 'invalid_redirect_uri');
  const installationName = requiredString(input.installationName, 'installationName', 100);
  const scopes = parseScopes(input.scopes);
  const { user } = await authenticatedRushUser(req);
  await assertStudioAdministrator(studioId, user.id);
  const rawCode = randomSecret();
  const client = adminClient();
  const { error } = await client.from('northbook_authorization_codes').insert({
    code_hash: hashSecret(rawCode),
    studio_id: studioId,
    user_id: user.id,
    installation_name: installationName,
    scopes,
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
  });
  if (error) {
    // Database error details can contain schema information, so only retain the
    // stable SQLSTATE in the response. It is enough to diagnose an invalid
    // server credential or a missing migration without exposing accounting data.
    const sqlState = typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
      ? error.code
      : 'unknown';
    console.error('northbook authorization-code insert failed', { sqlState });
    throw new HttpError(500, `authorization_code_write_failed_${sqlState}`);
  }
  const callback = new URL(redirectUri);
  callback.searchParams.set('code', rawCode);
  callback.searchParams.set('state', state);
  res.status(200).json({ redirectUrl: callback.toString() });
}

async function connections(req: VercelRequest, res: VercelResponse, connectionId?: string) {
  const { user } = await authenticatedRushUser(req);
  const client = adminClient();
  if (req.method === 'GET' && !connectionId) {
    const studioId = requiredString(queryString(req.query.studioId), 'studioId', 64);
    const studio = await assertStudioAdministrator(studioId, user.id);
    const { data, error } = await client.from('northbook_integration_connections')
      .select('id, installation_name, scopes, status, created_at, last_used_at, revoked_at')
      .eq('studio_id', studioId).order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({
      accountingMode: studio.accounting_mode ?? 'native',
      accountingCurrency: studio.accounting_currency,
      pilotEnabled: Boolean(studio.northbook_integration_enabled) || process.env.NORTHBOOK_INTEGRATION_ALLOW_ALL === 'true',
      connections: (data ?? []).map(row => ({
        id: row.id,
        installationName: row.installation_name,
        scopes: row.scopes,
        status: row.status,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        revokedAt: row.revoked_at,
      })),
    });
    return;
  }
  if (req.method === 'DELETE' && connectionId) {
    const { data: connection, error } = await client.from('northbook_integration_connections')
      .select('id, studio_id, status').eq('id', connectionId).maybeSingle();
    if (error) throw error;
    if (!connection) throw new HttpError(404, 'connection_not_found');
    await assertStudioAdministrator(connection.studio_id, user.id);
    const now = new Date().toISOString();
    await Promise.all([
      client.from('northbook_integration_connections').update({ status: 'revoked', revoked_at: now }).eq('id', connectionId),
      client.from('northbook_access_tokens').update({ revoked_at: now }).eq('connection_id', connectionId),
      client.from('northbook_refresh_tokens').update({ revoked_at: now }).eq('connection_id', connectionId),
      client.from('northbook_integration_audit_log').insert({
        studio_id: connection.studio_id, connection_id: connectionId, actor_user_id: user.id,
        action: 'connection.revoked',
      }),
    ]);
    res.status(200).json({ revoked: true, revokedAt: now });
    return;
  }
  throw new HttpError(405, 'method_not_allowed');
}

async function token(req: VercelRequest, res: VercelResponse) {
  method(req, 'POST');
  const input = body(req);
  const grantType = requiredString(input.grantType, 'grantType', 32);
  const client = adminClient();
  let connectionId: string;
  let oldRefreshTokenId: string | null = null;

  if (grantType === 'authorization_code') {
    const code = requiredString(input.code, 'code', 256);
    const verifier = requiredString(input.codeVerifier, 'codeVerifier', 128);
    const redirectUri = requiredString(input.redirectUri, 'redirectUri', 100);
    if (redirectUri !== CALLBACK_URI) throw new HttpError(400, 'invalid_redirect_uri');
    const { data: codeRow, error } = await client.from('northbook_authorization_codes')
      .select('*').eq('code_hash', hashSecret(code)).maybeSingle();
    if (error) throw error;
    if (!codeRow || codeRow.consumed_at || Date.parse(codeRow.expires_at) <= Date.now()) {
      throw new HttpError(400, 'invalid_or_expired_code');
    }
    if (!verifyPkce(verifier, codeRow.code_challenge)) throw new HttpError(400, 'invalid_pkce');
    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await client.from('northbook_authorization_codes')
      .update({ consumed_at: consumedAt }).eq('id', codeRow.id).is('consumed_at', null).select('id');
    if (consumeError) throw consumeError;
    if (!consumed || consumed.length !== 1) throw new HttpError(400, 'code_already_used');
    const { data: connection, error: connectionError } = await client
      .from('northbook_integration_connections').insert({
        studio_id: codeRow.studio_id,
        installation_name: codeRow.installation_name,
        created_by_user_id: codeRow.user_id,
        scopes: codeRow.scopes,
      }).select('id').single();
    if (connectionError) throw connectionError;
    connectionId = connection.id;
    await Promise.all([
      client.from('studios').update({ accounting_mode: 'northbook' }).eq('id', codeRow.studio_id),
      client.from('northbook_integration_audit_log').insert({
        studio_id: codeRow.studio_id, connection_id: connectionId, actor_user_id: codeRow.user_id,
        action: 'connection.authorized', metadata: { installationName: codeRow.installation_name, scopes: codeRow.scopes },
      }),
    ]);
  } else if (grantType === 'refresh_token') {
    const refreshToken = requiredString(input.refreshToken, 'refreshToken', 256);
    const { data: refresh, error } = await client.from('northbook_refresh_tokens')
      .select('id, connection_id, expires_at, consumed_at, revoked_at')
      .eq('token_hash', hashSecret(refreshToken)).maybeSingle();
    if (error) throw error;
    if (refresh?.consumed_at) {
      const revokedAt = new Date().toISOString();
      const { data: reusedConnection } = await client.from('northbook_integration_connections')
        .select('studio_id').eq('id', refresh.connection_id).maybeSingle();
      await Promise.all([
        client.from('northbook_integration_connections').update({ status: 'revoked', revoked_at: revokedAt }).eq('id', refresh.connection_id),
        client.from('northbook_access_tokens').update({ revoked_at: revokedAt }).eq('connection_id', refresh.connection_id).is('revoked_at', null),
        client.from('northbook_refresh_tokens').update({ revoked_at: revokedAt }).eq('connection_id', refresh.connection_id).is('revoked_at', null),
      ]);
      if (reusedConnection) {
        await client.from('northbook_integration_audit_log').insert({
          studio_id: reusedConnection.studio_id,
          connection_id: refresh.connection_id,
          action: 'refresh_token.reuse_detected',
        });
      }
      throw new HttpError(401, 'refresh_token_reused');
    }
    if (!refresh || refresh.revoked_at || Date.parse(refresh.expires_at) <= Date.now()) {
      throw new HttpError(401, 'invalid_refresh_token');
    }
    const { data: consumed, error: consumeError } = await client.from('northbook_refresh_tokens')
      .update({ consumed_at: new Date().toISOString() }).eq('id', refresh.id).is('consumed_at', null).select('id');
    if (consumeError) throw consumeError;
    if (!consumed || consumed.length !== 1) throw new HttpError(401, 'refresh_token_reused');
    const { data: connection } = await client.from('northbook_integration_connections')
      .select('status').eq('id', refresh.connection_id).maybeSingle();
    if (!connection || connection.status !== 'active') throw new HttpError(401, 'connection_revoked');
    connectionId = refresh.connection_id;
    oldRefreshTokenId = refresh.id;
  } else {
    throw new HttpError(400, 'unsupported_grant_type');
  }

  const pair = await issueTokenPair(connectionId);
  if (oldRefreshTokenId) {
    await client.from('northbook_refresh_tokens').update({ replaced_by_id: pair.refreshTokenId }).eq('id', oldRefreshTokenId);
  }
  const { data: connection, error: connectionError } = await client
    .from('northbook_integration_connections').select('id, studio_id, scopes').eq('id', connectionId).single();
  if (connectionError) throw connectionError;
  const { data: studio, error: studioError } = await client.from('studios')
    .select('name, accounting_currency').eq('id', connection.studio_id).single();
  if (studioError) throw studioError;
  res.status(200).json({
    accessToken: pair.accessToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: pair.refreshToken,
    connection: {
      id: connection.id,
      studioId: connection.studio_id,
      studioName: studio.name,
      accountingCurrency: studio.accounting_currency,
      scopes: connection.scopes,
    },
  });
}

async function bootstrap(req: VercelRequest, res: VercelResponse) {
  method(req, 'GET');
  const context = await authenticateIntegration(req, ['entities:read', 'billing_requests:read']);
  const client = adminClient();
  const [cursorResult, clientsResult, projectsResult, tasksResult, requestsResult] = await Promise.all([
    client.from('northbook_change_log').select('sequence').eq('studio_id', context.studioId)
      .order('sequence', { ascending: false }).limit(1).maybeSingle(),
    client.from('clients').select('*').eq('studio_id', context.studioId).order('created_at'),
    client.from('projects').select('*').eq('studio_id', context.studioId).eq('is_template_draft', false).order('created_at'),
    client.from('tasks').select('*').eq('studio_id', context.studioId),
    client.from('northbook_billing_requests').select('*').eq('studio_id', context.studioId)
      .in('status', ['submitted', 'accepted']).order('created_at'),
  ]);
  for (const result of [cursorResult, clientsResult, projectsResult, tasksResult, requestsResult]) {
    if (result.error) throw result.error;
  }
  res.status(200).json({
    cursor: encodeCursor(cursorResult.data?.sequence ?? 0),
    accountingCurrency: context.accountingCurrency,
    clients: (clientsResult.data ?? []).map(row => serializeClient(row)),
    projects: (projectsResult.data ?? []).map(row => serializeProject(row)),
    tasks: (tasksResult.data ?? []).map(row => serializeTask(row)),
    billingRequests: (requestsResult.data ?? []).map(row => serializeBillingRequest(row)),
  });
}

async function updateTaskStatus(req: VercelRequest, res: VercelResponse, taskId: string) {
  method(req, 'PATCH');
  const context = await authenticateIntegration(req, ['tasks:write']);
  const status = parseTaskStatus(body(req).status);
  const client = adminClient();
  const { data, error } = await client.rpc('northbook_update_task_status', {
    p_studio_id: context.studioId,
    p_task_id: taskId,
    p_status: status,
  });
  if (error) throw error;
  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated) throw new HttpError(404, 'task_not_found');
  res.status(200).json(serializeTask(updated as Record<string, unknown>));
}

async function changes(req: VercelRequest, res: VercelResponse) {
  method(req, 'GET');
  const context = await authenticateIntegration(req, ['entities:read']);
  const after = decodeCursor(queryString(req.query.after));
  if (after < 0) throw new HttpError(400, 'invalid_cursor');
  const requestedLimit = Number(queryString(req.query.limit) ?? 100);
  const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, Math.trunc(requestedLimit))) : 100;
  const client = adminClient();
  if (after > 0) {
    const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const { data: oldest, error } = await client.from('northbook_change_log').select('sequence')
      .eq('studio_id', context.studioId).gte('occurred_at', cutoff).order('sequence').limit(1).maybeSingle();
    if (error) throw error;
    if (oldest && after < Number(oldest.sequence) - 1) throw new HttpError(410, 'cursor_expired');
  }
  const { data, error } = await client.from('northbook_change_log').select('*')
    .eq('studio_id', context.studioId).gt('sequence', after).order('sequence').limit(limit + 1);
  if (error) throw error;
  const rows = data ?? [];
  const page = rows.slice(0, limit);
  res.status(200).json({
    changes: page.map(row => serializeChange(row)),
    nextCursor: encodeCursor(page.length > 0 ? page[page.length - 1]?.sequence : after),
    hasMore: rows.length > limit,
  });
}

async function transitionBillingRequest(req: VercelRequest, res: VercelResponse, id: string, action: string) {
  method(req, 'POST');
  const context = await authenticateIntegration(req, ['billing_requests:write']);
  const input = body(req);
  const client = adminClient();
  const { data: current, error } = await client.from('northbook_billing_requests').select('*')
    .eq('studio_id', context.studioId).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!current) throw new HttpError(404, 'billing_request_not_found');
  let patch: Record<string, unknown>;
  if (action === 'accept') {
    if (current.status !== 'submitted' && current.status !== 'accepted') throw new HttpError(409, 'invalid_transition');
    patch = { status: 'accepted', northbook_invoice_id: requiredString(input.northbookInvoiceId, 'northbookInvoiceId', 100), rejection_reason: null };
  } else if (action === 'reject') {
    if (current.status !== 'submitted') throw new HttpError(409, 'invalid_transition');
    patch = { status: 'rejected', rejection_reason: optionalString(input.reason, 'reason', 500) };
  } else if (action === 'release') {
    if (current.status !== 'accepted') throw new HttpError(409, 'invalid_transition');
    patch = { status: 'submitted', northbook_invoice_id: null };
  } else throw new HttpError(404, 'route_not_found');
  const { data: updated, error: updateError } = await client.from('northbook_billing_requests').update(patch)
    .eq('studio_id', context.studioId).eq('id', id).select('*').single();
  if (updateError) throw updateError;
  res.status(200).json(serializeBillingRequest(updated));
}

function parseDocument(input: Record<string, unknown>): AccountingDocumentInput {
  const status = requiredString(input.status, 'status', 16);
  if (!['issued', 'paid', 'void'].includes(status)) throw new HttpError(400, 'invalid_status');
  const taxes = Array.isArray(input.taxes) ? input.taxes.map((raw, index) => {
    const tax = asRecord(raw);
    const rate = Number(tax.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new HttpError(400, 'invalid_taxes');
    return {
      label: requiredString(tax.label, `taxes[${index}].label`, 50),
      rate,
      amountMinor: assertSafeInteger(tax.amountMinor, `taxes[${index}].amountMinor`, { min: 0 }),
    };
  }) : [];
  const snapshotHash = requiredString(input.snapshotHash, 'snapshotHash', 64);
  if (!/^[a-f0-9]{64}$/.test(snapshotHash)) throw new HttpError(400, 'invalid_snapshot_hash');
  return {
    revision: assertSafeInteger(input.revision, 'revision', { min: 1 }),
    snapshotHash,
    billingRequestId: optionalString(input.billingRequestId, 'billingRequestId', 100),
    rushClientId: requiredString(input.rushClientId, 'rushClientId', 100),
    rushProjectId: optionalString(input.rushProjectId, 'rushProjectId', 100),
    number: requiredString(input.number, 'number', 100),
    currency: assertCurrency(input.currency),
    issuedAt: assertIsoDate(input.issuedAt, 'issuedAt'),
    dueAt: input.dueAt == null ? null : assertIsoDate(input.dueAt, 'dueAt'),
    status: status as AccountingDocumentInput['status'],
    voidReason: optionalString(input.voidReason, 'voidReason', 500),
    lineItems: parseBillingLines(input.lineItems),
    subtotalMinor: assertSafeInteger(input.subtotalMinor, 'subtotalMinor', { min: 0 }),
    taxes,
    totalMinor: assertSafeInteger(input.totalMinor, 'totalMinor', { min: 0 }),
    paidMinor: assertSafeInteger(input.paidMinor, 'paidMinor', { min: 0 }),
  };
}

async function putDocument(req: VercelRequest, res: VercelResponse, invoiceId: string) {
  method(req, 'PUT');
  const context = await authenticateIntegration(req, ['accounting:write']);
  const input = parseDocument(body(req));
  if (input.currency !== context.accountingCurrency) throw new HttpError(422, 'currency_mismatch');
  if (input.paidMinor > input.totalMinor) throw new HttpError(422, 'paid_amount_exceeds_total');
  const client = adminClient();
  const { data: current, error } = await client.from('northbook_accounting_documents')
    .select('revision, snapshot_hash, pdf_object_key, delivered_at').eq('studio_id', context.studioId)
    .eq('northbook_invoice_id', invoiceId).maybeSingle();
  if (error) throw error;
  if (current && Number(current.revision) > input.revision) throw new HttpError(409, 'stale_revision');
  if (current && Number(current.revision) === input.revision) {
    if (current.snapshot_hash !== input.snapshotHash) throw new HttpError(409, 'revision_conflict');
    res.status(200).json({ accepted: true, duplicate: true, revision: input.revision });
    return;
  }
  const row = {
    studio_id: context.studioId,
    northbook_invoice_id: invoiceId,
    revision: input.revision,
    snapshot_hash: input.snapshotHash,
    billing_request_id: input.billingRequestId,
    rush_client_id: input.rushClientId,
    rush_project_id: input.rushProjectId,
    number: input.number,
    currency: input.currency,
    issued_at: input.issuedAt,
    due_at: input.dueAt,
    status: input.status,
    void_reason: input.voidReason,
    line_items: input.lineItems,
    subtotal_minor: input.subtotalMinor,
    taxes: input.taxes,
    total_minor: input.totalMinor,
    paid_minor: input.paidMinor,
    pdf_object_key: current?.pdf_object_key ?? null,
    delivered_at: current?.delivered_at ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error: upsertError } = await client.from('northbook_accounting_documents').upsert(row, {
    onConflict: 'studio_id,northbook_invoice_id',
  });
  if (upsertError) throw upsertError;
  const { error: revisionError } = await client.from('northbook_accounting_document_revisions').insert({
    studio_id: context.studioId, northbook_invoice_id: invoiceId, revision: input.revision,
    snapshot_hash: input.snapshotHash, snapshot: input,
  });
  if (revisionError && revisionError.code !== '23505') throw revisionError;
  if (input.billingRequestId && (input.status === 'issued' || input.status === 'paid')) {
    await client.from('northbook_billing_requests').update({ status: 'fulfilled', northbook_invoice_id: invoiceId })
      .eq('studio_id', context.studioId).eq('id', input.billingRequestId);
  }
  res.status(200).json({ accepted: true, duplicate: false, revision: input.revision });
}

function parseSummary(input: Record<string, unknown>): ProjectSummaryInput {
  return {
    currency: assertCurrency(input.currency),
    invoicedMinor: assertSafeInteger(input.invoicedMinor, 'invoicedMinor'),
    collectedMinor: assertSafeInteger(input.collectedMinor, 'collectedMinor'),
    outstandingMinor: assertSafeInteger(input.outstandingMinor, 'outstandingMinor'),
    expensesMinor: assertSafeInteger(input.expensesMinor, 'expensesMinor'),
    marginMinor: assertSafeInteger(input.marginMinor, 'marginMinor'),
    calculatedAt: assertIsoDate(input.calculatedAt, 'calculatedAt'),
  };
}

async function putSummary(req: VercelRequest, res: VercelResponse, projectId: string) {
  method(req, 'PUT');
  const context = await authenticateIntegration(req, ['accounting:write']);
  const input = parseSummary(body(req));
  if (input.currency !== context.accountingCurrency) throw new HttpError(422, 'currency_mismatch');
  const { error } = await adminClient().from('northbook_project_summaries').upsert({
    studio_id: context.studioId,
    project_id: projectId,
    currency: input.currency,
    invoiced_minor: input.invoicedMinor,
    collected_minor: input.collectedMinor,
    outstanding_minor: input.outstandingMinor,
    expenses_minor: input.expensesMinor,
    margin_minor: input.marginMinor,
    calculated_at: input.calculatedAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,project_id' });
  if (error) throw error;
  res.status(200).json({ accepted: true });
}

async function pdfUpload(req: VercelRequest, res: VercelResponse, invoiceId: string) {
  method(req, 'POST');
  const context = await authenticateIntegration(req, ['documents:write']);
  const input = body(req);
  const contentLength = input.contentLength == null ? 0 : assertSafeInteger(input.contentLength, 'contentLength', { min: 0 });
  if (contentLength > 10 * 1024 * 1024) throw new HttpError(413, 'pdf_too_large');
  const client = adminClient();
  const { data: document } = await client.from('northbook_accounting_documents').select('id')
    .eq('studio_id', context.studioId).eq('northbook_invoice_id', invoiceId).maybeSingle();
  if (!document) throw new HttpError(404, 'document_not_found');
  const upload = await createPdfUpload(context.studioId, invoiceId);
  await client.from('northbook_accounting_documents').update({ pdf_object_key: upload.key })
    .eq('studio_id', context.studioId).eq('northbook_invoice_id', invoiceId);
  res.status(200).json({ uploadUrl: upload.url, expiresIn: upload.expiresIn });
}

async function deliver(req: VercelRequest, res: VercelResponse, invoiceId: string) {
  method(req, 'POST');
  const context = await authenticateIntegration(req, ['delivery:write']);
  const idempotencyKey = requiredString(req.headers['idempotency-key'], 'Idempotency-Key', 200);
  const client = adminClient();
  const { data: document } = await client.from('northbook_accounting_documents').select('pdf_object_key')
    .eq('studio_id', context.studioId).eq('northbook_invoice_id', invoiceId).maybeSingle();
  if (!document?.pdf_object_key) throw new HttpError(409, 'pdf_not_uploaded');
  await assertPdfExists(document.pdf_object_key);
  const result = await deliverInvoice({
    studioId: context.studioId,
    connectionId: context.connectionId,
    invoiceId,
    idempotencyKey,
  });
  res.status(200).json(result);
}

async function portalPdf(req: VercelRequest, res: VercelResponse, invoiceId: string) {
  method(req, 'GET');
  const { user } = await authenticatedRushUser(req);
  const client = adminClient();
  const { data: document, error } = await client.from('northbook_accounting_documents')
    .select('studio_id, rush_project_id, pdf_object_key').eq('northbook_invoice_id', invoiceId).maybeSingle();
  if (error) throw error;
  if (!document?.pdf_object_key) throw new HttpError(404, 'document_not_found');
  const [{ data: studio }, { data: membership }, { data: contacts }] = await Promise.all([
    client.from('studios').select('owner_user_id').eq('id', document.studio_id).maybeSingle(),
    client.from('studio_members').select('id').eq('studio_id', document.studio_id).eq('user_id', user.id).maybeSingle(),
    client.from('client_contacts').select('id').eq('user_id', user.id),
  ]);
  let allowed = studio?.owner_user_id === user.id || Boolean(membership);
  if (!allowed && document.rush_project_id && contacts?.length) {
    const ids = contacts.map(contact => contact.id);
    const { data: access } = await client.from('project_client_access').select('project_id')
      .eq('project_id', document.rush_project_id).in('client_contact_id', ids).limit(1);
    allowed = Boolean(access?.length);
  }
  if (!allowed) throw new HttpError(403, 'forbidden');
  await client.from('northbook_accounting_documents').update({ viewed_at: new Date().toISOString() })
    .eq('northbook_invoice_id', invoiceId).is('viewed_at', null);
  res.status(200).json(await createPdfDownload(document.pdf_object_key));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const path = routePath(req);
    if (path[0] === 'oauth' && path[1] === 'authorize') return await authorize(req, res);
    if (path[0] === 'oauth' && path[1] === 'token') return await token(req, res);
    if (path[0] === 'connections') return await connections(req, res, path[1]);
    if (path[0] === 'bootstrap') return await bootstrap(req, res);
    if (path[0] === 'changes') return await changes(req, res);
    if (path[0] === 'tasks' && path[1] && path[2] === 'status') return await updateTaskStatus(req, res, path[1]);
    if (path[0] === 'portal' && path[1] === 'documents' && path[2] && path[3] === 'pdf') {
      return await portalPdf(req, res, path[2]);
    }
    if (path[0] === 'billing-requests' && path[1] && path[2]) {
      return await transitionBillingRequest(req, res, path[1], path[2]);
    }
    if (path[0] === 'accounting' && path[1] === 'documents' && path[2] && path.length === 3) {
      return await putDocument(req, res, path[2]);
    }
    if (path[0] === 'accounting' && path[1] === 'project-summaries' && path[2]) {
      return await putSummary(req, res, path[2]);
    }
    if (path[0] === 'accounting' && path[1] === 'documents' && path[2] && path[3] === 'pdf-upload') {
      return await pdfUpload(req, res, path[2]);
    }
    if (path[0] === 'accounting' && path[1] === 'documents' && path[2] && path[3] === 'deliver') {
      return await deliver(req, res, path[2]);
    }
    throw new HttpError(404, 'route_not_found');
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    console.error('northbook integration API error', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: { code: 'internal_error', message: 'Unexpected server error' } });
  }
}
