import type { GscQueryRow, GscSiteSummary } from "./types";

const API_BASE = "https://www.googleapis.com/webmasters/v3";
// URL Inspection lives on the newer searchconsole.googleapis.com host, not
// the legacy webmasters/v3 one — googleFetch takes a full URL, so both
// bases coexist without touching the helper.
const INSPECTION_API_BASE = "https://searchconsole.googleapis.com/v1";

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
export const listSites = async (
  accessToken: string
): Promise<GscSiteSummary[]> => {
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
  endDate: string; // YYYY-MM-DD
  rowLimit: number;
  startDate: string; // YYYY-MM-DD
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
    rows?: {
      keys: string[];
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }[];
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

export interface UrlInspectionResult {
  coverageState: string | null;
  indexingState: string | null;
  inspectionResultLink: string | null;
  lastCrawlTime: string | null;
  pageFetchState: string | null;
  robotsTxtState: string | null;
  verdict: string;
}

// Google's own indexed view of a single URL — the authoritative answer to
// "is this published post actually in the index?", which no amount of
// searchAnalytics data can tell us (a page with zero impressions might be
// unindexed or merely unranked).
//
// Covered by the same `webmasters.readonly` scope already granted during the
// existing OAuth flow, so no consent changes are needed. Unlike
// queryTopQueries, both `siteUrl` and `inspectionUrl` go in the JSON body
// rather than the path, so there's nothing to URL-encode.
export const inspectUrl = async (
  accessToken: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<UrlInspectionResult> => {
  const json = await googleFetch<{
    inspectionResult?: {
      inspectionResultLink?: string;
      indexStatusResult?: {
        verdict?: string;
        coverageState?: string;
        robotsTxtState?: string;
        indexingState?: string;
        lastCrawlTime?: string;
        pageFetchState?: string;
      };
    };
  }>(`${INSPECTION_API_BASE}/urlInspection/index:inspect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });

  const result = json.inspectionResult?.indexStatusResult;

  // "VERDICT_UNSPECIFIED" rather than null for the verdict: it's Google's own
  // sentinel for "no verdict", and keeping the field non-nullable means
  // callers comparing against "PASS" never have to special-case absence.
  return {
    verdict: result?.verdict ?? "VERDICT_UNSPECIFIED",
    coverageState: result?.coverageState ?? null,
    indexingState: result?.indexingState ?? null,
    robotsTxtState: result?.robotsTxtState ?? null,
    pageFetchState: result?.pageFetchState ?? null,
    lastCrawlTime: result?.lastCrawlTime ?? null,
    inspectionResultLink: json.inspectionResult?.inspectionResultLink ?? null,
  };
};
