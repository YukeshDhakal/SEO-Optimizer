// Phase 10: per-tenant API keys for the customer-facing MCP gateway
// (`apps/api/app/mcp`). Pure functions over Node's built-in `crypto` — no I/O,
// no new dependency, and directly unit-testable, same posture as
// `recommendation-engine.ts`.
//
// Lives in `@repo/workflows` rather than in `apps/api` because both sides of
// the key's life need it and they are different deployments: `apps/app`
// generates a key in a server action, `apps/api` hashes the presented key on
// every gateway request. They must agree exactly on the algorithm or every key
// ever issued stops authenticating, so there is one copy.
import { createHash, randomBytes } from "node:crypto";

// `qr_live_` rather than a bare random string so a leaked key is greppable in
// logs and recognisable in a support ticket (the Stripe/GitHub convention),
// and so a future `qr_test_` sandbox tier needs no schema change — only a new
// literal here and a branch at the gateway.
const KEY_PREFIX = "qr_live_";

// 16 bytes = 128 bits of entropy, hex-encoded to 32 characters. Well past
// guessing range, and hex keeps the whole key double-click-selectable and safe
// to paste into a JSON config file without escaping.
const RANDOM_BYTES = 16;

// What the dashboard stores and displays to identify a key in a list. Twelve
// characters is the `qr_live_` marker plus the first four random characters —
// enough for a human to tell two of their own keys apart, far too little to
// help anyone brute-force the remaining 112 bits.
const DISPLAY_PREFIX_LENGTH = 12;

// The full plaintext key's length, used by `isApiKeyShape` below.
const KEY_LENGTH = KEY_PREFIX.length + RANDOM_BYTES * 2;

// Hoisted rather than inline in `isApiKeyShape`: that function runs on every
// single gateway request, and re-compiling a literal each time is waste in the
// hot path.
const HEX_ONLY = /^[0-9a-f]+$/;

export interface GeneratedApiKey {
  /** sha-256 hex digest of the plaintext — this is what `api_keys.key_hash` holds. */
  hash: string;
  /** The secret, shown to the user exactly once and never stored. */
  plaintext: string;
  /** First 12 characters of the plaintext — safe to store and display. */
  prefix: string;
}

// sha-256 and not bcrypt/argon2 deliberately. Those exist to make *low-entropy*
// secrets (human-chosen passwords) expensive to brute-force. A key from
// `generateApiKey` has 128 bits of uniform entropy, so there is no dictionary
// to run and nothing for a work factor to buy — while the cost would be paid on
// every single MCP request, on a serverless function, in the hot path. A plain
// digest over a high-entropy secret is the right tool and the one Stripe/GitHub
// use for the same reason.
export const hashApiKey = (plaintext: string): string =>
  createHash("sha256").update(plaintext).digest("hex");

export const generateApiKey = (): GeneratedApiKey => {
  const plaintext = `${KEY_PREFIX}${randomBytes(RANDOM_BYTES).toString("hex")}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
    hash: hashApiKey(plaintext),
  };
};

// Cheap structural check the gateway runs before touching the database, so a
// malformed or obviously-bogus Authorization header costs no query at all. It
// is a filter, never an authorization decision — a string can pass this and
// still not exist in `api_keys`.
export const isApiKeyShape = (value: string): boolean =>
  value.length === KEY_LENGTH &&
  value.startsWith(KEY_PREFIX) &&
  HEX_ONLY.test(value.slice(KEY_PREFIX.length));
