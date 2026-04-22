import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchServiceOperationalSummary, type ServiceOperationalRow } from "../../application/services/operationalSummary";
import type { AiEngineTarget, AiEngineTargetPreset, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";
import { AutoRefreshCountdown } from "../components/AutoRefreshCountdown";
import { useMaxWidth } from "../hooks/useMaxWidth";
import { useAutoRefreshScheduler } from "../hooks/useAutoRefreshScheduler";

/** @module ServiceOverviewPanel - Dashboard showing real-time operational status of all services. */

type ServiceOverviewPanelProps = {
  context: SessionContext;
  density: UiDensity;
};

type KpiCardProps = {
  label: string;
  value: string | number;
  tone?: "neutral" | "ok" | "warn" | "error";
  compact?: boolean;
};

type AiEnginePresetListResponse = {
  total: number;
  presets: AiEngineTargetPreset[];
};

type AiEngineProbeEndpointStatus = {
  ok: boolean;
  status: number | null;
  url: string;
  latencyMs: number | null;
  message: string | null;
};

type AiEngineProbeResult = {
  host: string;
  protocol: "http" | "https";
  port: number;
  reachable: boolean;
  llama: AiEngineProbeEndpointStatus;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readProtocol(value: unknown): "http" | "https" | null {
  return value === "http" || value === "https" ? value : null;
}

function normalizeAiTargetResponse(payload: unknown): AiEngineTarget {
  const record = asRecord(payload) ?? {};
  const apiBaseUrl = readNullableString(record.apiBaseUrl);
  const statsBaseUrl = readNullableString(record.statsBaseUrl);

  return {
    source: record.source === "env" ? "env" : "override",
    label: readNullableString(record.label),
    host: readNullableString(record.host),
    protocol: readProtocol(record.protocol),
    port: readNullableNumber(record.port) ?? readNullableNumber(record.apiPort),
    llamaBaseUrl: readNullableString(record.llamaBaseUrl) ?? (apiBaseUrl ? `${apiBaseUrl}/v1/completions` : null),
    envLlamaBaseUrl: readNullableString(record.envLlamaBaseUrl) ?? statsBaseUrl,
    updatedAt: readNullableString(record.updatedAt),
  };
}

function normalizeProbeEndpointStatus(payload: unknown, fallbackUrl: string): AiEngineProbeEndpointStatus {
  const record = asRecord(payload) ?? {};

  return {
    ok: record.ok === true,
    status: readNullableNumber(record.status),
    url: readNullableString(record.url) ?? fallbackUrl,
    latencyMs: readNullableNumber(record.latencyMs),
    message: readNullableString(record.message),
  };
}

function normalizeAiProbeResponse(payload: unknown): AiEngineProbeResult {
  const record = asRecord(payload) ?? {};
  const protocol = readProtocol(record.protocol) ?? "http";
  const host = readNullableString(record.host) ?? "";
  const port = readNullableNumber(record.port) ?? readNullableNumber(record.apiPort) ?? 7002;
  const fallbackUrl = `${protocol}://${host}:${port}/v1/models`;

  return {
    host,
    protocol,
    port,
    reachable: record.reachable === true,
    llama: normalizeProbeEndpointStatus(record.llama ?? record.api, fallbackUrl),
  };
}

function KpiCard({ label, value, tone = "neutral", compact = false }: KpiCardProps) {
  return (
    <article className={`ui-metric-tile ui-metric-tile--${tone} rounded-[1.35rem] ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
      <p className="ui-metric-label">{label}</p>
      <p className={`ui-metric-value mt-3 ${compact ? "text-[1.35rem]" : "text-[1.7rem]"}`}>{value}</p>
    </article>
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Dashboard panel displaying service health KPIs and an auto-refreshing status table. */
export function ServiceOverviewPanel({ context, density }: ServiceOverviewPanelProps) {
  const { t } = useI18n();
  const compact = density === "dense";
  const compactViewport = useMaxWidth(420);
  const narrowViewport = useMaxWidth(380);
  const compactPanel = compact || compactViewport;
  const [aiTargetExpanded, setAiTargetExpanded] = useState(false);

  const [rows, setRows] = useState<ServiceOperationalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshMode, setRefreshMode] = useState<"manual" | "auto">("auto");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [refreshCycleVersion, setRefreshCycleVersion] = useState(0);
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
  const [presetPort, setPresetPort] = useState("7002");
  const [aiProbeLoading, setAiProbeLoading] = useState(false);
  const [aiProbeResult, setAiProbeResult] = useState<AiEngineProbeResult | null>(null);

  const requestVersionRef = useRef(0);
  const previousByServiceRef = useRef<Record<string, { requestsTotal: number | null; fetchedAt: number }>>({});

  const intervalOptions = [5, 10, 15, 30, 60];
  const authHeaders = useCallback(() => composeAuthHeaders(context), [context]);

  const syncPresetForm = useCallback((preset: AiEngineTargetPreset | null) => {
    setPresetName(preset?.name ?? "");
    setPresetHost(preset?.host ?? "");
    setPresetProtocol(preset?.protocol ?? "http");
    setPresetPort(String(preset?.port ?? 7002));
  }, []);

  const findPresetMatch = useCallback((entries: AiEngineTargetPreset[], target: AiEngineTarget | null) => {
    if (!target) {
      return null;
    }

    const directMatch = entries.find(
      (entry) =>
        entry.host === (target.host ?? "") &&
        entry.protocol === (target.protocol ?? "http") &&
        entry.port === target.port,
    );

    if (directMatch) {
      return directMatch;
    }

    const protocolPortMatches = entries.filter(
      (entry) => entry.protocol === (target.protocol ?? "http") && entry.port === target.port,
    );

    return protocolPortMatches.length === 1 ? protocolPortMatches[0] : null;
  }, []);

  const parsePort = useCallback((value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
  }, []);

  const buildDraftTarget = useCallback(() => ({
    host: presetHost.trim(),
    protocol: presetProtocol,
    port: parsePort(presetPort, 7002),
  }), [parsePort, presetHost, presetPort, presetProtocol]);

  const describeProbeStatus = useCallback((status: AiEngineProbeEndpointStatus) => {
    if (status.ok) {
      return `${status.url} OK${status.latencyMs !== null ? ` · ${status.latencyMs}ms` : ""}`;
    }

    return `${status.url} ${status.message ?? "sin respuesta"}`;
  }, []);

  const loadPresets = useCallback(async () => {
    setPresetsLoading(true);
    setAiTargetError(null);
    try {
      const payload = await fetchJson<AiEnginePresetListResponse>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/presets`, {
        headers: authHeaders(),
      });
      setPresets(payload.presets);
      setAiTargetError(null);
      setSelectedPresetId((current) => {
        if (current && payload.presets.some((entry) => entry.id === current)) {
          return current;
        }
        return "";
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
      const payload = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        headers: authHeaders(),
      });
      setAiTarget(normalizeAiTargetResponse(payload));
      setAiTargetError(null);
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
        setRefreshCycleVersion((current) => current + 1);
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

    const matchedPreset = findPresetMatch(presets, aiTarget);
    if (matchedPreset && !selectedPresetId) {
      setSelectedPresetId(matchedPreset.id);
      syncPresetForm(matchedPreset);
      return;
    }

    const activePreset = presets.find((entry) => entry.id === selectedPresetId) ?? null;
    if (activePreset) {
      syncPresetForm(activePreset);
      return;
    }

    if (!selectedPresetId && presets.length === 1) {
      setSelectedPresetId(presets[0]!.id);
      syncPresetForm(presets[0]!);
      return;
    }

    if (matchedPreset) {
      setSelectedPresetId(matchedPreset.id);
      syncPresetForm(matchedPreset);
      return;
    }

    syncPresetForm(null);
  }, [aiTarget, findPresetMatch, isCreatingPreset, presets, selectedPresetId, syncPresetForm]);

  useEffect(() => {
    setAiProbeResult(null);
  }, [isCreatingPreset, presetHost, presetName, presetPort, presetProtocol, selectedPresetId]);

  useEffect(() => {
    setAiTargetError(null);
  }, [isCreatingPreset, presetHost, presetName, presetPort, presetProtocol, selectedPresetId]);

  useAutoRefreshScheduler(
    () => loadSummary(),
    refreshIntervalSeconds * 1000,
    refreshMode === "auto",
    loading,
  );

  const totals = useMemo(() => ({
    total: rows.length,
    onlineCount: rows.filter((row) => row.online).length,
    connectionErrors: rows.filter((row) => row.connectionError).length,
    accessIssues: rows.filter((row) => !row.accessGuaranteed).length,
  }), [rows]);

  const statusClass = (online: boolean) => (online ? "ui-status-chip ui-status-chip--ok" : "ui-status-chip ui-status-chip--error");
  const activePreset = isCreatingPreset ? null : presets.find((entry) => entry.id === selectedPresetId) ?? null;

  const probeAiTarget = useCallback(async (targetOverride?: { host: string; protocol: "http" | "https"; port: number }) => {
    const payload = targetOverride ?? buildDraftTarget();

    if (!payload.host) {
      throw new Error(t("overview.aiTarget.missingHost"));
    }

    setAiProbeLoading(true);
    setAiTargetError(null);
    try {
      const probePayload = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/probe`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const probe = normalizeAiProbeResponse(probePayload);
      setAiProbeResult(probe);
      setAiTargetError(null);
      return probe;
    } catch (probeError) {
      const message = probeError instanceof Error ? probeError.message : t("roles.errorUnknown");
      setAiTargetError(message);
      throw probeError;
    } finally {
      setAiProbeLoading(false);
    }
  }, [authHeaders, buildDraftTarget, t]);

  const applyAiPreset = useCallback(async () => {
    if (!activePreset) {
      return;
    }

    setAiTargetSaving(true);
    setAiTargetError(null);
    try {
      const probe = await probeAiTarget({
        host: activePreset.host,
        protocol: activePreset.protocol,
        port: activePreset.port,
      });

      if (!probe.reachable) {
        throw new Error(t("overview.aiTarget.probeApplyBlocked"));
      }

      const payload = await fetchJson<unknown>(`${EDGE_API_BASE}/v1/backoffice/ai-engine/target`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          host: activePreset.host,
          protocol: activePreset.protocol,
          port: activePreset.port,
          label: activePreset.name,
        }),
      });
      setAiTarget(normalizeAiTargetResponse(payload));
      setAiTargetError(null);
    } catch (saveError) {
      setAiTargetError(saveError instanceof Error ? saveError.message : t("roles.errorUnknown"));
    } finally {
      setAiTargetSaving(false);
    }
  }, [activePreset, authHeaders, probeAiTarget, t]);

  const savePreset = useCallback(async () => {
    setAiTargetSaving(true);
    setAiTargetError(null);
    try {
      const payload = {
        name: presetName.trim(),
        host: presetHost.trim(),
        protocol: presetProtocol,
        port: parsePort(presetPort, 7002),
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
      setAiTargetError(null);
    } catch (saveError) {
      setAiTargetError(saveError instanceof Error ? saveError.message : t("roles.errorUnknown"));
    } finally {
      setAiTargetSaving(false);
    }
  }, [activePreset, authHeaders, isCreatingPreset, loadPresets, parsePort, presetHost, presetName, presetPort, presetProtocol, t]);

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
      setAiTargetError(null);
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
    <section className={`m3-card ui-panel-shell ui-fade-in ${narrowViewport ? "p-3 space-y-3" : compactPanel ? "p-3.5 space-y-3.5" : compact ? "p-3 sm:p-4 xl:p-5 space-y-4" : "p-4 sm:p-5 xl:p-6 space-y-5"}`}>
      <div className={`ui-summary-band rounded-[1.6rem] ${narrowViewport ? "p-3" : compactPanel ? "p-3.5" : "p-4 xl:p-5"}`}>
        <div className={`flex flex-wrap items-start justify-between ${compactViewport ? "gap-2.5" : "gap-3"}`}>
        <div>
          <h2 className={`m3-title ${narrowViewport ? "text-base" : compactPanel ? "text-[17px] sm:text-lg" : compact ? "text-base sm:text-lg xl:text-xl" : "text-lg sm:text-xl xl:text-2xl"}`}>{t("overview.title")}</h2>
          <p className={`${narrowViewport ? "text-[11px] leading-4" : compactViewport ? "text-xs leading-5" : "text-xs sm:text-sm xl:text-base"} text-[var(--md-sys-color-on-surface-variant)]`}>{t("overview.subtitle")}</p>
        </div>

        <div className={`ui-panel-block w-full rounded-[1.35rem] ${compactViewport ? "max-w-none" : "max-w-sm"} ${narrowViewport ? "p-2.5" : compactPanel ? "p-3" : "p-3.5"}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={compactPanel ? "text-[11px]" : "text-xs"}>
              {t("service.refresh.modeLabel")}
              <select
                value={refreshMode}
                onChange={(event) => setRefreshMode(event.target.value as "manual" | "auto")}
                className={`control-input mt-1 w-full ${compactPanel ? "px-2 py-1 text-xs" : "px-2 py-1.5 text-sm"}`}
              >
                <option value="manual">{t("service.refresh.manual")}</option>
                <option value="auto">{t("service.refresh.auto")}</option>
              </select>
            </label>

            <label className={compactPanel ? "text-[11px]" : "text-xs"}>
              {t("service.refresh.intervalLabel")}
              <select
                value={refreshIntervalSeconds}
                onChange={(event) => setRefreshIntervalSeconds(Number(event.target.value))}
                disabled={refreshMode !== "auto"}
                className={`control-input mt-1 w-full ${compactPanel ? "px-2 py-1 text-xs" : "px-2 py-1.5 text-sm"} disabled:cursor-not-allowed disabled:opacity-60`}
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
              className={`mt-3 w-full rounded-xl bg-[var(--md-sys-color-primary)] ${compactPanel ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} font-semibold text-[var(--md-sys-color-on-primary)] transition-all duration-200 hover:-translate-y-[1px] hover:brightness-105`}
            >
              {loading ? t("service.button.updating") : t("service.button.update")}
            </button>
          ) : (
            <AutoRefreshCountdown
              active={refreshMode === "auto"}
              loading={loading}
              intervalSeconds={refreshIntervalSeconds}
              cycleVersion={refreshCycleVersion}
              compact={compactPanel}
              updatingLabel={t("service.button.updating")}
              getNextSyncLabel={(seconds) => t("service.refresh.nextSync", { seconds })}
            />
          )}
        </div>
      </div>
      </div>

      <div className={`grid gap-2 ${compactViewport ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
        <KpiCard label={t("overview.summary.total")} value={totals.total} tone="neutral" compact={compactPanel} />
        <KpiCard label={t("overview.summary.online")} value={totals.onlineCount} tone="ok" compact={compactPanel} />
        <KpiCard label={t("overview.summary.accessIssues")} value={totals.accessIssues} tone="warn" compact={compactPanel} />
        <KpiCard label={t("overview.summary.connectionErrors")} value={totals.connectionErrors} tone="error" compact={compactPanel} />
      </div>

      <div className="ui-panel-block rounded-[1.6rem] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">{t("overview.aiTarget.title")}</h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("overview.aiTarget.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAiTargetExpanded((current) => !current)}
              className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
              aria-expanded={aiTargetExpanded}
            >
              {aiTargetExpanded ? t("service.section.hide") : t("service.section.show")}
            </button>
            <button
              type="button"
              onClick={() => {
                void loadAiTarget();
                void loadPresets();
              }}
              disabled={aiTargetLoading || aiTargetSaving || presetsLoading}
              className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
            >
              {aiTargetLoading || presetsLoading ? "..." : t("overview.aiTarget.refreshBtn")}
            </button>
          </div>
        </div>

        {!aiTargetExpanded ? (
          <div className="ui-summary-band rounded-[1.25rem] p-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {t("overview.aiTarget.dayOpsTitle")}: {aiTarget?.label ?? aiTarget?.host ?? "--"}
          </div>
        ) : (
        <>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="ui-summary-band rounded-[1.25rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
            <p className="font-semibold">{t("overview.aiTarget.dayOpsTitle")}</p>
            <p className="mt-1 text-[var(--md-sys-color-on-surface-variant)]">{t("overview.aiTarget.dayOpsBody")}</p>
          </div>
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-semibold">{t("overview.aiTarget.criticalTitle")}</p>
            <p className="mt-1">{t("overview.aiTarget.criticalBody")}</p>
          </div>
        </div>

        {aiTargetError && <p className="ui-feedback ui-feedback--error">{t("overview.aiTarget.error")}: {aiTargetError}</p>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={t("overview.aiTarget.currentHost")} value={aiTarget?.host ?? "--"} tone={aiTarget?.host ? "ok" : "warn"} />
          <KpiCard label={t("overview.aiTarget.apiPort")} value={aiTarget?.port ?? "--"} tone="neutral" />
          <KpiCard label={t("overview.aiTarget.currentLabel")} value={aiTarget?.label ?? "--"} tone="neutral" />
          <KpiCard label={t("overview.aiTarget.optionsCount")} value={presets.length} tone="neutral" />
        </div>

        {aiTarget && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-xs text-[var(--md-sys-color-on-surface)]">
            <p><span className="font-semibold">{t("overview.aiTarget.currentLabel")}:</span> {aiTarget.label ?? "--"}</p>
            <p><span className="font-semibold">{t("overview.aiTarget.currentHostText")}:</span> {aiTarget.host ?? "--"}</p>
            <p><span className="font-semibold">{t("overview.aiTarget.currentApiUrl")}:</span> {aiTarget.llamaBaseUrl ?? "--"}</p>
            <p><span className="font-semibold">{t("overview.aiTarget.currentStatsUrl")}:</span> {aiTarget.envLlamaBaseUrl ?? "--"}</p>
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

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="ui-control-label text-xs">
              {t("overview.aiTarget.optionName")}
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} className="control-input mt-1 w-full" />
            </label>
            <label className="ui-control-label text-xs">
              {t("overview.aiTarget.optionHost")}
              <input value={presetHost} onChange={(event) => setPresetHost(event.target.value)} className="control-input mt-1 w-full" />
            </label>
            <label className="ui-control-label text-xs">
              {t("overview.aiTarget.optionProtocol")}
              <select value={presetProtocol} onChange={(event) => setPresetProtocol(event.target.value as "http" | "https")} className="control-input mt-1 w-full">
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </label>
            <label className="ui-control-label text-xs">
              {t("overview.aiTarget.optionApiPort")}
              <input value={presetPort} onChange={(event) => setPresetPort(event.target.value)} inputMode="numeric" className="control-input mt-1 w-full" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void probeAiTarget().catch(() => undefined);
            }}
            disabled={aiProbeLoading || presetHost.trim().length === 0}
            className="ui-action-pill ui-action-pill--quiet text-xs"
          >
            {aiProbeLoading ? t("service.button.updating") : t("overview.aiTarget.probeBtn")}
          </button>
          <button
            type="button"
            onClick={applyAiPreset}
            disabled={aiTargetSaving || !activePreset}
            className="ui-action-pill ui-action-pill--tonal text-xs"
          >
            {aiTargetSaving ? t("service.button.updating") : t("overview.aiTarget.applyBtn")}
          </button>
          <button
            type="button"
            onClick={startNewPreset}
            disabled={aiTargetSaving}
            className="ui-action-pill ui-action-pill--quiet text-xs"
          >
            {t("overview.aiTarget.newBtn")}
          </button>
          <button
            type="button"
            onClick={() => void savePreset()}
            disabled={presetName.trim().length === 0 || presetHost.trim().length === 0}
            className="ui-action-pill ui-action-pill--quiet text-xs"
          >
            {activePreset ? t("overview.aiTarget.saveBtn") : t("overview.aiTarget.addBtn")}
          </button>
          <button
            type="button"
            onClick={() => void removePreset()}
            disabled={!activePreset}
            className="ui-action-pill ui-action-pill--quiet text-xs"
          >
            {t("overview.aiTarget.deleteBtn")}
          </button>
        </div>

        {aiProbeResult && (
          <div className={`rounded-2xl border p-3 text-xs ${aiProbeResult.reachable ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-rose-300 bg-rose-50 text-rose-950"}`}>
            <p className="font-semibold">
              {aiProbeResult.reachable ? t("overview.aiTarget.probeOk") : t("overview.aiTarget.probeFail")}
            </p>
            <p className="mt-1">{describeProbeStatus(aiProbeResult.llama)}</p>
          </div>
        )}
        </>
        )}
      </div>

      {error && <p className="ui-feedback ui-feedback--error">{t("overview.error.load")}: {error}</p>}

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.key} className="ui-panel-block rounded-[1.35rem] p-4 text-[var(--md-sys-color-on-surface)]">
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
