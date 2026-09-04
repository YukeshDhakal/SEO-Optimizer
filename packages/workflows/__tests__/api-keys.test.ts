import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, isApiKeyShape } from "../api-keys";

// Phase 10: these three functions are the whole trust boundary of the
// customer-facing MCP gateway. A key that is shorter than advertised, a prefix
// that leaks too much of the secret, or a hash that isn't reproducible would
// each be a silent security failure rather than a visible bug — nothing else
// in the system would notice.

// Written out independently of the implementation's own constants: if someone
// changes the key format, these have to be updated deliberately rather than
// following along silently.
const KEY_FORMAT = /^qr_live_[0-9a-f]{32}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("generateApiKey", () => {
  it("returns a qr_live_ key of exactly 40 characters", () => {
    const { plaintext } = generateApiKey();

    expect(plaintext).toMatch(KEY_FORMAT);
    expect(plaintext).toHaveLength(40);
  });

  it("exposes only the first 12 characters as the stored prefix", () => {
    const { plaintext, prefix } = generateApiKey();

    expect(prefix).toHaveLength(12);
    expect(prefix).toBe(plaintext.slice(0, 12));
    // The prefix is stored in the clear and rendered in the dashboard, so it
    // must never be enough to reconstruct the key.
    expect(plaintext.startsWith(prefix)).toBe(true);
    expect(prefix).not.toBe(plaintext);
  });

  it("returns the sha-256 digest of its own plaintext as the hash", () => {
    const { plaintext, hash } = generateApiKey();

    expect(hash).toBe(hashApiKey(plaintext));
    expect(hash).toMatch(SHA256_HEX);
    // The hash is what lands in the database; the secret must not.
    expect(hash).not.toContain(plaintext);
  });

  it("never repeats a key across many generations", () => {
    const keys = new Set<string>();
    const hashes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const { plaintext, hash } = generateApiKey();
      keys.add(plaintext);
      hashes.add(hash);
    }

    // A collision here would mean either a broken RNG or a truncated key —
    // and `idx_api_keys_key_hash` is unique, so it would surface as a failed
    // insert for a customer rather than anything diagnosable.
    expect(keys.size).toBe(1000);
    expect(hashes.size).toBe(1000);
  });
});

describe("hashApiKey", () => {
  it("is deterministic for the same input", () => {
    const { plaintext } = generateApiKey();

    expect(hashApiKey(plaintext)).toBe(hashApiKey(plaintext));
  });

  it("matches the known sha-256 digest of a fixed key", () => {
    // Pinned against an independently-computed digest: if the algorithm ever
    // changes, every key already issued to a customer stops authenticating,
    // and this is the test that has to fail first.
    expect(hashApiKey("qr_live_00000000000000000000000000000000")).toBe(
      "79f8159a8ea8b90691a6c1ee306d111c60fabc8ccfe5fc1a19461608281fdf1c"
    );
  });

  it("produces a completely different digest for a one-character change", () => {
    const a = hashApiKey("qr_live_00000000000000000000000000000000");
    const b = hashApiKey("qr_live_00000000000000000000000000000001");

    expect(a).not.toBe(b);
  });
});

describe("isApiKeyShape", () => {
  it("accepts a freshly generated key", () => {
    expect(isApiKeyShape(generateApiKey().plaintext)).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["a bare random string", "not-a-key"],
    ["the right shape with the wrong prefix", `qr_test_${"a".repeat(32)}`],
    ["a key that is one character short", `qr_live_${"a".repeat(31)}`],
    ["a key that is one character long", `qr_live_${"a".repeat(33)}`],
    ["non-hex characters in the random part", `qr_live_${"z".repeat(32)}`],
    [
      "uppercase hex, which this generator never emits",
      `qr_live_${"A".repeat(32)}`,
    ],
    ["the prefix alone", "qr_live_"],
  ])("rejects %s", (_label, value) => {
    expect(isApiKeyShape(value)).toBe(false);
  });
});
