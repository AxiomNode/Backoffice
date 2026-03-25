import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider, useI18n } from "../i18n/context";

function Probe() {
  const { t } = useI18n();
  return <p>{t("login.title")}</p>;
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
  });
});
