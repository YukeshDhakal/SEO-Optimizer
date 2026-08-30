import type { ReactNode } from "react";
import { cn } from "@repo/design-system/lib/utils";

// The six-state system from the Quillrun Design handoff ("Quillrun
// Variations.dc.html", section 1a - the variant the prototype ships with):
// colour plus a glyph plus a distinct corner radius per state, so status is
// legible even if colour perception or a screen fails. Backed by the same
// --status-*-bg/-fg tokens packages/design-system/styles/globals.css
// already defines (added in the earlier partial reskin, commit 6e5492e) -
// this component is the piece that was still missing: a single place that
// maps a state to {colour, glyph, shape}, replacing the handful of
// ad hoc `statusVariant()` functions duplicated across sites/runs/posts/
// audit pages.
export type PillStatus =
  | "ok"
  | "running"
  | "await"
  | "blocked"
  | "failed"
  | "paused"
  | "draft";

const STATUS: Record<
  PillStatus,
  { bg: string; fg: string; glyph: string; radius: string; label: string }
> = {
  ok: {
    bg: "bg-status-success-bg",
    fg: "text-status-success-fg",
    glyph: "●",
    radius: "rounded-full",
    label: "Active",
  },
  running: {
    bg: "bg-status-info-bg",
    fg: "text-status-info-fg",
    glyph: "◐",
    radius: "rounded-full",
    label: "Running",
  },
  await: {
    bg: "bg-status-warning-bg",
    fg: "text-status-warning-fg",
    glyph: "◎",
    radius: "rounded-[3px]",
    label: "Awaiting approval",
  },
  blocked: {
    bg: "bg-status-neutral-bg",
    fg: "text-status-neutral-fg",
    glyph: "⊘",
    radius: "rounded-[3px]",
    label: "Blocked",
  },
  failed: {
    bg: "bg-status-error-bg",
    fg: "text-status-error-fg",
    glyph: "✕",
    radius: "rounded-[2px]",
    label: "Failed",
  },
  paused: {
    bg: "bg-status-muted-bg",
    fg: "text-status-muted-fg",
    glyph: "‖",
    radius: "rounded-[2px]",
    label: "Paused",
  },
  draft: {
    bg: "bg-status-muted-bg",
    fg: "text-status-muted-fg",
    glyph: "○",
    radius: "rounded-full",
    label: "Draft",
  },
};

interface StatusPillProps {
  readonly status: PillStatus;
  readonly children?: ReactNode;
  readonly className?: string;
}

export const StatusPill = ({ status, children, className }: StatusPillProps) => {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 font-medium text-xs",
        s.bg,
        s.fg,
        s.radius,
        className
      )}
    >
      <span className="font-mono text-[9px] leading-none">{s.glyph}</span>
      {children ?? s.label}
    </span>
  );
};

// Raw {glyph, colour} for a status, for callers building their own compact
// layout (e.g. a dense log row) rather than using the boxed StatusPill.
export const statusGlyph = (status: PillStatus): { glyph: string; fg: string } => {
  const s = STATUS[status];
  return { glyph: s.glyph, fg: s.fg };
};

// A bare status dot, no label - for the sidebar's per-site indicators and
// table sparkline cells, where a pill would be too heavy.
export const StatusDot = ({ status, className }: { status: PillStatus | "none"; className?: string }) => {
  if (status === "none") {
    return (
      <span
        className={cn("inline-block h-1.5 w-1.5 rounded-full bg-muted", className)}
      />
    );
  }
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5",
        s.radius === "rounded-full" ? "rounded-full" : "rounded-[2px]",
        s.fg.replace("text-", "bg-"),
        className
      )}
    />
  );
};
