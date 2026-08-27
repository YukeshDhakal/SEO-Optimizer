import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id-1";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret-1";
process.env.GSC_OAUTH_STATE_SECRET = "state-secret-1";

const {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  signState,
  verifyState,
} = await import("../oauth");

describe("buildAuthorizeUrl", () => {
  it("includes the read-only scope, offline access, and forced consent", () => {
    const url = new URL(
      buildAuthorizeUrl({ state: "abc", redirectUri: "https://app.example.com/callback" })
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id-1");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/callback");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/webmasters.readonly"
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("abc");
  });
});

describe("token exchange/refresh", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exchangeCodeForTokens posts a grant_type=authorization_code request and computes expiresAt", async () => {
    const before = Date.now();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
        }),
        { status: 200 }
      )
    );

    const tokens = await exchangeCodeForTokens("code-1", "https://app.example.com/callback");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("client_id")).toBe("client-id-1");

    expect(tokens.accessToken).toBe("access-1");
    expect(tokens.refreshToken).toBe("refresh-1");
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
  });

  it("exchangeCodeForTokens throws when Google doesn't return a refresh_token", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "access-1", expires_in: 3600 }), {
        status: 200,
      })
    );

    await expect(
      exchangeCodeForTokens("code-1", "https://app.example.com/callback")
    ).rejects.toThrow(/refresh token/i);
  });

  it("exchangeCodeForTokens throws with Google's error_description on failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "Bad code" }),
        { status: 400 }
      )
    );

    await expect(
      exchangeCodeForTokens("bad-code", "https://app.example.com/callback")
    ).rejects.toThrow("Bad code");
  });

  it("refreshAccessToken posts a grant_type=refresh_token request", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "access-2", expires_in: 3600 }),
        { status: 200 }
      )
    );

    const result = await refreshAccessToken("refresh-1");

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-1");
    expect(result.accessToken).toBe("access-2");
  });
});

describe("signState / verifyState", () => {
  it("round-trips a valid, freshly-signed state", () => {
    const token = signState({ siteConnectionId: "site-1", issuedAt: Date.now() });
    const payload = verifyState(token);

    expect(payload).not.toBeNull();
    expect(payload?.siteConnectionId).toBe("site-1");
  });

  it("rejects a tampered payload", () => {
    const token = signState({ siteConnectionId: "site-1", issuedAt: Date.now() });
    const [encodedPayload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ siteConnectionId: "site-2", nonce: "x", issuedAt: Date.now() })
    ).toString("base64url");

    expect(verifyState(`${tamperedPayload}.${signature}`)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyState("not-a-valid-token")).toBeNull();
  });

  it("rejects an expired state", () => {
    const token = signState({
      siteConnectionId: "site-1",
      issuedAt: Date.now() - 11 * 60 * 1000, // 11 minutes ago, past the 10-minute window
    });

    expect(verifyState(token)).toBeNull();
  });
});
