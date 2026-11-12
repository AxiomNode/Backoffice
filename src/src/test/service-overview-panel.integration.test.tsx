import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { SessionContext } from "../domain/types/backoffice";
import { ServiceOverviewPanel } from "../ui/panels/ServiceOverviewPanel";

const fetchServiceOperationalSummaryMock = vi.hoisted(() => vi.fn());
const fetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../application/services/operationalSummary", () => ({
  fetchServiceOperationalSummary: fetchServiceOperationalSummaryMock,
}));

vi.mock("../infrastructure/http/apiClient", () => ({
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
}));

const context: SessionContext = {
  mode: "dev",
  devUid: "test-uid",
};

function renderPanel() {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <ServiceOverviewPanel context={context} density="comfortable" />
    </I18nProvider>,
  );
}

function renderPanelWithDensity(density: "comfortable" | "dense") {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <ServiceOverviewPanel context={context} density={density} />
    </I18nProvider>,
  );
}

describe("ServiceOverviewPanel integration", () => {
  beforeEach(() => {
    fetchServiceOperationalSummaryMock.mockReset();
    fetchJsonMock.mockReset();
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [
        {
          key: "svc-ok",
          title: "Service OK",
          domain: "core",
          supportsData: true,
          online: true,
          accessGuaranteed: true,
          connectionError: false,
          requestsTotal: 120,
          requestsPerSecond: 2.5,
          generationRequestedTotal: 100,
          generationCreatedTotal: 80,
          generationConversionRatio: 0.8,
          latencyMs: 40,
          lastUpdatedAt: new Date().toISOString(),
          errorMessage: null,
          lastKnownError: null,
        },
      ],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/v1/backoffice/services/microservice-quiz/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "quiz-risky",
              status: "running",
              requested: 10,
              processed: 4,
              created: 3,
              duplicates: 0,
              failed: 1,
              idleSeconds: 80,
              stalled: true,
              updatedAt: "2026-04-26T10:00:00.000Z",
            },
          ],
        });
      }

      if (url.includes("/v1/backoffice/services/microservice-wordpass/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "wordpass-dup",
              status: "running",
              requested: 6,
              processed: 2,
              created: 1,
              duplicates: 2,
              failed: 0,
              updatedAt: "2026-04-26T09:00:00.000Z",
            },
          ],
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "override",
          label: "workstation-gpu",
          host: "axiomnode-gateway.amksandbox.cloud",
          protocol: "http",
          port: 27002,
          llamaBaseUrl: "http://axiomnode-gateway.amksandbox.cloud:27002/v1/completions",
          envLlamaBaseUrl: "http://llama-workstation.invalid:7002/v1/completions",
          updatedAt: "2026-04-18T23:10:31.882Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "PUT") {
        return Promise.resolve({
          source: "override",
          label: "workstation-gpu",
          host: "198.51.100.10",
          protocol: "http",
          port: 27002,
          llamaBaseUrl: "http://198.51.100.10:27002/v1/completions",
          envLlamaBaseUrl: "http://llama-workstation.invalid:7002/v1/completions",
          updatedAt: "2026-04-19T00:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "DELETE") {
        return Promise.resolve({
          source: "env",
          label: null,
          host: "llama-workstation.invalid",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://llama-workstation.invalid:7002/v1/completions",
          envLlamaBaseUrl: "http://llama-workstation.invalid:7002/v1/completions",
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/probe") && options?.method === "POST") {
        const payload = JSON.parse(String(options.body)) as {
          host: string;
          protocol: "http" | "https";
          port: number;
        };

        return Promise.resolve({
          host: payload.host,
          protocol: payload.protocol,
          port: payload.port,
          reachable: payload.host !== "10.0.0.99",
          llama: {
            ok: true,
            status: 200,
            url: `${payload.protocol}://${payload.host}:${payload.port}/v1/models`,
            latencyMs: 18,
            message: null,
          },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("supports manual refresh flow", async () => {
    renderPanel();

    await waitFor(() => {
      expect(fetchServiceOperationalSummaryMock).toHaveBeenCalledTimes(1);
    });

    const modeSelect = screen.getAllByLabelText("Actualizacion")[0];
    fireEvent.change(modeSelect, { target: { value: "manual" } });

    const refreshButton = await screen.findByRole("button", { name: "Actualizar servicio" });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(fetchServiceOperationalSummaryMock).toHaveBeenCalledTimes(2);
    });
  });

  it("hides the generation spotlight when there are no active processes", async () => {
    const defaultFetchJson = fetchJsonMock.getMockImplementation();
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/v1/backoffice/services/microservice-quiz/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }

      if (url.includes("/v1/backoffice/services/microservice-wordpass/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }

      return defaultFetchJson?.(url, options);
    });

    renderPanel();

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-quiz/generation/processes"),
        expect.any(Object),
      );
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-wordpass/generation/processes"),
        expect.any(Object),
      );
    });

    expect(screen.queryByText("Procesos activos de generacion")).not.toBeInTheDocument();
    expect(screen.queryByText("No hay procesos activos iniciados desde backoffice.")).not.toBeInTheDocument();
  });

  it("shows an active generation spotlight with risk summary on the overview", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Procesos activos de generacion")).toBeInTheDocument();
      expect(screen.getByText("Activos")).toBeInTheDocument();
      expect(screen.getAllByText("Con fallos").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Con duplicados").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Bloqueados").length).toBeGreaterThan(0);
      expect(screen.getByText("Progreso agregado")).toBeInTheDocument();
      expect(screen.getByText(/quiz \| quiz-risky/i)).toBeInTheDocument();
      expect(screen.getByText(/wordpass \| wordpass-dup/i)).toBeInTheDocument();
      expect(screen.getByText(/microservice-quiz \| 4\/10 procesados/i)).toBeInTheDocument();
      expect(screen.getByText("Sin progreso: 80s")).toBeInTheDocument();
      expect(screen.getByText(/microservice-wordpass \| 2\/6 procesados/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Abrir proceso" })[0]!);

    await waitFor(() => {
      expect(window.location.hash).toContain("#/backoffice/svc-quiz?dataset=processes&followTaskId=quiz-risky");
    });
  });

  it("triggers auto refresh according to interval", async () => {
    vi.useFakeTimers();
    renderPanel();

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchServiceOperationalSummaryMock).toHaveBeenCalledTimes(1);

    const modeSelect = screen.getAllByLabelText("Actualizacion")[0];
    fireEvent.change(modeSelect, { target: { value: "auto" } });

    const intervalSelect = screen.getAllByLabelText("Intervalo")[0];
    fireEvent.change(intervalSelect, { target: { value: "5" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5200);
    });

    expect(fetchServiceOperationalSummaryMock).toHaveBeenCalledTimes(2);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("does not offer a Kubernetes tab or request cluster data", async () => {
    renderPanel();

    await waitFor(() => {
      expect(fetchServiceOperationalSummaryMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Service OK")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Kubernetes" })).not.toBeInTheDocument();
    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url).includes("kubernetes")),
    ).toBe(false);
  });

  it("shows the llama target form in the service overview, probes and applies it", async () => {
    renderPanel();

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.any(Object),
      );
      expect(screen.getByText("Destino del servidor llama")).toBeInTheDocument();
    });

    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url).includes("/ai-engine/presets")),
    ).toBe(false);
    expect(screen.queryByText("URL llama activa")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getAllByText("Etiqueta actual").length).toBeGreaterThan(0);
      expect(screen.getByLabelText("Host / IP")).toHaveValue("axiomnode-gateway.amksandbox.cloud");
      expect(screen.getByLabelText("Puerto llama")).toHaveValue("27002");
    });

    expect(screen.queryByLabelText("Destino guardado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva opcion" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Host / IP"), { target: { value: "198.51.100.10" } });

    fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/probe",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            host: "198.51.100.10",
            protocol: "http",
            port: 27002,
          }),
        }),
      );
      expect(screen.getByText(/Destino verificado/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Usar este destino" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            host: "198.51.100.10",
            protocol: "http",
            port: 27002,
            label: "workstation-gpu",
          }),
        }),
      );
    });
  });

  it("resets the llama target to the environment default", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Host / IP")).toHaveValue("axiomnode-gateway.amksandbox.cloud");
    });

    fireEvent.click(screen.getByRole("button", { name: "Volver al destino de entorno" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("uses a safe https fallback port when the typed port is out of range", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Host / IP")).toHaveValue("axiomnode-gateway.amksandbox.cloud");
    });

    fireEvent.change(screen.getByLabelText("Etiqueta actual"), { target: { value: "TLS relay" } });
    fireEvent.change(screen.getByLabelText("Host / IP"), { target: { value: "relay.example.com" } });
    fireEvent.change(screen.getByLabelText("Protocolo"), { target: { value: "https" } });
    fireEvent.change(screen.getByLabelText("Puerto llama"), { target: { value: "70000" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar este destino" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            host: "relay.example.com",
            protocol: "https",
            port: 443,
            label: "TLS relay",
          }),
        }),
      );
    });
  });

  it("tolerates legacy ai-engine target and probe payloads without blanking the panel", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "override",
          label: "workstation-gpu-vps-relay",
          host: "203.0.113.10",
          protocol: "http",
          apiPort: 27001,
          statsPort: 27000,
          apiBaseUrl: "http://203.0.113.10:27001",
          statsBaseUrl: "http://203.0.113.10:27000",
          updatedAt: "2026-04-19T21:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/probe") && options?.method === "POST") {
        return Promise.resolve({
          host: "203.0.113.10",
          protocol: "http",
          apiPort: 7002,
          statsPort: 7001,
          reachable: false,
          api: {
            ok: false,
            status: null,
            url: "http://203.0.113.10:7002/health",
            latencyMs: 5,
            message: "fetch failed",
          },
          stats: {
            ok: false,
            status: null,
            url: "http://203.0.113.10:7001/metrics",
            latencyMs: 4,
            message: "fetch failed",
          },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getAllByText("workstation-gpu-vps-relay").length).toBeGreaterThan(0);
      expect(screen.getAllByText("27001").length).toBeGreaterThan(0);
      expect(screen.getByText("http://203.0.113.10:27001/v1/completions")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

    await waitFor(() => {
      expect(screen.getByText(/Destino con fallos/i)).toBeInTheDocument();
      expect(screen.getByText(/http:\/\/203.0.113.10:7002\/health fetch failed/i)).toBeInTheDocument();
      expect(screen.getByText("Destino del servidor llama")).toBeInTheDocument();
    });
  });

  it("clears ai-target errors after a successful retry", async () => {
    let targetShouldFail = true;

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        if (targetShouldFail) {
          targetShouldFail = false;
          return Promise.reject(new Error("HTTP 404: Not Found"));
        }

        return Promise.resolve({
          source: "override",
          label: "workstation-gpu",
          host: "203.0.113.10",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://203.0.113.10:7002/v1/completions",
          envLlamaBaseUrl: "http://llama-workstation.invalid:7002/v1/completions",
          updatedAt: "2026-04-19T00:00:00.000Z",
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo gestionar el destino del AI engine/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Recargar destino IA" }));

    await waitFor(() => {
      expect(screen.queryByText(/No se pudo gestionar el destino del AI engine/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Host / IP")).toHaveValue("203.0.113.10");
    });
  });

  it("renders dense narrow fallback values for offline services and malformed ai target payloads", async () => {
    const originalInnerWidth = window.innerWidth;

    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [
        {
          key: "svc-offline",
          title: "Service Down",
          domain: "edge",
          supportsData: false,
          online: false,
          accessGuaranteed: false,
          connectionError: true,
          requestsTotal: null,
          requestsPerSecond: null,
          generationRequestedTotal: null,
          generationCreatedTotal: 12,
          generationConversionRatio: null,
          latencyMs: null,
          lastUpdatedAt: null,
          errorMessage: "edge timeout",
          lastKnownError: "edge timeout",
        },
      ],
      totals: { total: 1, onlineCount: 0, accessIssues: 1, connectionErrors: 1 },
    });

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "env",
          label: null,
          host: null,
          protocol: "ftp",
          apiPort: null,
          apiBaseUrl: null,
          envLlamaBaseUrl: null,
          updatedAt: null,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/probe") && options?.method === "POST") {
        return Promise.resolve({
          host: "10.0.0.9",
          protocol: "https",
          port: 8443,
          reachable: false,
          llama: {
            ok: false,
            status: null,
            url: "https://10.0.0.9:8443/v1/models",
            latencyMs: null,
            message: null,
          },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });

      renderPanelWithDensity("dense");

      await waitFor(() => {
        expect(screen.getByText("Offline")).toBeInTheDocument();
        expect(screen.getByText("No")).toBeInTheDocument();
        expect(screen.getByText("Error")).toBeInTheDocument();
        expect(screen.getAllByText("N/D").length).toBeGreaterThan(0);
        expect(screen.getByText("edge timeout")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

      await waitFor(() => {
        expect(screen.getAllByText("--").length).toBeGreaterThan(0);
        expect(screen.getByLabelText("Host / IP")).toHaveValue("");
        expect(screen.getByRole("button", { name: "Verificar conectividad" })).toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText("Host / IP"), { target: { value: "10.0.0.9" } });
      fireEvent.change(screen.getByLabelText("Protocolo"), { target: { value: "https" } });
      fireEvent.change(screen.getByLabelText("Puerto llama"), { target: { value: "8443" } });
      fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

      await waitFor(() => {
        expect(screen.getByText(/https:\/\/10.0.0.9:8443\/v1\/models sin respuesta/i)).toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    }
  });

  it("shows the overview load error when the summary request fails", async () => {
    fetchServiceOperationalSummaryMock.mockRejectedValue(new Error("summary down"));

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("No se pudo cargar el resumen: summary down")).toBeInTheDocument();
    });
  });

  it("normalizes malformed target and probe payloads", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve("broken-target-payload");
      }

      if (url.endsWith("/v1/backoffice/ai-engine/probe") && options?.method === "POST") {
        return Promise.resolve("broken-probe-payload");
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getAllByText("--").length).toBeGreaterThan(0);
      expect(screen.getByLabelText("Host / IP")).toHaveValue("");
      expect(screen.getByLabelText("Protocolo")).toHaveValue("http");
      expect(screen.getByLabelText("Puerto llama")).toHaveValue("7002");
    });

    fireEvent.change(screen.getByLabelText("Host / IP"), { target: { value: "relay.internal" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

    await waitFor(() => {
      expect(screen.getByText(/http:\/\/:7002\/v1\/models sin respuesta/i)).toBeInTheDocument();
    });
  });

  it("shows a generic error when probing the target fails with a non-Error value", async () => {
    const preventUnhandledProbeRejection = (event: PromiseRejectionEvent) => {
      if (event.reason === "probe-broken") {
        event.preventDefault();
      }
    };

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "override",
          label: "workstation-gpu",
          host: "203.0.113.10",
          protocol: "http",
          port: 27002,
          llamaBaseUrl: "http://203.0.113.10:27002/v1/completions",
          envLlamaBaseUrl: null,
          updatedAt: "2026-04-19T00:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/probe") && options?.method === "POST") {
        return Promise.reject("probe-broken");
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    window.addEventListener("unhandledrejection", preventUnhandledProbeRejection);

    try {
      fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

      await waitFor(() => {
        expect(screen.getByLabelText("Host / IP")).toHaveValue("203.0.113.10");
      });

      fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

      await waitFor(() => {
        expect(screen.getByText(/No se pudo gestionar el destino del AI engine: Error desconocido/i)).toBeInTheDocument();
      });
    } finally {
      window.removeEventListener("unhandledrejection", preventUnhandledProbeRejection);
    }
  });

  it("blocks applying a target when the probe reports an unreachable endpoint", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "override",
          label: "Broken env",
          host: "10.0.0.99",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://10.0.0.99:7002/v1/completions",
          envLlamaBaseUrl: null,
          updatedAt: "2026-04-19T00:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/probe") && options?.method === "POST") {
        return Promise.resolve({
          host: "10.0.0.99",
          protocol: "http",
          port: 7002,
          reachable: false,
          llama: {
            ok: false,
            status: null,
            url: "http://10.0.0.99:7002/v1/models",
            latencyMs: null,
            message: "connection timed out",
          },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Host / IP")).toHaveValue("10.0.0.99");
    });

    fireEvent.click(screen.getByRole("button", { name: "Usar este destino" }));

    await waitFor(() => {
      expect(screen.getByText(/El destino no paso la verificacion/i)).toBeInTheDocument();
      expect(screen.getByText(/Endpoint: http:\/\/10\.0\.0\.99:7002\/v1\/models/i)).toBeInTheDocument();
      expect(screen.getByText(/Detail: connection timed out/i)).toBeInTheDocument();
      expect(
        fetchJsonMock.mock.calls.some(
          ([url, requestOptions]) =>
            url === "http://localhost:7005/v1/backoffice/ai-engine/target" &&
            (requestOptions as RequestInit | undefined)?.method === "PUT",
        ),
      ).toBe(false);
    });
  });

  it("shows generic and specific management errors for refresh, apply and reset actions", async () => {
    let failRefresh = false;
    let failApply = false;
    let failReset = false;

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        if (failRefresh) {
          return Promise.reject("refresh-broken");
        }

        return Promise.resolve({
          source: "override",
          label: "workstation-gpu",
          host: "203.0.113.10",
          protocol: "http",
          port: 27002,
          llamaBaseUrl: "http://203.0.113.10:27002/v1/completions",
          envLlamaBaseUrl: null,
          updatedAt: "2026-04-19T00:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/probe") && options?.method === "POST") {
        const payload = JSON.parse(String(options.body));
        return Promise.resolve({
          ...payload,
          reachable: true,
          llama: { ok: true, status: 200, url: "http://x/v1/models", latencyMs: 3, message: null },
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "PUT") {
        if (failApply) {
          return Promise.reject("apply-broken");
        }

        return Promise.resolve({});
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "DELETE") {
        if (failReset) {
          return Promise.reject(new Error("reset-broken"));
        }

        return Promise.resolve({});
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Host / IP")).toHaveValue("203.0.113.10");
    });

    failRefresh = true;
    fireEvent.click(screen.getByRole("button", { name: "Recargar destino IA" }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo gestionar el destino del AI engine: Error desconocido/i)).toBeInTheDocument();
    });

    failRefresh = false;
    fireEvent.change(screen.getByLabelText("Host / IP"), { target: { value: "10.0.0.20" } });
    failApply = true;
    fireEvent.click(screen.getByRole("button", { name: "Usar este destino" }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo gestionar el destino del AI engine: Error desconocido/i)).toBeInTheDocument();
    });

    failApply = false;
    failReset = true;
    fireEvent.click(screen.getByRole("button", { name: "Volver al destino de entorno" }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo gestionar el destino del AI engine: reset-broken/i)).toBeInTheDocument();
    });
  });

});
