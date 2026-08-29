# Quillrun — Process Architecture

Companion to `PRD.md`. That file describes **what exists**; this one describes **what happens at runtime** — the flows, their control points, and where they fail.

Written for an agent picking this up cold. Read `PRD.md` §3 (architecture) and §4 (phase history) first.

---

## 0. The one-paragraph version

A cron fires. The dispatcher finds due schedules, skipping anything paused or over quota. For each survivor it starts a durable workflow. That workflow walks a six-step generation pipeline, re-checking the kill switch as it goes, optionally suspending at an approval gate, and finally hands a finished post to a CMS adapter that publishes it under the customer's brand. Every step writes to `pipeline_run_steps`, so the dashboard can show what the agent is doing and why.

The product's whole design problem is that a human is trusting this loop to run unattended. Every control point below exists to make that trust legible or revocable.

---

## 1. Process inventory

| # | Process | Trigger | Runs in | Durable? |
|---|---|---|---|---|
| P1 | Scheduled generation run | Cron → dispatcher | `apps/api` → `packages/workflows` | Yes |
| P2 | Manual generation run | User action | `apps/app` → `packages/workflows` | Yes |
| P3 | Approval resume | User approves/rejects | `apps/app` | Resumes P1/P2 |
| P4 | Publish | End of P1/P2 | `packages/cms-adapters` | Within workflow |
| P5 | GSC daily sync | Cron | `apps/api` → `packages/search-console` | No |
| P6 | Keyword research sync | Cron | `apps/api` → `packages/google-ads` | No |
| P7 | OAuth connect (GSC / Ads / CMS) | User action | `apps/app` | No |
| P8 | Stripe webhook | Stripe | `apps/api` → `packages/payments` | No |
| P9 | Auto-pause | DB trigger | Supabase | N/A |

P1 and P2 converge on the same workflow. **There must be exactly one generation code path** — a scheduled run and a manual run differ only in how they start.

---

## 2. P1 — Scheduled generation run

The main loop. Everything else is supporting cast.

```
Vercel Cron
   │  Authorization: Bearer ${CRON_SECRET}
   ▼
apps/api  /cron/dispatch-runs
   │
   ├─ GATE 0  EMERGENCY_STOP env var set? ──────────► halt everything, log, exit
   │
   ├─ query schedules WHERE due AND NOT paused
   │
   └─ for each due schedule:
        ├─ GATE 1  tenant paused?            ──────► skip, do NOT backlog
        ├─ GATE 2  site paused?              ──────► skip, do NOT backlog
        ├─ GATE 3  billing past_due?         ──────► skip
        ├─ GATE 4  max_posts_per_day/week?   ──────► skip
        └─ start workflow ──► pipeline_runs row created (status: running)
```

**"Do not backlog" is a real requirement, not an optimisation.** A tenant paused for a week must not resume to fourteen queued posts. Skipped occurrences are dropped, not deferred. If a future change introduces a queue, this rule has to be revisited explicitly.

### The pipeline

```
packages/workflows  (Workflow DevKit — each step is a durable "use step")
   │
   ├─ 1. topic_selection      ← grounded in GSC top queries when present
   ├─ 2. research             ← real webSearch tool. NEVER invented citations.
   ├─ 3. outline
   ├─ 4. draft ◄──────────────┐
   │                          │ retry (max 2)
   ├─ 5. geo_seo_optimize ────┘
   │        └─ HARD BLOCKER: fails after 2 retries → run fails, nothing publishes
   │
   ├─ 6. policy_check
   │
   ├─ GATE 5  duplicate content? (pgvector cosine vs existing posts)
   │            └─ degrades to SKIP if OPENAI_API_KEY unset — by design
   │
   ├─ GATE 6  keyword traction? (Phase 8 — no real traction + ~zero volume → block)
   │
   ├─ GATE 7  kill switch re-check  ◄── second of two checks
   │
   ├─ approval_gate?
   │     ├─ enabled  → createHook() → SUSPEND (see §3)
   │     └─ disabled → continue
   │
   └─ publish ──► P4
```

**The draft ↔ geo_seo_optimize loop is a blocker, not a warning.** Content that fails the GEO/SEO gate twice does not publish in a degraded form. This is the quality guarantee the product is sold on; do not soften it into a warning to get a run green.

