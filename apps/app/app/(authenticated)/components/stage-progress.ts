// Turns a run's raw status/current_step into a 6-pip progress indicator +
// plain-English label, replacing the table's old behaviour of printing raw
// DB values like `approval_gate` or `topic_selection` directly in the Stage
// column - the exact gap the Quillrun Dashboard design doc called out.
// Bucket boundaries match packages/ai-engine's PipelineStepName order.

const RESEARCH_STEPS = new Set(["topic_selection", "research", "outline"]);
const GATE_STEPS = new Set([
  "content_guidelines_check",
  "site_reference_check",
  "geo_seo_optimize",
  "policy_check",
  "duplicate_check",
  "keyword_volume_check",
]);

export interface StageProgress {
  readonly done: number;
  readonly active: boolean;
  readonly total: number;
  readonly label: string;
}

const TOTAL_PIPS = 6;

export const deriveStageProgress = (run: {
  status: string;
  currentStep: string | null;
}): StageProgress => {
  if (run.status === "running") {
    if (run.currentStep === "approval_gate") {
      return { done: 4, active: true, total: TOTAL_PIPS, label: "Approval gate" };
    }
    if (run.currentStep === "draft") {
      return { done: 2, active: true, total: TOTAL_PIPS, label: "Drafting" };
    }
    if (run.currentStep && GATE_STEPS.has(run.currentStep)) {
      return { done: 3, active: true, total: TOTAL_PIPS, label: "Quality gates" };
    }
    if (run.currentStep && RESEARCH_STEPS.has(run.currentStep)) {
      return { done: 1, active: true, total: TOTAL_PIPS, label: "Researching" };
    }
    return { done: 0, active: true, total: TOTAL_PIPS, label: run.currentStep ?? "Starting" };
  }
  if (run.status === "succeeded") {
    return { done: 5, active: false, total: TOTAL_PIPS, label: "Draft ready" };
  }
  if (run.status === "blocked") {
    return { done: 3, active: false, total: TOTAL_PIPS, label: "Blocked by policy" };
  }
  if (run.status === "rejected") {
    return { done: 4, active: false, total: TOTAL_PIPS, label: "Rejected" };
  }
  // failed - could have died at any step; without a finer error taxonomy,
  // showing it as having reached furthest (5) is more honest than guessing
  // exactly where, since publish failures (the most common case) happen last.
  return { done: 5, active: false, total: TOTAL_PIPS, label: "Failed" };
};

export const stagePipFill = (
  index: number,
  progress: StageProgress
): "done" | "active" | "empty" => {
  if (index < progress.done) {
    return "done";
  }
  if (index === progress.done && progress.active) {
    return "active";
  }
  return "empty";
};
