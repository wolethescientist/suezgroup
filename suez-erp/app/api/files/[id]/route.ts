import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

// SVG is deliberately excluded: served inline from our own origin it is stored XSS.
const isInline = (mime: string) => /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain)$/.test(mime);

// Avatars and signatures are fetched through here on every page, so let the browser
// cache the redirect. The signed URL must outlive that window.
const SIGNED_TTL = 3600;
const CACHE_TTL = 1800;

/** Authenticated attachment download. Any signed-in employee may fetch an attachment. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorised", { status: 401 });

  const { id } = await params;
  const rows = await sql<{ name: string; mime: string; storage_path: string | null; data: string | null }>`
    select name, mime, storage_path, data from attachments where id = ${Number(id)}`;
  if (!rows[0]) return new Response("Not found", { status: 404 });
  const { name, mime, storage_path, data } = rows[0];
  const download = new URL(req.url).searchParams.get("download") === "1";

  // Stored in Supabase: hand the browser a short-lived signed URL and get out of the way.
  if (storage_path) {
    const url = await signedUrl(storage_path, SIGNED_TTL, isInline(mime) && !download ? undefined : name);
    if (!url) return new Response("File temporarily unavailable", { status: 502 });
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": `private, max-age=${CACHE_TTL}` },
    });
  }

  // Legacy rows stored inline before object storage was configured.
  if (!data) return new Response("File missing", { status: 410 });
  return new Response(new Uint8Array(Buffer.from(data, "base64")), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${isInline(mime) && !download ? "inline" : "attachment"}; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
