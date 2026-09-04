import { createClient } from "@repo/auth/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentOrganization } from "../../../../lib/organization";
import { SiteTabs } from "../site-tabs";

export const metadata: Metadata = { title: "Research" };

interface ResearchPageProperties {
  readonly params: Promise<{ id: string }>;
}

const PREVIEW_CHARS = 200;

interface SourceGroup {
  sourceUrl: string;
  sourceTitle: string | null;
  chunkCount: number;
  embeddingModel: string;
  firstIndexedAt: string;
  preview: string;
}

const hostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const relativeTime = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(iso).toLocaleDateString();
};

// Grouped in memory rather than in the query, same convention as
// recommendations/page.tsx's STATUS_RANK/PRIORITY_RANK sort: research_chunks
// is chunk-level (many rows per source), but a reader cares about sources,
// not raw chunk rows.
const groupBySource = (
  rows: {
    source_url: string;
    source_title: string | null;
    chunk_text: string;
    chunk_index: number;
    embedding_model: string;
    created_at: string;
  }[]
): SourceGroup[] => {
  const groups = new Map<string, SourceGroup>();

  for (const row of rows) {
    const existing = groups.get(row.source_url);
    if (!existing) {
      groups.set(row.source_url, {
        sourceUrl: row.source_url,
        sourceTitle: row.source_title,
        chunkCount: 1,
        embeddingModel: row.embedding_model,
        firstIndexedAt: row.created_at,
        preview:
          row.chunk_index === 0 ? row.chunk_text.slice(0, PREVIEW_CHARS) : "",
      });
      continue;
    }

    existing.chunkCount += 1;
    if (row.created_at < existing.firstIndexedAt) {
      existing.firstIndexedAt = row.created_at;
    }
    if (row.chunk_index === 0) {
      existing.preview = row.chunk_text.slice(0, PREVIEW_CHARS);
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      new Date(b.firstIndexedAt).getTime() -
      new Date(a.firstIndexedAt).getTime()
  );
};

const ResearchPage = async ({ params }: ResearchPageProperties) => {
  const { id } = await params;
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site_connections")
    .select("id, display_name")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const { data: rows } = await supabase
    .from("research_chunks")
    .select(
      "source_url, source_title, chunk_text, chunk_index, embedding_model, created_at"
    )
    .eq("site_connection_id", id)
    .order("created_at", { ascending: false });

  const sources = groupBySource(rows ?? []);

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">RESEARCH</h1>
        <p className="mt-1 max-w-xl text-muted-foreground text-sm">
          Source material the research step has gathered and embedded for{" "}
          {site.display_name}, reused as grounding context for future runs on
          similar topics.
        </p>
      </div>

      <SiteTabs siteId={id} />

      <div className="border-[3px] border-foreground bg-card shadow-[6px_6px_0_#111]">
        <div className="border-foreground border-b-[3px] px-5 py-3.5 font-display text-base tracking-tight">
          INDEXED SOURCES
        </div>
        <div className="px-5">
          {sources.length > 0 ? (
            <div className="flex flex-col divide-y-2 divide-foreground">
              {sources.map((source) => (
                <div className="py-3.5" key={source.sourceUrl}>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      className="font-medium text-sm hover:underline"
                      href={source.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {source.sourceTitle ?? source.sourceUrl}
                    </a>
                    <span className="border-2 border-foreground px-1.5 py-0.5 font-bold text-[10px] uppercase">
                      {source.chunkCount} chunk
                      {source.chunkCount === 1 ? "" : "s"}
                    </span>
                    <span className="border-2 border-foreground px-1.5 py-0.5 font-mono text-[10px] uppercase">
                      {source.embeddingModel}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {hostname(source.sourceUrl)} · indexed{" "}
                      {relativeTime(source.firstIndexedAt)}
                    </span>
                  </div>
                  {source.preview && (
                    <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                      {source.preview}
                      {source.preview.length >= PREVIEW_CHARS ? "…" : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-muted-foreground text-sm">
              No research indexed yet — this fills in the next time the
              research step runs for this site.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResearchPage;
