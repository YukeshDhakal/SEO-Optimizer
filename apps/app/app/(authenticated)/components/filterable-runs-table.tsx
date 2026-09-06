"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useMemo, useState } from "react";
import { type RunRow, RunsTable, runPillStatus } from "./runs-table";

type FilterKey = "all" | "running" | "ok" | "blocked" | "failed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "ok", label: "Draft ready" },
  { key: "blocked", label: "Blocked" },
  { key: "failed", label: "Failed" },
];

interface FilterableRunsTableProperties {
  readonly rows: RunRow[];
  readonly showSiteColumn: boolean;
  readonly emptyMessage: string;
}

// Real counts computed from the already-fetched rows, not fabricated - the
// design's filter chips ("All 50 / Running 3 / ...") are illustrative
// numbers from its own mock data, this uses whatever the org's real runs are.
export const FilterableRunsTable = ({
  rows,
  showSiteColumn,
  emptyMessage,
}: FilterableRunsTableProperties) => {
  const [active, setActive] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const byStatus: Record<FilterKey, number> = {
      all: rows.length,
      running: 0,
      ok: 0,
      blocked: 0,
      failed: 0,
    };
    for (const row of rows) {
      const pill = runPillStatus({ status: row.status, current_step: row.currentStep });
      if (pill === "await") {
        byStatus.running += 1;
      } else if (pill in byStatus) {
        byStatus[pill as FilterKey] += 1;
      }
    }
    return byStatus;
  }, [rows]);

  const filtered = useMemo(() => {
    if (active === "all") {
      return rows;
    }
    return rows.filter((row) => {
      const pill = runPillStatus({ status: row.status, current_step: row.currentStep });
      return active === "running" ? pill === "running" || pill === "await" : pill === active;
    });
  }, [rows, active]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            className={cn(
              "border-[3px] border-foreground px-2.5 py-1 font-bold text-xs",
              active === f.key ? "bg-foreground text-background" : "bg-card"
            )}
            key={f.key}
            onClick={() => setActive(f.key)}
            type="button"
          >
            {f.label} {counts[f.key]}
          </button>
        ))}
      </div>
      <RunsTable
        emptyMessage={active === "all" ? emptyMessage : "Nothing matches this filter."}
        rows={filtered}
        showSiteColumn={showSiteColumn}
      />
    </div>
  );
};
