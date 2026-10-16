import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandoPropriasVisao, comandosDestinoVinculos } from "../src/lib/orcamento-sql.ts";
import {
  aplicarNoEscopo,
  escopoEscolhido,
  type OpVinculo,
  planoVinculos,
  textoEscopo,
  type VinculoOrcamento,
  vinculosDaVisao,
} from "../src/lib/orcamento-vinculo.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const v = (id: number, chave: string, alvoId: number, acoes: string[] | null, visaoId: number | null = null): VinculoOrcamento => ({
  id,
  chave,
  texto: chave,
  alvoId,
  acoes,
  acoesFora: [],
  visaoId,
});

// PADRÃO: SAÚDE → 16 (as demais) e 17 (vigilância); EDUCAÇÃO → 20. A visão 1 tem SAÚDE própria (só 18); a visão 2 segue o padrão.
const TODOS = [v(1, "SAUDE", 16, null), v(2, "SAUDE", 17, ["VIG"]), v(3, "EDUC", 20, null), v(4, "SAUDE", 18, null, 1)];
const VISOES = [
  { id: 1, nome: "PCA", proprias: ["SAUDE"] },
  { id: 2, nome: "Investimentos", proprias: [] },
];

describe("vínculos por visão (núcleo)", () => {
  it("vinculosDaVisao: sem visão = o padrão; a visão usa os próprios na unidade e o padrão nas demais", () => {
    assert.deepEqual(
      vinculosDaVisao(TODOS, null).map((x) => x.id),
      [1, 2, 3],
    );
    assert.deepEqual(
      vinculosDaVisao(TODOS, VISOES[0])
        .map((x) => x.id)
        .sort(),
      [3, 4],
    );
    assert.deepEqual(
      vinculosDaVisao(TODOS, VISOES[1]).map((x) => x.id),
      [1, 2, 3],
    );
    // Própria sem nenhum vínculo = sem vínculo nesta visão (não volta ao padrão).
    assert.deepEqual(
      vinculosDaVisao(TODOS, { id: 2, proprias: ["EDUC"] }).map((x) => x.id),
      [1, 2],
    );
  });

  it("aplicarNoEscopo: cria, altera pela unidade de origem, exclui e respeita a regra", () => {
    const base = [{ texto: "S", alvoId: 16, acoes: null, acoesFora: [] }];
    const criado = aplicarNoEscopo(base, [{ chave: "S", texto: "S", de: null, para: { alvoId: 17, acoes: ["VIG"], acoesFora: [] } }]);
    assert.ok(Array.isArray(criado) && criado.length === 2);
    const alterado = aplicarNoEscopo(base, [{ chave: "S", texto: "S", de: 16, para: { alvoId: 19, acoes: null, acoesFora: [] } }]);
    assert.deepEqual(Array.isArray(alterado) && alterado.map((x) => x.alvoId), [19]);
    assert.deepEqual(aplicarNoEscopo(base, [{ chave: "S", texto: "S", de: 16, para: null }]), []);
    const conflito = aplicarNoEscopo(base, [{ chave: "S", texto: "S", de: null, para: { alvoId: 17, acoes: null, acoesFora: [] } }]);
    assert.equal(typeof conflito, "string", "dois vínculos com as demais na mesma unidade");
  });

  it("planoVinculos: só a visão materializa a partir do padrão e vira própria", () => {
    const op: OpVinculo = { chave: "EDUC", texto: "EDUC", de: 20, para: { alvoId: 21, acoes: null, acoesFora: [] } };
    const r = planoVinculos(TODOS, VISOES, [op], { padrao: false, visoes: [2] });
    assert.ok(!("erro" in r));
    assert.deepEqual(r.destinos, [{ visaoId: 2, chave: "EDUC", lista: [{ texto: "EDUC", alvoId: 21, acoes: null, acoesFora: [] }] }]);
    assert.deepEqual(r.proprias.get(2), ["EDUC"]);
  });

  it("planoVinculos: 'Todas' grava o padrão e só as visões com a unidade própria (as demais já acompanham)", () => {
    const op: OpVinculo = { chave: "SAUDE", texto: "SAUDE", de: null, para: { alvoId: 30, acoes: ["NOVA"], acoesFora: [] } };
    const r = planoVinculos(TODOS, VISOES, [op], escopoEscolhido("todas", [], 1, VISOES));
    assert.ok(!("erro" in r));
    assert.deepEqual(
      r.destinos.map((d) => d.visaoId),
      [null, 1],
    );
    assert.equal(r.proprias.size, 0);
  });

  it("planoVinculos: tudo ou nada — a regra recusada numa visão devolve o motivo com o nome", () => {
    // Na visão 1 a SAÚDE já tem um "as demais" (18): outro "as demais" é recusado lá (no padrão substitui o 16).
    const op: OpVinculo = { chave: "SAUDE", texto: "SAUDE", de: 16, para: { alvoId: 40, acoes: null, acoesFora: [] } };
    const r = planoVinculos(TODOS, VISOES, [op], { padrao: true, visoes: [1] });
    assert.ok("erro" in r && r.erro.startsWith('Visão "PCA"'));
  });

  it("escopoEscolhido e textoEscopo", () => {
    assert.deepEqual(escopoEscolhido("esta", [], null, VISOES), { padrao: true, visoes: [] });
    assert.deepEqual(escopoEscolhido("esta", [], 2, VISOES), { padrao: false, visoes: [2] });
    assert.deepEqual(escopoEscolhido("escolher", ["0", "2"], 1, VISOES), { padrao: true, visoes: [2] });
    assert.equal(textoEscopo({ padrao: true, visoes: [1, 2] }), "padrão + 2 visões");
  });
});

