# Quillrun · Routing Spec

Redirection plan for `apps/web` + `apps/app`. Companion to `PRD.md` and `PROCESS_ARCHITECTURE.md`. Written 2026-08-29.

Every navigation decision in the product, in one place: what the marketing site owns, what the app owns, which redirects the framework performs today, and which ones are still missing. Statuses are the codes the platform actually emits — Next's `redirect()` in a server component is a 307 on the RSC response, `next.config` redirects are true 301/308s.

---

## 1 · Public surface — apps/web

Locale-prefixed marketing pages plus the hosted tenant blog. No auth, fully indexable.

| Route | Behaviour |
|---|---|
| `/[locale]` | Home. Sign in / Start free are cross-app links to `NEXT_PUBLIC_APP_URL`, never redirects. |
| `/[locale]/pricing` | Plan CTAs link straight to `/sign-up` on the app domain. |
| `/[locale]/blog` · `/blog/[slug]` | CMS-backed. Unknown slug → `notFound()` 404. |
| `/[locale]/legal/[slug]` | terms · privacy · aup. Unknown slug → 404. |
| `/legal` | 301 → `/legal/privacy`. The only config-level redirect that exists today, and it is wrapped in a production check — in dev the bare path 404s. |
| `/[locale]/contact` | Server-action submit, stays on the page. No post-submit redirect. |
| `/tenant-blog/[orgSlug]/[postSlug]` | Hosted-blog output, rewritten from the tenant's own domain. Unpublished or unknown post → 404, never a redirect to the blog index. |

## 2 · Entry gates — apps/app

Three gates run in order on every authenticated request. Each is a server-component redirect, so it happens before any UI paints.

1. **Session gate** — `(authenticated)/layout.tsx`. No Supabase user → 307 → `/sign-in`. Repeated defensively in `page.tsx` and `/search`, which is harmless but means the check lives in four places.
2. **Organization gate** — Signed in with no org → 307 → `/onboarding`. Every leaf page re-runs this after its own `getCurrentOrganization()`, because they need the org id anyway. `/onboarding` deliberately sits outside the route group and mirrors the gate: an org already present → 307 → `/`.
3. **Tenancy gate** — A `[id]` or `[runId]` outside the caller's org resolves to nothing under RLS → 404 via `notFound()`, not a redirect and not a 403. Correct: a redirect to `/sites` would confirm the row exists.

## 3 · Post-action destinations

Where each mutation lands the user. The rule the codebase already follows: land on the artefact the action produced, or on the list the action changed.

| Action | Destination |
|---|---|
| Create organization | `/` |
| Generate a post | `/sites/{id}/runs/{runId}` — straight to the live run |
| Publish a post | `/sites/{id}/posts` |
| Delete a site connection | `/sites` |
| Approve / reject a run | Stays on the run page, revalidates in place. Right call — the audit trail is the point of that screen. |
| Start checkout / manage billing | Off-site to the Stripe session URL. Return and cancel URLs must point back at `/settings/billing`. |

## 4 · OAuth round trips

Search Console and Google Ads share one shape. The callback lives at `/api/{provider}/callback` outside the site route because Google knows nothing of our paths — the target site travels in a signed state. Every outcome returns to the same site page carrying a status query param, so one screen renders all six results.

| Outcome | Redirect |
|---|---|
| Exactly one property / account | `/sites/{id}?gsc=connected` |
| Several — user must choose | `/sites/{id}?gsc=pick` |
| None verified | `/sites/{id}?gsc=no-properties` |
| Consent denied | `/sites/{id}?gsc=denied` |
| Token exchange or vault write failed | `/sites/{id}?gsc=error` |
| Denied and state unreadable | `/sites` |
| Missing or tampered state | 400 text response, no redirect |

Keep the status vocabulary identical across providers (`?ads=` mirrors `?gsc=`) and strip the param after the toast is shown, so a refresh or a shared URL does not replay a stale success banner.

## 5 · Gaps to close

- **The root route is still the starter dashboard.** Three redirects and every sign-in land on `/`, which renders the next-forge demo header and an empty panel. Either make it the cross-site overview or redirect it to `/sites` until that screen exists — right now the most-visited destination in the product is a placeholder.
- **No return-to on the session gate.** `redirect("/sign-in")` discards the requested path, so a run link from an approval email always dumps the user at the root after signing in. Pass `?next=` from the layout, validate it is same-origin and app-relative on consumption, then honour it after both the session and organization gates pass.
- **Signed-in users can still open `/sign-in`.** `/onboarding` has an inverse guard; the auth pages do not. Add the mirror — session present → `/` — so bookmarks and the marketing header's Sign in link behave for people already logged in.
- **An expired session mid-OAuth loses the connect attempt.** Both callbacks send a signed-out user to `/sign-in` with the verified state thrown away, so they must restart the whole Google flow. Carry `?next=/sites/{id}` here too once the previous item ships.
- **Housekeeping.** Drop the production-only condition on the `/legal` redirect so dev matches prod. Add the reciprocal 301s the sitemap implies — bare `/blog` variants, trailing slashes, and any pre-launch paths that ship in outbound email — as config redirects rather than page-level logic, so they cost nothing at runtime.
