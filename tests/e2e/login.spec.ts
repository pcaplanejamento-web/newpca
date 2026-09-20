import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

// O usuário de teste (seed local) consegue logar e chegar no painel.
test("login do usuário de teste chega no painel", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/painel/);
});
