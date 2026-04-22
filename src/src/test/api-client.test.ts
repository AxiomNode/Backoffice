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
    window.localStorage.clear();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("normalizes, persists and clears the edge API base override", async () => {
    const { getEdgeApiBaseOverride, setEdgeApiBaseOverride } = await import("../infrastructure/http/apiClient");

    expect(setEdgeApiBaseOverride(" https://edge.example.com/ ")).toBe("https://edge.example.com");
    expect(getEdgeApiBaseOverride()).toBe("https://edge.example.com");
    expect(window.localStorage.getItem("axiomnode.backoffice.edge-api-base-override")).toBe("https://edge.example.com");

    expect(setEdgeApiBaseOverride(null)).toBeNull();
    expect(getEdgeApiBaseOverride()).toBeNull();
  });

  it("rejects invalid overrides and clears malformed stored values", async () => {
    const { getEdgeApiBaseOverride, setEdgeApiBaseOverride } = await import("../infrastructure/http/apiClient");

    expect(() => setEdgeApiBaseOverride("ftp://edge.example.com")).toThrow("Edge API base must use http or https");
    expect(() => setEdgeApiBaseOverride("https://edge.example.com/path")).toThrow(
      "Edge API base must not include path, query, or hash",
    );

    window.localStorage.setItem("axiomnode.backoffice.edge-api-base-override", "https://edge.example.com/path");
    expect(getEdgeApiBaseOverride()).toBeNull();
    expect(window.localStorage.getItem("axiomnode.backoffice.edge-api-base-override")).toBeNull();
  });

  it("returns parsed json when the response is successful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, value: 3 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { fetchJson } = await import("../infrastructure/http/apiClient");

    await expect(fetchJson<{ ok: boolean; value: number }>("http://localhost:7005/ok")).resolves.toEqual({ ok: true, value: 3 });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:7005/ok",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it("falls back to the HTTP status text when the error body is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503, statusText: "Service Unavailable" })),
    );

    const { fetchJson } = await import("../infrastructure/http/apiClient");

    await expect(fetchJson("http://localhost:7005/down")).rejects.toThrow("HTTP 503: Service Unavailable");
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