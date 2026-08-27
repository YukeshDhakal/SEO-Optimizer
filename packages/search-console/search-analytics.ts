import type { GscQueryRow, GscSiteSummary } from "./types";

const API_BASE = "https://www.googleapis.com/webmasters/v3";

const googleFetch = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { ...init?.headers, "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Search Console API error (HTTP ${response.status}).`);
  }

  return (await response.json()) as T;
};

// Lists every property the connected Google account can verify — used both
// right after the OAuth callback (to auto-match/offer a picker) and never
// persisted beyond that moment; the chosen property's URL is what actually
// gets stored (`search_console_credentials.gsc_site_url`).
export const listSites = async (accessToken: string): Promise<GscSiteSummary[]> => {
  const json = await googleFetch<{
    siteEntry?: { siteUrl: string; permissionLevel: string }[];
  }>(`${API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return (json.siteEntry ?? []).map((entry) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
  }));
};

export interface QueryTopQueriesOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  rowLimit: number;
}

// `siteUrl` must be URL-encoded in the path per Search Console API docs
// (it's a full URL or "sc-domain:example.com", either way containing
// characters that need escaping).
export const queryTopQueries = async (
  accessToken: string,
  siteUrl: string,
  options: QueryTopQueriesOptions
): Promise<GscQueryRow[]> => {
  const json = await googleFetch<{
    rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
  }>(`${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      startDate: options.startDate,
      endDate: options.endDate,
      dimensions: ["query"],
      rowLimit: options.rowLimit,
    }),
  });

  return (json.rows ?? []).map((row) => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
};
