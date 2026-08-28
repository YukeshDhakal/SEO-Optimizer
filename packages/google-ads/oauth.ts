import {
  signState as signStateShared,
  verifyState as verifyStateShared,
} from "@repo/security/oauth-state";
import { keys } from "./keys";
import type { GoogleAdsStatePayload, GoogleAdsTokens } from "./types";

const {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_ADS_OAUTH_STATE_SECRET,
} = keys();

// Google Ads has no narrower read-only scope than full `adwords` — Keyword
// Plan Idea Service reads still require it.
const SCOPE = "https://www.googleapis.com/auth/adwords";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_STATE_AGE_MS = 10 * 60 * 1000; // 10 minutes, same window as Search Console's

const requireClientCredentials = (): {
  clientId: string;
  clientSecret: string;
} => {
  if (!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET)) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured."
    );
  }
  return {
    clientId: GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
  };
};

const requireStateSecret = (): string => {
  if (!GOOGLE_ADS_OAUTH_STATE_SECRET) {
    throw new Error("GOOGLE_ADS_OAUTH_STATE_SECRET is not configured.");
  }
  return GOOGLE_ADS_OAUTH_STATE_SECRET;
};

export const buildAuthorizeUrl = (params: {
  state: string;
  redirectUri: string;
}): string => {
  const { clientId } = requireClientCredentials();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  // offline + consent together guarantee a refresh_token comes back — see
  // search-console/oauth.ts's identical comment for why.
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

const requestToken = async (
  body: Record<string, string>
): Promise<GoogleTokenResponse> => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const json = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || json.error) {
    throw new Error(
      json.error_description ??
        json.error ??
        `Google token request failed (HTTP ${response.status}).`
    );
  }
  return json;
};

export const exchangeCodeForTokens = async (
  code: string,
  redirectUri: string
): Promise<GoogleAdsTokens> => {
  const { clientId, clientSecret } = requireClientCredentials();
  const json = await requestToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  if (!json.refresh_token) {
    throw new Error(
      "Google didn't return a refresh token. Try disconnecting and reconnecting Google Ads."
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

export const signState = (
  payload: Omit<GoogleAdsStatePayload, "nonce">
): string =>
  signStateShared<GoogleAdsStatePayload>(requireStateSecret(), payload);

export const verifyState = (token: string): GoogleAdsStatePayload | null =>
  verifyStateShared<GoogleAdsStatePayload>(
    requireStateSecret(),
    token,
    MAX_STATE_AGE_MS
  );
