// Thin "use step" wrappers around `@repo/ai-engine`'s plain step functions.
// Each one does real network I/O (Anthropic API calls) so needs a step's
// full Node.js access and gets the Workflow DevKit's automatic
// caching/retry — a crash mid-pipeline resumes at whichever step didn't
// finish rather than restarting from `topic_selection`. The functions
// themselves stay in `@repo/ai-engine`, unchanged, so Phase 3's 21 unit
// tests (and the plain-function `runContentPipeline` path they cover)
// keep working exactly as before.
import {
  draft as draftFn,
  generateResearchEmbedding,
  getResearchEmbeddingModel,
  geoSeoOptimize as geoSeoOptimizeFn,
  outline as outlineFn,
  research as researchFn,
  runPolicyCheck,
  selectTopic,
  type DraftInput,
  type GeoSeoOptimizeInput,
  type GeoSeoOutput,
  type Outline,
  type OutlineInput,
  type PolicyCheckResult,
  type ResearchContextChunk,
  type ResearchInput,
  type ResearchResult,
  type ResearchSource,
  type TopicSelection,
} from "@repo/ai-engine";
import { database } from "@repo/database";

export interface TopicSelectionStepInput {
  organizationId: string;
  topicHint: string;
  siteConnectionId: string;
}

const MAX_GROUNDING_QUERIES = 10;

// Phase 7: reads this site's cached top Search Console queries (populated
// by apps/api's daily sync-search-console cron, empty for any site that
// hasn't connected GSC yet) and forwards them into @repo/ai-engine's
// selectTopic — which stays DB-agnostic, so the read happens here rather
// than inside ai-engine itself. Done inline in this one step (not a
// separate "use step" function) since steps in this codebase always do
// their own `database` reads directly (see db-steps.ts) rather than calling
// another step — nesting isn't part of the established pattern here.
export const topicSelectionStep = async (
  input: TopicSelectionStepInput
): Promise<TopicSelection> => {
  "use step";

  const { data: queries } = await database
    .from("search_console_queries")
    .select("query, clicks, impressions")
    .eq("site_connection_id", input.siteConnectionId)
    .order("clicks", { ascending: false })
    .limit(MAX_GROUNDING_QUERIES);

  return selectTopic({
    organizationId: input.organizationId,
    topicHint: input.topicHint,
    gscQueries: queries ?? undefined,
  });
};

export const researchStep = async (
  input: ResearchInput
): Promise<ResearchResult> => {
  "use step";
  return researchFn(input);
};

export interface FetchResearchContextStepInput {
  siteConnectionId: string;
  topic: string;
  primaryKeyword: string;
}

const MAX_PRIOR_CONTEXT_CHUNKS = 5;

// Phase 11: retrieves prior research for this site before researchStep
// runs, same "own database read, ai-engine stays DB-agnostic" convention as
// topicSelectionStep above. Deliberately a SEPARATE step from researchStep
// (not folded into it): Workflow DevKit retries a failed step from the top,
// so a combined pre-read + Tavily/LLM call + post-write step would re-pay
// for the expensive search/LLM work on every retry of a cheap DB
// read/write. Best-effort - returns [] rather than throwing, since missing
// prior context should never block a run that would otherwise succeed.
export const fetchResearchContextStep = async (
  input: FetchResearchContextStepInput
): Promise<ResearchContextChunk[]> => {
  "use step";

  const embedding = await generateResearchEmbedding(
    `${input.topic} ${input.primaryKeyword}`
  );
  if (!embedding) {
    return [];
  }

  const { data, error } = await database.rpc("find_similar_research_chunks", {
    p_site_connection_id: input.siteConnectionId,
    p_embedding: embedding as unknown as string,
    p_limit: MAX_PRIOR_CONTEXT_CHUNKS,
  });
  if (error || !data) {
    if (error) {
      console.error("fetchResearchContextStep: RPC failed:", error);
    }
    return [];
  }

  return data.map((row) => ({
    chunkText: row.chunk_text,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
  }));
};

const CHUNK_TARGET_CHARS = 800;

