import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Independent mocks from `content-pipeline.test.ts` — vitest scopes
// `vi.mock` per test file, so this file's `@repo/database`/`@repo/ai-engine`
// mocks are tailored specifically to exercise each guardrail's own
// branches (count-query results, rpc results) rather than reusing the
// generic single-row builder the pipeline test needs.
const fromMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("@repo/database", () => ({
  database: { from: (...args: unknown[]) => fromMock(...args), rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const generateEmbeddingMock = vi.fn();
vi.mock("@repo/ai-engine", () => ({
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
}));

// Imported after the mocks above so both pick up the mocked modules.
import { checkDuplicateContent, checkKillSwitch, checkRateLimit } from "../guardrails";

const originalEmergencyStop = process.env.EMERGENCY_STOP;

afterEach(() => {
  if (originalEmergencyStop === undefined) {
    delete process.env.EMERGENCY_STOP;
  } else {
    process.env.EMERGENCY_STOP = originalEmergencyStop;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkKillSwitch", () => {
  it("blocks immediately on EMERGENCY_STOP without touching the database", async () => {
    process.env.EMERGENCY_STOP = "true";

    const result = await checkKillSwitch("org-1", "site-1");

    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/emergency stop/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("blocks when tenant_settings.paused is true", async () => {
    fromMock.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: table === "tenant_settings" ? { paused: true } : { paused: false },
              error: null,
            }),
        }),
      }),
    }));

    const result = await checkKillSwitch("org-1", "site-1");

    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/organization/i);
  });

  it("blocks when the site itself is paused (independent of tenant_settings)", async () => {
    fromMock.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: table === "site_connections" ? { paused: true } : { paused: false },
              error: null,
            }),
        }),
      }),
    }));

    const result = await checkKillSwitch("org-1", "site-1");

    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/site/i);
  });

  it("allows through when nothing is paused and no emergency stop", async () => {
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { paused: false }, error: null }) }),
      }),
    }));

    const result = await checkKillSwitch("org-1", "site-1");

    expect(result.blocked).toBe(false);
  });
});

describe("checkRateLimit", () => {
  const makeSettingsBuilder = (settings: Record<string, unknown> | null) => ({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: settings, error: null }) }),
    }),
  });

  it("allows through when no limits are configured, without counting posts", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        return makeSettingsBuilder({ max_posts_per_day: null, max_posts_per_week: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await checkRateLimit("org-1");

    expect(result.blocked).toBe(false);
  });

  it("blocks once the daily count reaches max_posts_per_day", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        return makeSettingsBuilder({ max_posts_per_day: 5, max_posts_per_week: null });
      }
      // posts count query: .select(..., {count}).eq().gte()
      return {
        select: () => ({
          eq: () => ({ gte: () => Promise.resolve({ count: 5, error: null }) }),
        }),
      };
    });

    const result = await checkRateLimit("org-1");

    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/daily/i);
  });

  it("does not block when the daily count is under the limit", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        return makeSettingsBuilder({ max_posts_per_day: 5, max_posts_per_week: null });
      }
      return {
        select: () => ({
          eq: () => ({ gte: () => Promise.resolve({ count: 4, error: null }) }),
        }),
      };
    });

    const result = await checkRateLimit("org-1");

    expect(result.blocked).toBe(false);
  });

  it("blocks once the weekly count reaches max_posts_per_week", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        return makeSettingsBuilder({ max_posts_per_day: null, max_posts_per_week: 20 });
      }
      return {
        select: () => ({
          eq: () => ({ gte: () => Promise.resolve({ count: 20, error: null }) }),
        }),
      };
    });

    const result = await checkRateLimit("org-1");

    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/weekly/i);
  });
});

describe("checkDuplicateContent", () => {
  it("skips (never blocks) when no embedding provider is configured", async () => {
    generateEmbeddingMock.mockResolvedValue(null);

    const result = await checkDuplicateContent("site-1", "some draft content");

    expect(result.duplicate).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("flags a duplicate when find_similar_posts returns a match above the threshold", async () => {
    generateEmbeddingMock.mockResolvedValue(new Array(1536).fill(0.01));
    rpcMock.mockResolvedValue({
      data: [{ id: "post-1", title: "Espresso Machine Buying Guide", similarity: 0.97 }],
      error: null,
    });

    const result = await checkDuplicateContent("site-1", "near-identical draft");

    expect(result.duplicate).toBe(true);
    expect(result.similarity).toBe(0.97);
    expect(result.reason).toContain("Espresso Machine Buying Guide");
    expect(rpcMock).toHaveBeenCalledWith(
      "find_similar_posts",
      expect.objectContaining({ p_site_connection_id: "site-1", p_threshold: 0.92 })
    );
  });

  it("does not flag a duplicate when find_similar_posts returns no rows", async () => {
    generateEmbeddingMock.mockResolvedValue(new Array(1536).fill(0.01));
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await checkDuplicateContent("site-1", "genuinely new draft");

    expect(result.duplicate).toBe(false);
  });

  it("does not flag a duplicate when the rpc call errors (fails open, best-effort)", async () => {
    generateEmbeddingMock.mockResolvedValue(new Array(1536).fill(0.01));
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await checkDuplicateContent("site-1", "draft");

    expect(result.duplicate).toBe(false);
  });
});
