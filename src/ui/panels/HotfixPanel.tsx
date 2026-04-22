import { useCallback, useEffect, useRef, useState } from "react";

import type { BackofficeSession } from "../../auth";
import { roleCanModify } from "../../application/services/rolePolicies";
import type { HotOperationResult, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";
import { useVisibilityPolling } from "../hooks/useVisibilityPolling";

/** @module HotfixPanel - Runtime hotfix panel for batch generation, cache wipe, and event simulation. */

type HotfixPanelProps = {
  session: BackofficeSession;
  context: SessionContext;
  density: UiDensity;
};

type GameCatalogSnapshot = {
  categories: Array<{ id: string; name: string }>;
  languages: Array<{ code: string; name: string }>;
};

type GenerationMode = "wait" | "progress";

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
  progress?: {
    current: number;
    total: number;
    ratio: number;
  };
};

type GenerationTaskResponse = {
  gameType: string;
  task: GenerationTaskSnapshot;
};

type PendingProcessRow = {
  service: "microservice-quiz" | "microservice-wordpass";
  gameType: "quiz" | "wordpass";
  task: GenerationTaskSnapshot;
};

type GenerationProcessesListResponse = {
  total?: number;
  tasks?: GenerationTaskSnapshot[];
};

/** Panel for executing runtime hotfix operations like batch generation and cache management. */
export function HotfixPanel({ session, context, density }: HotfixPanelProps) {
  const { t } = useI18n();
  const compact = density === "dense";
  const [categoryId, setCategoryId] = useState("23");
  const [generationLanguage, setGenerationLanguage] = useState("es");
  const [difficultyPercentage, setDifficultyPercentage] = useState(55);
  const [itemCount, setItemCount] = useState(3);
  const [generationCount, setGenerationCount] = useState(10);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("progress");
  const [generationCatalogSource, setGenerationCatalogSource] = useState<"quiz" | "wordpass">("quiz");
  const [catalogsByGame, setCatalogsByGame] = useState<Record<"quiz" | "wordpass", GameCatalogSnapshot>>({
    quiz: { categories: [], languages: [] },
    wordpass: { categories: [], languages: [] },
  });
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [result, setResult] = useState<HotOperationResult>({ status: "idle", message: t("hotfix.result.idle") });
  const [generationTask, setGenerationTask] = useState<GenerationTaskSnapshot | null>(null);
  const [pendingProcesses, setPendingProcesses] = useState<PendingProcessRow[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const pollTokenRef = useRef(0);

  const [eventScore, setEventScore] = useState(80);
  const [eventType, setEventType] = useState("quiz");

  const modifyEnabled = roleCanModify(session.role);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async (service: "microservice-quiz" | "microservice-wordpass") => {
      const payload = await fetchJson<{ catalogs?: GameCatalogSnapshot }>(
        `${EDGE_API_BASE}/v1/backoffice/services/${service}/catalogs`,
        {
          headers: composeAuthHeaders(context),
        },
      );
      return payload.catalogs ?? { categories: [], languages: [] };
    };

    const loadAllCatalogs = async () => {
      try {
        setCatalogError(null);
        const [quizCatalog, wordpassCatalog] = await Promise.all([
          loadCatalog("microservice-quiz"),
          loadCatalog("microservice-wordpass"),
        ]);

        if (cancelled) {
          return;
        }

        setCatalogsByGame({
          quiz: quizCatalog,
          wordpass: wordpassCatalog,
        });
      } catch (error) {
        if (!cancelled) {
          setCatalogError(error instanceof Error ? error.message : t("roles.errorUnknown"));
        }
      }
    };

    void loadAllCatalogs();
    return () => {
      cancelled = true;
    };
  }, [context, t]);

  const selectedCatalog = catalogsByGame[generationCatalogSource];

  useEffect(() => {
    return () => {
      pollTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (selectedCatalog.categories.length > 0 && !selectedCatalog.categories.some((item) => item.id === categoryId)) {
      setCategoryId(selectedCatalog.categories[0].id);
    }
    if (selectedCatalog.languages.length > 0 && !selectedCatalog.languages.some((item) => item.code === generationLanguage)) {
      setGenerationLanguage(selectedCatalog.languages[0].code);
    }
  }, [categoryId, generationLanguage, selectedCatalog.categories, selectedCatalog.languages]);

  const runGeneration = async (gameType: "quiz" | "wordpass") => {
    /* v8 ignore next */
    if (!modifyEnabled) {
      setResult({ status: "error", message: t("hotfix.result.noPermission") });
      return;
    }

    setResult({ status: "loading", message: t("hotfix.result.launching", { gameType }) });
    setGenerationTask(null);
    pollTokenRef.current += 1;
    try {
      const service = gameType === "quiz" ? "microservice-quiz" : "microservice-wordpass";
      const payload = {
        language: generationLanguage,
        categoryId,
        difficultyPercentage,
        itemCount,
        count: generationCount,
      };

      if (generationMode === "wait") {
        const response = await fetchJson<GenerationTaskResponse>(
          `${EDGE_API_BASE}/v1/backoffice/services/${service}/generation/wait`,
          {
            method: "POST",
            headers: composeAuthHeaders(context),
            body: JSON.stringify(payload),
          },
        );
        setGenerationTask(response.task);
        setResult({
          status: "done",
          message: t("hotfix.result.generationWaitOk", {
            gameType: response.gameType,
            created: response.task.created,
            requested: response.task.requested,
          }),
        });
        return;
      }

      const started = await fetchJson<GenerationTaskResponse>(
        `${EDGE_API_BASE}/v1/backoffice/services/${service}/generation/process`,
        {
          method: "POST",
          headers: composeAuthHeaders(context),
          body: JSON.stringify(payload),
        },
      );
      setGenerationTask(started.task);
      setResult({
        status: "loading",
        message: t("hotfix.result.processStarted", {
          taskId: started.task.taskId,
          requested: started.task.requested,
        }),
      });

      setPendingProcesses((current) => {
        const row: PendingProcessRow = {
          service,
          gameType,
          task: started.task,
        };
        return [row, ...current.filter((item) => item.task.taskId !== row.task.taskId)];
      });
      return;
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : t("hotfix.result.errorUnknown") });
    }
  };

  const progressRatio = generationTask?.progress?.ratio ?? 0;
  const progressPercent = Math.max(0, Math.min(100, Math.round(progressRatio * 100)));

  const loadPending = useCallback(async () => {
    try {
      const [quiz, wordpass] = await Promise.all([
        fetchJson<GenerationProcessesListResponse>(
          `${EDGE_API_BASE}/v1/backoffice/services/microservice-quiz/generation/processes?status=running&requestedBy=backoffice&limit=200`,
          { headers: composeAuthHeaders(context) },
        ),
        fetchJson<GenerationProcessesListResponse>(
          `${EDGE_API_BASE}/v1/backoffice/services/microservice-wordpass/generation/processes?status=running&requestedBy=backoffice&limit=200`,
          { headers: composeAuthHeaders(context) },
        ),
      ]);

      const merged: PendingProcessRow[] = [
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
        const rightTime = Date.parse(right.task.updatedAt ?? right.task.startedAt ?? "");
        const leftTime = Date.parse(left.task.updatedAt ?? left.task.startedAt ?? "");
        return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
      });

      setPendingError(null);
      setPendingProcesses(merged);
    } catch (error) {
      setPendingError(error instanceof Error ? error.message : t("hotfix.result.errorUnknown"));
    }
  }, [context, t]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useVisibilityPolling(loadPending, 2000);

  const injectUserEvent = async () => {
    /* v8 ignore next */
    if (!modifyEnabled) {
      setResult({ status: "error", message: t("hotfix.result.noPermission") });
      return;
    }

    setResult({ status: "loading", message: t("hotfix.result.registering") });
    try {
      const payload = {
        gameType: eventType,
        categoryId,
        categoryName: t("hotfix.manualEventCategoryName"),
        language: generationLanguage,
        outcome: "won",
        score: eventScore,
        durationSeconds: 120,
        metadata: { source: "backoffice-hotfix" },
      };

      await fetchJson<{ message: string }>(`${EDGE_API_BASE}/v1/backoffice/users/events/manual`, {
        method: "POST",
        headers: composeAuthHeaders(context),
        body: JSON.stringify(payload),
      });

      setResult({ status: "done", message: t("hotfix.result.registered") });
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : t("hotfix.result.errorUnknown") });
    }
  };

  return (
    <section className={`m3-card ui-panel-shell ${compact ? "p-4" : "p-5"}`}>
      <h2 className={`m3-title ${compact ? "text-lg" : "text-xl"}`}>{t("hotfix.title")}</h2>
      <p className={`mb-4 text-[var(--md-sys-color-on-surface-variant)] ${compact ? "text-xs" : "text-sm"}`}>{t("hotfix.subtitle")}</p>

      {!modifyEnabled && (
        <p className="ui-feedback ui-feedback--warn mb-4">
          {t("hotfix.readOnlyRole", { role: session.role })}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <article className={`ui-panel-block rounded-[1.4rem] ${compact ? "p-3" : "p-4"}`}>
          <h3 className="mb-2 font-semibold">{t("hotfix.genControlTitle")}</h3>
          <label className="ui-control-label mb-2">
            {t("hotfix.catalogSource")}
            <select value={generationCatalogSource} onChange={(event) => setGenerationCatalogSource(event.target.value as "quiz" | "wordpass")} className="control-input mt-1 w-full px-2 py-2">
              <option value="quiz">quiz</option>
              <option value="wordpass">word-pass</option>
            </select>
          </label>
          <label className="ui-control-label mb-2">
            {t("hotfix.categoryId")}
            {selectedCatalog.categories.length > 0 ? (
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="control-input mt-1 w-full px-2 py-2">
                {selectedCatalog.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="control-input mt-1 w-full px-2 py-2" />
            )}
          </label>
          <label className="ui-control-label mb-2">
            {t("hotfix.language")}
            {selectedCatalog.languages.length > 0 ? (
              <select value={generationLanguage} onChange={(event) => setGenerationLanguage(event.target.value)} className="control-input mt-1 w-full px-2 py-2">
                {selectedCatalog.languages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <input value={generationLanguage} onChange={(event) => setGenerationLanguage(event.target.value)} className="control-input mt-1 w-full px-2 py-2" />
            )}
          </label>
          <label className="ui-control-label mb-2">
            {t("hotfix.difficulty")}
            <input type="number" min={0} max={100} value={difficultyPercentage} onChange={(event) => setDifficultyPercentage(Number(event.target.value || 0))} className="control-input mt-1 w-full px-2 py-2" />
          </label>
          <label className="ui-control-label mb-3">
            {t("hotfix.numQuestions")}
            <input type="number" min={1} max={50} value={itemCount} onChange={(event) => setItemCount(Number(event.target.value || 1))} className="control-input mt-1 w-full px-2 py-2" />
          </label>
          <label className="ui-control-label mb-2">
            {t("hotfix.generationCount")}
            <input type="number" min={1} max={100} value={generationCount} onChange={(event) => setGenerationCount(Number(event.target.value || 1))} className="control-input mt-1 w-full px-2 py-2" />
          </label>
          <label className="ui-control-label mb-3">
            {t("hotfix.generationMode")}
            <select value={generationMode} onChange={(event) => setGenerationMode(event.target.value as GenerationMode)} className="control-input mt-1 w-full px-2 py-2">
              <option value="progress">{t("hotfix.generationMode.progress")}</option>
              <option value="wait">{t("hotfix.generationMode.wait")}</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!modifyEnabled} onClick={() => runGeneration("quiz")} className="ui-action-pill ui-action-pill--primary flex-1 text-sm">{t("hotfix.generateQuiz")}</button>
            <button type="button" disabled={!modifyEnabled} onClick={() => runGeneration("wordpass")} className="ui-action-pill ui-action-pill--tonal flex-1 text-sm">{t("hotfix.generateWordpass")}</button>
          </div>
          {generationTask && (
            <div className="ui-summary-band mt-3 rounded-[1.15rem] p-3">
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {t("hotfix.progress.task", {
                  taskId: generationTask.taskId,
                  status: generationTask.status,
                })}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]">
                <div
                  className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                  role="progressbar"
                  aria-label="generation-progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {t("hotfix.progress.detail", {
                  processed: generationTask.processed,
                  requested: generationTask.requested,
                  percent: progressPercent,
                  created: generationTask.created,
                  duplicates: generationTask.duplicates,
                  failed: generationTask.failed,
                })}
              </p>
            </div>
          )}
          {catalogError && <p className="ui-feedback ui-feedback--warn mt-2 p-2 text-xs">{catalogError}</p>}
        </article>

        <article className={`ui-panel-block rounded-[1.4rem] ${compact ? "p-3" : "p-4"}`}>
          <h3 className="mb-2 font-semibold">{t("hotfix.dataAdjustTitle")}</h3>
          <label className="ui-control-label mb-2">
            {t("hotfix.gameType")}
            <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="control-input mt-1 w-full px-2 py-2">
              <option value="quiz">quiz</option>
              <option value="word-pass">word-pass</option>
            </select>
          </label>
          <label className="ui-control-label mb-3">
            {t("hotfix.score")}
            <input type="number" value={eventScore} onChange={(event) => setEventScore(Number(event.target.value || 0))} className="control-input mt-1 w-full px-2 py-2" />
          </label>
          <button type="button" disabled={!modifyEnabled} onClick={injectUserEvent} className="ui-action-pill ui-action-pill--primary w-full text-sm">{t("hotfix.manualEvent")}</button>
        </article>
      </div>

      <p className={`mt-4 rounded-lg p-3 text-sm ${result.status === "error" ? "ui-feedback ui-feedback--error" : result.status === "done" ? "ui-feedback ui-feedback--ok" : "ui-surface-soft"}`}>{result.message}</p>

      <article className="ui-panel-block mt-4 rounded-[1.4rem] p-3">
        <h3 className="mb-2 font-semibold">{t("hotfix.pending.title")}</h3>
        {pendingError ? <p className="ui-feedback ui-feedback--warn p-2 text-xs">{pendingError}</p> : null}
        {!pendingError && pendingProcesses.length === 0 ? (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{t("hotfix.pending.empty")}</p>
        ) : (
          <div className="space-y-2">
            {pendingProcesses.map((item) => {
              const ratio = item.task.progress?.ratio ?? (item.task.requested > 0 ? item.task.processed / item.task.requested : 0);
              const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
              return (
                <div key={`${item.service}-${item.task.taskId}`} className="ui-summary-band rounded-[1.1rem] p-2.5">
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {t("hotfix.pending.item", {
                      gameType: item.gameType,
                      taskId: item.task.taskId,
                    })}
                  </p>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]">
                    <div className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-all duration-300" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {t("hotfix.pending.progress", {
                      processed: item.task.processed,
                      requested: item.task.requested,
                      percent,
                      created: item.task.created,
                      duplicates: item.task.duplicates,
                      failed: item.task.failed,
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}
