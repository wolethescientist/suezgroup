import crypto from "node:crypto";

/**
 * Symmetric encryption for third-party credentials we must be able to replay —
 * a mailbox password has to be sent to the IMAP server verbatim, so unlike an
 * account password it cannot be a one-way hash.
 *
 * AES-256-GCM under a key derived from SESSION_SECRET. Rotating SESSION_SECRET
 * therefore invalidates stored mailbox passwords as well as sessions; users
 * re-enter them. That is the intended trade — one secret to protect, not two.
 */
const ALGO = "aes-256-gcm";

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set. Copy .env.example to .env.");
  // Fixed salt: the secret is already high-entropy, and a random salt per value
  // would have to be stored alongside it for no gain over the random IV below.
  return crypto.scryptSync(s, "suez-secretbox-v1", 32);
}

/** → `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function seal(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

/** Returns null for anything tampered with, truncated or encrypted under an old secret. */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, ivB, tagB, dataB] = sealed.split(".");
  if (v !== "v1" || !ivB || !tagB || !dataB) return null;
  try {
    const d = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64url"));
    d.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([d.update(Buffer.from(dataB, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** True when the value is already sealed, so a form that echoes back "••••" never re-seals a placeholder. */
export const isSealed = (v: string | null | undefined) => !!v && v.startsWith("v1.");
