import { createHash } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpError } from './types.js';

function bucket(): string {
  const value = process.env.R2_BUCKET_NAME;
  if (!value) throw new HttpError(500, 'storage_not_configured');
  return value;
}

function client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new HttpError(500, 'storage_not_configured');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function invoiceObjectKey(studioId: string, invoiceId: string): string {
  const safeId = createHash('sha256').update(invoiceId).digest('hex');
  return `${studioId}/northbook-invoices/${safeId}.pdf`;
}

export async function createPdfUpload(studioId: string, invoiceId: string) {
  const key = invoiceObjectKey(studioId, invoiceId);
  const url = await getSignedUrl(client(), new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: 'application/pdf',
  }), { expiresIn: 300 });
  return { key, url, expiresIn: 300 };
}

export async function createPdfDownload(key: string) {
  const url = await getSignedUrl(client(), new GetObjectCommand({
    Bucket: bucket(), Key: key, ResponseContentType: 'application/pdf',
  }), { expiresIn: 300 });
  return { url, expiresIn: 300 };
}

export async function assertPdfExists(key: string): Promise<void> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch {
    throw new HttpError(409, 'pdf_not_uploaded');
  }
}

export async function downloadPdf(key: string): Promise<Buffer> {
  const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new HttpError(409, 'pdf_not_uploaded');
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}
