import { useCallback, useEffect, useRef, useState } from "react";

import { navConfigByKey } from "../../domain/constants/navigation";
import { storeServiceLastError } from "../../application/services/operationalSummary";
import { UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../../domain/constants/ui";
import type { DataDataset, NavKey, ServiceCatalogItem, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";
import type { LabelKey } from "../../i18n/labels";
import { rowsFromUnknown } from "../utils/table";
import { PaginatedFilterableTable } from "../components/PaginatedFilterableTable";

const NAV_TITLE_KEYS: Record<NavKey, LabelKey> = {
  "svc-overview": "nav.svc-overview.title",
  "svc-api-gateway": "nav.svc-api-gateway.title",
  "svc-bff-backoffice": "nav.svc-bff-backoffice.title",
  "svc-bff-mobile": "nav.svc-bff-mobile.title",
  "svc-users": "nav.svc-users.title",
  "svc-quiz": "nav.svc-quiz.title",
  "svc-wordpass": "nav.svc-wordpass.title",
  "svc-ai-stats": "nav.svc-ai-stats.title",
  "svc-ai-api": "nav.svc-ai-api.title",
  hotfix: "nav.hotfix.title",
  roles: "nav.roles.title",
};

const NAV_SUBTITLE_KEYS: Record<NavKey, LabelKey> = {
  "svc-overview": "nav.svc-overview.subtitle",
  "svc-api-gateway": "nav.svc-api-gateway.subtitle",
  "svc-bff-backoffice": "nav.svc-bff-backoffice.subtitle",
  "svc-bff-mobile": "nav.svc-bff-mobile.subtitle",
  "svc-users": "nav.svc-users.subtitle",
  "svc-quiz": "nav.svc-quiz.subtitle",
  "svc-wordpass": "nav.svc-wordpass.subtitle",
  "svc-ai-stats": "nav.svc-ai-stats.subtitle",
  "svc-ai-api": "nav.svc-ai-api.subtitle",
  hotfix: "nav.hotfix.subtitle",
  roles: "nav.roles.subtitle",
};

type ServiceConsolePanelProps = {
  navKey: NavKey;
  context: SessionContext;
  density: UiDensity;
};

type SectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type ServiceCatalogSnapshot = {
  categories: Array<{ id: string; name: string }>;
  languages: Array<{ code: string; name: string }>;
};

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.trunc(parsed);
  if (rounded < min || rounded > max) {
    return fallback;
  }
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

export function ServiceConsolePanel({ navKey, context, density }: ServiceConsolePanelProps) {
  const { t } = useI18n();
  const serviceConfig = navConfigByKey(navKey);
  const requestVersionRef = useRef(0);
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);

  const [metricsRows, setMetricsRows] = useState<Array<Record<string, unknown>>>([]);
  const [logsRows, setLogsRows] = useState<Array<Record<string, unknown>>>([]);
  const [dataRows, setDataRows] = useState<Array<Record<string, unknown>>>([]);

  const [dataset, setDataset] = useState<DataDataset>(serviceConfig?.defaultDataset ?? "history");
  const [metric, setMetric] = useState<"won" | "score" | "played">("won");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [limit, setLimit] = useState(200);
  const [refreshMode, setRefreshMode] = useState<"manual" | "auto">("manual");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(10);
  const [elapsedMs, setElapsedMs] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
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
  const compact = density === "dense";

  useEffect(() => {
    // Force full view isolation when navigating between services.
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
      if (serviceConfig?.defaultDataset) {
        setDataset(serviceConfig.defaultDataset);
      }
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
  }, [navKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !serviceConfig) {
      return;
    }

    const routePrefix = `#/backoffice/${navKey}`;
    if (!window.location.hash.startsWith(routePrefix)) {
      return;
    }

    const params = new URLSearchParams();

    if (serviceConfig.datasets && serviceConfig.datasets.length > 0) {
      params.set("dataset", dataset);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("limit", String(limit));
      params.set("sortDirection", sortDirection);
      if (filter) {
        params.set("filter", filter);
      }
      if (sortBy) {
        params.set("sortBy", sortBy);
      }
      if (serviceConfig.service === "microservice-users" && dataset === "leaderboard") {
        params.set("metric", metric);
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
    } catch {
      // Ignore storage errors to keep route-state sync resilient.
    }

    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, [dataset, filter, limit, metric, navKey, page, pageSize, refreshIntervalSeconds, refreshMode, serviceConfig, sortBy, sortDirection]);

  useEffect(() => {
    setElapsedMs(0);
  }, [refreshMode, refreshIntervalSeconds]);

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
          {
            headers: composeAuthHeaders(context),
          },
        );

        if (cancelled) {
          return;
        }

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
        if (cancelled) {
          return;
        }
        setManualCatalogError(catalogError instanceof Error ? catalogError.message : t("roles.errorUnknown"));
      }
    };

    void loadCatalogs();

    return () => {
      cancelled = true;
    };
  }, [context, serviceConfig, t]);

  const loadAll = useCallback(async () => {
    if (!serviceConfig) {
      return;
    }

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

      if (requestVersion !== requestVersionRef.current) {
        return;
      }

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
            {
              headers: composeAuthHeaders(context),
            },
          ),
        );
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        if (dataResult.ok) {
          setDataRows(dataResult.data.rows ?? []);
        } else {
          setDataRows([]);
          setDataError(dataResult.error);
          storeServiceLastError(serviceConfig.service, dataResult.error);
        }
      } else {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        setDataRows([]);
      }
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      setMetricsRows([]);
      setLogsRows([]);
      setDataRows([]);
      const message = err instanceof Error ? err.message : t("roles.errorUnknown");
      setError(message);
      storeServiceLastError(serviceConfig.service, message);
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [context, dataset, filter, limit, metric, page, pageSize, serviceConfig, sortBy, sortDirection, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (refreshMode !== "auto") {
      return;
    }

    const stepMs = 200;
    const timer = window.setInterval(() => {
      setElapsedMs((current) => {
        if (loading) {
          return current;
        }

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

  if (!serviceConfig) {
    return <section className="m3-card p-5">{t("service.notFound")}</section>;
  }

  const isGameHistoryDataset =
    (serviceConfig.service === "microservice-quiz" || serviceConfig.service === "microservice-wordpass") &&
    dataset === "history";

  const parseManualContent = (): Record<string, unknown> => {
    const parsed = JSON.parse(manualContentJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(t("service.data.manual.contentObjectOnly"));
    }
    const entries = Object.entries(parsed as Record<string, unknown>).filter(([, value]) => value !== null && value !== undefined);
    if (entries.length === 0) {
      throw new Error(t("service.data.manual.contentRequired"));
    }
    return Object.fromEntries(entries);
  };

  const insertManualEntry = async () => {
    try {
      setDataMutationLoading(true);
      setDataMutationError(null);
      setDataMutationMessage(null);

      const content = parseManualContent();
      await fetchJson<{ item: Record<string, unknown> }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/data`, {
        method: "POST",
        headers: composeAuthHeaders(context),
        body: JSON.stringify({
          dataset: "history",
          categoryId: manualCategoryId,
          language: manualLanguage,
          difficultyPercentage: manualDifficulty,
          content,
          status: "manual",
        }),
      });

      setDataMutationMessage(t("service.data.manual.insertOk"));
      await loadAll();
    } catch (mutationError) {
      setDataMutationError(mutationError instanceof Error ? mutationError.message : t("roles.errorUnknown"));
    } finally {
      setDataMutationLoading(false);
    }
  };

  const deleteManualEntry = async () => {
    if (!deleteEntryId.trim()) {
      setDataMutationError(t("service.data.manual.deleteIdRequired"));
      return;
    }

    try {
      setDataMutationLoading(true);
      setDataMutationError(null);
      setDataMutationMessage(null);

      await fetchJson<{ deleted: boolean }>(
        `${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/data/${encodeURIComponent(deleteEntryId.trim())}?dataset=history`,
        {
          method: "DELETE",
          headers: composeAuthHeaders(context),
        },
      );

      setDataMutationMessage(t("service.data.manual.deleteOk"));
      setDeleteEntryId("");
      await loadAll();
    } catch (mutationError) {
      setDataMutationError(mutationError instanceof Error ? mutationError.message : t("roles.errorUnknown"));
    } finally {
      setDataMutationLoading(false);
    }
  };

  const localizedDatasetLabel = (value: DataDataset, fallback: string) => {
    const keyMap: Record<DataDataset, "dataset.roles" | "dataset.leaderboard" | "dataset.history" | "dataset.processes"> = {
      roles: "dataset.roles",
      leaderboard: "dataset.leaderboard",
      history: "dataset.history",
      processes: "dataset.processes",
    };
    return t(keyMap[value]) || fallback;
  };

  const serviceTitle = t(NAV_TITLE_KEYS[navKey]);
  const serviceSubtitle = t(NAV_SUBTITLE_KEYS[navKey]);
  const intervalOptions = [5, 10, 15, 30, 60];
  const currentCycleMs = Math.max(1, refreshIntervalSeconds * 1000);
  const progressPercent = Math.min(100, (elapsedMs / currentCycleMs) * 100);
  const remainingSeconds = Math.max(0, (currentCycleMs - elapsedMs) / 1000).toFixed(1);
  const refreshCardPadding = compact ? "p-2.5" : "p-3";
  const refreshLabelText = compact ? "text-[11px]" : "text-xs";
  const refreshInputPadding = compact ? "px-2 py-1" : "px-2 py-1.5";
  const refreshButtonPadding = compact ? "px-3 py-1.5" : "px-4 py-2";
  const refreshButtonText = compact ? "text-xs" : "text-sm";
  const refreshProgressHeight = compact ? "h-1.5" : "h-2";

  const serviceMeta = catalog.find((item) => item.key === serviceConfig.service);

  return (
    <section className={`m3-card ui-fade-in ${compact ? "p-3 sm:p-4 xl:p-5 space-y-3" : "p-4 sm:p-5 xl:p-6 space-y-4 xl:space-y-5"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={`m3-title ${compact ? "text-base sm:text-lg xl:text-xl" : "text-lg sm:text-xl xl:text-2xl"}`}>{serviceTitle}</h2>
          <p className="text-xs sm:text-sm xl:text-base text-[var(--md-sys-color-on-surface-variant)]">
            {serviceSubtitle}
            {serviceMeta ? ` · ${t("service.domain")}: ${serviceMeta.domain}` : ""}
          </p>
        </div>
        <div className={`w-full max-w-sm rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[color:var(--md-sys-color-surface-container-low)]/85 ${refreshCardPadding}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={refreshLabelText}>
              {t("service.refresh.modeLabel")}
              <select
                value={refreshMode}
                onChange={(event) => setRefreshMode(event.target.value as "manual" | "auto")}
                className={`control-input mt-1 w-full ${refreshInputPadding} ${compact ? "text-xs" : "text-sm"}`}
              >
                <option value="manual">{t("service.refresh.manual")}</option>
                <option value="auto">{t("service.refresh.auto")}</option>
              </select>
            </label>

            <label className={refreshLabelText}>
              {t("service.refresh.intervalLabel")}
              <select
                value={refreshIntervalSeconds}
                onChange={(event) => setRefreshIntervalSeconds(Number(event.target.value))}
                disabled={refreshMode !== "auto"}
                className={`control-input mt-1 w-full ${refreshInputPadding} ${compact ? "text-xs" : "text-sm"} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {intervalOptions.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {t("service.refresh.intervalOption", { seconds })}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {refreshMode === "manual" ? (
            <button
              type="button"
              onClick={() => void loadAll()}
              className={`mt-3 w-full rounded-xl bg-[var(--md-sys-color-primary)] ${refreshButtonPadding} ${refreshButtonText} font-semibold text-[var(--md-sys-color-on-primary)] transition-all duration-200 hover:-translate-y-[1px] hover:brightness-105`}
            >
              {loading ? t("service.button.updating") : t("service.button.update")}
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <div className={`${refreshProgressHeight} w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]`}>
                <div
                  className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-[width] duration-150"
                  style={{ width: `${progressPercent}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progressPercent)}
                />
              </div>
              <p className={`${refreshLabelText} text-[var(--md-sys-color-on-surface-variant)]`}>
                {loading ? t("service.button.updating") : t("service.refresh.nextSync", { seconds: remainingSeconds })}
              </p>
            </div>
          )}
        </div>
      </div>

      {serviceMeta && (
        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-white/70 px-3 py-2 text-xs sm:text-sm">
          <span className="font-semibold">{t("service.meta.service")}:</span> {serviceMeta.title} · <span className="font-semibold">{t("service.domain")}:</span> {serviceMeta.domain} · <span className="font-semibold">{t("service.meta.tabularData")}:</span> {serviceMeta.supportsData ? t("service.meta.yes") : t("service.meta.no")}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <article className="space-y-2">
        <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.metrics.title")}</h3>
        {metricsError ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{metricsError}</p>
        ) : metricsRows.length ? (
          <PaginatedFilterableTable rows={metricsRows} defaultPageSize={10} density={density} />
        ) : (
          <p className="text-sm">{t("service.metrics.none")}</p>
        )}
      </article>

      <article className="space-y-2">
        <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.logs.title")}</h3>
        {logsError ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{logsError}</p>
        ) : logsRows.length ? (
          <PaginatedFilterableTable rows={logsRows} defaultPageSize={20} density={density} />
        ) : (
          <p className="text-sm">{t("service.logs.none")}</p>
        )}
      </article>

      {serviceConfig.datasets && serviceConfig.datasets.length > 0 && (
        <article className="space-y-3">
          <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.data.title")}</h3>

          <div className={`grid gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-white md:grid-cols-2 2xl:grid-cols-4 ${compact ? "p-2" : "p-3"}`}>
            <label className="text-xs">
              {t("service.filter.dataset")}
              <select
                value={dataset}
                onChange={(event) => {
                  setDataset(event.target.value as DataDataset);
                  setPage(1);
                }}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              >
                {serviceConfig.datasets.map((item) => (
                  <option key={item.value} value={item.value}>
                    {localizedDatasetLabel(item.value, item.label)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              {t("service.filter.filter")}
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.sortBy")}
              <input
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
                placeholder={t("service.filter.sortPlaceholder")}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.direction")}
              <select
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              >
                <option value="asc">{t("service.filter.sortAscShort")}</option>
                <option value="desc">{t("service.filter.sortDescShort")}</option>
              </select>
            </label>

            <label className="text-xs">
              {t("service.filter.page")}
              <input
                type="number"
                min={1}
                value={page}
                onChange={(event) => setPage(Number(event.target.value || 1))}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.pageSize")}
              <input
                type="number"
                min={1}
                max={200}
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value || 20))}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.sourceLimit")}
              <input
                type="number"
                min={1}
                max={1000}
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value || 200))}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.userMetric")}
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value as "won" | "score" | "played")}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
                disabled={serviceConfig.service !== "microservice-users" || dataset !== "leaderboard"}
              >
                <option value="won">won</option>
                <option value="score">score</option>
                <option value="played">played</option>
              </select>
            </label>
          </div>

          {isGameHistoryDataset && (
            <div className={`space-y-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[color:var(--md-sys-color-surface-container-low)] ${compact ? "p-3" : "p-4"}`}>
              <h4 className="text-sm font-semibold">{t("service.data.manual.title")}</h4>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs">
                  {t("service.data.manual.categoryId")}
                  {manualCatalogs.categories.length > 0 ? (
                    <select value={manualCategoryId} onChange={(event) => setManualCategoryId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-1.5 text-sm">
                      {manualCatalogs.categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={manualCategoryId} onChange={(event) => setManualCategoryId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-1.5 text-sm" />
                  )}
                </label>
                <label className="text-xs">
                  {t("service.data.manual.language")}
                  {manualCatalogs.languages.length > 0 ? (
                    <select value={manualLanguage} onChange={(event) => setManualLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-1.5 text-sm">
                      {manualCatalogs.languages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={manualLanguage} onChange={(event) => setManualLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-1.5 text-sm" />
                  )}
                </label>
                <label className="text-xs">
                  {t("service.data.manual.difficulty")}
                  <input type="number" min={0} max={100} value={manualDifficulty} onChange={(event) => setManualDifficulty(Number(event.target.value || 0))} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-1.5 text-sm" />
                </label>
              </div>

              <label className="text-xs">
                {t("service.data.manual.contentJson")}
                <textarea value={manualContentJson} onChange={(event) => setManualContentJson(event.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-2 text-xs sm:text-sm" />
              </label>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void insertManualEntry()} disabled={dataMutationLoading} className="rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-primary)] disabled:cursor-not-allowed disabled:opacity-60">
                  {dataMutationLoading ? t("service.button.updating") : t("service.data.manual.insert")}
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <label className="text-xs">
                  {t("service.data.manual.deleteId")}
                  <input value={deleteEntryId} onChange={(event) => setDeleteEntryId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-white px-2 py-1.5 text-sm" placeholder={t("service.data.manual.deletePlaceholder")} />
                </label>
                <button type="button" onClick={() => void deleteManualEntry()} disabled={dataMutationLoading} className="self-end rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {t("service.data.manual.delete")}
                </button>
              </div>

              {dataMutationError && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{dataMutationError}</p>}
              {manualCatalogError && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">{manualCatalogError}</p>}
              {dataMutationMessage && <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">{dataMutationMessage}</p>}
            </div>
          )}

          {dataError ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{dataError}</p>
          ) : dataRows.length ? (
            <PaginatedFilterableTable rows={dataRows} defaultPageSize={10} density={density} />
          ) : (
            <p className="text-sm">{t("service.data.none")}</p>
          )}
        </article>
      )}
    </section>
  );
}
