"use client";

import { useState, useTransition } from "react";
import { toggleGlobalPause } from "../../actions/tenant-settings/toggle-pause";

interface EmergencyStopPanelProps {
  readonly awaitingApprovalCount: number;
  readonly canManage: boolean;
  readonly organizationId: string;
  readonly paused: boolean;
  readonly runningCount: number;
  readonly siteCount: number;
}

// Orange panel, black "stop" button — the neobrutalism handoff's own
// EMERGENCY STOP treatment (Quillrun Neobrutalism.dc.html's Guardrails
// screen). Previously used bg-sidebar for an "always dark regardless of
// theme" look, back when --sidebar was #171410 (near-black); that token
// now carries the sidebar's own peach (#FFE8D6), so this needed its own
// explicit color rather than borrowing the sidebar's.
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
    <div className="border-[3px] border-foreground bg-primary p-5 shadow-[8px_8px_0_#111]">
      <div className="font-display text-lg tracking-tight">EMERGENCY STOP</div>
      <p className="mt-3 text-[13px] leading-relaxed">
        Stops every run in flight across all {siteCount} site
        {siteCount === 1 ? "" : "s"}, and blocks publishing until you resume.
        Drafts already written are kept.
      </p>
      <button
        className="mt-4 w-full border-[3px] border-foreground bg-foreground py-3 font-display text-[15px] text-background tracking-tight transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        disabled={!canManage || isPending}
        onClick={handleToggle}
        type="button"
      >
        {isPending
          ? "WORKING…"
          : paused
            ? "RESUME ALL AGENT ACTIVITY"
            : "STOP EVERYTHING NOW"}
      </button>
      {error && <p className="mt-2 font-medium text-sm">{error}</p>}
      <div className="mt-4 flex flex-col gap-2 border-foreground border-t-2 pt-4">
        {facts.map((f) => (
          <div className="flex items-baseline justify-between gap-3" key={f.k}>
            <span className="text-[11.5px]">{f.k}</span>
            <span className="font-bold text-[11.5px]">{f.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
