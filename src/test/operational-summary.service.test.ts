import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchServiceOperationalSummary } from "../application/services/operationalSummary";
import type { SessionContext } from "../domain/types/backoffice";

const fetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/http/apiClient", () => ({
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
}));

vi.mock("../infrastructure/backoffice/authHeaders", () => ({
  composeAuthHeaders: vi.fn(() => ({})),
}));

describe("fetchServiceOperationalSummary", () => {
  const context: SessionContext = { mode: "dev", devUid: "test-uid" };

  beforeEach(() => {
    fetchJsonMock.mockReset();
    window.localStorage.clear();
  });

  it("classifies mixed service states: online, connection error and access denied", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services/operational-summary")) {
        return Promise.resolve({
          rows: [
            {
              key: "svc-ok",
              title: "Service OK",
              domain: "core",
              supportsData: true,
              online: true,
              accessGuaranteed: true,
              connectionError: false,
              requestsTotal: 100,
              requestsPerSecond: 2,
              generationRequestedTotal: 50,
              generationCreatedTotal: 40,
              generationConversionRatio: 0.8,
              latencyMs: 10,
              lastUpdatedAt: "2026-04-19T00:00:00.000Z",
              errorMessage: null,
            },
            {
              key: "svc-down",
              title: "Service Down",
              domain: "core",
              supportsData: false,
              online: false,
              accessGuaranteed: true,
              connectionError: true,
              requestsTotal: null,
              requestsPerSecond: null,
              generationRequestedTotal: null,
              generationCreatedTotal: null,
              generationConversionRatio: null,
              latencyMs: 12,
              lastUpdatedAt: "2026-04-19T00:00:00.000Z",
              errorMessage: "HTTP 503: service unavailable",
            },
            {
              key: "svc-denied",
              title: "Service Denied",
              domain: "admin",
              supportsData: false,
              online: false,
              accessGuaranteed: false,
              connectionError: false,
              requestsTotal: null,
              requestsPerSecond: null,
              generationRequestedTotal: null,
              generationCreatedTotal: null,
              generationConversionRatio: null,
              latencyMs: 8,
              lastUpdatedAt: "2026-04-19T00:00:00.000Z",
              errorMessage: "HTTP 403: forbidden",
            },
          ],
          totals: { total: 3, onlineCount: 1, connectionErrors: 1, accessIssues: 1 },
        });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const previousByService: Record<string, { requestsTotal: number | null; fetchedAt: number }> = {};
    const summary = await fetchServiceOperationalSummary(context, previousByService);

    expect(summary.totals.total).toBe(3);
    expect(summary.totals.onlineCount).toBe(1);
    expect(summary.totals.connectionErrors).toBe(1);
    expect(summary.totals.accessIssues).toBe(1);

    const okRow = summary.rows.find((row) => row.key === "svc-ok");
    const downRow = summary.rows.find((row) => row.key === "svc-down");
    const deniedRow = summary.rows.find((row) => row.key === "svc-denied");

    expect(okRow?.online).toBe(true);
    expect(okRow?.requestsTotal).toBe(100);
    expect(okRow?.generationRequestedTotal).toBe(50);
    expect(okRow?.generationCreatedTotal).toBe(40);
    expect(okRow?.generationConversionRatio).toBe(0.8);

    expect(downRow?.online).toBe(false);
    expect(downRow?.connectionError).toBe(true);
    expect(downRow?.accessGuaranteed).toBe(true);
    expect(downRow?.lastKnownError?.message).toContain("HTTP 503");

    expect(deniedRow?.online).toBe(false);
    expect(deniedRow?.connectionError).toBe(false);
    expect(deniedRow?.accessGuaranteed).toBe(false);
    expect(deniedRow?.lastKnownError?.message).toContain("HTTP 403");
  });

  it("handles unknown rejection payloads, malformed stored errors, and computes req/s deltas", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services/operational-summary")) {
        return Promise.resolve({
          rows: [
            {
              key: "svc-fast",
              title: "Service Fast",
              domain: "core",
              supportsData: true,
              online: true,
              accessGuaranteed: true,
              connectionError: false,
              requestsTotal: 140,
              requestsPerSecond: 8,
              generationRequestedTotal: 0,
              generationCreatedTotal: 0,
              generationConversionRatio: null,
              latencyMs: 5,
              lastUpdatedAt: "2026-04-19T00:00:00.000Z",
              errorMessage: null,
            },
            {
              key: "svc-unknown",
              title: "Service Unknown",
              domain: "edge",
              supportsData: false,
              online: false,
              accessGuaranteed: true,
              connectionError: false,
              requestsTotal: null,
              requestsPerSecond: null,
              generationRequestedTotal: null,
              generationCreatedTotal: null,
              generationConversionRatio: null,
              latencyMs: 6,
              lastUpdatedAt: "2026-04-19T00:00:00.000Z",
              errorMessage: "Unknown error",
            },
            {
              key: "svc-bad-json",
              title: "Service Bad Json",
              domain: "ops",
              supportsData: false,
              online: true,
              accessGuaranteed: true,
              connectionError: false,
              requestsTotal: 11,
              requestsPerSecond: null,
              generationRequestedTotal: null,
              generationCreatedTotal: null,
              generationConversionRatio: null,
              latencyMs: 7,
              lastUpdatedAt: "2026-04-19T00:00:00.000Z",
              errorMessage: null,
            },
            {
              key: "svc-bad-shape",
              title: "Service Bad Shape",
              domain: "ops",
              supportsData: false,
              online: true,
              accessGuaranteed: true,
              connectionError: false,
              requestsTotal: 9,
              requestsPerSecond: null,
              generationRequestedTotal: null,
              generationCreatedTotal: null,
              generationConversionRatio: null,
              latencyMs: 9,
              lastUpdatedAt: "2026-04-19T00:00:00.000Z",
              errorMessage: null,
            },
          ],
          totals: { total: 4, onlineCount: 3, connectionErrors: 0, accessIssues: 0 },
        });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    window.localStorage.setItem("backoffice.serviceLastError.svc-bad-json", "not-json");
    window.localStorage.setItem(
      "backoffice.serviceLastError.svc-bad-shape",
      JSON.stringify({ message: 42, at: null }),
    );

    const previousByService: Record<string, { requestsTotal: number | null; fetchedAt: number }> = {
      "svc-fast": { requestsTotal: 100, fetchedAt: 15000 },
    };

    const summary = await fetchServiceOperationalSummary(context, previousByService);

    const fastRow = summary.rows.find((row) => row.key === "svc-fast");
    const unknownRow = summary.rows.find((row) => row.key === "svc-unknown");
    const badJsonRow = summary.rows.find((row) => row.key === "svc-bad-json");
    const badShapeRow = summary.rows.find((row) => row.key === "svc-bad-shape");

    expect(fastRow?.requestsPerSecond).toBe(8);
    expect(fastRow?.generationConversionRatio).toBeNull();
    expect(fastRow?.lastKnownError).toBeNull();

    expect(unknownRow?.online).toBe(false);
    expect(unknownRow?.errorMessage).toBe("Unknown error");
    expect(unknownRow?.connectionError).toBe(false);
    expect(unknownRow?.accessGuaranteed).toBe(true);

    expect(badJsonRow?.lastKnownError).toBeNull();
    expect(badShapeRow?.lastKnownError).toBeNull();
  });
});
