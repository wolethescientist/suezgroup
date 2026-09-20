// Pure validation for images that arrive as `data:` URLs — drawn signatures and
// picked avatars. Kept dependency-free so scripts and tests can import it directly.

// Raster only. An SVG served inline from our own origin in fallback mode would be
// stored XSS, and nothing here needs vector images.
const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/;
export const MAX_IMAGE = 4_000_000; // 4 MB decoded — avatars and signatures are far smaller

/**
 * Trust boundary: the string is attacker-controlled, so the mime allowlist and
 * size cap live here. Throws a user-readable message.
 */
export function parseImageDataUrl(dataUrl: string) {
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error("That does not look like an image.");
  const [, mime, b64] = match;
  if (!IMAGE_MIME.test(mime)) throw new Error("Use a PNG, JPG, WebP or GIF image.");

  const bytes = Buffer.from(b64, "base64");
  if (!bytes.byteLength) throw new Error("That image is empty.");
  if (bytes.byteLength > MAX_IMAGE) throw new Error(`Keep the image under ${Math.round(MAX_IMAGE / 1_000_000)} MB.`);

  return { mime, bytes, ext: mime.split("/")[1].replace("jpeg", "jpg") };
}

/** How avatars and signatures are referenced from a user row — a plain <img src>. */
export const fileRef = (id: number) => `/api/files/${id}`;

/** The attachment id behind a `/api/files/N` value, or null for anything else. */
export const fileRefId = (value: string | null | undefined) =>
  Number(/^\/api\/files\/(\d+)$/.exec(value ?? "")?.[1]) || null;
