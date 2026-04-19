import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../runtimeConfig", () => ({
  getConfigValue: vi.fn((key: string, fallback?: string) => {
    if (key === "VITE_API_BASE_URL") {
      return fallback ?? "http://localhost:7005";
    }

    return undefined;
  }),
}));

describe("apiClient.fetchJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts the innermost useful error message from nested HTTP/json payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 500,
            error: "Internal Server Error",
            message:
              'HTTP 500: {"statusCode":500,"error":"Internal Server Error","message":"Generated word-pass has no words — rejecting incomplete content"}',
          }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    const { fetchJson } = await import("../infrastructure/http/apiClient");

    await expect(fetchJson("http://localhost:7005/failing-endpoint")).rejects.toThrow(
      "Generated word-pass has no words — rejecting incomplete content",
    );
  });
});