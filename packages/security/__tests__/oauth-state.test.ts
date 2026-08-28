import { describe, expect, it } from "vitest";
import { signState, verifyState } from "../oauth-state";

interface TestPayload {
  siteConnectionId: string;
  issuedAt: number;
}

describe("signState / verifyState", () => {
  it("round-trips a valid, freshly-signed state", () => {
    const token = signState<TestPayload>("secret-1", {
      siteConnectionId: "site-1",
      issuedAt: Date.now(),
    });
    const payload = verifyState<TestPayload>("secret-1", token, 10 * 60 * 1000);

    expect(payload).not.toBeNull();
    expect(payload?.siteConnectionId).toBe("site-1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signState<TestPayload>("secret-1", {
      siteConnectionId: "site-1",
      issuedAt: Date.now(),
    });

    expect(
      verifyState<TestPayload>("secret-2", token, 10 * 60 * 1000)
    ).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signState<TestPayload>("secret-1", {
      siteConnectionId: "site-1",
      issuedAt: Date.now(),
    });
    const [, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        siteConnectionId: "site-2",
        nonce: "x",
        issuedAt: Date.now(),
      })
    ).toString("base64url");

    expect(
      verifyState<TestPayload>(
        "secret-1",
        `${tamperedPayload}.${signature}`,
        10 * 60 * 1000
      )
    ).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(
      verifyState<TestPayload>("secret-1", "not-a-valid-token", 10 * 60 * 1000)
    ).toBeNull();
  });

  it("rejects an expired state", () => {
    const token = signState<TestPayload>("secret-1", {
      siteConnectionId: "site-1",
      issuedAt: Date.now() - 11 * 60 * 1000, // 11 minutes ago, past a 10-minute window
    });

    expect(
      verifyState<TestPayload>("secret-1", token, 10 * 60 * 1000)
    ).toBeNull();
  });
});
