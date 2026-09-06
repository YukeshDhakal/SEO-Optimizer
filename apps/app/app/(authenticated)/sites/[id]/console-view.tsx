import { StatusDot, StatusPill } from "@repo/design-system/components/status-pill";
import Link from "next/link";
import {
  runLabel,
  runPillStatus,
  topicOf,
} from "../../components/runs-table";
import type { OverviewRun } from "./site-overview-data";

interface ConsoleViewProperties {
  readonly siteId: string;
  readonly runs: readonly OverviewRun[];
  readonly rail: {
    readonly cms: { readonly type: string; readonly status: string };
    readonly searchConsoleStatus: string | null;
    readonly googleAdsStatus: string | null;
    readonly lastFailure: OverviewRun | null;
    readonly requireApproval: boolean;
    readonly globalPaused: boolean;
  };
}

const railStatusPill = (status: string | null) => {
  if (!status) {
    return <span className="text-muted-foreground">Not connected</span>;
  }
  return (
    <StatusPill status={status === "connected" ? "ok" : "await"}>
      {status}
    </StatusPill>
  );
};

// 1c "Operator console": no decorative stat cards, highest density, and a
// rail that keeps connections/guardrails/last-failure visible without
// clicking into the Connections section further down the page.
export const ConsoleView = ({ siteId, runs, rail }: ConsoleViewProperties) => {
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
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <div className="border-[3px] border-foreground bg-card">
        <div className="border-foreground border-b-[3px] px-4 py-2 font-display text-sm tracking-tight">
          RUN LOG
        </div>
        <div className="flex flex-col divide-y font-mono text-xs">
          {runs.map((run) => {
            const pill = runPillStatus(run);
            return (
              <div
                className="flex items-center gap-3 px-4 py-2"
                key={run.id}
              >
                <StatusDot status={pill} />
                <span className="w-36 shrink-0 text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()}
                </span>
                <Link
                  className="min-w-0 flex-1 truncate font-sans font-medium hover:text-primary"
                  href={`/sites/${siteId}/runs/${run.id}`}
                >
                  {topicOf(run.input)}
                </Link>
                <span className="shrink-0 text-muted-foreground">
                  {runLabel(run)}
                </span>
                {pill === "await" && (
                  <Link
                    className="shrink-0 border-2 border-foreground bg-card px-2 py-1 font-sans font-bold uppercase tracking-wide hover:bg-muted/50"
                    href={`/sites/${siteId}/runs/${run.id}`}
                  >
                    Review
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="border-[3px] border-foreground bg-card p-3">
          <h3 className="mb-2 font-bold text-[10px] uppercase tracking-widest">
            Connections
          </h3>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="capitalize text-muted-foreground">
                {rail.cms.type}
              </span>
              {railStatusPill(rail.cms.status)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Search Console</span>
              {railStatusPill(rail.searchConsoleStatus)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Google Ads</span>
              {railStatusPill(rail.googleAdsStatus)}
            </div>
          </div>
        </div>

        <div className="border-[3px] border-foreground bg-card p-3">
          <h3 className="mb-2 font-bold text-[10px] uppercase tracking-widest">
            Guardrails
          </h3>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Approval required
              </span>
              <span className="font-bold">
                {rail.requireApproval ? "On" : "Off"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Global pause</span>
              <span className="font-bold">
                {rail.globalPaused ? "On" : "Off"}
              </span>
            </div>
          </div>
        </div>

        <div className="border-[3px] border-foreground bg-card p-3">
          <h3 className="mb-2 font-bold text-[10px] uppercase tracking-widest">
            Last failure
          </h3>
          {rail.lastFailure ? (
            <div className="text-xs">
              <p className="font-mono text-muted-foreground">
                {new Date(rail.lastFailure.started_at).toLocaleString()}
              </p>
              <p className="mt-1 line-clamp-3">
                {rail.lastFailure.error ?? "No error detail recorded."}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              No failures in the last {runs.length} runs.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
