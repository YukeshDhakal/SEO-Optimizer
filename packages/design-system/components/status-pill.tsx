import type { ReactNode } from "react";
import { cn } from "@repo/design-system/lib/utils";

// Status is signalled by colour + glyph + a 2px border (never radius --
// the neobrutalism handoff uses zero border-radius everywhere, so the
// original design's per-state corner-radius differentiation (rounded-full/
// rounded-[3px]/rounded-[2px]) was dropped; colour+glyph alone still means
// status reads correctly even if colour perception or a screen fails.
// Backed by the same --status-*-bg/-fg tokens packages/design-system/
// styles/globals.css defines, now mapped onto the mock's own badge colours
// (RUNNING=orange, PUBLISHED=lime, NEEDS YOU=yellow, FAILED CLOSED=black).
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
  { bg: string; fg: string; glyph: string; border: string; label: string }
> = {
  ok: {
    bg: "bg-status-success-bg",
    fg: "text-status-success-fg",
    glyph: "●",
    border: "border-foreground",
    label: "Active",
  },
  running: {
    bg: "bg-status-info-bg",
    fg: "text-status-info-fg",
    glyph: "◐",
    border: "border-foreground",
    label: "Running",
  },
  await: {
    bg: "bg-status-warning-bg",
    fg: "text-status-warning-fg",
    glyph: "◎",
    border: "border-foreground",
    label: "Awaiting approval",
  },
  blocked: {
    bg: "bg-status-neutral-bg",
    fg: "text-status-neutral-fg",
    glyph: "⊘",
    border: "border-foreground",
    label: "Blocked",
  },
  failed: {
    bg: "bg-status-error-bg",
    fg: "text-status-error-fg",
    glyph: "✕",
    border: "border-foreground",
    label: "Failed",
  },
  paused: {
    bg: "bg-status-muted-bg",
    fg: "text-status-muted-fg",
    glyph: "‖",
    border: "border-foreground",
    label: "Paused",
  },
  draft: {
    bg: "bg-status-muted-bg",
    fg: "text-status-muted-fg",
    glyph: "○",
    border: "border-foreground",
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
        "inline-flex items-center gap-1.5 border-2 px-2.5 py-0.5 font-bold text-xs",
        s.bg,
        s.fg,
        s.border,
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
        "inline-block h-2 w-2 border border-foreground",
        s.fg.replace("text-", "bg-"),
        className
      )}
    />
  );
};
