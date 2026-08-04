import { supabase } from './supabaseClient';
import { getStudioId } from './studioStore';

export const NORTHBOOK_SCOPES = [
  'entities:read',
  'billing_requests:read',
  'billing_requests:write',
  'accounting:write',
  'documents:write',
  'delivery:write',
] as const;

export interface NorthbookConnection {
  id: string;
  installationName: string;
  scopes: string[];
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface NorthbookIntegrationStatus {
  accountingMode: 'native' | 'northbook';
  accountingCurrency: string;
  pilotEnabled: boolean;
  connections: NorthbookConnection[];
}

export interface BillingRequestLine {
  id: string;
  description: string;
  quantity: number;
  unitAmountMinor: number;
  taskIds?: string[];
  deliverableIds?: string[];
}

export interface BillingRequest {
  id: string;
  clientId: string;
  projectId?: string;
  title: string;
  currency: string;
  lines: BillingRequestLine[];
  notes?: string;
  status: 'draft' | 'submitted' | 'accepted' | 'fulfilled' | 'rejected' | 'cancelled';
  northbookInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NorthbookAccountingDocument {
  id: string;
  number: string;
  clientId: string;
  projectId?: string;
  title: string;
  amount: number;
  taxLines: Array<{ id: string; name: string; rate: number; enabled: boolean }>;
  tax: number;
  total: number;
  paidAmount: number;
  currency: string;
  status: 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
  issuedDate: string;
  dueDate: string;
  deliveredAt?: string;
  viewedAt?: string;
  hasPdf: boolean;
  northbookManaged: true;
}

async function userAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not_authenticated');
  return token;
}

async function integrationApi(path: string, init?: RequestInit) {
  const token = await userAccessToken();
  const response = await fetch(`/api/integrations/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload?.error?.code ?? 'integration_request_failed';
    throw new Error(code);
  }
  return payload;
}

export async function getNorthbookIntegrationStatus(studioId?: string): Promise<NorthbookIntegrationStatus> {
  const resolvedStudioId = studioId ?? await getStudioId();
  return integrationApi(`connections?studioId=${encodeURIComponent(resolvedStudioId)}`);
}

export async function getNorthbookAccountingMode(): Promise<{ accountingMode: 'native' | 'northbook'; accountingCurrency: string }> {
  const studioId = await getStudioId();
  const { data, error } = await supabase.from('studios').select('accounting_mode, accounting_currency').eq('id', studioId).single();
  if (error) throw error;
  return {
    accountingMode: data.accounting_mode === 'northbook' ? 'northbook' : 'native',
    accountingCurrency: String(data.accounting_currency ?? 'CAD'),
  };
}

export async function revokeNorthbookConnection(connectionId: string): Promise<void> {
  await integrationApi(`connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' });
}

export async function authorizeNorthbook(input: {
  studioId: string;
  codeChallenge: string;
  state: string;
  installationName: string;
  redirectUri: string;
}): Promise<string> {
  const result = await integrationApi('oauth/authorize', {
    method: 'POST',
    body: JSON.stringify({ ...input, scopes: NORTHBOOK_SCOPES }),
  });
  return String(result.redirectUrl);
}

function toBillingRequest(row: Record<string, unknown>): BillingRequest {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    projectId: row.project_id ? String(row.project_id) : undefined,
    title: String(row.title),
    currency: String(row.currency),
    lines: Array.isArray(row.lines) ? row.lines as BillingRequestLine[] : [],
    notes: row.notes ? String(row.notes) : undefined,
    status: String(row.status) as BillingRequest['status'],
    northbookInvoiceId: row.northbook_invoice_id ? String(row.northbook_invoice_id) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listBillingRequests(): Promise<BillingRequest[]> {
  const studioId = await getStudioId();
  const { data, error } = await supabase.from('northbook_billing_requests').select('*')
    .eq('studio_id', studioId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => toBillingRequest(row));
}

export async function listNorthbookAccountingDocuments(): Promise<NorthbookAccountingDocument[]> {
  const studioId = await getStudioId();
  const { data, error } = await supabase.from('northbook_accounting_documents').select('*')
    .eq('studio_id', studioId).order('issued_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => {
    const totalMinor = Number(row.total_minor ?? 0);
    const paidMinor = Number(row.paid_minor ?? 0);
    const dueAt = row.due_at ? String(row.due_at) : '';
    const operationalStatus: NorthbookAccountingDocument['status'] = row.status === 'void' ? 'cancelled'
      : row.status === 'paid' || paidMinor >= totalMinor ? 'paid'
        : row.viewed_at ? 'viewed'
          : dueAt && Date.parse(dueAt) < Date.now() ? 'overdue' : 'sent';
    const lines = Array.isArray(row.line_items) ? row.line_items as Array<{ description?: string }> : [];
    const taxes = Array.isArray(row.taxes) ? row.taxes as Array<{ label?: string; rate?: number; amountMinor?: number }> : [];
    return {
      id: String(row.northbook_invoice_id), number: String(row.number), clientId: String(row.rush_client_id),
      projectId: row.rush_project_id ? String(row.rush_project_id) : undefined,
      title: String(lines[0]?.description ?? row.number), amount: Number(row.subtotal_minor ?? 0) / 100,
      taxLines: taxes.map((item, index) => ({ id: `northbook-tax-${index}`, name: String(item.label ?? 'Tax'), rate: Number(item.rate ?? 0) * 100, enabled: true })),
      tax: taxes.reduce((sum, item) => sum + Number(item.amountMinor ?? 0), 0) / 100,
      total: totalMinor / 100, paidAmount: paidMinor / 100, currency: String(row.currency), status: operationalStatus,
      issuedDate: String(row.issued_at).slice(0, 10), dueDate: dueAt.slice(0, 10),
      deliveredAt: row.delivered_at ? String(row.delivered_at) : undefined,
      viewedAt: row.viewed_at ? String(row.viewed_at) : undefined,
      hasPdf: Boolean(row.pdf_object_key), northbookManaged: true,
    };
  });
}

export async function openNorthbookAccountingDocumentPdf(documentId: string): Promise<void> {
  const result = await integrationApi(`portal/documents/${encodeURIComponent(documentId)}/pdf`);
  const url = typeof result?.url === 'string' ? result.url : '';
  if (!url) throw new Error('pdf_url_missing');
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function submitBillingRequest(input: {
  clientId: string;
  projectId?: string;
  title: string;
  currency: string;
  lines: BillingRequestLine[];
  notes?: string;
}): Promise<BillingRequest> {
  const studioId = await getStudioId();
  const { data: { user } } = await supabase.auth.getUser();
  const row = {
    id: `br_${crypto.randomUUID().replace(/-/g, '')}`,
    studio_id: studioId,
    client_id: input.clientId,
    project_id: input.projectId ?? null,
    title: input.title.trim(),
    currency: input.currency,
    lines: input.lines,
    notes: input.notes?.trim() || null,
    status: 'submitted',
    created_by_user_id: user?.id ?? null,
  };
  const { data, error } = await supabase.from('northbook_billing_requests').insert(row).select('*').single();
  if (error) throw error;
  return toBillingRequest(data);
}
