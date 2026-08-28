# @repo/google-ads

Google Ads API (Keyword Planner) integration — OAuth connect flow +
`generateKeywordHistoricalMetrics` for search-volume/competition data,
mirroring `@repo/search-console`'s shape for Google Search Console.

## Credentials (Quillrun Google Cloud project)

| Var | Source |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | reused from the Search Console setup — same GCP project |
| `GOOGLE_ADS_OAUTH_STATE_SECRET` | generate: `openssl rand -hex 32` (never reuse `GSC_OAUTH_STATE_SECRET`) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads manager (MCC) account → API Center → apply. Basic/Standard access review is not instant; Test Account tokens are instant but only return mock data. |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | the MCC account's customer id |
| `GOOGLE_ADS_DEFAULT_GEO_TARGET_CONSTANT` / `GOOGLE_ADS_DEFAULT_LANGUAGE_CONSTANT` | optional, defaults to US/English |

Also needed in the Quillrun GCP project: enable the "Google Ads API", and add
the `https://www.googleapis.com/auth/adwords` scope to the OAuth consent
screen (a sensitive scope — Google may require a review before non-test
users can complete consent).

## Real end-to-end smoke test (once credentials land)

1. Connect a real site via the app's "Connect Google Ads" button on the site
   detail page. Confirm `google_ads_credentials.status = 'connected'` and
   `google_ads_customer_id` is populated.
2. Trigger the sync manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<api-host>/cron/sync-keyword-research`
   (or wait for its daily schedule). Confirm rows appear in `keyword_research`.
3. Run a real pipeline for that site with a deliberately obscure/low-volume
   topic hint and confirm it actually blocks, with a `keyword_volume_check`
   row in `pipeline_run_steps` showing real (not mocked) data behind the
   decision.
4. For the package's own live unit tests (not the full pipeline), see the
   header comment in `__tests__/keyword-planner.live.test.ts` — run via
   `npm run -w @repo/google-ads test:live`.
