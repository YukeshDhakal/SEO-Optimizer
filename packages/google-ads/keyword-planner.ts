import { keys } from "./keys";
import type {
  GoogleAdsAccessibleCustomer,
  KeywordHistoricalMetric,
} from "./types";

// Raw REST, not the unofficial gRPC `google-ads-api` npm package — same
// dependency-light choice packages/search-console makes for the GSC API,
// and every Ads API service is fully available over REST too.
const API_BASE = "https://googleads.googleapis.com/v17";

const adsFetch = async <T>(
  accessToken: string,
  path: string,
  body?: unknown
): Promise<T> => {
  const { GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID } = keys();
  const response = await fetch(`${API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      ...(GOOGLE_ADS_LOGIN_CUSTOMER_ID
        ? { "login-customer-id": GOOGLE_ADS_LOGIN_CUSTOMER_ID }
        : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Google Ads API error (HTTP ${response.status}).`);
  }
  return (await response.json()) as T;
};

// Lists every Ads account the connected Google account can access — used
// right after the OAuth callback to auto-match/offer a picker, mirroring
// listSites() in packages/search-console.
export const listAccessibleCustomers = async (
  accessToken: string
): Promise<GoogleAdsAccessibleCustomer[]> => {
  const json = await adsFetch<{ resourceNames?: string[] }>(
    accessToken,
    "/customers:listAccessibleCustomers"
  );
  return (json.resourceNames ?? []).map((resourceName) => ({
    customerId: resourceName.replace("customers/", ""),
  }));
};

export interface GenerateKeywordHistoricalMetricsOptions {
  customerId: string;
  keywords: string[];
  geoTargetConstant?: string; // resource name, e.g. "geoTargetConstants/2840"
  languageConstant?: string; // resource name, e.g. "languageConstants/1000"
}

// Returns trailing ~12-month average search volume/competition for each
// keyword — a caller-specified date range isn't available on this endpoint,
// which is why keyword_research is a rolling cache, not a dated history.
export const generateKeywordHistoricalMetrics = async (
  accessToken: string,
  options: GenerateKeywordHistoricalMetricsOptions
): Promise<KeywordHistoricalMetric[]> => {
  const {
    GOOGLE_ADS_DEFAULT_GEO_TARGET_CONSTANT,
    GOOGLE_ADS_DEFAULT_LANGUAGE_CONSTANT,
  } = keys();

  const json = await adsFetch<{
    results?: {
      text: string;
      keywordMetrics?: {
        avgMonthlySearches?: string;
        competition?: string;
        competitionIndex?: string;
      };
    }[];
  }>(
    accessToken,
    `/customers/${options.customerId}:generateKeywordHistoricalMetrics`,
    {
      keywords: options.keywords,
      geoTargetConstants: [
        options.geoTargetConstant ??
          GOOGLE_ADS_DEFAULT_GEO_TARGET_CONSTANT ??
          "geoTargetConstants/2840", // US
      ],
      language:
        options.languageConstant ??
        GOOGLE_ADS_DEFAULT_LANGUAGE_CONSTANT ??
        "languageConstants/1000", // en
    }
  );

  return (json.results ?? []).map((result) => ({
    keyword: result.text,
    avgMonthlySearches: result.keywordMetrics?.avgMonthlySearches
      ? Number(result.keywordMetrics.avgMonthlySearches)
      : null,
    competition: result.keywordMetrics?.competition ?? null,
    competitionIndex: result.keywordMetrics?.competitionIndex
      ? Number(result.keywordMetrics.competitionIndex)
      : null,
  }));
};
