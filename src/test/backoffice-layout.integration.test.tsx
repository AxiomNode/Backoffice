import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { BackofficeSession } from "../auth";
import { UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../domain/constants/ui";
import type { SessionContext } from "../domain/types/backoffice";
import { BackofficeLayout } from "../ui/layout/BackofficeLayout";

const fetchServiceOperationalSummaryMock = vi.hoisted(() => vi.fn());

vi.mock("../application/services/operationalSummary", () => ({
  fetchServiceOperationalSummary: fetchServiceOperationalSummaryMock,
  storeServiceLastError: vi.fn(),
}));

vi.mock("../ui/panels/ServiceOverviewPanel", () => ({
  ServiceOverviewPanel: () => <div data-testid="service-overview-panel">overview-panel</div>,
}));

vi.mock("../ui/panels/ServiceConsolePanel", () => ({
  ServiceConsolePanel: ({ navKey }: { navKey: string }) => <div data-testid="service-console-panel">console-panel:{navKey}</div>,
}));

vi.mock("../ui/panels/RoleManagementPanel", () => ({
  RoleManagementPanel: () => <div data-testid="roles-panel">roles-panel</div>,
}));

const session: BackofficeSession = {
  isAuthenticated: true,
  displayName: "Tester",
  email: "tester@example.com",
  role: "Admin",
  firebaseUid: "uid-test",
  provider: "dev",
};

const context: SessionContext = {
  mode: "dev",
  devUid: "uid-test",
};

function renderLayout() {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <BackofficeLayout
        session={session}
        context={context}
        onSignOut={vi.fn()}
        theme="light"
        typography="normal"
        onToggleTheme={vi.fn()}
        onTypographyChange={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("BackofficeLayout integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "#/backoffice/svc-overview";
    fetchServiceOperationalSummaryMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("restores saved service query from localStorage on navigation", async () => {
    window.localStorage.setItem(
      `${UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX}.svc-api-gateway`,
      "refreshMode=auto&refreshInterval=15&limit=50",
    );

    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 0, onlineCount: 0, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    const gatewayButtons = screen.getAllByRole("button", { name: /Entrada publica/i });
    fireEvent.click(gatewayButtons[0]);

    await waitFor(() => {
      expect(window.location.hash).toContain("#/backoffice/svc-api-gateway?refreshMode=auto&refreshInterval=15&limit=50");
      expect(screen.getByTestId("service-console-panel")).toHaveTextContent("console-panel:svc-api-gateway");
    });
  });

  it("navigates from overview route to service console route", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 0, onlineCount: 0, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    expect(screen.getByTestId("service-overview-panel")).toBeInTheDocument();

    const gatewayButtons = screen.getAllByRole("button", { name: /Entrada publica/i });
    fireEvent.click(gatewayButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("service-console-panel")).toHaveTextContent("console-panel:svc-api-gateway");
      expect(window.location.hash).toContain("#/backoffice/svc-api-gateway");
    });
  });

  it("groups sidebar entries by functional area", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 0, onlineCount: 0, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    expect(screen.getAllByText("Vision general").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Plataforma").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Juego y datos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("IA y diagnostico").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Infra y pasarelas con impacto transversal").length).toBeGreaterThan(0);
  });

  it("marks the current sidebar destination as the active page", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 0, onlineCount: 0, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    const overviewButtons = screen.getAllByRole("button", { name: /Centro de control/i });
    expect(overviewButtons[0]).toHaveAttribute("aria-current", "page");
  });

  it("does not render the hot modification section in the sidebar", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 0, onlineCount: 0, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    expect(screen.queryByRole("button", { name: /Operaciones delicadas/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Operaciones delicadas")).not.toBeInTheDocument();
  });

  it("shows critical semaphore when connection errors are present", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 4, onlineCount: 2, accessIssues: 0, connectionErrors: 2 },
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("Critico")).toBeInTheDocument();
      expect(screen.getByText(/2 errores conexion/i)).toBeInTheDocument();
    });
  });

  it("shows warning semaphore when services are partially offline without connection errors", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 5, onlineCount: 4, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("Atencion")).toBeInTheDocument();
      expect(screen.getByText(/4\/5 online/i)).toBeInTheDocument();
    });
  });

  it("shows healthy semaphore when all services are online", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 3, onlineCount: 3, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("Estable")).toBeInTheDocument();
      expect(screen.getByText(/3\/3 online/i)).toBeInTheDocument();
    });
  });

  it("shows unknown semaphore when summary retrieval fails", async () => {
    fetchServiceOperationalSummaryMock.mockRejectedValue(new Error("network unavailable"));

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("Sin señal")).toBeInTheDocument();
    });
  });

  it("shows deployed version metadata and toggles deployment history", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    expect(screen.getByText(/Version: 7f9015b/i)).toBeInTheDocument();
    expect(screen.getByText(/Desplegada: 2026-04-19 22:00 UTC/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Historico de versiones/i }));

    await waitFor(() => {
      expect(screen.getByText("Versiones desplegadas")).toBeInTheDocument();
      expect(screen.getByText("Compatibilidad con payloads legacy del target/probe de IA")).toBeInTheDocument();
      expect(screen.getByText("28f3fd9")).toBeInTheDocument();
    });

    const historyPanel = document.getElementById("deployment-history-panel");
    expect(historyPanel).toHaveStyle({ position: "fixed" });
    expect(historyPanel?.style.left).toBeTruthy();
    expect(historyPanel?.style.top).toBeTruthy();
    expect(historyPanel?.style.maxHeight).toBeTruthy();
    expect(historyPanel?.className).toContain("overflow-hidden");
  });

  it("opens the UI preferences panel without overloading the main header", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "UI" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Tamano texto")).toBeInTheDocument();
      expect(screen.getAllByLabelText("Idioma").length).toBeGreaterThan(0);
    });

    const preferencesPanel = document.getElementById("layout-preferences-panel");
    expect(preferencesPanel).toHaveStyle({ position: "fixed" });
    expect(preferencesPanel?.style.left).toBeTruthy();
    expect(preferencesPanel?.style.top).toBeTruthy();
    expect(preferencesPanel?.style.maxHeight).toBeTruthy();
    expect(preferencesPanel?.className).toContain("overflow-y-auto");
  });

  it("closes floating header panels when navigating from the sidebar", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: /Historico de versiones/i }));

    await waitFor(() => {
      expect(screen.getByText("Versiones desplegadas")).toBeInTheDocument();
    });

    const gatewayButtons = screen.getAllByRole("button", { name: /Entrada publica/i });
    fireEvent.click(gatewayButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText("Versiones desplegadas")).not.toBeInTheDocument();
      expect(screen.getByTestId("service-console-panel")).toHaveTextContent("console-panel:svc-api-gateway");
    });
  });

  it("closes the mobile drawer after sidebar navigation", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const drawer = await screen.findByRole("dialog");

    expect(drawer).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: /Entrada publica/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByTestId("service-console-panel")).toHaveTextContent("console-panel:svc-api-gateway");
    });
  });

  it("closes the mobile drawer when the backdrop is pressed", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: /Cerrar menu/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
