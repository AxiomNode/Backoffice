import { useCallback, useEffect, useRef, useState } from "react";

import { navConfigByKey } from "../../domain/constants/navigation";
import { storeServiceLastError } from "../../application/services/operationalSummary";
import { UI_SERVICE_GENERATION_FOLLOW_STORAGE_PREFIX, UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../../domain/constants/ui";
import type { DataDataset, NavKey, ServiceCatalogItem, ServiceKey, SessionContext } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { rowsFromUnknown } from "../utils/table";
import { useAutoRefreshScheduler } from "./useAutoRefreshScheduler";
import { useDebouncedValue } from "./useDebouncedValue";

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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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

function resolveGamePayload(value: unknown): Record<string, unknown> {
  const payload = asRecord(value);
  const nestedGame = asRecord(payload.game);
  return Object.keys(nestedGame).length > 0 ? nestedGame : payload;
}

function simplifyGameHistoryRows(
  rows: Array<Record<string, unknown>>,
  gameType: "quiz" | "wordpass",
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const request = asRecord(row.request);
    const response = asRecord(row.response);
    const responseGame = resolveGamePayload(response);
    const responseQuestions = Array.isArray(responseGame.questions) ? responseGame.questions : [];
    const responseWords = Array.isArray(responseGame.words) ? responseGame.words : [];

    const difficulty =
      asNumber(responseGame.difficulty_percentage) ??
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
        categoryId: row.categoryId,
        category: row.categoryName ?? row.categoryId,
        language: row.language,
        difficultyPercentage: difficulty,
        primaryQuestion,
        request,
        response,
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
      categoryId: row.categoryId,
      category: row.categoryName ?? row.categoryId,
      language: row.language,
      difficultyPercentage: difficulty,
      primaryWords,
      request,
      response,
    };
  });
}

/** I18n message keys consumed by the service console hook. */
export type ServiceConsoleMessages = {
  insertOk: string;
  updateOk: string;
  deleteOk: string;
  updateIdRequired: string;
  contentObjectOnly: string;
  contentNonNull: string;
};

