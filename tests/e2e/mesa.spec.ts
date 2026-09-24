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

// A barra da Mesa: o ícone do Dashboard (à esquerda das visões) abre o Dashboard de governança (carregado sob demanda) e
// o "Importar protocolo" fica no RODAPÉ da tabela (o usuário de teste é admin — editor).
test("Mesa: ícone do Dashboard abre a governança e a importação fica no rodapé da tabela", async ({ page }) => {
  await page.goto("/painel/mesa");
  await expect(page.getByRole("button", { name: "Importar protocolo" })).toBeVisible();
  await page.getByRole("tab", { name: "Dashboard de governança" }).click();
  await expect(page.getByText("Saúde dos protocolos", { exact: true })).toBeVisible();
  await expect(page.getByText("Carga por responsável", { exact: true })).toBeVisible();
  // O Dashboard não tem tabela nem botão de importação.
  await expect(page.getByRole("button", { name: "Importar protocolo" })).toHaveCount(0);
});
