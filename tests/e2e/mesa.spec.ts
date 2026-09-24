import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await login(page);
});

// A tela "Mesa" (Round K) renderiza com a visão única (Protocolos/DFDs/Itens).
test("Mesa (/painel/mesa) abre e mostra as 3 visões", async ({ page }) => {
  await page.goto("/painel/mesa");
  await expect(page).toHaveURL(/\/painel\/mesa/);
  for (const label of ["Protocolos", "DFDs", "Itens"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

// A rota antiga /painel/dfds redireciona para /painel/mesa (A1).
test("/painel/dfds redireciona para /painel/mesa", async ({ page }) => {
  await page.goto("/painel/dfds");
  await expect(page).toHaveURL(/\/painel\/mesa/);
});

// `/painel` é só a porta de entrada: leva à Mesa (o antigo Dashboard e a tela Protocolos legada saíram).
test("/painel redireciona para /painel/mesa", async ({ page }) => {
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/painel\/mesa/);
});
