import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../ui/panels/HotfixPanel", () => ({
  HotfixPanel: () => <div data-testid="hotfix-panel">hotfix-panel</div>,
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
        accent="ocean"
        typography="normal"
        onToggleTheme={vi.fn()}
        onAccentChange={vi.fn()}
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

    const gatewayButtons = screen.getAllByRole("button", { name: /API Gateway/i });
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

    const gatewayButtons = screen.getAllByRole("button", { name: /API Gateway/i });
    fireEvent.click(gatewayButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("service-console-panel")).toHaveTextContent("console-panel:svc-api-gateway");
      expect(window.location.hash).toContain("#/backoffice/svc-api-gateway");
    });
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

  it("shows unknown semaphore when summary retrieval fails", async () => {
    fetchServiceOperationalSummaryMock.mockRejectedValue(new Error("network unavailable"));

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("Sin señal")).toBeInTheDocument();
    });
  });
});
