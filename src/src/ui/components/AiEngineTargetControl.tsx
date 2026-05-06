import type { AiEngineTarget } from "../../domain/types/backoffice";
import type {
  AiEngineProbeEndpointStatus,
  AiEngineProbeResult,
  AiEngineTargetPresetState,
} from "../hooks/useAiEngineTargetState";

type AiEngineTargetControlLabels = {
  title: string;
  subtitle: string;
  show: string;
  hide: string;
  refresh: string;
  updating: string;
  error: string;
  collapsedTitle: string;
  dayOpsTitle: string;
  dayOpsBody: string;
  criticalTitle: string;
  criticalBody: string;
  source: string;
  sourceEnv: string;
  sourceOverride: string;
  currentHost: string;
  port: string;
  currentLabel: string;
  optionsCount: string;
  currentHostText: string;
  currentUrl: string;
  envUrl: string;
  selector: string;
  optionName: string;
  optionNamePlaceholder?: string;
  optionHost: string;
  optionHostPlaceholder?: string;
  optionProtocol: string;
  optionPort: string;
  probe: string;
  applyPreset: string;
  applyForm?: string;
  newPreset: string;
  addPreset: string;
  savePreset: string;
  deletePreset: string;
  resetTarget?: string;
  probeOk: string;
  probeFail: string;
  runtimeNote?: string;
  updatedAt?: string;
};

type AiEngineTargetControlProps = {
  labels: AiEngineTargetControlLabels;
  target: AiEngineTarget | null;
  targetLoading: boolean;
  targetSaving: boolean;
  targetError: string | null;
  presets: AiEngineTargetPresetState[];
  presetsLoading: boolean;
  selectedPresetId: string;
  setSelectedPresetId: (value: string) => void;
  isCreatingPreset: boolean;
  setIsCreatingPreset: (value: boolean) => void;
  presetName: string;
  setPresetName: (value: string) => void;
  presetHost: string;
  setPresetHost: (value: string) => void;
  presetProtocol: "http" | "https";
  setPresetProtocol: (value: "http" | "https") => void;
  presetPort: string;
  setPresetPort: (value: string) => void;
  activePreset: AiEngineTargetPresetState | null;
  probeLoading: boolean;
  probeResult: AiEngineProbeResult | null;
  expanded: boolean;
  setExpanded: (updater: (current: boolean) => boolean) => void;
  onRefresh: () => void;
  onProbe: () => void;
  onApplyPreset: () => void;
  onApplyForm?: () => void;
  onStartNewPreset: () => void;
  onSavePreset: () => void;
  onDeletePreset: () => void;
  onResetTarget?: () => void;
  formatTimestamp?: (value: string | null | undefined) => string;
};

function MetricTile({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "ok" | "warn" | "error" }) {
  return (
    <article className={`ui-metric-tile ui-metric-tile--${tone} rounded-[1.35rem] px-4 py-3`}>
      <p className="ui-metric-label">{label}</p>
      <p className="ui-metric-value mt-3 break-all text-[1.35rem]">{value}</p>
    </article>
  );
}

function describeProbeStatus(status: AiEngineProbeEndpointStatus) {
  if (status.ok) {
    return `${status.url} OK${status.latencyMs !== null ? ` · ${status.latencyMs}ms` : ""}`;
  }

  return `${status.url} ${status.message ?? "sin respuesta"}`;
}

