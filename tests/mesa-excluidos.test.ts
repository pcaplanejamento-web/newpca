import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { dfdItens, dfdProtocolos, dfds } from "../src/db/schema.ts";
import { comandoLimparExcluidos, consultaDfdsRestantes, comandoRetratoDfds, comandoRetratoItens, comandoRetratoProtocolo } from "../src/lib/mesa-excluidos-sql.ts";
import { lerRetratoDfd, lerRetratoItem, lerRetratoProtocolo } from "../src/lib/mesa-excluidos-core.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// A LIXEIRA DA MESA pelos MESMOS builders do servidor, no driver D1 real e DENTRO do lote da exclusão.
const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}
const ator = { id: null, nome: "Ana Teste" };

describe("lixeira da Mesa (retrato no mesmo lote da exclusão)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const linhas = () =>
    (db.prepare("SELECT tipo, alvo_id AS alvo, numero, protocolo_numero AS pn, motivo, valor, retrato, excluido_nome AS por FROM mesa_excluidos ORDER BY id").all() as Record<string, unknown>[]).map((r) => ({ ...r }));

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO dfd_protocolos (id, numero, assunto) VALUES (11, '100/2026', 'INCLUSÃO')");
    db.exec("INSERT INTO dfds (id, numero, planejamento, protocolo_id, total_itens, valor_total) VALUES (1, '501', '601', 11, 2, 30), (2, '502', '602', 11, 1, 5), (3, '503', NULL, NULL, 1, 7)");
    db.exec("INSERT INTO dfd_itens (id, dfd_id, item, codigo, descricao, quantidade, valor_unitario, valor_total, sequencial) VALUES (1, 1, 1, '10', 'CANETA', 2, 5, 10, 1), (2, 1, 2, '11', 'LÁPIS', 4, 5, 20, 2), (3, 2, 1, '12', 'PAPEL', 1, 5, 5, 1), (4, 3, 1, '13', 'CLIPE', 1, 7, 7, 1)");
  });

  it("item removido: o retrato do item com o DFD de origem; o DELETE no mesmo lote", async () => {
    await orm.batch([comandoRetratoItens(orm, 1, [2], "massa", ator), orm.delete(dfdItens).where(eq(dfdItens.id, 2))]);
    const [l] = linhas();
    assert.equal(l.tipo, "item");
    assert.equal(l.numero, "2");
    assert.equal(l.pn, "100/2026");
    assert.equal(l.por, "Ana Teste");
    const r = lerRetratoItem(l.retrato as string);
    assert.deepEqual([r?.item.descricao, r?.dfdPlanejamento, r?.protocoloNumero, r?.item.quantidade], ["LÁPIS", "601", "100/2026", 4]);
  });

  it("protocolo excluído: a capa + UM retrato por DFD (cascata) com os itens", async () => {
    await orm.batch([
      comandoRetratoProtocolo(orm, 11, "exclusao", ator),
      comandoRetratoDfds(orm, { protocoloId: 11 }, "cascata", ator),
      orm.delete(dfds).where(eq(dfds.protocoloId, 11)),
      orm.delete(dfdProtocolos).where(eq(dfdProtocolos.id, 11)),
    ]);
    const ls = linhas().slice(1);
    assert.deepEqual(ls.map((l) => [l.tipo, l.numero, l.motivo]), [["protocolo", "100/2026", "exclusao"], ["dfd", "501", "cascata"], ["dfd", "502", "cascata"]]);
    assert.equal(ls[0].valor, 35);
    const d = lerRetratoDfd(ls[1].retrato as string);
    assert.equal(d?.planejamento, "601");
    assert.deepEqual(d?.itens.map((i) => i.descricao), ["CANETA"]);
    assert.equal(d?.protocoloNumero, "100/2026");
    const p = lerRetratoProtocolo(ls[0].retrato as string);
    assert.deepEqual([p?.assunto, p?.dfds, p?.itens, p?.valorDfds], ["INCLUSÃO", 2, 2, 35]);
  });

  it("DFD avulso excluído; nada a excluir = nada gravado; retenção limpa", async () => {
    await orm.batch([comandoRetratoDfds(orm, { dfdId: 3 }, "exclusao", ator), orm.delete(dfds).where(eq(dfds.id, 3))]);
    await orm.batch([comandoRetratoDfds(orm, { dfdId: 999 }, "exclusao", ator)]);
    assert.equal(linhas().length, 5);
    assert.equal(lerRetratoDfd(linhas()[4].retrato as string)?.itens[0].descricao, "CLIPE");
    await orm.batch([comandoLimparExcluidos(orm, "9999-01-01 00:00:00")]);
    assert.equal(linhas().length, 0);
  });
});

