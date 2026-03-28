import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { BackofficeSession } from "../auth";
import type { SessionContext } from "../domain/types/backoffice";
import { HotfixPanel } from "../ui/panels/HotfixPanel";

const fetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/http/apiClient", () => ({
  EDGE_API_BASE: "http://localhost:7005",
  fetchJson: fetchJsonMock,
}));

const baseContext: SessionContext = {
  mode: "dev",
  devUid: "uid-test",
};

const adminSession: BackofficeSession = {
  isAuthenticated: true,
  displayName: "Admin",
  email: "admin@example.com",
  role: "Admin",
  firebaseUid: "uid-admin",
  provider: "dev",
};

function renderPanel(session: BackofficeSession = adminSession) {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <HotfixPanel session={session} context={baseContext} density="comfortable" />
    </I18nProvider>,
  );
}

describe("HotfixPanel integration", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/v1/backoffice/services/microservice-quiz/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/v1/backoffice/services/microservice-wordpass/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "11", name: "Vocabulario" }],
            languages: [{ code: "en", name: "English" }],
          },
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("sends manual generation using category, language and difficulty", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.endsWith("/v1/mobile/games/quiz/generate")) {
        return Promise.resolve({ gameType: "quiz" });
      }
      return Promise.resolve({});
    });

    renderPanel();

    fireEvent.change(screen.getByLabelText("ID de categoria (texto)"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("Lenguaje"), {
      target: { value: "en" },
    });
    fireEvent.change(screen.getByLabelText("Dificultad (0-100)"), {
      target: { value: "70" },
    });
    fireEvent.change(screen.getByLabelText("Cantidad de preguntas"), {
      target: { value: "5" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generar quiz" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Catalogo de")).toBeInTheDocument();
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/mobile/games/quiz/generate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            language: "en",
            categoryId: "15",
            difficultyPercentage: 70,
            numQuestions: 5,
          }),
        }),
      );
      expect(screen.getByText(/Generacion OK para quiz/i)).toBeInTheDocument();
    });
  });

  it("blocks modifications for read-only role", async () => {
    const viewerSession: BackofficeSession = {
      ...adminSession,
      role: "Viewer",
    };

    renderPanel(viewerSession);

    fireEvent.click(screen.getByRole("button", { name: "Generar quiz" }));

    await waitFor(() => {
      expect(screen.getByText(/solo observacion/i)).toBeInTheDocument();
      expect(fetchJsonMock).not.toHaveBeenCalledWith(
        "http://localhost:7005/v1/mobile/games/quiz/generate",
        expect.anything(),
      );
    });
  });

  it("registers manual event payload", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.endsWith("/v1/backoffice/users/events/manual")) {
        return Promise.resolve({ message: "ok" });
      }
      return Promise.resolve({});
    });

    renderPanel();

    fireEvent.change(screen.getByLabelText("Lenguaje"), {
      target: { value: "fr" },
    });
    fireEvent.change(screen.getByLabelText("Puntuacion"), {
      target: { value: "95" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento manual" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/users/events/manual",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"language":"fr"'),
        }),
      );
      expect(screen.getByText(/Evento de juego registrado/i)).toBeInTheDocument();
    });
  });

  it("shows error message when generation fails", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.endsWith("/v1/mobile/games/wordpass/generate")) {
        return Promise.reject(new Error("ai-engine timeout"));
      }
      return Promise.resolve({});
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Generar word-pass" }));

    await waitFor(() => {
      expect(screen.getByText("ai-engine timeout")).toBeInTheDocument();
    });
  });
});
