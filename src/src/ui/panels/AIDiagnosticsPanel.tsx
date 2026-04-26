import { useCallback, useEffect, useRef, useState } from "react";

import type { SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import {
  EDGE_API_BASE,
  fetchJson,
} from "../../infrastructure/http/apiClient";
import { useI18n } from "../../i18n/context";

/** @module AIDiagnosticsPanel - AI diagnostics with RAG coverage stats and hallucination test runner. */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RagStats = {
  total_chunks: number;
  total_chars: number;
  unique_documents: number;
  embedding_dimensions: number;
  avg_chunk_chars: number;
  coverage_level: string;
  coverage_message: string;
  retriever_config: { top_k?: number; min_score?: number };
  sources: Array<{
    source: string;
    chunks: number;
    total_chars: number;
    unique_documents: number;
    avg_chunk_chars: number;
  }>;
};

type TestResult = {
  name: string;
  passed: boolean;
  error?: string;
  details?: Record<string, unknown>;
};

type SuiteResult = {
  suite: string;
  total: number;
  passed: number;
  failed: number;
  tests: TestResult[];
  metrics?: Record<string, number | string | boolean>;
};

type TestRunProgress = {
  total_suites: number;
  completed_suites: number;
  percent: number;
  current_suite?: string | null;
  message?: string | null;
};

type TestRunStatus = {
  status: "idle" | "running" | "completed" | "error" | "already_running";
  started_at?: number;
  finished_at?: number;
  message?: string;
  suites: Record<string, SuiteResult>;
  progress?: TestRunProgress;
  recommendations?: string[];
  performance?: Record<string, Record<string, number | string | boolean>>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
  };
};

type AiEngineTarget = {
  source: "env" | "override";
  label: string | null;
  host: string | null;
  protocol: "http" | "https" | null;
  port: number | null;
  llamaBaseUrl: string | null;
  envLlamaBaseUrl: string | null;
  updatedAt: string | null;
};

type GameGeneratorKey = "quiz" | "wordpass";

type RuntimeDifficultyLevel = "easy" | "medium" | "hard";

type RuntimeGenerationWorkerSnapshot = {
  gameType: "quiz" | "word-pass";
  active: boolean;
  iterationInFlight: boolean;
  intervalSeconds: number;
  activatedAt: string | null;
  lastIterationAt: string | null;
  lastIterationDurationMs: number | null;
  lastIterationCreated: number | null;
  iterationsSinceActivation: number;
  iterationsTotal: number;
  generatedSinceActivation: number;
  totalObjectsInDb: number;
  lastError: string | null;
  config: {
    countPerIteration: number;
    selectedCategoryIds: string[];
    selectedDifficultyLevels: RuntimeDifficultyLevel[];
  };
  available: {
    categories: Array<{ id: string; name: string }>;
    difficultyLevels: Array<{
      id: RuntimeDifficultyLevel;
      label: string;
      min: number;
      max: number;
    }>;
  };
  balance: {
    categories: Array<{ id: string; name: string; total: number; missingToMax: number }>;
    difficulties: Array<{
      id: RuntimeDifficultyLevel;
      label: string;
      total: number;
      missingToMax: number;
    }>;
    mostMissingCategoryId: string | null;
    mostMissingDifficultyLevel: RuntimeDifficultyLevel | null;
  };
};

type RuntimeGenerationWorkerResponse = {
  gameType: "quiz" | "word-pass";
  worker: RuntimeGenerationWorkerSnapshot;
};

type GeneratorUiState = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  snapshot: RuntimeGenerationWorkerSnapshot | null;
  form: {
    countPerIteration: string;
    categoryIds: string[];
    difficultyLevels: RuntimeDifficultyLevel[];
  };
};

type GeneratorUiPatch = Omit<Partial<GeneratorUiState>, "form"> & {
  form?: Partial<GeneratorUiState["form"]>;
};