/** Manages data fetching, pagination, filters, and CRUD state for a service console panel. */
export function useServiceConsoleState(navKey: NavKey, context: SessionContext, errorLabel: string, messages: ServiceConsoleMessages) {
  const serviceConfig = navConfigByKey(navKey);
  const overviewRequestVersionRef = useRef(0);
  const dataRequestVersionRef = useRef(0);
  const overviewAbortControllerRef = useRef<AbortController | null>(null);
  const dataAbortControllerRef = useRef<AbortController | null>(null);
  const serviceCatalogCacheRef = useRef<ServiceCatalogItem[] | null>(null);
  const manualCatalogCacheRef = useRef<Partial<Record<ServiceKey, ServiceCatalogSnapshot>>>({});

  // --- Data state ---
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [metricsRows, setMetricsRows] = useState<Array<Record<string, unknown>>>([]);
  const [logsRows, setLogsRows] = useState<Array<Record<string, unknown>>>([]);
  const [dataRows, setDataRows] = useState<Array<Record<string, unknown>>>([]);
  const [dataTotal, setDataTotal] = useState(0);
  const [dataPage, setDataPage] = useState(1);
  const [dataPageSize, setDataPageSize] = useState(20);

  // --- Filter / pagination state ---
  const [dataset, setDataset] = useState<DataDataset>(serviceConfig?.defaultDataset ?? "history");
  const [metric, setMetric] = useState<"won" | "score" | "played">("won");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [limit, setLimit] = useState(200);
  const debouncedFilter = useDebouncedValue(filter, 300);
  const debouncedSortBy = useDebouncedValue(sortBy, 150);

  // --- Refresh state ---
  const [refreshMode, setRefreshMode] = useState<"manual" | "auto">("manual");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(10);
  const [refreshCycleVersion, setRefreshCycleVersion] = useState(0);
  const [followTaskId, setFollowTaskId] = useState("");

  // --- Loading / error state ---
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // --- Manual CRUD state ---
  const [manualCategoryId, setManualCategoryId] = useState("23");
  const [manualLanguage, setManualLanguage] = useState("es");
  const [manualDifficulty, setManualDifficulty] = useState(55);
  const [manualStatus, setManualStatus] = useState<"manual" | "validated" | "pending_review">("manual");
  const [manualContentJson, setManualContentJson] = useState('{"title":"", "content":""}');
  const [editEntryId, setEditEntryId] = useState("");
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
    setDataTotal(0);
    setDataPage(1);
    setDataPageSize(20);
    setError(null);
    setMetricsError(null);
    setLogsError(null);
    setDataError(null);
    setOverviewLoading(false);
    setDataLoading(false);
    setFilter("");
    setSortBy("");
    setSortDirection("desc");
    setPage(1);
    setPageSize(20);
    setLimit(200);
    setMetric("won");
    setRefreshMode("manual");
    setRefreshIntervalSeconds(10);
    setFollowTaskId("");
    setManualCategoryId("23");
    setManualLanguage("es");
    setManualDifficulty(55);
    setManualStatus("manual");
    setManualContentJson('{"title":"", "content":""}');
    setEditEntryId("");
    setDeleteEntryId("");
    setManualCatalogs({ categories: [], languages: [] });
    setManualCatalogError(null);
    setDataMutationMessage(null);
    setDataMutationError(null);
    setDataMutationLoading(false);
    overviewRequestVersionRef.current += 1;
    dataRequestVersionRef.current += 1;

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

  useEffect(() => {
    let cancelled = false;

    const loadServiceCatalog = async () => {
      if (serviceCatalogCacheRef.current) {
        setCatalog(serviceCatalogCacheRef.current);
        return;
      }

      try {
        const payload = await fetchJson<{ services: ServiceCatalogItem[] }>(`${EDGE_API_BASE}/v1/backoffice/services`, {
          headers: composeAuthHeaders(context),
        });

        if (cancelled) return;
        const nextCatalog = payload.services ?? [];
        serviceCatalogCacheRef.current = nextCatalog;
        setCatalog(nextCatalog);
      } catch {
        if (cancelled) return;
        setCatalog([]);
      }
    };

    void loadServiceCatalog();
    return () => {
      cancelled = true;
    };
  }, [context]);

  // --- Load catalog for game services ---
  useEffect(() => {
    if (!serviceConfig || (serviceConfig.service !== "microservice-quiz" && serviceConfig.service !== "microservice-wordpass")) {
      return;
    }

    let cancelled = false;
    const loadCatalogs = async () => {
      try {
        setManualCatalogError(null);
        const cachedCatalog = manualCatalogCacheRef.current[serviceConfig.service];
        if (cachedCatalog) {
          if (cancelled) return;
          setManualCatalogs(cachedCatalog);

          if (cachedCatalog.categories.length > 0 && !cachedCatalog.categories.some((item) => item.id === manualCategoryId)) {
            setManualCategoryId(cachedCatalog.categories[0].id);
          }
          if (cachedCatalog.languages.length > 0 && !cachedCatalog.languages.some((item) => item.code === manualLanguage)) {
            setManualLanguage(cachedCatalog.languages[0].code);
          }
          return;
        }

        const payload = await fetchJson<{ catalogs?: { categories?: Array<{ id: string; name: string }>; languages?: Array<{ code: string; name: string }> } }>(
          `${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/catalogs`,
          { headers: composeAuthHeaders(context) },
        );

        if (cancelled) return;

          const categories = payload.catalogs?.categories ?? [];
          const languages = payload.catalogs?.languages ?? [];
          const nextCatalog = { categories, languages };
          manualCatalogCacheRef.current[serviceConfig.service] = nextCatalog;
          setManualCatalogs(nextCatalog);

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

  useEffect(() => {
    return () => {
      overviewAbortControllerRef.current?.abort();
      dataAbortControllerRef.current?.abort();
    };
  }, []);

  const loadOverview = useCallback(async () => {
    if (!serviceConfig) return;

    const requestVersion = ++overviewRequestVersionRef.current;
    overviewAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    overviewAbortControllerRef.current = abortController;

    setOverviewLoading(true);
    setError(null);
    setMetricsError(null);
    setLogsError(null);

    try {
      const [metricsResult, logsResult] = await Promise.all([
        asSectionResult(
          fetchJson<{ metrics: unknown }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/metrics`, {
            headers: composeAuthHeaders(context),
            signal: abortController.signal,
          }),
        ),
        asSectionResult(
          fetchJson<{ logs: unknown }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/logs?limit=${limit}`, {
            headers: composeAuthHeaders(context),
            signal: abortController.signal,
          }),
        ),
      ]);

      if (requestVersion !== overviewRequestVersionRef.current) return;

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
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (requestVersion !== overviewRequestVersionRef.current) return;
      setMetricsRows([]);
      setLogsRows([]);
      const message = err instanceof Error ? err.message : errorLabel;
      setError(message);
      storeServiceLastError(serviceConfig.service, message);
    } finally {
      if (overviewAbortControllerRef.current === abortController) {
        overviewAbortControllerRef.current = null;
      }
      if (requestVersion === overviewRequestVersionRef.current) {
        setOverviewLoading(false);
        setRefreshCycleVersion((current) => current + 1);
      }
    }
  }, [context, limit, serviceConfig, errorLabel]);

  const loadData = useCallback(async () => {
    if (!serviceConfig) return;

    const catalogEntry = catalog.find((item) => item.key === serviceConfig.service);
    const supportsTabularData = catalogEntry ? catalogEntry.supportsData : Boolean(serviceConfig.datasets?.length);

    const requestVersion = ++dataRequestVersionRef.current;
    dataAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    dataAbortControllerRef.current = abortController;

    setDataLoading(true);
    setDataError(null);

    try {
      if (!supportsTabularData || !serviceConfig.datasets || serviceConfig.datasets.length === 0) {
        if (requestVersion !== dataRequestVersionRef.current) return;
        setDataRows([]);
        setDataTotal(0);
        setDataPage(page);
        setDataPageSize(pageSize);
        return;
      }

      const query = new URLSearchParams({
        dataset,
        page: String(page),
        pageSize: String(pageSize),
        sortBy: debouncedSortBy,
        sortDirection,
        filter: debouncedFilter,
        metric,
        limit: String(limit),
      });

      const dataResult = await asSectionResult(
        fetchJson<{ rows: Array<Record<string, unknown>>; total?: number; page?: number; pageSize?: number }>(
          `${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/data?${query.toString()}`,
          { headers: composeAuthHeaders(context), signal: abortController.signal },
        ),
      );

      if (requestVersion !== dataRequestVersionRef.current) return;

      if (!dataResult.ok) {
        setDataRows([]);
        setDataTotal(0);
        setDataPage(page);
        setDataPageSize(pageSize);
        setDataError(dataResult.error);
        storeServiceLastError(serviceConfig.service, dataResult.error);
        return;
      }

      let nextRows = dataResult.data.rows ?? [];
      const nextTotal = typeof dataResult.data.total === "number" ? dataResult.data.total : nextRows.length;
      const nextPage = typeof dataResult.data.page === "number" ? dataResult.data.page : page;
      const nextResolvedPageSize = typeof dataResult.data.pageSize === "number" ? dataResult.data.pageSize : pageSize;

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
            { headers: composeAuthHeaders(context), signal: abortController.signal },
          ),
        );

        if (requestVersion !== dataRequestVersionRef.current) return;

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
      setDataTotal(nextTotal);
      setDataPage(nextPage);
      setDataPageSize(nextResolvedPageSize);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (requestVersion !== dataRequestVersionRef.current) return;
      setDataRows([]);
      setDataTotal(0);
      setDataPage(page);
      setDataPageSize(pageSize);
      const message = err instanceof Error ? err.message : errorLabel;
      setDataError(message);
      storeServiceLastError(serviceConfig.service, message);
    } finally {
      if (dataAbortControllerRef.current === abortController) {
        dataAbortControllerRef.current = null;
      }
      if (requestVersion === dataRequestVersionRef.current) {
        setDataLoading(false);
      }
    }
  }, [catalog, context, dataset, debouncedFilter, debouncedSortBy, followTaskId, limit, metric, page, pageSize, serviceConfig, sortDirection, errorLabel]);

  // --- loadAll: fetch overview + data ---
  const loadAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadData()]);
  }, [loadData, loadOverview]);

  // --- Trigger overview load ---
  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // --- Trigger data load ---
  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilter, debouncedSortBy]);

  useAutoRefreshScheduler(
    () => loadOverview(),
    refreshIntervalSeconds * 1000,
    refreshMode === "auto",
    overviewLoading || dataLoading,
  );

  // --- CRUD ---
  const insertManualEntry = useCallback(async (contentJson: string, categoryId: string, language: string, difficulty: number, status: "manual" | "validated" | "pending_review") => {
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
          status,
        }),
      });

      setDataMutationMessage(messages.insertOk);
      await loadData();
    } catch (mutationError) {
      setDataMutationError(mutationError instanceof Error ? mutationError.message : errorLabel);
    } finally {
      setDataMutationLoading(false);
    }
  }, [context, loadData, serviceConfig, errorLabel, messages]);

  const updateManualEntry = useCallback(async (
    entryId: string,
    contentJson: string,
    categoryId: string,
    language: string,
    difficulty: number,
    status: "manual" | "validated" | "pending_review",
  ) => {
    if (!serviceConfig) return;
    if (!entryId.trim()) {
      setDataMutationError(messages.updateIdRequired);
      return;
    }

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

      await fetchJson<{ item: Record<string, unknown> }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/data/${encodeURIComponent(entryId.trim())}`, {
        method: "PATCH",
        headers: composeAuthHeaders(context),
        body: JSON.stringify({
          dataset: "history",
          categoryId,
          language,
          difficultyPercentage: difficulty,
          content,
          status,
        }),
      });

      setDataMutationMessage(messages.updateOk);
      await loadData();
    } catch (mutationError) {
      setDataMutationError(mutationError instanceof Error ? mutationError.message : errorLabel);
    } finally {
      setDataMutationLoading(false);
    }
  }, [context, loadData, serviceConfig, errorLabel, messages]);

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
      await loadData();
    } catch (mutationError) {
      setDataMutationError(mutationError instanceof Error ? mutationError.message : errorLabel);
    } finally {
      setDataMutationLoading(false);
    }
  }, [context, loadData, serviceConfig, errorLabel, messages]);

  return {
    serviceConfig,
    // Data
    catalog, metricsRows, logsRows, dataRows, dataTotal, dataPage, dataPageSize,
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
    refreshCycleVersion,
    followTaskId, setFollowTaskId,
    // Loading / errors
    loading: overviewLoading || dataLoading,
    overviewLoading,
    dataLoading,
    error,
    metricsError, logsError, dataError,
    // Manual CRUD
    manualCategoryId, setManualCategoryId,
    manualLanguage, setManualLanguage,
    manualDifficulty, setManualDifficulty,
    manualStatus, setManualStatus,
    manualContentJson, setManualContentJson,
    editEntryId, setEditEntryId,
    deleteEntryId, setDeleteEntryId,
    manualCatalogs, manualCatalogError,
    dataMutationMessage, dataMutationError, dataMutationLoading,
    // Actions
    loadAll,
    loadOverview,
    loadData,
    insertManualEntry,
    updateManualEntry,
    deleteManualEntry,
  };
}
