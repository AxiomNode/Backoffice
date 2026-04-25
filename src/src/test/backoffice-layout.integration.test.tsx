import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { BackofficeSession } from "../auth";
import { UI_SERVICE_ROUTE_QUERY_STORAGE_PREFIX } from "../domain/constants/ui";
import type { SessionContext, UiLanguage, UiTypography } from "../domain/types/backoffice";
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

vi.mock("../ui/panels/AIDiagnosticsPanel", () => ({
  AIDiagnosticsPanel: () => <div data-testid="ai-diagnostics-panel">ai-diagnostics-panel</div>,
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

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

function renderLayout(
  options: {
    session?: Partial<BackofficeSession>;
    theme?: "light" | "dark";
    typography?: "sm" | "normal" | "lg" | "xl" | "xxl";
  } = {},
) {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <BackofficeLayout
        session={{ ...session, ...options.session }}
        context={context}
        onSignOut={vi.fn()}
        theme={options.theme ?? "light"}
        typography={options.typography ?? "normal"}
        onToggleTheme={vi.fn()}
        onTypographyChange={vi.fn()}
      />
    </I18nProvider>,
  );
}

function renderLayoutWithOptions(
  options: {
    session?: Partial<BackofficeSession>;
    theme?: "light" | "dark";
    typography?: "sm" | "normal" | "lg" | "xl" | "xxl";
    onSignOut?: ReturnType<typeof vi.fn>;
    onToggleTheme?: ReturnType<typeof vi.fn>;
    onTypographyChange?: ReturnType<typeof vi.fn>;
    setLanguage?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onSignOut = options.onSignOut ?? vi.fn();
  const onToggleTheme = options.onToggleTheme ?? vi.fn();
  const onTypographyChange = options.onTypographyChange ?? vi.fn();
  const setLanguage = options.setLanguage ?? vi.fn();

  return {
    onSignOut,
    onToggleTheme,
    onTypographyChange,
    setLanguage,
    ...render(
      <I18nProvider language="es" setLanguage={setLanguage as (language: UiLanguage) => void}>
        <BackofficeLayout
          session={{ ...session, ...options.session }}
          context={context}
          onSignOut={onSignOut as () => void}
          theme={options.theme ?? "light"}
          typography={options.typography ?? "normal"}
          onToggleTheme={onToggleTheme as () => void}
          onTypographyChange={onTypographyChange as (value: UiTypography) => void}
        />
      </I18nProvider>,
    ),
  };
}

describe("BackofficeLayout integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "#/backoffice/svc-overview";
    setViewportWidth(1280);
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
    expect(historyPanel?.style.zIndex).toBeTruthy();
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
      const preferencesPanel = document.getElementById("layout-preferences-panel");
      expect(preferencesPanel).not.toBeNull();
      expect(within(preferencesPanel as HTMLElement).getByLabelText("Tamano texto")).toBeInTheDocument();
    });

    const preferencesPanel = document.getElementById("layout-preferences-panel");
    expect(preferencesPanel).toHaveStyle({ position: "fixed" });
    expect(preferencesPanel?.style.left).toBeTruthy();
    expect(preferencesPanel?.style.top).toBeTruthy();
    expect(preferencesPanel?.style.maxHeight).toBeTruthy();
    expect(preferencesPanel?.style.zIndex).toBeTruthy();
    expect(preferencesPanel?.className).toContain("overflow-y-auto");
  });

  it("adapts the deployment history popover width for compact mobile viewports", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });

      renderLayout();

      const historyButton = screen.getByRole("button", { name: /Historico de versiones/i });
      historyButton.getBoundingClientRect = vi.fn<() => DOMRect>().mockReturnValue({
        x: 16,
        y: 280,
        width: 180,
        height: 40,
        top: 280,
        right: 196,
        bottom: 320,
        left: 16,
        toJSON: () => undefined,
      } as DOMRect);

      fireEvent.click(historyButton);

      await waitFor(() => {
        expect(screen.getByText("Versiones desplegadas")).toBeInTheDocument();
      });

      const historyPanel = document.getElementById("deployment-history-panel");
      expect(historyPanel?.style.width).toBe("374px");
      expect(historyPanel?.style.left).toBe("8px");
      expect(historyPanel?.style.top).toBe("326px");
      expect(historyPanel?.style.maxHeight).toBe("448px");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
    }
  });

  it("closes floating header panels when their trigger leaves the viewport on scroll", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    const historyButton = screen.getByRole("button", { name: /Historico de versiones/i });
    const originalGetBoundingClientRect = historyButton.getBoundingClientRect.bind(historyButton);

    fireEvent.click(historyButton);

    await waitFor(() => {
      expect(screen.getByText("Versiones desplegadas")).toBeInTheDocument();
    });

    historyButton.getBoundingClientRect = vi
      .fn<() => DOMRect>()
      .mockImplementation(
        () =>
          ({
            ...originalGetBoundingClientRect(),
            bottom: -24,
            height: 40,
            left: 24,
            right: 210,
            top: -64,
            width: 186,
          }) as DOMRect,
      );

    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.queryByText("Versiones desplegadas")).not.toBeInTheDocument();
    });
  });

  it("closes the deployment history popover on page scroll even while the trigger remains visible", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: /Historico de versiones/i }));

    await waitFor(() => {
      expect(screen.getByText("Versiones desplegadas")).toBeInTheDocument();
    });

    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.queryByText("Versiones desplegadas")).not.toBeInTheDocument();
    });
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

  it("opens and closes the mobile drawer with swipe gestures", async () => {
    setViewportWidth(360);
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.touchStart(screen.getByRole("button", { name: "Menu" }), {
      touches: [{ clientX: 12, clientY: 120 }],
    });
    fireEvent.touchEnd(screen.getByRole("button", { name: "Menu" }), {
      changedTouches: [{ clientX: 110, clientY: 126 }],
    });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    const drawer = screen.getByRole("dialog");
    fireEvent.touchStart(drawer, {
      touches: [{ clientX: 180, clientY: 120 }],
    });
    fireEvent.touchEnd(drawer, {
      changedTouches: [{ clientX: 80, clientY: 126 }],
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes the mobile drawer on Escape and restores body scrolling", async () => {
    setViewportWidth(360);
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(document.body.style.overflow).toBe("");
  });

  it("restores dense mobile preferences and shows active switches in narrow view", async () => {
    window.localStorage.setItem("backoffice.uiDensity", "dense");
    setViewportWidth(360);
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout({ theme: "dark", typography: "xl" });

    expect(screen.getByText("Texto XL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comodo" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Cambiar tema" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "UI" }));

    await waitFor(() => {
      expect(screen.getByText("Tema oscuro")).toBeInTheDocument();
      expect(screen.getByText("Vista densa")).toBeInTheDocument();
    });

    expect(screen.getByRole("switch", { name: "Cambiar vista" })).toHaveAttribute("aria-checked", "true");
  });

  it("shows the XL badge in compact mobile view and toggles dense mode back to comfortable", async () => {
    window.localStorage.setItem("backoffice.uiDensity", "dense");
    setViewportWidth(390);
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout({ theme: "light", typography: "xl" });

    expect(screen.getByText("Texto XL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comodo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Comodo" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("backoffice.uiDensity")).toBe("comfortable");
      expect(screen.getByRole("button", { name: "Denso" })).toBeInTheDocument();
    });
  });

  it("ignores incomplete mobile swipes and routes mobile header select callbacks", async () => {
    setViewportWidth(360);
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    const view = renderLayoutWithOptions({ typography: "normal" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.touchEnd(screen.getByRole("button", { name: "Menu" }), {
      changedTouches: [{ clientX: 110, clientY: 126 }],
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.touchStart(screen.getByRole("button", { name: "Menu" }), {
      touches: [{ clientX: 12, clientY: 120 }],
    });
    fireEvent.touchEnd(screen.getByRole("button", { name: "Menu" }), {
      changedTouches: [{ clientX: 24, clientY: 250 }],
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tamano texto"), { target: { value: "xl" } });

    expect(view.onTypographyChange).toHaveBeenCalledWith("xl");
  });

  it("keeps release history open on internal interactions and closes it on external scroll", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: /Historico de versiones/i }));

    await waitFor(() => {
      expect(screen.getByText("Versiones desplegadas")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText("Versiones desplegadas"));
    fireEvent.scroll(screen.getByText("Versiones desplegadas"));
    expect(screen.getByText("Versiones desplegadas")).toBeInTheDocument();

    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.queryByText("Versiones desplegadas")).not.toBeInTheDocument();
    });
  });

  it("routes UI preference callbacks and closes floating panels with outside interactions", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    const view = renderLayoutWithOptions({ theme: "dark", typography: "normal" });

    fireEvent.click(screen.getByRole("button", { name: /Historico de versiones/i }));

    await waitFor(() => {
      expect(screen.getByText("Versiones desplegadas")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "UI" }));

    await waitFor(() => {
      expect(screen.queryByText("Versiones desplegadas")).not.toBeInTheDocument();
    });

    const preferencesPanel = document.getElementById("layout-preferences-panel") as HTMLElement;
    expect(preferencesPanel).toBeInTheDocument();

    fireEvent.click(within(preferencesPanel).getByRole("switch", { name: "Cambiar tema" }));
    fireEvent.click(within(preferencesPanel).getByRole("switch", { name: "Cambiar vista" }));
    fireEvent.change(within(preferencesPanel).getByDisplayValue("M"), { target: { value: "xl" } });

    expect(view.onToggleTheme).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("backoffice.uiDensity")).toBe("dense");
    expect(view.onTypographyChange).toHaveBeenCalledWith("xl");

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(document.getElementById("layout-preferences-panel")).toBeNull();
    });
  });

  it("keeps the preferences popover open on internal scroll and handles navigation to the current route", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "UI" }));

    await waitFor(() => {
      expect(document.getElementById("layout-preferences-panel")).toBeInTheDocument();
    });

    const preferencesPanel = document.getElementById("layout-preferences-panel") as HTMLElement;

    fireEvent.scroll(preferencesPanel);
    expect(document.getElementById("layout-preferences-panel")).toBeInTheDocument();

    const overviewButtons = screen.getAllByRole("button", { name: /Centro de control/i });
    fireEvent.click(overviewButtons[0]);

    await waitFor(() => {
      expect(document.getElementById("layout-preferences-panel")).toBeNull();
      expect(screen.getByTestId("service-overview-panel")).toBeInTheDocument();
      expect(window.location.hash).toContain("#/backoffice/svc-overview");
    });
  });

  it("calls sign out from the header action", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    const view = renderLayoutWithOptions();

    fireEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(view.onSignOut).toHaveBeenCalledTimes(1);
  });

  it("renders the ai diagnostics panel for roles with write access", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getAllByRole("button", { name: /Laboratorio IA/i })[0]);

    await waitFor(() => {
      expect(screen.getByTestId("ai-diagnostics-panel")).toBeInTheDocument();
    });
  });

  it("renders svc-ai-api with the shared service console tabs", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout();

    fireEvent.click(screen.getAllByRole("button", { name: /Generacion IA/i })[0]);

    await waitFor(() => {
      expect(screen.getByTestId("service-console-panel")).toHaveTextContent("console-panel:svc-ai-api");
      expect(screen.queryByTestId("ai-diagnostics-panel")).not.toBeInTheDocument();
    });
  });

  it("renders the role management panel for super admins", async () => {
    fetchServiceOperationalSummaryMock.mockResolvedValue({
      rows: [],
      totals: { total: 1, onlineCount: 1, accessIssues: 0, connectionErrors: 0 },
    });

    renderLayout({ session: { role: "SuperAdmin" } });

    fireEvent.click(screen.getAllByRole("button", { name: /Accesos y permisos/i })[0]);

    await waitFor(() => {
      expect(screen.getByTestId("roles-panel")).toBeInTheDocument();
    });
  });
});
