export interface GscTokens {
  accessToken: string;
  refreshToken: string;
  // Epoch milliseconds — when accessToken stops being usable. Stored
  // alongside the tokens (inside the same Vault secret) rather than derived,
  // since Google returns `expires_in` (a duration) not an absolute time.
  expiresAt: number;
  // Index signature so this is assignable to Supabase's `Json` type when
  // passed as `p_secret` to the set_search_console_credentials* RPCs — same
  // structural-typing convenience as cms-adapters' credential types.
  [key: string]: string | number;
}

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscStatePayload {
  siteConnectionId: string;
  nonce: string;
  issuedAt: number;
}

export interface GscSiteSummary {
  siteUrl: string;
  permissionLevel: string;
}
