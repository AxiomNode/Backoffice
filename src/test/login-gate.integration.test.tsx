import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import { LoginGate } from "../ui/panels/LoginGate";

const authState = vi.hoisted(() => ({
  mode: "firebase" as "firebase" | "dev",
  onSessionChanged: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
const fetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../auth", () => ({
  backofficeAuth: authState,
}));

vi.mock("../application/config/runtime", () => ({
  ADMIN_DEV_UID: "dev-admin",
}));

vi.mock("../infrastructure/http/apiClient", () => ({
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
}));

function renderLoginGate(onAuthenticated = vi.fn()) {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <LoginGate
        onAuthenticated={onAuthenticated}
        theme="light"
        typography="normal"
        onToggleTheme={vi.fn()}
        onTypographyChange={vi.fn()}
      />
    </I18nProvider>,
  );
}

function renderLoginGateWithOptions({
  onAuthenticated = vi.fn(),
  theme = "light" as const,
  typography = "normal" as const,
  onToggleTheme = vi.fn(),
  onTypographyChange = vi.fn(),
  setLanguage = vi.fn(),
} = {}) {
  return {
    onAuthenticated,
    onToggleTheme,
    onTypographyChange,
    setLanguage,
    ...render(
      <I18nProvider language="es" setLanguage={setLanguage}>
        <LoginGate
          onAuthenticated={onAuthenticated}
          theme={theme}
          typography={typography}
          onToggleTheme={onToggleTheme}
          onTypographyChange={onTypographyChange}
        />
      </I18nProvider>,
    ),
  };
}

