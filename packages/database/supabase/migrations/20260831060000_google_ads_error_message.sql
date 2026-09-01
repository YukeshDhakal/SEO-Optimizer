-- The OAuth callback and account-list actions previously swallowed the
-- real Google Ads API error (e.g. an unset/invalid developer-token header)
-- and only ever set status='error' with no detail anywhere — the UI could
-- only ever show a generic "the last connection attempt failed" banner,
-- indistinguishable from a genuine "this Google account has zero
-- accessible Ads accounts" outcome. This column lets the real reason
-- surface in the UI instead of requiring a live debugging session every
-- time this happens.
alter table google_ads_credentials
  add column error_message text;
