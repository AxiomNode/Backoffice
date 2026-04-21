import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { DataDataset, NavKey, SessionContext, UiDensity } from "../../domain/types/backoffice";
import { useI18n } from "../../i18n/context";
import type { LabelKey } from "../../i18n/labels";
import { AutoRefreshCountdown } from "../components/AutoRefreshCountdown";
import { PaginatedFilterableTable } from "../components/PaginatedFilterableTable";
import { useMaxWidth } from "../hooks/useMaxWidth";
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

type ServiceConsoleSection = "observability" | "data" | "manual";

type CollapsibleSectionProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  actionLabel: string;
  compact: boolean;
  children: ReactNode;
};

function CollapsibleSection({ title, expanded, onToggle, actionLabel, compact, children }: CollapsibleSectionProps) {
  return (
    <section className="ui-panel-block overflow-hidden rounded-[1.35rem]">
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "p-2.5" : "p-3"}`}>
        <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{title}</h4>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
        >
          {actionLabel}
        </button>
      </div>
      {expanded && <div className={`border-t border-[var(--md-sys-color-outline-variant)] ${compact ? "p-2.5" : "p-3"}`}>{children}</div>}
    </section>
  );
}

/** Console panel for an individual service showing metrics, logs, data tables, and manual CRUD. */
export function ServiceConsolePanel({ navKey, context, density }: ServiceConsolePanelProps) {
  const { language, t } = useI18n();
  const compactViewport = useMaxWidth(420);
  const narrowViewport = useMaxWidth(380);
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
  const compactPanel = compact || compactViewport;
  const [quizDraft, setQuizDraft] = useState<QuizManualDraft>(EMPTY_QUIZ_MANUAL_DRAFT);
  const [wordpassDraft, setWordpassDraft] = useState<WordpassManualDraft>(EMPTY_WORDPASS_MANUAL_DRAFT);
  const [activeSection, setActiveSection] = useState<ServiceConsoleSection>("observability");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [inlineManualEditorExpanded, setInlineManualEditorExpanded] = useState(false);
  const [refreshSettingsExpanded, setRefreshSettingsExpanded] = useState(!compactViewport);
  const [contextExpanded, setContextExpanded] = useState(!compactViewport);

  const isQuizHistoryDataset = serviceConfig?.service === "microservice-quiz" && state.dataset === "history";
  const isWordpassHistoryDataset = serviceConfig?.service === "microservice-wordpass" && state.dataset === "history";

  if (!serviceConfig) {
    return <section className="m3-card p-5">{t("service.notFound")}</section>;
  }

  const isGameHistoryDataset = isQuizHistoryDataset || isWordpassHistoryDataset;

  useEffect(() => {
    setActiveSection(isGameHistoryDataset ? "data" : "observability");
  }, [isGameHistoryDataset, navKey]);

  useEffect(() => {
    if (activeSection === "manual" && !isGameHistoryDataset) {
      setActiveSection("data");
    }
  }, [activeSection, isGameHistoryDataset]);

  useEffect(() => {
    setFiltersExpanded(false);
    setInlineManualEditorExpanded(false);
  }, [navKey]);

  useEffect(() => {
    setRefreshSettingsExpanded(!compactViewport);
    setContextExpanded(!compactViewport);
  }, [compactViewport, navKey]);

  useEffect(() => {
    if (!isGameHistoryDataset) {
      setInlineManualEditorExpanded(false);
    }
  }, [isGameHistoryDataset]);

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
  const refreshCardPadding = narrowViewport ? "p-2" : compactPanel ? "p-2.5" : "p-3";
  const refreshLabelText = compactPanel ? "text-[11px]" : "text-xs";
  const refreshInputPadding = narrowViewport ? "px-2 py-1 text-xs" : compactPanel ? "px-2 py-1" : "px-2 py-1.5";
  const refreshButtonPadding = narrowViewport ? "px-3 py-1.5" : compactPanel ? "px-3 py-2" : "px-4 py-2.5";
  const refreshButtonText = compactPanel ? "text-xs" : "text-sm";
  const compactActionClass = compactPanel ? `min-h-0 ${narrowViewport ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-1.5 text-xs"}` : "text-sm";
  const controlClass = `control-input mt-1 w-full ${compactPanel ? "px-2 py-1.5 text-sm" : "px-2 py-2 text-sm"}`;
  const contextGridClass = compactViewport ? "grid-cols-2" : compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
  const panelPaddingClass = narrowViewport ? "p-3 space-y-3" : compactPanel ? "p-3.5 space-y-3" : compact ? "p-3 sm:p-4 xl:p-5 space-y-3" : "p-4 sm:p-5 xl:p-6 space-y-4 xl:space-y-5";

  const serviceMeta = state.catalog.find((item) => item.key === serviceConfig.service);
  const hasDataSection = (serviceMeta ? serviceMeta.supportsData : Boolean(serviceConfig.datasets?.length)) && Boolean(serviceConfig.datasets?.length);
  const syncTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [language],
  );
  const formatSyncTime = (value: number | null) => (value ? syncTimeFormatter.format(value) : "--");
  const serviceContextCards = [
    {
      label: t("service.meta.service"),
      value: serviceMeta?.title ?? serviceTitle,
      detail: serviceConfig.service,
      tone: "neutral" as const,
    },
    {
      label: t("service.domain"),
      value: serviceMeta?.domain ?? "--",
      detail: serviceSubtitle,
      tone: "neutral" as const,
    },
    {
      label: t("service.meta.tabularData"),
      value: serviceMeta?.supportsData ? t("service.meta.yes") : t("service.meta.no"),
      detail: hasDataSection ? t("service.section.data") : t("service.section.observability"),
      tone: serviceMeta?.supportsData ? "ok" as const : "neutral" as const,
    },
    {
      label: t("service.refresh.modeLabel"),
      value: state.refreshMode === "auto" ? t("service.refresh.auto") : t("service.refresh.manual"),
      detail:
        state.refreshMode === "auto"
          ? t("service.refresh.nextSync", { seconds: state.refreshIntervalSeconds })
          : t("service.button.update"),
      tone: state.refreshMode === "auto" ? "ok" as const : "neutral" as const,
    },
    {
      label: t("service.section.observability"),
      value: formatSyncTime(state.lastOverviewSyncAt),
      detail: t("overview.metric.lastUpdate"),
      tone: state.lastOverviewSyncAt ? "ok" as const : "neutral" as const,
    },
    ...(hasDataSection
      ? [
          {
            label: t("service.filter.dataset"),
            value: localizedDatasetLabel(state.dataset, state.dataset),
            detail: `${state.dataRows.length}/${Math.max(state.dataTotal, state.dataRows.length)}`,
            tone: "neutral" as const,
          },
          {
            label: t("service.data.title"),
            value: formatSyncTime(state.lastDataSyncAt),
            detail: t("overview.metric.lastUpdate"),
            tone: state.lastDataSyncAt ? "ok" as const : "neutral" as const,
          },
        ]
      : []),
  ];
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

  const routeMetricsRows = useMemo(() => {
    return state.metricsRows.flatMap((row) => {
      const requestsByRoute = Array.isArray(row.requestsByRoute) ? row.requestsByRoute : [];
      return requestsByRoute
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
        .map((entry) => ({
          service: serviceConfig.service,
          method: entry.method ?? "--",
          route: entry.route ?? "--",
          statusCode: entry.statusCode ?? "--",
          total: entry.total ?? 0,
        }));
    });
  }, [serviceConfig.service, state.metricsRows]);

  const renderManualEditorFields = () => (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
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
        <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
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
        <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {t("service.data.manual.difficulty")}
          <input type="number" min={0} max={100} value={state.manualDifficulty} onChange={(event) => state.setManualDifficulty(Number(event.target.value || 0))} className="control-input mt-1 w-full px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
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
          <label className="text-sm text-[var(--md-sys-color-on-surface-variant)] md:col-span-2 xl:col-span-3">
            {t("service.data.manual.quizQuestion")}
            <input
              value={quizDraft.question}
              onChange={(event) => setQuizDraft((current) => ({ ...current, question: event.target.value }))}
              className="control-input mt-1 w-full px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {t("service.data.manual.quizOptionA")}
            <input
              value={quizDraft.optionA}
              onChange={(event) => setQuizDraft((current) => ({ ...current, optionA: event.target.value }))}
              className="control-input mt-1 w-full px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {t("service.data.manual.quizOptionB")}
            <input
              value={quizDraft.optionB}
              onChange={(event) => setQuizDraft((current) => ({ ...current, optionB: event.target.value }))}
              className="control-input mt-1 w-full px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {t("service.data.manual.quizOptionC")}
            <input
              value={quizDraft.optionC}
              onChange={(event) => setQuizDraft((current) => ({ ...current, optionC: event.target.value }))}
              className="control-input mt-1 w-full px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {t("service.data.manual.quizOptionD")}
            <input
              value={quizDraft.optionD}
              onChange={(event) => setQuizDraft((current) => ({ ...current, optionD: event.target.value }))}
              className="control-input mt-1 w-full px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
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
          <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {t("service.data.manual.wordLetter")}
            <input
              value={wordpassDraft.letter}
              onChange={(event) => setWordpassDraft((current) => ({ ...current, letter: event.target.value }))}
              className="control-input mt-1 w-full px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm xl:col-span-2">
            {t("service.data.manual.wordHint")}
            <input
              value={wordpassDraft.hint}
              onChange={(event) => setWordpassDraft((current) => ({ ...current, hint: event.target.value }))}
              className="control-input mt-1 w-full px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm md:col-span-2 xl:col-span-3">
            {t("service.data.manual.wordAnswer")}
            <input
              value={wordpassDraft.answer}
              onChange={(event) => setWordpassDraft((current) => ({ ...current, answer: event.target.value }))}
              className="control-input mt-1 w-full px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}

      <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        {t("service.data.manual.contentJson")}
        <textarea value={state.manualContentJson} onChange={(event) => state.setManualContentJson(event.target.value)} rows={5} className="control-input mt-1 w-full px-2 py-2 text-sm" />
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void state.insertManualEntry(state.manualContentJson, state.manualCategoryId, state.manualLanguage, state.manualDifficulty, state.manualStatus)} disabled={state.dataMutationLoading} className="ui-action-pill ui-action-pill--primary text-sm">
          {state.dataMutationLoading ? t("service.button.updating") : t("service.data.manual.insert")}
        </button>
        <label className="min-w-[14rem] flex-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {t("service.data.manual.updateId")}
          <input value={state.editEntryId} onChange={(event) => state.setEditEntryId(event.target.value)} className="control-input mt-1 w-full px-2 py-1.5 text-sm" placeholder={t("service.data.manual.updatePlaceholder")} />
        </label>
        <button type="button" onClick={() => void state.updateManualEntry(state.editEntryId, state.manualContentJson, state.manualCategoryId, state.manualLanguage, state.manualDifficulty, state.manualStatus)} disabled={state.dataMutationLoading} className="ui-action-pill ui-action-pill--tonal text-sm">
          {state.dataMutationLoading ? t("service.button.updating") : t("service.data.manual.update")}
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {t("service.data.manual.deleteId")}
          <input value={state.deleteEntryId} onChange={(event) => state.setDeleteEntryId(event.target.value)} className="control-input mt-1 w-full px-2 py-1.5 text-sm" placeholder={t("service.data.manual.deletePlaceholder")} />
        </label>
        <button type="button" onClick={() => void state.deleteManualEntry(state.deleteEntryId)} disabled={state.dataMutationLoading} className="ui-action-pill self-end text-sm">
          {t("service.data.manual.delete")}
        </button>
      </div>

      {state.dataMutationError && <p className="ui-feedback ui-feedback--error p-2 text-sm">{state.dataMutationError}</p>}
      {state.manualCatalogError && <p className="ui-feedback ui-feedback--warn p-2 text-sm">{state.manualCatalogError}</p>}
      {state.dataMutationMessage && <p className="ui-feedback ui-feedback--ok p-2 text-sm">{state.dataMutationMessage}</p>}
    </div>
  );

  useEffect(() => {
    setActiveSection(isGameHistoryDataset && hasDataSection ? "data" : "observability");
  }, [hasDataSection, isGameHistoryDataset, navKey]);

  useEffect(() => {
    if (activeSection === "manual" && !isGameHistoryDataset) {
      setActiveSection(hasDataSection ? "data" : "observability");
      return;
    }

    if (activeSection === "data" && !hasDataSection) {
      setActiveSection("observability");
    }
  }, [activeSection, hasDataSection, isGameHistoryDataset]);

  const sectionOptions: Array<{ key: ServiceConsoleSection; label: string; visible: boolean }> = [
    { key: "observability", label: t("service.section.observability"), visible: true },
    { key: "data", label: t("service.section.data"), visible: hasDataSection },
    { key: "manual", label: t("service.section.manual"), visible: isGameHistoryDataset },
  ];

  const visibleSections = sectionOptions.filter((section) => section.visible);

  return (
    <section className={`m3-card ui-panel-shell ui-fade-in ${panelPaddingClass}`}>
      <div className={`ui-summary-band rounded-[1.6rem] ${compactViewport ? "p-3" : compactPanel ? "p-3.5" : "p-4"}`}>
        <div className={`flex flex-wrap items-start justify-between ${compactViewport ? "gap-2.5" : "gap-3"}`}>
        <div>
          <h2 className={`m3-title ${narrowViewport ? "text-base" : compactPanel ? "text-[17px] sm:text-lg" : compact ? "text-base sm:text-lg xl:text-xl" : "text-lg sm:text-xl xl:text-2xl"}`}>{serviceTitle}</h2>
          <p className={`${narrowViewport ? "text-[11px] leading-4" : compactViewport ? "text-xs leading-5" : "text-xs sm:text-sm xl:text-base"} text-[var(--md-sys-color-on-surface-variant)]`}>
            {serviceSubtitle}
            {serviceMeta ? ` · ${t("service.domain")}: ${serviceMeta.domain}` : ""}
          </p>
        </div>
        <div className={`ui-panel-block w-full rounded-[1.35rem] ${compactViewport ? "max-w-none" : "max-w-sm"} ${refreshCardPadding}`}>
          {compactViewport && (
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--md-sys-color-on-surface-variant)]">{t("service.section.refreshSettings")}</p>
                <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {state.refreshMode === "auto" ? t("service.refresh.nextSync", { seconds: state.refreshIntervalSeconds }) : t("service.button.update")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefreshSettingsExpanded((current) => !current)}
                aria-expanded={refreshSettingsExpanded}
                className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
              >
                {refreshSettingsExpanded ? t("service.section.hide") : t("service.section.show")}
              </button>
            </div>
          )}

          {(!compactViewport || refreshSettingsExpanded) && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`${refreshLabelText} text-[var(--md-sys-color-on-surface-variant)]`}>
              {t("service.refresh.modeLabel")}
              <select
                value={state.refreshMode}
                onChange={(event) => state.setRefreshMode(event.target.value as "manual" | "auto")}
                className={`control-input mt-1 w-full ${refreshInputPadding} ${compactPanel ? "text-xs" : "text-sm"}`}
              >
                <option value="manual">{t("service.refresh.manual")}</option>
                <option value="auto">{t("service.refresh.auto")}</option>
              </select>
            </label>

            <label className={`${refreshLabelText} text-[var(--md-sys-color-on-surface-variant)]`}>
              {t("service.refresh.intervalLabel")}
              <select
                value={state.refreshIntervalSeconds}
                onChange={(event) => state.setRefreshIntervalSeconds(Number(event.target.value))}
                disabled={state.refreshMode !== "auto"}
                className={`control-input mt-1 w-full ${refreshInputPadding} ${compactPanel ? "text-xs" : "text-sm"} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {intervalOptions.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {t("service.refresh.intervalOption", { seconds })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          )}

          {state.refreshMode === "manual" ? (
            <button
              type="button"
              onClick={() => void state.loadOverview()}
              className={`ui-action-pill ui-action-pill--primary mt-3 w-full justify-center ${refreshButtonPadding} ${refreshButtonText}`}
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
      </div>

      <div className="space-y-2">
        {compactViewport && (
          <div className="ui-panel-block rounded-[1.35rem] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--md-sys-color-on-surface-variant)]">{t("service.section.quickContext")}</p>
                <p className="mt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{serviceMeta?.title ?? serviceTitle} · {serviceMeta?.domain ?? "--"}</p>
              </div>
              <button
                type="button"
                onClick={() => setContextExpanded((current) => !current)}
                aria-expanded={contextExpanded}
                className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
              >
                {contextExpanded ? t("service.section.hide") : t("service.section.show")}
              </button>
            </div>
          </div>
        )}

        {(!compactViewport || contextExpanded) && (
        <div className={`grid gap-2 ${contextGridClass}`}>
          {serviceContextCards.map((card) => (
            <article key={`${card.label}-${card.detail}`} className={`ui-metric-tile ui-metric-tile--${card.tone === "ok" ? "ok" : "neutral"} min-w-0 rounded-[1.25rem] ${narrowViewport ? "p-2.5" : compactViewport ? "p-2.5" : "p-3"}`}>
              <p className={`${narrowViewport ? "text-[10px] tracking-[0.12em]" : "text-[11px] tracking-[0.16em]"} font-semibold uppercase text-[var(--md-sys-color-on-surface-variant)]`}>{card.label}</p>
              <div className={`mt-2 flex flex-wrap items-center ${narrowViewport ? "gap-1.5" : "gap-2"}`}>
                <span
                  className={`ui-status-chip ${
                    card.tone === "ok"
                      ? "ui-status-chip--ok"
                      : "ui-status-chip--neutral"
                  }`}
                >
                  {card.value}
                </span>
              </div>
              <p className={`${narrowViewport ? "mt-1.5 text-[11px] leading-4" : "mt-2 text-xs"} truncate text-[var(--md-sys-color-on-surface-variant)]`}>{card.detail}</p>
            </article>
          ))}
        </div>
        )}
      </div>

      {state.error && <p className="ui-feedback ui-feedback--error">{state.error}</p>}

      <div className={`ui-panel-block rounded-[1.5rem] ${compactViewport ? "p-1.5" : "p-2"}`}>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("service.section.navigation")}>
          {visibleSections.map((section) => {
            const isActive = activeSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveSection(section.key)}
                className={`${isActive ? "ui-action-pill ui-action-pill--tonal" : "ui-action-pill ui-action-pill--quiet"} ${compactActionClass} transition ${
                  isActive
                    ? "shadow-sm"
                    : ""
                }`}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeSection === "observability" && (
        <section className={`grid min-w-0 ${compactViewport ? "gap-2.5" : "gap-3"}`} aria-label={t("service.section.observability")}>
          <article className={`ui-table-shell min-w-0 rounded-[1.75rem] ${compactViewport ? "p-3" : "p-4"} space-y-2`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.metrics.title")}</h3>
              </div>
            </div>
            {state.metricsError ? (
              <p className="ui-feedback ui-feedback--error">{state.metricsError}</p>
            ) : state.metricsRows.length ? (
              <div className="space-y-3">
                <PaginatedFilterableTable
                  rows={state.metricsRows}
                  defaultPageSize={5}
                  density={density}
                  collapsibleControls
                  controlsInitiallyExpanded={!compactViewport}
                />
                {routeMetricsRows.length > 0 && (
                  <PaginatedFilterableTable
                    rows={routeMetricsRows}
                    defaultPageSize={5}
                    defaultSortDirection="desc"
                    density={density}
                    collapsibleControls
                    controlsInitiallyExpanded={false}
                  />
                )}
              </div>
            ) : (
              <div className="ui-subtle-card rounded-2xl border border-dashed px-4 py-3 text-sm">
                <p className="font-medium">{t("service.metrics.none")}</p>
                <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("service.metrics.emptyHint")}</p>
              </div>
            )}
          </article>

          <article className={`ui-table-shell min-w-0 rounded-[1.75rem] ${compactViewport ? "p-3" : "p-4"} space-y-2`}>
            <div>
              <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.logs.title")}</h3>
            </div>
            {state.logsError ? (
              <p className="ui-feedback ui-feedback--error">{state.logsError}</p>
            ) : state.logsRows.length ? (
              <PaginatedFilterableTable
                rows={state.logsRows}
                defaultPageSize={5}
                defaultSortDirection="desc"
                density={density}
                collapsibleControls
                controlsInitiallyExpanded={!compactViewport}
              />
            ) : (
              <div className="ui-subtle-card rounded-2xl border border-dashed px-4 py-3 text-sm">
                <p className="font-medium">{t("service.logs.none")}</p>
                <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("service.logs.emptyHint")}</p>
              </div>
            )}
          </article>
        </section>
      )}

      {activeSection === "data" && hasDataSection && serviceConfig.datasets && serviceConfig.datasets.length > 0 && (
        <article className={`ui-table-shell min-w-0 space-y-3 rounded-[1.75rem] ${compactViewport ? "p-3" : "p-4"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.data.title")}</h3>
            </div>
            <button type="button" onClick={() => void state.loadData()} className={`ui-action-pill ui-action-pill--quiet ${compactActionClass}`}>
              {state.dataLoading ? t("service.button.updating") : t("service.button.update")}
            </button>
          </div>

          <CollapsibleSection
            title={t("service.section.advancedFilters")}
            expanded={filtersExpanded}
            onToggle={() => setFiltersExpanded((currentValue) => !currentValue)}
            actionLabel={filtersExpanded ? t("service.section.hide") : t("service.section.show")}
            compact={compact}
          >
            <div className="space-y-3">
              {state.dataset === "processes" && state.followTaskId.trim() && (
                <div className="ui-subtle-card rounded-2xl p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      {t("service.process.following", { taskId: state.followTaskId.trim() })}
                    </p>
                    <button
                      type="button"
                      onClick={() => state.setFollowTaskId("")}
                      className="ui-action-pill ui-action-pill--quiet min-h-0 px-2.5 py-1 text-xs"
                    >
                      {t("service.process.following.clear")}
                    </button>
                  </div>
                </div>
              )}

              <div className={`ui-subtle-card grid gap-2 rounded-2xl md:grid-cols-2 2xl:grid-cols-4 ${compact ? "p-2" : "p-3"}`}>
            <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {t("service.filter.dataset")}
              <select
                value={state.dataset}
                onChange={(event) => {
                  state.setDataset(event.target.value as DataDataset);
                  state.setPage(1);
                }}
                className={controlClass}
              >
                {serviceConfig.datasets.map((item) => (
                  <option key={item.value} value={item.value}>
                    {localizedDatasetLabel(item.value, item.label)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {t("service.filter.filter")}
              <input
                value={state.filter}
                onChange={(event) => state.setFilter(event.target.value)}
                className={controlClass}
              />
            </label>

            <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {t("service.filter.sortBy")}
              <input
                value={state.sortBy}
                onChange={(event) => state.setSortBy(event.target.value)}
                className={controlClass}
                placeholder={t("service.filter.sortPlaceholder")}
              />
            </label>

            <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {t("service.filter.direction")}
              <select
                value={state.sortDirection}
                onChange={(event) => state.setSortDirection(event.target.value as "asc" | "desc")}
                className={controlClass}
              >
                <option value="asc">{t("service.filter.sortAscShort")}</option>
                <option value="desc">{t("service.filter.sortDescShort")}</option>
              </select>
            </label>

            <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {t("service.filter.page")}
              <input
                type="number"
                min={1}
                value={state.page}
                onChange={(event) => state.setPage(Number(event.target.value || 1))}
                className={controlClass}
              />
            </label>

            <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {t("service.filter.pageSize")}
              <input
                type="number"
                min={1}
                max={200}
                value={state.pageSize}
                onChange={(event) => state.setPageSize(Number(event.target.value || 5))}
                className={controlClass}
              />
            </label>

            <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {t("service.filter.sourceLimit")}
              <input
                type="number"
                min={1}
                max={1000}
                value={state.limit}
                onChange={(event) => state.setLimit(Number(event.target.value || 200))}
                className={controlClass}
              />
            </label>

            <label className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {t("service.filter.userMetric")}
              <select
                value={state.metric}
                onChange={(event) => state.setMetric(event.target.value as "won" | "score" | "played")}
                className={controlClass}
                disabled={serviceConfig.service !== "microservice-users" || state.dataset !== "leaderboard"}
              >
                <option value="won">won</option>
                <option value="score">score</option>
                <option value="played">played</option>
              </select>
            </label>
              </div>
            </div>
          </CollapsibleSection>

          {isGameHistoryDataset && (
            <CollapsibleSection
              title={t("service.data.manual.title")}
              expanded={inlineManualEditorExpanded}
              onToggle={() => setInlineManualEditorExpanded((currentValue) => !currentValue)}
              actionLabel={inlineManualEditorExpanded ? t("service.section.hide") : t("service.section.show")}
              compact={compact}
            >
              {renderManualEditorFields()}
            </CollapsibleSection>
          )}

          {state.dataError ? (
            <p className="ui-feedback ui-feedback--error">{state.dataError}</p>
          ) : state.dataRows.length ? (
            <PaginatedFilterableTable
              rows={state.dataRows}
              defaultPageSize={5}
              density={density}
              iconOnlyColumns={technicalDialogColumns}
              remoteState={{
                totalRows: state.dataTotal,
                page: state.dataPage,
                pageSize: state.dataPageSize,
                onPageChange: (nextPage) => state.setPage(nextPage),
                onPageSizeChange: (nextPageSize) => {
                  state.setPage(1);
                  state.setPageSize(nextPageSize);
                },
              }}
              rowActions={historyRowActions}
            />
          ) : (
            <div className="ui-subtle-card rounded-2xl border border-dashed px-4 py-3 text-sm">
              <p className="font-medium">{t("service.data.none")}</p>
              <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">{t("service.data.emptyHint")}</p>
            </div>
          )}
        </article>
      )}

      {activeSection === "manual" && isGameHistoryDataset && (
        <article className={`ui-table-shell min-w-0 space-y-3 rounded-[1.75rem] ${compactViewport ? "p-3" : "p-4"}`} aria-label={t("service.section.manual")}>
          <div>
            <h3 className={`m3-title ${compact ? "text-base" : "text-lg"}`}>{t("service.data.manual.title")}</h3>
          </div>

          <div className={`ui-subtle-card rounded-2xl ${compact ? "p-3" : "p-4"}`}>
            {renderManualEditorFields()}
          </div>
        </article>
      )}
    </section>
  );
}
