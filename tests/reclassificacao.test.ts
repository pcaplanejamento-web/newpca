import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { classificarItem, criarClassificador, dominioCanonico, dominioPorDescricao, versaoPadronizacao } from "../src/lib/padronizacao-core.ts";
import { comandoGravarDfd, comandoGravarPlanilha, consultaPendentesDfd, consultaPendentesPlanilha } from "../src/lib/reclassificacao-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const CLS = [
  { id: 1, nome: "MATERIAL DE LIMPEZA", cor: "#000000", palavras: ["DETERGENTE"], ordem: 0, dominio: "MATERIAL" as const },
  { id: 2, nome: "MANUTENÇÃO", cor: "#000000", palavras: ["MANUTENCAO"], ordem: 1, dominio: "SERVIÇO" as const },
];

describe("classificação + domínio do item (núcleo)", () => {
  const c = criarClassificador(CLS);
  it("classificação do Catálogo; domínio pela classificação", () => {
    assert.deepEqual(classificarItem(c, { descricao: "DETERGENTE NEUTRO 500ML" }), { classificacao: "MATERIAL DE LIMPEZA", dominio: "MATERIAL" });
    assert.deepEqual(classificarItem(c, { descricao: "MANUTENÇÃO DE AR" }), { classificacao: "MANUTENÇÃO", dominio: "SERVIÇO" });
  });
  it("sem o Catálogo: a classificação da planilha; o domínio da planilha manda", () => {
    assert.deepEqual(classificarItem(c, { descricao: "CANETA", classificacaoArquivo: "EXPEDIENTE", dominioArquivo: "Serviços" }), { classificacao: "EXPEDIENTE", dominio: "SERVIÇO" });
  });
  it("todo item tem domínio (pela descrição no último caso)", () => {
    assert.deepEqual(classificarItem(c, { descricao: "PRESTAÇÃO DE SERVIÇOS DE VIGILÂNCIA" }), { classificacao: "Não classificado", dominio: "SERVIÇO" });
    assert.equal(dominioPorDescricao("CADEIRA GIRATÓRIA"), "MATERIAL");
    assert.equal(dominioPorDescricao(null), "MATERIAL");
    assert.equal(dominioCanonico("materiais"), "MATERIAL");
    assert.equal(dominioCanonico("OUTRO"), null);
  });
  it("a versão muda quando o cadastro muda", () => {
    const a = versaoPadronizacao({ classificacoes: CLS, unidades: [] });
    assert.notEqual(a, versaoPadronizacao({ classificacoes: [{ ...CLS[0], dominio: "SERVIÇO" }, CLS[1]], unidades: [] }));
    assert.equal(a, versaoPadronizacao({ classificacoes: CLS, unidades: [] }));
  });
});

describe("classificação gravada (D1 real)", () => {
  it("grava os pendentes de DFD e de planilha e não os pega de novo na mesma versão", async () => {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO dfds (id, numero) VALUES (1, 'D1');
      INSERT INTO dfd_itens (id, dfd_id, descricao) VALUES (10, 1, 'DETERGENTE'), (11, 1, 'SERVIÇO X');
      INSERT INTO unidades (id, codigo, municipio) VALUES (1, 'A', 'RV');
      INSERT INTO itens (id, unidade_id, nome_produto) VALUES (20, 1, 'CANETA');`);
    const pd = await consultaPendentesDfd(orm, "v", 100);
    const pp = await consultaPendentesPlanilha(orm, "v", 100);
    assert.equal(pd.length + pp.length, 3);
    await orm.batch([
      comandoGravarDfd(orm, "v", { 10: ["LIMPEZA", "MATERIAL"], 11: ["Não classificado", "SERVIÇO"] }),
      comandoGravarPlanilha(orm, "v", { 20: ["EXPEDIENTE", "MATERIAL"] }),
    ]);
    const lidos = (db.prepare("SELECT id, classificacao AS c, dominio AS d FROM dfd_itens ORDER BY id").all() as object[]).map((r) => ({ ...r }));
    assert.deepEqual(lidos, [
      { id: 10, c: "LIMPEZA", d: "MATERIAL" },
      { id: 11, c: "Não classificado", d: "SERVIÇO" },
    ]);
    assert.deepEqual({ ...(db.prepare("SELECT classificacao_cat AS c, dominio_cat AS d FROM itens").get() as object) }, { c: "EXPEDIENTE", d: "MATERIAL" });
    assert.equal((await consultaPendentesDfd(orm, "v", 100)).length, 0);
    assert.equal((await consultaPendentesDfd(orm, "v2", 100)).length, 2);
  });
});
