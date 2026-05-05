import type { CSSProperties, Ref } from "react";

import type { DeploymentHistory, DeploymentHistoryEntry } from "../../application/services/operationalSummary";
import { useI18n } from "../../i18n/context";

type DeploymentHistoryDropdownProps = {
  canRecord: boolean;
  error: string | null;
  form: DeploymentHistoryEntry;
  history: DeploymentHistory;
  onFormChange: (field: keyof DeploymentHistoryEntry, value: string) => void;
  onSave: () => void;
  panelRef: Ref<HTMLDivElement>;
  saving: boolean;
  style: CSSProperties;
};

export function DeploymentHistoryDropdown({
  canRecord,
  error,
  form,
  history,
  onFormChange,
  onSave,
  panelRef,
  saving,
  style,
}: DeploymentHistoryDropdownProps) {
  const { t } = useI18n();
  const historyMaxHeight = style.maxHeight
    ? Math.max(120, Number(style.maxHeight) - (canRecord ? 308 : 76))
    : undefined;

  return (
    <div
      id="deployment-history-panel"
      ref={panelRef}
      style={style}
      className="ui-popover-panel overflow-hidden rounded-[1.75rem] p-4"
    >
      <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{t("layout.release.historyTitle")}</p>
      {canRecord && (
        <div className="mt-3 grid gap-2 rounded-2xl border border-[var(--md-sys-color-outline-variant)] p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              {t("layout.release.formVersion")}
              <input
                value={form.version}
                onChange={(event) => onFormChange("version", event.target.value)}
                className="control-input mt-1 w-full py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              {t("layout.release.formDeployedAt")}
              <input
                value={form.deployedAt}
                onChange={(event) => onFormChange("deployedAt", event.target.value)}
                className="control-input mt-1 w-full py-1.5 text-xs"
              />
            </label>
          </div>
          <label className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            {t("layout.release.formCommit")}
            <input
              value={form.commitSha}
              onChange={(event) => onFormChange("commitSha", event.target.value)}
              className="control-input mt-1 w-full py-1.5 text-xs"
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            {t("layout.release.formSummary")}
            <input
              value={form.summary}
              onChange={(event) => onFormChange("summary", event.target.value)}
              className="control-input mt-1 w-full py-1.5 text-xs"
            />
          </label>
          {error && <p className="text-xs text-[var(--md-sys-color-error)]">{error}</p>}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="ui-action-pill ui-action-pill--primary justify-center text-xs disabled:opacity-60"
          >
            {saving ? t("layout.release.saving") : t("layout.release.saveBtn")}
          </button>
        </div>
      )}
      <div className="mt-3 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: historyMaxHeight }}>
        {history.history.map((entry) => (
          <article key={`${entry.version}-${entry.deployedAt}`} className="ui-subtle-card rounded-2xl px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{entry.version}</p>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{entry.deployedAt}</p>
            </div>
            <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{entry.summary}</p>
            <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{entry.commitSha}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
