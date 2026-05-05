import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchKubernetesOverview,
  fetchServiceOperationalSummary,
  type KubernetesOverview,
  type ServiceOperationalRow,
} from "../../application/services/operationalSummary";
import type { SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";
import { AutoRefreshCountdown } from "../components/AutoRefreshCountdown";
import { useMaxWidth } from "../hooks/useMaxWidth";
import { useAutoRefreshScheduler } from "../hooks/useAutoRefreshScheduler";
import { useAiEngineTargetState, type AiEngineProbeEndpointStatus } from "../hooks/useAiEngineTargetState";

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

type GenerationTaskSnapshot = {
  taskId: string;
  status: "running" | "completed" | "failed";
  startedAt?: string;
  updatedAt?: string;
  requested: number;
  processed: number;
  created: number;
  duplicates: number;
  failed: number;
};

type GenerationProcessesListResponse = {
  total?: number;
  tasks?: GenerationTaskSnapshot[];
};

type ActiveGenerationRow = {
  service: "microservice-quiz" | "microservice-wordpass";
  gameType: "quiz" | "wordpass";
  task: GenerationTaskSnapshot;
};

type OverviewTab = "operations" | "kubernetes";

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

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "--";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleString();
}

function formatMillicores(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} cores`;
  }

  return `${value}m`;
}

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }

  return `${amount.toFixed(amount >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUsageRatio(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }

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
  const {
    target: aiTarget,
    targetLoading: aiTargetLoading,
    targetSaving: aiTargetSaving,
    targetError: aiTargetError,
    presets,
    presetsLoading,
    selectedPresetId,
    setSelectedPresetId,
    isCreatingPreset,
    setIsCreatingPreset,
    presetName,
    setPresetName,
    presetHost,
    setPresetHost,
    presetProtocol,
    setPresetProtocol,
    presetPort,
    setPresetPort,
    activePreset,
    probeLoading: aiProbeLoading,
    probeResult: aiProbeResult,
    refresh: refreshAiTarget,
    probeTarget: probeAiTarget,
    savePreset,
    activateSelectedPreset,
    deleteSelectedPreset: removePreset,
    startNewPreset,
  } = useAiEngineTargetState({
    context,
    unknownErrorLabel: t("roles.errorUnknown"),
    missingHostLabel: t("overview.aiTarget.missingHost"),
    applyBlockedLabel: t("overview.aiTarget.probeApplyBlocked"),
  });
  const [activeGenerations, setActiveGenerations] = useState<ActiveGenerationRow[]>([]);
  const [activeGenerationsLoading, setActiveGenerationsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<OverviewTab>("operations");
  const [kubernetesOverview, setKubernetesOverview] = useState<KubernetesOverview | null>(null);
  const [kubernetesLoading, setKubernetesLoading] = useState(false);
  const [kubernetesError, setKubernetesError] = useState<string | null>(null);

  const requestVersionRef = useRef(0);
  const previousByServiceRef = useRef<Record<string, { requestsTotal: number | null; fetchedAt: number }>>({});

  const intervalOptions = [5, 10, 15, 30, 60];
  const authHeaders = useCallback(() => composeAuthHeaders(context), [context]);

  const describeProbeStatus = useCallback((status: AiEngineProbeEndpointStatus) => {
    if (status.ok) {
      return `${status.url} OK${status.latencyMs !== null ? ` · ${status.latencyMs}ms` : ""}`;
    }

    return `${status.url} ${status.message ?? "sin respuesta"}`;
  }, []);

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

  const loadKubernetes = useCallback(async () => {
    setKubernetesLoading(true);
    setKubernetesError(null);
    try {
      const payload = await fetchKubernetesOverview(context);
      setKubernetesOverview(payload);
      setKubernetesError(null);
    } catch (loadError) {
      setKubernetesOverview(null);
      setKubernetesError(loadError instanceof Error ? loadError.message : t("roles.errorUnknown"));
    } finally {
      setKubernetesLoading(false);
    }
  }, [context, t]);

  const loadActiveGenerations = useCallback(async () => {
    setActiveGenerationsLoading(true);
    try {
      const [quiz, wordpass] = await Promise.all([
        fetchJson<GenerationProcessesListResponse>(
          `${EDGE_API_BASE}/v1/backoffice/services/microservice-quiz/generation/processes?status=running&requestedBy=backoffice&limit=50`,
          { headers: authHeaders() },
        ),
        fetchJson<GenerationProcessesListResponse>(
          `${EDGE_API_BASE}/v1/backoffice/services/microservice-wordpass/generation/processes?status=running&requestedBy=backoffice&limit=50`,
          { headers: authHeaders() },
        ),
      ]);

      const merged: ActiveGenerationRow[] = [
        ...(quiz.tasks ?? []).map((task) => ({
          service: "microservice-quiz" as const,
          gameType: "quiz" as const,
          task,
        })),
        ...(wordpass.tasks ?? []).map((task) => ({
          service: "microservice-wordpass" as const,
          gameType: "wordpass" as const,
          task,
        })),
      ].sort((left, right) => {
        const leftRisk = (left.task.status === "failed" || left.task.failed > 0 ? 2 : 0) + (left.task.duplicates > 0 ? 1 : 0);
        const rightRisk = (right.task.status === "failed" || right.task.failed > 0 ? 2 : 0) + (right.task.duplicates > 0 ? 1 : 0);
        if (rightRisk !== leftRisk) {
          return rightRisk - leftRisk;
        }
        const leftTime = Date.parse(left.task.updatedAt ?? left.task.startedAt ?? "");
        const rightTime = Date.parse(right.task.updatedAt ?? right.task.startedAt ?? "");
        return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
      });

      setActiveGenerations(merged);
    } catch {
      setActiveGenerations([]);
    } finally {
      setActiveGenerationsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadSummary();
    void loadKubernetes();
    void loadActiveGenerations();
  }, [loadActiveGenerations, loadKubernetes, loadSummary]);

  useAutoRefreshScheduler(
    () => {
      void loadSummary();
      void loadKubernetes();
      void loadActiveGenerations();
    },
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
  const kubernetesStatusClass = (status: "healthy" | "degraded" | "down") => {
    if (status === "healthy") {
      return "ui-status-chip ui-status-chip--ok";
    }
    if (status === "degraded") {
      return "ui-status-chip ui-status-chip--warn";
    }
    return "ui-status-chip ui-status-chip--error";
  };
  const applyAiPreset = useCallback(() => activateSelectedPreset({ probeFirst: true }), [activateSelectedPreset]);
  const kubernetesSummary = useMemo(() => ({
    nodes: kubernetesOverview?.cluster.nodeCount ?? 0,
    readyNodes: kubernetesOverview?.cluster.readyNodeCount ?? 0,
    deployments: kubernetesOverview?.cluster.deploymentCount ?? 0,
    pods: kubernetesOverview?.cluster.podCount ?? 0,
    runningPods: kubernetesOverview?.cluster.runningPodCount ?? 0,
    restarts: kubernetesOverview?.cluster.restartCount ?? 0,
  }), [kubernetesOverview]);

  const activeGenerationSummary = useMemo(() => {
    let failing = 0;
    let duplicated = 0;
    let requested = 0;
    let processed = 0;

    for (const entry of activeGenerations) {
      requested += entry.task.requested;
      processed += entry.task.processed;
      if (entry.task.status === "failed" || entry.task.failed > 0) {
        failing += 1;
      }
      if (entry.task.duplicates > 0) {
        duplicated += 1;
      }
    }

    return {
      total: activeGenerations.length,
      failing,
      duplicated,
      processed,
      requested,
    };
  }, [activeGenerations]);

  const activeGenerationSpotlight = useMemo(() => activeGenerations.slice(0, 3).map((entry) => {
    const riskKey = entry.task.status === "failed" || entry.task.failed > 0
      ? "overview.generations.risk.failed"
      : entry.task.duplicates > 0
        ? "overview.generations.risk.duplicates"
        : "overview.generations.risk.healthy";

    return {
      id: `${entry.service}-${entry.task.taskId}`,
      title: `${entry.gameType} | ${entry.task.taskId}`,
      detail: t("overview.generations.spotlight.detail", {
        service: entry.service,
        processed: entry.task.processed,
        requested: entry.task.requested,
        timestamp: formatTimestamp(entry.task.updatedAt ?? entry.task.startedAt),
      }),
      riskLabel: t(riskKey),
    };
  }), [activeGenerations, t]);

  const openGenerationProcess = useCallback((entry: ActiveGenerationRow) => {
    if (typeof window === "undefined") {
      return;
    }

    const navKey = entry.gameType === "quiz" ? "svc-quiz" : "svc-wordpass";
    const query = new URLSearchParams({
      dataset: "processes",
      followTaskId: entry.task.taskId,
    });
    window.location.hash = `#/backoffice/${navKey}?${query.toString()}`;
  }, []);

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
              onClick={() => {
                void loadSummary();
                void loadActiveGenerations();
              }}
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

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedTab("operations")}
          className={`${selectedTab === "operations" ? "ui-action-pill ui-action-pill--tonal" : "ui-action-pill ui-action-pill--quiet"} min-h-0 px-3 py-1.5 text-xs`}
        >
          Operations
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("kubernetes")}
          className={`${selectedTab === "kubernetes" ? "ui-action-pill ui-action-pill--tonal" : "ui-action-pill ui-action-pill--quiet"} min-h-0 px-3 py-1.5 text-xs`}
        >
          Kubernetes
        </button>
      </div>
      </div>

      {selectedTab === "operations" ? (
        <>
          <div className={`grid gap-2 ${compactViewport ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
            <KpiCard label={t("overview.summary.total")} value={totals.total} tone="neutral" compact={compactPanel} />
            <KpiCard label={t("overview.summary.online")} value={totals.onlineCount} tone="ok" compact={compactPanel} />
            <KpiCard label={t("overview.summary.accessIssues")} value={totals.accessIssues} tone="warn" compact={compactPanel} />
            <KpiCard label={t("overview.summary.connectionErrors")} value={totals.connectionErrors} tone="error" compact={compactPanel} />
          </div>

          <div className="ui-panel-block rounded-[1.6rem] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">{t("overview.generations.title")}</h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("overview.generations.subtitle")}</p>
              </div>
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{activeGenerationsLoading ? "..." : activeGenerationSummary.total}</span>
            </div>

            <div className={`grid gap-2 ${compactViewport ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
              <KpiCard label={t("overview.generations.summary.active")} value={activeGenerationSummary.total} tone={activeGenerationSummary.total > 0 ? "warn" : "ok"} compact={compactPanel} />
              <KpiCard label={t("overview.generations.summary.failed")} value={activeGenerationSummary.failing} tone={activeGenerationSummary.failing > 0 ? "error" : "ok"} compact={compactPanel} />
              <KpiCard label={t("overview.generations.summary.duplicates")} value={activeGenerationSummary.duplicated} tone={activeGenerationSummary.duplicated > 0 ? "warn" : "ok"} compact={compactPanel} />
              <KpiCard label={t("overview.generations.summary.progress")} value={`${activeGenerationSummary.processed}/${activeGenerationSummary.requested}`} tone="neutral" compact={compactPanel} />
            </div>

            {activeGenerationSpotlight.length > 0 ? (
              <ul className="space-y-2">
                {activeGenerationSpotlight.map((entry, index) => (
                  <li key={entry.id} className="ui-summary-band rounded-[1.2rem] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{entry.title}</p>
                        <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{entry.detail}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="ui-surface-soft rounded-full px-2 py-1 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">{entry.riskLabel}</span>
                        <button
                          type="button"
                          onClick={() => openGenerationProcess(activeGenerations[index]!)}
                          className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
                        >
                          {t("overview.generations.openProcess")}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{t("overview.generations.none")}</p>
            )}
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
                    void refreshAiTarget();
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
              <div className="ui-summary-band rounded-[1.25rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
                <p className="font-semibold">{t("overview.aiTarget.criticalTitle")}</p>
                <p className="mt-1 text-[var(--md-sys-color-on-surface-variant)]">{t("overview.aiTarget.criticalBody")}</p>
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
              <div className="ui-summary-band rounded-[1.25rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
                <p className="font-semibold">
                  {aiProbeResult.reachable ? t("overview.aiTarget.probeOk") : t("overview.aiTarget.probeFail")}
                </p>
                <p className="mt-1 text-[var(--md-sys-color-on-surface-variant)]">{describeProbeStatus(aiProbeResult.llama)}</p>
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
        </>
      ) : (
        <>
          <div className={`grid gap-2 ${compactViewport ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
            <KpiCard label="Nodos listos" value={`${kubernetesSummary.readyNodes}/${kubernetesSummary.nodes}`} tone={kubernetesSummary.readyNodes === kubernetesSummary.nodes ? "ok" : "warn"} compact={compactPanel} />
            <KpiCard label="Deployments" value={kubernetesSummary.deployments} tone="neutral" compact={compactPanel} />
            <KpiCard label="Pods en ejecucion" value={`${kubernetesSummary.runningPods}/${kubernetesSummary.pods}`} tone="ok" compact={compactPanel} />
            <KpiCard label="Reinicios" value={kubernetesSummary.restarts} tone={kubernetesSummary.restarts > 0 ? "warn" : "ok"} compact={compactPanel} />
          </div>

          {kubernetesError && <p className="ui-feedback ui-feedback--error">Kubernetes: {kubernetesError}</p>}

          {!kubernetesError && kubernetesOverview && !kubernetesOverview.enabled && (
            <div className="ui-panel-block rounded-[1.35rem] p-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {kubernetesOverview.message ?? "La observabilidad Kubernetes no esta disponible en este entorno."}
            </div>
          )}

          {kubernetesOverview?.enabled && (
            <>
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="ui-panel-block rounded-[1.35rem] p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">Cluster</h3>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Namespace {kubernetesOverview.namespace} · actualizado {formatTimestamp(kubernetesOverview.fetchedAt)}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <KpiCard label="CPU usada" value={formatMillicores(kubernetesOverview.cluster.cpuUsageMillicores)} tone="neutral" compact={compactPanel} />
                    <KpiCard label="Memoria usada" value={formatBytes(kubernetesOverview.cluster.memoryUsageBytes)} tone="neutral" compact={compactPanel} />
                    <KpiCard label="CPU ratio" value={formatUsageRatio(kubernetesOverview.cluster.cpuUsageRatio)} tone="neutral" compact={compactPanel} />
                    <KpiCard label="Memoria ratio" value={formatUsageRatio(kubernetesOverview.cluster.memoryUsageRatio)} tone="neutral" compact={compactPanel} />
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2 text-[var(--md-sys-color-on-surface)]">
                    <p><span className="font-semibold">CPU requests:</span> {formatMillicores(kubernetesOverview.cluster.namespaceCpuRequestMillicores)}</p>
                    <p><span className="font-semibold">CPU limits:</span> {formatMillicores(kubernetesOverview.cluster.namespaceCpuLimitMillicores)}</p>
                    <p><span className="font-semibold">Memory requests:</span> {formatBytes(kubernetesOverview.cluster.namespaceMemoryRequestBytes)}</p>
                    <p><span className="font-semibold">Memory limits:</span> {formatBytes(kubernetesOverview.cluster.namespaceMemoryLimitBytes)}</p>
                  </div>
                </div>

                <div className="ui-panel-block rounded-[1.35rem] p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">Nodos</h3>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Capacidad y consumo por nodo.</p>
                  </div>
                  <div className="space-y-2">
                    {kubernetesOverview.nodes.map((node) => (
                      <div key={node.name} className="ui-summary-band rounded-[1.2rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">{node.name}</p>
                          <span className={statusClass(node.ready)}>{node.ready ? "Ready" : "Not ready"}</span>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <p><span className="font-semibold">Pods:</span> {node.podCount}</p>
                          <p><span className="font-semibold">CPU:</span> {formatMillicores(node.cpuUsageMillicores)} / {formatMillicores(node.cpuCapacityMillicores)}</p>
                          <p><span className="font-semibold">Memoria:</span> {formatBytes(node.memoryUsageBytes)} / {formatBytes(node.memoryCapacityBytes)}</p>
                          <p><span className="font-semibold">Uso:</span> {formatUsageRatio(node.cpuUsageRatio)} CPU · {formatUsageRatio(node.memoryUsageRatio)} RAM</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="ui-panel-block rounded-[1.35rem] p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">Workloads</h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Estado de despliegue y consumo agregado por deployment.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {kubernetesOverview.workloads.map((workload) => (
                    <article key={workload.name} className="ui-summary-band rounded-[1.2rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{workload.name}</p>
                          <p className="text-[var(--md-sys-color-on-surface-variant)]">{workload.image ?? "Sin imagen detectada"}</p>
                        </div>
                        <span className={kubernetesStatusClass(workload.status)}>{workload.status}</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <p><span className="font-semibold">Replicas:</span> {workload.readyReplicas}/{workload.desiredReplicas}</p>
                        <p><span className="font-semibold">Disponibles:</span> {workload.availableReplicas}</p>
                        <p><span className="font-semibold">Pods:</span> {workload.readyPodCount}/{workload.podCount}</p>
                        <p><span className="font-semibold">Reinicios:</span> {workload.restartCount}</p>
                        <p><span className="font-semibold">CPU:</span> {formatMillicores(workload.cpuUsageMillicores)}</p>
                        <p><span className="font-semibold">Memoria:</span> {formatBytes(workload.memoryUsageBytes)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="ui-panel-block rounded-[1.35rem] p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">Pods calientes</h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Pods con mayor consumo de memoria y CPU en este namespace.</p>
                </div>
                <div className="space-y-2">
                  {kubernetesOverview.topPods.map((pod) => (
                    <div key={pod.name} className="ui-summary-band rounded-[1.2rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{pod.name}</p>
                        <span className={statusClass(pod.ready)}>{pod.phase}</span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <p><span className="font-semibold">Workload:</span> {pod.workload ?? "--"}</p>
                        <p><span className="font-semibold">Nodo:</span> {pod.nodeName ?? "--"}</p>
                        <p><span className="font-semibold">CPU:</span> {formatMillicores(pod.cpuUsageMillicores)} · request {formatMillicores(pod.cpuRequestMillicores)}</p>
                        <p><span className="font-semibold">Memoria:</span> {formatBytes(pod.memoryUsageBytes)} · request {formatBytes(pod.memoryRequestBytes)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {kubernetesLoading && !kubernetesOverview && !kubernetesError && (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">Cargando estado de Kubernetes...</p>
          )}
        </>
      )}
    </section>
  );
}
