import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { SessionContext } from "../domain/types/backoffice";
import { AIDiagnosticsPanel } from "../ui/panels/AIDiagnosticsPanel";

const fetchJsonMock = vi.hoisted(() => vi.fn());
const getEdgeApiBaseOverrideMock = vi.hoisted(() => vi.fn<() => string | null>());
const setEdgeApiBaseOverrideMock = vi.hoisted(() => vi.fn<(value: string | null) => string | null>());

vi.mock("../infrastructure/http/apiClient", () => ({
  DEFAULT_EDGE_API_BASE: "http://localhost:7005",
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
  getEdgeApiBaseOverride: getEdgeApiBaseOverrideMock,
  setEdgeApiBaseOverride: setEdgeApiBaseOverrideMock,
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
    getEdgeApiBaseOverrideMock.mockReset();
    setEdgeApiBaseOverrideMock.mockReset();
    getEdgeApiBaseOverrideMock.mockReturnValue(null);
    setEdgeApiBaseOverrideMock.mockImplementation((value) => value);

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

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: 7,
          targets: [
            {
              service: "api-gateway",
              title: "API Gateway",
              source: "env",
              baseUrl: "http://localhost:7005",
              label: null,
              updatedAt: null,
            },
            {
              service: "bff-mobile",
              title: "BFF Mobile",
              source: "env",
              baseUrl: "http://localhost:7010",
              label: null,
              updatedAt: null,
            },
            {
              service: "microservice-users",
              title: "Microservice Users",
              source: "env",
              baseUrl: "http://localhost:7102",
              label: null,
              updatedAt: null,
            },
            {
              service: "microservice-quiz",
              title: "Microservice Quiz",
              source: "env",
              baseUrl: "http://localhost:7100",
              label: null,
              updatedAt: null,
            },
            {
              service: "microservice-wordpass",
              title: "Microservice Wordpass",
              source: "env",
              baseUrl: "http://localhost:7101",
              label: null,
              updatedAt: null,
            },
            {
              service: "ai-engine-stats",
              title: "AI Engine Stats",
              source: "env",
              baseUrl: "http://localhost:7000",
              label: null,
              updatedAt: null,
            },
            {
              service: "ai-engine-api",
              title: "AI Engine API",
              source: "env",
              baseUrl: "http://localhost:7001",
              label: null,
              updatedAt: null,
            },
          ],
        });
      }

      if (url.endsWith("/v1/backoffice/service-targets/microservice-users") && options?.method === "PUT") {
        return Promise.resolve({
          service: "microservice-users",
          title: "Microservice Users",
          source: "override",
          baseUrl: "http://192.168.1.50:17102",
          label: "users workstation",
          updatedAt: "2026-04-18T17:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/service-targets/microservice-users") && options?.method === "DELETE") {
        return Promise.resolve({
          service: "microservice-users",
          title: "Microservice Users",
          source: "env",
          baseUrl: "http://localhost:7102",
          label: null,
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
      expect(screen.getAllByText("http://localhost:7102").length).toBeGreaterThan(0);
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

    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar destino" })[1]);

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

    fireEvent.click(screen.getAllByRole("button", { name: "Volver a entorno" })[1]);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.getAllByText("http://localhost:7002/v1/completions").length).toBeGreaterThan(0);
    });
  });

  it("loads and updates configurable service targets", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByDisplayValue("http://localhost:7102")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("http://localhost:7102"), {
      target: { value: "http://192.168.1.50:17102" },
    });
    fireEvent.change(screen.getByPlaceholderText("workstation backup"), {
      target: { value: "users workstation" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar destino" })[0]);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/service-targets/microservice-users",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            baseUrl: "http://192.168.1.50:17102",
            label: "users workstation",
          }),
        }),
      );
      expect(screen.getAllByText("http://192.168.1.50:17102").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Volver a entorno" })[0]);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/service-targets/microservice-users",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("falls back to the first available service target when the current selection disappears", async () => {
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

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: 1,
          targets: [
            {
              service: "bff-mobile",
              title: "BFF Mobile",
              source: "override",
              baseUrl: "http://10.0.0.7:7010",
              label: "mobile relay",
              updatedAt: "2026-04-18T17:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByDisplayValue("http://10.0.0.7:7010")).toBeInTheDocument();
      expect(screen.getByDisplayValue("mobile relay")).toBeInTheDocument();
      expect(screen.getAllByText("BFF Mobile").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Override runtime").length).toBeGreaterThan(0);
    });
  });

  it("switches service cards and applies target protocol changes", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByDisplayValue("http://localhost:7102")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /BFF Mobile/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("http://localhost:7010")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Host / IP"), {
      target: { value: "ai.internal" },
    });
    fireEvent.change(screen.getByLabelText("Protocolo"), {
      target: { value: "https" },
    });
    fireEvent.change(screen.getByLabelText("Puerto llama"), {
      target: { value: "7443" },
    });
    fireEvent.change(screen.getByPlaceholderText("workstation gpu"), {
      target: { value: "secure edge" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar destino" })[1]);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            host: "ai.internal",
            protocol: "https",
            port: 7443,
            label: "secure edge",
          }),
        }),
      );
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

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ total: 0, targets: [] });
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

  it("retries the test status poll after a transient failure", async () => {
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

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ total: 0, targets: [] });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/run") && options?.method === "POST") {
        return Promise.resolve({ status: "running" });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/status")) {
        statusCalls += 1;
        if (statusCalls === 1) {
          return Promise.reject(new Error("poll down"));
        }

        return Promise.resolve({
          status: "completed",
          suites: {},
          started_at: 1000,
          finished_at: 2100,
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
      expect(statusCalls).toBe(1);
    });

    await new Promise((resolve) => window.setTimeout(resolve, 2200));

    await waitFor(() => {
      expect(statusCalls).toBe(2);
      expect(screen.getByText("Completado")).toBeInTheDocument();
    });
  }, 10000);

  it("renders dense fallback diagnostics and reports invalid edge overrides", async () => {
    getEdgeApiBaseOverrideMock.mockReturnValue("http://10.0.0.9:7005");
    setEdgeApiBaseOverrideMock.mockImplementation(() => {
      throw new Error("invalid override");
    });

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.resolve({
          total_chunks: 12,
          total_chars: 2400,
          unique_documents: 4,
          embedding_dimensions: 384,
          avg_chunk_chars: 200,
          coverage_level: "mystery",
          coverage_message: "custom coverage",
          retriever_config: {},
          sources: [
            {
              source: "guide.md",
              chunks: 4,
              total_chars: 900,
              unique_documents: 1,
              avg_chunk_chars: 225,
            },
          ],
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "override",
          label: null,
          host: null,
          protocol: null,
          port: null,
          llamaBaseUrl: null,
          envLlamaBaseUrl: null,
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ total: 0, targets: [] });
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

    renderPanel("dense");

    await waitFor(() => {
      expect(screen.getAllByText("Override runtime").length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue("7002")).toBeInTheDocument();
      expect(screen.getByText("top_k=?, min_score=?")).toBeInTheDocument();
      expect(screen.getByText("guide.md")).toBeInTheDocument();
      expect(screen.getAllByText("--").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByPlaceholderText("http://localhost:7005"), {
      target: { value: "bad-url" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar y recargar" }));

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar el destino del backoffice: invalid override")).toBeInTheDocument();
    });
  });

  it("shows service, target, rag and runner errors when diagnostics endpoints fail", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-diagnostics/rag/stats")) {
        return Promise.reject("rag down");
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.reject(new Error("target down"));
      }

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.reject("services down");
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/run") && options?.method === "POST") {
        return Promise.reject("runner down");
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar los destinos de servicios: services down")).toBeInTheDocument();
      expect(screen.getByText("Error al gestionar el destino del AI Engine: target down")).toBeInTheDocument();
      expect(screen.getByText("Error al obtener estadisticas RAG: rag down")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ejecutar tests" }));

    await waitFor(() => {
      expect(screen.getByText("Error al ejecutar tests: runner down")).toBeInTheDocument();
    });
  });

  it("shows string errors when applying and resetting runtime and service targets", async () => {
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

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: 1,
          targets: [
            {
              service: "microservice-users",
              title: "Microservice Users",
              source: "env",
              baseUrl: "http://localhost:7102",
              label: null,
              updatedAt: null,
            },
          ],
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "PUT") {
        return Promise.reject("apply-target-down");
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "DELETE") {
        return Promise.reject("reset-target-down");
      }

      if (url.endsWith("/v1/backoffice/service-targets/microservice-users") && options?.method === "PUT") {
        return Promise.reject("apply-service-down");
      }

      if (url.endsWith("/v1/backoffice/service-targets/microservice-users") && options?.method === "DELETE") {
        return Promise.reject("reset-service-down");
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
      expect(screen.getByDisplayValue("http://localhost:7102")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("localhost"), {
      target: { value: "ai.internal" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar destino" })[1]);

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar el destino del AI Engine: apply-target-down")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Volver a entorno" })[1]);

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar el destino del AI Engine: reset-target-down")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("http://localhost:7102"), {
      target: { value: "http://10.0.0.9:7102" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar destino" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar los destinos de servicios: apply-service-down")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Volver a entorno" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar los destinos de servicios: reset-service-down")).toBeInTheDocument();
    });
  });

  it("shows Error messages when applying and resetting runtime and service targets", async () => {
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

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: 1,
          targets: [
            {
              service: "microservice-users",
              title: "Microservice Users",
              source: "env",
              baseUrl: "http://localhost:7102",
              label: null,
              updatedAt: null,
            },
          ],
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "PUT") {
        return Promise.reject(new Error("apply-target-error"));
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "DELETE") {
        return Promise.reject(new Error("reset-target-error"));
      }

      if (url.endsWith("/v1/backoffice/service-targets/microservice-users") && options?.method === "PUT") {
        return Promise.reject(new Error("apply-service-error"));
      }

      if (url.endsWith("/v1/backoffice/service-targets/microservice-users") && options?.method === "DELETE") {
        return Promise.reject(new Error("reset-service-error"));
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
      expect(screen.getByDisplayValue("http://localhost:7102")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("localhost"), {
      target: { value: "ai.error" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar destino" })[1]);

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar el destino del AI Engine: apply-target-error")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Volver a entorno" })[1]);

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar el destino del AI Engine: reset-target-error")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("http://localhost:7102"), {
      target: { value: "http://error.host:7102" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Aplicar destino" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar los destinos de servicios: apply-service-error")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Volver a entorno" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Error al gestionar los destinos de servicios: reset-service-error")).toBeInTheDocument();
    });
  });

  it("renders suite details, fallback status text and millisecond duration", async () => {
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

      if (url.endsWith("/v1/backoffice/service-targets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({ total: 0, targets: [] });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/run") && options?.method === "POST") {
        return Promise.resolve({ status: "running" });
      }

      if (url.endsWith("/v1/backoffice/ai-diagnostics/tests/status")) {
        statusCalls += 1;
        if (statusCalls === 1) {
          return Promise.resolve({
            status: "already_running",
            suites: {
              stability: {
                suite: "stability",
                total: 2,
                passed: 1,
                failed: 1,
                tests: [
                  { name: "keeps context", passed: true, details: { score: 0.12345, chunk: 2 } },
                  { name: "rejects drift", passed: false, error: "boom" },
                ],
              },
            },
            started_at: 1000,
            summary: { total: 2, passed: 1, failed: 1, skipped: 0, errors: 0 },
          });
        }

        return Promise.resolve({
          status: "completed",
          suites: {
            stability: {
              suite: "stability",
              total: 2,
              passed: 1,
              failed: 1,
              tests: [
                { name: "keeps context", passed: true, details: { score: 0.12345, chunk: 2 } },
                { name: "rejects drift", passed: false, error: "boom" },
              ],
            },
          },
          started_at: 1000,
          finished_at: 1400,
          summary: { total: 2, passed: 1, failed: 1, skipped: 0, errors: 0 },
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
      expect(screen.getByText("Sin ejecucion activa")).toBeInTheDocument();
      expect(screen.getByText("score=0.1235, chunk=2")).toBeInTheDocument();
      expect(screen.getByText(/boom/)).toBeInTheDocument();
    });

    await new Promise((resolve) => window.setTimeout(resolve, 1200));

    await waitFor(() => {
      expect(statusCalls).toBe(2);
      expect(screen.getByText("Completado")).toBeInTheDocument();
      expect(screen.getByText((content) => content.includes("400ms"))).toBeInTheDocument();
      expect(screen.getByText(/✗ 1 fallidos/i)).toBeInTheDocument();
    });
  }, 10000);
});