import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateTextMock, generateObjectMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  generateObjectMock: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText: generateTextMock,
  generateObject: generateObjectMock,
  stepCountIs: vi.fn(() => "mock-stop-condition"),
}));
// Same reasoning as topic-selection.test.ts: model.ts pulls in
// "server-only", which throws outside Next.js's bundler.
vi.mock("../model", () => ({ getModel: vi.fn(() => "mock-model") }));
// webSearchTool itself does real network I/O (Tavily) when invoked, but
// generateText is mocked below so it's never actually called - stubbed
// only so the import doesn't pull in "server-only" via ../search's own key
// lookups.
vi.mock("../search", () => ({ webSearchTool: {} }));

import { research } from "../steps/research";

const toolResult = (results: Array<{ title: string; url: string; content: string }>) => ({
  dynamic: false,
  toolName: "web_search",
  output: { results },
});

describe("research", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateObjectMock.mockReset();
    generateObjectMock.mockResolvedValue({
      object: { facts: ["a fact"], candidateFaqs: ["a question?"] },
    });
  });

  it("grounds the notes-extraction prompt in raw source content, not just the model's prose", async () => {
    generateTextMock.mockResolvedValue({
      text: "The model's own paraphrased summary.",
      toolResults: [
        toolResult([
          { title: "Grinder Guide", url: "https://example.com/a", content: "Burr grinders beat blade grinders for consistency." },
        ]),
      ],
    });

    await research({ organizationId: "org-1", topic: "coffee grinders", primaryKeyword: "coffee grinder" });

    const { prompt } = generateObjectMock.mock.calls[0][0];
    expect(prompt).toContain("Burr grinders beat blade grinders for consistency.");
    expect(prompt).toContain("Grinder Guide");
    expect(prompt).toContain("The model's own paraphrased summary."); // kept as secondary context
  });

  it("returns sources carrying content alongside title/url", async () => {
    generateTextMock.mockResolvedValue({
      text: "summary",
      toolResults: [
        toolResult([{ title: "Grinder Guide", url: "https://example.com/a", content: "raw snippet" }]),
      ],
    });

    const result = await research({ organizationId: "org-1", topic: "t", primaryKeyword: "k" });

    expect(result.sources).toEqual([
      { title: "Grinder Guide", url: "https://example.com/a", content: "raw snippet" },
    ]);
  });

  it("falls back to the model's own prose when Tavily returned no results", async () => {
    generateTextMock.mockResolvedValue({ text: "model's own knowledge", toolResults: [] });

    await research({ organizationId: "org-1", topic: "t", primaryKeyword: "k" });

    const { prompt } = generateObjectMock.mock.calls[0][0];
    expect(prompt).toContain("(no excerpts available)");
    expect(prompt).toContain("model's own knowledge");
  });

  it("dedupes by URL across tool-call steps and keeps content on the surviving entry", async () => {
    generateTextMock.mockResolvedValue({
      text: "summary",
      toolResults: [
        toolResult([{ title: "First", url: "https://example.com/a", content: "first content" }]),
        toolResult([{ title: "First again", url: "https://example.com/a", content: "second content" }]),
      ],
    });

    const result = await research({ organizationId: "org-1", topic: "t", primaryKeyword: "k" });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].content).toBe("first content");
  });

  it("renders priorContext as its own labeled block, separate from this run's excerpts", async () => {
    generateTextMock.mockResolvedValue({
      text: "summary",
      toolResults: [toolResult([{ title: "New", url: "https://example.com/a", content: "new content" }])],
    });

    await research({
      organizationId: "org-1",
      topic: "t",
      primaryKeyword: "k",
      priorContext: [
        { chunkText: "previously found fact", sourceTitle: "Old Post", sourceUrl: "https://example.com/old" },
      ],
    });

    const { prompt } = generateObjectMock.mock.calls[0][0];
    expect(prompt).toContain("Prior research already gathered for this site");
    expect(prompt).toContain("previously found fact");
    expect(prompt).toContain("Old Post");
  });

  it("never adds priorContext chunks to the returned sources", async () => {
    generateTextMock.mockResolvedValue({ text: "summary", toolResults: [] });

    const result = await research({
      organizationId: "org-1",
      topic: "t",
      primaryKeyword: "k",
      priorContext: [
        { chunkText: "previously found fact", sourceTitle: "Old Post", sourceUrl: "https://example.com/old" },
      ],
    });

    expect(result.sources).toEqual([]);
  });
});
