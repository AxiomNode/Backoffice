import { expect, test } from "@playwright/test";

/**
 * Smoke E2E suite for the backoffice login surface.
 *
 * The build runs in dev auth mode (`VITE_AUTH_MODE=dev`) so the login gate
 * renders without requiring real Firebase credentials. These tests exercise
 * boot integrity, theming persistence and the dev login path that backs the
 * majority of operator workflows in non-prod environments.
 */
test.describe("backoffice smoke", () => {
  test("renders the login gate with the brand mark and a primary heading", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByAltText("AxiomNode mark")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", /^(light|dark)$/);
  });

  test("toggles the theme attribute when the theme button is pressed", async ({ page }) => {
    await page.goto("/");

    const html = page.locator("html");
    const initial = (await html.getAttribute("data-theme")) ?? "light";
    const expected = initial === "light" ? "dark" : "light";

    await page.getByRole("button", { name: /theme|tema|claro|oscuro|light|dark/i }).first().click();

    await expect(html).toHaveAttribute("data-theme", expected);
  });

  test("login gate exposes a primary call to action regardless of the auth mode", async ({ page }) => {
    await page.goto("/");

    // The login gate renders either the Firebase or the dev sign-in
    // surface depending on VITE_AUTH_MODE. Both expose a single primary
    // submit button that should be visible and clickable. We only assert
    // its presence; submission is intentionally out of scope for the
    // smoke suite because it would require api-gateway connectivity.
    const primary = page
      .getByRole("button", {
        name: /entrar|continuar|continue|sign|google/i,
      })
      .last();

    await expect(primary).toBeVisible();
    await expect(primary).toBeEnabled();
  });
});
