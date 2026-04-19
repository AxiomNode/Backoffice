import { useEffect, useMemo, useState } from "react";

import type { DataDataset, NavKey, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { useI18n } from "../../i18n/context";
import type { LabelKey } from "../../i18n/labels";
import { AutoRefreshCountdown } from "../components/AutoRefreshCountdown";
import { PaginatedFilterableTable } from "../components/PaginatedFilterableTable";
import { useServiceConsoleState, type ServiceConsoleMessages } from "../hooks/useServiceConsoleState";

/** @module ServiceConsolePanel - Per-service console with metrics, logs, data, and CRUD controls. */

type QuizManualDraft = {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "0" | "1" | "2" | "3";
};

type WordpassManualDraft = {
  letter: string;
  hint: string;
  answer: string;
};

const EMPTY_QUIZ_MANUAL_DRAFT: QuizManualDraft = {
  question: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctOption: "0",
};

const EMPTY_WORDPASS_MANUAL_DRAFT: WordpassManualDraft = {
  letter: "",
  hint: "",
  answer: "",
};

function resolveGamePayload(content: unknown): Record<string, unknown> {
  const payload = content && typeof content === "object" ? (content as Record<string, unknown>) : {};
  const nestedGame = payload.game && typeof payload.game === "object" ? (payload.game as Record<string, unknown>) : null;
  return nestedGame && Object.keys(nestedGame).length > 0 ? nestedGame : payload;
}

function buildQuizManualContent(draft: QuizManualDraft): Record<string, unknown> {
  const options = [draft.optionA, draft.optionB, draft.optionC, draft.optionD]
    .map((value, index) => ({ value: value.trim(), index }))
    .filter((item) => item.value.length > 0);

  const selectedIndex = Number(draft.correctOption);
  const normalizedCorrectIndex = Math.max(0, options.findIndex((item) => item.index === selectedIndex));

  return {
    questions: [
      {
        question: draft.question.trim(),
        options: options.map((item) => item.value),
        correct_index: normalizedCorrectIndex,
      },
    ],
  };
}

function buildWordpassManualContent(draft: WordpassManualDraft): Record<string, unknown> {
  return {
    words: [
      {
        letter: draft.letter.trim(),
        hint: draft.hint.trim(),
        answer: draft.answer.trim(),
      },
    ],
  };
}

function parseQuizManualDraft(content: unknown): QuizManualDraft {
  const payload = resolveGamePayload(content);
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const firstQuestion = questions[0] && typeof questions[0] === "object" ? (questions[0] as Record<string, unknown>) : {};
  const options = Array.isArray(firstQuestion.options) ? firstQuestion.options : [];
  const correctIndex = typeof firstQuestion.correct_index === "number" ? firstQuestion.correct_index : 0;

  return {
    question: typeof firstQuestion.question === "string" ? firstQuestion.question : "",
    optionA: typeof options[0] === "string" ? options[0] : "",
    optionB: typeof options[1] === "string" ? options[1] : "",
    optionC: typeof options[2] === "string" ? options[2] : "",
    optionD: typeof options[3] === "string" ? options[3] : "",
    correctOption: String(Math.max(0, Math.min(3, correctIndex))) as "0" | "1" | "2" | "3",
  };
}

function parseWordpassManualDraft(content: unknown): WordpassManualDraft {
  const payload = resolveGamePayload(content);
  const words = Array.isArray(payload.words) ? payload.words : [];
  const firstWord = words[0] && typeof words[0] === "object" ? (words[0] as Record<string, unknown>) : {};

  return {
    letter: typeof firstWord.letter === "string" ? firstWord.letter : "",
    hint: typeof firstWord.hint === "string" ? firstWord.hint : "",
    answer: typeof firstWord.answer === "string" ? firstWord.answer : "",
  };
}

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
  roles: "nav.roles.title",
  "ai-diagnostics": "nav.ai-diagnostics.title",
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
  roles: "nav.roles.subtitle",
  "ai-diagnostics": "nav.ai-diagnostics.subtitle",
};

type ServiceConsolePanelProps = {
  navKey: NavKey;
  context: SessionContext;
  density: UiDensity;
};

