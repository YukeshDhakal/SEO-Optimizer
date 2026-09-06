import Link from "next/link";
import type { ViewMode } from "./site-overview-data";

const LABELS: Record<ViewMode, string> = {
  triage: "Triage",
  console: "Console",
  board: "Board",
};

interface ViewSwitcherProperties {
  readonly siteId: string;
  readonly active: ViewMode;
}

// Plain server-rendered links driven by ?view= — no client JS needed, and it
// keeps the page a pure server component (each view fetches nothing extra;
// page.tsx already fetches the one shared dataset all three views read).
export const ViewSwitcher = ({ siteId, active }: ViewSwitcherProperties) => (
  <div className="flex w-fit border-[3px] border-foreground bg-card">
    {(["triage", "console", "board"] as const).map((mode, index) => (
      <Link
        className={`px-4 py-2 font-bold text-xs uppercase tracking-wide ${
          index > 0 ? "border-foreground border-l-[3px]" : ""
        } ${
          mode === active
            ? "bg-foreground text-background"
            : "hover:bg-muted/50"
        }`}
        href={mode === "triage" ? `/sites/${siteId}` : `/sites/${siteId}?view=${mode}`}
        key={mode}
      >
        {LABELS[mode]}
      </Link>
    ))}
  </div>
);
