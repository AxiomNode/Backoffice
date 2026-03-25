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
});
