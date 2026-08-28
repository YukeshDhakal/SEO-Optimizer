import { signState as signStateShared, verifyState as verifyStateShared } from "@repo/security/oauth-state";
import { keys } from "./keys";
import type { GscStatePayload, GscTokens } from "./types";

const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GSC_OAUTH_STATE_SECRET } = keys();

// Read-only: the only scope this app needs is pulling Search Analytics data
// to ground topic selection — it never modifies anything in a customer's
// Search Console property.
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const requireClientCredentials = (): { clientId: string; clientSecret: string } => {
  if (!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET)) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured."
    );
  }
  return { clientId: GOOGLE_OAUTH_CLIENT_ID, clientSecret: GOOGLE_OAUTH_CLIENT_SECRET };
};

export const buildAuthorizeUrl = (params: { state: string; redirectUri: string }): string => {
  const { clientId } = requireClientCredentials();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  // offline + consent together are what guarantee Google actually returns a
  // refresh_token — without `prompt=consent`, a user who has already
  // authorized this app once (even for a different site_connection) gets
  // silently re-authenticated with no refresh_token in the response at all.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
};

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

const requestToken = async (body: Record<string, string>): Promise<GoogleTokenResponse> => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const json = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || json.error) {
    throw new Error(json.error_description ?? json.error ?? `Google token request failed (HTTP ${response.status}).`);
  }
  return json;
};

export const exchangeCodeForTokens = async (
  code: string,
  redirectUri: string
): Promise<GscTokens> => {
  const { clientId, clientSecret } = requireClientCredentials();
  const json = await requestToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  if (!json.refresh_token) {
    // Shouldn't happen given access_type=offline&prompt=consent above, but
    // a token without a refresh_token is useless to the cron sync job (it'll
    // just die in ~1hr) — fail loudly here rather than silently storing a
    // connection that quietly stops syncing tomorrow.
    throw new Error(
      "Google didn't return a refresh token. Try disconnecting and reconnecting Search Console."
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
};

export const refreshAccessToken = async (
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> => {
  const { clientId, clientSecret } = requireClientCredentials();
  const json = await requestToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
};

// --- OAuth `state` signing ------------------------------------------------
//
// Stateless CSRF protection: no server-side "pending connect request" table.
// The actual sign/verify logic lives in @repo/security/oauth-state (shared
// with packages/google-ads, which needs the identical scheme with its own
// secret) — this is just the GSC-specific wiring: which secret, what payload
// shape, how long a token stays valid.

const MAX_STATE_AGE_MS = 10 * 60 * 1000; // 10 minutes — long enough for a real consent-screen detour, short enough to bound replay risk

const requireStateSecret = (): string => {
  if (!GSC_OAUTH_STATE_SECRET) {
    throw new Error("GSC_OAUTH_STATE_SECRET is not configured.");
  }
  return GSC_OAUTH_STATE_SECRET;
};

export const signState = (payload: Omit<GscStatePayload, "nonce">): string =>
  signStateShared<GscStatePayload>(requireStateSecret(), payload);

export const verifyState = (token: string): GscStatePayload | null =>
  verifyStateShared<GscStatePayload>(requireStateSecret(), token, MAX_STATE_AGE_MS);
