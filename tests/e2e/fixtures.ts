import { type Page, expect } from "@playwright/test";
import { E2E_EMAIL, E2E_SENHA } from "./creds";

export { E2E_EMAIL, E2E_SENHA };

/** Faz login pelo formulário real (/login → POST /api/auth/login → cookie) e espera o painel. */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/painel/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/painel/);
}
