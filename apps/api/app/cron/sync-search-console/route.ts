import { database } from "@repo/database";
import { queryTopQueries, refreshAccessToken } from "@repo/search-console";
import type { GscTokens } from "@repo/search-console";
import { env } from "@/env";

// Same gating posture as dispatch-runs's isAuthorized — see that route's
// comment for why "not configured yet" defaults to allowing the request
// rather than blocking it.
const isAuthorized = (request: Request): boolean => {
  if (!env.CRON_SECRET) {
    return true;
  }
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
};

const SYNC_WINDOW_DAYS = 28; // GSC's own data lags ~2-3 days regardless, so a daily sync of the trailing 28 days is plenty fresh
const ROW_LIMIT = 250;

const dateDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface ConnectedRow {
  site_connection_id: string;
  gsc_site_url: string | null;
}

// Pulls the latest top-queries snapshot for every connected GSC property
// and replaces packages/database's `search_console_queries` cache with it —
// one site's failure (revoked refresh token, API hiccup) doesn't stop the
// rest, same per-row isolation as dispatch-runs' schedule loop.
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: connected, error } = await database
    .from("search_console_credentials")
    .select("site_connection_id, gsc_site_url")
    .eq("status", "connected")
    .returns<ConnectedRow[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ siteConnectionId: string; action: string }> = [];
  const startDate = dateDaysAgo(SYNC_WINDOW_DAYS);
  const endDate = dateDaysAgo(0);

  for (const row of connected ?? []) {
    const { site_connection_id: siteConnectionId, gsc_site_url: gscSiteUrl } = row;

    if (!gscSiteUrl) {
      // status='connected' with no property chosen shouldn't happen (the
      // callback route only sets status='connected' once it also sets
      // gsc_site_url), but skip defensively rather than throw.
      results.push({ siteConnectionId, action: "skipped:no_property" });
      continue;
    }

    try {
      const { data: secret } = await database.rpc("get_search_console_credentials_for_sync", {
        p_site_connection_id: siteConnectionId,
      });
      if (!secret) {
        results.push({ siteConnectionId, action: "skipped:no_credentials" });
        continue;
      }

      const tokens = secret as unknown as GscTokens;
      let accessToken = tokens.accessToken;

      if (Date.now() >= tokens.expiresAt) {
        const refreshed = await refreshAccessToken(tokens.refreshToken);
        accessToken = refreshed.accessToken;
        await database.rpc("set_search_console_credentials_for_sync", {
          p_site_connection_id: siteConnectionId,
          p_secret: { ...tokens, accessToken, expiresAt: refreshed.expiresAt },
        });
      }

      const rows = await queryTopQueries(accessToken, gscSiteUrl, {
        startDate,
        endDate,
        rowLimit: ROW_LIMIT,
      });

      await database.from("search_console_queries").delete().eq("site_connection_id", siteConnectionId);
      if (rows.length > 0) {
        await database.from("search_console_queries").insert(
          rows.map((queryRow) => ({
            site_connection_id: siteConnectionId,
            query: queryRow.query,
            clicks: queryRow.clicks,
            impressions: queryRow.impressions,
            ctr: queryRow.ctr,
            position: queryRow.position,
            period_start: startDate,
            period_end: endDate,
          }))
        );
      }

      results.push({ siteConnectionId, action: "synced" });
    } catch (syncError) {
      // Revoked refresh token, transient Google API failure, etc. — mark
      // this connection 'error' (surfaces in the site's UI) and keep going;
      // one bad connection shouldn't abort the sweep for everyone else.
      await database
        .from("search_console_credentials")
        .update({ status: "error" })
        .eq("site_connection_id", siteConnectionId);
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      results.push({ siteConnectionId, action: `error:${message}` });
    }
  }

  return Response.json({ checked: connected?.length ?? 0, results });
};
