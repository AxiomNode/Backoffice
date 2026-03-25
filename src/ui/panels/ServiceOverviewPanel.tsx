import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ServiceCatalogItem, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";

type ServiceOverviewPanelProps = {
  context: SessionContext;
  density: UiDensity;
};

type ServiceHealthRow = {
  key: string;
  title: string;
  domain: string;
  supportsData: boolean;
  online: boolean;
  accessGuaranteed: boolean;
  connectionError: boolean;
  requestsTotal: number | null;
  requestsPerSecond: number | null;
  latencyMs: number | null;
  lastUpdatedAt: string | null;
  errorMessage: string | null;
};

type TimedResult<T> =
  | { ok: true; data: T; latencyMs: number }
  | { ok: false; error: string; latencyMs: number };

function asTimedResult<T>(promiseFactory: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now();
  return promiseFactory()
    .then((data) => ({ ok: true as const, data, latencyMs: Math.round(performance.now() - start) }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
      latencyMs: Math.round(performance.now() - start),
    }));
}

function toRequestsTotal(metrics: unknown): number | null {
  if (!metrics || typeof metrics !== "object") {
    return null;
  }

  const payload = metrics as Record<string, unknown>;
  const traffic = payload.traffic;

  if (traffic && typeof traffic === "object") {
    const value = (traffic as Record<string, unknown>).requestsReceivedTotal;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  const topLevel = payload.requestsReceivedTotal;
  if (typeof topLevel === "number" && Number.isFinite(topLevel)) {
    return topLevel;
  }

  return null;
}

function isAuthorizationError(message: string): boolean {
  return /HTTP\s+(401|403)/i.test(message);
}

function isConnectionError(message: string): boolean {
  return /Failed to fetch|NetworkError|HTTP\s+(5\d\d|429|408|0)/i.test(message);
}

export function ServiceOverviewPanel({ context, density }: ServiceOverviewPanelProps) {
  const { t } = useI18n();
  const compact = density === "dense";

  const [rows, setRows] = useState<ServiceHealthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshMode, setRefreshMode] = useState<"manual" | "auto">("auto");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(10);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const requestVersionRef = useRef(0);
  const previousByServiceRef = useRef<Record<string, { requestsTotal: number | null; fetchedAt: number }>>({});

  const intervalOptions = [5, 10, 15, 30, 60];

  const loadSummary = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    setError(null);

    try {
      const catalogPayload = await fetchJson<{ services: ServiceCatalogItem[] }>(`${EDGE_API_BASE}/v1/backoffice/services`, {
        headers: composeAuthHeaders(context),
      });

      const services = catalogPayload.services ?? [];
      const now = Date.now();

      const metricsResults = await Promise.all(
        services.map(async (service) => {
          const result = await asTimedResult(() =>
            fetchJson<{ metrics: unknown }>(`${EDGE_API_BASE}/v1/backoffice/services/${service.key}/metrics`, {
              headers: composeAuthHeaders(context),
            }),
          );
          return { service, result };
        }),
      );

      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      const nextRows: ServiceHealthRow[] = metricsResults.map(({ service, result }) => {
        if (!result.ok) {
          return {
            key: service.key,
            title: service.title,
            domain: service.domain,
            supportsData: service.supportsData,
            online: false,
            accessGuaranteed: !isAuthorizationError(result.error),
            connectionError: isConnectionError(result.error),
            requestsTotal: null,
            requestsPerSecond: null,
            latencyMs: result.latencyMs,
            lastUpdatedAt: new Date(now).toISOString(),
            errorMessage: result.error,
          };
        }

        const requestsTotal = toRequestsTotal(result.data.metrics);
        const previous = previousByServiceRef.current[service.key];
        let requestsPerSecond: number | null = null;

        if (
          previous &&
          previous.requestsTotal !== null &&
          requestsTotal !== null &&
          now > previous.fetchedAt &&
          requestsTotal >= previous.requestsTotal
        ) {
          const deltaRequests = requestsTotal - previous.requestsTotal;
          const deltaSeconds = (now - previous.fetchedAt) / 1000;
          if (deltaSeconds > 0) {
            requestsPerSecond = Number((deltaRequests / deltaSeconds).toFixed(2));
          }
        }

        previousByServiceRef.current[service.key] = {
          requestsTotal,
          fetchedAt: now,
        };

        return {
          key: service.key,
          title: service.title,
          domain: service.domain,
          supportsData: service.supportsData,
          online: true,
          accessGuaranteed: true,
          connectionError: false,
          requestsTotal,
          requestsPerSecond,
          latencyMs: result.latencyMs,
          lastUpdatedAt: new Date(now).toISOString(),
          errorMessage: null,
        };
      });

      setRows(nextRows);
    } catch (loadError) {
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : t("roles.errorUnknown"));
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [context, t]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setElapsedMs(0);
  }, [refreshMode, refreshIntervalSeconds]);

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

        const next = current + stepMs;
        const threshold = refreshIntervalSeconds * 1000;
        if (next >= threshold) {
          void loadSummary();
          return 0;
        }
        return next;
      });
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [loadSummary, loading, refreshIntervalSeconds, refreshMode]);

  const currentCycleMs = Math.max(1, refreshIntervalSeconds * 1000);
  const progressPercent = Math.min(100, (elapsedMs / currentCycleMs) * 100);
  const remainingSeconds = Math.max(0, (currentCycleMs - elapsedMs) / 1000).toFixed(1);

  const totals = useMemo(() => {
    const onlineCount = rows.filter((row) => row.online).length;
    const connectionErrors = rows.filter((row) => row.connectionError).length;
    const accessIssues = rows.filter((row) => !row.accessGuaranteed).length;
    return {
      total: rows.length,
      onlineCount,
      connectionErrors,
      accessIssues,
    };
  }, [rows]);

  return (
    <section className={`m3-card ui-fade-in ${compact ? "p-3 sm:p-4 xl:p-5 space-y-3" : "p-4 sm:p-5 xl:p-6 space-y-4 xl:space-y-5"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={`m3-title ${compact ? "text-base sm:text-lg xl:text-xl" : "text-lg sm:text-xl xl:text-2xl"}`}>{t("overview.title")}</h2>
          <p className="text-xs sm:text-sm xl:text-base text-[var(--md-sys-color-on-surface-variant)]">{t("overview.subtitle")}</p>
        </div>

        <div className={`w-full max-w-sm rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[color:var(--md-sys-color-surface-container-low)]/85 ${compact ? "p-2.5" : "p-3"}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={compact ? "text-[11px]" : "text-xs"}>
              {t("service.refresh.modeLabel")}
              <select
                value={refreshMode}
                onChange={(event) => setRefreshMode(event.target.value as "manual" | "auto")}
                className={`control-input mt-1 w-full ${compact ? "px-2 py-1 text-xs" : "px-2 py-1.5 text-sm"}`}
              >
                <option value="manual">{t("service.refresh.manual")}</option>
                <option value="auto">{t("service.refresh.auto")}</option>
              </select>
            </label>

            <label className={compact ? "text-[11px]" : "text-xs"}>
              {t("service.refresh.intervalLabel")}
              <select
                value={refreshIntervalSeconds}
                onChange={(event) => setRefreshIntervalSeconds(Number(event.target.value))}
                disabled={refreshMode !== "auto"}
                className={`control-input mt-1 w-full ${compact ? "px-2 py-1 text-xs" : "px-2 py-1.5 text-sm"} disabled:cursor-not-allowed disabled:opacity-60`}
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
              onClick={() => void loadSummary()}
              className={`mt-3 w-full rounded-xl bg-[var(--md-sys-color-primary)] ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} font-semibold text-[var(--md-sys-color-on-primary)] transition-all duration-200 hover:-translate-y-[1px] hover:brightness-105`}
            >
              {loading ? t("service.button.updating") : t("service.button.update")}
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <div className={`${compact ? "h-1.5" : "h-2"} w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]`}>
                <div
                  className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-[width] duration-150"
                  style={{ width: `${progressPercent}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progressPercent)}
                />
              </div>
              <p className={`${compact ? "text-[11px]" : "text-xs"} text-[var(--md-sys-color-on-surface-variant)]`}>
                {loading ? t("service.button.updating") : t("service.refresh.nextSync", { seconds: remainingSeconds })}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("overview.summary.total")}</p>
          <p className="text-xl font-semibold">{totals.total}</p>
        </div>
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-700">{t("overview.summary.online")}</p>
          <p className="text-xl font-semibold text-emerald-800">{totals.onlineCount}</p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-700">{t("overview.summary.accessIssues")}</p>
          <p className="text-xl font-semibold text-amber-800">{totals.accessIssues}</p>
        </div>
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2">
          <p className="text-xs text-red-700">{t("overview.summary.connectionErrors")}</p>
          <p className="text-xl font-semibold text-red-800">{totals.connectionErrors}</p>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{t("overview.error.load")}: {error}</p>}

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.key} className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold sm:text-base">{row.title}</h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{row.domain}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.online ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                {row.online ? t("overview.status.online") : t("overview.status.offline")}
              </span>
            </div>

            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <p>
                <span className="font-semibold">{t("overview.status.accessLabel")}:</span>{" "}
                {row.accessGuaranteed ? t("overview.status.accessOk") : t("overview.status.accessDenied")}
              </p>
              <p>
                <span className="font-semibold">{t("overview.status.connectionLabel")}:</span>{" "}
                {row.connectionError ? t("overview.status.connectionError") : t("overview.status.connectionOk")}
              </p>
              <p>
                <span className="font-semibold">{t("overview.metric.realtime")}:</span>{" "}
                {row.requestsPerSecond !== null ? `${row.requestsPerSecond} req/s` : t("overview.metric.na")}
              </p>
              <p>
                <span className="font-semibold">{t("overview.metric.totalRequests")}:</span>{" "}
                {row.requestsTotal !== null ? row.requestsTotal : t("overview.metric.na")}
              </p>
              <p>
                <span className="font-semibold">{t("overview.metric.latency")}:</span>{" "}
                {row.latencyMs !== null ? `${row.latencyMs} ms` : t("overview.metric.na")}
              </p>
              <p>
                <span className="font-semibold">{t("overview.metric.lastUpdate")}:</span>{" "}
                {row.lastUpdatedAt ? new Date(row.lastUpdatedAt).toLocaleTimeString() : t("overview.metric.na")}
              </p>
            </div>

            {row.errorMessage && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{row.errorMessage}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
