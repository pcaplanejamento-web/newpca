import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { destinoDoDfd, dfdsQueVoltamComProtocolo, excluidosAntesDoProtocolo, sequenciaisQueVoltam } from "../src/lib/mesa-excluidos-core.ts";
import { comandoInserirDfd, comandoInserirProtocolo, comandoMarcarRestaurados, comandoReativarSequenciais, comandosInserirItens } from "../src/lib/mesa-excluidos-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const L = (id: number, tipo: string, protocoloId: number | null, motivo: string) => ({ id, tipo, protocoloId, motivo });

describe("restauração — a régua", () => {
  it("o protocolo volta só com a cascata; o DFD excluído antes fica", () => {
    const p = L(10, "protocolo", 5, "exclusao");
    const ls = [L(3, "dfd", 5, "exclusao"), L(11, "dfd", 5, "cascata"), L(12, "dfd", 5, "cascata"), L(13, "dfd", 6, "cascata")];
    assert.deepEqual(dfdsQueVoltamComProtocolo(p, ls), [11, 12]);
    assert.deepEqual(excluidosAntesDoProtocolo(p, ls), [3]);
  });
  it("o esvaziado volta com o DFD que o esvaziou; sem DFD, nada (não restaura vazio)", () => {
    const p = L(10, "protocolo", 5, "esvaziado");
    assert.deepEqual(dfdsQueVoltamComProtocolo(p, [L(2, "dfd", 5, "exclusao"), L(9, "dfd", 5, "exclusao")]), [9]);
    assert.deepEqual(dfdsQueVoltamComProtocolo(p, []), []);
  });
  it("destino do DFD: mesmo id › mesmo Id da capa › mesmo nº; senão a mensagem certa", () => {
    const a = { id: 5, numero: "1/2026", pcaId: null, incorporado: false };
    const b = { id: 9, numero: "1/2026", pcaId: null, incorporado: false };
    assert.deepEqual(destinoDoDfd({ protocoloId: 5, protocoloNumero: "1/2026", idExterno: "X" }, { porId: null, porIdExterno: b, porNumero: a }, false), { destino: b });
    assert.match((destinoDoDfd({ protocoloId: 5, protocoloNumero: "1/2026", idExterno: null }, { porId: null, porIdExterno: null, porNumero: null }, true) as { erro: string }).erro, /restaure-o primeiro/);
    assert.deepEqual(destinoDoDfd({ protocoloId: null, protocoloNumero: null, idExterno: null }, { porId: null, porIdExterno: null, porNumero: null }, false), { destino: null });
  });
  it("o nº do PCA só volta com o destino incorporado no MESMO PCA", () => {
    const its = [{ pcaId: 7, pcaSequencial: 3 }, { pcaId: 7, pcaSequencial: 4 }, { pcaId: 8, pcaSequencial: 1 }];
    assert.deepEqual(sequenciaisQueVoltam(its, { id: 1, numero: "", pcaId: 7, incorporado: true }), [3, 4]);
    assert.deepEqual(sequenciaisQueVoltam(its, { id: 1, numero: "", pcaId: 7, incorporado: false }), []);
  });
});

describe("restauração — builders no driver D1 real", () => {
  it("volta com o MESMO id, os itens, o nº do PCA religado e a lixeira marcada", async () => {
    const db = new DatabaseSync(":memory:");
    for (const f of readdirSync("drizzle").filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join("drizzle", f), "utf8"));
    db.exec("PRAGMA foreign_keys = ON");
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO pcas (id, nome, ano) VALUES (7, 'PCA', 2027)");
    db.exec("INSERT INTO pca_itens (pca_id, sequencial, ativo, baixado_em, motivo) VALUES (7, 3, 0, '2026-01-01', 'x')");
    db.exec("INSERT INTO mesa_excluidos (tipo, alvo_id, motivo, retrato) VALUES ('protocolo', 40, 'exclusao', '{}'), ('dfd', 41, 'cascata', '{}')");
    const itens = Array.from({ length: 8 }, (_, k) => ({ item: k + 1, codigo: String(k), descricao: "X", unidade: "UN", quantidade: 1, valorUnitario: 2, valorTotal: 2, sequencial: k + 1, pcaId: k === 0 ? 7 : null, pcaSequencial: k === 0 ? 3 : null, classificacao: null, dominio: null }));
    await orm.batch([
      comandoInserirProtocolo(orm, { id: 40, numero: "9/2026", pcaId: 7, pcaIncorporadoEm: "2026-01-01" }),
      comandoInserirDfd(orm, { id: 41, numero: "777", protocoloId: 40, totalItens: 8 }),
      ...comandosInserirItens(orm, 41, itens),
      comandoReativarSequenciais(orm, 7, 41, 40, [3]),
      comandoMarcarRestaurados(orm, [1, 2]),
    ]);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM dfd_itens WHERE dfd_id = 41").get() as { n: number }).n, 8);
    const pi = db.prepare("SELECT ativo, baixado_em, dfd_id, dfd_item_id FROM pca_itens").get() as Record<string, unknown>;
    assert.equal(pi.ativo, 1);
    assert.equal(pi.baixado_em, null);
    assert.equal(pi.dfd_id, 41);
    assert.ok(pi.dfd_item_id);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM mesa_excluidos WHERE restaurado_em IS NOT NULL").get() as { n: number }).n, 2);
  });
});
