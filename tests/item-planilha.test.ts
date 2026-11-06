import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { itens } from "../src/db/schema.ts";
import {
  type ItemPlanilhaGravado,
  opcoesPrevisao,
  planoEdicaoItemPlanilha,
  previsaoDoItem,
  resumoEdicaoItemPlanilha,
} from "../src/lib/item-planilha-core.ts";
import { comandoCancelarItens, comandosLimparVazias, comandoTotaisUnidades, consultaMaximoSequencial, consultaSequenciaisCancelados } from "../src/lib/pca-upload-sql.ts";
import { MOTIVO_NUMERO, situacaoDoNumero } from "../src/lib/pca-numeracao-core.ts";
import { editarItemPlanilhaSchema, situacaoItensPlanilhaSchema } from "../src/lib/validation.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const ATUAL: ItemPlanilhaGravado = {
  idProduto: "5241958483",
  nomeProduto: "SERVIÇO DE REPARO",
  unidadeMedida: "SERVIÇO",
  quantidade: 2,
  valorReferencia: 100,
  valorTotal: 200,
  dataDesejada: "2026-03-01",
  previsaoGenerica: null,
  prioridade: "ALTA",
};

describe("edição do item de planilha (núcleo)", () => {
  it("nada mudou = nada a gravar", () => {
    const p = planoEdicaoItemPlanilha(ATUAL, { idProduto: " 5241958483 ", quantidade: 2, previsao: "03/2026", prioridade: "alta" });
    assert.equal(p.erro, null);
    assert.deepEqual(p.set, {});
    assert.equal(p.reclassificar, false);
  });
  it("trocar a quantidade recalcula o total (q × vu); o total digitado vale", () => {
    const p = planoEdicaoItemPlanilha(ATUAL, { quantidade: 2.5 });
    assert.deepEqual(p.set, { quantidade: 2.5, valorTotal: 250 });
    const m = planoEdicaoItemPlanilha(ATUAL, { quantidade: 3, valorTotal: 299.9 });
    assert.deepEqual(m.set, { quantidade: 3, valorTotal: 299.9 });
  });
  it("número negativo e descrição vazia são recusados", () => {
    assert.match(planoEdicaoItemPlanilha(ATUAL, { quantidade: -1 }).erro ?? "", /quantidade/);
    assert.match(planoEdicaoItemPlanilha(ATUAL, { nomeProduto: "  " }).erro ?? "", /descrição/);
  });
  it("medida normalizada e reclassificação quando código/descrição/medida mudam", () => {
    const p = planoEdicaoItemPlanilha(ATUAL, { unidadeMedida: "UN" });
    assert.equal(p.set.unidadeMedida, "UN");
    assert.equal(p.set.unidadeMedidaNorm, "UNIDADE");
    assert.equal(p.reclassificar, true);
    assert.equal(p.set.classificadoVersao, null);
    assert.equal(planoEdicaoItemPlanilha(ATUAL, { quantidade: 5 }).reclassificar, false);
  });
  it("previsão: mês × genérica × vazia; inválida recusada", () => {
    const mes = planoEdicaoItemPlanilha(ATUAL, { previsao: "07/2026" });
    assert.deepEqual(mes.set, { dataDesejada: "2026-07-01", previsaoGenerica: null, mesDesejado: 7, anoDesejado: 2026 });
    const gen = planoEdicaoItemPlanilha(ATUAL, { previsao: "Semestral" });
    assert.deepEqual(gen.set, { dataDesejada: null, previsaoGenerica: "SEMESTRAL", mesDesejado: null, anoDesejado: null });
    assert.deepEqual(planoEdicaoItemPlanilha(ATUAL, { previsao: null }).set.dataDesejada, null);
    assert.match(planoEdicaoItemPlanilha(ATUAL, { previsao: "logo" }).erro ?? "", /Previsão/);
  });
  it("prioridade canônica; inválida recusada", () => {
    assert.equal(planoEdicaoItemPlanilha(ATUAL, { prioridade: "media" }).set.prioridade, "MÉDIA");
    assert.match(planoEdicaoItemPlanilha(ATUAL, { prioridade: "xyz" }).erro ?? "", /Prioridade/);
  });
  it("previsão exibida e as opções do ano", () => {
    assert.equal(previsaoDoItem(ATUAL), "03/2026");
    assert.equal(previsaoDoItem({ dataDesejada: null, previsaoGenerica: "ANUAL" }), "ANUAL");
    const o = opcoesPrevisao(2027);
    assert.equal(o[0], "01/2027");
    assert.equal(o.length, 16);
    assert.equal(opcoesPrevisao(2027, "05/2026")[0], "05/2026");
  });
  it("resumo e diff legíveis", () => {
    const p = planoEdicaoItemPlanilha(ATUAL, { quantidade: 4 });
    assert.equal(resumoEdicaoItemPlanilha(20344, p), "Item Seq. 20344 da planilha editado: quantidade, valor total");
    assert.deepEqual(p.antes, { quantidade: 2, valorTotal: 200 });
  });
  it("o Zod aceita só os campos conhecidos e exige alguma mudança", () => {
    assert.ok(editarItemPlanilhaSchema.safeParse({ quantidade: 3 }).success);
    assert.ok(!editarItemPlanilhaSchema.safeParse({}).success);
    assert.ok(!editarItemPlanilhaSchema.safeParse({ sequencial: 1 }).success);
    assert.ok(!editarItemPlanilhaSchema.safeParse({ quantidade: -2 }).success);
  });
});

