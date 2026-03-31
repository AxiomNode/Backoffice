import { useCallback, useEffect, useRef, useState } from "react";

import { navConfigByKey } from "../../domain/constants/navigation";
import { storeServiceLastError } from "../../application/services/operationalSummary";
import { UI_SERVICE_GENERATION_FOLLOW_STORAGE_PREFIX, UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../../domain/constants/ui";
import type { DataDataset, NavKey, ServiceCatalogItem, SessionContext } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { rowsFromUnknown } from "../utils/table";

/** @module useServiceConsoleState - State management hook for individual service console panels. */

type SectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type ServiceCatalogSnapshot = {
  categories: Array<{ id: string; name: string }>;
  languages: Array<{ code: string; name: string }>;
};

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function asSectionResult<T>(promise: Promise<T>): Promise<SectionResult<T>> {
  return promise
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function simplifyGameHistoryRows(
  rows: Array<Record<string, unknown>>,
  gameType: "quiz" | "wordpass",
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const request = asRecord(row.request);
    const response = asRecord(row.response);
    const responseQuestions = Array.isArray(response.questions) ? response.questions : [];
    const responseWords = Array.isArray(response.words) ? response.words : [];

    const difficulty =
      asNumber(response.difficulty_percentage) ??
      asNumber(request.difficulty_percentage);

    if (gameType === "quiz") {
      const primaryQuestion = responseQuestions
        .map((item) => asString(asRecord(item).question).trim())
        .find((value) => value.length > 0) ?? "";

      return {
        detail: { id: row.id },
        createdAt: row.createdAt,
        status: row.status,
        category: row.categoryName ?? row.categoryId,
        language: row.language,
        difficultyPercentage: difficulty,
        primaryQuestion,
      };
    }

    const primaryWords = responseWords
      .map((item) => {
        const record = asRecord(item);
        return asString(record.answer || record.word).trim();
      })
      .filter((value) => value.length > 0)
      .slice(0, 6)
      .join(", ");

    return {
      detail: { id: row.id },
      createdAt: row.createdAt,
      status: row.status,
      category: row.categoryName ?? row.categoryId,
      language: row.language,
      difficultyPercentage: difficulty,
      primaryWords,
    };
  });
}

/** I18n message keys consumed by the service console hook. */
export type ServiceConsoleMessages = {
  insertOk: string;
  deleteOk: string;
  contentObjectOnly: string;
  contentNonNull: string;
};

