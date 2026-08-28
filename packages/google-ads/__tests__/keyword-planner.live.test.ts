// Live/sandbox test — hits the real Google Ads API. Not part of `turbo test`
// or the default `vitest run` for this package (see vitest.config.mts's
// exclude + the separate vitest.live.config.mts). Run explicitly once real
// credentials exist:
//
//   GOOGLE_ADS_DEVELOPER_TOKEN=... \
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID=... \
//   GOOGLE_ADS_LIVE_CUSTOMER_ID=...  \
//   GOOGLE_ADS_LIVE_ACCESS_TOKEN=... \
//     npm run -w @repo/google-ads test:live
//
// GOOGLE_ADS_LIVE_ACCESS_TOKEN is a short-lived OAuth access token for an
// account that has already completed the connect flow (grab one via the
// app's "Connect Google Ads" UI, or `refreshAccessToken` against a stored
// refresh token) — this suite doesn't exercise the OAuth dance itself, only
// the API calls, since oauth.test.ts already covers the former with mocks.
//
// This is a new pattern for this repo (no other package has a `*.live.test`
// convention yet) — introduced here deliberately, not a continuation of an
// existing one.
import { describe, expect, it } from "vitest";
import {
  generateKeywordHistoricalMetrics,
  listAccessibleCustomers,
} from "../keyword-planner";

const accessToken = process.env.GOOGLE_ADS_LIVE_ACCESS_TOKEN;
const customerId = process.env.GOOGLE_ADS_LIVE_CUSTOMER_ID;

describe.skipIf(!(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && accessToken))(
  "google-ads live smoke test",
  () => {
    it("lists at least one real accessible customer", async () => {
      const customers = await listAccessibleCustomers(accessToken as string);
      expect(customers.length).toBeGreaterThan(0);
    });

    it("returns real historical metrics for a common keyword", async () => {
      const metrics = await generateKeywordHistoricalMetrics(
        accessToken as string,
        {
          customerId: customerId as string,
          keywords: ["coffee"],
        }
      );
      expect(metrics.length).toBeGreaterThan(0);
      // A real (non-Test-Account) developer token returns a real number
      // here — Test Account tokens return mock/zeroed data, which is the
      // one thing this assertion can't tell apart from a misconfiguration,
      // so treat a persistent `null`/0 here as a signal to double check
      // which access tier the developer token actually has.
      expect(metrics[0].avgMonthlySearches).not.toBeNull();
    });
  }
);
