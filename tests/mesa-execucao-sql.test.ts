import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { consultaExecucao } from "../src/lib/mesa-execucao-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// O HISTÓRICO DE EXECUÇÃO da Mesa pelo MESMO builder do servidor, no driver `drizzle-orm/d1` REAL (sobre um D1
// mínimo em `node:sqlite`, com a cadeia de migrações aplicada). Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("consultaExecucao (histórico dos protocolos da Mesa)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const linhas = async (reparticaoId: number | null = null, anoPca: number | null = null) =>
    (await consultaExecucao(orm, { reparticaoId, anoPca })).map((l) => `${l.protocoloId}|${l.usuarioId}|${l.dia}|${l.tipo}|${l.n}`).sort();
  const log = (usuario: number | null, acao: string, entidade: string, entidadeId: number, protocoloId: number | null, origem: string | null, criadoEm: string, resumo = "") =>
    db
      .prepare(
        "INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, protocolo_id, origem, criado_em, resumo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(usuario, acao, entidade, entidadeId, protocoloId, origem, criadoEm, resumo);

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO reparticoes (id, codigo, nome) VALUES (901, 'SMS', 'Saúde'), (902, 'SME', 'Educação')");
    db.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (1, 'Naty', 'n@x', 'h'), (2, 'Cris', 'c@x', 'h')");
    db.exec("INSERT INTO pcas (id, nome, ano) VALUES (50, 'PCA 2027', 2027)");
    // 10 = Mesa (SMS, 2027) · 11 = Mesa (SME, 2026) · 12 = enviado a um PCA (fora da Mesa)
    db.exec(`INSERT INTO dfd_protocolos (id, numero, reparticao_id, ano_pca, pca_id, criado_em) VALUES
      (10, 'A/2026', 901, 2027, NULL, '2026-09-01 12:00:00'),
      (11, 'B/2026', 902, 2026, NULL, '2026-09-02 12:00:00'),
      (12, 'C/2026', 901, 2027, 50, '2026-09-03 12:00:00')`);
    db.exec("INSERT INTO dfds (id, numero, protocolo_id, reparticao_id) VALUES (100, '1500', 10, 901), (110, '1600', 11, 902), (120, '1700', 12, 901)");

    // Reenvio (correção) — o de hoje de madrugada UTC é de ONTEM em Brasília.
    log(1, "importar", "protocolo", 10, 10, "reenvio", "2026-09-28 02:30:00", "Protocolo A/2026 REENVIADO (sobrescrito): 1 alterado");
    // Linha LEGADA (antes da origem): o "REENVIADO" do resumo, sem protocolo_id.
    log(2, "importar", "protocolo", 11, null, null, "2026-09-10 15:00:00", "Protocolo B/2026 REENVIADO (sobrescrito)");
    // Ações: edição no banner (2x), célula, massa, vínculo, exclusão, sobrescrita de DFD, e uma legada no DFD sem protocolo_id.
    log(1, "editar", "dfd", 100, 10, "banner", "2026-09-20 13:00:00");
    log(1, "editar", "dfd", 100, 10, "banner", "2026-09-20 14:00:00");
    log(2, "editar", "protocolo", 10, 10, "celula", "2026-09-20 15:00:00");
    log(2, "editar", "dfd", 100, 10, "massa", "2026-09-21 15:00:00");
    log(2, "importar", "dfd", 110, 11, "sobrescrita", "2026-09-21 16:00:00");
    log(1, "editar", "dfd", 110, null, null, "2026-09-11 15:00:00");
    // NÃO são execução: a protocolação, a importação dos DFDs dela, os DFDs regravados no reenvio, login.
    log(1, "protocolar", "protocolo", 10, 10, "protocolacao", "2026-09-01 12:00:00");
    log(1, "importar", "dfd", 100, 10, "protocolacao", "2026-09-01 12:00:05");
    log(1, "importar", "dfd", 100, 10, "reenvio", "2026-09-28 02:30:05");
    log(1, "excluir", "dfd", 100, 10, "reenvio", "2026-09-28 02:30:06");
    log(1, "login", "usuario", 1, null, null, "2026-09-20 12:00:00");
    // Fora da Mesa: o protocolo enviado a um PCA.
    log(1, "editar", "dfd", 120, 12, "banner", "2026-09-20 13:00:00");
  });

  it("agrupa reenvios e ações por protocolo, pessoa e dia de Brasília (só a Mesa)", async () => {
    assert.deepEqual(await linhas(), [
      "10|1|2026-09-20|acao|2",
      "10|1|2026-09-27|reenvio|1",
      "10|2|2026-09-20|acao|1",
      "10|2|2026-09-21|acao|1",
      "11|1|2026-09-11|acao|1",
      "11|2|2026-09-10|reenvio|1",
      "11|2|2026-09-21|acao|1",
    ]);
  });

  it("escopo da unidade e do PCA do cabeçalho", async () => {
    const sms = await linhas(901);
    const sme = await linhas(902);
    const de2026 = await linhas(null, 2026);
    assert.ok(sms.length === 4 && sms.every((l) => l.startsWith("10|")));
    assert.ok(sme.length === 3 && sme.every((l) => l.startsWith("11|")));
    assert.deepEqual(de2026, sme);
    assert.deepEqual(await linhas(null, 2030), []);
  });

  it("sem protocolo na Mesa, nada (o limite pela protocolação mais antiga)", async () => {
    assert.deepEqual(await linhas(999), []);
  });
});
