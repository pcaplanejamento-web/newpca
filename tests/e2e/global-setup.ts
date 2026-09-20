import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hashSenha } from "../../src/lib/password";
import { E2E_EMAIL, E2E_SENHA } from "./fixtures";

/**
 * Prepara o D1 LOCAL (Miniflare) para os testes: aplica as migrações e semeia um
 * usuário de teste (admin/ativo). Roda ANTES de todos os specs. O `next dev` usa o
 * mesmo estado local (`.wrangler/state`), então o seed fica visível ao servidor.
 * Nada aqui toca produção; o usuário é descartável (senha = constante do teste).
 */
const DB = "newpca-db";

export default async function globalSetup(): Promise<void> {
  // 1) Migrações no D1 local.
  execSync(`npx wrangler d1 migrations apply ${DB} --local`, { stdio: "inherit" });

  // 2) Usuário de teste (remove-e-insere → idempotente entre execuções).
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
}
