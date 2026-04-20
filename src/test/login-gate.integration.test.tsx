import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import { LoginGate } from "../ui/panels/LoginGate";

const onSessionChangedMock = vi.hoisted(() => vi.fn());
const signInWithGoogleMock = vi.hoisted(() => vi.fn());

vi.mock("../auth", () => ({
  backofficeAuth: {
    mode: "firebase",
    onSessionChanged: onSessionChangedMock,
    signInWithGoogle: signInWithGoogleMock,
  },
}));

vi.mock("../application/config/runtime", () => ({
  ADMIN_DEV_UID: "dev-admin",
}));

vi.mock("../infrastructure/http/apiClient", () => ({
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: vi.fn(),
}));

describe("LoginGate", () => {
  it("does not show the login CTA before the initial Firebase session is resolved", async () => {
    let handler: ((session: { idToken?: string } | null) => void) | null = null;
    onSessionChangedMock.mockImplementation((nextHandler: (session: { idToken?: string } | null) => void) => {
      handler = nextHandler;
      return vi.fn();
    });

    render(
      <I18nProvider language="es" setLanguage={vi.fn()}>
        <LoginGate
          onAuthenticated={vi.fn()}
          theme="light"
          typography="normal"
          onToggleTheme={vi.fn()}
          onTypographyChange={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Recuperando sesion...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entrar con Google" })).not.toBeInTheDocument();

    await act(async () => {
      handler?.(null);
    });

    expect(screen.getByRole("button", { name: "Entrar con Google" })).toBeInTheDocument();
  });
});