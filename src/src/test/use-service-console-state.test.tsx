import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UI_SERVICE_GENERATION_FOLLOW_STORAGE_PREFIX, UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../domain/constants/ui";
import type { NavKey, SessionContext } from "../domain/types/backoffice";

const fetchJsonMock = vi.hoisted(() => vi.fn());
const storeServiceLastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/http/apiClient", () => ({
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
}));

vi.mock("../application/services/operationalSummary", () => ({
  storeServiceLastError: storeServiceLastErrorMock,
}));

vi.mock("../ui/hooks/useAutoRefreshScheduler", () => ({
  useAutoRefreshScheduler: vi.fn(),
}));

vi.mock("../ui/hooks/useDebouncedValue", () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

import { useServiceConsoleState, type ServiceConsoleMessages } from "../ui/hooks/useServiceConsoleState";

const context: SessionContext = {
  mode: "dev",
  devUid: "dev-uid",
};

const messages: ServiceConsoleMessages = {
  insertOk: "insert-ok",
  updateOk: "update-ok",
  deleteOk: "delete-ok",
  updateIdRequired: "update-id-required",
  contentObjectOnly: "content-object-only",
  contentNonNull: "content-non-null",
};

function buildBaseHandlers(serviceKey: string, supportsData = true) {
  return (url: string, options?: RequestInit) => {
    if (url.endsWith("/v1/backoffice/services")) {
      return Promise.resolve({
        services: [{ key: serviceKey, title: serviceKey, domain: "core", supportsData }],
      });
    }
    if (url.includes("/metrics")) {
      return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
    }
    if (url.includes("/logs")) {
      return Promise.resolve({ logs: [] });
    }
    if (url.includes("/catalogs")) {
      return Promise.resolve({ catalogs: { categories: [], languages: [] } });
    }
    if (url.includes("/data/") && options?.method === "PATCH") {
      return Promise.resolve({ item: { id: "entry-1" } });
    }
    if (url.includes("/data/") && options?.method === "DELETE") {
      return Promise.resolve({ deleted: true });
    }
    if (url.endsWith("/data") && options?.method === "POST") {
      return Promise.resolve({ item: { id: "entry-1" } });
    }
    if (url.includes("/data?")) {
      return Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 5 });
    }
    if (url.includes("/generation/process/")) {
      return Promise.resolve({ task: { taskId: "task-1", status: "running" } });
    }
    return Promise.reject(new Error(`Unhandled URL: ${url}`));
  };
}

