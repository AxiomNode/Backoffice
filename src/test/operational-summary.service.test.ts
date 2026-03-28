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
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [
            { key: "svc-ok", title: "Service OK", domain: "core", supportsData: true },
            { key: "svc-down", title: "Service Down", domain: "core", supportsData: false },
            { key: "svc-denied", title: "Service Denied", domain: "admin", supportsData: false },
          ],
        });
      }

      if (url.includes("svc-ok/metrics")) {
        return Promise.resolve({
          metrics: {
            traffic: { requestsReceivedTotal: 100 },
            batch: { requestedTotal: 50, createdTotal: 40 },
          },
        });
      }

      if (url.includes("svc-down/metrics")) {
        return Promise.reject(new Error("HTTP 503: service unavailable"));
      }

      if (url.includes("svc-denied/metrics")) {
        return Promise.reject(new Error("HTTP 403: forbidden"));
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
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [
            { key: "svc-fast", title: "Service Fast", domain: "core", supportsData: true },
            { key: "svc-unknown", title: "Service Unknown", domain: "edge", supportsData: false },
            { key: "svc-bad-json", title: "Service Bad Json", domain: "ops", supportsData: false },
            { key: "svc-bad-shape", title: "Service Bad Shape", domain: "ops", supportsData: false },
          ],
        });
      }

      if (url.includes("svc-fast/metrics")) {
        return Promise.resolve({
          metrics: {
            requestsReceivedTotal: 140,
            batch: { requestedTotal: 0, createdTotal: 0 },
          },
        });
      }

      if (url.includes("svc-unknown/metrics")) {
        return Promise.reject("network-down");
      }

      if (url.includes("svc-bad-json/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 11 } } });
      }

      if (url.includes("svc-bad-shape/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 9 } } });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    window.localStorage.setItem("backoffice.serviceLastError.svc-bad-json", "not-json");
    window.localStorage.setItem(
      "backoffice.serviceLastError.svc-bad-shape",
      JSON.stringify({ message: 42, at: null }),
    );

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(20000);

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

    nowSpy.mockRestore();
  });
});
