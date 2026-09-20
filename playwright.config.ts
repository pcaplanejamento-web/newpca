import { defineConfig, devices } from "@playwright/test";

/**
 * E2E dos fluxos LOGADOS (Mesa + Configurações/Protocolação) — o que os testes puros
 * (node:test) não cobrem. Roda contra o app LOCAL (`next dev` → Miniflare/D1 local),
 * com um usuário de teste semeado (ver `tests/e2e/global-setup.ts`). NUNCA toca produção.
 *
 * Assunção a validar na CI: o `next dev` (via initOpenNextCloudflareForDev) e o
 * `wrangler d1 ... --local` compartilham o MESMO estado local (`.wrangler/state`), então
 * o seed feito no global-setup fica visível para o servidor.
 */
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // D1 local é compartilhado → sem paralelismo p/ evitar corrida de escrita.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  globalSetup: "./tests/e2e/global-setup",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  // Next 16 usa Turbopack por padrão no `next dev`; este projeto tem config WEBPACK
  // (alias canvas p/ o pdfjs), então força webpack — igual ao `next build --webpack`.
  webServer: {
    command: "npx next dev --webpack",
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
