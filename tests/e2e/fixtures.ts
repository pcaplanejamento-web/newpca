import { type Page, expect } from "@playwright/test";

/**
 * Credenciais do usuário de teste SEMEADO no D1 local (ver `global-setup.ts`).
 * NÃO é segredo: o banco é local/efêmero e o usuário é descartável. Nunca use isto
 * contra produção.
 */
export const E2E_EMAIL = "e2e@teste.local";
export const E2E_SENHA = "E2e-teste-2026!";

/** Faz login pelo formulário real (/login → POST /api/auth/login → cookie) e espera o painel. */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/painel/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/painel/);
}