describe("LoginGate", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    authState.mode = "firebase";
    authState.onSessionChanged.mockReset();
    authState.signInWithGoogle.mockReset();
    fetchJsonMock.mockReset();
  });

  it("does not show the login CTA before the initial Firebase session is resolved", async () => {
    let handler: ((session: { idToken?: string } | null) => void) | null = null;
    authState.onSessionChanged.mockImplementation((nextHandler: (session: { idToken?: string } | null) => void) => {
      handler = nextHandler;
      return vi.fn();
    });

    renderLoginGate();

    expect(screen.getByText("Recuperando sesion...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entrar con Google" })).not.toBeInTheDocument();

    await act(async () => {
      handler?.(null);
    });

    expect(screen.getByRole("button", { name: "Entrar con Google" })).toBeInTheDocument();
  });

  it("bootstraps a restored Firebase session and forwards the authenticated context", async () => {
    let handler: ((session: { idToken?: string } | null) => void) | null = null;
    const onAuthenticated = vi.fn();
    authState.onSessionChanged.mockImplementation((nextHandler: (session: { idToken?: string } | null) => void) => {
      handler = nextHandler;
      return vi.fn();
    });
    fetchJsonMock
      .mockResolvedValueOnce({ role: "Admin" })
      .mockResolvedValueOnce({
        profile: { firebaseUid: "uid-1", displayName: "Ada", email: "ada@example.com" },
        role: "Admin",
      });

    renderLoginGate(onAuthenticated);

    await act(async () => {
      await handler?.({ idToken: "token-1" });
    });

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(
        {
          isAuthenticated: true,
          displayName: "Ada",
          email: "ada@example.com",
          role: "Admin",
          firebaseUid: "uid-1",
          provider: "firebase",
        },
        { mode: "firebase", idToken: "token-1" },
      );
    });
    expect(fetchJsonMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:7005/v1/backoffice/auth/session",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchJsonMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:7005/v1/backoffice/auth/me",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer token-1" }) }),
    );
  });

  it("renders Firebase sign-in errors using the mapped localized messages", async () => {
    let handler: ((session: { idToken?: string } | null) => void) | null = null;
    authState.onSessionChanged.mockImplementation((nextHandler: (session: { idToken?: string } | null) => void) => {
      handler = nextHandler;
      return vi.fn();
    });
    authState.signInWithGoogle.mockRejectedValue({ code: "auth/popup-blocked" });

    renderLoginGate();

    await act(async () => {
      handler?.(null);
    });

    fireEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));

    expect(await screen.findByText("El navegador bloqueo la ventana de Google. Habilita popups e intenta de nuevo.")).toBeInTheDocument();
  });

  it("maps the remaining Firebase auth errors and fallbacks", async () => {
    let handler: ((session: { idToken?: string } | null) => void) | null = null;
    authState.onSessionChanged.mockImplementation((nextHandler: (session: { idToken?: string } | null) => void) => {
      handler = nextHandler;
      return vi.fn();
    });

    const cases = [
      ["auth/unauthorized-domain", "Dominio no autorizado en Firebase Auth. Agrega este dominio en Authorized domains."],
      ["auth/popup-closed-by-user", "Se cerro la ventana de Google antes de completar el acceso."],
      ["auth/operation-not-allowed", "El proveedor Google no esta habilitado en Firebase Auth para este proyecto."],
      ["auth/network-request-failed", "Error de red durante la autenticacion. Verifica tu conexion e intenta de nuevo."],
      ["auth/too-many-requests", "Demasiados intentos de acceso. Espera un momento e intenta nuevamente."],
    ] as const;

    renderLoginGate();

    await act(async () => {
      handler?.(null);
    });

    for (const [code, message] of cases) {
      authState.signInWithGoogle.mockRejectedValueOnce({ code });
      fireEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
      expect(await screen.findByText(message)).toBeInTheDocument();
    }

    authState.signInWithGoogle.mockRejectedValueOnce(new Error("custom auth failure"));
    fireEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    expect(await screen.findByText("custom auth failure")).toBeInTheDocument();

    authState.signInWithGoogle.mockRejectedValueOnce({ code: "auth/unknown" });
    fireEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    expect(await screen.findByText("Error de autenticacion")).toBeInTheDocument();
  });

  it("shows the access error fallback for dev-mode bootstrap failures", async () => {
    authState.mode = "dev";
    fetchJsonMock.mockRejectedValue("boom");

    renderLoginGate();

    fireEvent.change(screen.getByDisplayValue("dev-admin"), { target: { value: "dev-007" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Error de acceso")).toBeInTheDocument();
    expect(fetchJsonMock).toHaveBeenCalledWith(
      "http://localhost:7005/v1/backoffice/auth/session",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-dev-firebase-uid": "dev-007" }),
      }),
    );
  });

  it("bootstraps a dev session using the session role fallback and operator label", async () => {
    authState.mode = "dev";
    const onAuthenticated = vi.fn();

    fetchJsonMock
      .mockResolvedValueOnce({ role: "Admin" })
      .mockResolvedValueOnce({
        profile: { firebaseUid: "dev-uid", displayName: null, email: null },
        role: null,
      });

    renderLoginGate(onAuthenticated);

    fireEvent.change(screen.getByDisplayValue("dev-admin"), { target: { value: "dev-operator" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(
        {
          isAuthenticated: true,
          displayName: "Operador",
          email: undefined,
          role: "Admin",
          firebaseUid: "dev-uid",
          provider: "dev",
        },
        { mode: "dev", devUid: "dev-operator" },
      );
    });
  });

  it("propagates theme, typography and language preference callbacks", async () => {
    let handler: ((session: { idToken?: string } | null) => void) | null = null;
    authState.onSessionChanged.mockImplementation((nextHandler: (session: { idToken?: string } | null) => void) => {
      handler = nextHandler;
      return vi.fn();
    });

    const view = renderLoginGateWithOptions({ theme: "dark", typography: "normal" });

    await act(async () => {
      handler?.(null);
    });

    fireEvent.click(screen.getByRole("button", { name: "Cambiar a claro" }));
    fireEvent.change(screen.getByDisplayValue("M"), { target: { value: "xl" } });
    fireEvent.change(screen.getByDisplayValue("Espanol"), { target: { value: "en" } });

    expect(view.onToggleTheme).toHaveBeenCalledTimes(1);
    expect(view.onTypographyChange).toHaveBeenCalledWith("xl");
    expect(view.setLanguage).toHaveBeenCalledWith("en");
  });

  it("shows the generic auth fallback when restoring a Firebase session fails with a non-error", async () => {
    let handler: ((session: { idToken?: string } | null) => void) | null = null;
    authState.onSessionChanged.mockImplementation((nextHandler: (session: { idToken?: string } | null) => void) => {
      handler = nextHandler;
      return vi.fn();
    });
    fetchJsonMock.mockRejectedValue("nope");

    renderLoginGate();

    await act(async () => {
      await handler?.({ idToken: "token-3" });
    });

    expect(await screen.findByText("Error de autenticacion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar con Google" })).toBeInTheDocument();
  });

  it("rejects restored Firebase sessions whose role has no backoffice access", async () => {
    let handler: ((session: { idToken?: string } | null) => void) | null = null;
    authState.onSessionChanged.mockImplementation((nextHandler: (session: { idToken?: string } | null) => void) => {
      handler = nextHandler;
      return vi.fn();
    });
    fetchJsonMock
      .mockResolvedValueOnce({ role: "Gamer" })
      .mockResolvedValueOnce({
        profile: { firebaseUid: "uid-2", displayName: null, email: "viewer@example.com" },
        role: "Gamer",
      });

    renderLoginGate();

    await act(async () => {
      await handler?.({ idToken: "token-2" });
    });

    expect(await screen.findByText("El rol Gamer no tiene acceso al backoffice.")).toBeInTheDocument();
  });
});