export function AiEngineTargetControl({
  labels,
  target,
  targetLoading,
  targetSaving,
  targetError,
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
  probeLoading,
  probeResult,
  expanded,
  setExpanded,
  onRefresh,
  onProbe,
  onApplyPreset,
  onApplyForm,
  onStartNewPreset,
  onSavePreset,
  onDeletePreset,
  onResetTarget,
  formatTimestamp,
}: AiEngineTargetControlProps) {
  const activePresetName = presets.find((entry) => entry.active)?.name ?? target?.label ?? "--";
  const selectedPresetName = presets.find((entry) => entry.id === selectedPresetId)?.name ?? "--";

  return (
    <div className="ui-panel-block rounded-[1.6rem] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold sm:text-base text-[var(--md-sys-color-on-surface)]">{labels.title}</h3>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
            aria-expanded={expanded}
          >
            {expanded ? labels.hide : labels.show}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={targetLoading || targetSaving || presetsLoading}
            className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
          >
            {targetLoading || presetsLoading ? "..." : labels.refresh}
          </button>
        </div>
      </div>

      {targetError && <p className="ui-feedback ui-feedback--error">{labels.error}: {targetError}</p>}

      {!expanded ? (
        <div className="ui-summary-band rounded-[1.25rem] p-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {labels.collapsedTitle}: {target?.label ?? target?.host ?? "--"}
        </div>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="ui-summary-band rounded-[1.25rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
              <p className="font-semibold">{labels.dayOpsTitle}</p>
              <p className="mt-1 text-[var(--md-sys-color-on-surface-variant)]">{labels.dayOpsBody}</p>
            </div>
            <div className="ui-summary-band rounded-[1.25rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
              <p className="font-semibold">{labels.criticalTitle}</p>
              <p className="mt-1 text-[var(--md-sys-color-on-surface-variant)]">{labels.criticalBody}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label={labels.source} value={target?.source === "override" ? labels.sourceOverride : labels.sourceEnv} tone={target?.source === "override" ? "ok" : "neutral"} />
            <MetricTile label={labels.currentHost} value={target?.host ?? "--"} tone={target?.host ? "ok" : "warn"} />
            <MetricTile label={labels.port} value={target?.port ?? "--"} />
            <MetricTile label={labels.currentLabel} value={target?.label ?? "--"} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="ui-panel-block rounded-[1.2rem] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                {labels.currentUrl}
              </div>
              <div className="mt-1 break-all font-mono text-xs text-[var(--md-sys-color-on-surface)]">
                {target?.llamaBaseUrl ?? "--"}
              </div>
            </div>
            <div className="ui-panel-block rounded-[1.2rem] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                {labels.envUrl}
              </div>
              <div className="mt-1 break-all font-mono text-xs text-[var(--md-sys-color-on-surface)]">
                {target?.envLlamaBaseUrl ?? "--"}
              </div>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(240px,320px)_1fr]">
            <label className="ui-control-label text-xs">
              {labels.selector}
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
                  <option key={entry.id} value={entry.id}>{entry.active ? "* " : ""}{entry.name}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label={labels.optionsCount} value={presets.length} />
              <MetricTile label={labels.selector} value={selectedPresetName} />
              <MetricTile label={labels.currentLabel} value={activePresetName} />
              <MetricTile label={labels.updatedAt ?? labels.currentLabel} value={formatTimestamp ? formatTimestamp(target?.updatedAt) : target?.updatedAt ?? "--"} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="ui-control-label text-xs">
              {labels.optionName}
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={labels.optionNamePlaceholder} className="control-input mt-1 w-full" />
            </label>
            <label className="ui-control-label text-xs">
              {labels.optionHost}
              <input value={presetHost} onChange={(event) => setPresetHost(event.target.value)} placeholder={labels.optionHostPlaceholder} className="control-input mt-1 w-full" />
            </label>
            <label className="ui-control-label text-xs">
              {labels.optionProtocol}
              <select value={presetProtocol} onChange={(event) => setPresetProtocol(event.target.value as "http" | "https")} className="control-input mt-1 w-full">
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </label>
            <label className="ui-control-label text-xs">
              {labels.optionPort}
              <input value={presetPort} onChange={(event) => setPresetPort(event.target.value)} inputMode="numeric" className="control-input mt-1 w-full" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onProbe}
              disabled={probeLoading || presetHost.trim().length === 0}
              className="ui-action-pill ui-action-pill--quiet text-xs"
            >
              {probeLoading ? labels.updating : labels.probe}
            </button>
            <button
              type="button"
              onClick={onApplyPreset}
              disabled={targetSaving || !activePreset || isCreatingPreset}
              className="ui-action-pill ui-action-pill--tonal text-xs"
            >
              {targetSaving ? labels.updating : labels.applyPreset}
            </button>
            {onApplyForm && labels.applyForm && (
              <button
                type="button"
                onClick={onApplyForm}
                disabled={targetSaving || presetHost.trim().length === 0}
                className="ui-action-pill ui-action-pill--quiet text-xs"
              >
                {labels.applyForm}
              </button>
            )}
            <button type="button" onClick={onStartNewPreset} disabled={targetSaving} className="ui-action-pill ui-action-pill--quiet text-xs">
              {labels.newPreset}
            </button>
            <button
              type="button"
              onClick={onSavePreset}
              disabled={targetSaving || presetName.trim().length === 0 || presetHost.trim().length === 0}
              className="ui-action-pill ui-action-pill--quiet text-xs"
            >
              {activePreset && !isCreatingPreset ? labels.savePreset : labels.addPreset}
            </button>
            <button
              type="button"
              onClick={onDeletePreset}
              disabled={targetSaving || !activePreset || isCreatingPreset}
              className="ui-action-pill ui-action-pill--quiet text-xs"
            >
              {labels.deletePreset}
            </button>
            {onResetTarget && labels.resetTarget && (
              <button type="button" onClick={onResetTarget} disabled={targetSaving} className="ui-action-pill ui-action-pill--quiet text-xs">
                {labels.resetTarget}
              </button>
            )}
          </div>

          {probeResult && (
            <div className="ui-summary-band rounded-[1.25rem] p-3 text-xs text-[var(--md-sys-color-on-surface)]">
              <p className="font-semibold">{probeResult.reachable ? labels.probeOk : labels.probeFail}</p>
              <p className="mt-1 text-[var(--md-sys-color-on-surface-variant)]">{describeProbeStatus(probeResult.llama)}</p>
            </div>
          )}

          {labels.runtimeNote && (
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{labels.runtimeNote}</p>
          )}
        </>
      )}
    </div>
  );
}
