import Link from "next/link";
import { topicOf } from "../../components/runs-table";
import {
  deriveStage,
  type OverviewRun,
  type PipelineStage,
} from "./site-overview-data";

interface BoardViewProperties {
  readonly siteId: string;
  readonly runs: readonly OverviewRun[];
  readonly postStatusById: ReadonlyMap<string, string>;
  readonly postPublishedAtById: ReadonlyMap<string, string | null>;
}

interface Lane {
  readonly stage: PipelineStage;
  readonly title: string;
}

// The mock's 5 lanes have no slot for failed/blocked/rejected runs — rather
// than silently dropping real failures to match it literally, they land in
// this extra "Attention" lane so nothing disappears from view.
const LANES: readonly Lane[] = [
  { stage: "researching", title: "Researching" },
  { stage: "drafting", title: "Drafting" },
  { stage: "awaiting_approval", title: "Awaiting approval" },
  { stage: "ready_to_publish", title: "Ready to publish" },
  { stage: "published", title: "Published, 7d" },
];

const ATTENTION_STAGES = new Set<PipelineStage>([
  "failed",
  "blocked",
  "rejected",
]);

const sevenDaysAgo = () => Date.now() - 7 * 24 * 60 * 60 * 1000;

export const BoardView = ({
  siteId,
  runs,
  postStatusById,
  postPublishedAtById,
}: BoardViewProperties) => {
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

  const stageOf = (run: OverviewRun): PipelineStage => {
    const postStatus = run.post_id ? postStatusById.get(run.post_id) : null;
    return deriveStage(run, postStatus);
  };

  const laneRuns = (stage: PipelineStage) =>
    runs.filter((run) => {
      const s = stageOf(run);
      if (s !== stage) {
        return false;
      }
      if (stage === "published") {
        const publishedAt = run.post_id
          ? postPublishedAtById.get(run.post_id)
          : null;
        return publishedAt ? new Date(publishedAt).getTime() >= sevenDaysAgo() : false;
      }
      return true;
    });

  const attentionRuns = runs.filter((run) => ATTENTION_STAGES.has(stageOf(run)));

  const allLanes = [
    ...LANES.map((lane) => ({ ...lane, cards: laneRuns(lane.stage) })),
    { stage: "failed" as PipelineStage, title: "Attention", cards: attentionRuns },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-[minmax(220px,1fr)]">
      {allLanes.map((lane) => (
        <div
          className="flex min-h-[160px] flex-col border-[3px] border-foreground bg-card"
          key={lane.title}
        >
          <div className="flex items-center justify-between border-foreground border-b-[3px] bg-muted px-3 py-2">
            <span className="font-bold text-[11px] uppercase tracking-wider">
              {lane.title}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {lane.cards.length}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-2">
            {lane.cards.length === 0 && (
              <p className="p-2 text-muted-foreground text-xs">
                Nothing here
              </p>
            )}
            {lane.cards.map((run) => (
              <Link
                className="border-2 border-foreground bg-background p-2 text-xs shadow-[3px_3px_0_#111] hover:bg-muted/40"
                href={`/sites/${siteId}/runs/${run.id}`}
                key={run.id}
              >
                <p className="line-clamp-2 font-medium">{topicOf(run.input)}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {new Date(run.started_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