// Simple sentence-boundary splitter - good enough for chunking a Tavily
// snippet (a few hundred to ~2000 chars), not meant to handle arbitrary
// long-form text.
const chunkText = (text: string): string[] => {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > CHUNK_TARGET_CHARS) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? " " : "") + sentence;
  }
  if (current) {
    chunks.push(current.trim());
  }
  return chunks;
};

export interface StoreResearchChunksStepInput {
  organizationId: string;
  siteConnectionId: string;
  sources: ResearchSource[];
}

// Phase 11: chunks + embeds researchStep's own source content and upserts
// into research_chunks for future runs to retrieve via
// fetchResearchContextStep above. Called AFTER researchStep, not folded
// into it, for the same retry-cost reason as fetchResearchContextStep.
// Upserts on (site_connection_id, source_url, chunk_index) so a retried
// call is a no-op, never a duplicate. Wrapped in try/catch - best-effort,
// same posture as guardrails.ts's writeAuditLog - since nothing upstream
// catches around a directly-called step the way runTrackedStep does, and a
// knowledge-base write failure must never fail an otherwise-valid run.
export const storeResearchChunksStep = async (
  input: StoreResearchChunksStepInput
): Promise<void> => {
  "use step";

  try {
    const rows = input.sources.flatMap((source) =>
      chunkText(source.content ?? "").map((text, chunkIndex) => ({
        organization_id: input.organizationId,
        site_connection_id: input.siteConnectionId,
        source_url: source.url,
        source_title: source.title,
        chunk_text: text,
        chunk_index: chunkIndex,
        // Set explicitly, not left to a column default - the column has
        // none as of Phase 12, since a default would mislabel a row if
        // RESEARCH_EMBEDDING_PROVIDER is ever switched.
        embedding_model: getResearchEmbeddingModel(),
      }))
    );
    if (rows.length === 0) {
      return;
    }

    const embedded = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        embedding: await generateResearchEmbedding(row.chunk_text),
      }))
    );
    const insertable = embedded.filter(
      (row): row is typeof row & { embedding: number[] } => row.embedding !== null
    );
    if (insertable.length === 0) {
      // Distinct from "no chunks to embed" above: real content existed
      // (rows.length > 0) but every single embedding call came back null.
      // generateResearchEmbedding logs its own per-call error - this is
      // the higher-level signal that the whole store silently no-op'd
      // despite having real work to do.
      console.error(
        `storeResearchChunksStep: ${rows.length} chunk(s) ready but every embedding call returned null - nothing stored for site ${input.siteConnectionId}`
      );
      return;
    }

    const { error } = await database.from("research_chunks").upsert(
      insertable.map((row) => ({
        ...row,
        embedding: row.embedding as unknown as string,
      })),
      { onConflict: "site_connection_id,source_url,chunk_index" }
    );
    if (error) {
      console.error("storeResearchChunksStep: upsert failed:", error);
    }
  } catch (error) {
    // Best-effort - a knowledge-base write failure must never fail an
    // otherwise-valid run - but logged, not silent.
    console.error("storeResearchChunksStep threw:", error);
  }
};

export const outlineStep = async (input: OutlineInput): Promise<Outline> => {
  "use step";
  return outlineFn(input);
};

export const draftStep = async (input: DraftInput): Promise<string> => {
  "use step";
  return draftFn(input);
};

export const geoSeoOptimizeStep = async (
  input: GeoSeoOptimizeInput
): Promise<GeoSeoOutput> => {
  "use step";
  return geoSeoOptimizeFn(input);
};

// Pure/deterministic (no I/O) but kept as a step anyway: it needs to be
// paired with `recordStepStart`/`recordStepComplete` (real DB steps) around
// it for `pipeline_run_steps` observability, and workflow-body code isn't
// allowed to call arbitrary functions from packages outside its own
// sandboxed scope reliably — running it as a step is the same pattern
// `db-steps.ts` uses and keeps every pipeline stage uniformly a step.
export const policyCheckStep = async (
  contentMarkdown: string
): Promise<PolicyCheckResult> => {
  "use step";
  return runPolicyCheck(contentMarkdown);
};
