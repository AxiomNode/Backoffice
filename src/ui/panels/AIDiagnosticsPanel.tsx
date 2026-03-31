import { useCallback, useEffect, useRef, useState } from "react";

import type { SessionContext, UiDensity } from "../../domain/types/backoffice";
import { composeAuthHeaders } from "../../infrastructure/backoffice/authHeaders";
import { EDGE_API_BASE, fetchJson } from "../../infrastructure/http/apiClient";
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
};

type TestRunStatus = {
  status: "idle" | "running" | "completed" | "error" | "already_running";
  started_at?: number;
  finished_at?: number;
  message?: string;
  suites: Record<string, SuiteResult>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
  };
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

function formatDuration(startMs: number, endMs: number): string {
  const diff = (endMs - startMs) / 1000;
  return diff < 1 ? `${Math.round(diff * 1000)}ms` : `${diff.toFixed(1)}s`;
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

  // Test runner state
  const [testStatus, setTestStatus] = useState<TestRunStatus | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = useCallback(() => composeAuthHeaders(context), [context]);

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

  useEffect(() => {
    loadRagStats();
  }, [loadRagStats]);

  // ---- Test runner --------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollTestStatus = useCallback(async () => {
    try {
      const data = await fetchJson<TestRunStatus>(
        `${EDGE_API_BASE}/v1/backoffice/ai-diagnostics/tests/status`,
        { headers: headers() },
      );
      setTestStatus(data);
      if (data.status === "completed" || data.status === "error" || data.status === "idle") {
        setTestRunning(false);
        stopPolling();
      }
    } catch {
      // Keep polling — transient error
    }
  }, [headers, stopPolling]);

  const runTests = useCallback(async () => {
    setTestError(null);
    setTestRunning(true);
    setTestStatus(null);
    try {
      await fetchJson<{ status: string }>(
        `${EDGE_API_BASE}/v1/backoffice/ai-diagnostics/tests/run`,
        { method: "POST", headers: headers() },
      );
      // Start polling for results
      stopPolling();
      pollRef.current = setInterval(pollTestStatus, 1000);
      // Also poll immediately
      await pollTestStatus();
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
      setTestRunning(false);
    }
  }, [headers, pollTestStatus, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ---- Render -------------------------------------------------------------

  const coverageLevel = ragStats?.coverage_level ?? "empty";
  const coveragePercent = COVERAGE_BAR[coverageLevel] ?? 0;
  const coverageColor = COVERAGE_COLORS[coverageLevel] ?? "";

  return (
    <div className={`grid gap-4 ${compact ? "gap-3" : "gap-5"}`}>
      {/* Header */}
      <div className="m3-card ui-surface-raised p-4">
        <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
          {t("diag.title")}
        </h2>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {t("diag.subtitle")}
        </p>
      </div>

      {/* RAG Meter */}
      <div className="m3-card ui-surface-raised p-4">
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
            className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-50"
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
              <div className="rounded border border-[var(--md-sys-color-outline-variant)] p-2">
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
      <div className="m3-card ui-surface-raised p-4">
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
            className="rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-primary-container)] px-4 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-primary-container)] transition hover:opacity-90 disabled:opacity-50"
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

            {/* Progress bar for running tests */}
            {testStatus.status === "running" && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container)]">
                <div className="h-full animate-pulse rounded-full bg-[var(--md-sys-color-primary)]" style={{ width: "60%" }} />
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
    <div className="rounded border border-[var(--md-sys-color-outline-variant)] p-2 text-center">
      <div className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">{value}</div>
      <div className="text-[10px] leading-tight text-[var(--md-sys-color-on-surface-variant)]">{label}</div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const map: Record<string, { bg: string; label: string }> = {
    running: { bg: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", label: t("diag.tests.running") },
    completed: { bg: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", label: t("diag.tests.completed") },
    error: { bg: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", label: "Error" },
    idle: { bg: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200", label: t("diag.tests.idle") },
  };
  const info = map[status] ?? map.idle!;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${info.bg}`}>
      {info.label}
    </span>
  );
}

function SuiteCard({ suite, compact }: { suite: SuiteResult; compact: boolean }) {
  const allPassed = suite.failed === 0;
  return (
    <div className={`rounded border p-3 ${allPassed ? "border-green-300 dark:border-green-800" : "border-[var(--md-sys-color-error)]/50"}`}>
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
