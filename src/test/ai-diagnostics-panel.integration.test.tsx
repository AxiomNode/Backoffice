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
          apiPort: 7001,
          statsPort: 7000,
          apiBaseUrl: "http://localhost:7001",
          statsBaseUrl: "http://localhost:7000",
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "PUT") {
        return Promise.resolve({
          source: "override",
          label: "workstation gpu",
          host: "192.168.1.80",
          protocol: "http",
          apiPort: 17001,
          statsPort: 17000,
          apiBaseUrl: "http://192.168.1.80:17001",
          statsBaseUrl: "http://192.168.1.80:17000",
          updatedAt: "2026-04-18T17:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "DELETE") {
        return Promise.resolve({
          source: "env",
          label: null,
          host: "localhost",
          protocol: "http",
          apiPort: 7001,
          statsPort: 7000,
          apiBaseUrl: "http://localhost:7001",
          statsBaseUrl: "http://localhost:7000",
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
      expect(screen.getAllByText("http://localhost:7001").length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue("localhost")).toBeInTheDocument();
      expect(screen.getAllByText("http://localhost:7102").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("Host / IP"), {
      target: { value: "192.168.1.80" },
    });
    fireEvent.change(screen.getByLabelText("Puerto API"), {
      target: { value: "17001" },
    });
    fireEvent.change(screen.getByLabelText("Puerto Stats"), {
      target: { value: "17000" },
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
            apiPort: 17001,
            statsPort: 17000,
            label: "workstation gpu",
          }),
        }),
      );
      expect(screen.getByText("http://192.168.1.80:17001")).toBeInTheDocument();
      expect(screen.getByText("http://192.168.1.80:17000")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Volver a entorno" })[1]);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.getAllByText("http://localhost:7001").length).toBeGreaterThan(0);
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
});