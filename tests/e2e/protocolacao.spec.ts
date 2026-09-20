import { expect, type Page, test } from "@playwright/test";
import { login } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await login(page);
});

// Abre Configurações → Avaliação → sub-aba Protocolação (a área nova do Round K).
async function abrirProtocolacao(page: Page): Promise<void> {
  await page.goto("/painel/configuracoes");
  await page.getByText("Avaliação", { exact: true }).first().click();
  await page.getByText("Protocolação", { exact: true }).first().click();
  await expect(page.getByText("Assuntos permitidos")).toBeVisible();
}

test("aba Protocolação renderiza", async ({ page }) => {
  await abrirProtocolacao(page);
  await expect(page.getByRole("button", { name: /Adicionar assunto/i })).toBeVisible();
});

test("cadastra um assunto e salva (persiste após recarregar)", async ({ page }) => {
  await abrirProtocolacao(page);
  await page.getByRole("button", { name: /Adicionar assunto/i }).click();
  await page.getByPlaceholder(/Aquisição/i).last().fill("Aquisição");
  await page.getByRole("button", { name: /^Salvar/i }).click();
  // Confirma pela PERSISTÊNCIA (recarrega e reabre a aba): o assunto continua lá.
  await page.reload();
  await page.getByText("Avaliação", { exact: true }).first().click();
  await page.getByText("Protocolação", { exact: true }).first().click();
  await expect(page.getByDisplayValue("Aquisição")).toBeVisible();
});
