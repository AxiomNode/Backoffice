import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { SessionContext } from "../domain/types/backoffice";
import { AIDiagnosticsPanel } from "../ui/panels/AIDiagnosticsPanel";

const fetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/http/apiClient", () => ({
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
}));

const context: SessionContext = {
  mode: "dev",
  devUid: "uid-test",
};

type TestRunStatusStub = {
  status: "idle" | "running" | "completed" | "error" | "already_running";
  started_at?: number;
  finished_at?: number;
  suites: Record<string, unknown>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
  };
};

function buildWorkerSnapshot(gameType: "quiz" | "word-pass") {
  return {
    gameType,
    active: false,
    iterationInFlight: false,
    intervalSeconds: 60,
    activatedAt: null,
    lastIterationAt: null,
    lastIterationDurationMs: null,
    lastIterationCreated: null,
    iterationsSinceActivation: 0,
    iterationsTotal: 0,
    generatedSinceActivation: 0,
    totalObjectsInDb: 0,
    lastError: null,
    config: {
      countPerIteration: 10,
      selectedCategoryIds: [],
      selectedDifficultyLevels: ["easy", "medium", "hard"],
    },
    available: {
      categories: [
        { id: "cat-1", name: "General" },
        { id: "cat-2", name: "Science" },
      ],
      difficultyLevels: [
        { id: "easy", label: "easy", min: 0, max: 33 },
        { id: "medium", label: "medium", min: 34, max: 66 },
        { id: "hard", label: "hard", min: 67, max: 100 },
      ],
    },
    balance: {
      categories: [
        { id: "cat-1", name: "General", total: 0, missingToMax: 5 },
        { id: "cat-2", name: "Science", total: 0, missingToMax: 5 },
      ],
      difficulties: [
        { id: "easy", label: "easy", total: 0, missingToMax: 5 },
        { id: "medium", label: "medium", total: 0, missingToMax: 5 },
        { id: "hard", label: "hard", total: 0, missingToMax: 5 },
      ],
      mostMissingCategoryId: "cat-1",
      mostMissingDifficultyLevel: "easy",
    },
  };
}

function renderPanel(density: "comfortable" | "dense" = "comfortable") {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <AIDiagnosticsPanel context={context} density={density} />
    </I18nProvider>,
  );
}

