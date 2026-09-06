// Shared data shapes + pure derivations for the three switchable Overview
// views (triage / console / board). Kept framework-free (no Supabase calls
// here) so each view component and page.tsx can reuse the same stage logic
// without re-deriving it — mirrors the existing runPillStatus/runLabel split
// in ../../components/runs-table.tsx, just extended with the extra buckets
// the board view needs (researching vs. drafting, published vs. ready).

export interface OverviewRun {
  readonly id: string;
  readonly input: unknown;
  readonly status: string;
  readonly current_step: string | null;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly error: string | null;
  readonly post_id: string | null;
}

export interface OverviewPost {
  readonly id: string;
  readonly status: string;
  readonly published_at: string | null;
}

export type PipelineStage =
  | "researching"
  | "drafting"
  | "awaiting_approval"
  | "ready_to_publish"
  | "published"
  | "blocked"
  | "rejected"
  | "failed";

// Matches the step names in packages/ai-engine/pipeline.ts's
// PipelineStepName - kept as a plain Set here rather than importing that
// package, since this file only needs the two-way split, not the full type.
const RESEARCH_STEPS = new Set(["topic_selection", "research", "outline"]);

// postStatus is only known for succeeded runs (posts row exists once a run
// succeeds - see finalizeRunSucceeded / runs-table.tsx's own comment on the
// succeeded-but-unpublished distinction). Pass undefined/null when no post
// row exists yet or hasn't been looked up.
export const deriveStage = (
  run: Pick<OverviewRun, "status" | "current_step">,
  postStatus?: string | null
): PipelineStage => {
  if (run.status === "running") {
    if (run.current_step === "approval_gate") {
      return "awaiting_approval";
    }
    if (run.current_step && RESEARCH_STEPS.has(run.current_step)) {
      return "researching";
    }
    return "drafting";
  }
  if (run.status === "succeeded") {
    return postStatus === "published" ? "published" : "ready_to_publish";
  }
  if (run.status === "blocked") {
    return "blocked";
  }
  if (run.status === "rejected") {
    return "rejected";
  }
  return "failed";
};

export const isNeedsAttention = (stage: PipelineStage): boolean =>
  stage === "awaiting_approval" ||
  stage === "failed" ||
  stage === "blocked" ||
  stage === "rejected";

export const findLastFailure = (
  runsDesc: readonly OverviewRun[]
): OverviewRun | null =>
  runsDesc.find((run) => run.status === "failed") ?? null;

export const buildPostStatusMap = (
  posts: readonly OverviewPost[]
): ReadonlyMap<string, string> =>
  new Map(posts.map((post) => [post.id, post.status]));

export type ViewMode = "triage" | "console" | "board";

export const VIEW_MODES: readonly ViewMode[] = ["triage", "console", "board"];

export const parseViewMode = (raw: string | undefined): ViewMode =>
  raw === "console" || raw === "board" ? raw : "triage";
