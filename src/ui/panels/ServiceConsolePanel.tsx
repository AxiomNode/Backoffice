import { useCallback, useEffect, useState } from "react";

import { navConfigByKey } from "../../domain/constants/navigation";
import type { DataDataset, NavKey, ServiceCatalogItem, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";
import type { LabelKey } from "../../i18n/labels";
import { rowsFromUnknown } from "../utils/table";
import { PaginatedFilterableTable } from "../components/PaginatedFilterableTable";

const NAV_TITLE_KEYS: Record<NavKey, LabelKey> = {
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

export function ServiceConsolePanel({ navKey, context, density }: ServiceConsolePanelProps) {
  const { t } = useI18n();
  const serviceConfig = navConfigByKey(navKey);
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
  const compact = density === "dense";

  useEffect(() => {
    if (serviceConfig?.defaultDataset) {
      setDataset(serviceConfig.defaultDataset);
    }
  }, [serviceConfig?.defaultDataset]);

  useEffect(() => {
    setElapsedMs(0);
  }, [refreshMode, refreshIntervalSeconds]);

  const loadAll = useCallback(async () => {
    if (!serviceConfig) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [catalogPayload, metricsPayload, logsPayload] = await Promise.all([
        fetchJson<{ services: ServiceCatalogItem[] }>(`${EDGE_API_BASE}/v1/backoffice/services`, {
          headers: composeAuthHeaders(context),
        }),
        fetchJson<{ metrics: unknown }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/metrics`, {
          headers: composeAuthHeaders(context),
        }),
        fetchJson<{ logs: unknown }>(`${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/logs?limit=${limit}`, {
          headers: composeAuthHeaders(context),
        }),
      ]);

      setCatalog(catalogPayload.services ?? []);
      setMetricsRows(rowsFromUnknown(metricsPayload.metrics));
      setLogsRows(rowsFromUnknown(logsPayload.logs));

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

        const dataPayload = await fetchJson<{ rows: Array<Record<string, unknown>> }>(
          `${EDGE_API_BASE}/v1/backoffice/services/${serviceConfig.service}/data?${query.toString()}`,
          {
            headers: composeAuthHeaders(context),
          },
        );
        setDataRows(dataPayload.rows ?? []);
      } else {
        setDataRows([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("roles.errorUnknown"));
    } finally {
      setLoading(false);
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
        {metricsRows.length ? <PaginatedFilterableTable rows={metricsRows} defaultPageSize={10} density={density} /> : <p className="text-sm">{t("service.metrics.none")}</p>}
      </article>

      <article className="space-y-2">
        <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.logs.title")}</h3>
        {logsRows.length ? <PaginatedFilterableTable rows={logsRows} defaultPageSize={20} density={density} /> : <p className="text-sm">{t("service.logs.none")}</p>}
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

          {dataRows.length ? <PaginatedFilterableTable rows={dataRows} defaultPageSize={10} density={density} /> : <p className="text-sm">{t("service.data.none")}</p>}
        </article>
      )}
    </section>
  );
}
