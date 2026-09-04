# Quillrun

Quillrun is a multi-tenant SaaS product: an autonomous SEO/GEO content agent that researches, writes, and auto-publishes blog content to a customer's own CMS (WordPress, Webflow, Shopify, or a hosted blog we provide), with almost no manual work.

**GEO** (Generative Engine Optimization) means optimizing content to be cited/surfaced by AI answer engines (ChatGPT, Perplexity, AI Overviews), not just ranked by classic search — it sits alongside traditional SEO as a quality gate in the generation pipeline.

- Marketing site: [quillrun.dev](https://quillrun.dev)
- Dashboard: [app.quillrun.dev](https://app.quillrun.dev)

## Who it's for

Small business owners and marketing-ops people at agencies, managing content for one or several client sites. They're trusting an AI to write and publish under their brand with no review step by default. The product's central design problem is making that trust legible — what the agent is about to do, what it just did, why a piece of content passed or failed quality gates, and a clear, always-visible way to stop it.

## Architecture

A Turborepo monorepo (npm workspaces):

```
apps/
  app/    main tenant dashboard — sign-in, onboarding, sites, generate, runs, posts, schedule, guardrails, billing
  web/    marketing site + public tenant-blog rewrite (org-slug.quillrun.dev/blog/slug)
  api/    cron dispatcher, Stripe/webhook receivers, JWT verification

packages/
  ai-engine/         generation pipeline: topic_selection → research → outline → draft →
                      geo_seo_optimize → policy_check, on Vercel AI SDK + Anthropic
  workflows/          Workflow DevKit orchestration wrapping ai-engine in durable "use step" functions
  cms-adapters/       CmsAdapter interface + registry: hosted-blog, WordPress, Webflow, Shopify
  search-console/     Google Search Console OAuth2 + Search Analytics client
  google-ads/         Google Ads Keyword Planner OAuth2 + volume lookups
  security/           shared OAuth state-signing helper, security headers
  database/           Supabase client (service-role) + generated types + SQL migrations
  auth/               @supabase/ssr wrapper (browser/server clients, useAuth hook)
  design-system/      shared UI components (shadcn-based), Quillrun brand tokens
  rate-limit/         Upstash-backed rate limiting
  payments/           Stripe billing
  analytics/          GA4 + Google Ads conversion tracking
  cms/                content model for legal pages
  ...and observability, feature-flags, notifications, storage, collaboration,
     internationalization, next-config, typescript-config
```

## Stack

- **Framework**: Next.js (App Router), Turborepo, npm workspaces
- **Database & Auth**: Supabase (Postgres + Supabase Auth)
- **AI**: Vercel AI SDK + Anthropic, orchestrated via Workflow DevKit
- **Payments**: Stripe
- **Rate limiting**: Upstash Redis (via Vercel Marketplace)
- **Deployment**: Vercel — three linked projects (`quillrun-app`, `quillrun-web`, `quillrun-api`), all tracking `master`

## Getting started

```bash
npm install
```

Each app needs its own environment variables — see `.env.example` in `apps/app`, `apps/web`, and `apps/api`, plus `packages/database`, `packages/cms`, and `packages/internationalization`. Most variables are optional by design (the app degrades gracefully when an integration isn't configured); only `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_WEB_URL` and the Supabase public config are required to build.

```bash
npm run dev      # run all apps in dev mode
npm run build    # build all apps
npm run test     # run all test suites
npm run check    # lint (ultracite/biome)
npm run fix      # lint --fix
```

Scoped to a single app or package:

```bash
npm run dev --workspace=apps/app
npm run test --workspace=@repo/google-ads
```

## Deployment

Each app deploys independently to its own Vercel project, all tracking the `master` branch:

| App | Vercel project | Domain |
|---|---|---|
| `apps/app` | `quillrun-app` | app.quillrun.dev |
| `apps/web` | `quillrun-web` | quillrun.dev |
| `apps/api` | `quillrun-api` | cron/webhooks only, no public domain |

```bash
vercel link --yes --project <project-name>   # from repo root
vercel deploy --prod --yes
```
