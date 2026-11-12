import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider, useI18n } from "../i18n/context";
import { getLoadedDictionary, loadDictionary, resolveLabel } from "../i18n/labels";

// English is the bundled base dictionary and the fallback.
const LABELS_EN_PROBE = (await loadDictionary("en")) as Record<string, string>;

function Probe() {
  const { language, setLanguage, t } = useI18n();
  return (
    <>
      <p>{t("login.title")}</p>
      <p>{t("table.showing", { from: 1, to: 3, total: 9 })}</p>
      <button type="button" onClick={() => setLanguage(language)}>
        keep-language
      </button>
    </>
  );
}

describe("i18n smoke", () => {
  it("renders translated login title in Spanish", () => {
    const setLanguage = vi.fn();

    render(
      <I18nProvider language="es" setLanguage={setLanguage}>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("Acceso Backoffice")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1-3 de 9 filas")).toBeInTheDocument();

    screen.getByRole("button", { name: "keep-language" }).click();
    expect(setLanguage).toHaveBeenCalledWith("es");
  });
});

describe("i18n lazy dictionaries", () => {
  it("keeps the context value stable across parent re-renders", () => {
    const seen: unknown[] = [];
    function Capture() {
      seen.push(useI18n());
      return null;
    }
    const setLanguage = vi.fn();
    const ui = (
      <I18nProvider language="en" setLanguage={setLanguage}>
        <Capture />
      </I18nProvider>
    );

    const { rerender } = render(ui);
    rerender(ui);
    rerender(
      <I18nProvider language="en" setLanguage={setLanguage}>
        <Capture />
      </I18nProvider>,
    );

    expect(new Set(seen).size).toBe(1);
  });

  it("shows English first and swaps in a language dictionary once its chunk has loaded", async () => {
    render(
      <I18nProvider language="fr" setLanguage={vi.fn()}>
        <Probe />
      </I18nProvider>,
    );

    expect(getLoadedDictionary("fr")).toBeNull();
    expect(screen.getByText("Backoffice access")).toBeInTheDocument();
    expect(await screen.findByText("Acces Backoffice")).toBeInTheDocument();
    expect(getLoadedDictionary("fr")).not.toBeNull();
  });

  it("falls back to English for keys missing from a partial dictionary", async () => {
    const de = await loadDictionary("de");
    const missing = Object.keys(LABELS_EN_PROBE).find((key) => !(key in de));
    expect(missing).toBeDefined();
    expect(resolveLabel(de, missing as string)).toBe(LABELS_EN_PROBE[missing as string]);
    expect(resolveLabel(de, "no.such.key")).toBe("no.such.key");
  });

  it("serves English synchronously without loading anything", async () => {
    expect(getLoadedDictionary("en")).not.toBeNull();
    expect(await loadDictionary("en")).toBe(getLoadedDictionary("en"));
  });
});