/** Console panel for an individual service showing metrics, logs, data tables, and manual CRUD. */
export function ServiceConsolePanel({ navKey, context, density }: ServiceConsolePanelProps) {
  const { t } = useI18n();
  const messages: ServiceConsoleMessages = useMemo(() => ({
    insertOk: t("service.data.manual.insertOk"),
    updateOk: t("service.data.manual.updateOk"),
    deleteOk: t("service.data.manual.deleteOk"),
    updateIdRequired: t("service.data.manual.updateIdRequired"),
    contentObjectOnly: t("service.data.manual.contentObjectOnly"),
    contentNonNull: t("service.data.manual.contentNonNull"),
  }), [t]);
  const state = useServiceConsoleState(navKey, context, t("roles.errorUnknown"), messages);
  const { serviceConfig } = state;
  const compact = density === "dense";
  const [quizDraft, setQuizDraft] = useState<QuizManualDraft>(EMPTY_QUIZ_MANUAL_DRAFT);
  const [wordpassDraft, setWordpassDraft] = useState<WordpassManualDraft>(EMPTY_WORDPASS_MANUAL_DRAFT);

  const isQuizHistoryDataset = serviceConfig?.service === "microservice-quiz" && state.dataset === "history";
  const isWordpassHistoryDataset = serviceConfig?.service === "microservice-wordpass" && state.dataset === "history";

  if (!serviceConfig) {
    return <section className="m3-card p-5">{t("service.notFound")}</section>;
  }

  const isGameHistoryDataset = isQuizHistoryDataset || isWordpassHistoryDataset;

  useEffect(() => {
    if (serviceConfig.service === "microservice-quiz") {
      setQuizDraft(EMPTY_QUIZ_MANUAL_DRAFT);
      return;
    }

    if (serviceConfig.service === "microservice-wordpass") {
      setWordpassDraft(EMPTY_WORDPASS_MANUAL_DRAFT);
    }
  }, [serviceConfig.service]);

  useEffect(() => {
    if (!isQuizHistoryDataset) {
      return;
    }

    state.setManualContentJson(JSON.stringify(buildQuizManualContent(quizDraft), null, 2));
  }, [isQuizHistoryDataset, quizDraft, state.setManualContentJson]);

  useEffect(() => {
    if (!isWordpassHistoryDataset) {
      return;
    }

    state.setManualContentJson(JSON.stringify(buildWordpassManualContent(wordpassDraft), null, 2));
  }, [isWordpassHistoryDataset, wordpassDraft, state.setManualContentJson]);

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
  const technicalDialogColumns = useMemo(() => {
    if (state.dataset === "history" && (serviceConfig.service === "microservice-quiz" || serviceConfig.service === "microservice-wordpass")) {
      return ["detail", "request", "response"];
    }

    if (state.dataset === "processes") {
      return ["generatedItems", "errors"];
    }

    return [];
  }, [state.dataset, serviceConfig.service]);

  const intervalOptions = [5, 10, 15, 30, 60];
  const refreshCardPadding = compact ? "p-2.5" : "p-3";
  const refreshLabelText = compact ? "text-[11px]" : "text-xs";
  const refreshInputPadding = compact ? "px-2 py-1" : "px-2 py-1.5";
  const refreshButtonPadding = compact ? "px-3 py-1.5" : "px-4 py-2";
  const refreshButtonText = compact ? "text-xs" : "text-sm";

  const serviceMeta = state.catalog.find((item) => item.key === serviceConfig.service);
  const historyRowActions = useMemo(() => {
    if (!isGameHistoryDataset) {
      return [];
    }

    const parseRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
    const parseString = (value: unknown) => (typeof value === "string" ? value : "");
    const parseDifficulty = (value: unknown) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return 0;
    };

    const extractRowPayload = (row: Record<string, unknown>) => {
      const detail = parseRecord(row.detail);
      const request = parseRecord(row.request);
      const response = parseRecord(row.response);
      const entryId = parseString(detail.id);
      const categoryId = parseString(row.categoryId ?? request.categoryId);
      const language = parseString(row.language ?? request.language);
      const difficulty = parseDifficulty(row.difficultyPercentage ?? request.difficulty_percentage);
      const contentJson = JSON.stringify(response, null, 2);
      const status = parseString(row.status) as "manual" | "validated" | "pending_review";
      return { entryId, categoryId, language, difficulty, contentJson, status };
    };

    const loadIntoEditor = (row: Record<string, unknown>, statusOverride?: "manual" | "validated" | "pending_review") => {
      const payload = extractRowPayload(row);
      state.setEditEntryId(payload.entryId);
      state.setDeleteEntryId(payload.entryId);
      if (payload.categoryId) state.setManualCategoryId(payload.categoryId);
      if (payload.language) state.setManualLanguage(payload.language);
      state.setManualDifficulty(payload.difficulty);
      state.setManualStatus(statusOverride ?? payload.status ?? "manual");
      state.setManualContentJson(payload.contentJson);

      try {
        const parsedContent = JSON.parse(payload.contentJson) as unknown;
        if (serviceConfig.service === "microservice-quiz") {
          setQuizDraft(parseQuizManualDraft(parsedContent));
        }
        if (serviceConfig.service === "microservice-wordpass") {
          setWordpassDraft(parseWordpassManualDraft(parsedContent));
        }
      } catch {
        if (serviceConfig.service === "microservice-quiz") {
          setQuizDraft(EMPTY_QUIZ_MANUAL_DRAFT);
        }
        if (serviceConfig.service === "microservice-wordpass") {
          setWordpassDraft(EMPTY_WORDPASS_MANUAL_DRAFT);
        }
      }

      return payload;
    };

    return [
      {
        label: t("service.data.manual.rowEdit"),
        tone: "primary" as const,
        onClick: (row: Record<string, unknown>) => {
          loadIntoEditor(row);
        },
      },
      {
        label: t("service.data.manual.rowPending"),
        tone: "warn" as const,
        onClick: (row: Record<string, unknown>) => {
          const payload = loadIntoEditor(row, "pending_review");
          void state.updateManualEntry(payload.entryId, payload.contentJson, payload.categoryId, payload.language, payload.difficulty, "pending_review");
        },
      },
      {
        label: t("service.data.manual.rowValidate"),
        tone: "success" as const,
        onClick: (row: Record<string, unknown>) => {
          const payload = loadIntoEditor(row, "validated");
          void state.updateManualEntry(payload.entryId, payload.contentJson, payload.categoryId, payload.language, payload.difficulty, "validated");
        },
      },
      {
        label: t("service.data.manual.delete"),
        tone: "neutral" as const,
        onClick: (row: Record<string, unknown>) => {
          const payload = loadIntoEditor(row);
          void state.deleteManualEntry(payload.entryId);
        },
      },
    ];
  }, [isGameHistoryDataset, state, t]);

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
                value={state.refreshMode}
                onChange={(event) => state.setRefreshMode(event.target.value as "manual" | "auto")}
                className={`control-input mt-1 w-full ${refreshInputPadding} ${compact ? "text-xs" : "text-sm"}`}
              >
                <option value="manual">{t("service.refresh.manual")}</option>
                <option value="auto">{t("service.refresh.auto")}</option>
              </select>
            </label>

            <label className={refreshLabelText}>
              {t("service.refresh.intervalLabel")}
              <select
                value={state.refreshIntervalSeconds}
                onChange={(event) => state.setRefreshIntervalSeconds(Number(event.target.value))}
                disabled={state.refreshMode !== "auto"}
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

          {state.refreshMode === "manual" ? (
            <button
              type="button"
              onClick={() => void state.loadOverview()}
              className={`mt-3 w-full rounded-xl bg-[var(--md-sys-color-primary)] ${refreshButtonPadding} ${refreshButtonText} font-semibold text-[var(--md-sys-color-on-primary)] transition-all duration-200 hover:-translate-y-[1px] hover:brightness-105`}
            >
              {state.overviewLoading ? t("service.button.updating") : t("service.button.update")}
            </button>
          ) : (
            <AutoRefreshCountdown
              active={state.refreshMode === "auto"}
              loading={state.overviewLoading}
              intervalSeconds={state.refreshIntervalSeconds}
              cycleVersion={state.refreshCycleVersion}
              compact={compact}
              updatingLabel={t("service.button.updating")}
              getNextSyncLabel={(seconds) => t("service.refresh.nextSync", { seconds })}
            />
          )}
        </div>
      </div>

      {serviceMeta && (
        <div className="ui-surface-soft rounded-xl px-3 py-2 text-xs sm:text-sm">
          <span className="font-semibold">{t("service.meta.service")}:</span> {serviceMeta.title} · <span className="font-semibold">{t("service.domain")}:</span> {serviceMeta.domain} · <span className="font-semibold">{t("service.meta.tabularData")}:</span> {serviceMeta.supportsData ? t("service.meta.yes") : t("service.meta.no")}
        </div>
      )}

      {state.error && <p className="ui-feedback ui-feedback--error">{state.error}</p>}

      <section className="grid min-w-0 gap-3">
        <article className="ui-surface-raised min-w-0 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.metrics.title")}</h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Observabilidad viva: auto refresh permitido porque no toca la capa editorial.</p>
            </div>
            <button type="button" onClick={() => void state.loadOverview()} className="rounded-lg border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-xs font-semibold">
              {state.overviewLoading ? t("service.button.updating") : t("service.button.update")}
            </button>
          </div>
          {state.metricsError ? (
            <p className="ui-feedback ui-feedback--error">{state.metricsError}</p>
          ) : state.metricsRows.length ? (
            <PaginatedFilterableTable rows={state.metricsRows} defaultPageSize={10} density={density} />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--md-sys-color-outline)] px-4 py-3 text-sm">
              <p className="font-medium">{t("service.metrics.none")}</p>
              <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("service.metrics.emptyHint")}</p>
            </div>
          )}
        </article>

        <article className="ui-surface-raised min-w-0 rounded-2xl p-4 space-y-2">
          <div>
            <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.logs.title")}</h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Lectura operativa: comparte ciclo con métricas para no abrir otro temporizador innecesario.</p>
          </div>
          {state.logsError ? (
            <p className="ui-feedback ui-feedback--error">{state.logsError}</p>
          ) : state.logsRows.length ? (
            <PaginatedFilterableTable rows={state.logsRows} defaultPageSize={20} density={density} />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--md-sys-color-outline)] px-4 py-3 text-sm">
              <p className="font-medium">{t("service.logs.none")}</p>
              <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("service.logs.emptyHint")}</p>
            </div>
          )}
        </article>
      </section>

      {serviceConfig.datasets && serviceConfig.datasets.length > 0 && (
        <article className="min-w-0 space-y-3 ui-surface-raised rounded-2xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.data.title")}</h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Explorador paginado: se actualiza por filtros, paginacion o mutaciones, no por cada tick de observabilidad.</p>
            </div>
            <button type="button" onClick={() => void state.loadData()} className="rounded-lg border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-xs font-semibold">
              {state.dataLoading ? t("service.button.updating") : t("service.button.update")}
            </button>
          </div>

          {state.dataset === "processes" && state.followTaskId.trim() && (
            <div className="ui-surface-soft rounded-xl p-3 text-xs sm:text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  {t("service.process.following", { taskId: state.followTaskId.trim() })}
                </p>
                <button
                  type="button"
                  onClick={() => state.setFollowTaskId("")}
                  className="rounded-lg border border-[var(--md-sys-color-outline-variant)] px-2 py-1 text-xs"
                >
                  {t("service.process.following.clear")}
                </button>
              </div>
            </div>
          )}

          <div className={`ui-surface-raised grid gap-2 rounded-xl md:grid-cols-2 2xl:grid-cols-4 ${compact ? "p-2" : "p-3"}`}>
            <label className="text-xs">
              {t("service.filter.dataset")}
              <select
                value={state.dataset}
                onChange={(event) => {
                  state.setDataset(event.target.value as DataDataset);
                  state.setPage(1);
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
                value={state.filter}
                onChange={(event) => state.setFilter(event.target.value)}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.sortBy")}
              <input
                value={state.sortBy}
                onChange={(event) => state.setSortBy(event.target.value)}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
                placeholder={t("service.filter.sortPlaceholder")}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.direction")}
              <select
                value={state.sortDirection}
                onChange={(event) => state.setSortDirection(event.target.value as "asc" | "desc")}
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
                value={state.page}
                onChange={(event) => state.setPage(Number(event.target.value || 1))}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.pageSize")}
              <input
                type="number"
                min={1}
                max={200}
                value={state.pageSize}
                onChange={(event) => state.setPageSize(Number(event.target.value || 20))}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.sourceLimit")}
              <input
                type="number"
                min={1}
                max={1000}
                value={state.limit}
                onChange={(event) => state.setLimit(Number(event.target.value || 200))}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
              />
            </label>

            <label className="text-xs">
              {t("service.filter.userMetric")}
              <select
                value={state.metric}
                onChange={(event) => state.setMetric(event.target.value as "won" | "score" | "played")}
                className={`mt-1 w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] text-sm ${compact ? "px-2 py-1.5" : "px-2 py-2"}`}
                disabled={serviceConfig.service !== "microservice-users" || state.dataset !== "leaderboard"}
              >
                <option value="won">won</option>
                <option value="score">score</option>
                <option value="played">played</option>
              </select>
            </label>
          </div>

          {isGameHistoryDataset && (
            <div className={`ui-surface-soft space-y-3 rounded-xl ${compact ? "p-3" : "p-4"}`}>
              <h4 className="text-sm font-semibold">{t("service.data.manual.title")}</h4>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Edicion puntual: las escrituras refrescan solo el dataset actual para no degradar el resto del panel.</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs">
                  {t("service.data.manual.categoryId")}
                  {state.manualCatalogs.categories.length > 0 ? (
                    <select value={state.manualCategoryId} onChange={(event) => state.setManualCategoryId(event.target.value)} className="control-input mt-1 w-full px-2 py-1.5 text-sm">
                      {state.manualCatalogs.categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={state.manualCategoryId} onChange={(event) => state.setManualCategoryId(event.target.value)} className="control-input mt-1 w-full px-2 py-1.5 text-sm" />
                  )}
                </label>
                <label className="text-xs">
                  {t("service.data.manual.language")}
                  {state.manualCatalogs.languages.length > 0 ? (
                    <select value={state.manualLanguage} onChange={(event) => state.setManualLanguage(event.target.value)} className="control-input mt-1 w-full px-2 py-1.5 text-sm">
                      {state.manualCatalogs.languages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={state.manualLanguage} onChange={(event) => state.setManualLanguage(event.target.value)} className="control-input mt-1 w-full px-2 py-1.5 text-sm" />
                  )}
                </label>
                <label className="text-xs">
                  {t("service.data.manual.difficulty")}
                  <input type="number" min={0} max={100} value={state.manualDifficulty} onChange={(event) => state.setManualDifficulty(Number(event.target.value || 0))} className="control-input mt-1 w-full px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs">
                  {t("service.data.manual.status")}
                  <select value={state.manualStatus} onChange={(event) => state.setManualStatus(event.target.value as "manual" | "validated" | "pending_review")} className="control-input mt-1 w-full px-2 py-1.5 text-sm">
                    <option value="manual">manual</option>
                    <option value="validated">validated</option>
                    <option value="pending_review">pending_review</option>
                  </select>
                </label>
              </div>

              {isQuizHistoryDataset && (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <label className="text-xs md:col-span-2 xl:col-span-3">
                    {t("service.data.manual.quizQuestion")}
                    <input
                      value={quizDraft.question}
                      onChange={(event) => setQuizDraft((current) => ({ ...current, question: event.target.value }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    {t("service.data.manual.quizOptionA")}
                    <input
                      value={quizDraft.optionA}
                      onChange={(event) => setQuizDraft((current) => ({ ...current, optionA: event.target.value }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    {t("service.data.manual.quizOptionB")}
                    <input
                      value={quizDraft.optionB}
                      onChange={(event) => setQuizDraft((current) => ({ ...current, optionB: event.target.value }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    {t("service.data.manual.quizOptionC")}
                    <input
                      value={quizDraft.optionC}
                      onChange={(event) => setQuizDraft((current) => ({ ...current, optionC: event.target.value }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    {t("service.data.manual.quizOptionD")}
                    <input
                      value={quizDraft.optionD}
                      onChange={(event) => setQuizDraft((current) => ({ ...current, optionD: event.target.value }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    {t("service.data.manual.quizCorrectOption")}
                    <select
                      value={quizDraft.correctOption}
                      onChange={(event) => setQuizDraft((current) => ({ ...current, correctOption: event.target.value as "0" | "1" | "2" | "3" }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    >
                      <option value="0">A</option>
                      <option value="1">B</option>
                      <option value="2">C</option>
                      <option value="3">D</option>
                    </select>
                  </label>
                </div>
              )}

              {isWordpassHistoryDataset && (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <label className="text-xs">
                    {t("service.data.manual.wordLetter")}
                    <input
                      value={wordpassDraft.letter}
                      onChange={(event) => setWordpassDraft((current) => ({ ...current, letter: event.target.value }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs xl:col-span-2">
                    {t("service.data.manual.wordHint")}
                    <input
                      value={wordpassDraft.hint}
                      onChange={(event) => setWordpassDraft((current) => ({ ...current, hint: event.target.value }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs md:col-span-2 xl:col-span-3">
                    {t("service.data.manual.wordAnswer")}
                    <input
                      value={wordpassDraft.answer}
                      onChange={(event) => setWordpassDraft((current) => ({ ...current, answer: event.target.value }))}
                      className="control-input mt-1 w-full px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
              )}

              <label className="text-xs">
                {t("service.data.manual.contentJson")}
                <textarea value={state.manualContentJson} onChange={(event) => state.setManualContentJson(event.target.value)} rows={5} className="control-input mt-1 w-full px-2 py-2 text-xs sm:text-sm" />
              </label>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void state.insertManualEntry(state.manualContentJson, state.manualCategoryId, state.manualLanguage, state.manualDifficulty, state.manualStatus)} disabled={state.dataMutationLoading} className="rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-primary)] disabled:cursor-not-allowed disabled:opacity-60">
                  {state.dataMutationLoading ? t("service.button.updating") : t("service.data.manual.insert")}
                </button>
                <label className="min-w-[14rem] flex-1 text-xs">
                  {t("service.data.manual.updateId")}
                  <input value={state.editEntryId} onChange={(event) => state.setEditEntryId(event.target.value)} className="control-input mt-1 w-full px-2 py-1.5 text-sm" placeholder={t("service.data.manual.updatePlaceholder")} />
                </label>
                <button type="button" onClick={() => void state.updateManualEntry(state.editEntryId, state.manualContentJson, state.manualCategoryId, state.manualLanguage, state.manualDifficulty, state.manualStatus)} disabled={state.dataMutationLoading} className="rounded-lg bg-[var(--md-sys-color-secondary)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-secondary)] disabled:cursor-not-allowed disabled:opacity-60">
                  {state.dataMutationLoading ? t("service.button.updating") : t("service.data.manual.update")}
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <label className="text-xs">
                  {t("service.data.manual.deleteId")}
                  <input value={state.deleteEntryId} onChange={(event) => state.setDeleteEntryId(event.target.value)} className="control-input mt-1 w-full px-2 py-1.5 text-sm" placeholder={t("service.data.manual.deletePlaceholder")} />
                </label>
                <button type="button" onClick={() => void state.deleteManualEntry(state.deleteEntryId)} disabled={state.dataMutationLoading} className="self-end rounded-lg bg-[var(--md-sys-color-error)] px-3 py-2 text-sm font-semibold text-[var(--md-sys-color-on-error)] disabled:cursor-not-allowed disabled:opacity-60">
                  {t("service.data.manual.delete")}
                </button>
              </div>

              {state.dataMutationError && <p className="ui-feedback ui-feedback--error p-2 text-xs">{state.dataMutationError}</p>}
              {state.manualCatalogError && <p className="ui-feedback ui-feedback--warn p-2 text-xs">{state.manualCatalogError}</p>}
              {state.dataMutationMessage && <p className="ui-feedback ui-feedback--ok p-2 text-xs">{state.dataMutationMessage}</p>}
            </div>
          )}

          {state.dataError ? (
            <p className="ui-feedback ui-feedback--error">{state.dataError}</p>
          ) : state.dataRows.length ? (
            <PaginatedFilterableTable
              rows={state.dataRows}
              defaultPageSize={10}
              density={density}
              iconOnlyColumns={technicalDialogColumns}
              remoteState={{
                totalRows: state.dataTotal,
                page: state.dataPage,
                pageSize: state.dataPageSize,
              }}
              rowActions={historyRowActions}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--md-sys-color-outline)] px-4 py-3 text-sm">
              <p className="font-medium">{t("service.data.none")}</p>
              <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("service.data.emptyHint")}</p>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
