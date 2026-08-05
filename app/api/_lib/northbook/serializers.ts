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

export function serializeProject(row: Record<string, unknown>) {
  const budget = row.budget == null ? null : Number(row.budget);
  return {
    id: String(row.id),
    clientId: row.client_id == null || row.client_id === '' ? null : String(row.client_id),
    name: String(row.name ?? ''),
    description: row.description == null ? null : String(row.description),
    deliveryDate: row.delivery_date == null || row.delivery_date === '' ? null : String(row.delivery_date),
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
