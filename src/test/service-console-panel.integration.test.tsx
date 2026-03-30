import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  PaginatedFilterableTable: ({ rows }: { rows: Array<Record<string, unknown>> }) => (
    <div data-testid="paginated-table">rows:{rows.length}</div>
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
    cleanup();
  });

  it("shows not found state for non-service nav keys", () => {
    renderPanel("hotfix");

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
      expect(screen.getByText("data down")).toBeInTheDocument();
      expect(screen.getByTestId("paginated-table")).toHaveTextContent("rows:1");
    });

    expect(storeServiceLastErrorMock).toHaveBeenCalledTimes(2);
    expect(storeServiceLastErrorMock).toHaveBeenCalledWith("microservice-users", "metrics down");
    expect(storeServiceLastErrorMock).toHaveBeenCalledWith("microservice-users", "data down");
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

    expect((screen.getByLabelText("Pagina") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Tamano pagina") as HTMLInputElement).value).toBe("20");
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
      if (url.endsWith("/data") && options?.method === "POST") {
        return Promise.resolve({ item: { id: "entry-1" } });
      }
      if (url.includes("/data?")) {
        return Promise.resolve({ rows: [{ id: "entry-1", question: "Q" }] });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderPanel("svc-quiz");

    await waitFor(() => {
      expect(screen.getByText("Alta/baja manual de datos")).toBeInTheDocument();
      expect((screen.getByLabelText("Categoria") as HTMLSelectElement).value).toBe("22");
      expect((screen.getByLabelText("Lenguaje") as HTMLSelectElement).value).toBe("en");
    });

    fireEvent.change(screen.getByLabelText("Contenido JSON"), {
      target: { value: '{"question":"Q"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insertar entrada" }));

    await waitFor(() => {
      expect(screen.getByText("Entrada insertada correctamente.")).toBeInTheDocument();
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-quiz/data"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    fireEvent.change(screen.getByLabelText("ID a eliminar"), {
      target: { value: "entry-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Eliminar entrada" }));

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
      expect(screen.getByText("Alta/baja manual de datos")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Contenido JSON"), {
      target: { value: "[]" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insertar entrada" }));

    await waitFor(() => {
      expect(screen.getByText("El contenido debe ser un objeto JSON.")).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByText(/Siguiendo task 11111111-1111-1111-1111-111111111111/i)).toBeInTheDocument();
      expect(fetchJsonMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/backoffice/services/microservice-quiz/generation/process/11111111-1111-1111-1111-111111111111"),
        expect.anything(),
      );
    });
  });
});
