import { Resend } from 'resend';
import { adminClient } from './auth.js';
import { downloadPdf } from './storage.js';
import { HttpError } from './types.js';

type DeliverInput = {
  studioId: string;
  connectionId: string;
  invoiceId: string;
  idempotencyKey: string;
};

export async function deliverInvoice(input: DeliverInput) {
  const client = adminClient();
  const { data: previous } = await client
    .from('northbook_delivery_attempts')
    .select('status, provider_message_id')
    .eq('studio_id', input.studioId)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (previous?.status === 'delivered') {
    return { delivered: true, duplicate: true, providerMessageId: previous.provider_message_id };
  }

  const { data: document, error } = await client
    .from('northbook_accounting_documents')
    .select('number, rush_client_id, pdf_object_key, delivered_at')
    .eq('studio_id', input.studioId)
    .eq('northbook_invoice_id', input.invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!document) throw new HttpError(404, 'document_not_found');
  if (!document.pdf_object_key) throw new HttpError(409, 'pdf_not_uploaded');

  const { data: customer, error: customerError } = await client
    .from('clients')
    .select('name, email, email_compta')
    .eq('studio_id', input.studioId)
    .eq('id', document.rush_client_id)
    .maybeSingle();
  if (customerError) throw customerError;
  const recipient = String(customer?.email_compta ?? customer?.email ?? '').trim();
  if (!recipient) throw new HttpError(422, 'client_email_missing');

  await client.from('northbook_delivery_attempts').upsert({
    studio_id: input.studioId,
    northbook_invoice_id: input.invoiceId,
    idempotency_key: input.idempotencyKey,
    recipient_email: recipient,
    status: 'pending',
  }, { onConflict: 'studio_id,idempotency_key' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new HttpError(500, 'email_not_configured');
  const pdf = await downloadPdf(document.pdf_object_key);
  const portalUrl = `${process.env.VITE_APP_URL ?? 'https://rushflow.app'}/mon-espace`;
  const from = process.env.RESEND_FROM_EMAIL ?? 'Rush <notifications@rushflow.app>';
  const resend = new Resend(apiKey);
  try {
    const result = await resend.emails.send({
      from,
      to: recipient,
      subject: `Facture ${document.number}`,
      html: `<p>Bonjour ${escapeHtml(String(customer?.name ?? ''))},</p><p>Votre facture <strong>${escapeHtml(document.number)}</strong> est disponible.</p><p><a href="${portalUrl}">Consulter votre espace client</a></p>`,
      attachments: [{ filename: `${safeFilename(document.number)}.pdf`, content: pdf }],
    }, { idempotencyKey: input.idempotencyKey });
    if (result.error) throw result.error;
    const now = new Date().toISOString();
    await Promise.all([
      client.from('northbook_delivery_attempts').update({
        status: 'delivered', provider_message_id: result.data?.id ?? null, completed_at: now,
      }).eq('studio_id', input.studioId).eq('idempotency_key', input.idempotencyKey),
      client.from('northbook_accounting_documents').update({ delivered_at: now })
        .eq('studio_id', input.studioId).eq('northbook_invoice_id', input.invoiceId),
      client.from('northbook_change_log').insert({
        studio_id: input.studioId,
        entity_type: 'invoice_delivery',
        entity_id: input.invoiceId,
        operation: 'upsert',
        payload: { northbookInvoiceId: input.invoiceId, deliveredAt: now },
      }),
      client.from('northbook_integration_audit_log').insert({
        studio_id: input.studioId,
        connection_id: input.connectionId,
        action: 'invoice.delivered',
        entity_type: 'invoice',
        entity_id: input.invoiceId,
        metadata: { recipientDomain: recipient.split('@')[1] ?? null },
      }),
    ]);
    return { delivered: true, duplicate: false, deliveredAt: now };
  } catch (deliveryError) {
    if (isConcurrentIdempotentRequest(deliveryError)) {
      const { data: concurrentAttempt } = await client
        .from('northbook_delivery_attempts')
        .select('status, provider_message_id, completed_at')
        .eq('studio_id', input.studioId)
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle();
      if (concurrentAttempt?.status === 'delivered') {
        return {
          delivered: true,
          duplicate: true,
          providerMessageId: concurrentAttempt.provider_message_id,
          deliveredAt: concurrentAttempt.completed_at,
        };
      }
      throw new HttpError(409, 'delivery_in_progress');
    }
    await client.from('northbook_delivery_attempts').update({
      status: 'failed', error_code: 'provider_error', completed_at: new Date().toISOString(),
    }).eq('studio_id', input.studioId).eq('idempotency_key', input.idempotencyKey).eq('status', 'pending');
    throw deliveryError;
  }
}

function isConcurrentIdempotentRequest(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'name' in error && error.name === 'concurrent_idempotent_requests'
    || 'message' in error && String(error.message).includes('concurrent_idempotent_requests');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char] ?? char);
}

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'facture';
}
