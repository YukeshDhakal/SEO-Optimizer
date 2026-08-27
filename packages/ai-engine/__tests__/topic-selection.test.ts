import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", () => ({ generateObject: generateObjectMock }));
// Real model.ts pulls in "server-only", which throws outside Next.js's
// bundler (see @repo/search-console's own note on the same package) —
// mocked out here since this test only cares about the prompt/grounding
// logic, not model construction.
vi.mock("../model", () => ({ getModel: vi.fn(() => "mock-model") }));

import { selectTopic } from "../steps/topic-selection";

describe("selectTopic", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    generateObjectMock.mockResolvedValue({
      object: { topic: "Best coffee grinders", primaryKeyword: "coffee grinder" },
    });
  });

  it("uses the plain topicHint prompt when no GSC queries are given", async () => {
    await selectTopic({ organizationId: "org-1", topicHint: "coffee gear" });

    const { prompt } = generateObjectMock.mock.calls[0][0];
    expect(prompt).toContain('"coffee gear"');
    expect(prompt).not.toContain("Search Console");
  });

  it("uses the plain prompt when gscQueries is an empty array", async () => {
    await selectTopic({ organizationId: "org-1", topicHint: "coffee gear", gscQueries: [] });

    const { prompt } = generateObjectMock.mock.calls[0][0];
    expect(prompt).not.toContain("Search Console");
  });

  it("prepends a grounding block sorted by clicks, capped at 10, when gscQueries is present", async () => {
    const gscQueries = Array.from({ length: 12 }, (_, i) => ({
      query: `query-${i}`,
      clicks: i,
      impressions: i * 10,
    }));

    await selectTopic({ organizationId: "org-1", topicHint: "coffee gear", gscQueries });

    const { prompt } = generateObjectMock.mock.calls[0][0];
    expect(prompt).toContain("Search Console");
    expect(prompt).toContain("query-11"); // highest clicks, must survive the top-10 cut
    expect(prompt).not.toContain("query-0"); // lowest clicks, must be cut
    expect(prompt.match(/impressions\)/g)?.length).toBe(10);
  });

  it("still returns the model's object unchanged", async () => {
    const result = await selectTopic({ organizationId: "org-1", topicHint: "coffee gear" });
    expect(result).toEqual({ topic: "Best coffee grinders", primaryKeyword: "coffee grinder" });
  });
});