type AIDiagnosticsPanelProps = {
  context: SessionContext;
  density: UiDensity;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COVERAGE_COLORS: Record<string, string> = {
  empty: "text-[var(--md-sys-color-error)]",
  critical: "text-[var(--md-sys-color-error)]",
  low: "text-orange-500",
  moderate: "text-yellow-600 dark:text-yellow-400",
  good: "text-green-600 dark:text-green-400",
  excellent: "text-green-700 dark:text-green-300",
};

const COVERAGE_BAR: Record<string, number> = {
  empty: 0,
  critical: 10,
  low: 30,
  moderate: 55,
  good: 80,
  excellent: 100,
};

const GENERATOR_SERVICE_BY_GAME: Record<GameGeneratorKey, "microservice-quiz" | "microservice-wordpass"> = {
  quiz: "microservice-quiz",
  wordpass: "microservice-wordpass",
};

function formatDuration(startMs: number, endMs: number): string {
  const diff = (endMs - startMs) / 1000;
  return diff < 1 ? `${Math.round(diff * 1000)}ms` : `${diff.toFixed(1)}s`;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "--";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Panel displaying RAG knowledge-base coverage and an AI hallucination test runner. */
export function AIDiagnosticsPanel({ context, density }: AIDiagnosticsPanelProps) {
  const { t } = useI18n();
  const compact = density === "dense";

  // RAG stats state
  const [ragStats, setRagStats] = useState<RagStats | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState<string | null>(null);

  const [target, setTarget] = useState<AiEngineTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetHost, setTargetHost] = useState("");
  const [targetProtocol, setTargetProtocol] = useState<"http" | "https">("http");
  const [targetPort, setTargetPort] = useState("7002");
  const [targetLabel, setTargetLabel] = useState("");

  const [generatorState, setGeneratorState] = useState<Record<GameGeneratorKey, GeneratorUiState>>({
    quiz: {
      loading: false,
      saving: false,
      error: null,
      snapshot: null,
      form: {
        countPerIteration: "10",
        categoryIds: [],
        difficultyLevels: [],
      },
    },
    wordpass: {
      loading: false,
      saving: false,
      error: null,
      snapshot: null,
      form: {
        countPerIteration: "10",
        categoryIds: [],
        difficultyLevels: [],
      },
    },
  });

  // Test runner state
  const [testStatus, setTestStatus] = useState<TestRunStatus | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlightRef = useRef(false);
  const pollDelayMsRef = useRef(1000);

  const headers = useCallback(() => composeAuthHeaders(context), [context]);

  const syncTargetForm = useCallback((nextTarget: AiEngineTarget) => {
    setTargetHost(nextTarget.host ?? "");
    setTargetProtocol(nextTarget.protocol ?? "http");
    setTargetPort(String(nextTarget.port ?? 7002));
    setTargetLabel(nextTarget.label ?? "");
  }, []);

  const setGeneratorPatch = useCallback(
    (game: GameGeneratorKey, patch: GeneratorUiPatch) => {
    setGeneratorState((current) => ({
      ...current,
      [game]: {
        ...current[game],
        ...patch,
        form: {
          ...current[game].form,
          ...(patch.form ?? {}),
        },
      },
    }));
    },
    []
  );

  const syncGeneratorForm = useCallback((game: GameGeneratorKey, snapshot: RuntimeGenerationWorkerSnapshot) => {
    setGeneratorPatch(game, {
      snapshot,
      error: null,
      form: {
        countPerIteration: String(snapshot.config.countPerIteration),
        categoryIds: snapshot.config.selectedCategoryIds,
        difficultyLevels: snapshot.config.selectedDifficultyLevels,
      },
    });
  }, [setGeneratorPatch]);

  const loadGeneratorStatusForGame = useCallback(async (game: GameGeneratorKey) => {
    const service = GENERATOR_SERVICE_BY_GAME[game];
    setGeneratorPatch(game, { loading: true, error: null });
    try {
      const payload = await fetchJson<RuntimeGenerationWorkerResponse>(
        `${EDGE_API_BASE}/v1/backoffice/services/${service}/generation/worker`,
        { headers: headers() },
      );
      syncGeneratorForm(game, payload.worker);
    } catch (error) {
      setGeneratorPatch(game, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setGeneratorPatch(game, { loading: false });
    }
  }, [headers, setGeneratorPatch, syncGeneratorForm]);

  const loadGeneratorStatus = useCallback(async () => {
    await Promise.all([loadGeneratorStatusForGame("quiz"), loadGeneratorStatusForGame("wordpass")]);
  }, [loadGeneratorStatusForGame]);

  const startGenerator = useCallback(async (game: GameGeneratorKey) => {
    const service = GENERATOR_SERVICE_BY_GAME[game];
    const current = generatorState[game];
    const snapshot = current.snapshot;

    const countPerIteration = Number.parseInt(current.form.countPerIteration, 10);
    const normalizedCount = Number.isFinite(countPerIteration) ? Math.max(1, Math.min(200, countPerIteration)) : 10;

    const availableCategoryIds = snapshot?.available.categories.map((entry) => entry.id) ?? [];
    const availableDifficultyIds = snapshot?.available.difficultyLevels.map((entry) => entry.id) ?? ["easy", "medium", "hard"];

    const selectedCategoryIds = current.form.categoryIds.filter((entry) => availableCategoryIds.includes(entry));
    const selectedDifficultyLevels = current.form.difficultyLevels.filter((entry) => availableDifficultyIds.includes(entry));

    const payload = {
      countPerIteration: normalizedCount,
      ...(selectedCategoryIds.length > 0 && selectedCategoryIds.length < availableCategoryIds.length
        ? { categoryIds: selectedCategoryIds }
        : {}),
      ...(selectedDifficultyLevels.length > 0 && selectedDifficultyLevels.length < availableDifficultyIds.length
        ? { difficultyLevels: selectedDifficultyLevels }
        : {}),
    };

    setGeneratorPatch(game, { saving: true, error: null });
    try {
      const response = await fetchJson<RuntimeGenerationWorkerResponse>(
        `${EDGE_API_BASE}/v1/backoffice/services/${service}/generation/worker/start`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(payload),
        },
      );
      syncGeneratorForm(game, response.worker);
    } catch (error) {
      setGeneratorPatch(game, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setGeneratorPatch(game, { saving: false });
    }
  }, [generatorState, headers, setGeneratorPatch, syncGeneratorForm]);

  const stopGenerator = useCallback(async (game: GameGeneratorKey) => {
    const service = GENERATOR_SERVICE_BY_GAME[game];
    setGeneratorPatch(game, { saving: true, error: null });
    try {
      const response = await fetchJson<RuntimeGenerationWorkerResponse>(
        `${EDGE_API_BASE}/v1/backoffice/services/${service}/generation/worker/stop`,
        {
          method: "POST",
          headers: headers(),
        },
      );
      syncGeneratorForm(game, response.worker);
    } catch (error) {
      setGeneratorPatch(game, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setGeneratorPatch(game, { saving: false });
    }
  }, [headers, setGeneratorPatch, syncGeneratorForm]);

  // ---- RAG stats loader ---------------------------------------------------

  const loadRagStats = useCallback(async () => {
    setRagLoading(true);
    setRagError(null);
    try {
      const data = await fetchJson<RagStats>(
        `${EDGE_API_BASE}/v1/backoffice/ai-diagnostics/rag/stats`,
        { headers: headers() },
      );
      setRagStats(data);
    } catch (err) {
      setRagError(err instanceof Error ? err.message : String(err));
    } finally {
      setRagLoading(false);
    }
  }, [headers]);

  const loadTarget = useCallback(async () => {
    setTargetLoading(true);
    setTargetError(null);
    try {
      const data = await fetchJson<AiEngineTarget>(
        `${EDGE_API_BASE}/v1/backoffice/ai-engine/target`,
        { headers: headers() },
      );
      setTarget(data);
      syncTargetForm(data);
      setTargetError(null);
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : String(err));
    } finally {
      setTargetLoading(false);
    }
  }, [headers, syncTargetForm]);

  useEffect(() => {
    setTargetError(null);
  }, [targetHost, targetLabel, targetPort, targetProtocol]);

  useEffect(() => {
    loadRagStats();
    loadTarget();
    loadGeneratorStatus();
  }, [loadGeneratorStatus, loadRagStats, loadTarget]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadGeneratorStatus();
    }, 10_000);

    return () => {
      clearInterval(timer);
    };
  }, [loadGeneratorStatus]);

  const applyTarget = useCallback(async () => {
    setTargetSaving(true);
    setTargetError(null);
    try {
      const nextTarget = await fetchJson<AiEngineTarget>(
        `${EDGE_API_BASE}/v1/backoffice/ai-engine/target`,
        {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({
            host: targetHost,
            protocol: targetProtocol,
            port: Number(targetPort),
            label: targetLabel,
          }),
        },
      );
      setTarget(nextTarget);
      syncTargetForm(nextTarget);
      setTargetError(null);
      await loadRagStats();
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : String(err));
    } finally {
      setTargetSaving(false);
    }
  }, [headers, loadRagStats, syncTargetForm, targetHost, targetLabel, targetPort, targetProtocol]);

  const resetTarget = useCallback(async () => {
    setTargetSaving(true);
    setTargetError(null);
    try {
      const nextTarget = await fetchJson<AiEngineTarget>(
        `${EDGE_API_BASE}/v1/backoffice/ai-engine/target`,
        {
          method: "DELETE",
          headers: headers(),
        },
      );
      setTarget(nextTarget);
      syncTargetForm(nextTarget);
      setTargetError(null);
      await loadRagStats();
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : String(err));
    } finally {
      setTargetSaving(false);
    }
  }, [headers, loadRagStats, syncTargetForm]);

  // ---- Test runner --------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const scheduleNextPoll = useCallback((delayMs: number, poller: () => Promise<void>) => {
    stopPolling();
    pollRef.current = setTimeout(() => {
      pollRef.current = null;
      void poller();
    }, delayMs);
  }, [stopPolling]);

  const pollTestStatus = useCallback(async () => {
    if (pollInFlightRef.current) {
      return;
    }

    pollInFlightRef.current = true;
    try {
      const data = await fetchJson<TestRunStatus>(
        `${EDGE_API_BASE}/v1/backoffice/ai-diagnostics/tests/status`,
        { headers: headers() },
      );
      setTestStatus(data);
      if (data.status === "completed" || data.status === "error" || data.status === "idle") {
        setTestRunning(false);
        stopPolling();
        pollDelayMsRef.current = 1000;
      } else {
        pollDelayMsRef.current = 1000;
        scheduleNextPoll(pollDelayMsRef.current, pollTestStatus);
      }
    } catch {
      pollDelayMsRef.current = Math.min(pollDelayMsRef.current * 2, 5000);
      scheduleNextPoll(pollDelayMsRef.current, pollTestStatus);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [headers, scheduleNextPoll, stopPolling]);

  const runTests = useCallback(async () => {
    setTestError(null);
    setTestRunning(true);
    setTestStatus(null);
    pollDelayMsRef.current = 1000;
    try {
      await fetchJson<{ status: string }>(
        `${EDGE_API_BASE}/v1/backoffice/ai-diagnostics/tests/run`,
        { method: "POST", headers: headers(), body: JSON.stringify({}) },
      );
      stopPolling();
      await pollTestStatus();
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
      setTestRunning(false);
      stopPolling();
    }
  }, [headers, pollTestStatus, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ---- Render -------------------------------------------------------------

  const coverageLevel = ragStats?.coverage_level ?? "empty";
  const coveragePercent = COVERAGE_BAR[coverageLevel] ?? 0;
  const coverageColor = COVERAGE_COLORS[coverageLevel] ?? "";
  const generatorOrder: GameGeneratorKey[] = ["quiz", "wordpass"];
  const progressPercent = Math.max(
    0,
    Math.min(
      100,
      testStatus?.progress?.percent ?? (testStatus?.status === "completed" ? 100 : 0),
    ),
  );
  const hasRecommendations = Boolean(testStatus?.recommendations && testStatus.recommendations.length > 0);
  const failedChecks = testStatus
    ? Object.values(testStatus.suites)
        .flatMap((suite) => suite.tests.filter((test) => !test.passed).map((test) => ({ suite: suite.suite, test })))
        .slice(0, 4)
    : [];

  return (
    <div className={`grid gap-4 ${compact ? "gap-3" : "gap-5"}`}>
      {/* Header */}
      <div className="m3-card ui-panel-shell ui-summary-band rounded-[1.75rem] p-4">
        <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
          {t("diag.title")}
        </h2>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {t("diag.subtitle")}
        </p>
      </div>

      <div className="m3-card ui-panel-shell rounded-[1.75rem] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("diag.generation.title")}
            </h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {t("diag.generation.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={loadGeneratorStatus}
            disabled={generatorState.quiz.loading || generatorState.wordpass.loading}
            className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
          >
            {(generatorState.quiz.loading || generatorState.wordpass.loading) ? "..." : t("diag.generation.refreshBtn")}
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {generatorOrder.map((game) => {
            const state = generatorState[game];
            const snapshot = state.snapshot;
            const categories = snapshot?.available.categories ?? [];
            const difficultyLevels = snapshot?.available.difficultyLevels ?? [];
            const allCategoriesSelected = categories.length > 0 && state.form.categoryIds.length === categories.length;
            const allDifficultiesSelected =
              difficultyLevels.length > 0 && state.form.difficultyLevels.length === difficultyLevels.length;
            const mostMissingCategory =
              snapshot?.balance.categories.find((entry) => entry.id === snapshot.balance.mostMissingCategoryId)?.name ?? "--";
            const mostMissingDifficulty = snapshot?.balance.mostMissingDifficultyLevel ?? "--";

            return (
              <section key={game} className="ui-panel-block rounded-[1.35rem] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                    {game === "quiz" ? t("diag.generation.quiz") : t("diag.generation.wordpass")}
                  </h4>
                  <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
                    {snapshot?.active ? t("diag.generation.status.active") : t("diag.generation.status.inactive")}
                  </span>
                </div>

                {state.error && (
                  <div className="ui-feedback text-xs text-[var(--md-sys-color-error)]">
                    {t("diag.generation.error")}: {state.error}
                  </div>
                )}

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="ui-control-label text-xs">
                    {t("diag.generation.countPerIteration")}
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={state.form.countPerIteration}
                      onChange={(event) =>
                        setGeneratorPatch(game, {
                          form: {
                            countPerIteration: event.target.value,
                          },
                        })
                      }
                      className="control-input mt-1 w-full"
                    />
                  </label>

                  <div className="ui-panel-block rounded-[1rem] p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                      {t("diag.generation.interval")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface)]">
                      {snapshot ? `${snapshot.intervalSeconds}s` : "--"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="ui-panel-block rounded-[1rem] p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                      {t("diag.generation.categories")}
                    </p>
                    <div className="mt-2 grid gap-1">
                      {categories.length === 0 && (
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">--</p>
                      )}
                      {categories.map((entry) => {
                        const checked = state.form.categoryIds.includes(entry.id);
                        return (
                          <label key={`${game}-cat-${entry.id}`} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? state.form.categoryIds.filter((id) => id !== entry.id)
                                  : [...state.form.categoryIds, entry.id];
                                setGeneratorPatch(game, {
                                  form: {
                                    categoryIds: next,
                                  },
                                });
                              }}
                            />
                            <span className="text-[var(--md-sys-color-on-surface)]">{entry.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {allCategoriesSelected || state.form.categoryIds.length === 0
                        ? t("diag.generation.allSelectedHint")
                        : `${state.form.categoryIds.length}/${categories.length}`}
                    </p>
                  </div>

                  <div className="ui-panel-block rounded-[1rem] p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                      {t("diag.generation.difficulties")}
                    </p>
                    <div className="mt-2 grid gap-1">
                      {difficultyLevels.length === 0 && (
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">--</p>
                      )}
                      {difficultyLevels.map((entry) => {
                        const checked = state.form.difficultyLevels.includes(entry.id);
                        return (
                          <label key={`${game}-difficulty-${entry.id}`} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? state.form.difficultyLevels.filter((id) => id !== entry.id)
                                  : [...state.form.difficultyLevels, entry.id];
                                setGeneratorPatch(game, {
                                  form: {
                                    difficultyLevels: next,
                                  },
                                });
                              }}
                            />
                            <span className="text-[var(--md-sys-color-on-surface)]">
                              {entry.label} ({entry.min}-{entry.max})
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {allDifficultiesSelected || state.form.difficultyLevels.length === 0
                        ? t("diag.generation.allSelectedHint")
                        : `${state.form.difficultyLevels.length}/${difficultyLevels.length}`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void startGenerator(game);
                    }}
                    disabled={state.saving}
                    className="ui-action-pill ui-action-pill--tonal text-xs"
                  >
                    {t("diag.generation.startBtn")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void stopGenerator(game);
                    }}
                    disabled={state.saving}
                    className="ui-action-pill ui-action-pill--quiet text-xs"
                  >
                    {t("diag.generation.stopBtn")}
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <StatCard label={t("diag.generation.lastDuration")} value={snapshot?.lastIterationDurationMs ?? "--"} />
                  <StatCard label={t("diag.generation.iterationsSession")} value={snapshot?.iterationsSinceActivation ?? "--"} />
                  <StatCard label={t("diag.generation.iterationsTotal")} value={snapshot?.iterationsTotal ?? "--"} />
                  <StatCard label={t("diag.generation.generatedSession")} value={snapshot?.generatedSinceActivation ?? "--"} />
                  <StatCard label={t("diag.generation.totalDb")} value={snapshot?.totalObjectsInDb ?? "--"} />
                  <StatCard label={t("diag.generation.inFlight")} value={snapshot?.iterationInFlight ? t("diag.generation.yes") : t("diag.generation.no")} />
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="ui-panel-block rounded-[1rem] p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                      {t("diag.generation.missingCategory")}
                    </p>
                    <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface)]">{mostMissingCategory}</p>
                  </div>
                  <div className="ui-panel-block rounded-[1rem] p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                      {t("diag.generation.missingDifficulty")}
                    </p>
                    <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface)]">{mostMissingDifficulty}</p>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="m3-card ui-panel-shell rounded-[1.75rem] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("diag.target.title")}
            </h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {t("diag.target.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={loadTarget}
            disabled={targetLoading || targetSaving}
            className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
          >
            {targetLoading ? "..." : t("diag.target.refreshBtn")}
          </button>
        </div>

        {targetError && (
          <div className="ui-feedback text-sm text-[var(--md-sys-color-error)]">
            {t("diag.target.error")}: {targetError}
          </div>
        )}

        {target && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t("diag.target.source")}
                value={target.source === "override" ? t("diag.target.source.override") : t("diag.target.source.env")}
              />
              <StatCard label={t("diag.target.host")} value={target.host ?? "--"} />
              <StatCard label={t("diag.target.apiPort")} value={target.port ?? "--"} />
              <StatCard label={t("diag.target.statsPort")} value={target.label ?? "--"} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="ui-panel-block rounded-[1.2rem] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                  {t("diag.target.currentApiUrl")}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-[var(--md-sys-color-on-surface)]">
                  {target.llamaBaseUrl ?? "--"}
                </div>
              </div>
              <div className="ui-panel-block rounded-[1.2rem] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
                  {t("diag.target.currentStatsUrl")}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-[var(--md-sys-color-on-surface)]">
                  {target.envLlamaBaseUrl ?? "--"}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="ui-control-label text-xs">
                {t("diag.target.host")}
                <input
                  value={targetHost}
                  onChange={(event) => setTargetHost(event.target.value)}
                  placeholder="192.168.1.80"
                  className="control-input mt-1 w-full"
                />
              </label>

              <label className="ui-control-label text-xs">
                {t("diag.target.protocol")}
                <select
                  value={targetProtocol}
                  onChange={(event) => setTargetProtocol(event.target.value as "http" | "https")}
                  className="control-input mt-1 w-full"
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </label>

              <label className="ui-control-label text-xs">
                {t("diag.target.apiPort")}
                <input
                  value={targetPort}
                  onChange={(event) => setTargetPort(event.target.value)}
                  inputMode="numeric"
                  className="control-input mt-1 w-full"
                />
              </label>

              <label className="ui-control-label text-xs">
                {t("diag.target.label")}
                <input
                  value={targetLabel}
                  onChange={(event) => setTargetLabel(event.target.value)}
                  placeholder={t("diag.target.labelHint")}
                  className="control-input mt-1 w-full"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={applyTarget}
                disabled={targetSaving || targetHost.trim().length === 0}
                className="ui-action-pill ui-action-pill--tonal text-xs"
              >
                {targetSaving ? t("diag.tests.running") : t("diag.target.applyBtn")}
              </button>
              <button
                type="button"
                onClick={resetTarget}
                disabled={targetSaving}
                className="ui-action-pill ui-action-pill--quiet text-xs"
              >
                {t("diag.target.resetBtn")}
              </button>
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {t("diag.target.updatedAt")}: {formatTimestamp(target.updatedAt)}
              </span>
            </div>

            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {t("diag.target.runtimeOnly")}
            </p>
          </div>
        )}
      </div>

      {/* RAG Meter */}
      <div className="m3-card ui-panel-shell rounded-[1.75rem] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("diag.rag.title")}
            </h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {t("diag.rag.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={loadRagStats}
            disabled={ragLoading}
            className="ui-action-pill ui-action-pill--quiet min-h-0 px-3 py-1.5 text-xs"
          >
            {ragLoading ? "..." : t("diag.rag.refreshBtn")}
          </button>
        </div>

        {ragError && (
          <div className="ui-feedback text-sm text-[var(--md-sys-color-error)]">
            {t("diag.rag.error")}: {ragError}
          </div>
        )}

        {ragStats && (
          <div className="space-y-4">
            {/* Coverage bar */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-sm font-bold capitalize ${coverageColor}`}>
                  {coverageLevel}
                </span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {ragStats.coverage_message}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${coveragePercent}%`,
                    backgroundColor: coveragePercent >= 80
                      ? "var(--md-sys-color-primary)"
                      : coveragePercent >= 50
                        ? "var(--md-sys-color-tertiary)"
                        : "var(--md-sys-color-error)",
                  }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className={`grid gap-3 ${compact ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}>
              <StatCard label={t("diag.rag.totalChunks")} value={ragStats.total_chunks} />
              <StatCard label={t("diag.rag.totalChars")} value={ragStats.total_chars.toLocaleString()} />
              <StatCard label={t("diag.rag.uniqueDocs")} value={ragStats.unique_documents} />
              <StatCard label={t("diag.rag.embeddingDim")} value={ragStats.embedding_dimensions} />
              <StatCard label={t("diag.rag.avgChunkChars")} value={ragStats.avg_chunk_chars} />
            </div>

            {/* Retriever config */}
            {ragStats.retriever_config && (
              <div className="ui-panel-block rounded-[1.1rem] p-2.5">
                <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  {t("diag.rag.retrieverConfig")}:
                </span>
                <span className="ml-2 text-xs font-mono text-[var(--md-sys-color-on-surface)]">
                  top_k={ragStats.retriever_config.top_k ?? "?"}, min_score={ragStats.retriever_config.min_score ?? "?"}
                </span>
              </div>
            )}

            {/* Sources table */}
            {ragStats.sources.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  {t("diag.rag.sources")}
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-left text-[var(--md-sys-color-on-surface-variant)]">
                        <th className="py-1 pr-3 font-medium">Source</th>
                        <th className="py-1 pr-3 font-medium text-right">Chunks</th>
                        <th className="py-1 pr-3 font-medium text-right">Chars</th>
                        <th className="py-1 pr-3 font-medium text-right">Docs</th>
                        <th className="py-1 font-medium text-right">Avg Chunk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ragStats.sources.map((src) => (
                        <tr key={src.source} className="border-b border-[var(--md-sys-color-outline-variant)]/30">
                          <td className="py-1 pr-3 font-mono">{src.source}</td>
                          <td className="py-1 pr-3 text-right">{src.chunks}</td>
                          <td className="py-1 pr-3 text-right">{src.total_chars.toLocaleString()}</td>
                          <td className="py-1 pr-3 text-right">{src.unique_documents}</td>
                          <td className="py-1 text-right">{src.avg_chunk_chars}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!ragStats && !ragLoading && !ragError && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{t("diag.rag.empty")}</p>
        )}
      </div>

      {/* Test Runner */}
      <div className="m3-card ui-panel-shell rounded-[1.75rem] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
              {t("diag.tests.title")}
            </h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {t("diag.tests.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={runTests}
            disabled={testRunning}
            className="ui-action-pill ui-action-pill--tonal min-h-0 px-4 py-1.5 text-xs"
          >
            {testRunning ? t("diag.tests.running") : t("diag.tests.runBtn")}
          </button>
        </div>

        {testError && (
          <div className="ui-feedback text-sm text-[var(--md-sys-color-error)]">
            {t("diag.tests.error")}: {testError}
          </div>
        )}

        {/* Summary bar */}
        {testStatus && testStatus.status !== "idle" && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={testStatus.status} t={t} />
              <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                {t("diag.tests.progress")}: {progressPercent}%
              </span>
              {testStatus.progress?.current_suite && (
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {t("diag.tests.currentSuite")}: {testStatus.progress.current_suite}
                </span>
              )}
              {testStatus.started_at && testStatus.finished_at && (
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {t("diag.tests.duration")}: {formatDuration(testStatus.started_at, testStatus.finished_at)}
                </span>
              )}
              <div className="flex gap-3 text-xs font-semibold">
                <span className="text-green-600 dark:text-green-400">
                  ✓ {testStatus.summary.passed} {t("diag.tests.passed")}
                </span>
                <span className={testStatus.summary.failed > 0 ? "text-[var(--md-sys-color-error)]" : "text-[var(--md-sys-color-on-surface-variant)]"}>
                  ✗ {testStatus.summary.failed} {t("diag.tests.failed")}
                </span>
                <span className="text-[var(--md-sys-color-on-surface-variant)]">
                  Σ {testStatus.summary.total} {t("diag.tests.total")}
                </span>
              </div>
            </div>

            <div className={`grid gap-2 ${compact ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
              <StatCard label={t("diag.tests.passed")} value={testStatus.summary.passed} />
              <StatCard label={t("diag.tests.failed")} value={testStatus.summary.failed} />
              <StatCard label={t("diag.tests.skipped")} value={testStatus.summary.skipped} />
              <StatCard label={t("diag.tests.errors")} value={testStatus.summary.errors} />
            </div>

            {/* Progress bar for running tests */}
            {(testStatus.status === "running" || progressPercent > 0) && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]">
                <div
                  className={`h-full rounded-full bg-[var(--md-sys-color-primary)] ${testStatus.status === "running" ? "transition-all duration-500" : ""}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {testStatus.progress?.message && (
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{testStatus.progress.message}</p>
            )}

            {failedChecks.length > 0 && (
              <div className="rounded-[1.2rem] border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950">
                <p className="font-semibold">{t("diag.tests.failedChecks")}</p>
                <ul className="mt-2 space-y-2">
                  {failedChecks.map(({ suite, test }, index) => (
                    <li key={`${suite}-${test.name}-${index}`} className="rounded-xl border border-rose-200 bg-white/70 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{test.name}</span>
                        <span>{suite}</span>
                      </div>
                      {test.error && <p className="mt-1">{test.error}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Suite results */}
        {testStatus && Object.keys(testStatus.suites).length > 0 && (
          <div className="space-y-2">
            {Object.entries(testStatus.suites).map(([key, suite]) => (
              <SuiteCard key={key} suite={suite} compact={compact} />
            ))}
          </div>
        )}

        {testStatus && testStatus.status !== "idle" && hasRecommendations && (
          <div className="mt-4 ui-panel-block rounded-[1.2rem] p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
              {t("diag.tests.recommendations")}
            </h4>
            <div className="mt-2 grid gap-1.5 text-xs text-[var(--md-sys-color-on-surface)]">
              {testStatus.recommendations!.map((recommendation, index) => (
                <div key={`${recommendation}-${index}`} className="flex items-start gap-2">
                  <span className="mt-0.5 text-[var(--md-sys-color-primary)]">•</span>
                  <span>{recommendation}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!testStatus && !testRunning && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{t("diag.tests.idle")}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ui-metric-tile ui-metric-tile--neutral rounded-[1.2rem] px-3 py-2.5 text-left">
      <div className="ui-metric-label">{label}</div>
      <div className="ui-metric-value mt-3 break-all text-[1.2rem]">{value}</div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const map: Record<string, { klass: string; label: string }> = {
    running: { klass: "ui-status-chip ui-status-chip--neutral", label: t("diag.tests.running") },
    already_running: { klass: "ui-status-chip ui-status-chip--neutral", label: t("diag.tests.running") },
    completed: { klass: "ui-status-chip ui-status-chip--ok", label: t("diag.tests.completed") },
    error: { klass: "ui-status-chip ui-status-chip--error", label: "Error" },
    idle: { klass: "ui-status-chip ui-status-chip--neutral", label: t("diag.tests.idle") },
  };
  const info = map[status] ?? map.idle!;
  return (
    <span className={info.klass}>
      {info.label}
    </span>
  );
}

function SuiteCard({ suite, compact }: { suite: SuiteResult; compact: boolean }) {
  const allPassed = suite.failed === 0;
  return (
    <div className={`ui-panel-block rounded-[1.2rem] p-3 ${allPassed ? "border-[color:var(--ui-state-ok-border)]" : "border-[color:var(--ui-state-error-border)]"}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{suite.suite}</span>
        <span className={`text-xs font-bold ${allPassed ? "text-green-600 dark:text-green-400" : "text-[var(--md-sys-color-error)]"}`}>
          {suite.passed}/{suite.total}
        </span>
      </div>
      <div className={`grid gap-1 ${compact ? "text-[10px]" : "text-xs"}`}>
        {suite.tests.map((test, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className={`mt-0.5 flex-shrink-0 ${test.passed ? "text-green-500" : "text-[var(--md-sys-color-error)]"}`}>
              {test.passed ? "✓" : "✗"}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[var(--md-sys-color-on-surface)]">{test.name}</span>
              {test.error && (
                <span className="ml-1 text-[var(--md-sys-color-error)]">— {test.error}</span>
              )}
              {test.details && (
                <span className="ml-1 font-mono text-[var(--md-sys-color-on-surface-variant)]">
                  {Object.entries(test.details)
                    .map(([k, v]) => `${k}=${typeof v === "number" ? (Number.isInteger(v) ? v : (v as number).toFixed(4)) : JSON.stringify(v)}`)
                    .join(", ")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
