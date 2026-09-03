# Quillrun — Product & Engineering Context

Status snapshot as of 2026-08-29. This file exists so any future session (human or agent) can pick up this project cold. Update it as phases land — don't let it drift.

See also `PROCESS_ARCHITECTURE.md` — the runtime companion to this file: process flows, control points, and failure modes, rather than what's built. See also `ROUTING_SPEC.md` — every navigation decision across `apps/web`/`apps/app`: entry gates, post-action destinations, OAuth round trips, and known routing gaps.

## 1. What Quillrun is

Quillrun is a multi-tenant SaaS: an autonomous SEO/GEO content agent that researches, writes, and auto-publishes blog content to a customer's own CMS (WordPress, Webflow, Shopify, or a hosted blog we provide), with almost no manual work.

**Who uses it**: small business owners and marketing-ops people at agencies, managing content for one or several client sites. They're trusting an AI to write and publish under their brand with no review step by default. The product's central design problem is making that trust legible — what the agent is about to do, what it just did, why a piece of content passed or failed quality gates, and a clear, always-visible way to stop it. Think operations/monitoring dashboard (Vercel, Linear, a CI pipeline view), not a marketing site — calm, information-dense, never decorative.

**GEO** = Generative Engine Optimization — optimizing content to be cited/surfaced by AI answer engines (ChatGPT, Perplexity, AI Overviews), not just ranked by classic search. This sits alongside traditional SEO as a quality gate in the generation pipeline.

## 2. Repo & deployment topology

