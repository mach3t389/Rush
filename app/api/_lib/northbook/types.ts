export const NORTHBOOK_SCOPES = [
  'entities:read',
  'billing_requests:read',
  'billing_requests:write',
  'accounting:write',
  'documents:write',
  'delivery:write',
] as const;

export type NorthbookScope = (typeof NORTHBOOK_SCOPES)[number];

export type IntegrationContext = {
  connectionId: string;
  studioId: string;
  scopes: NorthbookScope[];
  accountingCurrency: string;
  studioName: string;
};

export type BillingLine = {
  id: string;
  description: string;
  quantity: number;
  unitAmountMinor: number;
  taskIds?: string[];
  deliverableIds?: string[];
};

export type AccountingDocumentInput = {
  revision: number;
  snapshotHash: string;
  billingRequestId?: string | null;
  rushClientId: string;
  rushProjectId?: string | null;
  number: string;
  currency: string;
  issuedAt: string;
  dueAt?: string | null;
  status: 'issued' | 'paid' | 'void';
  voidReason?: string | null;
  lineItems: BillingLine[];
  subtotalMinor: number;
  taxes: Array<{ label: string; rate: number; amountMinor: number }>;
  totalMinor: number;
  paidMinor: number;
};

export type ProjectSummaryInput = {
  currency: string;
  invoicedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  expensesMinor: number;
  marginMinor: number;
  calculatedAt: string;
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_request');
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, field: string, max = 500): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > max) throw new HttpError(400, 'invalid_request', `Invalid ${field}`);
  return result;
}

export function optionalString(value: unknown, field: string, max = 500): string | null {
  if (value == null || value === '') return null;
  return requiredString(value, field, max);
}

export function assertCurrency(value: unknown): string {
  const currency = requiredString(value, 'currency', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'invalid_currency');
  return currency;
}

export function assertSafeInteger(value: unknown, field: string, options?: { min?: number }): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || (options?.min != null && result < options.min)) {
    throw new HttpError(400, 'invalid_request', `Invalid ${field}`);
  }
  return result;
}

export function assertIsoDate(value: unknown, field: string): string {
  const result = requiredString(value, field, 64);
  if (!Number.isFinite(Date.parse(result))) throw new HttpError(400, 'invalid_request', `Invalid ${field}`);
  return result;
}

export function parseScopes(value: unknown): NorthbookScope[] {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, 'invalid_scopes');
  const scopes = [...new Set(value.map(String))];
  if (scopes.some(scope => !NORTHBOOK_SCOPES.includes(scope as NorthbookScope))) {
    throw new HttpError(400, 'invalid_scopes');
  }
  return scopes as NorthbookScope[];
}

export function parseBillingLines(value: unknown): BillingLine[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new HttpError(400, 'invalid_lines');
  }
  return value.map((raw, index) => {
    const line = asRecord(raw);
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
      throw new HttpError(400, 'invalid_lines', `Invalid quantity at line ${index}`);
    }
    const ids = (input: unknown) => Array.isArray(input)
      ? [...new Set(input.map(String).filter(Boolean))].slice(0, 100)
      : undefined;
    return {
      id: requiredString(line.id, `lines[${index}].id`, 100),
      description: requiredString(line.description, `lines[${index}].description`, 500),
      quantity,
      unitAmountMinor: assertSafeInteger(line.unitAmountMinor, `lines[${index}].unitAmountMinor`, { min: 0 }),
      taskIds: ids(line.taskIds),
      deliverableIds: ids(line.deliverableIds),
    };
  });
}
