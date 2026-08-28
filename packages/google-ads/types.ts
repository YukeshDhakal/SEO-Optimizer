export interface GoogleAdsTokens {
  accessToken: string;
  refreshToken: string;
  // Epoch milliseconds — mirrors GscTokens' shape and rationale exactly.
  expiresAt: number;
  // Index signature so this is assignable to Supabase's `Json` type when
  // passed as `p_secret` to the set_google_ads_credentials* RPCs.
  [key: string]: string | number;
}

export interface GoogleAdsStatePayload {
  siteConnectionId: string;
  nonce: string;
  issuedAt: number;
}

export interface GoogleAdsAccessibleCustomer {
  // Bare digits — Google's `customers/1234567890` resource-name prefix is
  // stripped before this reaches callers, same spirit as GscSiteSummary
  // exposing a plain siteUrl rather than a raw API resource shape.
  customerId: string;
}

export interface KeywordHistoricalMetric {
  keyword: string;
  avgMonthlySearches: number | null;
  // Google Ads enum: "UNSPECIFIED" | "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH".
  competition: string | null;
  // Google's 0-100 numeric competition index.
  competitionIndex: number | null;
}
