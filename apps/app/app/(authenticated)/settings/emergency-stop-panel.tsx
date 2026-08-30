"use client";

import { useState, useTransition } from "react";
import { toggleGlobalPause } from "../../actions/tenant-settings/toggle-pause";

interface EmergencyStopPanelProps {
  readonly organizationId: string;
  readonly canManage: boolean;
  readonly paused: boolean;
  readonly siteCount: number;
  readonly runningCount: number;
  readonly awaitingApprovalCount: number;
}

// Deliberately dark regardless of theme (bg-sidebar, same #171410 the
// design handoff uses for this exact panel) — a visual break from every
// other card on the page, on purpose: this is the one control that
// overrides everything else. Same tenant_settings.paused field and same
// toggleGlobalPause action the status bar's quick-stop button uses.
export const EmergencyStopPanel = ({
  organizationId,
  canManage,
  paused,
  siteCount,
  runningCount,
  awaitingApprovalCount,
}: EmergencyStopPanelProps) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  const handleToggle = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await toggleGlobalPause(organizationId, !paused);
      if (result.error) {
        setError(result.error);
      }
    });
  };

  const facts = [
    { k: "Runs in flight", v: paused ? "0" : String(runningCount) },
    { k: "Drafts waiting approval", v: String(awaitingApprovalCount) },
    { k: "Sites covered", v: String(siteCount) },
  ];

  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar p-5">
      <div className="font-mono text-[10px] text-sidebar-foreground/50 uppercase tracking-widest">
        Emergency stop
      </div>
      <p className="mt-3 text-[13px] text-sidebar-foreground/85 leading-relaxed">
        Stops every run in flight across all {siteCount} site
        {siteCount === 1 ? "" : "s"}, and blocks publishing until you
        resume. Drafts already written are kept.
      </p>
      <button
        className={
          paused
            ? "mt-4 w-full rounded-md bg-primary py-2.5 font-semibold text-[13.5px] text-primary-foreground disabled:opacity-60"
            : "mt-4 w-full rounded-md border border-status-error-fg/40 bg-status-error-bg/20 py-2.5 font-semibold text-[13.5px] text-status-error-fg disabled:opacity-60"
        }
        disabled={!canManage || isPending}
        onClick={handleToggle}
        type="button"
      >
        {isPending
          ? "Working…"
          : paused
            ? "Resume all agent activity"
            : "Stop everything now"}
      </button>
      {error && (
        <p className="mt-2 text-status-error-fg text-xs">{error}</p>
      )}
      <div className="mt-4 flex flex-col gap-2 border-sidebar-border border-t pt-4">
        {facts.map((f) => (
          <div className="flex items-baseline justify-between gap-3" key={f.k}>
            <span className="text-[11.5px] text-sidebar-foreground/60">
              {f.k}
            </span>
            <span className="font-mono font-medium text-[11.5px] text-sidebar-foreground">
              {f.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
