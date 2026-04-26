import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { SessionContext } from "../domain/types/backoffice";
import { ServiceOverviewPanel } from "../ui/panels/ServiceOverviewPanel";

const fetchServiceOperationalSummaryMock = vi.hoisted(() => vi.fn());
const fetchKubernetesOverviewMock = vi.hoisted(() => vi.fn());
const fetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../application/services/operationalSummary", () => ({
  fetchServiceOperationalSummary: fetchServiceOperationalSummaryMock,
  fetchKubernetesOverview: fetchKubernetesOverviewMock,
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
  let presetsState: Array<{
    id: string;
    name: string;
    host: string;
    protocol: "http" | "https";
    port: number;
    updatedAt: string;
  }>;

  beforeEach(() => {
    fetchServiceOperationalSummaryMock.mockReset();
    fetchKubernetesOverviewMock.mockReset();
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
    fetchKubernetesOverviewMock.mockResolvedValue({
      enabled: true,
      fetchedAt: "2026-04-27T10:00:00.000Z",
      namespace: "axiomnode-stg",
      source: "cluster",
      message: null,
      cluster: {
        apiBaseUrl: "https://kubernetes.default.svc",
        nodeCount: 1,
        readyNodeCount: 1,
        deploymentCount: 2,
        podCount: 5,
        runningPodCount: 5,
        notReadyPodCount: 0,
        restartCount: 1,
        cpuUsageMillicores: 500,
        cpuCapacityMillicores: 2000,
        cpuUsageRatio: 0.25,
        memoryUsageBytes: 805306368,
        memoryCapacityBytes: 4294967296,
        memoryUsageRatio: 0.1875,
        namespaceCpuRequestMillicores: 800,
        namespaceCpuLimitMillicores: 1200,
        namespaceMemoryRequestBytes: 536870912,
        namespaceMemoryLimitBytes: 1073741824,
      },
      nodes: [
        {
          name: "node-a",
          ready: true,
          podCount: 5,
          cpuUsageMillicores: 500,
          cpuCapacityMillicores: 2000,
          cpuUsageRatio: 0.25,
          memoryUsageBytes: 805306368,
          memoryCapacityBytes: 4294967296,
          memoryUsageRatio: 0.1875,
        },
      ],
      workloads: [
        {
          name: "microservice-quizz-api",
          image: "ghcr.io/axiomnode/microservice-quizz-api:stg",
          desiredReplicas: 1,
          readyReplicas: 1,
          availableReplicas: 1,
          updatedReplicas: 1,
          podCount: 1,
          readyPodCount: 1,
          restartCount: 0,
          cpuUsageMillicores: 120,
          memoryUsageBytes: 134217728,
          cpuRequestMillicores: 200,
          cpuLimitMillicores: 400,
          memoryRequestBytes: 134217728,
          memoryLimitBytes: 268435456,
          status: "healthy",
        },
      ],
      topPods: [
        {
          name: "microservice-quizz-api-123",
          workload: "microservice-quizz-api",
          nodeName: "node-a",
          phase: "Running",
          ready: true,
          restartCount: 0,
          cpuUsageMillicores: 120,
          memoryUsageBytes: 134217728,
          cpuRequestMillicores: 200,
          memoryRequestBytes: 134217728,
        },
      ],
    });

    presetsState = [
      {
        id: "this-pc-lan",
        name: "Este PC (192.168.0.14)",
        host: "192.168.0.14",
        protocol: "http",
        port: 7002,
        updatedAt: "2026-04-19T00:00:00.000Z",
      },
      {
        id: "workstation-public",
        name: "Workstation publica (195.35.48.40)",
        host: "195.35.48.40",
        protocol: "http",
        port: 27002,
        updatedAt: "2026-04-19T00:00:00.000Z",
      },
    ];

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

      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: presetsState.length,
          presets: presetsState,
        });
      }

      if (url.includes("/v1/backoffice/routing/history")) {
        return Promise.resolve({
          total: 2,
          history: [
            {
              recordedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              action: "service-target-set",
              service: "api-gateway",
              state: {
                version: 3,
                overrides: {
                  "api-gateway": {
                    baseUrl: "http://api-gateway:7005",
                    label: "cluster",
                    updatedAt: "2026-04-26T09:00:00.000Z",
                  },
                },
                aiEnginePresets: presetsState,
              },
            },
            {
              recordedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
              action: "ai-engine-preset-set",
              presetId: "workstation-public",
              state: {
                version: 3,
                overrides: {},
                aiEnginePresets: presetsState,
              },
            },
          ],
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/presets") && options?.method === "POST") {
        const payload = JSON.parse(String(options.body)) as {
          name: string;
          host: string;
          protocol: "http" | "https";
          port: number;
        };
        const created = {
          id: "custom-preset",
          ...payload,
          updatedAt: "2026-04-19T00:01:00.000Z",
        };
        presetsState = [...presetsState, created];
        return Promise.resolve(created);
      }

      if (url.endsWith("/v1/backoffice/ai-engine/presets/workstation-public") && options?.method === "PUT") {
        const payload = JSON.parse(String(options.body)) as {
          name: string;
          host: string;
          protocol: "http" | "https";
          port: number;
        };
        const updated = {
          id: "workstation-public",
          ...payload,
          updatedAt: "2026-04-19T00:02:00.000Z",
        };
        presetsState = presetsState.map((entry) => (entry.id === updated.id ? updated : entry));
        return Promise.resolve(updated);
      }

      if (url.endsWith("/v1/backoffice/ai-engine/presets/custom-preset") && options?.method === "DELETE") {
        presetsState = presetsState.filter((entry) => entry.id !== "custom-preset");
        return Promise.resolve({ deleted: true, presetId: "custom-preset" });
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
          label: "VPS staging (195.35.48.40)",
          host: "195.35.48.40",
          protocol: "http",
          port: 27002,
          llamaBaseUrl: "http://195.35.48.40:27002/v1/completions",
          envLlamaBaseUrl: "http://llama-workstation.invalid:7002/v1/completions",
          updatedAt: "2026-04-19T00:00:00.000Z",
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

  it("shows an active generation spotlight with risk summary on the overview", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Procesos activos de generacion")).toBeInTheDocument();
      expect(screen.getByText("Activos")).toBeInTheDocument();
      expect(screen.getAllByText("Con fallos").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Con duplicados").length).toBeGreaterThan(0);
      expect(screen.getByText("Progreso agregado")).toBeInTheDocument();
      expect(screen.getByText(/quiz \| quiz-risky/i)).toBeInTheDocument();
      expect(screen.getByText(/wordpass \| wordpass-dup/i)).toBeInTheDocument();
      expect(screen.getByText(/microservice-quiz \| 4\/10 procesados/i)).toBeInTheDocument();
      expect(screen.getByText(/microservice-wordpass \| 2\/6 procesados/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Abrir proceso" })[0]!);

    await waitFor(() => {
      expect(window.location.hash).toContain("#/backoffice/svc-quiz?dataset=processes&followTaskId=quiz-risky");
    });
  });

  it("renders the kubernetes tab with workload and pod consumption", async () => {
    renderPanel();

    await waitFor(() => {
      expect(fetchKubernetesOverviewMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Kubernetes" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Kubernetes" }));

    await waitFor(() => {
      expect(screen.getAllByText("microservice-quizz-api").length).toBeGreaterThan(0);
      expect(screen.getByText("microservice-quizz-api-123")).toBeInTheDocument();
      expect(screen.getByText(/Namespace axiomnode-stg/i)).toBeInTheDocument();
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

  it("shows editable ai-engine options in the service overview and applies the selected destination", async () => {
    renderPanel();

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/target",
        expect.any(Object),
      );
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/presets",
        expect.any(Object),
      );
      expect(screen.getByText("Destino del servidor llama")).toBeInTheDocument();
    });

    expect(screen.queryByText("Etiqueta actual")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByText("Etiqueta actual")).toBeInTheDocument();
      expect(screen.getByText("Historial operativo")).toBeInTheDocument();
      expect(screen.getByText(/api-gateway -> http:\/\/api-gateway:7005/i)).toBeInTheDocument();
      expect(screen.getAllByText("Workstation publica (195.35.48.40)").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Servicios" }));

    await waitFor(() => {
      expect(screen.getByText(/api-gateway -> http:\/\/api-gateway:7005/i)).toBeInTheDocument();
      expect(screen.queryByText("Preset IA guardado")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Presets IA" }));

    await waitFor(() => {
      expect(screen.queryByText(/api-gateway -> http:\/\/api-gateway:7005/i)).not.toBeInTheDocument();
      expect(screen.getByText("Preset IA guardado")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Ventana temporal"), {
      target: { value: "24h" },
    });

    await waitFor(() => {
      expect(screen.getByText("No hay cambios para el filtro actual.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Todo" }));
    fireEvent.change(screen.getByLabelText("Ventana temporal"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("Orden"), {
      target: { value: "oldest" },
    });

    await waitFor(() => {
      const presetEntry = screen.getByText("Preset IA guardado");
      const serviceEntry = screen.getByText("Override de destino aplicado");
      expect(presetEntry.compareDocumentPosition(serviceEntry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Destino guardado")).toHaveValue("workstation-public");
      expect(screen.getByLabelText("Nombre de opcion")).toHaveValue("Workstation publica (195.35.48.40)");
      expect(screen.getByLabelText("Host / IP")).toHaveValue("195.35.48.40");
    });

    fireEvent.change(screen.getByLabelText("Destino guardado"), {
      target: { value: "this-pc-lan" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Nombre de opcion")).toHaveValue("Este PC (192.168.0.14)");
      expect(screen.getByLabelText("Host / IP")).toHaveValue("192.168.0.14");
    });

    fireEvent.change(screen.getByLabelText("Destino guardado"), {
      target: { value: "workstation-public" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/probe",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            host: "195.35.48.40",
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
            host: "195.35.48.40",
            protocol: "http",
            port: 27002,
            label: "Workstation publica (195.35.48.40)",
          }),
        }),
      );
      expect(screen.getByText("http://195.35.48.40:27002/v1/completions")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Nueva opcion" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Nombre de opcion")).toHaveValue("");
    });
    fireEvent.change(screen.getByLabelText("Nombre de opcion"), {
      target: { value: "Host alternativo" },
    });
    fireEvent.change(screen.getByLabelText("Host / IP"), {
      target: { value: "10.0.0.25" },
    });
    const createButton = screen.getAllByRole("button").find((button) => {
      const label = button.textContent ?? "";
      return /opcion/i.test(label) && !/Nueva/i.test(label) && !/Eliminar/i.test(label);
    });
    expect(createButton).toBeDefined();
    fireEvent.click(createButton!);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/presets",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Host alternativo",
            host: "10.0.0.25",
            protocol: "http",
            port: 7002,
          }),
        }),
      );
      expect(screen.getByRole("option", { name: "Host alternativo" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Destino guardado"), {
      target: { value: "custom-preset" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar opcion" }));

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: "Host alternativo" })).not.toBeInTheDocument();
    });
  });

  it("tolerates legacy ai-engine target and probe payloads without blanking the panel", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: 1,
          presets: [
            {
              id: "legacy-public",
              name: "Legacy public",
              host: "195.35.48.40",
              protocol: "http",
              port: 7002,
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "override",
          label: "workstation-gpu-vps-relay",
          host: "195.35.48.40",
          protocol: "http",
          apiPort: 27001,
          statsPort: 27000,
          apiBaseUrl: "http://195.35.48.40:27001",
          statsBaseUrl: "http://195.35.48.40:27000",
          updatedAt: "2026-04-19T21:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/probe") && options?.method === "POST") {
        return Promise.resolve({
          host: "195.35.48.40",
          protocol: "http",
          apiPort: 7002,
          statsPort: 7001,
          reachable: false,
          api: {
            ok: false,
            status: null,
            url: "http://195.35.48.40:7002/health",
            latencyMs: 5,
            message: "fetch failed",
          },
          stats: {
            ok: false,
            status: null,
            url: "http://195.35.48.40:7001/metrics",
            latencyMs: 4,
            message: "fetch failed",
          },
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && options?.method === "PUT") {
        return Promise.resolve({
          source: "override",
          label: "Legacy public",
          host: "195.35.48.40",
          protocol: "http",
          apiPort: 7002,
          statsPort: 7001,
          apiBaseUrl: "http://195.35.48.40:7002",
          statsBaseUrl: "http://195.35.48.40:7001",
          updatedAt: "2026-04-19T21:05:00.000Z",
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getAllByText("workstation-gpu-vps-relay").length).toBeGreaterThan(0);
      expect(screen.getByText("27001")).toBeInTheDocument();
      expect(screen.getByText("http://195.35.48.40:27001/v1/completions")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

    await waitFor(() => {
      expect(screen.getByText(/Destino con fallos/i)).toBeInTheDocument();
      expect(screen.getByText(/http:\/\/195.35.48.40:7002\/health fetch failed/i)).toBeInTheDocument();
      expect(screen.getByText("Destino del servidor llama")).toBeInTheDocument();
    });
  });

  it("clears ai-target errors after a successful retry", async () => {
    let presetsShouldFail = true;

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "override",
          label: "workstation-gpu",
          host: "195.35.48.40",
          protocol: "http",
          port: 7002,
          llamaBaseUrl: "http://195.35.48.40:7002/v1/completions",
          envLlamaBaseUrl: "http://llama-workstation.invalid:7002/v1/completions",
          updatedAt: "2026-04-19T00:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        if (presetsShouldFail) {
          presetsShouldFail = false;
          return Promise.reject(new Error("HTTP 404: Not Found"));
        }

        return Promise.resolve({
          total: 1,
          presets: [presetsState[0]],
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
      expect(screen.getByLabelText("Destino guardado")).toHaveValue("this-pc-lan");
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
      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: 1,
          presets: [
            {
              id: "broken-env",
              name: "Broken env",
              host: "10.0.0.9",
              protocol: "https",
              port: 8443,
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

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
        expect(screen.getByLabelText("Destino guardado")).toHaveValue("broken-env");
        expect(screen.getByLabelText("Host / IP")).toHaveValue("10.0.0.9");
      });

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

  it("normalizes malformed target and probe payloads when only one preset is available", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: 1,
          presets: [
            {
              id: "single-env",
              name: "Single env",
              host: "relay.internal",
              protocol: "https",
              port: 8443,
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

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
      expect(screen.getByLabelText("Destino guardado")).toHaveValue("single-env");
      expect(screen.getByLabelText("Host / IP")).toHaveValue("relay.internal");
      expect(screen.getByLabelText("Protocolo")).toHaveValue("https");
      expect(screen.getByLabelText("Puerto llama")).toHaveValue("8443");
    });

    fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

    await waitFor(() => {
      expect(screen.getByText(/http:\/\/:7002\/v1\/models sin respuesta/i)).toBeInTheDocument();
    });
  });

  it("uses protocol changes and a safe fallback port when creating presets", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Nueva opcion" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Nueva opcion" }));
    fireEvent.change(screen.getByLabelText("Nombre de opcion"), { target: { value: "TLS relay" } });
    fireEvent.change(screen.getByLabelText("Host / IP"), { target: { value: "relay.example.com" } });
    fireEvent.change(screen.getByLabelText("Protocolo"), { target: { value: "https" } });
    fireEvent.change(screen.getByLabelText("Puerto llama"), { target: { value: "70000" } });
    fireEvent.click(screen.getByRole("button", { name: "Anadir opcion" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/presets",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "TLS relay",
            host: "relay.example.com",
            protocol: "https",
            port: 7002,
          }),
        }),
      );
    });
  });

  it("updates an existing preset and preserves the active selection after reload", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Destino guardado")).toHaveValue("workstation-public");
    });

    fireEvent.change(screen.getByLabelText("Nombre de opcion"), {
      target: { value: "Workstation publica actualizada" },
    });
    fireEvent.change(screen.getByLabelText("Host / IP"), {
      target: { value: "198.51.100.10" },
    });
    fireEvent.change(screen.getByLabelText("Puerto llama"), {
      target: { value: "28002" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opcion" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/ai-engine/presets/workstation-public",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            name: "Workstation publica actualizada",
            host: "198.51.100.10",
            protocol: "http",
            port: 28002,
          }),
        }),
      );
      expect(screen.getByLabelText("Destino guardado")).toHaveValue("workstation-public");
      expect(screen.getByLabelText("Nombre de opcion")).toHaveValue("Workstation publica actualizada");
      expect(screen.getByLabelText("Host / IP")).toHaveValue("198.51.100.10");
    });
  });

  it("shows a generic error when probing the target fails with a non-Error value", async () => {
    const preventUnhandledProbeRejection = (event: PromiseRejectionEvent) => {
      if (event.reason === "probe-broken") {
        event.preventDefault();
      }
    };

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: presetsState.length,
          presets: presetsState,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          source: "override",
          label: "workstation-gpu",
          host: "195.35.48.40",
          protocol: "http",
          port: 27002,
          llamaBaseUrl: "http://195.35.48.40:27002/v1/completions",
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
        expect(screen.getByLabelText("Host / IP")).toHaveValue("195.35.48.40");
      });

      fireEvent.click(screen.getByRole("button", { name: "Verificar conectividad" }));

      await waitFor(() => {
        expect(screen.getByText(/No se pudo gestionar el destino del AI engine: Error desconocido/i)).toBeInTheDocument();
      });
    } finally {
      window.removeEventListener("unhandledrejection", preventUnhandledProbeRejection);
    }
  });

  it("blocks applying a preset when the probe reports an unreachable target", async () => {
    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: 1,
          presets: [
            {
              id: "broken-env",
              name: "Broken env",
              host: "10.0.0.99",
              protocol: "http",
              port: 7002,
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

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
            message: null,
          },
        });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Destino guardado")).toHaveValue("broken-env");
    });

    fireEvent.click(screen.getByRole("button", { name: "Usar este destino" }));

    await waitFor(() => {
      expect(screen.getByText(/El destino no paso la verificacion/i)).toBeInTheDocument();
      expect(
        fetchJsonMock.mock.calls.some(
          ([url, requestOptions]) =>
            url === "http://localhost:7005/v1/backoffice/ai-engine/target" &&
            (requestOptions as RequestInit | undefined)?.method === "PUT",
        ),
      ).toBe(false);
    });
  });

  it("shows generic and specific management errors for refresh, save and remove actions", async () => {
    let failRefresh = false;
    let failSave = false;
    let failDelete = false;

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        if (failRefresh) {
          return Promise.reject("refresh-broken");
        }

        return Promise.resolve({
          total: presetsState.length,
          presets: presetsState,
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/target") && (!options?.method || options.method === "GET")) {
        if (failRefresh) {
          return Promise.reject("refresh-broken");
        }

        return Promise.resolve({
          source: "override",
          label: "workstation-gpu",
          host: "195.35.48.40",
          protocol: "http",
          port: 27002,
          llamaBaseUrl: "http://195.35.48.40:27002/v1/completions",
          envLlamaBaseUrl: null,
          updatedAt: "2026-04-19T00:00:00.000Z",
        });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/presets") && options?.method === "POST") {
        if (failSave) {
          return Promise.reject("save-broken");
        }

        const payload = JSON.parse(String(options.body));
        return Promise.resolve({ id: "new-preset", ...payload, updatedAt: "2026-04-19T00:03:00.000Z" });
      }

      if (url.endsWith("/v1/backoffice/ai-engine/presets/this-pc-lan") && options?.method === "DELETE") {
        if (failDelete) {
          return Promise.reject(new Error("delete-broken"));
        }

        return Promise.resolve({ deleted: true, presetId: "this-pc-lan" });
      }

      throw new Error(`Unhandled URL: ${url}`);
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Destino guardado")).toBeInTheDocument();
    });

    failRefresh = true;
    fireEvent.click(screen.getByRole("button", { name: "Recargar destino IA" }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo gestionar el destino del AI engine: Error desconocido/i)).toBeInTheDocument();
    });

    failRefresh = false;
    fireEvent.click(screen.getByRole("button", { name: "Nueva opcion" }));
    fireEvent.change(screen.getByLabelText("Nombre de opcion"), { target: { value: "Broken save" } });
    fireEvent.change(screen.getByLabelText("Host / IP"), { target: { value: "10.0.0.20" } });
    failSave = true;
    fireEvent.click(screen.getByRole("button", { name: "Anadir opcion" }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo gestionar el destino del AI engine: Error desconocido/i)).toBeInTheDocument();
    });

    failSave = false;
    fireEvent.change(screen.getByLabelText("Destino guardado"), { target: { value: "this-pc-lan" } });
    failDelete = true;
    fireEvent.click(screen.getByRole("button", { name: "Eliminar opcion" }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo gestionar el destino del AI engine: delete-broken/i)).toBeInTheDocument();
    });
  });

});