const DIR = join(process.cwd(), "drizzle");
describe("vínculos por visão (builders no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = new DatabaseSync(":memory:");
    for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
    db.exec("PRAGMA foreign_keys = ON");
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO orgaos (id, nome, sigla) VALUES (900, 'Órgão X', 'OX');
      INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (9016, 'SMSX', 'Saúde', 900), (9017, 'VIGX', 'Vigilância', 900), (9018, 'HOSPX', 'Hospital', 900);
      INSERT INTO orcamento_visoes (id, nome) VALUES (1, 'PCA');
      INSERT INTO orcamento_vinculos (tipo, chave, texto, reparticao_id) VALUES ('unidade', 'SAUDE', 'Saúde', 9016);`);
  });

  it("grava a lista da visão sem tocar no padrão e marca a unidade como própria", async () => {
    await orm.batch([
      ...comandosDestinoVinculos(orm, {
        visaoId: 1,
        chave: "SAUDE",
        lista: [
          { texto: "Saúde", alvoId: 9016, acoes: null, acoesFora: ["VIG"] },
          { texto: "Saúde", alvoId: 9017, acoes: ["VIG"], acoesFora: [] },
        ],
      }),
      comandoPropriasVisao(orm, 1, ["SAUDE"]),
    ] as never);
    const linhas = db.prepare("SELECT reparticao_id AS r, visao_id AS v, acoes, acoes_fora AS f FROM orcamento_vinculos ORDER BY id").all() as {
      r: number;
      v: number | null;
      acoes: string | null;
      f: string | null;
    }[];
    assert.deepEqual(
      linhas.map((l) => ({ ...l })),
      [
        { r: 9016, v: null, acoes: null, f: null },
        { r: 9016, v: 1, acoes: null, f: '["VIG"]' },
        { r: 9017, v: 1, acoes: '["VIG"]', f: null },
      ],
    );
    assert.equal((db.prepare("SELECT vinculos_proprios AS p FROM orcamento_visoes WHERE id = 1").get() as { p: string }).p, '["SAUDE"]');
  });

  it("voltar ao padrão: apaga só os da visão; regravar o padrão não mexe na visão", async () => {
    await orm.batch(comandosDestinoVinculos(orm, { visaoId: null, chave: "SAUDE", lista: [{ texto: "Saúde", alvoId: 9018, acoes: null, acoesFora: [] }] }) as never);
    const [apagar] = comandosDestinoVinculos(orm, { visaoId: 1, chave: "SAUDE", lista: [] });
    await orm.batch([apagar, comandoPropriasVisao(orm, 1, [])] as never);
    const linhas = db.prepare("SELECT reparticao_id AS r, visao_id AS v FROM orcamento_vinculos").all() as { r: number; v: number | null }[];
    assert.deepEqual(
      linhas.map((l) => ({ ...l })),
      [{ r: 9018, v: null }],
    );
  });
});
