import crypto from "node:crypto";
import { sql } from "./db";
import { fileRef, fileRefId, parseImageDataUrl } from "./images";
import { MAX_UPLOAD, deleteObject, getObject, objectPath, putObject, storageEnabled } from "./storage";

export { MAX_UPLOAD };
export { fileRef, parseImageDataUrl } from "./images";

export type AttachmentMeta = { id: number; name: string; mime: string; size_bytes: number };

/** Writes bytes to Supabase Storage, or to the base64 column when it is not configured. */
async function store(bytes: Buffer, name: string, mime: string, userId: number) {
  let storagePath: string | null = null;
  let inline: string | null = null;
  if (storageEnabled()) {
    storagePath = objectPath(name);
    await putObject(storagePath, bytes, mime);
  } else {
    inline = bytes.toString("base64");
  }
  const rows = await sql<{ id: number }>`
    insert into attachments (name, mime, size_bytes, storage_path, data, uploaded_by)
    values (${name}, ${mime}, ${bytes.byteLength}, ${storagePath}, ${inline}, ${userId})
    returning id`;
  return rows[0].id;
}

/**
 * Stores a form upload and returns its id, or null when no file was chosen.
 * Throws a user-readable message on oversize input.
 */
export async function saveUpload(value: FormDataEntryValue | null, userId: number): Promise<number | null> {
  if (!value || typeof value === "string") return null;
  const file = value as File;
  if (!file.size) return null;
  if (file.size > MAX_UPLOAD) throw new Error(`"${file.name}" is larger than ${Math.round(MAX_UPLOAD / 1_000_000)} MB.`);

  return store(Buffer.from(await file.arrayBuffer()), file.name, file.type || "application/octet-stream", userId);
}

/** Stores a data-URL image and returns the `/api/files/N` reference for the user row. */
export async function saveImageDataUrl(dataUrl: string, name: string, userId: number): Promise<string> {
  const { mime, bytes, ext } = parseImageDataUrl(dataUrl);
  return fileRef(await store(bytes, `${name}.${ext}`, mime, userId));
}

/**
 * Resolves what to persist in an avatar/signature column, and what to clean up.
 * `submitted` is a data URL (new image), an existing `/api/files/N` reference
 * (unchanged), or empty (removed).
 */
export async function resolveImageField(
  submitted: string,
  previous: string | null,
  name: string,
  userId: number,
): Promise<{ value: string | null; discard: string | null }> {
  if (!submitted) return { value: null, discard: previous };
  if (!submitted.startsWith("data:")) return { value: previous, discard: null };
  return { value: await saveImageDataUrl(submitted, name, userId), discard: previous };
}

/** Reads the bytes behind a `/api/files/N` value, from the bucket or the fallback column. */
export async function readByRef(value: string | null) {
  const id = fileRefId(value);
  if (!id) return null;
  const rows = await sql<{ name: string; mime: string; storage_path: string | null; data: string | null }>`
    select name, mime, storage_path, data from attachments where id = ${id}`;
  const row = rows[0];
  if (!row) return null;
  const bytes = row.storage_path
    ? await getObject(row.storage_path)
    : row.data
      ? Buffer.from(row.data, "base64")
      : null;
  return bytes ? { bytes, mime: row.mime, name: row.name } : null;
}

/**
 * Takes an independent copy of an image and hashes it, so a later change to the
 * original cannot alter the record that referenced it. Accepts a `/api/files/N`
 * reference or a legacy `data:` URL. Returns null if the source cannot be read.
 */
export async function snapshotImage(value: string | null, name: string, userId: number) {
  let src: { bytes: Buffer; mime: string } | null = null;
  if (value?.startsWith("data:")) {
    const parsed = parseImageDataUrl(value);
    src = { bytes: parsed.bytes, mime: parsed.mime };
  } else {
    src = await readByRef(value);
  }
  if (!src) return null;

  const sha256 = crypto.createHash("sha256").update(src.bytes).digest("hex");
  const ext = src.mime.split("/")[1].replace("jpeg", "jpg");
  const id = await store(src.bytes, `${name}.${ext}`, src.mime, userId);
  return { ref: fileRef(id), sha256 };
}

/** Deletes the attachment a `/api/files/N` value points at. No-op for anything else. */
export async function deleteByRef(value: string | null) {
  const id = fileRefId(value);
  if (!id) return;
  const rows = await sql<{ storage_path: string | null }>`
    delete from attachments where id = ${id} returning storage_path`;
  if (rows[0]?.storage_path) await deleteObject(rows[0].storage_path);
}

export const prettySize = (bytes: number) =>
  bytes > 1_000_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
