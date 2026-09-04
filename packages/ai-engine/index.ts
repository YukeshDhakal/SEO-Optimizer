export { getModel } from "./model";
export { webSearchTool } from "./search";
export type { WebSearchResult } from "./search";
export { generateEmbedding, generateResearchEmbedding } from "./embedding";
export { runPolicyCheck } from "./policy-check";
export type { PolicyCheckResult } from "./policy-check";
export {
  PipelineValidationError,
  runContentPipeline,
} from "./pipeline";
export type {
  PipelineCallbacks,
  PipelinePost,
  PipelineResult,
  PipelineStepName,
  RunPipelineInput,
} from "./pipeline";
export * from "./schemas";
export {
  validateContentGuidelines,
  validateGeoSeoOutput,
  validateSiteReference,
} from "./validation";
export type { ValidationResult } from "./validation";
export type { ContentType } from "./content-guidelines";

// Individual step functions, exported for Phase 4's `@repo/workflows` package
// to wrap as durable Workflow DevKit steps. `pipeline.ts`'s own
// `runContentPipeline` keeps importing these directly too (unaffected,
// still the plain-function path its unit tests exercise).
export { selectTopic } from "./steps/topic-selection";
export type { TopicSelectionInput, TopicSelectionQuery } from "./steps/topic-selection";
export { research } from "./steps/research";
export type { ResearchInput } from "./steps/research";
export { outline } from "./steps/outline";
export type { OutlineInput } from "./steps/outline";
export { draft } from "./steps/draft";
export type { DraftInput } from "./steps/draft";
export { geoSeoOptimize } from "./steps/geo-seo-optimize";
export type { GeoSeoOptimizeInput } from "./steps/geo-seo-optimize";
