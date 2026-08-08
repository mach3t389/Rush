import { createClient } from "npm:@supabase/supabase-js@2";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  GetObjectCommand,
  PutObjectCommand,
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

  // .maybeSingle() throws if the user belongs to more than one studio —
  // that's a real, supported case (multi-studio membership), not an error.
  // Take the first membership row deterministically instead.
  const { data: memberships, error: memberError } = await supabaseAdmin
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", user.id)
    .limit(1);
  if (memberError) throw memberError;
  if (memberships && memberships.length > 0) return memberships[0].studio_id as string;

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
    const { action, ...body } = await req.json();

    // Public, unauthenticated actions used by the "Formulaire" resource's
    // public link (/f/:resourceId) — a genuine anonymous visitor has no
    // Supabase session at all. Ownership is enforced by resource type/id
    // instead of a studio JWT. No new table needed — the uploaded object's
    // key (form-uploads/<resourceId>/<fileId>) is embedded as the answer
    // value in form_submissions.answers, same as any other question type.
    // This function must be redeployed (supabase functions deploy
    // file-storage) for these two actions to exist in production.
    if (action === "form-sign-put") {
      const { resourceId, contentType } = body as { resourceId: string; contentType?: string };
      const { data: resource, error } = await supabaseAdmin
        .from("resources").select("id").eq("id", resourceId).eq("type", "form").maybeSingle();
      if (error) throw new Error(`resources lookup failed: ${error.message}`);
      if (!resource) throw new Error("form_not_found");
      const fileId = crypto.randomUUID();
      const key = `form-uploads/${resourceId}/${fileId}`;
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType || "application/octet-stream" }),
        { expiresIn: 300 },
      );
      return json({ url, key, fileId });
    }

    if (action === "form-sign-get") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("missing Authorization header");
      const jwt = authHeader.replace("Bearer ", "");
      const studioId = await resolveStudioId(jwt);
      const { resourceId, fileId } = body as { resourceId: string; fileId: string };
      const { data: resource, error } = await supabaseAdmin
        .from("resources").select("studio_id").eq("id", resourceId).maybeSingle();
      if (error) throw new Error(`resources lookup failed: ${error.message}`);
      if (!resource || resource.studio_id !== studioId) throw new Error("forbidden");
      const key = `form-uploads/${resourceId}/${fileId}`;
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 600 });
      return json({ url });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("missing Authorization header");
    const jwt = authHeader.replace("Bearer ", "");
    const studioId = await resolveStudioId(jwt);

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

      // Streams the object's raw bytes back through this function instead of
      // handing the browser a presigned R2 URL to fetch directly.
      //
      // Why: R2's bucket CORS policy only whitelists specific origins, so a
      // cross-origin fetch() from the app to r2.cloudflarestorage.com is
      // blocked by the browser. <iframe>/<img>/<video> aren't subject to CORS,
      // which is why PDFs, images and videos always worked while the .docx
      // preview (the only one using fetch(), for mammoth) always failed. This
      // function already sends Access-Control-Allow-Origin: *, so routing the
      // bytes through it removes the R2 CORS dependency entirely — no
      // dashboard change needed now or when the domain changes.
      case "get-object": {
        const { fileItemId } = body as { fileItemId: string };
        const key = `${studioId}/${fileItemId}`;
        const result = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        if (!result.Body) throw new Error("object has no body");
        // Selon la build du SDK chargée par Deno, Body est soit un
        // ReadableStream brut, soit un flux enrichi des helpers du SDK
        // (transformToWebStream). On gère les deux plutôt que de supposer.
        // NB: ne pas nommer cette variable `body` — ce nom est déjà pris par
        // le corps de la requête déstructuré en haut du try, et une
        // redéclaration ici la mettrait en zone morte temporelle pour tout ce
        // bloc (la ligne `const { fileItemId } = body` plus haut planterait
        // avec « Cannot access 'body' before initialization »).
        const payload = result.Body as unknown as {
          transformToWebStream?: () => ReadableStream;
        };
        const stream = typeof payload.transformToWebStream === "function"
          ? payload.transformToWebStream()
          : (result.Body as unknown as ReadableStream);
        return new Response(stream, {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": result.ContentType || "application/octet-stream",
          },
        });
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
    try {
      const dump = err && typeof err === "object"
        ? JSON.stringify(err, Object.getOwnPropertyNames(err))
        : String(err);
      console.error("file-storage error:", err instanceof Error ? (err.stack ?? err.message) : dump, "| constructor:", err?.constructor?.name);
    } catch (logErr) {
      console.error("file-storage error (failed to serialize):", String(err), logErr);
    }
    // err isn't always a real Error: crypto.subtle (used inside getSignedUrl)
    // throws DOMException, which does NOT extend Error in V8/Deno, and
    // Supabase's own client errors are plain {message, ...} objects too —
    // `err instanceof Error` misses both and collapsed every such failure
    // into an unhelpful "unknown error", making this endpoint impossible to
    // debug from the client (docx sign-get failures showed no real cause).
    let message = "unknown error";
    if (err instanceof Error) {
      message = err.message;
    } else if (err && typeof err === "object" && "message" in err) {
      message = String((err as { message: unknown }).message);
    } else if (typeof err === "string") {
      message = err;
    }
    return json({ error: message }, 400);
  }
});
