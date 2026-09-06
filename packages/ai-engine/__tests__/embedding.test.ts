import { beforeEach, describe, expect, it, vi } from "vitest";

const { embedMock, createGoogleGenerativeAIMock, createOpenAIMock, keysMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
  createGoogleGenerativeAIMock: vi.fn(),
  createOpenAIMock: vi.fn(),
  keysMock: vi.fn(),
}));

// embedding.ts imports "server-only", which throws outside Next.js's
// bundler (same reasoning as research.test.ts's ../model/../search mocks).
vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ embed: embedMock }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: createGoogleGenerativeAIMock }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: createOpenAIMock }));
vi.mock("../keys", () => ({ keys: keysMock }));

import { generateEmbedding, generateResearchEmbedding, getResearchEmbeddingModel } from "../embedding";

describe("embedding", () => {
  beforeEach(() => {
    embedMock.mockReset();
    createGoogleGenerativeAIMock.mockReset();
    createOpenAIMock.mockReset();
    keysMock.mockReset();

    createGoogleGenerativeAIMock.mockReturnValue({ embedding: vi.fn((id: string) => `google-model:${id}`) });
    createOpenAIMock.mockReturnValue({ textEmbeddingModel: vi.fn((id: string) => `openai-model:${id}`) });
  });

  describe("generateEmbedding (duplicate-content check)", () => {
    it("uses Google at 1536 dimensions when GOOGLE_GENERATIVE_AI_API_KEY is set", async () => {
      keysMock.mockReturnValue({ GOOGLE_GENERATIVE_AI_API_KEY: "google-key" });
      embedMock.mockResolvedValue({ embedding: [0.1, 0.2] });

      const result = await generateEmbedding("some post content");

      expect(result).toEqual([0.1, 0.2]);
      expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({ apiKey: "google-key" });
      const call = embedMock.mock.calls[0][0];
      expect(call.model).toBe("google-model:gemini-embedding-001");
      expect(call.providerOptions.google.outputDimensionality).toBe(1536);
    });

    it("returns null without calling embed when no Google key is configured", async () => {
      keysMock.mockReturnValue({});

      const result = await generateEmbedding("some post content");

      expect(result).toBeNull();
      expect(embedMock).not.toHaveBeenCalled();
    });

    it("returns null (not throw) when embed rejects", async () => {
      keysMock.mockReturnValue({ GOOGLE_GENERATIVE_AI_API_KEY: "google-key" });
      embedMock.mockRejectedValue(new Error("provider outage"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await generateEmbedding("some post content");

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("generateResearchEmbedding provider routing", () => {
    it("defaults to google when RESEARCH_EMBEDDING_PROVIDER is unset", async () => {
      keysMock.mockReturnValue({ GOOGLE_GENERATIVE_AI_API_KEY: "google-key" });
      embedMock.mockResolvedValue({ embedding: [0.5] });

      await generateResearchEmbedding("a research chunk");

      expect(createGoogleGenerativeAIMock).toHaveBeenCalled();
      expect(createOpenAIMock).not.toHaveBeenCalled();
      expect(getResearchEmbeddingModel()).toBe("gemini-embedding-001");
    });

    it("routes to Ollama's OpenAI-compatible endpoint when RESEARCH_EMBEDDING_PROVIDER=ollama, defaulting the bearer token to the literal string 'ollama'", async () => {
      keysMock.mockReturnValue({ RESEARCH_EMBEDDING_PROVIDER: "ollama" });
      embedMock.mockResolvedValue({ embedding: [0.7] });

      await generateResearchEmbedding("a research chunk");

      expect(createOpenAIMock).toHaveBeenCalledWith({ baseURL: "http://localhost:11434/v1", apiKey: "ollama" });
      expect(getResearchEmbeddingModel()).toBe("nomic-embed-text");
    });

    it("uses OLLAMA_API_KEY as the bearer token when set, for a publicly-hosted Ollama behind auth", async () => {
      keysMock.mockReturnValue({
        RESEARCH_EMBEDDING_PROVIDER: "ollama",
        OLLAMA_BASE_URL: "https://quillrun-ollama.fly.dev/v1",
        OLLAMA_API_KEY: "real-secret-token",
      });
      embedMock.mockResolvedValue({ embedding: [0.7] });

      await generateResearchEmbedding("a research chunk");

      expect(createOpenAIMock).toHaveBeenCalledWith({
        baseURL: "https://quillrun-ollama.fly.dev/v1",
        apiKey: "real-secret-token",
      });
    });

    it("routes to OpenAI when RESEARCH_EMBEDDING_PROVIDER=openai and a key is set", async () => {
      keysMock.mockReturnValue({ RESEARCH_EMBEDDING_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" });
      embedMock.mockResolvedValue({ embedding: [0.9] });

      await generateResearchEmbedding("a research chunk");

      expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-test" });
      expect(getResearchEmbeddingModel()).toBe("text-embedding-3-small");
    });

    it("returns null when RESEARCH_EMBEDDING_PROVIDER=openai but no key is set", async () => {
      keysMock.mockReturnValue({ RESEARCH_EMBEDDING_PROVIDER: "openai" });

      const result = await generateResearchEmbedding("a research chunk");

      expect(result).toBeNull();
      expect(embedMock).not.toHaveBeenCalled();
    });
  });
});