it("exclusões antigas pelo histórico: protocolo, DFD e itens removidos", async () => {
  const { excluidosDaAuditoria, pcaPeloHistorico } = await import("../src/lib/mesa-excluidos-core.ts");
  const base = { antes: null, detalhe: null, origem: null, protocoloId: 7, usuarioId: 1, usuarioNome: "Ana", criadoEm: "2026-09-01 10:00:00", entidadeId: 7 };
  const [p] = excluidosDaAuditoria({ ...base, id: 1, entidade: "protocolo", resumo: "Protocolo 1234/2026 excluído (com os DFDs vinculados)", origem: "exclusao" });
  assert.equal(p.tipo, "protocolo");
  assert.equal(p.numero, "1234/2026");
  const [d] = excluidosDaAuditoria({
    ...base,
    id: 2,
    entidade: "dfd",
    entidadeId: 30,
    origem: "exclusao",
    resumo: "DFD 531 excluído",
    antes: JSON.stringify({ numero: "531", valorTotal: 1500 }),
    detalhe: JSON.stringify({ alvo: { numero: "531", planejamento: "640" } }),
  });
  assert.deepEqual([d.tipo, d.numero, d.planejamento, d.valor], ["dfd", "531", "640", 1500]);
  assert.equal(excluidosDaAuditoria({ ...base, id: 3, entidade: "dfd", origem: "exclusao", resumo: "DFD 9 excluído (gravação desfeita após falha)" }).length, 0);
  const itens = excluidosDaAuditoria({
    ...base,
    id: 4,
    entidade: "dfd",
    entidadeId: 30,
    origem: "massa",
    resumo: "DFD 531: 2 item(ns) removidos",
    detalhe: JSON.stringify({ alvo: { numero: "531", planejamento: "640" }, itens: [{ tipo: "removido", item: 3, codigo: "1", descricao: "X", campos: [] }, { tipo: "alterado", item: 4, campos: [] }, { tipo: "removido", item: 5, codigo: "2", descricao: "Y", campos: [] }] }),
  });
  assert.deepEqual(itens.map((i) => [i.tipo, i.numero, i.chave]), [["item", "3", "a4-0"], ["item", "5", "a4-1"]]);
  assert.equal(pcaPeloHistorico("Protocolo 1 incorporado ao PCA 2027", 3), 3);
  assert.equal(pcaPeloHistorico("Protocolo 1 devolvido à Mesa principal pelo PCA 2027", 3), null);
});

import { abrangenciaExclusao, chaveItemDoDfd, lerChaveItemDoDfd, planoLimpeza } from "../src/lib/mesa-excluidos-core.ts";
it("abrangência da exclusão e limpeza com a cascata", () => {
  assert.equal(abrangenciaExclusao("protocolo", "exclusao"), "protocolo");
  assert.equal(abrangenciaExclusao("dfd", "cascata"), "dfd-protocolo");
  assert.equal(abrangenciaExclusao("dfd", "exclusao"), "dfd-avulso");
  assert.equal(abrangenciaExclusao("item", "massa"), "item-avulso");
  assert.equal(abrangenciaExclusao("item", "exclusao", true), "item-dfd");
  assert.equal(abrangenciaExclusao("item", "cascata", true), "item-protocolo");
  assert.deepEqual(lerChaveItemDoDfd(chaveItemDoDfd(12, 3)), { id: 12, idx: 3 });
  assert.equal(lerChaveItemDoDfd("a5"), null);
  const ls = [
    { id: 1, tipo: "protocolo", protocoloId: 9, motivo: "exclusao" },
    { id: 2, tipo: "dfd", protocoloId: 9, motivo: "cascata" },
    { id: 3, tipo: "dfd", protocoloId: 9, motivo: "exclusao" },
    { id: 4, tipo: "dfd", protocoloId: 8, motivo: "cascata" },
  ];
  assert.deepEqual(planoLimpeza(ls, new Set([1])), [1, 2]);
  assert.deepEqual(planoLimpeza(ls, new Set([3])), [3]);
});

it("protocolo vazio: conta SÓ os DFDs do protocolo (nunca o DFD contra ele mesmo)", async () => {
  const db = aplicarTudo();
  const orm = drizzle(d1Sobre(db) as never, { schema });
  // O caso real: um DFD QUALQUER com id = protocolo_id fazia a subconsulta antiga contar 1 para todo protocolo.
  db.exec("INSERT INTO dfd_protocolos (id, numero) VALUES (5, '5/2026'), (6, '6/2026')");
  db.exec("INSERT INTO dfds (id, numero, protocolo_id) VALUES (5, '9005', 5), (7, '9007', 6)");
  assert.equal(Number((await consultaDfdsRestantes(orm, 6))[0].n), 1);
  db.exec("DELETE FROM dfds WHERE id = 7");
  assert.equal(Number((await consultaDfdsRestantes(orm, 6))[0].n), 0);
  assert.equal(Number((await consultaDfdsRestantes(orm, 5))[0].n), 1);
});