describe("edição do item de planilha (D1 real: item + totais da planilha num lote)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
    db.exec("PRAGMA foreign_keys = ON");
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'lista');
      INSERT INTO pca_uploads (id, pca_id, nome_arquivo) VALUES (1, 1, 'a.xlsx');
      INSERT INTO unidades (id, codigo, municipio, pca_id, upload_id, total_itens, valor_total) VALUES (1, 'SME', 'RV', 1, 1, 2, 300);
      INSERT INTO itens (id, unidade_id, pca_id, sequencial, quantidade, valor_referencia, valor_total, classificado_versao)
        VALUES (10, 1, 1, 1, 2, 100, 200, 'v1'), (11, 1, 1, 2, 1, 100, 100, 'v1');`);
  });
  it("grava o item, acerta o total da planilha e marca para reclassificar", async () => {
    const p = planoEdicaoItemPlanilha(
      { ...ATUAL, quantidade: 2, valorReferencia: 100, valorTotal: 200 },
      { quantidade: 5, nomeProduto: "OUTRO SERVIÇO" },
    );
    await orm.batch([orm.update(itens).set(p.set).where(and(eq(itens.id, 10), eq(itens.pcaId, 1))), comandoTotaisUnidades(orm, 1)]);
    const it10 = db.prepare("SELECT quantidade q, valor_total t, nome_produto n, classificado_versao v, sequencial s FROM itens WHERE id = 10").get() as Record<string, unknown>;
    assert.deepEqual({ ...it10 }, { q: 5, t: 500, n: "OUTRO SERVIÇO", v: null, s: 1 });
    const u = db.prepare("SELECT total_itens n, valor_total v FROM unidades WHERE id = 1").get() as Record<string, unknown>;
    assert.deepEqual({ ...u }, { n: 2, v: 600 });
  });
});

describe("cancelar item no PCA (planilha e protocolo)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
    db.exec("PRAGMA foreign_keys = ON");
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (7, 'Jhone', 'j@x.gov.br', 'x');
      INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'lista');
      INSERT INTO pca_uploads (id, pca_id, nome_arquivo) VALUES (1, 1, 'a.xlsx');
      INSERT INTO unidades (id, codigo, municipio, pca_id, upload_id) VALUES (1, 'SME', 'RV', 1, 1);
      INSERT INTO itens (id, unidade_id, pca_id, sequencial, valor_total) VALUES (20, 1, 1, 1, 100), (21, 1, 1, 2, 50), (22, 1, 1, 3, 25);`);
  });
  const totais = () => ({ ...(db.prepare("SELECT total_itens n, valor_total v FROM unidades WHERE id = 1").get() as Record<string, unknown>) });

  it("cancelar marca só os ativos pedidos, tira dos totais e guarda quem", async () => {
    const [alt] = await orm.batch([comandoCancelarItens(orm, 1, [21, 22, 999], true, { id: 7, nome: "Jhone" }), comandoTotaisUnidades(orm, 1)]);
    assert.deepEqual(alt.map((r) => r.sequencial).sort(), [2, 3]);
    assert.deepEqual(totais(), { n: 1, v: 100 });
    const c = db.prepare("SELECT cancelado_por p, cancelado_por_nome n, cancelado_em IS NOT NULL e FROM itens WHERE id = 21").get() as Record<string, unknown>;
    assert.deepEqual({ ...c }, { p: 7, n: "Jhone", e: 1 });
    // De novo: nada muda (já cancelados).
    const [alt2] = await orm.batch([comandoCancelarItens(orm, 1, [21], true, null), comandoTotaisUnidades(orm, 1)]);
    assert.equal(alt2.length, 0);
  });
  it("o cancelado NÃO é excluído: a planilha fica e o nº não volta à sequência nem é sobrescrito", async () => {
    await orm.batch([...comandosLimparVazias(orm, 1)]);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM itens WHERE pca_id = 1").get() as { n: number }).n, 3);
    const canc = await consultaSequenciaisCancelados(orm, 1, [1, 2, 3, 4]);
    assert.deepEqual(canc.map((r) => r.sequencial).sort(), [2, 3]);
    const [m] = await consultaMaximoSequencial(orm, 1);
    assert.equal(m?.max, 3);
    // O gatilho do sequencial sagrado segue valendo para o cancelado.
    assert.throws(() => db.exec("INSERT INTO itens (unidade_id, pca_id, sequencial) VALUES (1, 1, 2)"), /sequencial_duplicado/);
  });
  it("reativar devolve só os cancelados e os totais voltam", async () => {
    const [alt] = await orm.batch([comandoCancelarItens(orm, 1, [20, 21], false, null), comandoTotaisUnidades(orm, 1)]);
    assert.deepEqual(alt.map((r) => r.sequencial), [2]);
    assert.deepEqual(totais(), { n: 2, v: 150 });
    assert.equal((db.prepare("SELECT cancelado_por_nome n FROM itens WHERE id = 21").get() as { n: unknown }).n, null);
  });
  it("situação do nº do protocolo: ativo, cancelado (retirado) e inativo pela vigência", () => {
    assert.equal(situacaoDoNumero({ ativo: true, motivo: null }), "Ativo");
    assert.equal(situacaoDoNumero({ ativo: false, motivo: MOTIVO_NUMERO.retirado }), "Cancelado");
    assert.equal(situacaoDoNumero({ ativo: false, motivo: MOTIVO_NUMERO.naoVigente }), "Inativo");
    assert.equal(situacaoDoNumero({ ativo: false, motivo: MOTIVO_NUMERO.itemRemovido }), "Inativo");
  });
  it("o Zod do cancelamento", () => {
    assert.ok(situacaoItensPlanilhaSchema.safeParse({ acao: "cancelar", ids: [1] }).success);
    assert.ok(!situacaoItensPlanilhaSchema.safeParse({ acao: "excluir", ids: [1] }).success);
    assert.ok(!situacaoItensPlanilhaSchema.safeParse({ acao: "reativar", ids: [] }).success);
  });
});
