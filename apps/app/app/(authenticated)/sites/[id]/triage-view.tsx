import { StatusPill } from "@repo/design-system/components/status-pill";
import Link from "next/link";
import {
  runLabel,
  runPillStatus,
  topicOf,
} from "../../components/runs-table";
import type { OverviewRun } from "./site-overview-data";

interface TriageViewProperties {
  readonly siteId: string;
  readonly runs: readonly OverviewRun[];
}

const NEEDS_ATTENTION_PILLS = new Set(["await", "failed", "blocked"]);

const actionLabel = (pillStatus: string): string =>
  pillStatus === "await" ? "Review" : "View";

// 1a "Triage first": needs-you items surfaced above everything else, no
// forms on screen — EditSiteForm/connector forms/Danger Zone stay in
// page.tsx below the view switcher instead of living in here.
export const TriageView = ({ siteId, runs }: TriageViewProperties) => {
  if (runs.length === 0) {
    return (
      <div className="border-[3px] border-foreground bg-card p-8 text-center">
        <p className="font-display text-lg tracking-tight">
          Site connected. Nothing published yet.
        </p>
        <p className="mt-1 text-muted-foreground text-sm">
          Generate the first draft, or set a schedule and let the agent do it
          on its own.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            className="border-[3px] border-foreground bg-primary px-4 py-2 font-bold text-primary-foreground text-xs uppercase tracking-wide shadow-[4px_4px_0_#111]"
            href={`/sites/${siteId}/generate`}
          >
            Generate first draft
          </Link>
          <Link
            className="border-[3px] border-foreground bg-card px-4 py-2 font-bold text-xs uppercase tracking-wide shadow-[4px_4px_0_#111]"
            href={`/sites/${siteId}/schedule`}
          >
            Set schedule
          </Link>
        </div>
      </div>
    );
  }

  const needsAttention = runs.filter((run) =>
    NEEDS_ATTENTION_PILLS.has(runPillStatus(run))
  );
  const recent = runs.slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {needsAttention.length > 0 && (
        <div className="border-[3px] border-foreground bg-status-warning-bg">
          <div className="flex items-center justify-between border-foreground border-b-[3px] px-4 py-3">
            <span className="font-display text-base tracking-tight">
              NEEDS YOU · {needsAttention.length}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-foreground/20">
            {needsAttention.map((run) => {
              const pill = runPillStatus(run);
              return (
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  key={run.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {topicOf(run.input)}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </p>
                  </div>
                  <StatusPill status={pill}>{runLabel(run)}</StatusPill>
                  <Link
                    className="border-2 border-foreground bg-card px-3 py-1.5 font-bold text-xs uppercase tracking-wide hover:bg-muted/50"
                    href={`/sites/${siteId}/runs/${run.id}`}
                  >
                    {actionLabel(pill)}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-[3px] border-foreground bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-display text-base tracking-tight">
            RECENT ACTIVITY
          </span>
          <Link
            className="font-medium text-primary text-xs hover:underline"
            href={`/sites/${siteId}/runs`}
          >
            All runs
          </Link>
        </div>
        <div className="flex flex-col divide-y">
          {recent.map((run) => (
            <Link
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30"
              href={`/sites/${siteId}/runs/${run.id}`}
              key={run.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  {topicOf(run.input)}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()}
                </p>
              </div>
              <StatusPill status={runPillStatus(run)}>
                {runLabel(run)}
              </StatusPill>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
