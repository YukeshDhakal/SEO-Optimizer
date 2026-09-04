import { StatusPill } from "@repo/design-system/components/status-pill";
import Link from "next/link";

export interface RunRow {
  readonly id: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly topic: string;
  readonly status: string;
  readonly currentStep: string | null;
  readonly triggerType: string;
  readonly startedAt: string;
  readonly contentType: "blog" | "faq";
}

export const runPillStatus = (run: {
  status: string;
  current_step: string | null;
}) => {
  if (run.status === "running" && run.current_step === "approval_gate") {
    return "await" as const;
  }
  if (run.status === "running") {
    return "running" as const;
  }
  if (run.status === "succeeded") {
    return "ok" as const;
  }
  if (run.status === "blocked" || run.status === "rejected") {
    return "blocked" as const;
  }
  return "failed" as const;
};

export const runLabel = (run: {
  status: string;
  current_step: string | null;
}) => {
  if (run.status === "running" && run.current_step === "approval_gate") {
    return "Awaiting approval";
  }
  if (run.status === "running") {
    return "Running";
  }
  if (run.status === "succeeded") {
    // A succeeded run only ever creates a `posts` row with status:'draft'
    // (see finalizeRunSucceeded) - actually going live on the tenant's CMS
    // is a separate, explicit "Publish now" action (packages/workflows/
    // db-steps.ts's own comment on this handoff point). Labeling this
    // "Published" was flatly wrong - found by a live test where a
    // succeeded, still-unpublished run showed a green "Published" pill.
    return "Draft ready";
  }
  if (run.status === "blocked") {
    return "Blocked by policy";
  }
  if (run.status === "rejected") {
    return "Rejected";
  }
  return "Failed";
};

export const topicOf = (input: unknown): string =>
  (input as { topicHint?: string } | null)?.topicHint ?? "Untitled run";

export const contentTypeOf = (input: unknown): "blog" | "faq" =>
  (input as { contentType?: string } | null)?.contentType === "faq"
    ? "faq"
    : "blog";

interface RunsTableProperties {
  readonly rows: RunRow[];
  readonly showSiteColumn: boolean;
  readonly emptyMessage: string;
}

// Shared by the global Runs page (`/`, cross-site) and each site's own Runs
// tab (`/sites/[id]/runs`, filtered) — the mock's Runs screen is a single
// flat table with a Site column, so this is the one place that shape lives.
export const RunsTable = ({
  rows,
  showSiteColumn,
  emptyMessage,
}: RunsTableProperties) => {
  if (rows.length === 0) {
    return (
      <p className="font-medium text-muted-foreground text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border-[3px] border-foreground">
      <table className="w-full text-sm">
        <thead className="border-foreground border-b-[3px] bg-muted text-left font-bold text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3">Topic</th>
            <th className="px-4 py-3">Type</th>
            {showSiteColumn && <th className="px-4 py-3">Site</th>}
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Trigger</th>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3">State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((run) => (
            <tr
              className="border-foreground border-b-2 transition-colors last:border-b-0 hover:bg-accent/30"
              key={run.id}
            >
              <td className="max-w-xs truncate px-4 py-3.5 font-bold">
                <Link
                  className="hover:text-primary"
                  href={`/sites/${run.siteId}/runs/${run.id}`}
                >
                  {run.topic}
                </Link>
              </td>
              <td className="px-4 py-3.5">
                <span className="border-2 border-foreground bg-secondary px-1.5 py-0.5 font-bold text-[10px] text-secondary-foreground uppercase tracking-wide">
                  {run.contentType === "faq" ? "FAQ" : "Blog"}
                </span>
              </td>
              {showSiteColumn && (
                <td className="px-4 py-3.5 font-medium text-muted-foreground">
                  {run.siteName}
                </td>
              )}
              <td className="px-4 py-3.5 font-semibold">
                {run.currentStep ?? "—"}
              </td>
              <td className="px-4 py-3.5 font-mono text-muted-foreground text-xs uppercase">
                {run.triggerType}
              </td>
              <td className="px-4 py-3.5 font-mono text-muted-foreground text-xs">
                {new Date(run.startedAt).toLocaleString()}
              </td>
              <td className="px-4 py-3.5">
                <StatusPill
                  status={runPillStatus({
                    status: run.status,
                    current_step: run.currentStep,
                  })}
                >
                  {runLabel({
                    status: run.status,
                    current_step: run.currentStep,
                  })}
                </StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