**The kill switch is checked twice per run** — once at dispatch, once late in the pipeline. A run started before the operator hit stop must still stop. Any new long-running step should sit between two checks, not after the last one.

**Every step writes to `pipeline_run_steps`** on entry and exit, including failures with reason. The dashboard's job is to explain what the agent did; a step that runs silently is a step the customer can't trust.

---

## 3. P3 — Approval gate (suspend/resume)

```
workflow reaches approval_gate
   └─ createHook()  → run status: awaiting_approval → workflow SUSPENDS
                                                          │
   user opens /runs/[id] in apps/app                       │ (indefinite)
        ├─ approve → resumeHook(approved) ─────────────────┘► publish
        └─ reject  → resumeHook(rejected) ──────────────────► status: rejected, no publish
```

Suspension is indefinite. Design implications an agent should not get wrong:

- A suspended run holds no compute and must not time out on its own.
- `awaiting_approval` is a distinct status, surfaced in the `await` status pill.
- Rejection is terminal for that run — it does not retry or fall through to publish.
- Approval is per-run, never a blanket "approve all".

---

## 4. P4 — Publish

```
packages/cms-adapters  → registry.get(site.cms_type)
   │
   ├─ get_site_credentials RPC  ← Supabase Vault. NEVER plaintext, never logged.
   │
   ├─ adapter.publish(post)
   │     hosted-blog │ wordpress (REST + App Passwords)
   │     webflow (Data API v2, isDraft:false) │ shopify (GraphQL articleCreate)
   │
   ├─ success → posts row updated, consecutive_publish_failures reset to 0
   └─ failure → increment consecutive_publish_failures
                  └─ 3 consecutive → DB trigger auto-pauses the site (P9)
```

`CmsAdapter` is the only interface that touches a customer's CMS. A fifth platform is a new adapter plus its connect form — no changes to the pipeline. If a change would require the pipeline to know which CMS it is publishing to, the abstraction is leaking.

**Credentials never leave Vault as plaintext into logs, error messages, or audit entries.**

---

## 5. Data-enrichment processes (P5, P6)

```
Cron → GSC sync  → cache top queries per site  ──┐
                                                 ├─► feed topic_selection + GATE 6
Cron → Ads sync  → keyword volumes, seeded from ─┘
                    each site's GSC top queries
```

Both are **best-effort enrichment**. A site with no GSC connection still generates; topic selection is simply less grounded. Neither sync failing should block P1. Confirm this holds — an enrichment source that becomes a hard dependency is a silent availability reduction.

---

## 6. Control points — the trust surface

Ordered by how much damage they prevent.

| Control | Where | Scope | Reversible |
|---|---|---|---|
| `EMERGENCY_STOP` env var | Dispatcher, gate 0 | Platform-wide | Yes (unset + redeploy) |
| Kill switch | Dispatch + mid-pipeline | Tenant / site | Yes |
| Approval gate | Pre-publish | Per run | N/A |
| Post caps | Dispatcher | Tenant | Yes |
| Auto-pause (3 failures) | DB trigger | Site | Manual resume |
| Billing `past_due` | Dispatcher | Org | On payment |
| GEO/SEO gate | Pipeline | Per run | No — terminal |
| Duplicate detection | Pipeline | Per run | No — terminal |
| `audit_log` | Everywhere | Org | Append-only |

Two invariants worth stating outright:

1. **Nothing publishes without passing every gate.** No bypass flag, no "force publish", no admin override. The moment one exists it will be used and the product's core promise is gone.
2. **The kill switch must always work.** If a code path can reach `publish` without a kill-switch check between the operator's click and the API call, that is a bug regardless of how unlikely the timing is.

---

## 7. Tenant isolation

Every process above runs in a tenant context. This is a multi-tenant SaaS and cross-tenant leakage is the worst available failure.

- RLS on every tenant table via the `is_org_member/admin/owner` security-definer helpers.
- Cron and workflows run with the service-role key, which **bypasses RLS**. Those paths must filter by `organization_id` explicitly — RLS is not protecting them.
- `organization_id` derives from the session or the schedule row. Never from a request body or query param.
- Vault credentials are per-site, per-org.

