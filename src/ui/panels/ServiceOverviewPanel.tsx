import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchServiceOperationalSummary, type ServiceOperationalRow } from "../../application/services/operationalSummary";
import type { SessionContext, UiDensity } from "../../domain/types/backoffice";
import { useI18n } from "../../i18n/context";

/** @module ServiceOverviewPanel - Dashboard showing real-time operational status of all services. */

type ServiceOverviewPanelProps = {
  context: SessionContext;
  density: UiDensity;
};

type KpiCardProps = {
  label: string;
  value: number;
  tone?: "neutral" | "ok" | "warn" | "error";
};

function KpiCard({ label, value, tone = "neutral" }: KpiCardProps) {
  const toneClass =
    tone === "ok"
      ? "ui-status-chip--ok"
      : tone === "warn"
        ? "ui-status-chip--warn"
        : tone === "error"
          ? "ui-status-chip--error"
          : "ui-status-chip--neutral";

  return (
    <div className="ui-surface-soft rounded-xl px-3 py-2">
      <p className={`ui-status-chip inline-flex ${toneClass}`}>{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--md-sys-color-on-surface)]">{value}</p>
    </div>
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Dashboard panel displaying service health KPIs and an auto-refreshing status table. */
export function ServiceOverviewPanel({ context, density }: ServiceOverviewPanelProps) {
  const { t } = useI18n();
  const compact = density === "dense";

  const [rows, setRows] = useState<ServiceOperationalRow[]>([]);
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
      const summary = await fetchServiceOperationalSummary(context, previousByServiceRef.current);

      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      setRows(summary.rows);
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

  const totals = useMemo(() => ({
    total: rows.length,
    onlineCount: rows.filter((row) => row.online).length,
    connectionErrors: rows.filter((row) => row.connectionError).length,
    accessIssues: rows.filter((row) => !row.accessGuaranteed).length,
  }), [rows]);

  const statusClass = (online: boolean) => (online ? "ui-status-chip ui-status-chip--ok" : "ui-status-chip ui-status-chip--error");

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
        <KpiCard label={t("overview.summary.total")} value={totals.total} tone="neutral" />
        <KpiCard label={t("overview.summary.online")} value={totals.onlineCount} tone="ok" />
        <KpiCard label={t("overview.summary.accessIssues")} value={totals.accessIssues} tone="warn" />
        <KpiCard label={t("overview.summary.connectionErrors")} value={totals.connectionErrors} tone="error" />
      </div>

      {error && <p className="ui-feedback ui-feedback--error">{t("overview.error.load")}: {error}</p>}

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.key} className="ui-surface-raised rounded-2xl p-4 text-[var(--md-sys-color-on-surface)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">{row.title}</h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{row.domain}</p>
              </div>
              <span className={statusClass(row.online)}>
                {row.online ? t("overview.status.online") : t("overview.status.offline")}
              </span>
            </div>

            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 text-[var(--md-sys-color-on-surface)]">
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

            {(row.generationRequestedTotal !== null || row.generationCreatedTotal !== null) && (
              <div className="mt-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[color:var(--md-sys-color-surface-container-low)]/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                  {t("overview.metric.conversion")}
                </p>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 text-[var(--md-sys-color-on-surface)]">
                  <p>
                    <span className="font-semibold">{t("overview.metric.requested")}:</span>{" "}
                    {row.generationRequestedTotal ?? t("overview.metric.na")}
                  </p>
                  <p>
                    <span className="font-semibold">{t("overview.metric.created")}:</span>{" "}
                    {row.generationCreatedTotal ?? t("overview.metric.na")}
                  </p>
                </div>

                {row.generationConversionRatio !== null && (
                  <div className="mt-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]">
                      <div
                        className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-[width] duration-200"
                        style={{ width: `${Math.min(100, Math.max(0, row.generationConversionRatio * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {formatPercent(row.generationConversionRatio)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {row.errorMessage && <p className="ui-feedback ui-feedback--error mt-3 p-2 text-xs">{row.errorMessage}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
