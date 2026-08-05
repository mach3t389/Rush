export function encodeCursor(sequence: string | number | bigint): string {
  return Buffer.from(`v1:${String(sequence)}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: unknown): number {
  if (cursor == null || cursor === '') return 0;
  try {
    const decoded = Buffer.from(String(cursor), 'base64url').toString('utf8');
    if (!/^v1:\d+$/.test(decoded)) return -1;
    const value = Number(decoded.slice(3));
    return Number.isSafeInteger(value) && value >= 0 ? value : -1;
  } catch {
    return -1;
  }
}

export function serializeClient(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    email: row.email == null ? null : String(row.email),
    address: row.address == null ? null : String(row.address),
    archived: Boolean(row.archived),
    version: String(row.updated_at ?? row.last_activity ?? row.created_at ?? ''),
  };
}

const MONTHS: Record<string, number> = {
  jan: 1, janvier: 1, january: 1,
  fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juil: 7, juillet: 7, jul: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
};

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeDeliveryDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const normalized = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const localized = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/.exec(normalized);
  if (!localized) return null;
  const month = MONTHS[localized[2]];
  return month ? validDate(Number(localized[3]), month, Number(localized[1])) : null;
}

export function serializeProject(row: Record<string, unknown>) {
  const budget = row.budget == null ? null : Number(row.budget);
  return {
    id: String(row.id),
    clientId: row.client_id == null || row.client_id === '' ? null : String(row.client_id),
    name: String(row.name ?? ''),
    description: row.description == null ? null : String(row.description),
    deliveryDate: normalizeDeliveryDate(row.delivery_date),
    budgetMinor: budget == null || !Number.isFinite(budget) ? null : Math.round(budget * 100),
    archived: Boolean(row.archived),
    completed: Boolean(row.completed),
    version: String(row.modified_at ?? row.updated_at ?? row.created_at ?? ''),
  };
}

export function serializeBillingRequest(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    projectId: row.project_id == null ? null : String(row.project_id),
    title: String(row.title ?? ''),
    currency: String(row.currency ?? 'CAD'),
    lines: Array.isArray(row.lines) ? row.lines : [],
    notes: row.notes == null ? null : String(row.notes),
    status: String(row.status),
    northbookInvoiceId: row.northbook_invoice_id == null ? null : String(row.northbook_invoice_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function serializeChange(row: Record<string, unknown>) {
  const entityType = String(row.entity_type);
  const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload as Record<string, unknown>
    : null;
  let normalized: unknown = payload;
  if (payload && entityType === 'client') normalized = serializeClient(payload);
  if (payload && entityType === 'project') normalized = serializeProject(payload);
  if (payload && entityType === 'billing_request') normalized = serializeBillingRequest(payload);
  return {
    cursor: encodeCursor(String(row.sequence)),
    entityType,
    entityId: String(row.entity_id),
    operation: String(row.operation),
    occurredAt: String(row.occurred_at),
    payload: normalized,
  };
}