Per PRD §4, RLS changes are verified empirically (outsider / member / admin / owner simulation, fixtures cleaned up) and followed by a Supabase security-advisor pass — which has caught an over-privileged RPC grant in nearly every phase. Keep both habits.

---

## 8. Deployment process (current blocker)

Nothing above is live. Three Vercel projects, zero successful production deploys as of the last check.

```
git push master
   ├─► quillrun-app  (apps/app)  ─┐
   ├─► quillrun-web  (apps/web)   ├─ env validation (@t3-oss/env-nextjs + zod)
   └─► quillrun-api  (apps/api)  ─┘        │
                                            ├─ FAILS ► missing required var
                                            └─ passes ► build ► deploy
```

### Order of operations

1. **Enumerate the full required env set from code**, not from the error. Each app composes its schema from `keys.ts` across the packages it imports. Fixing vars one error at a time means a redeploy per pair.
2. **Add them per project.** The three apps need different sets.
3. **Break the URL circularity.** `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_WEB_URL` point at domains that don't exist pre-deploy. Use the assigned `*.vercel.app` domains, swap to custom domains later. These are inlined at build time and ship in the client bundle — never secret, and changing one needs a rebuild.
4. **Omit optional vars entirely.** Adding one with a blank value in the dashboard reproduces the `f492830` bug: zod `.url()` / `.startsWith()` treat empty string as present-but-invalid, not unset.
5. **Then expect the next failure**, below.

### Hobby-plan constraints that will bite after the env fix

- **Cron cadence.** Hobby is limited to daily cron jobs; anything resolving to more than one run per day fails at *deploy* time with "Hobby accounts are limited to daily Cron Jobs." Check `vercel.json` before pushing — otherwise `quillrun-api` fails for a reason that looks like the env problem recurring.
- **Cron timing is not precise.** `0 1 * * *` fires anywhere in the 1am hour. UTC only.
- **Function duration.** Verify the current limit for this plan before running LLM pipeline steps through it. Durable steps help, but a single research or draft call is the risk.

If daily dispatch is too coarse: upgrade to Pro, or drop the `crons` entry and point an external scheduler at the route. `/cron/dispatch-runs` is an ordinary HTTP endpoint and `CRON_SECRET` still guards it either way.

**Resolved 2026-08-29**: `apps/api/vercel.json` had `/cron/dispatch-runs` on `*/5 * * * *` — exactly this trap. Collapsed to daily (`0 2 * * *`, between the 1am keep-alive and the 3am GSC/Ads syncs) as a stopgap so the first deploy can go out; dispatch precision is coarse until this is revisited (Pro upgrade or an external scheduler hitting the `CRON_SECRET`-gated route directly).

---

## 9. Failure modes and expected behaviour

| Failure | Expected behaviour | Wrong behaviour to guard against |
|---|---|---|
| GSC/Ads sync fails | Run proceeds, less grounded | Blocking generation |
| `OPENAI_API_KEY` unset | Duplicate check skipped | Failing the run |
| GEO/SEO gate fails twice | Run fails, nothing publishes | Publishing degraded content |
| Publish fails once | Retry per adapter policy | Silent drop |
| Publish fails 3× | Site auto-paused | Continuing to retry forever |
| Kill switch mid-run | Run halts at next check | Completing "because it started" |
| Approval never given | Suspended indefinitely | Timing out into publish |
| Billing `past_due` | Dispatch skipped | Running and billing later |
| Tenant paused 7 days | Occurrences dropped | 14 queued posts on resume |

The pattern: **missing enrichment degrades, failed quality gates block.** An agent extending this should be able to place any new failure into one of those two buckets and be right.

---

## 10. Extension checklist

Before adding anything to the pipeline:

- Does it degrade or block on failure? Say which, in the code.
- Does it write to `pipeline_run_steps`? If not, the dashboard can't explain it.
- Is there a kill-switch check after it if it's long-running?
- Does it filter by `organization_id` if it runs service-role?
- Does it touch credentials? Vault only, never logged.
- Does it work for a tenant with no GSC, no Ads, and no `OPENAI_API_KEY`?

That last one is the most commonly missed. Most tenants will be missing at least one integration, and the product has to work anyway.
