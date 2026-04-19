import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { SessionContext } from "../domain/types/backoffice";
import { AIDiagnosticsPanel } from "../ui/panels/AIDiagnosticsPanel";

const fetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/http/apiClient", () => ({
  DEFAULT_EDGE_API_BASE: "http://localhost:7005",
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
  getEdgeApiBaseOverride: () => null,
  setEdgeApiBaseOverride: vi.fn(),
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

function renderPanel() {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <AIDiagnosticsPanel context={context} density="comfortable" />
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
});