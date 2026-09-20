import crypto from "node:crypto";

/** Signed, self-contained session token: base64url(payload).hmac */
export function signToken(payload: object, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`;
}

/** Returns the payload, or null if the token is malformed, forged or expired. */
export function readToken<T extends { exp: number }>(token: string | undefined, secret: string): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
