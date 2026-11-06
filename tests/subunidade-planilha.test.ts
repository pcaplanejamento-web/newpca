import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { itens } from "../src/db/schema.ts";
import { planoEdicaoItemPlanilha } from "../src/lib/item-planilha-core.ts";
import {
  comandoRestaurarSubunidades,
  comandoSobrescrever,
  comandoSubunidadeItens,
  consultaItensParaSubunidade,
  consultaSubunidadesDosSeqs,
} from "../src/lib/pca-upload-sql.ts";
import { subunidadeDaPlanilha, subunidadeEmMassa } from "../src/lib/subunidades-core.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

describe("subunidade do item de planilha (núcleo)", () => {
  const cfgs = new Map([
    [1, { codigo: "FMS", modo: "subunidades" as const, centros: [], subunidades: [{ id: 10, nome: "UBS", centros: ["C1"] }] }],
    [2, { codigo: "SME", modo: "unico" as const, centros: ["B"], subunidades: [{ id: 20, nome: "S2", centros: [] }] }],
    [3, { codigo: "SAS", modo: "unico" as const, centros: ["X"], subunidades: [] }],
  ]);
  const cfg = (id: number) => cfgs.get(id) as never;
  const sig = (id: number) => cfgs.get(id)?.codigo;

  it("a planilha escolhe a subunidade também no modo por subunidade (não há centro de custo)", () => {
    const m = subunidadeEmMassa([{ id: 1, reparticaoId: 1, sigla: "FMS" }], cfg, sig, { livre: true });
    assert.equal(m.sub.motivo, null);
    assert.deepEqual(m.sub.opcoes.map((s) => s.id), [10]);
    // O DFD no mesmo modo segue recusado (a subunidade vem do centro).
    assert.equal(subunidadeEmMassa([{ id: 1, reparticaoId: 1, sigla: "FMS" }], cfg, sig).motivos.get(1)?.tom, "danger");
    assert.equal(subunidadeDaPlanilha(cfgs.get(1), 10), true);
    assert.equal(subunidadeDaPlanilha(cfgs.get(1), 20), false);
  });

  it("sem subunidades, sem unidade ou de várias unidades: o motivo fala em itens", () => {
    const r = subunidadeEmMassa(
      [
        { id: 1, reparticaoId: 2, sigla: "SME" },
        { id: 2, reparticaoId: 2, sigla: "SME" },
        { id: 3, reparticaoId: 1, sigla: "FMS" },
        { id: 4, reparticaoId: 3, sigla: "SAS" },
        { id: 5, reparticaoId: null, sigla: null },
        { id: 6, reparticaoId: 9, sigla: "X" },
      ],
      cfg,
      sig,
      { livre: true },
    );
    assert.equal(r.motivos.get(3)?.tom, "warn");
    assert.match(r.motivos.get(3)?.dica ?? "", /itens de UMA unidade/);
    for (const id of [4, 5, 6]) assert.equal(r.motivos.get(id)?.tom, "danger");
    assert.match(r.motivos.get(4)?.dica ?? "", /não tem subunidades/);
    assert.match(r.motivos.get(5)?.dica ?? "", /Item sem unidade/);
    assert.match(r.motivos.get(6)?.dica ?? "", /não tem subunidades/);
    assert.match(r.sub.motivo ?? "", /3 item\(ns\).*1 de outra unidade/);
  });

  it("a edição do banner: só uma das subunidades da unidade, com o nome no histórico", () => {
    const atual = { idProduto: "1", nomeProduto: "X", unidadeMedida: "UN", quantidade: 1, valorReferencia: 1, valorTotal: 1, dataDesejada: null, previsaoGenerica: null, prioridade: null, subunidadeId: null };
    const subs = [{ id: 20, nome: "S2" }];
    const p = planoEdicaoItemPlanilha(atual, { subunidadeId: 20 }, subs);
    assert.equal(p.erro, null);
    assert.equal(p.set.subunidadeId, 20);
    assert.deepEqual(p.depois, { subunidade: "S2" });
    assert.match(planoEdicaoItemPlanilha(atual, { subunidadeId: 99 }, subs).erro ?? "", /Subunidade inválida/);
    assert.deepEqual(planoEdicaoItemPlanilha({ ...atual, subunidadeId: 20 }, { subunidadeId: 20 }, subs).set, {});
    assert.equal(planoEdicaoItemPlanilha({ ...atual, subunidadeId: 20 }, { subunidadeId: null }, subs).set.subunidadeId, null);
  });
});

