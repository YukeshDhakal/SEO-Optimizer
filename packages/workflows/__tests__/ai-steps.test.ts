import { beforeEach, describe, expect, it, vi } from "vitest";

// Same pattern as guardrails.test.ts: independent, tailored mocks for
// @repo/database and @repo/ai-engine. ai-steps.ts imports several other
// @repo/ai-engine functions (draft, outline, research, ...) that this file
// never exercises - left undefined here is fine, same as guardrails.test.ts
// only stubbing generateEmbedding for a module with a wider real surface.
const fromMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("@repo/database", () => ({
  database: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

const generateResearchEmbeddingMock = vi.fn();
vi.mock("@repo/ai-engine", () => ({
  generateResearchEmbedding: (...args: unknown[]) => generateResearchEmbeddingMock(...args),
  getResearchEmbeddingModel: () => "text-embedding-3-small",
}));

import { fetchResearchContextStep, storeResearchChunksStep } from "../ai-steps";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchResearchContextStep", () => {
  it("returns [] without querying the database when embedding fails", async () => {
    generateResearchEmbeddingMock.mockResolvedValue(null);

    const result = await fetchResearchContextStep({
      siteConnectionId: "site-1",
      topic: "coffee grinders",
      primaryKeyword: "coffee grinder",
    });

    expect(result).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns [] when the RPC errors", async () => {
    generateResearchEmbeddingMock.mockResolvedValue(new Array(768).fill(0.01));
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await fetchResearchContextStep({
      siteConnectionId: "site-1",
      topic: "t",
      primaryKeyword: "k",
    });

    expect(result).toEqual([]);
  });

  it("maps matched rows into ResearchContextChunk shape", async () => {
    generateResearchEmbeddingMock.mockResolvedValue(new Array(768).fill(0.01));
    rpcMock.mockResolvedValue({
      data: [
        { chunk_text: "burr beats blade", source_title: "Grinder Guide", source_url: "https://example.com/a", similarity: 0.8 },
      ],
      error: null,
    });

    const result = await fetchResearchContextStep({
      siteConnectionId: "site-1",
      topic: "t",
      primaryKeyword: "k",
    });

    expect(result).toEqual([
      { chunkText: "burr beats blade", sourceTitle: "Grinder Guide", sourceUrl: "https://example.com/a" },
    ]);
    expect(rpcMock).toHaveBeenCalledWith(
      "find_similar_research_chunks",
      expect.objectContaining({ p_site_connection_id: "site-1", p_limit: 5 })
    );
  });
});

describe("storeResearchChunksStep", () => {
  it("does nothing when sources have no content", async () => {
    await storeResearchChunksStep({
      organizationId: "org-1",
      siteConnectionId: "site-1",
      sources: [{ title: "No content", url: "https://example.com/a" }],
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it("skips silently when every embedding call returns null", async () => {
    generateResearchEmbeddingMock.mockResolvedValue(null);

    await storeResearchChunksStep({
      organizationId: "org-1",
      siteConnectionId: "site-1",
      sources: [{ title: "T", url: "https://example.com/a", content: "Some sentence content." }],
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it("upserts embedded chunks on the natural key (site_connection_id, source_url, chunk_index)", async () => {
    generateResearchEmbeddingMock.mockResolvedValue(new Array(768).fill(0.01));
    const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValue({ upsert: upsertMock });

    await storeResearchChunksStep({
      organizationId: "org-1",
      siteConnectionId: "site-1",
      sources: [{ title: "T", url: "https://example.com/a", content: "Some sentence content." }],
    });

    expect(fromMock).toHaveBeenCalledWith("research_chunks");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          site_connection_id: "site-1",
          source_url: "https://example.com/a",
          chunk_index: 0,
        }),
      ]),
      { onConflict: "site_connection_id,source_url,chunk_index" }
    );
  });

  it("never throws when the database call itself rejects", async () => {
    generateResearchEmbeddingMock.mockResolvedValue(new Array(768).fill(0.01));
    fromMock.mockImplementation(() => {
      throw new Error("connection lost");
    });

    await expect(
      storeResearchChunksStep({
        organizationId: "org-1",
        siteConnectionId: "site-1",
        sources: [{ title: "T", url: "https://example.com/a", content: "Some sentence content." }],
      })
    ).resolves.toBeUndefined();
  });
});
