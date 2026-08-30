"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { useState, useTransition } from "react";
import { toggleGlobalPause } from "../../actions/tenant-settings/toggle-pause";

interface StatusBarProps {
  readonly organizationId: string;
  readonly canManage: boolean;
  readonly paused: boolean;
  readonly requireApproval: boolean;
  readonly runningCount: number;
  readonly awaitingApprovalCount: number;
}

// The one piece of UI the whole redesign is organized around (see
// PROCESS_ARCHITECTURE.md §0 and §6): a human is trusting this loop to run
// unattended, so a persistent, always-visible "is it running, and can I
// stop it right now" surface sits above every screen, not buried in
// Settings. Real state throughout - tenant_settings.paused/require_approval,
// and a live count of pipeline_runs currently running or holding at the
// approval gate, not mockup placeholder numbers.
export const StatusBar = ({
  organizationId,
  canManage,
  paused,
  requireApproval,
  runningCount,
  awaitingApprovalCount,
}: StatusBarProps) => {
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

  const subParts: string[] = [];
  if (paused) {
    subParts.push("no runs will start and nothing will publish");
  } else {
    if (runningCount > 0) {
      subParts.push(`${runningCount} run${runningCount === 1 ? "" : "s"} in progress`);
    }
    if (awaitingApprovalCount > 0) {
      subParts.push(
        `${awaitingApprovalCount} draft${awaitingApprovalCount === 1 ? "" : "s"} waiting on approval`
      );
    }
    if (subParts.length === 0) {
      subParts.push("idle, nothing running right now");
    }
  }

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex min-h-[54px] flex-wrap items-center gap-3.5 border-b px-6",
        paused
          ? "border-status-warning-fg/25 bg-status-warning-bg"
          : "border-border bg-background"
      )}
    >
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          paused ? "bg-status-warning-fg" : "animate-pulse bg-status-info-fg"
        )}
      />
      <div className="flex flex-col gap-0.5">
        <span
          className={cn(
            "font-semibold text-[12.5px] leading-tight",
            paused ? "text-status-warning-fg" : "text-foreground"
          )}
        >
          {paused ? "Agent stopped" : "Agent running"}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground leading-tight">
          {subParts.join(" · ")}
        </span>
      </div>
      <div className="flex-1" />
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1",
          requireApproval
            ? "border-primary/25 bg-primary/10 text-primary"
            : "border-status-warning-fg/30 bg-status-warning-bg text-status-warning-fg"
        )}
      >
        <span className="font-mono text-[10px] leading-none">
          {requireApproval ? "◎" : "⚠"}
        </span>
        <span className="font-medium text-[11.5px]">
          {requireApproval ? "Approval required" : "Publishing without review"}
        </span>
      </div>
      {canManage && (
        <Button
          className={cn(
            "h-8 gap-1.5 font-semibold text-[12.5px]",
            paused
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-status-error-fg/30 bg-background text-status-error-fg hover:bg-status-error-bg"
          )}
          disabled={isPending}
          onClick={handleToggle}
          size="sm"
          variant={paused ? "default" : "outline"}
        >
          <span className="font-mono text-[10px] leading-none">
            {paused ? "▸" : "‖"}
          </span>
          {isPending ? "Working…" : paused ? "Resume agent" : "Stop the agent"}
        </Button>
      )}
      {error && (
        <p className="w-full text-status-error-fg text-xs">{error}</p>
      )}
    </div>
  );
};
