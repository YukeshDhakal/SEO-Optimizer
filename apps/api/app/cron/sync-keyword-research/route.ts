import { database } from "@repo/database";
import {
  generateKeywordHistoricalMetrics,
  refreshAccessToken,
} from "@repo/google-ads";
import type { GoogleAdsTokens } from "@repo/google-ads";
import { env } from "@/env";

// Same gating posture as dispatch-runs's/sync-search-console's isAuthorized.
const isAuthorized = (request: Request): boolean => {
  if (!env.CRON_SECRET) {
    return true;
  }
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
};

const KEYWORD_UNIVERSE_LIMIT = 20;

interface ConnectedRow {
  site_connection_id: string;
  google_ads_customer_id: string | null;
}

// Runs 30 minutes after sync-search-console (see apps/api/vercel.json's cron
// schedule) on purpose: the keyword universe for each site is that site's
// own top GSC queries — real terms it already ranks for — rather than a
// fresh discovery search, so that day's GSC sync must already be done.
//
// Pulls the latest search-volume/competition snapshot for every connected
// Google Ads account and replaces packages/database's `keyword_research`
// cache with it — one site's failure doesn't stop the rest, same per-row
// isolation as sync-search-console.
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: connected, error } = await database
    .from("google_ads_credentials")
    .select("site_connection_id, google_ads_customer_id")
    .eq("status", "connected")
    .returns<ConnectedRow[]>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ siteConnectionId: string; action: string }> = [];

  for (const row of connected ?? []) {
    const {
      site_connection_id: siteConnectionId,
      google_ads_customer_id: customerId,
    } = row;

    if (!customerId) {
      // status='connected' with no account chosen shouldn't happen (the
      // callback route only sets status='connected' once it also sets
      // google_ads_customer_id), but skip defensively rather than throw.
      results.push({ siteConnectionId, action: "skipped:no_account" });
      continue;
    }

    try {
      const { data: gscQueries } = await database
        .from("search_console_queries")
        .select("query")
        .eq("site_connection_id", siteConnectionId)
        .order("clicks", { ascending: false })
        .limit(KEYWORD_UNIVERSE_LIMIT);

      if (!gscQueries || gscQueries.length === 0) {
        results.push({ siteConnectionId, action: "skipped:no_gsc_queries" });
        continue;
      }

      const { data: secret } = await database.rpc(
        "get_google_ads_credentials_for_sync",
        {
          p_site_connection_id: siteConnectionId,
        }
      );
      if (!secret) {
        results.push({ siteConnectionId, action: "skipped:no_credentials" });
        continue;
      }

      const tokens = secret as unknown as GoogleAdsTokens;
      let accessToken = tokens.accessToken;

      if (Date.now() >= tokens.expiresAt) {
        const refreshed = await refreshAccessToken(tokens.refreshToken);
        accessToken = refreshed.accessToken;
        await database.rpc("set_google_ads_credentials_for_sync", {
          p_site_connection_id: siteConnectionId,
          p_secret: { ...tokens, accessToken, expiresAt: refreshed.expiresAt },
        });
      }

      const metrics = await generateKeywordHistoricalMetrics(accessToken, {
        customerId,
        keywords: gscQueries.map((queryRow) => queryRow.query),
      });

      await database
        .from("keyword_research")
        .delete()
        .eq("site_connection_id", siteConnectionId);
      if (metrics.length > 0) {
        await database.from("keyword_research").insert(
          metrics.map((metric) => ({
            site_connection_id: siteConnectionId,
            keyword: metric.keyword,
            avg_monthly_searches: metric.avgMonthlySearches,
            competition: metric.competition,
            competition_index: metric.competitionIndex,
          }))
        );
      }

      results.push({ siteConnectionId, action: "synced" });
    } catch (syncError) {
      // Revoked refresh token, transient Google Ads API failure, etc. — mark
      // this connection 'error' (surfaces in the site's UI) and keep going;
      // one bad connection shouldn't abort the sweep for everyone else.
      await database
        .from("google_ads_credentials")
        .update({ status: "error" })
        .eq("site_connection_id", siteConnectionId);
      const message =
        syncError instanceof Error ? syncError.message : String(syncError);
      results.push({ siteConnectionId, action: `error:${message}` });
    }
  }

  return Response.json({ checked: connected?.length ?? 0, results });
};
