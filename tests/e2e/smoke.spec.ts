import { expect, test } from "@playwright/test";

// Fumaça pública (sem login) — prova que o app sobe e as páginas públicas renderizam.
test.describe("público (sem login)", () => {
  test("home carrega", async ({ page }) => {
    const resp = await page.goto("/");
    expect(resp?.ok()).toBeTruthy();
  });

  test("tela de login renderiza", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("painel exige login (redireciona)", async ({ page }) => {
    await page.goto("/painel/mesa");
    await expect(page).toHaveURL(/\/login/);
  });
});
