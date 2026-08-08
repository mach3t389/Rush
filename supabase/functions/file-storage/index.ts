import { createClient } from "npm:@supabase/supabase-js@2";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

// EVERY studio this user can act in — not "the first one".
//
// A person can belong to several organisations, and the app lets them switch
// between them (studioStore.ts remembers the ACTIVE one per browser). Picking
// one here server-side is always a guess, and a wrong guess silently sends
// reads and writes to different R2 prefixes — that's what produced
// "The specified key does not exist". Callers below decide which studio
// applies from the data, then check it against this set.
async function getUserStudioIds(jwt: string): Promise<string[]> {
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !user) throw new Error("unauthenticated");

  const ids: string[] = [];

  const { data: memberships, error: memberError } = await supabaseAdmin
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", user.id);
  if (memberError) throw memberError;
  for (const m of memberships ?? []) ids.push(m.studio_id as string);

  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("studios")
    .select("id")
    .eq("owner_user_id", user.id);
  if (ownedError) throw ownedError;
  for (const o of owned ?? []) {
    if (!ids.includes(o.id as string)) ids.push(o.id as string);
  }

  if (ids.length === 0) throw new Error("no studio found for this user");
  return ids;
}

// The studio that owns the file row — the same value the client wrote when it
// created the file, so upload and read agree by construction. Returns null if
// the row isn't visible yet (the client inserts it and starts the upload
// without awaiting the insert).
async function lookupFileStudioId(fileItemId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("file_items")
    .select("studio_id")
    .eq("id", fileItemId)
    .maybeSingle();
  if (error) throw new Error(`file_items lookup failed: ${error.message}`);
  return data ? (data.studio_id as string) : null;
}

// Resolves the R2 key of an EXISTING object.
//
// Preference order: the studio recorded on the file row, then the caller's
// other studios. The fallback sweep exists to recover files uploaded before
// this was fixed, when the server's arbitrary studio choice could differ from
// the one the client recorded — without it those objects stay unreachable
// even though the bytes are sitting in the bucket.
async function resolveExistingKey(fileItemId: string, studioIds: string[]): Promise<string> {
  const owner = await lookupFileStudioId(fileItemId);
  if (owner && !studioIds.includes(owner)) {
    throw new Error("forbidden: file belongs to another studio");
  }

  const candidates = owner ? [owner, ...studioIds.filter((id) => id !== owner)] : [...studioIds];

  for (const studioId of candidates) {
    const key = `${studioId}/${fileItemId}`;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      return key;
    } catch {
      // Pas à cet emplacement — on essaie le suivant.
    }
  }

  throw new Error(
    "le contenu de ce fichier est introuvable dans le stockage — le téléversement n'a probablement jamais abouti, réimporte le fichier",
  );
}

function assertOwnKey(key: string, studioIds: string[]): void {
  if (!studioIds.some((id) => key.startsWith(`${id}/`))) {
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
      const studioIds = await getUserStudioIds(jwt);
      const { resourceId, fileId } = body as { resourceId: string; fileId: string };
      const { data: resource, error } = await supabaseAdmin
        .from("resources").select("studio_id").eq("id", resourceId).maybeSingle();
      if (error) throw new Error(`resources lookup failed: ${error.message}`);
      if (!resource || !studioIds.includes(resource.studio_id as string)) throw new Error("forbidden");
      const key = `form-uploads/${resourceId}/${fileId}`;
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 600 });
      return json({ url });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("missing Authorization header");
    const jwt = authHeader.replace("Bearer ", "");
    const studioIds = await getUserStudioIds(jwt);

    switch (action) {
      case "initiate-upload": {
        const { fileItemId, contentType, studioId: requestedStudioId } =
          body as { fileItemId: string; contentType?: string; studioId?: string };

        // Le client envoie l'organisation ACTIVE — la même que celle qu'il
        // inscrit dans file_items. On la vérifie (elle doit faire partie des
        // organisations de l'appelant) plutôt que de la deviner ici : c'est le
        // seul moyen que la clé d'écriture corresponde à la clé de lecture
        // pour un compte multi-organisations. En dernier recours seulement, on
        // retombe sur la ligne du fichier puis sur la première organisation.
        let studioId: string;
        if (requestedStudioId && studioIds.includes(requestedStudioId)) {
          studioId = requestedStudioId;
        } else {
          studioId = (await lookupFileStudioId(fileItemId)) ?? studioIds[0];
          if (!studioIds.includes(studioId)) studioId = studioIds[0];
        }

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
        assertOwnKey(key, studioIds);
        const url = await getSignedUrl(
          s3,
          new UploadPartCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
          { expiresIn: 300 },
        );
        return json({ url });
      }

      case "list-parts": {
        const { key, uploadId } = body as { key: string; uploadId: string };
        assertOwnKey(key, studioIds);
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
        assertOwnKey(key, studioIds);
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
        assertOwnKey(key, studioIds);
        await s3.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }));
        return json({ ok: true });
      }

      case "sign-get": {
        const { fileItemId } = body as { fileItemId: string };
        const key = await resolveExistingKey(fileItemId, studioIds);
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
        const key = await resolveExistingKey(fileItemId, studioIds);
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
        // La suppression est idempotente : un objet déjà absent (téléversement
        // jamais abouti) ne doit pas faire échouer la suppression du fichier
        // côté application.
        let key: string;
        try {
          key = await resolveExistingKey(fileItemId, studioIds);
        } catch {
          return json({ ok: true });
        }
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