describe("AIDiagnosticsPanel integration", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.resolve({
          total_chunks: 10,
          total_chars: 2000,
          unique_documents: 3,
          embedding_dimensions: 384,
          avg_chunk_chars: 200,
          coverage_level: "good",
          coverage_message: "ok",
          retriever_config: { top_k: 4, min_score: 0.25 },
          sources: [],
        });
      }

      if (url.includes("/v1/backoffice/services/microservice-quiz/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "quiz", worker: buildWorkerSnapshot("quiz") });
      }

      if (url.includes("/v1/backoffice/services/microservice-wordpass/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "word-pass", worker: buildWorkerSnapshot("word-pass") });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "env",
          label: null,
          host: "localhost",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://localhost:7002/v1/completions",
          envLlamaBaseUrl: "http://localhost:7002/v1/completions",
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "PUT") {
        return Promise.resolve({
          source: "override",
          label: "workstation gpu",
          host: "192.168.1.80",
          protocol: "http",
          port: 17002,
          llamaBaseUrl: "http://192.168.1.80:17002/v1/completions",
          envLlamaBaseUrl: "http://localhost:7002/v1/completions",
          updatedAt: "2026-04-18T17:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "DELETE") {
        return Promise.resolve({
          source: "env",
          label: null,
          host: "localhost",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://localhost:7002/v1/completions",
          envLlamaBaseUrl: "http://localhost:7002/v1/completions",
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/status")) {
        return Promise.resolve({
          status: "idle",
          suites: {},
          summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0 },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and updates the ai-engine runtime target", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getAllByText("http://localhost:7002/v1/completions").length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue("localhost")).toBeInTheDocument();
      expect(screen.queryByText("Backoffice Connection")).not.toBeInTheDocument();
      expect(screen.queryByText("Service Targets")).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Host / IP"), {
      target: { value: "192.168.1.80" },
    });
    fireEvent.change(screen.getByLabelText("Puerto llama"), {
      target: { value: "17002" },
    });
    fireEvent.change(screen.getByPlaceholderText("workstation gpu"), {
      target: { value: "workstation gpu" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Aplicar destino" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            host: "192.168.1.80",
            protocol: "http",
            port: 17002,
            label: "workstation gpu",
          }),
        }),
      );
      expect(screen.getByText("http://192.168.1.80:17002/v1/completions")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Volver a entorno" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.getAllByText("http://localhost:7002/v1/completions").length).toBeGreaterThan(0);
    });
  });

  it("polls test status without overlapping requests and stops after completion", async () => {
    let resolveFirstStatus: ((value: TestRunStatusStub) => void) | null = null;
    let statusCalls = 0;

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.resolve({
          total_chunks: 10,
          total_chars: 2000,
          unique_documents: 3,
          embedding_dimensions: 384,
          avg_chunk_chars: 200,
          coverage_level: "good",
          coverage_message: "ok",
          retriever_config: { top_k: 4, min_score: 0.25 },
          sources: [],
        });
      }

      if (url.includes("/v1/backoffice/services/microservice-quiz/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "quiz", worker: buildWorkerSnapshot("quiz") });
      }

      if (url.includes("/v1/backoffice/services/microservice-wordpass/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "word-pass", worker: buildWorkerSnapshot("word-pass") });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "env",
          label: null,
          host: "localhost",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://localhost:7002/v1/completions",
          envLlamaBaseUrl: "http://localhost:7002/v1/completions",
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/run") && options?.method === "POST") {
        return Promise.resolve({ status: "running" });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/status")) {
        statusCalls += 1;
        if (statusCalls === 1) {
          return new Promise<TestRunStatusStub>((resolve) => {
            resolveFirstStatus = resolve;
          });
        }

        return Promise.resolve({
          status: "completed",
          suites: {},
          started_at: 1000,
          finished_at: 2500,
          summary: { total: 1, passed: 1, failed: 0, skipped: 0, errors: 0 },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ejecutar tests" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ejecutar tests" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-diagnostics/tests/run",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(statusCalls).toBe(1);

    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    expect(statusCalls).toBe(1);

    const firstStatusResolver = resolveFirstStatus as ((value: TestRunStatusStub) => void) | null;
    expect(firstStatusResolver).not.toBeNull();
    if (firstStatusResolver) {
      firstStatusResolver({
        status: "running",
        suites: {},
        started_at: 1000,
        summary: { total: 1, passed: 0, failed: 0, skipped: 0, errors: 0 },
      });
    }

    await waitFor(() => {
      expect(screen.getByText("Ejecutando...")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(statusCalls).toBe(2);
      expect(screen.getByText("Completado")).toBeInTheDocument();
    }, { timeout: 2000 });

    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    expect(statusCalls).toBe(2);
  }, 10000);

  it("shows rag, target and runner errors when diagnostics endpoints fail", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.reject("rag down");
      }

      if (url.includes("/v1/backoffice/services/microservice-quiz/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "quiz", worker: buildWorkerSnapshot("quiz") });
      }

      if (url.includes("/v1/backoffice/services/microservice-wordpass/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "word-pass", worker: buildWorkerSnapshot("word-pass") });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.reject(new Error("target down"));
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/run") && options?.method === "POST") {
        return Promise.reject("runner down");
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar el destino del AI Engine: target down")).toBeInTheDocument();
      expect(screen.getByText("Error al obtener estadisticas RAG: rag down")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ejecutar tests" }));

    await waitFor(() => {
      expect(screen.getByText("Error al ejecutar tests: runner down")).toBeInTheDocument();
    });
  });

  it("shows errors when applying and resetting runtime target", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.resolve({
          total_chunks: 10,
          total_chars: 2000,
          unique_documents: 3,
          embedding_dimensions: 384,
          avg_chunk_chars: 200,
          coverage_level: "good",
          coverage_message: "ok",
          retriever_config: { top_k: 4, min_score: 0.25 },
          sources: [],
        });
      }

      if (url.includes("/v1/backoffice/services/microservice-quiz/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "quiz", worker: buildWorkerSnapshot("quiz") });
      }

      if (url.includes("/v1/backoffice/services/microservice-wordpass/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "word-pass", worker: buildWorkerSnapshot("word-pass") });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "env",
          label: null,
          host: "localhost",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://localhost:7002/v1/completions",
          envLlamaBaseUrl: "http://localhost:7002/v1/completions",
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "PUT") {
        return Promise.reject(new Error("apply-target-error"));
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "DELETE") {
        return Promise.reject("reset-target-down");
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/status")) {
        return Promise.resolve({
          status: "idle",
          suites: {},
          summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0 },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByDisplayValue("localhost")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("localhost"), {
      target: { value: "ai.error" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar destino" }));

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar el destino del AI Engine: apply-target-error")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Volver a entorno" }));

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar el destino del AI Engine: reset-target-down")).toBeInTheDocument();
    });
  });

  it("starts and stops quiz generator with normalized payload", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.resolve({
          total_chunks: 10,
          total_chars: 2000,
          unique_documents: 3,
          embedding_dimensions: 384,
          avg_chunk_chars: 200,
          coverage_level: "good",
          coverage_message: "ok",
          retriever_config: { top_k: 4, min_score: 0.25 },
          sources: [],
        });
      }

      if (url.includes("/v1/backoffice/services/microservice-quiz/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          gameType: "quiz",
          worker: {
            ...buildWorkerSnapshot("quiz"),
            config: {
              countPerIteration: 10,
              selectedCategoryIds: ["cat-1", "cat-2"],
              selectedDifficultyLevels: ["easy", "medium", "hard"],
            },
          },
        });
      }

      if (url.includes("/v1/backoffice/services/microservice-wordpass/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "word-pass", worker: buildWorkerSnapshot("word-pass") });
      }

      if (url.endsWith("/generation/worker/start") && options?.method === "POST") {
        return Promise.resolve({
          gameType: "quiz",
          worker: {
            ...buildWorkerSnapshot("quiz"),
            active: true,
            config: {
              countPerIteration: 200,
              selectedCategoryIds: ["cat-1"],
              selectedDifficultyLevels: ["easy", "medium"],
            },
          },
        });
      }

      if (url.endsWith("/generation/worker/stop") && options?.method === "POST") {
        return Promise.resolve({
          gameType: "quiz",
          worker: {
            ...buildWorkerSnapshot("quiz"),
            active: false,
            config: {
              countPerIteration: 200,
              selectedCategoryIds: ["cat-1"],
              selectedDifficultyLevels: ["easy", "medium"],
            },
          },
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "env",
          label: null,
          host: "localhost",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://localhost:7002/v1/completions",
          envLlamaBaseUrl: "http://localhost:7002/v1/completions",
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/status")) {
        return Promise.resolve({
          status: "idle",
          suites: {},
          summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0 },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    const quizHeader = await screen.findByText("Generador quiz");
    const quizSection = quizHeader.closest("section");
    expect(quizSection).not.toBeNull();
    const quiz = within(quizSection!);

    const countInput = quiz.getByLabelText("Cantidad por iteracion") as HTMLInputElement;
    fireEvent.change(countInput, { target: { value: "999" } });
    fireEvent.click(quiz.getByLabelText("Science"));
    fireEvent.click(quiz.getByLabelText("hard (67-100)"));

    fireEvent.click(quiz.getByRole("button", { name: "Activar iteraciones" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/services/microservice-quiz/generation/worker/start",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            countPerIteration: 200,
            categoryIds: ["cat-1"],
            difficultyLevels: ["easy", "medium"],
          }),
        }),
      );
    });

    fireEvent.click(quiz.getByRole("button", { name: "Desactivar iteraciones" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/services/microservice-quiz/generation/worker/stop",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("retries polling after transient status failure and renders suite details", async () => {
    let statusCalls = 0;

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.resolve({
          total_chunks: 10,
          total_chars: 2000,
          unique_documents: 3,
          embedding_dimensions: 384,
          avg_chunk_chars: 200,
          coverage_level: "good",
          coverage_message: "ok",
          retriever_config: { top_k: 4, min_score: 0.25 },
          sources: [{ source: "doc-a", chunks: 5, total_chars: 1000, unique_documents: 1, avg_chunk_chars: 200 }],
        });
      }

      if (url.includes("/v1/backoffice/services/microservice-quiz/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "quiz", worker: buildWorkerSnapshot("quiz") });
      }

      if (url.includes("/v1/backoffice/services/microservice-wordpass/generation/worker") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ gameType: "word-pass", worker: buildWorkerSnapshot("word-pass") });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "env",
          label: null,
          host: "localhost",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://localhost:7002/v1/completions",
          envLlamaBaseUrl: "http://localhost:7002/v1/completions",
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/run") && options?.method === "POST") {
        return Promise.resolve({ status: "running" });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/status")) {
        statusCalls += 1;
        if (statusCalls === 1) {
          return Promise.reject(new Error("status-temporary-down"));
        }
        if (statusCalls === 2) {
          return Promise.resolve({
            status: "running",
            progress: {
              total_suites: 2,
              completed_suites: 1,
              percent: 45,
              current_suite: "semantic",
              message: "suite in progress",
            },
            suites: {
              smoke: {
                suite: "smoke",
                total: 1,
                passed: 1,
                failed: 0,
                tests: [{ name: "health endpoint", passed: true }],
              },
            },
            summary: { total: 1, passed: 1, failed: 0, skipped: 0, errors: 0 },
            recommendations: ["use deterministic prompts"],
          });
        }

        return Promise.resolve({
          status: "completed",
          started_at: 1000,
          finished_at: 2500,
          progress: {
            total_suites: 2,
            completed_suites: 2,
            percent: 100,
            message: "done",
          },
          suites: {
            semantic: {
              suite: "semantic",
              total: 2,
              passed: 1,
              failed: 1,
              tests: [
                { name: "retrieval quality", passed: true },
                { name: "hallucination guard", passed: false, error: "threshold", details: { score: 0.12345, retries: 2, strict: true } },
              ],
            },
          },
          summary: { total: 2, passed: 1, failed: 1, skipped: 0, errors: 0 },
          recommendations: ["use deterministic prompts"],
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ejecutar tests" })).toBeInTheDocument();
      expect(screen.getByText("Fuentes de documentos")).toBeInTheDocument();
      expect(screen.getByText("doc-a")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ejecutar tests" }));

    await waitFor(() => {
      expect(statusCalls).toBe(1);
    });

    await new Promise((resolve) => window.setTimeout(resolve, 2200));

    await waitFor(() => {
      expect(statusCalls).toBeGreaterThanOrEqual(2);
    });

    await new Promise((resolve) => window.setTimeout(resolve, 1200));

    await waitFor(() => {
      expect(statusCalls).toBe(3);
      expect(screen.getByText("Completado")).toBeInTheDocument();
      expect(screen.getByText("Duracion: 1.5s")).toBeInTheDocument();
      expect(screen.getByText("Recomendaciones")).toBeInTheDocument();
      expect(screen.getByText("use deterministic prompts")).toBeInTheDocument();
      expect(screen.getByText("hallucination guard")).toBeInTheDocument();
      expect(screen.getByText(/score=0.1235, retries=2, strict=true/)).toBeInTheDocument();
    });
  }, 12000);
});
