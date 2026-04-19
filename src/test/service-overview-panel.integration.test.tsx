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
      if (url.endsWith("/v1/backoffice/ai-engine/presets") && (!options?.method || options.method === "GET")) {
        return Promise.resolve({
          total: presetsState.length,
          presets: presetsState,
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
      expect(screen.getByText("Etiqueta actual")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Destino guardado")).toHaveValue("this-pc-lan");
      expect(screen.getByLabelText("Nombre de opcion")).toHaveValue("Este PC (192.168.0.14)");
      expect(screen.getByLabelText("Host / IP")).toHaveValue("192.168.0.14");
    });

    fireEvent.change(screen.getByLabelText("Destino guardado"), {
      target: { value: "workstation-public" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Nombre de opcion")).toHaveValue("Workstation publica (195.35.48.40)");
      expect(screen.getByLabelText("Host / IP")).toHaveValue("195.35.48.40");
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

    await waitFor(() => {
      expect(screen.getByText(/No se pudo gestionar el destino del AI engine/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Recargar destino IA" }));

    await waitFor(() => {
      expect(screen.queryByText(/No se pudo gestionar el destino del AI engine/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Destino guardado")).toHaveValue("this-pc-lan");
    });
  });

});
