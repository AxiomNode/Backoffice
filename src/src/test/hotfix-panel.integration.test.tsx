import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/context";
import type { BackofficeSession } from "../auth";
import type { SessionContext } from "../domain/types/backoffice";
import { HotfixPanel } from "../ui/panels/HotfixPanel";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

function renderPanel(session: BackofficeSession = adminSession, density: "comfortable" | "dense" = "comfortable") {
  return render(
    <I18nProvider language="es" setLanguage={vi.fn()}>
      <HotfixPanel session={session} context={baseContext} density={density} />
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
      if (url.endsWith("/v1/backoffice/services/microservice-quiz/generation/wait")) {
        return Promise.resolve({
          gameType: "quiz",
          task: {
            taskId: "task-1",
            status: "completed",
            requested: 10,
            processed: 10,
            created: 8,
            duplicates: 2,
            failed: 0,
            progress: { current: 10, total: 10, ratio: 1 },
          },
        });
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
    fireEvent.change(screen.getByLabelText("Modo de ejecucion"), {
      target: { value: "wait" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generar quiz" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Catalogo de")).toBeInTheDocument();
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/services/microservice-quiz/generation/wait",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            language: "en",
            categoryId: "15",
            difficultyPercentage: 70,
            itemCount: 5,
            count: 10,
          }),
        }),
      );
      expect(screen.getByText(/Generacion completada para quiz/i)).toBeInTheDocument();
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
        "http://localhost:7005/v1/backoffice/services/microservice-quiz/generation/wait",
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
      if (url.endsWith("/v1/backoffice/services/microservice-wordpass/generation/process")) {
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

  it("keeps user in hotfix and shows pending process when progress mode starts", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.endsWith("/v1/backoffice/services/microservice-quiz/generation/process")) {
        return Promise.resolve({
          gameType: "quiz",
          task: {
            taskId: "11111111-1111-1111-1111-111111111111",
            status: "running",
            requested: 10,
            processed: 0,
            created: 0,
            duplicates: 0,
            failed: 0,
            progress: { current: 0, total: 10, ratio: 0 },
          },
        });
      }
      return Promise.resolve({});
    });

    window.location.hash = "#/backoffice/hotfix";
    renderPanel();

    fireEvent.change(screen.getByLabelText("Modo de ejecucion"), {
      target: { value: "progress" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generar quiz" }));

    await waitFor(() => {
      expect(window.location.hash).toBe("#/backoffice/hotfix");
      expect(screen.getAllByText(/11111111-1111-1111-1111-111111111111/i).length).toBeGreaterThan(0);
    });
  });

  it("falls back to manual inputs for empty quiz catalogs, applies dense styles and renders pending tasks", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({});
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "11", name: "Vocabulario" }],
            languages: [{ code: "en", name: "English" }],
          },
        });
      }
      if (url.includes("/microservice-quiz/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "pending-quiz",
              status: "running",
              requested: 4,
              processed: 2,
              created: 1,
              duplicates: 1,
              failed: 0,
            },
          ],
        });
      }
      if (url.includes("/microservice-wordpass/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }
      return Promise.resolve({});
    });

    renderPanel(adminSession, "dense");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Modificacion en caliente" }).className).toContain("text-lg");
      expect(screen.getByLabelText("ID de categoria (texto)").tagName).toBe("INPUT");
      expect(screen.getByLabelText("Lenguaje").tagName).toBe("INPUT");
      expect(screen.getByText("Acceso de escritura")).toBeInTheDocument();
      expect(screen.getByText("Procesos activos")).toBeInTheDocument();
      expect(screen.getByText("En ejecucion")).toBeInTheDocument();
      expect(screen.getByText("Solicitados")).toBeInTheDocument();
      expect(screen.getByText("Quiz en curso")).toBeInTheDocument();
      expect(screen.getByText("Procesos: 1")).toBeInTheDocument();
      expect(screen.getByText(/pending-quiz/i)).toBeInTheDocument();
      expect(screen.getByText(/Procesados: 2\/4 \(50%\)/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Catalogo de"), { target: { value: "wordpass" } });

    await waitFor(() => {
      expect(screen.getByLabelText("ID de categoria (texto)")).toHaveValue("11");
      expect(screen.getByLabelText("Lenguaje")).toHaveValue("en");
    });
  });

  it("shows catalog and pending errors using the appropriate fallback messages", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.reject("boom");
      }
      if (url.includes("/generation/processes")) {
        return Promise.reject(new Error("pending down"));
      }
      return Promise.resolve({});
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getAllByText("Error desconocido").length).toBeGreaterThan(0);
      expect(screen.getByText("pending down")).toBeInTheDocument();
    });
  });

  it("surfaces catalog errors from Error objects and falls back pending errors for non-Error values", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.reject(new Error("catalog down"));
      }
      if (url.includes("/generation/processes")) {
        return Promise.reject("pending-broken");
      }
      return Promise.resolve({});
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("catalog down")).toBeInTheDocument();
      expect(screen.getAllByText("Error desconocido").length).toBeGreaterThan(0);
    });
  });

  it("shows zero progress percent when a pending task has no requested items and no progress payload", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "11", name: "Vocabulario" }],
            languages: [{ code: "en", name: "English" }],
          },
        });
      }
      if (url.includes("/microservice-quiz/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "pending-zero",
              status: "running",
              requested: 0,
              processed: 3,
              created: 0,
              duplicates: 0,
              failed: 0,
            },
          ],
        });
      }
      if (url.includes("/microservice-wordpass/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }
      return Promise.resolve({});
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/pending-zero/i)).toBeInTheDocument();
      expect(screen.getByText("Estable")).toBeInTheDocument();
      expect(screen.getByText(/Procesados: 3\/0 \(0%\)/i)).toBeInTheDocument();
    });
  });

  it("prioritizes pending tasks with failures or duplicates using explicit risk labels", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "11", name: "Vocabulario" }],
            languages: [{ code: "en", name: "English" }],
          },
        });
      }
      if (url.includes("/microservice-quiz/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "quiz-risky",
              status: "running",
              requested: 5,
              processed: 2,
              created: 1,
              duplicates: 0,
              failed: 1,
            },
          ],
        });
      }
      if (url.includes("/microservice-wordpass/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "wordpass-duplicates",
              status: "running",
              requested: 4,
              processed: 3,
              created: 2,
              duplicates: 1,
              failed: 0,
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/quiz-risky/i)).toBeInTheDocument();
      expect(screen.getByText(/wordpass-duplicates/i)).toBeInTheDocument();
      expect(screen.getByText("Con fallos")).toBeInTheDocument();
      expect(screen.getByText("Con duplicados")).toBeInTheDocument();
    });
  });

  it("orders pending tasks inside each group by risk first and then by most recent timestamp", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "11", name: "Vocabulario" }],
            languages: [{ code: "en", name: "English" }],
          },
        });
      }
      if (url.includes("/microservice-quiz/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "quiz-healthy-new",
              status: "running",
              requested: 5,
              processed: 3,
              created: 3,
              duplicates: 0,
              failed: 0,
              updatedAt: "2026-04-21T13:00:00Z",
            },
            {
              taskId: "quiz-failed-old",
              status: "running",
              requested: 5,
              processed: 2,
              created: 1,
              duplicates: 0,
              failed: 1,
              updatedAt: "2026-04-21T09:00:00Z",
            },
            {
              taskId: "quiz-duplicate-mid",
              status: "running",
              requested: 5,
              processed: 2,
              created: 1,
              duplicates: 2,
              failed: 0,
              updatedAt: "2026-04-21T10:00:00Z",
            },
          ],
        });
      }
      if (url.includes("/microservice-wordpass/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }
      return Promise.resolve({});
    });

    renderPanel();

    await waitFor(() => {
      const quizCards = screen.getAllByTestId("hotfix-pending-task-quiz");
      expect(quizCards).toHaveLength(3);
      expect(quizCards[0]).toHaveTextContent("quiz-failed-old");
      expect(quizCards[1]).toHaveTextContent("quiz-duplicate-mid");
      expect(quizCards[2]).toHaveTextContent("quiz-healthy-new");
    });
  });

  it("updates wordpass selectors, deduplicates pending tasks and sends manual word-pass events", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [
              { id: "11", name: "Vocabulario" },
              { id: "42", name: "Avanzado" },
            ],
            languages: [
              { code: "en", name: "English" },
              { code: "it", name: "Italiano" },
            ],
          },
        });
      }
      if (url.includes("/microservice-quiz/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "quiz-old",
              status: "running",
              requested: 4,
              processed: 1,
              created: 1,
              duplicates: 0,
              failed: 0,
              updatedAt: "2026-04-21T10:00:00Z",
            },
          ],
        });
      }
      if (url.includes("/microservice-wordpass/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "wordpass-running",
              status: "running",
              requested: 6,
              processed: 2,
              created: 1,
              duplicates: 1,
              failed: 0,
              updatedAt: "2026-04-21T12:00:00Z",
            },
          ],
        });
      }
      if (url.endsWith("/v1/backoffice/services/microservice-wordpass/generation/process")) {
        return Promise.resolve({
          gameType: "wordpass",
          task: {
            taskId: "wordpass-running",
            status: "running",
            requested: 8,
            processed: 0,
            created: 0,
            duplicates: 0,
            failed: 0,
            progress: { current: 0, total: 8, ratio: 0 },
          },
        });
      }
      if (url.endsWith("/v1/backoffice/users/events/manual")) {
        return Promise.resolve({ message: "ok" });
      }
      return Promise.resolve({});
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/wordpass-running/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Catalogo de"), { target: { value: "wordpass" } });
    fireEvent.change(screen.getByLabelText("ID de categoria (texto)"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("Lenguaje"), { target: { value: "it" } });
    fireEvent.change(screen.getByLabelText("Cantidad de objetos a generar"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Tipo de juego"), { target: { value: "word-pass" } });

    fireEvent.click(screen.getByRole("button", { name: "Generar word-pass" }));

    await waitFor(() => {
      expect(
        fetchJsonMock.mock.calls.some(
          ([url, options]) =>
            url === "http://localhost:7005/v1/backoffice/services/microservice-wordpass/generation/process" &&
            (options as { body?: string }).body ===
              JSON.stringify({
                language: "it",
                categoryId: "42",
                difficultyPercentage: 55,
                itemCount: 3,
                count: 8,
              }),
        ),
      ).toBe(true);
      expect(screen.getByText("Quiz en curso")).toBeInTheDocument();
      expect(screen.getByText("Word-pass en curso")).toBeInTheDocument();
      expect(screen.getAllByText("Procesos: 1").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/wordpass-running/i).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Registrar evento manual" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/users/events/manual",
        expect.objectContaining({
          body: expect.stringContaining('"gameType":"word-pass"'),
        }),
      );
    });
  });

  it("normalizes empty numeric fields and uses the unknown fallback for non-Error generation failures", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }
      if (url.endsWith("/v1/backoffice/services/microservice-quiz/generation/process")) {
        return Promise.reject("unknown-failure");
      }
      if (url.endsWith("/v1/backoffice/users/events/manual")) {
        return Promise.resolve({ message: "ok" });
      }
      return Promise.resolve({});
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByLabelText("ID de categoria (texto)")).toHaveValue("9");
      expect(screen.getByLabelText("Lenguaje")).toHaveValue("es");
    });

    fireEvent.change(screen.getByLabelText("Dificultad (0-100)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Cantidad de preguntas"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar quiz" }));

    await waitFor(() => {
      expect(
        fetchJsonMock.mock.calls.some(
          ([url, options]) =>
            url === "http://localhost:7005/v1/backoffice/services/microservice-quiz/generation/process" &&
            (options as { body?: string }).body ===
              JSON.stringify({
                language: "es",
                categoryId: "9",
                difficultyPercentage: 0,
                itemCount: 1,
                count: 10,
              }),
        ),
      ).toBe(true);
      expect(screen.getByText("Error desconocido")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Puntuacion"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento manual" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/users/events/manual",
        expect.objectContaining({
          body: expect.stringContaining('"score":0'),
        }),
      );
      expect(screen.getByText(/Evento de juego registrado/i)).toBeInTheDocument();
    });
  });

  it("ignores catalog success updates that resolve after the panel unmounts", async () => {
    const quizCatalog = deferred<{ catalogs: { categories: Array<{ id: string; name: string }>; languages: Array<{ code: string; name: string }> } }>();
    const wordpassCatalog = deferred<{ catalogs: { categories: Array<{ id: string; name: string }>; languages: Array<{ code: string; name: string }> } }>();

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/microservice-quiz/catalogs")) {
        return quizCatalog.promise;
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return wordpassCatalog.promise;
      }
      if (url.includes("/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }
      return Promise.resolve({});
    });

    const view = renderPanel();
    view.unmount();

    quizCatalog.resolve({
      catalogs: {
        categories: [{ id: "90", name: "Late quiz" }],
        languages: [{ code: "pt", name: "Portugues" }],
      },
    });
    wordpassCatalog.resolve({
      catalogs: {
        categories: [{ id: "91", name: "Late word" }],
        languages: [{ code: "it", name: "Italiano" }],
      },
    });

    await Promise.resolve();

    expect(screen.queryByDisplayValue("90")).not.toBeInTheDocument();
  });

  it("ignores catalog errors that arrive after the panel unmounts", async () => {
    const quizCatalog = deferred<never>();
    const wordpassCatalog = deferred<never>();

    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/microservice-quiz/catalogs")) {
        return quizCatalog.promise;
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return wordpassCatalog.promise;
      }
      if (url.includes("/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }
      return Promise.resolve({});
    });

    const view = renderPanel();
    view.unmount();

    quizCatalog.reject(new Error("late catalog error"));
    wordpassCatalog.reject(new Error("late wordpass error"));

    await Promise.resolve();

    expect(screen.queryByText("late catalog error")).not.toBeInTheDocument();
  });

  it("sorts pending tasks even when some timestamps are missing and normalizes empty generation counts", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/microservice-quiz/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/microservice-wordpass/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "11", name: "Vocabulario" }],
            languages: [{ code: "en", name: "English" }],
          },
        });
      }
      if (url.includes("/microservice-quiz/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "quiz-with-time",
              status: "running",
              requested: 7,
              processed: 2,
              created: 2,
              duplicates: 0,
              failed: 0,
              updatedAt: "2026-04-21T11:00:00Z",
            },
            {
              taskId: "quiz-without-time",
              status: "running",
              requested: 5,
              processed: 1,
              created: 1,
              duplicates: 0,
              failed: 0,
            },
          ],
        });
      }
      if (url.includes("/microservice-wordpass/generation/processes")) {
        return Promise.resolve({
          tasks: [
            {
              taskId: "wordpass-with-time",
              status: "running",
              requested: 6,
              processed: 3,
              created: 2,
              duplicates: 0,
              failed: 0,
              updatedAt: "2026-04-21T12:00:00Z",
            },
            {
              taskId: "wordpass-started-only",
              status: "running",
              requested: 4,
              processed: 1,
              created: 1,
              duplicates: 0,
              failed: 0,
              startedAt: "2026-04-21T09:30:00Z",
            },
          ],
        });
      }
      if (url.endsWith("/v1/backoffice/services/microservice-quiz/generation/process")) {
        return Promise.resolve({
          gameType: "quiz",
          task: {
            taskId: "started-quiz",
            status: "running",
            requested: 1,
            processed: 0,
            created: 0,
            duplicates: 0,
            failed: 0,
            progress: { current: 0, total: 1, ratio: 0 },
          },
        });
      }
      return Promise.resolve({});
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/quiz-without-time/i)).toBeInTheDocument();
      expect(screen.getByText(/quiz-with-time/i)).toBeInTheDocument();
      expect(screen.getByText(/wordpass-with-time/i)).toBeInTheDocument();
      expect(screen.getByText(/wordpass-started-only/i)).toBeInTheDocument();
      expect(screen.getByText(/Origen: microservice-quiz \| actualizada:/i)).toBeInTheDocument();
      expect(screen.getByText(/Origen: microservice-wordpass \| actualizada:/i)).toBeInTheDocument();
      expect(screen.getByText(/Origen: microservice-wordpass \| iniciada:/i)).toBeInTheDocument();
      expect(screen.getByText("Origen: microservice-quiz | sin marca temporal")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Cantidad de objetos a generar"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar quiz" }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        "http://localhost:7005/v1/backoffice/services/microservice-quiz/generation/process",
        expect.objectContaining({
          body: JSON.stringify({
            language: "es",
            categoryId: "9",
            difficultyPercentage: 55,
            itemCount: 3,
            count: 1,
          }),
        }),
      );
    });
  });

  it("uses the unknown fallback when manual event registration fails with a non-Error value", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }
      if (url.endsWith("/v1/backoffice/users/events/manual")) {
        return Promise.reject("manual-broken");
      }
      return Promise.resolve({});
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Registrar evento manual" }));

    await waitFor(() => {
      expect(screen.getByText("Error desconocido")).toBeInTheDocument();
    });
  });

  it("shows the Error message when manual event registration fails with an Error instance", async () => {
    fetchJsonMock.mockImplementation((url: string) => {
      if (url.includes("/catalogs")) {
        return Promise.resolve({
          catalogs: {
            categories: [{ id: "9", name: "General" }],
            languages: [{ code: "es", name: "Español" }],
          },
        });
      }
      if (url.includes("/generation/processes")) {
        return Promise.resolve({ tasks: [] });
      }
      if (url.endsWith("/v1/backoffice/users/events/manual")) {
        return Promise.reject(new Error("manual event down"));
      }
      return Promise.resolve({});
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Registrar evento manual" }));

    await waitFor(() => {
      expect(screen.getByText("manual event down")).toBeInTheDocument();
    });
  });
});
