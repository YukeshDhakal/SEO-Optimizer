-- Phase 12: switch the research knowledge base's embeddings to OpenAI in
-- production. RESEARCH_EMBEDDING_PROVIDER defaults to a local Ollama server
-- (localhost:11434), which Vercel's serverless functions can never reach --
-- confirmed live: research_chunks had 0 rows after real production runs.
-- OPENAI_API_KEY is already set on quillrun-app production (added
-- separately, ~5 days before this migration, for the Phase 5
-- duplicate-content guardrail), so this needs no new credential.
--
-- research_chunks has 0 rows (confirmed live) -- safe to drop+re-add the
-- embedding column at the new dimension rather than attempt an ALTER ...
-- TYPE cast between incompatible vector dimensions (768 nomic-embed-text ->
-- 1536 text-embedding-3-small; pgvector has no defined cast between
-- differently-sized vectors).
alter table research_chunks drop column embedding;
alter table research_chunks add column embedding vector(1536);

-- Was "not null default 'nomic-embed-text'" -- the app now sets this
-- explicitly per row (packages/ai-engine/embedding.ts's
-- getResearchEmbeddingModel, used in storeResearchChunksStep) so the
-- column never silently mislabels which model actually produced a given
-- row's embedding if the provider is swapped again later.
alter table research_chunks alter column embedding_model drop default;

-- find_similar_research_chunks's p_embedding parameter type must change to
-- match -- CREATE OR REPLACE cannot change a parameter's type, so drop and
-- recreate. Same lockdown as the original (see
-- 20260905091500_phase11_lock_down_find_similar_research_chunks_grant.sql):
-- service-role only, never granted to authenticated/anon/public.
drop function if exists public.find_similar_research_chunks(uuid, vector, int, float);

create function public.find_similar_research_chunks(
  p_site_connection_id uuid,
  p_embedding vector(1536),
  p_limit int default 5,
  p_min_similarity float default 0.5
)
returns table(chunk_text text, source_title text, source_url text, similarity float)
language sql
security definer
stable
set search_path = public
as $$
  select chunk_text, source_title, source_url, similarity
  from (
    select chunk_text, source_title, source_url,
      1 - (embedding <=> p_embedding) as similarity
    from research_chunks
    where site_connection_id = p_site_connection_id
      and embedding is not null
  ) scored
  where similarity >= p_min_similarity
  order by similarity desc
  limit p_limit;
$$;

revoke all on function public.find_similar_research_chunks(uuid, vector, int, float) from public;
revoke execute on function public.find_similar_research_chunks(uuid, vector, int, float) from anon;
revoke execute on function public.find_similar_research_chunks(uuid, vector, int, float) from authenticated;
