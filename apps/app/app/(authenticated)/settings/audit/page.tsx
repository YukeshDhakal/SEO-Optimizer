import { createClient } from "@repo/auth/server";
import { statusGlyph } from "@repo/design-system/components/status-pill";
import { cn } from "@repo/design-system/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../lib/organization";

export const metadata: Metadata = { title: "Audit log" };

// Real action taxonomy this app actually writes (packages/workflows/
// content-pipeline.ts, apps/app/app/actions/posts/publish.ts) - dot
// namespaced, e.g. "run.blocked.policy_check", "approval.granted",
// "post.published", "site.auto_paused". Filters group by prefix rather
// than the handoff's exact category list, since those are the real
// categories this system produces.
const FILTERS = [
  { key: "all", label: "All events" },
  { key: "published", label: "Published" },
  { key: "blocked", label: "Blocked" },
  { key: "auto_paused", label: "Auto pause" },
  { key: "approval", label: "Approvals" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const matchesFilter = (action: string, filter: FilterKey) => {
  if (filter === "all") {
    return true;
  }
  if (filter === "published") {
    return action.startsWith("post.published");
  }
  if (filter === "blocked") {
    return action.includes("blocked");
  }
  if (filter === "auto_paused") {
    return action === "site.auto_paused";
  }
  return action.startsWith("approval.");
};

const pillFor = (action: string) => {
  if (action.startsWith("post.published") || action === "approval.granted") {
    return "ok" as const;
  }
  if (action.includes("blocked")) {
    return "blocked" as const;
  }
  if (action === "site.auto_paused" || action.includes("failed")) {
    return "failed" as const;
  }
  if (action === "approval.rejected") {
    return "blocked" as const;
  }
  return "await" as const;
};

const readableAction = (action: string) =>
  action.replaceAll(".", " · ").replaceAll("_", " ");

interface AuditLogPageProps {
  readonly searchParams: Promise<{ filter?: string }>;
}

// Read-only — every row here was written server-side (workflow steps, the
// cron dispatcher, or a server action's own service-role write), never by
// a direct client insert. See the `audit_log_select`-only RLS policy.
const AuditLogPage = async ({ searchParams }: AuditLogPageProps) => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const { filter: filterParam } = await searchParams;
  const activeFilter: FilterKey = (FILTERS.find((f) => f.key === filterParam)
    ?.key ?? "all") as FilterKey;

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("audit_log")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const filtered = (entries ?? []).filter((e) =>
    matchesFilter(e.action, activeFilter)
  );

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">AUDIT LOG</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Everything the agent did while you were not watching, newest
          first. Nothing here can be edited or deleted.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            className={cn(
              "border-2 border-foreground px-3 py-1 font-bold text-xs",
              activeFilter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
            href={f.key === "all" ? "/settings/audit" : `/settings/audit?filter=${f.key}`}
            key={f.key}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="overflow-hidden border-[3px] border-foreground">
          <div className="flex flex-col divide-y-2 divide-foreground">
            {filtered.map((entry) => {
              const { glyph, fg } = statusGlyph(pillFor(entry.action));
              return (
              <div
                className="grid grid-cols-[150px_20px_1fr_auto] items-start gap-4 px-4 py-3"
                key={entry.id}
              >
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                <span className={cn("mt-0.5 font-mono text-[10px]", fg)}>
                  {glyph}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-sm capitalize">
                    {readableAction(entry.action)}
                  </div>
                  {Object.keys(entry.metadata as Record<string, unknown>).length > 0 && (
                    <div className="mt-0.5 truncate text-muted-foreground text-xs">
                      {JSON.stringify(entry.metadata)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="rounded-[4px] bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {entry.entity_type}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {entry.actor ? entry.actor.slice(0, 8) : "system"}
                  </span>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No audit events {activeFilter === "all" ? "yet" : "for this filter"}.
        </p>
      )}
    </div>
  );
};

export default AuditLogPage;
