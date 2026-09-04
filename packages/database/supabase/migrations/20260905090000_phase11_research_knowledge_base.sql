-- Phase 11: research knowledge base.
--
-- Part 1 backfill-documents schema drift that already exists live in the
-- real Supabase project (pgvector extension, posts.content_embedding,
-- find_similar_posts) but was never committed as a migration -- a
-- 20260825140000_phase2_cms_adapters.sql comment says content_embedding
-- was "intentionally not added yet" at that phase, yet it's live today.
-- All three statements are exact no-ops against the real project: the
-- extension/column guards are inherently safe, and find_similar_posts
-- below was copied verbatim from
-- select pg_get_functiondef('public.find_similar_posts'::regproc) run
-- against production (2026-09-04) -- do not hand-edit this function body
-- without re-running that check first.
create extension if not exists vector;

alter table posts add column if not exists content_embedding vector(1536);

CREATE OR REPLACE FUNCTION public.find_similar_posts(p_site_connection_id uuid, p_embedding vector, p_threshold double precision DEFAULT 0.92, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, similarity double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, title, 1 - (content_embedding <=> p_embedding) as similarity
  from posts
  where site_connection_id = p_site_connection_id
    and content_embedding is not null
    and 1 - (content_embedding <=> p_embedding) >= p_threshold
  order by content_embedding <=> p_embedding
  limit p_limit;
$function$;

-- Part 2: new tables/functions for cross-run research reuse -- no drift
-- risk, brand new.

-- Chunked, embedded source text collected during research, so a later run
-- on the same site can retrieve real prior findings instead of re-deriving
-- them from scratch. Fixed at vector(768) (Ollama's nomic-embed-text, the
-- default local provider) -- switching RESEARCH_EMBEDDING_PROVIDER to
-- "openai" (1536-dim) without a follow-up migration widening this column
-- makes every insert/query fail silently (both are best-effort/swallowed;
-- see embedding.ts and ai-steps.ts). See generateResearchEmbedding.
--
-- Upserted on (site_connection_id, source_url, chunk_index): Workflow
-- DevKit retries a failed "use step" call from scratch, and without this
-- natural key a retry after a partial write would duplicate every chunk
-- that already made it in.
create table research_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_connection_id uuid not null references site_connections(id) on delete cascade,
  source_url text not null,
  source_title text,
  chunk_text text not null,
  chunk_index int not null default 0,
  embedding vector(768),
  embedding_model text not null default 'nomic-embed-text',
  created_at timestamptz not null default now(),
  unique (site_connection_id, source_url, chunk_index)
);

create index idx_research_chunks_site on research_chunks(site_connection_id);

-- Deliberately no vector index yet: ivfflat needs a meaningful amount of
-- existing data before its clustering step produces a useful index --
-- building one now, at this project's real early-stage row counts, would
-- give worse recall than the plain scan below and isn't needed for
-- performance at this scale. A follow-up migration should add an hnsw
-- index (not ivfflat -- hnsw doesn't need pre-existing data to build well;
-- pgvector 0.8.2 is already live, which supports it) once row counts
-- justify it -- realistically tens of thousands of rows, not hundreds.

alter table research_chunks enable row level security;

-- Same site-scoped member-read/admin-write split as url_inspections
-- (phase 9) / search_console_queries (phase 7). The pipeline itself writes
-- through the service-role client (bypasses RLS) -- these policies govern
-- only a future dashboard read, if one is ever built.
create policy research_chunks_select
  on research_chunks for select
  using (is_org_member_for_site(site_connection_id));

create policy research_chunks_insert
  on research_chunks for insert
  with check (is_org_admin_for_site(site_connection_id));

create policy research_chunks_update
  on research_chunks for update
  using (is_org_admin_for_site(site_connection_id))
  with check (is_org_admin_for_site(site_connection_id));

create policy research_chunks_delete
  on research_chunks for delete
  using (is_org_admin_for_site(site_connection_id));

-- Retrieval RPC. Filters on p_min_similarity (not just p_limit) so a site
-- with no relevant prior research returns nothing rather than N
-- barely-related chunks just because they were the closest of a bad lot.
create or replace function public.find_similar_research_chunks(
  p_site_connection_id uuid,
  p_embedding vector(768),
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

-- Only the service-role client (fetchResearchContextStep) ever calls this -
-- deliberately NOT granted to authenticated: it trusts the caller-supplied
-- p_site_connection_id with no internal org-membership check (unlike this
-- repo's get_site_credentials-style RPCs, which check auth.uid() before
-- returning data), so granting it to signed-in users would let any org
-- pull another org's research_chunks content directly via
-- /rest/v1/rpc/find_similar_research_chunks, bypassing the RLS policies
-- above entirely (SECURITY DEFINER functions bypass table RLS). Caught by
-- the Supabase security advisor immediately after this migration first
-- shipped with an authenticated grant - see the follow-up
-- 20260905091500_phase11_lock_down_find_similar_research_chunks_grant.sql
-- fix, and PRD.md's "Recurring pattern worth knowing" for why this check
-- always runs.
revoke all on function public.find_similar_research_chunks(uuid, vector, int, float) from public;
revoke execute on function public.find_similar_research_chunks(uuid, vector, int, float) from anon;
revoke execute on function public.find_similar_research_chunks(uuid, vector, int, float) from authenticated;
