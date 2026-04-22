import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider, useI18n } from "../i18n/context";

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

  it("throws when the hook is used outside the provider", () => {
    expect(() => render(<Probe />)).toThrow("useI18n must be used inside I18nProvider");
  });
});
