import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Stateless CSRF protection for OAuth `connect` flows: no server-side
// "pending connect request" table. `state` is
// `base64url(payload).base64url(hmacSignature)`; the callback route verifies
// the signature and rejects anything stale before trusting the embedded
// payload. Originally lived inline in packages/search-console/oauth.ts (the
// first signing helper in the repo); promoted here once packages/google-ads
// needed the identical logic with its own secret, so it isn't duplicated a
// second time.

export interface OauthStatePayload {
  issuedAt: number;
}

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64url");

const sign = (secret: string, data: string): string =>
  base64url(createHmac("sha256", secret).update(data).digest());

export const signState = <T extends OauthStatePayload>(
  secret: string,
  payload: Omit<T, "nonce">
): string => {
  const full = { ...payload, nonce: randomUUID() };
  const encodedPayload = base64url(JSON.stringify(full));
  return `${encodedPayload}.${sign(secret, encodedPayload)}`;
};

export const verifyState = <T extends OauthStatePayload>(
  secret: string,
  token: string,
  maxAgeMs: number
): T | null => {
  const [encodedPayload, signature] = token.split(".");
  if (!(encodedPayload && signature)) {
    return null;
  }

  const expectedSignature = sign(secret, encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  let payload: T;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
  } catch {
    return null;
  }

  if (Date.now() - payload.issuedAt > maxAgeMs) {
    return null;
  }

  return payload;
};
