import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hashSenha } from "../../src/lib/password.ts";
import { E2E_EMAIL, E2E_SENHA } from "./creds.ts";

/**
 * Prepara o D1 LOCAL (Miniflare) ANTES do Playwright: aplica as migrações e semeia um
 * usuário de teste (admin/ativo). Roda como `pretest:e2e` (hook do npm), então TERMINA
 * antes do `next dev` subir — o servidor lê o mesmo estado local (`.wrangler/state`).
 * Nada toca produção; o usuário é descartável (senha = constante do teste).
 */
const DB = "newpca-db";

async function main(): Promise<void> {
  console.log("=== E2E seed: migrar + semear D1 local ===");
  execSync(`npx wrangler d1 migrations apply ${DB} --local`, { stdio: "inherit" });

  const hash = await hashSenha(E2E_SENHA);
  const sql = [
    `DELETE FROM usuarios WHERE email = '${E2E_EMAIL}';`,
    `INSERT INTO usuarios (email, nome, senha_hash, role, status)`,
    `VALUES ('${E2E_EMAIL}', 'E2E Admin', '${hash}', 'admin', 'ativo');`,
  ].join("\n");
  mkdirSync("tests/e2e/.tmp", { recursive: true });
  const file = "tests/e2e/.tmp/seed.sql";
  writeFileSync(file, sql);
  execSync(`npx wrangler d1 execute ${DB} --local --file ${file}`, { stdio: "inherit" });

  // Diagnóstico: onde ficou o D1 local (p/ conferir o compartilhamento com o next dev).
  try {
    execSync("echo '--- .wrangler/state/v3/d1 ---'; ls -laR .wrangler/state/v3/d1 2>/dev/null | head -20 || true", {
      stdio: "inherit",
      shell: "/bin/bash",
    });
  } catch {
    /* diagnóstico best-effort */
  }
  console.log("=== E2E seed: concluído ===");
}

main().catch((e) => {
  console.error("E2E seed falhou:", e);
  process.exit(1);
});