- **Local path**: `C:\Users\acer\Documents\seo-geo-agent`
- **GitHub**: `YukeshDhakal/SEO-Optimizer` (public), branch `master`
- **Base template**: [next-forge](https://github.com/vercel/next-forge) v6 — Next.js + Turborepo monorepo, npm workspaces
- **Vercel team**: `ukeshdhakal11-9217's projects` (hobby plan), 3 linked projects, all tracking `master`:
  - `quillrun-app` (prj_ac000ZNtbOu0BKdfAEeCmhdjMYpA) → `apps/app`, the main dashboard product
  - `quillrun-web` (prj_Js7q7jCm3zeWSSSKHaGu1mVhDzKV) → `apps/web`, marketing site + public tenant blog rewrite
  - `quillrun-api` (prj_zbRDysgqfdbMuWgp4z1UpXvjGNdL) → `apps/api`, cron dispatcher + webhooks
- **Custom domains** (added 2026-08-29): `quillrun.dev` → `quillrun-web`, `app.quillrun.dev` → `quillrun-app`, both properly attached as project domains (auto-track `master` pushes, not manual aliases). `quillrun-api` has no public domain — it's cron/webhooks only, never meant to be visited directly.
- **Database/Auth**: Supabase project `acyauqpeykgrivrajksa` ("YukeshDhakal's Org")
- **Lovable design project**: "Content Autopilot" (workspace `dd60d9b2a04383a7c40a`) — pure UI/UX exploration with mock data, used to pull the "Quillrun Dashboard" visual design (cream/teal palette, IBM Plex fonts, 6-state status pills) back into this production app on 2026-08-28. Not wired to real backend; kept as a design reference only.

### ✅ Deploy status — all three live as of 2026-08-29
First successful production deploy achieved for all three projects. What it took, in order:

1. **Missing required env vars** — `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_WEB_URL` are the only two env vars actually required at build time (everything else in this codebase is `.optional()` by design, see §5). Added those plus the non-secret Supabase public config (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`) to all three Vercel projects via `vercel env add`, pointed at each project's assigned `*.vercel.app` domain.
2. **Hobby-plan cron cadence** — `apps/api/vercel.json`'s `/cron/dispatch-runs` was `*/5 * * * *`, which fails at deploy time on the Hobby plan (daily cron only). Collapsed to `0 2 * * *` as a stopgap (see `PROCESS_ARCHITECTURE.md` §8 for the tradeoff and how to revisit it).
3. **No framework detected** — `quillrun-app`/`quillrun-api` had `framework: null` on Vercel (monorepo auto-detection gap), so the deploy step looked for a static `public/` output instead of the real Next.js build output. Fixed by adding `"framework": "nextjs"` explicitly to each app's `vercel.json`.
4. **BaseHub schema mismatch, twice, then dropped entirely** — first attempt: a blank BaseHub account has no `_slug`/`_title` fields, needed their official next-forge blueprint forked instead. Second attempt (2026-08-31), after a fresh token: fetched the live schema directly (`basehub build` locally with the real token) and confirmed the connected repo had **zero** `PostsItem`/`LegalPagesItem` types at all — `_agent`/`_agents` root fields instead, an entirely different content model, not a field-level mismatch. Since `packages/cms`'s build script ran `basehub build` on every Vercel deploy (re-fetching and overwriting `basehub-types.d.ts` from whatever the live repo currently has), this was never a one-time fix — it would keep breaking for as long as the token pointed at a mismatched repo. Per user direction ("take over and rebuild what you require"), dropped the live-schema dependency entirely (commit `5907045`): `packages/cms/index.ts` no longer uses `fragmentOn`/`basehub.query`, `legal` content is hardcoded real copy in `apps/web/lib/legal-content.ts` (ported verbatim from the design handoff), `blog` degrades to always-empty pending a real content backend, and the `build` script no longer calls `basehub build` at all.
5. **Vercel's monorepo "skip unaffected projects"** — an env-var-only change or an empty commit doesn't register as a file change for a given app's dependency graph, so Vercel silently skips rebuilding it (`readyState: CANCELED`, `errorLink` points at `vercel.com/docs/monorepos#skipping-unaffected-projects`). Whenever only an env var changed, force a rebuild with a trivial real file touch (this repo's own precedent, see commit `397e3a9`) rather than an empty commit.

6. **A CLI-direct deploy (bypassing git) briefly produced a red herring**: a manual `vercel deploy --prod` from an uncommitted working tree failed with "registers no queue consumer" for Workflow DevKit's `.well-known/workflow/v1/*` routes. This looked like a platform-level Vercel Queues gate, but wasn't — the same code deployed cleanly through the normal git-linked pipeline once pushed. The *actual* blocker on that push was a real test regression: `apps/app/__tests__/sign-in.test.tsx`/`sign-up.test.tsx` broke when those pages became async Server Components (added a `currentUser()` inverse-guard check) — RTL's `render()` can't invoke an async component directly, and `@repo/auth/server`'s `import "server-only"` sentinel throws when hit from a test. Fixed by mocking `currentUser` and calling `await Page(...)` before `render()` (commit `51539ff`). Lesson: always push through git and watch the real deploy, not a CLI shortcut — this repo has no local CI, so `turbo run test` failures only surface at deploy time.
7. **`app.quillrun.dev` needed a real project-domain attachment**, not just `vercel alias set` to one deployment — the latter doesn't track future pushes. Fixed via `vercel domains add app.quillrun.dev quillrun-app` once `quillrun-app` had a clean deploy to attach to.
8. **Pre-existing `DYNAMIC_SERVER_USAGE` production crash on legal/blog pages** (commit `8f85253`) — `legal/[slug]` and `blog/[slug]` were the only two `apps/web` routes using `generateStaticParams` (SSG); every other route, including their own `[locale]` parent, renders dynamically. Mixing static generation into an otherwise fully-dynamic `[locale]`-nested tree threw in production (confirmed via `get_runtime_errors`, first seen 2026-08-30 — predates the BaseHub work, was just masked by the build never succeeding until now). Dropped `generateStaticParams` from both; content is static either way, dynamic per-request rendering costs nothing meaningful here.
9. **Shared page-metadata defaults still said next-forge/Vercel** (commit `3ccd1b2`) — `@repo/seo/metadata.ts`'s `createMetadata()` (used site-wide) had `applicationName = "next-forge"`, author/publisher `"Vercel"`. Every page `<title>` was suffixed `| next-forge`. Rebranded to Quillrun.

**Still open**: `SUPABASE_SERVICE_ROLE_KEY` is not set on Vercel — no tool can read it back out of the Supabase dashboard, so paste it in manually (Project Settings → API) before database writes will work in production. `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are also still unset (see §4's Stripe fixes commit `24eff3f` for what's ready once they are — restricted key preferred, mark Sensitive on Vercel). Several open Dependabot PRs (react/@types/react, concurrently, sharp bumps) are still sitting untriaged against `master`. Blog has no real content backend (degrades to empty by design — see item 4). Real Terms/Privacy/AUP text is live but per the design handoff's own note, needs a lawyer's review before real launch.

## 3. Architecture

```
apps/
  app/          main tenant dashboard (sign-in, onboarding, sites, generate, runs, posts, schedule, settings, billing)
  web/          marketing site + public tenant-blog rewrite (org-slug.{ROOT_DOMAIN}/blog/{slug})
  api/          cron dispatcher (/cron/dispatch-runs), Stripe/webhook receivers, JWT verification
  docs/         Mintlify docs (untouched from next-forge scaffold)
  email/        React Email templates (untouched from next-forge scaffold)
  storybook/    component dev environment (untouched)

packages/
  ai-engine/         the generation pipeline: topic_selection → research → outline → draft →
                      geo_seo_optimize → policy_check, on Vercel AI SDK + Anthropic
  workflows/          Workflow DevKit orchestration wrapping ai-engine in durable "use step" functions
  cms-adapters/       CmsAdapter interface + registry; hosted-blog, WordPress, Webflow, Shopify
  search-console/     Google Search Console OAuth2 + Search Analytics client
  google-ads/         Google Ads Keyword Planner OAuth2 + volume lookups
  security/           shared OAuth state-signing helper (used by search-console + google-ads)
  database/           Supabase client (service-role) + generated types + all SQL migrations
  auth/               @supabase/ssr wrapper (browser/server clients, useAuth hook, session-refresh proxy)
  design-system/      shared UI components (shadcn-based), Quillrun brand tokens
  payments/           Stripe (next-forge default, wired up in Phase 6)
  webhooks/           Svix (next-forge default)
  observability, feature-flags, notifications, storage, rate-limit, cms, ai,
  analytics, collaboration, internationalization, next-config, typescript-config
                      — next-forge defaults, mostly unconfigured/optional (see §5)
```

**Stack swaps from stock next-forge** (Phase 0): Clerk → Supabase Auth; Prisma+Neon → Supabase Postgres. Reason recorded in commit `a3f0311`: avoid a second paid auth vendor and keep DB+auth on one platform already in use elsewhere (quoteengine.dev).

## 4. Build history — phase by phase

Each phase is one commit on `master` (chronological, oldest first). This is the authoritative "what's been done":

| Phase | Commit | What shipped |
|---|---|---|
| 0 | `d3d351e`, `a3f0311` | next-forge scaffold; swapped Clerk→Supabase Auth, Prisma/Neon→Supabase DB. New Supabase project provisioned. |
| 1 | `8369677` | Multi-tenant core: `organizations`, `organization_members`, `user_profiles`, `site_connections`, `cms_credentials`. RLS via `is_org_member/admin/owner` security-definer helpers. `/onboarding`, `/sites`, `/sites/[id]`. RLS empirically verified live (outsider rejected, member read-only, owner full access). |
| 2 | `10b7d13` | `packages/cms-adapters`: hosted-blog + WordPress (REST API, Application Passwords). `posts` table. Credentials stored via Supabase Vault, never plaintext — `set_site_credentials`/`get_site_credentials` RPCs. "Publish now" manual flow. Tenant blog rewrite in `apps/web`. |
| 3 | `6b8ef22` | `packages/ai-engine`: full pipeline on Vercel AI SDK + Anthropic. Real `webSearch` tool for research (no invented citations). draft↔geo_seo_optimize retry loop (max 2 retries) as a hard blocker. `pipeline_runs`/`pipeline_run_steps` tables. Manual trigger only (`/sites/[id]/generate`), no durable orchestration yet. 21 unit tests. |
| — | `f492830` | Fixed `.env.example` pattern: unset optional vars instead of `""` (zod `.url()`/`.startsWith()` reject empty string as invalid, not "unset"). |
| 4 | `e5c2a77` | `packages/workflows`: Workflow DevKit durable orchestration (retry/caching per step), preserving Phase 3's retry loop exactly. `schedules` + `tenant_settings` tables. Cron dispatcher in `apps/api` (`CRON_SECRET`-gated), skips paused tenants/sites without backlogging. Real `approval_gate` via `createHook()`/`resumeHook()` suspend-resume. `/sites/[id]/schedule`, `/settings`. |
| 5 | `8460edf` | Guardrails: kill switch (re-checked twice per run, plus platform-wide `EMERGENCY_STOP` env var), `max_posts_per_day/week` enforcement, auto-pause after 3 consecutive publish failures (DB trigger), duplicate-content detection via pgvector cosine similarity (degrades gracefully — needs `OPENAI_API_KEY`, not configured), `audit_log` table + `/settings/audit` page. 31 tests total. |
| 8 (fast-follow) | `7227ceb` | Webflow + Shopify CMS adapters, done early per user request. Shopify via GraphQL Admin API (`articleCreate`; REST is legacy post-Oct 2024). Webflow via Data API v2 (`isDraft:false` live-publishes in one call); no fixed schema, so credentials include a collection ID + field-slug mapping, validated live in `testConnection`. Both connect forms fetch real options rather than asking for raw IDs blind. 24 cms-adapters tests. |
| 6 | `e179dbc` | Stripe billing: org-level plans/subscriptions/usage tracking, billing settings page, checkout/portal actions, webhook wired to the Phase 5 `past_due` guardrail. |
| 7 | `3202f4a` | `packages/search-console`: GSC OAuth2 + Search Analytics client, Vault-backed per-site credentials, daily sync cron caching top queries, topic-selection prompt grounded in that data when present. |
| — | `6e5492e` | Reskin to match the "Quillrun Dashboard" Lovable/Claude Design mockup: cream/teal palette, IBM Plex Sans/Mono, 6-state status-pill system (ok/running/await/blocked/failed/paused) cascaded through `packages/design-system` into both `apps/app` and `apps/web`. |
| — | `bc5270c` | Allowed known-safe native/build install scripts (esbuild, sharp, sentry-cli, swc). |
| 8 | `e4bb409` | `packages/google-ads`: OAuth connect flow, daily keyword-research sync seeded from each site's GSC top queries, 4th pipeline quality gate blocking runs with no real search traction + near-zero keyword volume. OAuth state-signing extracted into shared `packages/security`. |
| — | `3159abd` | Dropped `bun` wrapper from scripts — deploy environment only has npm, `package-lock.json` is what's committed. |
| — | `422641c`, `397e3a9` | Attempts to trigger the first Vercel deploy — **still failing**, see §2. |
| — | `8b3c3aa` | Added `@supabase/server` to `apps/api` for JWT verification via the new Supabase key pair (`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`/`SUPABASE_JWKS_URL`), alongside the legacy anon/service_role keys `@repo/auth`/`@repo/database` still use. |
| — | `73b6c20`–`2480521` | First successful production deploys (see §2 for the full sequence: env vars, cron cadence, framework detection, BaseHub schema). Stripe best-practices review (`24eff3f`): SDK 20.4.1→22.6.0, `apiVersion` bumped, `STRIPE_SECRET_KEY` validator now accepts restricted (`rk_`) keys, webhook handler covers `invoice.paid` alongside `invoice.payment_succeeded`. |
| — | `d91d293` | Added `ROUTING_SPEC.md` — navigation/redirect map for `apps/web`+`apps/app`. |
| — | `b3bb690`, `51539ff` | Closed several `ROUTING_SPEC.md` gaps: `?next=` return-to on the session gate, sign-in/sign-up inverse guard, OAuth-callback session-expiry preserves the connect target, dropped the prod-only condition on the `/legal` redirect, Turbopack monorepo-root fix. Rebrand cleanup ("Acme Inc"→"Quillrun" across sign-in/sidebar/header), stripped fake next-forge demo sidebar nav, rebuilt the pricing page and `en.json` dictionary with real Quillrun copy (was 100% generic boilerplate, including fake testimonials attributed to next-forge's own maintainers). Root `/` now redirects to `/sites` as a stopgap. Custom domains `quillrun.dev`/`app.quillrun.dev` attached (see §2). |
| — | `5907045`, `8f85253`, `3ccd1b2` | Dropped BaseHub's live-schema dependency entirely (see §2 item 4) — `packages/cms` no longer schema-driven, legal pages use real hardcoded copy from the design handoff, blog degrades to empty. Fixed a pre-existing production `DYNAMIC_SERVER_USAGE` crash on legal/blog pages (§2 item 8). Rebranded shared page-metadata defaults away from next-forge/Vercel (§2 item 9). |
| — | `faaff98`, `f012c1e`, `f8fb3df` | **Dashboard visual rebuild** from the Quillrun Design handoff (`Quillrun Dashboard.dc.html`) against the real Phase 0-8 backend — the big item §7 used to list as deferred. New `StatusPill`/`StatusDot`/`statusGlyph` (design-system) implement the handoff's six-state colour+glyph+shape system, replacing every page's ad hoc `statusVariant()` helper. Dark sidebar + persistent StatusBar (real `tenant_settings.paused`/`require_approval`, one-click stop via new `toggleGlobalPause` action) on every screen. Root `/` is now a real cross-site Overview (stat cards, sites table, "waiting on you"/"needs attention" panels — all live queries, closes the `ROUTING_SPEC.md` gap). Sites, Site detail (new shared `SiteTabs` nav), Generate, Runs, Run detail, Posts, Publish now, Schedule, Settings (new dark `EmergencyStopPanel`), Audit log (real action-taxonomy filters) all restyled with real data throughout — no mock numbers. Verified live against a real account's data (Quote Engine site) after each push, not just build success. |

**Recurring pattern worth knowing**: every phase that touches RLS gets empirically verified live (outsider/member/admin/owner role simulation via `execute_sql`, fixtures cleaned up after) rather than trusted from policy text alone, and every phase runs a Supabase security-advisor pass afterward — which has caught an over-privileged default RPC grant in nearly every phase (Phase 1, 2, 5 all found and fixed one).

## 5. Integrations — configured vs. deferred

| Integration | Status | Notes |
|---|---|---|
| Supabase (DB + Auth) | **Configured** | Project `acyauqpeykgrivrajksa`. `SUPABASE_SERVICE_ROLE_KEY` must be pasted in manually from the dashboard — no MCP tool can read it back out. |
| Google Gemini (generation) | Key required, not committed | `GOOGLE_GENERATIVE_AI_API_KEY` — pipeline is inert without it. Swapped from Anthropic/Claude (see `packages/ai-engine/model.ts`) for Gemini's free tier; `gemini-2.5-flash` is the model in use. |
| Tavily (research web search) | Key required, not committed | `TAVILY_API_KEY` — replaces Anthropic's old provider-executed search tool now that generation is on Gemini (see `packages/ai-engine/search.ts`). Optional in the sense every other key here is: research degrades to the model's own knowledge (no live citations) rather than throwing if unset. Free tier: 1,000 searches/month. |
| Google Search Console | OAuth flow built (Phase 7) | Needs `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `GSC_OAUTH_STATE_SECRET`. |
| Google Ads (Keyword Planner) | OAuth flow built (Phase 8) | Same Google Cloud client as GSC + `adwords` scope, plus `GOOGLE_ADS_DEVELOPER_TOKEN` (from an MCC account), `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. |
| Stripe | Built (Phase 6) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. |
| OpenAI embeddings | **Not configured** | `OPENAI_API_KEY` — duplicate-content detection (Phase 5) degrades to skipping the check without it, by design (same posture as every other missing key). Neither Gemini nor Claude serve embeddings here, hence the separate provider. |
| Upstash (rate-limit) | **Not configured** | `packages/rate-limit` unused; Phase 5's daily/weekly post caps are enforced via a direct DB count query instead. |
| Resend (email) | Not configured | Optional. |
| BetterStack, PostHog, Sentry, Arcjet, Svix, Liveblocks, BaseHub, Knock, GA | Not configured | All next-forge defaults, left as optional/unset. |
| n8n MCP internal API (`apps/api/app/internal/*`) | **Configured** (2026-09-03) | `N8N_INTERNAL_SECRET` set on `quillrun-api` production — gates the plain JSON API an n8n MCP Server Trigger workflow's tool nodes call, distinct from `CRON_SECRET` (different trust boundary: fixed reviewed schedules vs. arbitrary proxied MCP tool calls). The n8n MCP Server Trigger workflow itself is still to be built. |

**Env-var gotcha to remember**: this repo's `.env.example` files comment out every unconfigured optional var rather than leaving `KEY=""`, because `@t3-oss/env-nextjs` zod validators (`.url()`, `.startsWith()`) treat empty string as present-but-invalid, not unset — that broke local dev until `f492830` fixed the pattern. Apply the same convention to any new optional var.

## 6. Data model (Supabase, chronological migrations in `packages/database/supabase/migrations/`)

- **Phase 1**: `organizations`, `organization_members`, `user_profiles`, `site_connections`, `cms_credentials` + RLS helper functions
- **Phase 2**: `posts` (metadata-only slice), Vault-backed credential RPCs
- **Phase 3**: `pipeline_runs`, `pipeline_run_steps`
- **Phase 4**: `schedules`, `tenant_settings`, `rejected` run status
- **Phase 5**: `audit_log`; `posts.content_embedding` (pgvector) + `find_similar_posts` RPC; `consecutive_publish_failures` + auto-pause trigger
- **Phase 6**: billing plans/subscriptions/usage tables
- **Phase 7**: Search Console credentials/cache tables
- **Phase 8**: Google Ads credentials/cache tables

## 7. What's explicitly deferred / not yet built

- Org switcher UI for users belonging to multiple orgs (single-org-per-user works today)
- Invite flow (adding members to an existing org)
- Rich content editor for manual posts (plain textarea today)
- Live integration tests against a real WordPress/Webflow/Shopify site (everything is mocked-fetch — no live site to test against yet)
- Docs/email/storybook apps — untouched next-forge scaffolding, not adapted to Quillrun
- **Sign-in/onboarding pixel-matching to the design handoff.** The dashboard rebuild (§4, commits `faaff98`–`f8fb3df`) covered every screen behind the sidebar (Overview through Audit log); sign-in and onboarding still have their earlier stopgap rebrand (real Quillrun branding/copy, `?next=` handling) rather than the handoff's fuller treatment (dark right-panel with a live "Agent activity" feed).
- **Live-streaming Generate/Run views.** Both read a snapshot on load (real `pipeline_run_steps` data), not a live-updating log — the handoff's Generate screen shows the pipeline running in real time via a client-side simulation; the real equivalent needs Supabase Realtime or SSE wired to actual step writes, a genuinely separate feature, not just styling.
- Marketing site: the handoff's "How it works" page (6-stage pipeline explainer) and the proof-stats/features/trust-section/FAQ blocks on the home page haven't been built yet — only the hero, pricing, and footer got the full treatment; `packages/internationalization/dictionaries/en.json` still carries this session's earlier interim copy rather than the handoff's exact wording for those sections.
- The handoff's `Quillrun Variations.dc.html` documents alternate treatments considered for the status system, the Generate pipeline view, and the marketing hero (each section names which option is live) — worth a look if any of the shipped choices feel wrong once there's real usage to react to.

## 8. How to resume work here

1. Check `git log --oneline` against this table — if new commits exist beyond `f8fb3df`, this file is stale; update §4 first.
2. Fix the Vercel env-var gap (§2) before anything else — nothing is live yet.
3. Local dev: `npm run dev` (turbo dev across all apps). `apps/app` on :3000, `apps/web` on :3001.
4. DB migrations: `npm run db:push` (runs `supabase db push` from `packages/database`).
5. Tests: `npm test` (turbo test) — 31+ tests across `ai-engine`, `workflows`, `cms-adapters`, `google-ads`, `apps/api`, `apps/app`.
