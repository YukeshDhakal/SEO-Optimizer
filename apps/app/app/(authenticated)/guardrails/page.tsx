import { createClient } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateTenantSettings } from "../../actions/tenant-settings/mutate";
import { getCurrentOrganization } from "../../lib/organization";
import { EmergencyStopPanel } from "./emergency-stop-panel";

export const metadata: Metadata = { title: "Settings" };

// Org-wide guardrail toggles. require_approval and the posting limits are
// tenant_settings columns (Phase 4). Auto-pause after 3 consecutive
// publish failures is deliberately not a toggle here — it's a DB trigger
// (auto_pause_site_on_repeated_failures, Phase 5), always on, matching the
// design handoff's own framing: "cannot be disabled" guardrails don't get
// a switch that implies otherwise.
const SettingsPage = async () => {
  const organization = await getCurrentOrganization();
  if (!organization) {
    redirect("/onboarding");
  }

  const canManage =
    organization.role === "owner" || organization.role === "admin";

  const supabase = await createClient();
  const [{ data: settings }, { count: siteCount }, { count: runningCount }, { count: awaitingCount }] =
    await Promise.all([
      supabase
        .from("tenant_settings")
        .select("*")
        .eq("organization_id", organization.id)
        .maybeSingle(),
      supabase
        .from("site_connections")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id),
      supabase
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "running")
        .neq("current_step", "approval_gate"),
      supabase
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "running")
        .eq("current_step", "approval_gate"),
    ]);

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">GUARDRAILS</h1>
          <p className="mt-1 max-w-xl text-muted-foreground text-sm">
            Organization-wide controls for {organization.name}. These
            override every site schedule and every run in flight.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/guardrails/billing">Billing</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/guardrails/audit">Audit log</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <form
            action={updateTenantSettings}
            className="overflow-hidden border-[3px] border-foreground bg-card"
          >
            <input name="organization_id" type="hidden" value={organization.id} />
            <div className="flex items-start gap-4 border-foreground border-b-[3px] px-5 py-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">
                    Require approval before publishing
                  </span>
                  <span
                    className={
                      settings?.require_approval
                        ? "border-2 border-foreground bg-accent px-1.5 py-0.5 font-bold text-[10px]"
                        : "border-2 border-foreground bg-status-error-bg px-1.5 py-0.5 font-bold text-[10px] text-status-error-fg"
                    }
                  >
                    {settings?.require_approval ? "recommended" : "off"}
                  </span>
                </div>
                <p className="mt-1 max-w-md text-muted-foreground text-xs">
                  Every finished draft stops at an approval gate and waits
                  for a person. Turn this off and the agent publishes on its
                  own, which is faster and riskier.
                </p>
              </div>
              <input
                className="mt-1 size-5 accent-primary"
                defaultChecked={settings?.require_approval ?? false}
                disabled={!canManage}
                name="require_approval"
                type="checkbox"
              />
            </div>
            <div className="flex items-start gap-4 border-foreground border-b-[3px] px-5 py-4">
              <div className="flex-1">
                <span className="font-bold text-sm">
                  Auto pause a site after 3 failures
                </span>
                <p className="mt-1 max-w-md text-muted-foreground text-xs">
                  When publishing fails three times in a row the site is
                  paused automatically. This guardrail is always on and
                  cannot be turned off.
                </p>
              </div>
              <input checked disabled className="mt-1 size-5" readOnly type="checkbox" />
            </div>

            <div className="bg-muted px-5 py-4">
              <p className="mb-3 font-bold text-sm">Posting limits</p>
              <p className="mb-3 max-w-md text-muted-foreground text-xs">
                Hard ceilings across the whole organization. When a limit is
                hit, runs are skipped for that day and the dispatcher moves
                on rather than queuing a backlog.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="font-bold text-[10.5px] text-muted-foreground uppercase tracking-wider" htmlFor="max_posts_per_day">
                    Max posts / day
                  </Label>
                  <Input
                    defaultValue={settings?.max_posts_per_day ?? ""}
                    disabled={!canManage}
                    id="max_posts_per_day"
                    name="max_posts_per_day"
                    type="number"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="font-bold text-[10.5px] text-muted-foreground uppercase tracking-wider" htmlFor="max_posts_per_week">
                    Max posts / week
                  </Label>
                  <Input
                    defaultValue={settings?.max_posts_per_week ?? ""}
                    disabled={!canManage}
                    id="max_posts_per_week"
                    name="max_posts_per_week"
                    type="number"
                  />
                </div>
              </div>
              {/* paused is owned by the emergency-stop panel/status bar's
                  quick toggle, not this form — carry the current value
                  through unchanged so submitting limits doesn't reset it. */}
              <input
                name="paused"
                type="hidden"
                value={settings?.paused ? "on" : "off"}
              />
              {canManage && (
                <Button className="mt-4" size="sm" type="submit">
                  Save
                </Button>
              )}
            </div>
          </form>
          {!canManage && (
            <p className="text-muted-foreground text-xs">
              Only owners and admins can change these settings.
            </p>
          )}
        </div>

        <EmergencyStopPanel
          awaitingApprovalCount={awaitingCount ?? 0}
          canManage={canManage}
          organizationId={organization.id}
          paused={settings?.paused ?? false}
          runningCount={runningCount ?? 0}
          siteCount={siteCount ?? 0}
        />
      </div>
    </div>
  );
};

export default SettingsPage;
