import { createClient } from "@repo/auth/server";
import { StatusPill } from "@repo/design-system/components/status-pill";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  deleteSchedule,
  toggleScheduleEnabled,
} from "../../../../actions/schedules/mutate";
import { getCurrentOrganization } from "../../../../lib/organization";
import { SiteTabs } from "../site-tabs";
import { NewScheduleForm } from "./new-schedule-form";

export const metadata: Metadata = { title: "Schedule" };

interface SchedulePageProperties {
  readonly params: Promise<{ id: string }>;
}

const SchedulePage = async ({ params }: SchedulePageProperties) => {
  const { id } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("id, display_name")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const { data: schedules } = await supabase
    .from("schedules")
    .select("*")
    .eq("site_connection_id", id)
    .order("created_at", { ascending: true });

  const canManage =
    organization.role === "owner" || organization.role === "admin";

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Schedule</h1>
        <p className="mt-1 max-w-xl text-muted-foreground text-sm">
          When the agent starts runs on its own for {site.display_name}.
          Organization limits still apply and always win.
        </p>
      </div>

      <SiteTabs siteId={id} />

      <div className="rounded-md border bg-card">
        <div className="border-b px-5 py-3.5 font-semibold text-sm">
          Recurring generation
        </div>
        <div className="px-5">
          {schedules && schedules.length > 0 ? (
            <div className="flex flex-col divide-y">
              {schedules.map((schedule) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  key={schedule.id}
                >
                  <div>
                    <p className="font-medium text-sm">{schedule.cadence}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {schedule.timezone} · {schedule.topic_hint}
                    </p>
                    {schedule.next_run_at && (
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        Next run:{" "}
                        {new Date(schedule.next_run_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={schedule.enabled ? "ok" : "paused"}>
                      {schedule.enabled ? "Enabled" : "Paused"}
                    </StatusPill>
                    {canManage && (
                      <>
                        <form action={toggleScheduleEnabled}>
                          <input name="id" type="hidden" value={schedule.id} />
                          <input
                            name="site_connection_id"
                            type="hidden"
                            value={id}
                          />
                          <input
                            name="enabled"
                            type="hidden"
                            value={String(schedule.enabled)}
                          />
                          <Button size="sm" type="submit" variant="outline">
                            {schedule.enabled ? "Pause" : "Resume"}
                          </Button>
                        </form>
                        <form action={deleteSchedule}>
                          <input name="id" type="hidden" value={schedule.id} />
                          <input
                            name="site_connection_id"
                            type="hidden"
                            value={id}
                          />
                          <Button size="sm" type="submit" variant="destructive">
                            Delete
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-muted-foreground text-sm">
              No recurring schedule yet — every run happens manually.
            </p>
          )}
        </div>
      </div>

      {canManage && (
        <div className="rounded-md border bg-card p-5">
          <h2 className="mb-4 font-semibold text-sm">New schedule</h2>
          <NewScheduleForm
            organizationId={organization.id}
            siteConnectionId={id}
          />
        </div>
      )}
    </div>
  );
};

export default SchedulePage;
