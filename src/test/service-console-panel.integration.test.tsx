import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import { UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../domain/constants/ui";
import type { NavKey, SessionContext } from "../domain/types/backoffice";
import { ServiceConsolePanel } from "../ui/panels/ServiceConsolePanel";

const fetchJsonMock = vi.hoisted(() => vi.fn());
const storeServiceLastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/http/apiClient", () => ({
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
}));

vi.mock("../application/services/operationalSummary", () => ({
  fetchServiceOperationalSummary: vi.fn(),
  storeServiceLastError: storeServiceLastErrorMock,
}));

vi.mock("../ui/components/PaginatedFilterableTable", () => ({
  PaginatedFilterableTable: ({ rows, rowActions }: { rows: Array<Record<string, unknown>>; rowActions?: Array<{ label: string; onClick: (row: Record<string, unknown>) => void }> }) => (
    <div data-testid="paginated-table">
      <div>rows:{rows.length}</div>
      <div data-testid="first-row">{rows[0] ? JSON.stringify(rows[0]) : ""}</div>
      {rows[0] && rowActions?.map((action) => (
        <button key={action.label} type="button" onClick={() => action.onClick(rows[0])}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

const context: SessionContext = {
  mode: "dev",
  devUid: "test-uid",
};

function renderPanel(navKey: NavKey) {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <ServiceConsolePanel navKey={navKey} context={context} density="comfortable" />
    </I18nProvider>,
  );
}

describe("ServiceConsolePanel integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "#/backoffice/svc-users";
    fetchJsonMock.mockReset();
    storeServiceLastErrorMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("shows not found state for non-service nav keys", () => {
    renderPanel("roles");

    expect(screen.getByText("Servicio no encontrado.")).toBeInTheDocument();
  });

  it("isolates per-section failures without breaking successful sections", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-users", title: "Users", domain: "core", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.reject(new Error("metrics down"));
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [{ event: "ok" }] });
      }
      if (url.includes("/data?")) {
        return Promise.reject(new Error("data down"));
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-users");

    await waitFor(() => {
      expect(screen.getByText("metrics down")).toBeInTheDocument();
      expect(screen.getByTestId("paginated-table")).toHaveTextContent("rows:1");
    });

    fireEvent.click(screen.getByRole("tab", { name: "Datos" }));

    await waitFor(() => {
      expect(screen.getByText("data down")).toBeInTheDocument();
    });

    const recordedErrors = storeServiceLastErrorMock.mock.calls
      .filter(([service]) => service === "microservice-users")
      .map(([, message]) => message);

    expect(recordedErrors).toContain("metrics down");
    expect(recordedErrors).toContain("data down");
  });

  it("hides the data section when the catalog marks the service as non-tabular", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "api-gateway", title: "API Gateway", domain: "edge", supportsData: false }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [{ createdAt: "2026-04-20T16:10:00Z", event: "ok" }] });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-api-gateway");

    await waitFor(() => {
      expect(screen.getAllByTestId("paginated-table")).toHaveLength(2);
      expect(screen.queryByRole("tab", { name: "Datos" })).not.toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: "Observabilidad" })).toBeInTheDocument();
  });

  it("shows a service context summary with refresh and dataset state", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-users", title: "Users", domain: "core", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [{ createdAt: "2026-04-20T16:10:00Z", event: "ok" }] });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [{ id: "u1" }, { id: "u2" }], total: 8, page: 1, pageSize: 20 });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-users");

    await waitFor(() => {
      expect(screen.getByText("Users")).toBeInTheDocument();
      expect(screen.getByText("Dataset")).toBeInTheDocument();
      expect(screen.getByText("Roles")).toBeInTheDocument();
      expect(screen.getByText("2/8")).toBeInTheDocument();
      expect(screen.getAllByText("Manual").length).toBeGreaterThan(0);
    });
  });

  it("collapses refresh settings and quick context by default on narrow viewports", async () => {
    const originalInnerWidth = window.innerWidth;

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-users", title: "Users", domain: "core", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [{ createdAt: "2026-04-20T16:10:00Z", event: "ok" }] });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [{ id: "u1" }], total: 1, page: 1, pageSize: 20 });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });

      renderPanel("svc-users");

      await waitFor(() => {
        expect(fetchJsonMock).toHaveBeenCalled();
        expect(screen.getByText("Ajustes de actualizacion")).toBeInTheDocument();
        expect(screen.getByText("Contexto rapido")).toBeInTheDocument();
      });

      expect(screen.queryByLabelText("Actualizacion")).not.toBeInTheDocument();
      expect(screen.queryByText("Dataset")).not.toBeInTheDocument();

      const refreshSection = screen.getByText("Ajustes de actualizacion").closest(".ui-panel-block");
      const contextSection = screen.getByText("Contexto rapido").closest(".ui-panel-block");

      fireEvent.click(within(refreshSection as HTMLElement).getByRole("button", { name: "Mostrar" }));
      fireEvent.click(within(contextSection as HTMLElement).getByRole("button", { name: "Mostrar" }));

      expect(screen.getByLabelText("Actualizacion")).toBeInTheDocument();
      expect(screen.getByText("Dataset")).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    }
  });

  it("normalizes invalid route params and persists query updates", async () => {
    window.location.hash = "#/backoffice/svc-users?page=0&pageSize=999&limit=0&refreshInterval=1&refreshMode=auto&dataset=invalid&filter=abc";

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-users", title: "Users", domain: "core", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-users");

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Datos" }));
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    expect((screen.getByLabelText("Pagina") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Tamano pagina") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Limite fuente") as HTMLInputElement).value).toBe("200");
    expect((screen.getByLabelText("Intervalo") as HTMLSelectElement).value).toBe("10");
    expect((screen.getByLabelText("Dataset") as HTMLSelectElement).value).toBe("roles");

    fireEvent.change(screen.getByLabelText("Filtro"), { target: { value: "nuevo" } });

    await waitFor(() => {
      expect(window.location.hash).toContain("filter=nuevo");
      const storageValue = window.localStorage.getItem(`${UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX}.svc-users`);
      expect(storageValue).toBeTruthy();
      expect(storageValue).toContain("filter=nuevo");
    });
  });

  it("debounces text filter requests before reloading remote data", async () => {
    vi.useFakeTimers();

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-users", title: "Users", domain: "core", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-users");

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Datos" }));
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    const initialDataCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length;
    const initialMetricCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length;
    const initialLogCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length;
    fireEvent.change(screen.getByLabelText("Filtro"), { target: { value: "nuevo filtro" } });

    const immediateDataCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length;
    expect(immediateDataCalls).toBe(initialDataCalls);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
      await Promise.resolve();
    });

    const nextDataCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length;
    expect(nextDataCalls).toBe(initialDataCalls + 1);
    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length).toBe(initialMetricCalls);
    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length).toBe(initialLogCalls);
  });

  it("reloads only paginated data when pagination changes", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-users", title: "Users", domain: "core", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [], total: 55, page: 1, pageSize: 20 });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-users");

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Datos" }));
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    const initialDataCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length;
    const initialMetricCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length;
    const initialLogCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length;

    fireEvent.change(screen.getByLabelText("Pagina"), { target: { value: "2" } });

    await waitFor(() => {
      expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length).toBe(initialDataCalls + 1);
    });

    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length).toBe(initialMetricCalls);
    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length).toBe(initialLogCalls);
  });

  it("auto refresh updates observability without reloading paginated data", async () => {
    vi.useFakeTimers();

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-users", title: "Users", domain: "core", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [], total: 12, page: 1, pageSize: 20 });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-users");

    await act(async () => {
      await Promise.resolve();
    });

    const initialDataCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length;
    const initialMetricCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length;
    const initialLogCalls = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length;

    fireEvent.change(screen.getByLabelText("Actualizacion"), { target: { value: "auto" } });
    fireEvent.change(screen.getByLabelText("Intervalo"), { target: { value: "5" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5200);
      await Promise.resolve();
    });

    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length).toBeGreaterThan(initialMetricCalls);
    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length).toBeGreaterThan(initialLogCalls);
    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/data?")).length).toBe(initialDataCalls);
  });

  it("supports manual insert and delete actions for game history datasets", async () => {
    window.location.hash = "#/backoffice/svc-quiz?dataset=history";

    fetchJsonMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-quiz", title: "Quiz", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "22", name: "Science" }],
            languages: [{ code: "en", name: "English" }],
          },
        });
      }
      if (url.includes("/data/") && options?.method === "DELETE") {
        return Promise.resolve({ deleted: true });
      }
      if (url.includes("/data/") && options?.method === "PATCH") {
        return Promise.resolve({ item: { id: "entry-1", status: "pending_review" } });
      }
      if (url.endsWith("/data") && options?.method === "POST") {
        return Promise.resolve({ item: { id: "entry-1" } });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [{ id: "entry-1", categoryId: "22", categoryName: "Science", language: "en", status: "manual", request: { categoryId: "22", language: "en", difficulty_percentage: 55 }, response: { questions: [{ question: "Q", options: ["A1", "A2"], correct_index: 0 }] } }] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-quiz");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Edicion manual" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Validar" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-quiz/data/entry-1"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    fireEvent.click(screen.getByRole("tab", { name: "Edicion manual" }));

    await waitFor(() => {
      expect(screen.getByText("Alta/baja manual de datos")).toBeInTheDocument();
      expect((screen.getByLabelText("Categoria") as HTMLSelectElement).value).toBe("22");
      expect((screen.getByLabelText("Lenguaje") as HTMLSelectElement).value).toBe("en");
    });

    fireEvent.change(screen.getByLabelText("Pregunta"), {
      target: { value: "Pregunta creada desde backoffice" },
    });
    fireEvent.change(screen.getByLabelText("Opcion A"), {
      target: { value: "Madrid" },
    });
    fireEvent.change(screen.getByLabelText("Opcion B"), {
      target: { value: "Barcelona" },
    });
    fireEvent.change(screen.getByLabelText("Opcion correcta"), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Insertar entrada" }));

    await waitFor(() => {
      expect(screen.getByText("Entrada insertada correctamente.")).toBeInTheDocument();
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-quiz/data"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            dataset: "history",
            categoryId: "22",
            language: "en",
            difficultyPercentage: 55,
            content: {
              questions: [{ question: "Pregunta creada desde backoffice", options: ["Madrid", "Barcelona"], correct_index: 1 }],
            },
            status: "validated",
          }),
        }),
      );
    });

    const metricCallsAfterInsert = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length;
    const logCallsAfterInsert = fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length;

    fireEvent.change(screen.getByLabelText("ID a actualizar"), {
      target: { value: "entry-1" },
    });
    fireEvent.change(screen.getByLabelText("Estado editorial"), {
      target: { value: "pending_review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar entrada" }));

    await waitFor(() => {
      expect(screen.getByText("Entrada actualizada correctamente.")).toBeInTheDocument();
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-quiz/data/entry-1"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/metrics")).length).toBe(metricCallsAfterInsert);
    expect(fetchJsonMock.mock.calls.filter(([url]) => String(url).includes("/logs")).length).toBe(logCallsAfterInsert);

    fireEvent.change(screen.getByLabelText("ID a eliminar"), {
      target: { value: "entry-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Eliminar entrada" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Entrada eliminada correctamente.")).toBeInTheDocument();
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-quiz/data/entry-1?dataset=history"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("shows validation errors for invalid manual json payload", async () => {
    window.location.hash = "#/backoffice/svc-wordpass?dataset=history";

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-wordpass", title: "Wordpass", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "31", name: "Words" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-wordpass");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Edicion manual" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Edicion manual" }));

    fireEvent.change(screen.getByLabelText("Contenido JSON"), {
      target: { value: "[]" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insertar entrada" }));

    await waitFor(() => {
      expect(screen.getByText("El contenido debe ser un objeto JSON.")).toBeInTheDocument();
    });
  });

  it("reads nested wordpass history payloads from response.game and loads them into the editor", async () => {
    window.location.hash = "#/backoffice/svc-wordpass?dataset=history";

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-wordpass", title: "Wordpass", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "31", name: "Words" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({
          rows: [{
            id: "entry-word-1",
            categoryId: "31",
            categoryName: "Words",
            language: "es",
            status: "validated",
            request: { categoryId: "31", language: "es", difficulty_percentage: 40 },
            response: {
              game_type: "word-pass",
              game: {
                words: [{ letter: "A", hint: "Primera pista", answer: "Atomo" }],
              },
            },
          }],
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-wordpass");

    await waitFor(() => {
      expect(screen.getByTestId("first-row")).toHaveTextContent("Atomo");
    });

    fireEvent.click(screen.getByRole("button", { name: "Cargar" }));
    fireEvent.click(screen.getByRole("tab", { name: "Edicion manual" }));

    await waitFor(() => {
      expect((screen.getByLabelText("Letra") as HTMLInputElement).value).toBe("A");
      expect((screen.getByLabelText("Pista") as HTMLInputElement).value).toBe("Primera pista");
      expect((screen.getByLabelText("Respuesta") as HTMLInputElement).value).toBe("Atomo");
    });
  });

  it("keeps manual editor state when switching between service sections", async () => {
    window.location.hash = "#/backoffice/svc-wordpass?dataset=history";

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-wordpass", title: "Wordpass", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "31", name: "Words" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-wordpass");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Edicion manual" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Edicion manual" }));
    fireEvent.change(screen.getByLabelText("Letra"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText("Pista"), { target: { value: "Segunda pista" } });

    fireEvent.click(screen.getByRole("tab", { name: "Observabilidad" }));
    fireEvent.click(screen.getByRole("tab", { name: "Edicion manual" }));

    await waitFor(() => {
      expect((screen.getByLabelText("Letra") as HTMLInputElement).value).toBe("B");
      expect((screen.getByLabelText("Pista") as HTMLInputElement).value).toBe("Segunda pista");
    });
  });

  it("follows a specific generation task in processes dataset", async () => {
    window.location.hash = "#/backoffice/svc-quiz?dataset=processes&followTaskId=11111111-1111-1111-1111-111111111111";

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/backoffice/services")) {
        return Promise.resolve({
          services: [{ key: "microservice-quiz", title: "Quiz", domain: "games", supportsData: true }],
        });
      }
      if (url.includes("/metrics")) {
        return Promise.resolve({ metrics: { traffic: { requestsReceivedTotal: 10 } } });
      }
      if (url.includes("/logs")) {
        return Promise.resolve({ logs: [] });
      }
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "22", name: "Science" }],
            languages: [{ code: "en", name: "English" }],
          },
        });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [{ taskId: "other", status: "running" }] });
      }
      if (url.includes("/generation/process/11111111-1111-1111-1111-111111111111")) {
        return Promise.resolve({
          task: {
            taskId: "11111111-1111-1111-1111-111111111111",
            status: "running",
            requested: 10,
            processed: 3,
            created: 2,
            duplicates: 1,
            failed: 0,
            progress: { current: 3, total: 10, ratio: 0.3 },
          },
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-quiz");

    fireEvent.click(screen.getByRole("tab", { name: "Datos" }));
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));

    await waitFor(() => {
      expect(screen.getByText(/Siguiendo task 11111111-1111-1111-1111-111111111111/i)).toBeInTheDocument();
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-quiz/generation/process/11111111-1111-1111-1111-111111111111"),
        expect.anything(),
      );
    });
  });
});
