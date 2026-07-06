import { createClient } from "npm:@supabase/supabase-js@2";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET_NAME")!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function resolveStudioId(jwt: string): Promise<string> {
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !user) throw new Error("unauthenticated");

  const { data: membership, error: memberError } = await supabaseAdmin
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) throw memberError;
  if (membership) return membership.studio_id as string;

  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("studios")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (owned) return owned.id as string;

  throw new Error("no studio found for this user");
}

function assertOwnKey(key: string, studioId: string): void {
  if (!key.startsWith(`${studioId}/`)) {
    throw new Error("forbidden: key does not belong to caller's studio");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("missing Authorization header");
    const jwt = authHeader.replace("Bearer ", "");
    const studioId = await resolveStudioId(jwt);

    const { action, ...body } = await req.json();

    switch (action) {
      case "initiate-upload": {
        const { fileItemId, contentType } = body as { fileItemId: string; contentType?: string };
        const key = `${studioId}/${fileItemId}`;
        const result = await s3.send(new CreateMultipartUploadCommand({
          Bucket: R2_BUCKET,
          Key: key,
          ContentType: contentType || "application/octet-stream",
        }));
        return json({ uploadId: result.UploadId, key });
      }

      case "sign-part": {
        const { key, uploadId, partNumber } = body as { key: string; uploadId: string; partNumber: number };
        assertOwnKey(key, studioId);
        const url = await getSignedUrl(
          s3,
          new UploadPartCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
          { expiresIn: 300 },
        );
        return json({ url });
      }

      case "list-parts": {
        const { key, uploadId } = body as { key: string; uploadId: string };
        assertOwnKey(key, studioId);
        const result = await s3.send(new ListPartsCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }));
        const parts = (result.Parts ?? []).map((p) => ({
          partNumber: p.PartNumber,
          size: p.Size,
          etag: p.ETag,
        }));
        return json({ parts });
      }

      case "complete-upload": {
        const { key, uploadId, parts } = body as {
          key: string; uploadId: string; parts: { partNumber: number; etag: string }[];
        };
        assertOwnKey(key, studioId);
        await s3.send(new CompleteMultipartUploadCommand({
          Bucket: R2_BUCKET,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
        }));
        return json({ ok: true });
      }

      case "abort-upload": {
        const { key, uploadId } = body as { key: string; uploadId: string };
        assertOwnKey(key, studioId);
        await s3.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }));
        return json({ ok: true });
      }

      case "sign-get": {
        const { fileItemId } = body as { fileItemId: string };
        const key = `${studioId}/${fileItemId}`;
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
          { expiresIn: 600 },
        );
        return json({ url });
      }

      case "delete-object": {
        const { fileItemId } = body as { fileItemId: string };
        const key = `${studioId}/${fileItemId}`;
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (err) {
    console.error("file-storage error:", err instanceof Error ? err.stack ?? err.message : String(err));
    const message = err instanceof Error ? err.message : "unknown error";
    return json({ error: message }, 400);
  }
});
