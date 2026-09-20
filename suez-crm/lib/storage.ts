import crypto from "node:crypto";

// ponytail: the Supabase Storage REST API is four fetches. @supabase/supabase-js
// would be ~200 kB of client to call them.
const base = () => process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export const BUCKET = process.env.SUPABASE_BUCKET || "attachments";
export const MAX_UPLOAD = 20_000_000; // 20 MB

/** False means "no bucket configured" — callers fall back to storing bytes in Postgres. */
export const storageEnabled = () => !!(base() && key());

function headers(extra: Record<string, string> = {}) {
  const k = key()!;
  return { Authorization: `Bearer ${k}`, apikey: k, ...extra };
}

/** `2026/07/uuid-quarterly-report.pdf` — dated folders, unguessable name, readable tail. */
export function objectPath(filename: string) {
  const now = new Date();
  const safe = filename.replace(/[^\w.\- ]+/g, "_").slice(-80);
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}-${safe}`;
}

export async function putObject(path: string, body: Buffer, mime: string) {
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: "POST",
    headers: headers({ "Content-Type": mime || "application/octet-stream", "x-upsert": "true" }),
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`Upload to Supabase Storage failed (${res.status}): ${await res.text()}`);
}

/** Short-lived URL so the file streams from Supabase, not through this app. */
export async function signedUrl(path: string, expiresIn = 60, download?: string) {
  const res = await fetch(`${base()}/storage/v1/object/sign/${BUCKET}/${encodeURI(path)}`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) {
    console.error("signedUrl failed", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const signed = data.signedURL ?? data.signedUrl;
  if (!signed) return null;
  const url = signed.startsWith("http") ? signed : `${base()}/storage/v1${signed}`;
  return download ? `${url}&download=${encodeURIComponent(download)}` : url;
}

/** Reads an object back — used to snapshot a signature at the moment of signing. */
export async function getObject(path: string): Promise<Buffer | null> {
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, { headers: headers() });
  if (!res.ok) {
    console.error("getObject failed", path, res.status);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Best-effort removal. A leaked object is cheaper than a failed profile save. */
export async function deleteObject(path: string) {
  try {
    const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!res.ok) console.error("deleteObject failed", path, res.status, await res.text());
  } catch (e) {
    console.error("deleteObject failed", path, e);
  }
}

/** Creates the private bucket if it is missing. Called by db/migrate.mjs. */
export async function ensureBucket() {
  if (!storageEnabled()) return "skipped";
  const res = await fetch(`${base()}/storage/v1/bucket`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_UPLOAD }),
  });
  if (res.ok) return "created";
  const text = await res.text();
  if (res.status === 409 || /already exists|duplicate/i.test(text)) return "exists";
  throw new Error(`Could not create bucket "${BUCKET}" (${res.status}): ${text}`);
}
