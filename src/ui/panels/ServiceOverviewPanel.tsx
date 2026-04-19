import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchServiceOperationalSummary, type ServiceOperationalRow } from "../../application/services/operationalSummary";
import type { AiEngineTarget, AiEngineTargetPreset, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
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

type AiEnginePresetListResponse = {
  total: number;
  presets: AiEngineTargetPreset[];
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
  const [aiTarget, setAiTarget] = useState<AiEngineTarget | null>(null);
  const [aiTargetLoading, setAiTargetLoading] = useState(false);
  const [aiTargetSaving, setAiTargetSaving] = useState(false);
  const [aiTargetError, setAiTargetError] = useState<string | null>(null);
  const [presets, setPresets] = useState<AiEngineTargetPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetHost, setPresetHost] = useState("");
  const [presetProtocol, setPresetProtocol] = useState<"http" | "https">("http");
  const [presetApiPort, setPresetApiPort] = useState("7001");
  const [presetStatsPort, setPresetStatsPort] = useState("7000");

  const requestVersionRef = useRef(0);
  const previousByServiceRef = useRef<Record<string, { requestsTotal: number | null; fetchedAt: number }>>({});

  const intervalOptions = [5, 10, 15, 30, 60];
  const authHeaders = useCallback(() => composeAuthHeaders(context), [context]);

  const syncPresetForm = useCallback((preset: AiEngineTargetPreset | null) => {
    setPresetName(preset?.name ?? "");
    setPresetHost(preset?.host ?? "");
    setPresetProtocol(preset?.protocol ?? "http");
    setPresetApiPort(String(preset?.apiPort ?? 7001));
    setPresetStatsPort(String(preset?.statsPort ?? 7000));
  }, []);

  const findPresetMatch = useCallback((entries: AiEngineTargetPreset[], target: AiEngineTarget | null) => {
    if (!target) {
      return null;
    }

    return entries.find(
      (entry) =>
        entry.host === (target.host ?? "") &&
        entry.protocol === (target.protocol ?? "http") &&
        entry.apiPort === target.apiPort &&
        entry.statsPort === target.statsPort,
    ) ?? null;
  }, []);

  const loadPresets = useCallback(async () => {
    setPresetsLoading(true);
    setAiTargetError(null);
    try {
      const payload = await fetchJson<AiEnginePresetListResponse>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets`, {
        headers: authHeaders(),
      });
      setPresets(payload.presets);
      setSelectedPresetId((current) => {
        if (current && payload.presets.some((entry) => entry.id === current)) {
          return current;
        }
        return payload.presets[0]?.id ?? "";
      });
    } catch (loadError) {
      setAiTargetError(loadError instanceof Error ? loadError.message : t("roles.errorUnknown"));
    } finally {
      setPresetsLoading(false);
    }
  }, [authHeaders, t]);

  const loadAiTarget = useCallback(async () => {
    setAiTargetLoading(true);
    setAiTargetError(null);
    try {
      const nextTarget = await fetchJson<AiEngineTarget>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        headers: authHeaders(),
      });
      setAiTarget(nextTarget);
    } catch (loadError) {
      setAiTargetError(loadError instanceof Error ? loadError.message : t("roles.errorUnknown"));
    } finally {
      setAiTargetLoading(false);
    }
  }, [authHeaders, t]);

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
    void loadAiTarget();
    void loadPresets();
  }, [loadAiTarget, loadPresets, loadSummary]);

  useEffect(() => {
    if (isCreatingPreset) {
      return;
    }

    const activePreset = presets.find((entry) => entry.id === selectedPresetId) ?? null;
    if (activePreset) {
      syncPresetForm(activePreset);
      return;
    }

    const matchedPreset = findPresetMatch(presets, aiTarget);
    if (matchedPreset) {
      setSelectedPresetId(matchedPreset.id);
      syncPresetForm(matchedPreset);
      return;
    }

    syncPresetForm(null);
  }, [aiTarget, findPresetMatch, isCreatingPreset, presets, selectedPresetId, syncPresetForm]);

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
  const activePreset = isCreatingPreset ? null : presets.find((entry) => entry.id === selectedPresetId) ?? null;

  const applyAiPreset = useCallback(async () => {
    if (!activePreset) {
      return;
    }

    setAiTargetSaving(true);
    setAiTargetError(null);
    try {
      const nextTarget = await fetchJson<AiEngineTarget>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          host: activePreset.host,
          protocol: activePreset.protocol,
          apiPort: activePreset.apiPort,
          statsPort: activePreset.statsPort,
          label: activePreset.name,
        }),
      });
      setAiTarget(nextTarget);
    } catch (saveError) {
      setAiTargetError(saveError instanceof Error ? saveError.message : t("roles.errorUnknown"));
    } finally {
      setAiTargetSaving(false);
    }
  }, [activePreset, authHeaders, t]);

  const savePreset = useCallback(async () => {
    setAiTargetSaving(true);
    setAiTargetError(null);
    try {
      const payload = {
        name: presetName.trim(),
        host: presetHost.trim(),
        protocol: presetProtocol,
        apiPort: Number(presetApiPort),
        statsPort: Number(presetStatsPort),
      };
      const nextPreset = activePreset && !isCreatingPreset
        ? await fetchJson<AiEngineTargetPreset>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets/${encodeURIComponent(activePreset.id)}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          })
        : await fetchJson<AiEngineTargetPreset>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

      await loadPresets();
      setIsCreatingPreset(false);
      setSelectedPresetId(nextPreset.id);
    } catch (saveError) {
      setAiTargetError(saveError instanceof Error ? saveError.message : t("roles.errorUnknown"));
    } finally {
      setAiTargetSaving(false);
    }
  }, [activePreset, authHeaders, isCreatingPreset, loadPresets, presetApiPort, presetHost, presetName, presetProtocol, presetStatsPort, t]);

  const removePreset = useCallback(async () => {
    if (!activePreset) {
      return;
    }

    setAiTargetSaving(true);
    setAiTargetError(null);
    try {
      await fetchJson<{ deleted: boolean; presetId: string }>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets/${encodeURIComponent(activePreset.id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      await loadPresets();
    } catch (deleteError) {
      setAiTargetError(deleteError instanceof Error ? deleteError.message : t("roles.errorUnknown"));
    } finally {
      setAiTargetSaving(false);
    }
  }, [activePreset, authHeaders, loadPresets, t]);

  const startNewPreset = useCallback(() => {
    setIsCreatingPreset(true);
    setSelectedPresetId("");
    syncPresetForm(null);
  }, [syncPresetForm]);

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

      <div className="ui-surface-raised rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">{t("overview.aiTarget.title")}</h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("overview.aiTarget.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadAiTarget();
              void loadPresets();
            }}
            disabled={aiTargetLoading || aiTargetSaving || presetsLoading}
            className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-50"
          >
            {aiTargetLoading || presetsLoading ? "..." : t("overview.aiTarget.refreshBtn")}
          </button>
        </div>

        {aiTargetError && <p className="ui-feedback ui-feedback--error">{t("overview.aiTarget.error")}: {aiTargetError}</p>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={t("overview.aiTarget.currentHost")} value={Number(aiTarget?.host ? 1 : 0)} tone={aiTarget?.host ? "ok" : "warn"} />
          <KpiCard label={t("overview.aiTarget.apiPort")} value={aiTarget?.apiPort ?? 0} tone="neutral" />
          <KpiCard label={t("overview.aiTarget.statsPort")} value={aiTarget?.statsPort ?? 0} tone="neutral" />
          <KpiCard label={t("overview.aiTarget.optionsCount")} value={presets.length} tone="neutral" />
        </div>

        {aiTarget && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-xs text-[var(--md-sys-color-on-surface)]">
            <p><span className="font-semibold">{t("overview.aiTarget.currentLabel")}:</span> {aiTarget.label ?? "--"}</p>
            <p><span className="font-semibold">{t("overview.aiTarget.currentHostText")}:</span> {aiTarget.host ?? "--"}</p>
            <p><span className="font-semibold">{t("overview.aiTarget.currentApiUrl")}:</span> {aiTarget.apiBaseUrl}</p>
            <p><span className="font-semibold">{t("overview.aiTarget.currentStatsUrl")}:</span> {aiTarget.statsBaseUrl}</p>
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-[minmax(240px,320px)_1fr]">
          <label className="text-xs text-[var(--md-sys-color-on-surface)]">
            {t("overview.aiTarget.selector")}
            <select
              value={selectedPresetId}
              onChange={(event) => {
                setIsCreatingPreset(false);
                setSelectedPresetId(event.target.value);
              }}
              className="control-input mt-1 w-full px-2 py-2 text-sm"
            >
              {presets.length === 0 && <option value="">--</option>}
              {presets.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs text-[var(--md-sys-color-on-surface)]">
              {t("overview.aiTarget.optionName")}
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2 text-sm" />
            </label>
            <label className="text-xs text-[var(--md-sys-color-on-surface)]">
              {t("overview.aiTarget.optionHost")}
              <input value={presetHost} onChange={(event) => setPresetHost(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2 text-sm" />
            </label>
            <label className="text-xs text-[var(--md-sys-color-on-surface)]">
              {t("overview.aiTarget.optionProtocol")}
              <select value={presetProtocol} onChange={(event) => setPresetProtocol(event.target.value as "http" | "https")} className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2 text-sm">
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </label>
            <label className="text-xs text-[var(--md-sys-color-on-surface)]">
              {t("overview.aiTarget.optionApiPort")}
              <input value={presetApiPort} onChange={(event) => setPresetApiPort(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2 text-sm" />
            </label>
            <label className="text-xs text-[var(--md-sys-color-on-surface)]">
              {t("overview.aiTarget.optionStatsPort")}
              <input value={presetStatsPort} onChange={(event) => setPresetStatsPort(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-2 text-sm" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={applyAiPreset}
            disabled={aiTargetSaving || !activePreset}
            className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-primary-container)] px-4 py-2 text-xs font-bold text-[var(--md-sys-color-on-primary-container)] transition hover:opacity-90 disabled:opacity-50"
          >
            {aiTargetSaving ? t("service.button.updating") : t("overview.aiTarget.applyBtn")}
          </button>
          <button
            type="button"
            onClick={startNewPreset}
            disabled={aiTargetSaving}
            className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-50"
          >
            {t("overview.aiTarget.newBtn")}
          </button>
          <button
            type="button"
            onClick={() => void savePreset()}
            disabled={presetName.trim().length === 0 || presetHost.trim().length === 0}
            className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-50"
          >
            {activePreset ? t("overview.aiTarget.saveBtn") : t("overview.aiTarget.addBtn")}
          </button>
          <button
            type="button"
            onClick={() => void removePreset()}
            disabled={!activePreset}
            className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-50"
          >
            {t("overview.aiTarget.deleteBtn")}
          </button>
        </div>
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
