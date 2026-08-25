import { createClient } from "@repo/auth/server";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  deleteSchedule,
  toggleScheduleEnabled,
} from "../../../../actions/schedules/mutate";
import { getCurrentOrganization } from "../../../../lib/organization";
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
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div>
        <h1 className="font-semibold text-2xl">Schedule</h1>
        <p className="text-muted-foreground text-sm">{site.display_name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recurring generation</CardTitle>
        </CardHeader>
        <CardContent>
          {schedules && schedules.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border">
              {schedules.map((schedule) => (
                <li
                  className="flex items-center justify-between py-3"
                  key={schedule.id}
                >
                  <div>
                    <p className="font-medium text-sm">{schedule.cadence}</p>
                    <p className="text-muted-foreground text-xs">
                      {schedule.timezone} · {schedule.topic_hint}
                    </p>
                    {schedule.next_run_at && (
                      <p className="text-muted-foreground text-xs">
                        Next run:{" "}
                        {new Date(schedule.next_run_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={schedule.enabled ? "default" : "secondary"}>
                      {schedule.enabled ? "Enabled" : "Paused"}
                    </Badge>
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
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No recurring schedule yet — every run happens manually.
            </p>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <NewScheduleForm
              organizationId={organization.id}
              siteConnectionId={id}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SchedulePage;
