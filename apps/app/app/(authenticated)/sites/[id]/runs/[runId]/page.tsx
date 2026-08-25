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
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../../lib/organization";

export const metadata: Metadata = {
  title: "Generation run",
};

interface RunDetailPageProperties {
  readonly params: Promise<{ id: string; runId: string }>;
}

const statusVariant = (status: string) => {
  if (status === "succeeded") {
    return "default" as const;
  }
  if (status === "failed" || status === "blocked") {
    return "destructive" as const;
  }
  return "secondary" as const;
};

// Not a live/streaming view — this is the manually-triggered pipeline
// (Phase 3); the whole run completes within the request that created it, so
// by the time this page is reached the run is already finished (or, for a
// run that somehow got interrupted, "running" reflects its last known
// step). Live progress + a real SSE timeline is Phase 4 territory, once the
// pipeline runs durably via Workflow DevKit + cron instead of inline.
const RunDetailPage = async ({ params }: RunDetailPageProperties) => {
  const { id, runId } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("id", runId)
    .eq("site_connection_id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!run) {
    notFound();
  }

  const { data: steps } = await supabase
    .from("pipeline_run_steps")
    .select("*")
    .eq("pipeline_run_id", runId)
    .order("started_at", { ascending: true });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Generation run</h1>
          <p className="text-muted-foreground text-sm">
            Started {new Date(run.started_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
          {run.post_id && (
            <Button asChild size="sm">
              <Link href={`/sites/${id}/posts`}>View post</Link>
            </Button>
          )}
        </div>
      </div>

      {run.error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{run.error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Steps</CardTitle>
        </CardHeader>
        <CardContent>
          {steps && steps.length > 0 ? (
            <ol className="flex flex-col divide-y divide-border">
              {steps.map((step) => (
                <li className="flex items-center justify-between py-3" key={step.id}>
                  <div>
                    <p className="font-medium text-sm">{step.step_name}</p>
                    {step.error && (
                      <p className="text-destructive text-xs">{step.error}</p>
                    )}
                  </div>
                  <Badge variant={statusVariant(step.status)}>
                    {step.status}
                  </Badge>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              No step data recorded yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RunDetailPage;