describe("subunidade do item de planilha (D1 real)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const sub = (seq: number) => (db.prepare("SELECT subunidade_id AS s FROM itens WHERE pca_id = 1 AND sequencial = ?").get(seq) as { s: number | null } | undefined)?.s;

  before(() => {
    db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
    db.exec("PRAGMA foreign_keys = ON");
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO reparticoes (id, codigo, nome) VALUES (101, 'SME', 'Educação'), (102, 'SMS', 'Saúde');
      INSERT INTO subunidades (id, reparticao_id, nome) VALUES (10, 101, 'Escolas'), (20, 102, 'UBS');
      INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'lista');
      INSERT INTO pca_uploads (id, pca_id, nome_arquivo) VALUES (1, 1, 'a.xlsx'), (2, 1, 'b.xlsx');
      INSERT INTO unidades (id, codigo, municipio, pca_id, upload_id, reparticao_id) VALUES (1, 'SME', 'RV', 1, 1, 101), (2, 'SMS', 'RV', 1, 1, 102), (3, 'SME', 'RV', 1, 2, 101);
      INSERT INTO itens (id, unidade_id, pca_id, sequencial, valor_total) VALUES (1, 1, 1, 1, 10), (2, 1, 1, 2, 20), (3, 2, 1, 3, 30);
      UPDATE itens SET cancelado_em = CURRENT_TIMESTAMP WHERE id = 2;`);
  });

  it("grava só nos itens ATIVOS da unidade, e a subunidade tem de ser dela", async () => {
    const lidos = await consultaItensParaSubunidade(orm, 1, [1, 2, 3]);
    assert.deepEqual(lidos.map((x) => [x.id, x.reparticaoId, !!x.canceladoEm]), [[1, 101, false], [2, 101, true], [3, 102, false]]);
    assert.deepEqual((await comandoSubunidadeItens(orm, 1, [1, 2, 3], 101, 10)).map((x) => x.id), [1]);
    assert.equal(sub(1), 10);
    assert.equal(sub(2), null);
    assert.equal(sub(3), null);
    // A subunidade de OUTRA unidade não grava nada.
    assert.deepEqual(await comandoSubunidadeItens(orm, 1, [1], 101, 20), []);
    assert.equal(sub(1), 10);
  });

  it("o upload que sobrescreve o Seq. na MESMA unidade mantém a subunidade (outra unidade, não)", async () => {
    const subs = await consultaSubunidadesDosSeqs(orm, 1, 3, [1]);
    assert.deepEqual(subs.map((x) => [x.sequencial, x.subunidadeId]), [[1, 10]]);
    assert.deepEqual(await consultaSubunidadesDosSeqs(orm, 1, 2, [1]), []);
    await orm.batch([
      comandoSobrescrever(orm, 1, [1]),
      orm.insert(itens).values([{ unidadeId: 3, pcaId: 1, sequencial: 1, valorTotal: 11 }]),
      comandoRestaurarSubunidades(orm, 1, 3, [[1, 10]]),
    ]);
    assert.deepEqual({ ...(db.prepare("SELECT unidade_id AS u, subunidade_id AS s FROM itens WHERE sequencial = 1").get() as object) }, { u: 3, s: 10 });
  });

  it("a sobrescrita nunca apaga o item CANCELADO (o gatilho do sequencial aborta o lote)", async () => {
    await assert.rejects(orm.batch([comandoSobrescrever(orm, 1, [2]), orm.insert(itens).values([{ unidadeId: 1, pcaId: 1, sequencial: 2, valorTotal: 1 }])]), /sequencial_duplicado/);
    assert.ok(db.prepare("SELECT 1 FROM itens WHERE id = 2 AND cancelado_em IS NOT NULL").get());
  });

  it("excluir a subunidade deixa o item sem ela", () => {
    db.exec("DELETE FROM subunidades WHERE id = 10");
    assert.equal(sub(1), null);
  });
});
