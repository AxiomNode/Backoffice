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
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 100 } } });
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

    expect(downRow?.online).toBe(false);
    expect(downRow?.connectionError).toBe(true);
    expect(downRow?.accessGuaranteed).toBe(true);
    expect(downRow?.lastKnownError?.message).toContain("HTTP 503");

    expect(deniedRow?.online).toBe(false);
    expect(deniedRow?.connectionError).toBe(false);
    expect(deniedRow?.accessGuaranteed).toBe(false);
    expect(deniedRow?.lastKnownError?.message).toContain("HTTP 403");
  });
});