/** Manages data fetching, pagination, filters, and CRUD state for a service console panel. */
export function useServiceConsoleState(navKey: NavKey, context: SessionContext, errorLabel: string, messages: ServiceConsoleMessages) {
  const serviceConfig = navConfigByKey(navKey);
  const requestVersionRef = useRef(0);

  // --- Data state ---
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [metricsRows, setMetricsRows] = useState<Array<Record<string, unknown>>>([]);
  const [logsRows, setLogsRows] = useState<Array<Record<string, unknown>>>([]);
  const [dataRows, setDataRows] = useState<Array<Record<string, unknown>>>([]);

  // --- Filter / pagination state ---
  const [dataset, setDataset] = useState<DataDataset>(serviceConfig?.defaultDataset ?? "history");
  const [metric, setMetric] = useState<"won" | "score" | "played">("won");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [limit, setLimit] = useState(200);

  // --- Refresh state ---
  const [refreshMode, setRefreshMode] = useState<"manual" | "auto">("manual");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(10);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [followTaskId, setFollowTaskId] = useState("");

  // --- Loading / error state ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // --- Manual CRUD state ---
  const [manualCategoryId, setManualCategoryId] = useState("23");
  const [manualLanguage, setManualLanguage] = useState("es");
  const [manualDifficulty, setManualDifficulty] = useState(55);
  const [manualContentJson, setManualContentJson] = useState('{"title":"", "content":""}');
  const [deleteEntryId, setDeleteEntryId] = useState("");
  const [manualCatalogs, setManualCatalogs] = useState<ServiceCatalogSnapshot>({ categories: [], languages: [] });
  const [manualCatalogError, setManualCatalogError] = useState<string | null>(null);
  const [dataMutationMessage, setDataMutationMessage] = useState<string | null>(null);
  const [dataMutationError, setDataMutationError] = useState<string | null>(null);
  const [dataMutationLoading, setDataMutationLoading] = useState(false);

  // --- Reset on navKey change ---
  useEffect(() => {
    setCatalog([]);
    setMetricsRows([]);
    setLogsRows([]);
    setDataRows([]);
    setError(null);
    setMetricsError(null);
    setLogsError(null);
    setDataError(null);
    setLoading(false);
    setFilter("");
    setSortBy("");
    setSortDirection("desc");
    setPage(1);
    setPageSize(20);
    setLimit(200);
    setMetric("won");
    setRefreshMode("manual");
    setRefreshIntervalSeconds(10);
    setElapsedMs(0);
    setFollowTaskId("");
    setManualCategoryId("23");
    setManualLanguage("es");
    setManualDifficulty(55);
    setManualContentJson('{"title":"", "content":""}');
    setDeleteEntryId("");
    setManualCatalogs({ categories: [], languages: [] });
    setManualCatalogError(null);
    setDataMutationMessage(null);
    setDataMutationError(null);
    setDataMutationLoading(false);
    requestVersionRef.current += 1;

    if (typeof window === "undefined") {
      if (serviceConfig?.defaultDataset) setDataset(serviceConfig.defaultDataset);
      return;
    }

    const currentHash = window.location.hash;
    const queryIndex = currentHash.indexOf("?");
    const query = queryIndex >= 0 ? currentHash.slice(queryIndex + 1) : "";
    const params = new URLSearchParams(query);

    const datasetParam = params.get("dataset") as DataDataset | null;
    const datasetIsSupported =
      datasetParam !== null &&
      !!serviceConfig?.datasets?.some((option) => option.value === datasetParam);

    if (datasetIsSupported) {
      setDataset(datasetParam as DataDataset);
    } else if (serviceConfig?.defaultDataset) {
      setDataset(serviceConfig.defaultDataset);
    }

    setFilter(params.get("filter") ?? "");
    setSortBy(params.get("sortBy") ?? "");

    const sortDirectionParam = params.get("sortDirection");
    setSortDirection(sortDirectionParam === "asc" ? "asc" : "desc");

    setPage(parseIntParam(params.get("page"), 1, 1, 100000));
    setPageSize(parseIntParam(params.get("pageSize"), 20, 1, 200));
    setLimit(parseIntParam(params.get("limit"), 200, 1, 1000));

    const metricParam = params.get("metric");
    if (metricParam === "won" || metricParam === "score" || metricParam === "played") {
      setMetric(metricParam);
    }

    const refreshModeParam = params.get("refreshMode");
    setRefreshMode(refreshModeParam === "auto" ? "auto" : "manual");

    const interval = parseIntParam(params.get("refreshInterval"), 10, 5, 300);
    setRefreshIntervalSeconds(interval);

    const followTask = params.get("followTaskId") ?? "";
    setFollowTaskId(followTask.trim());
  }, [navKey]);

  // --- URL param sync ---
  useEffect(() => {
    if (typeof window === "undefined" || !serviceConfig) return;

    const routePrefix = `#/backoffice/${navKey}`;
    if (!window.location.hash.startsWith(routePrefix)) return;

    const params = new URLSearchParams();

    if (serviceConfig.datasets && serviceConfig.datasets.length > 0) {
      params.set("dataset", dataset);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("limit", String(limit));
      params.set("sortDirection", sortDirection);
      if (filter) params.set("filter", filter);
      if (sortBy) params.set("sortBy", sortBy);
      if (serviceConfig.service === "microservice-users" && dataset === "leaderboard") {
        params.set("metric", metric);
      }

      const supportsProcessFollow =
        (serviceConfig.service === "microservice-quiz" || serviceConfig.service === "microservice-wordpass") &&
        dataset === "processes";

      if (supportsProcessFollow && followTaskId.trim()) {
        params.set("followTaskId", followTaskId.trim());
      }
    }

    params.set("refreshMode", refreshMode);
    params.set("refreshInterval", String(refreshIntervalSeconds));

    const query = params.toString();
    const nextHash = query ? `${routePrefix}?${query}` : routePrefix;

    try {
      const storageKey = `${UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX}.${navKey}`;
      if (query) {
        window.localStorage.setItem(storageKey, query);
      } else {
        window.localStorage.removeItem(storageKey);
      }

      const followKey = `${UI_SERVICE_GENERATION_FOLLOW_STORAGE_PREFIX}.${navKey}`;
      if (followTaskId.trim()) {
        window.localStorage.setItem(followKey, followTaskId.trim());
      } else {
        window.localStorage.removeItem(followKey);
      }
    } catch {
      // Ignore storage errors
    }

    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, [dataset, filter, followTaskId, limit, metric, navKey, page, pageSize, refreshIntervalSeconds, refreshMode, serviceConfig, sortBy, sortDirection]);

  // --- Reset elapsed on refresh config change ---
  useEffect(() => {
    setElapsedMs(0);
  }, [refreshMode, refreshIntervalSeconds]);

  // --- Load catalog for game services ---
  useEffect(() => {
    if (!serviceConfig || (serviceConfig.service !== "microservice-quiz" && serviceConfig.service !== "microservice-wordpass")) {
      return;
    }

    let cancelled = false;
    const loadCatalogs = async () => {
      try {
        setManualCatalogError(null);
        const payload = await fetchJson<{ catalogs?: { categories?: Array<{ id: string; name: string }>; languages?: Array<{ code: string; name: string }> } }>(
          `${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/catalogs`,
          { headers: composeAuthHeaders(context) },
        );

        if (cancelled) return;

        const categories = payload.catalogs?.categories ?? [];
        const languages = payload.catalogs?.languages ?? [];
        setManualCatalogs({ categories, languages });

        if (categories.length > 0 && !categories.some((item) => item.id === manualCategoryId)) {
          setManualCategoryId(categories[0].id);
        }
        if (languages.length > 0 && !languages.some((item) => item.code === manualLanguage)) {
          setManualLanguage(languages[0].code);
        }
      } catch (catalogError) {
        if (cancelled) return;
        setManualCatalogError(catalogError instanceof Error ? catalogError.message : errorLabel);
      }
    };

    void loadCatalogs();
    return () => { cancelled = true; };
  }, [context, serviceConfig]);

  // --- loadAll: fetch catalog + metrics + logs + data ---
  const loadAll = useCallback(async () => {
    if (!serviceConfig) return;

    const requestVersion = ++requestVersionRef.current;

    setLoading(true);
    setError(null);
    setMetricsError(null);
    setLogsError(null);
    setDataError(null);

    try {
      const [catalogResult, metricsResult, logsResult] = await Promise.all([
        asSectionResult(
          fetchJson<{ services: ServiceCatalogItem[] }>(`${EDGE_API_BASE}/v1/backoffice/services`, {
            headers: composeAuthHeaders(context),
          }),
        ),
        asSectionResult(
          fetchJson<{ metrics: unknown }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/metrics`, {
            headers: composeAuthHeaders(context),
          }),
        ),
        asSectionResult(
          fetchJson<{ logs: unknown }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/logs?limit=${limit}`, {
            headers: composeAuthHeaders(context),
          }),
        ),
      ]);

      if (requestVersion !== requestVersionRef.current) return;

      if (catalogResult.ok) {
        setCatalog(catalogResult.data.services ?? []);
      } else {
        setCatalog([]);
      }

      if (metricsResult.ok) {
        setMetricsRows(rowsFromUnknown(metricsResult.data.metrics));
      } else {
        setMetricsRows([]);
        setMetricsError(metricsResult.error);
        storeServiceLastError(serviceConfig.service, metricsResult.error);
      }

      if (logsResult.ok) {
        setLogsRows(rowsFromUnknown(logsResult.data.logs));
      } else {
        setLogsRows([]);
        setLogsError(logsResult.error);
        storeServiceLastError(serviceConfig.service, logsResult.error);
      }

      if (serviceConfig.datasets && serviceConfig.datasets.length > 0) {
        const query = new URLSearchParams({
          dataset,
          page: String(page),
          pageSize: String(pageSize),
          sortBy,
          sortDirection,
          filter,
          metric,
          limit: String(limit),
        });

        const dataResult = await asSectionResult(
          fetchJson<{ rows: Array<Record<string, unknown>> }>(
            `${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/data?${query.toString()}`,
            { headers: composeAuthHeaders(context) },
          ),
        );
        if (requestVersion !== requestVersionRef.current) return;
        if (dataResult.ok) {
          let nextRows = dataResult.data.rows ?? [];

          const isQuizHistory = serviceConfig.service === "microservice-quiz" && dataset === "history";
          const isWordpassHistory = serviceConfig.service === "microservice-wordpass" && dataset === "history";

          if (isQuizHistory) nextRows = simplifyGameHistoryRows(nextRows, "quiz");
          if (isWordpassHistory) nextRows = simplifyGameHistoryRows(nextRows, "wordpass");

          const supportsProcessFollow =
            dataset === "processes" &&
            followTaskId.trim().length > 0 &&
            (serviceConfig.service === "microservice-quiz" || serviceConfig.service === "microservice-wordpass");

          if (supportsProcessFollow) {
            const followResult = await asSectionResult(
              fetchJson<{ task?: Record<string, unknown> }>(
                `${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/generation/process/${encodeURIComponent(followTaskId.trim())}?includeItems=false`,
                { headers: composeAuthHeaders(context) },
              ),
            );

            if (requestVersion !== requestVersionRef.current) return;

            if (followResult.ok && followResult.data.task) {
              const followedTask = followResult.data.task;
              const followedTaskId = String(followedTask.taskId ?? "");
              nextRows = [
                followedTask,
                ...nextRows.filter((row) => String(row.taskId ?? "") !== followedTaskId),
              ];
            }
          }

          setDataRows(nextRows);
        } else {
          setDataRows([]);
          setDataError(dataResult.error);
          storeServiceLastError(serviceConfig.service, dataResult.error);
        }
      } else {
        if (requestVersion !== requestVersionRef.current) return;
        setDataRows([]);
      }
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) return;
      setMetricsRows([]);
      setLogsRows([]);
      setDataRows([]);
      const message = err instanceof Error ? err.message : errorLabel;
      setError(message);
      storeServiceLastError(serviceConfig.service, message);
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [context, dataset, filter, followTaskId, limit, metric, page, pageSize, serviceConfig, sortBy, sortDirection, errorLabel]);

  // --- Trigger initial + dependency load ---
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // --- Auto-refresh ---
  useEffect(() => {
    if (refreshMode !== "auto") return;

    const stepMs = 200;
    const timer = window.setInterval(() => {
      setElapsedMs((current) => {
        if (loading) return current;
        const nextValue = current + stepMs;
        const threshold = refreshIntervalSeconds * 1000;
        if (nextValue >= threshold) {
          void loadAll();
          return 0;
        }
        return nextValue;
      });
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [loadAll, loading, refreshIntervalSeconds, refreshMode]);

  // --- CRUD ---
  const insertManualEntry = useCallback(async (contentJson: string, categoryId: string, language: string, difficulty: number) => {
    if (!serviceConfig) return;
    try {
      setDataMutationLoading(true);
      setDataMutationError(null);
      setDataMutationMessage(null);

      const parsed = JSON.parse(contentJson) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(messages.contentObjectOnly);
      }
      const entries = Object.entries(parsed as Record<string, unknown>).filter(([, value]) => value !== null && value !== undefined);
      if (entries.length === 0) {
        throw new Error(messages.contentNonNull);
      }
      const content = Object.fromEntries(entries);

      await fetchJson<{ item: Record<string, unknown> }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/data`, {
        method: "POST",
        headers: composeAuthHeaders(context),
        body: JSON.stringify({
          dataset: "history",
          categoryId,
          language,
          difficultyPercentage: difficulty,
          content,
          status: "manual",
        }),
      });

      setDataMutationMessage(messages.insertOk);
      await loadAll();
    } catch (mutationError) {
      setDataMutationError(mutationError instanceof Error ? mutationError.message : errorLabel);
    } finally {
      setDataMutationLoading(false);
    }
  }, [context, loadAll, serviceConfig, errorLabel, messages]);

  const deleteManualEntry = useCallback(async (entryId: string) => {
    if (!serviceConfig || !entryId.trim()) return;
    try {
      setDataMutationLoading(true);
      setDataMutationError(null);
      setDataMutationMessage(null);

      await fetchJson<{ deleted: boolean }>(
        `${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/data/${encodeURIComponent(entryId.trim())}?dataset=history`,
        {
          method: "DELETE",
          headers: composeAuthHeaders(context),
        },
      );

      setDataMutationMessage(messages.deleteOk);
      setDeleteEntryId("");
      await loadAll();
    } catch (mutationError) {
      setDataMutationError(mutationError instanceof Error ? mutationError.message : errorLabel);
    } finally {
      setDataMutationLoading(false);
    }
  }, [context, loadAll, serviceConfig, errorLabel, messages]);

  return {
    serviceConfig,
    // Data
    catalog, metricsRows, logsRows, dataRows,
    // Filter / pagination
    dataset, setDataset,
    metric, setMetric,
    filter, setFilter,
    sortBy, setSortBy,
    sortDirection, setSortDirection,
    page, setPage,
    pageSize, setPageSize,
    limit, setLimit,
    // Refresh
    refreshMode, setRefreshMode,
    refreshIntervalSeconds, setRefreshIntervalSeconds,
    elapsedMs,
    followTaskId, setFollowTaskId,
    // Loading / errors
    loading, error,
    metricsError, logsError, dataError,
    // Manual CRUD
    manualCategoryId, setManualCategoryId,
    manualLanguage, setManualLanguage,
    manualDifficulty, setManualDifficulty,
    manualContentJson, setManualContentJson,
    deleteEntryId, setDeleteEntryId,
    manualCatalogs, manualCatalogError,
    dataMutationMessage, dataMutationError, dataMutationLoading,
    // Actions
    loadAll, insertManualEntry, deleteManualEntry,
  };
}