describe("useServiceConsoleState", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    window.location.hash = "#/backoffice/svc-users";
    fetchJsonMock.mockReset();
    storeServiceLastErrorMock.mockReset();
  });

  it("normalizes hash params and persists the supported route query state", async () => {
    window.location.hash =
      "#/backoffice/svc-users?dataset=invalid&page=0&pageSize=500&limit=0&sortDirection=asc&metric=played&refreshMode=auto&refreshInterval=4&followTaskId=%20task-1%20";

    fetchJsonMock.mockImplementation(buildBaseHandlers("microservice-users"));

    const { result } = renderHook(() => useServiceConsoleState("svc-users", context, "error-fallback", messages));

    await waitFor(() => {
      expect(result.current.dataset).toBe("roles");
      expect(result.current.page).toBe(1);
      expect(result.current.pageSize).toBe(5);
      expect(result.current.limit).toBe(200);
      expect(result.current.sortDirection).toBe("asc");
      expect(result.current.refreshMode).toBe("auto");
      expect(result.current.refreshIntervalSeconds).toBe(10);
      expect(result.current.followTaskId).toBe("task-1");
    });

    await waitFor(() => {
      expect(window.location.hash).toContain("dataset=roles");
      expect(window.location.hash).not.toContain("followTaskId=");
      expect(window.localStorage.getItem(`${UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX}.svc-users`)).toContain("dataset=roles");
      expect(window.localStorage.getItem(`${UI_SERVICE_GENERATION_FOLLOW_STORAGE_PREFIX}.svc-users`)).toBe("task-1");
    });

    act(() => {
      result.current.setDataset("leaderboard");
    });

    await waitFor(() => {
      expect(window.location.hash).toContain("dataset=leaderboard");
      expect(window.location.hash).toContain("metric=played");
    });
  });

  it("reuses cached game catalogs and renormalizes manual selectors on rerender", async () => {
    window.location.hash = "#/backoffice/svc-quiz?dataset=history";

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-quiz", title: "Quiz", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "22", name: "Science" }, { id: "23", name: "History" }],
            languages: [{ code: "en", name: "English" }, { code: "es", name: "Español" }],
          },
        });
      }
      return buildBaseHandlers("microservice-quiz")(url, options);
    });

    const { result, rerender } = renderHook(
      ({ nextContext }) => useServiceConsoleState("svc-quiz", nextContext, "error-fallback", messages),
      { initialProps: { nextContext: context } },
    );

    await waitFor(() => {
      expect(result.current.manualCatalogs.categories).toHaveLength(2);
      expect(result.current.manualCategoryId).toBe("23");
      expect(result.current.manualLanguage).toBe("es");
    });

    act(() => {
      result.current.setManualCategoryId("999");
      result.current.setManualLanguage("xx");
    });

    rerender({ nextContext: { ...context, devUid: "dev-uid-2" } });

    await waitFor(() => {
      expect(result.current.manualCategoryId).toBe("22");
      expect(result.current.manualLanguage).toBe("en");
    });

    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/microservice-quiz/catalogs"))).toHaveLength(1);
  });

  it("simplifies wordpass history rows", async () => {
    window.location.hash = "#/backoffice/svc-wordpass?dataset=history";

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-wordpass", title: "Wordpass", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return Promise.resolve({ catalogs: { categories: [], languages: [] } });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({
          rows: [
            {
              id: "history-1",
              categoryId: "31",
              language: "es",
              request: { difficulty_percentage: "44" },
              response: {
                game: {
                  difficulty_percentage: "42",
                  words: [
                    { word: "Alpha" },
                    { word: "Beta" },
                    { word: "" },
                  ],
                },
              },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 5,
        });
      }
      return buildBaseHandlers("microservice-wordpass")(url, options);
    });

    const { result } = renderHook(() => useServiceConsoleState("svc-wordpass", context, "error-fallback", messages));

    await waitFor(() => {
      expect(result.current.dataRows[0]).toEqual(
        expect.objectContaining({
          primaryWords: "Alpha, Beta",
          difficultyPercentage: 42,
          category: "31",
        }),
      );
    });
  });

  it("prepends followed process snapshots without duplicates", async () => {
    window.location.hash = "#/backoffice/svc-wordpass?dataset=processes&followTaskId=%20task-1%20";
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-wordpass", title: "Wordpass", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return Promise.resolve({ catalogs: { categories: [], languages: [] } });
      }
      if (url.includes("/generation/process/task-1")) {
        return Promise.resolve({ task: { taskId: "task-1", status: "running" } });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({
          rows: [
            { taskId: "task-1", status: "queued" },
            { taskId: "task-2", status: "queued" },
          ],
          total: 2,
          page: 1,
          pageSize: 5,
        });
      }
      return buildBaseHandlers("microservice-wordpass")(url, options);
    });

    const { result } = renderHook(() => useServiceConsoleState("svc-wordpass", context, "error-fallback", messages));

    await waitFor(() => {
      expect(result.current.dataset).toBe("processes");
      expect(result.current.dataRows.map((row) => row.taskId)).toEqual(["task-1", "task-2"]);
      expect(result.current.dataRows[0]).toEqual(expect.objectContaining({ status: "running" }));
    });
  });

  it("short-circuits non-tabular services and reports overview section failures", async () => {
    window.location.hash = "#/backoffice/svc-api-gateway";

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "api-gateway", title: "API Gateway", domain: "edge", supportsData: false }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.reject("metrics-down");
      }
      if (url.includes("/logs")) {
        return Promise.reject(new Error("logs-down"));
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [{ id: "never" }] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const { result } = renderHook(() => useServiceConsoleState("svc-api-gateway", context, "error-fallback", messages));

    await waitFor(() => {
      expect(result.current.metricsError).toBe("Unknown error");
      expect(result.current.logsError).toBe("logs-down");
      expect(result.current.dataRows).toEqual([]);
      expect(result.current.dataTotal).toBe(0);
      expect(result.current.lastDataSyncAt).toBeNull();
    });

    expect(storeServiceLastErrorMock).toHaveBeenCalledWith("api-gateway", "Unknown error");
    expect(storeServiceLastErrorMock).toHaveBeenCalledWith("api-gateway", "logs-down");
  });

  it("reloads overview and data together through loadAll", async () => {
    window.location.hash = "#/backoffice/svc-users?dataset=roles";

    fetchJsonMock.mockImplementation(buildBaseHandlers("microservice-users"));

    const { result } = renderHook(() => useServiceConsoleState("svc-users", context, "error-fallback", messages));

    await waitFor(() => {
      expect(result.current.serviceConfig?.service).toBe("microservice-users");
    });

    const initialMetricsCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length;
    const initialLogsCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length;
    const initialDataCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length;

    await act(async () => {
      await result.current.loadAll();
    });

    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length).toBeGreaterThan(initialMetricsCalls);
    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length).toBeGreaterThan(initialLogsCalls);
    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length).toBeGreaterThan(initialDataCalls);
  });

  it("validates CRUD payloads and reports mutation failures", async () => {
    window.location.hash = "#/backoffice/svc-quiz?dataset=history";

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-quiz", title: "Quiz", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({ catalogs: { categories: [], languages: [] } });
      }
      if (url.includes("/data/") && options?.method === "PATCH") {
        return Promise.reject("patch-down");
      }
      if (url.includes("/data/") && options?.method === "DELETE") {
        return Promise.reject(new Error("delete-down"));
      }
      return buildBaseHandlers("microservice-quiz")(url, options);
    });

    const { result } = renderHook(() => useServiceConsoleState("svc-quiz", context, "error-fallback", messages));

    await waitFor(() => {
      expect(result.current.serviceConfig?.service).toBe("microservice-quiz");
    });

    await act(async () => {
      await result.current.updateManualEntry("", "{}", "22", "en", 55, "manual");
    });
    expect(result.current.dataMutationError).toBe("update-id-required");

    await act(async () => {
      await result.current.updateManualEntry(" entry-1 ", "[]", "22", "en", 55, "manual");
    });
    expect(result.current.dataMutationError).toBe("content-object-only");

    await act(async () => {
      await result.current.updateManualEntry(" entry-1 ", '{"hint":null}', "22", "en", 55, "manual");
    });
    expect(result.current.dataMutationError).toBe("content-non-null");

    await act(async () => {
      await result.current.insertManualEntry("[]", "22", "en", 55, "manual");
    });
    expect(result.current.dataMutationError).toBe("content-object-only");

    await act(async () => {
      await result.current.insertManualEntry('{"hint":null}', "22", "en", 55, "manual");
    });
    expect(result.current.dataMutationError).toBe("content-non-null");

    await act(async () => {
      await result.current.updateManualEntry(" entry-1 ", '{"foo":"bar"}', "22", "en", 55, "validated");
    });
    expect(result.current.dataMutationError).toBe("error-fallback");

    await act(async () => {
      await result.current.deleteManualEntry(" entry-1 ");
    });
    expect(result.current.dataMutationError).toBe("delete-down");
  });

  it("reports successful CRUD mutations and clears the delete target after removal", async () => {
    window.location.hash = "#/backoffice/svc-quiz?dataset=history";

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-quiz", title: "Quiz", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({ catalogs: { categories: [], languages: [] } });
      }
      return buildBaseHandlers("microservice-quiz")(url, options);
    });

    const { result } = renderHook(() => useServiceConsoleState("svc-quiz", context, "error-fallback", messages));

    await waitFor(() => {
      expect(result.current.serviceConfig?.service).toBe("microservice-quiz");
    });

    await act(async () => {
      await result.current.insertManualEntry('{"foo":"bar","nullable":null}', "22", "en", 55, "manual");
    });
    expect(result.current.dataMutationMessage).toBe("insert-ok");
    expect(result.current.dataMutationError).toBeNull();

    await act(async () => {
      await result.current.updateManualEntry(" entry-1 ", '{"foo":"baz","nullable":null}', "22", "en", 60, "validated");
    });
    expect(result.current.dataMutationMessage).toBe("update-ok");
    expect(result.current.dataMutationError).toBeNull();

    act(() => {
      result.current.setDeleteEntryId(" entry-1 ");
    });

    await act(async () => {
      await result.current.deleteManualEntry(" entry-1 ");
    });
    expect(result.current.dataMutationMessage).toBe("delete-ok");
    expect(result.current.dataMutationError).toBeNull();
    expect(result.current.deleteEntryId).toBe("");
  });

  it("loads AI RAG stats for ai-engine service pages and reports fetch failures", async () => {
    window.location.hash = "#/backoffice/svc-ai-api";

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "ai-engine-api", title: "AI Engine API", domain: "ai", supportsData: false }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.resolve({
          total_chunks: 50,
          total_chars: 10000,
          unique_documents: 8,
          embedding_dimensions: 768,
          avg_chunk_chars: 200,
          coverage_level: "moderate",
          coverage_message: "partial",
          retriever_config: { top_k: 5, min_score: 0.1 },
          sources: [],
        });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const initialProps: { navKey: NavKey } = { navKey: "svc-ai-api" };

    const { result, rerender } = renderHook(
      ({ navKey }) => useServiceConsoleState(navKey, context, "error-fallback", messages),
      { initialProps },
    );

    await waitFor(() => {
      expect(result.current.aiRagStats).toEqual(
        expect.objectContaining({
          total_chunks: 50,
          coverage_level: "moderate",
        }),
      );
      expect(result.current.aiRagStatsError).toBeNull();
    });

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "ai-engine-stats", title: "AI Engine Stats", domain: "ai", supportsData: false }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.reject(new Error("rag-failed"));
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    rerender({ navKey: "svc-ai-stats" });

    await waitFor(() => {
      expect(result.current.aiRagStats).toBeNull();
      expect(result.current.aiRagStatsError).toBe("rag-failed");
    });
  });
});