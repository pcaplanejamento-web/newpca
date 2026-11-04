import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { regrasPadrao } from "../src/lib/avaliacao-core.ts";
import { avaliarLinhaDfd, mensagensDoGravado, type RepConferencia } from "../src/lib/conferencia-dfd.ts";
import {
  type ConfigSubunidades,
  centrosDaConfig,
  chaveCentro,
  conflitosCentros,
  lerCentros,
  lerVinculo,
  motivoSubunidadesInvalidas,
  subunidadeDoDfd,
  subunidadeEscolhivel,
} from "../src/lib/subunidades-core.ts";
import * as q from "../src/lib/subunidades-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// SUBUNIDADES (v1.269.0): o vínculo da unidade decide a subunidade de cada DFD — Próprio (a própria unidade), Centro de
// custo (a subunidade cujo centro confere com o do DFD) ou Marcado (a escolhida no DFD). O Centro de Custo é dado do DFD
// gravado; sem ele, o DFD gravado fica apontado.

const CENTRO = (subunidades: ConfigSubunidades["subunidades"]): ConfigSubunidades => ({ codigo: "SEPLAN", vinculo: "centro_custo", subunidades });

test("subunidadeDoDfd: os três vínculos e as bordas (sem unidade, sem config, sem centro, ambígua, de outra unidade)", () => {
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: null }, CENTRO([])), { subunidade: null, falta: null }, "sem unidade: nada");
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: 1 }, null), { subunidade: null, falta: null }, "sem a configuração: nada");
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: 1 }, { codigo: "SEPLAN", vinculo: "proprio", subunidades: [] }).subunidade, { id: null, nome: "SEPLAN", origem: "propria" });

  const marcado: ConfigSubunidades = { codigo: "SMS", vinculo: "marcado", subunidades: [{ id: 5, nome: "Atenção Básica", centros: [] }] };
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, subunidadeId: 5 }, marcado).subunidade?.nome, "Atenção Básica");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, subunidadeId: null }, marcado).falta, "naoEscolhida");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, subunidadeId: 99 }, marcado).falta, "naoEscolhida", "subunidade de outra unidade não vale");

  const cfg = CENTRO([
    { id: 1, nome: "Compras", centros: ["PM RV, SEPLAN, COMPRAS"] },
    { id: 2, nome: "Licitações", centros: ["PM RV, SEPLAN, LICITACOES", "LICITAÇÕES"] },
  ]);
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "pm rv,  seplan, compras" }, cfg).subunidade?.nome, "Compras", "sem caixa/espaço");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, GABINETE, LICITAÇÕES" }, cfg).subunidade?.nome, "Licitações", "pelo último nome");
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "" }, cfg), { subunidade: null, falta: null }, "sem centro: a falta é do centro");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, SEPLAN, OUTRA" }, cfg).falta, "centroSemSubunidade");
  const dupla = CENTRO([
    { id: 1, nome: "A", centros: ["PM RV, X, GGIM"] },
    { id: 2, nome: "B", centros: ["PM RV, Y, GGIM"] },
  ]);
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, Z, GGIM" }, dupla).falta, "ambigua", "nunca chuta");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, X, GGIM" }, dupla).subunidade?.nome, "A", "o texto IGUAL vence o último nome");
});

test("cadastro: nomes/centros repetidos, centro de outra unidade, leitura tolerante e só o marcado é escolhível", () => {
  assert.equal(lerVinculo("x"), "proprio");
  assert.deepEqual(lerCentros('["a", " A ", "", "b"]'), ["a", "b"]);
  assert.deepEqual(lerCentros("{inválido"), []);
  assert.equal(chaveCentro("Câmara, GGIM"), "CAMARA GGIM");
  assert.equal(motivoSubunidadesInvalidas([{ nome: "A", centros: [] }]), null);
  assert.match(String(motivoSubunidadesInvalidas([{ nome: "A", centros: [] }, { nome: "a", centros: [] }])), /Duas subunidades/);
  assert.match(String(motivoSubunidadesInvalidas([{ nome: "A", centros: ["X"] }, { nome: "B", centros: ["x"] }])), /pertence a uma subunidade/);
  assert.match(String(motivoSubunidadesInvalidas([{ nome: " ", centros: [] }])), /nome/);
  assert.deepEqual(conflitosCentros([{ nome: "A", centros: ["PM RV, GGIM"] }], [{ unidade: "GAB", subunidade: "Gabinete", centros: ["pm rv, ggim"] }]), ["“PM RV, GGIM” já está em Gabinete (GAB)"]);
  const marcado: ConfigSubunidades = { codigo: "X", vinculo: "marcado", subunidades: [{ id: 3, nome: "S", centros: [] }] };
  assert.equal(subunidadeEscolhivel(marcado, 3), true);
  assert.equal(subunidadeEscolhivel({ ...marcado, vinculo: "centro_custo" }, 3), false, "só no vínculo Marcado");
  assert.equal(subunidadeEscolhivel(marcado, 4), false);
  assert.deepEqual(centrosDaConfig(CENTRO([{ id: 1, nome: "A", centros: ["C1", "C2"] }])), ["C1", "C2"]);
  assert.deepEqual(centrosDaConfig({ ...marcado, subunidades: [{ id: 1, nome: "A", centros: ["C1"] }] }), [], "fora do vínculo Centro de custo, nenhum");
});

test("conferência: Centro de Custo e Subunidade só no DFD GRAVADO — a análise de um arquivo nunca os aponta", () => {
  const regras = regrasPadrao();
  const rep: RepConferencia = { id: 1, responsaveis: { padroes: [], temporarios: [] } as never, subunidade: { codigo: "SMS", vinculo: "marcado", subunidades: [{ id: 5, nome: "AB", centros: [] }] } };
  const c = { dfdTipo: null, categoria: null };
  const sem = mensagensDoGravado({ centroCusto: null, subunidadeId: null }, rep, regras, c);
  assert.deepEqual(
    sem.map((m) => [m.chave, m.status]),
    [
      ["dfd.centroCusto", "erro"],
      ["dfd.subunidade", "atencao"],
    ],
  );
  assert.deepEqual(mensagensDoGravado({ centroCusto: "PM RV, SMS", subunidadeId: 5 }, rep, regras, c), [], "com os dois: nada");
  assert.deepEqual(mensagensDoGravado({ centroCusto: null, subunidadeId: null }, null, regras, c), [], "sem unidade: a falta é a da unidade");
  // O ADM ignora o ponto: nada.
  const ignora = { ...regras, pontos: { "dfd.centroCusto": "ignorar" as never } };
  assert.ok(!mensagensDoGravado({ centroCusto: null, subunidadeId: 5 }, rep, ignora, c).length);
  // Na linha: o DFD sem `gravado` (a análise) não ganha a pendência; o gravado sim.
  const d = {
    planejamento: "1",
    itens: [{ item: 1, codigo: "1", descricao: "x", unidade: "UN", quantidade: 1, valorUnitario: 1, valorTotal: 1 }],
    secoes: [],
    tipo: null,
    numeroContrato: null,
    numeroAta: null,
    numeroLicitacao: null,
    anoPca: 2027,
    assinaturas: [],
    nomeArquivo: "a.xlsx",
    orgaoEntidade: null,
  };
  const analise = avaliarLinhaDfd(d, rep, { regras });
  assert.ok(!analise.mensagens.some((m) => m.chave === "dfd.centroCusto" || m.chave === "dfd.subunidade"));
  const gravado = avaliarLinhaDfd({ ...d, gravado: { centroCusto: null, subunidadeId: null } }, rep, { regras });
  assert.ok(gravado.mensagens.some((m) => m.chave === "dfd.centroCusto" && m.status === "erro"));
  assert.equal(gravado.estado, "erro");
});

const orm = (db: DatabaseSync) => drizzle(d1Sobre(db) as never, { schema }) as never as Parameters<typeof q.comandosGravarSubunidades>[0];
const lote = (o: unknown, cmds: unknown[]) => (o as { batch: (c: unknown[]) => Promise<unknown> }).batch(cmds);

test("builders: gravar o cadastro inteiro (vínculo, ordem, saem/ficam/novas) e a subunidade marcada cai com a excluída (D1 real)", async () => {
  const db = bancoMigrado();
  db.exec("INSERT INTO reparticoes (id, codigo, nome) VALUES (1, 'SMS', 'Saúde'), (2, 'SEPLAN', 'Planejamento')");
  const o = orm(db);
  await lote(o, q.comandosGravarSubunidades(o, 1, "marcado", [{ nome: "Atenção Básica", centros: [] }, { nome: "Hospital", centros: ["PM RV, HMU"] }]));
  const ids = (db.prepare("SELECT id, nome, ordem FROM subunidades WHERE reparticao_id = 1 ORDER BY ordem").all() as { id: number; nome: string }[]).map((r) => r.id);
  assert.equal(ids.length, 2);
  assert.equal((db.prepare("SELECT vinculo_subunidade AS v FROM reparticoes WHERE id = 1").get() as { v: string }).v, "marcado");
  db.prepare("INSERT INTO dfds (id, numero, reparticao_id, subunidade_id) VALUES (10, '10', 1, ?)").run(ids[0]);
  // Sai a 1ª, a 2ª muda de nome e vai ao topo, entra uma nova.
  await lote(o, q.comandosGravarSubunidades(o, 1, "centro_custo", [{ id: ids[1], nome: "Hospital Municipal", centros: ["PM RV, HMU"] }, { nome: "UPA", centros: [] }]));
  const depois = db.prepare("SELECT id, nome, ordem, centros_custo AS c FROM subunidades WHERE reparticao_id = 1 ORDER BY ordem").all() as { id: number; nome: string; ordem: number; c: string }[];
  assert.deepEqual(depois.map((r) => [r.nome, r.ordem]), [["Hospital Municipal", 0], ["UPA", 1]]);
  assert.equal(depois[0].id, ids[1], "a que fica é a MESMA linha");
  assert.deepEqual(JSON.parse(depois[0].c), ["PM RV, HMU"]);
  assert.equal((db.prepare("SELECT subunidade_id AS s FROM dfds WHERE id = 10").get() as { s: number | null }).s, null, "a excluída deixa o DFD sem subunidade");
  // Nunca mexe nas de outra unidade (o id de outra unidade no "ficam" não a altera).
  await lote(o, q.comandosGravarSubunidades(o, 2, "marcado", [{ nome: "Compras", centros: [] }]));
  await lote(o, q.comandosGravarSubunidades(o, 1, "centro_custo", [{ id: ids[1], nome: "Hospital Municipal", centros: [] }]));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM subunidades WHERE reparticao_id = 2").get() as { n: number }).n, 1);
});

test("builders: o Centro de Custo vai aos DFDs num UPDATE só (só os que mudam) e as opções contam os DFDs (D1 real)", async () => {
  const db = bancoMigrado();
  db.exec("INSERT INTO dfds (id, numero, centro_custo) VALUES (1, '1', NULL), (2, '2', 'PM RV, SEPLAN'), (3, '3', 'PM RV, SEPLAN')");
  const o = orm(db) as unknown as { all: (s: unknown) => Promise<unknown[]> };
  const alterados = await o.all(q.sqlCentroCusto([
    { id: 1, centro: "PM RV, SEPLAN" },
    { id: 2, centro: "PM RV, SEPLAN" },
    { id: 3, centro: null },
  ]));
  assert.equal(alterados.length, 2, "o igual não é regravado");
  const linhas = db.prepare("SELECT id, centro_custo AS c, centro_custo_em AS em FROM dfds ORDER BY id").all() as { c: string | null; em: string | null }[];
  assert.deepEqual(linhas.map((l) => l.c), ["PM RV, SEPLAN", "PM RV, SEPLAN", null]);
  assert.ok(linhas[0].em && !linhas[1].em, "a data só no que mudou");
  const opcoes = await q.consultaCentrosDosDfds(orm(db));
  assert.deepEqual(opcoes.map((x) => [x.centro, Number(x.dfds)]), [["PM RV, SEPLAN", 2]]);
});

test("a troca de unidade do DFD mantém a subunidade SÓ se for da unidade nova (D1 real)", async () => {
  const db = bancoMigrado();
  db.exec("INSERT INTO reparticoes (id, codigo, nome) VALUES (1, 'A', 'A'), (2, 'B', 'B')");
  db.exec("INSERT INTO subunidades (id, reparticao_id, nome) VALUES (7, 1, 'S1')");
  db.exec("INSERT INTO dfds (id, numero, reparticao_id, subunidade_id) VALUES (1, '1', 1, 7), (2, '2', 1, 7)");
  const o = orm(db);
  await o.update(schema.dfds).set({ reparticaoId: 2, subunidadeId: q.subunidadeDaUnidade(2) }).where(eq(schema.dfds.id, 1));
  await o.update(schema.dfds).set({ reparticaoId: 1, subunidadeId: q.subunidadeDaUnidade(1) }).where(eq(schema.dfds.id, 2));
  const r = db.prepare("SELECT id, subunidade_id AS s FROM dfds ORDER BY id").all() as { s: number | null }[];
  assert.deepEqual(r.map((x) => x.s), [null, 7]);
});

test("migração 0176: a unidade com Centro de Custo vira o vínculo por centro de custo e os valores da coluna da Mesa vão ao DFD", () => {
  const arqs = readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort();
  const i = arqs.indexOf("0176_subunidades.sql");
  assert.ok(i > 0);
  const sql = (arq: string) => readFileSync(join(process.cwd(), "drizzle", arq), "utf8");
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const arq of arqs.slice(0, i)) db.exec(sql(arq));
  db.exec("INSERT INTO reparticoes (id, codigo, nome, centro_custo) VALUES (101, 'GGIM', 'Gabinete', ' PM RV, GGIM '), (102, 'SMS', 'Saúde', NULL)");
  db.exec("INSERT INTO dfds (id, numero) VALUES (1, '1'), (2, '2')");
  const col = (db.prepare("SELECT id FROM mesa_colunas WHERE entidade = 'dfd' AND chave = 'centro de custo'").get() as { id: number }).id;
  db.prepare("INSERT INTO mesa_colunas_valores (coluna_id, alvo_id, valor) VALUES (?, 1, 'PM RV, GGIM')").run(col);
  for (const arq of arqs.slice(i)) db.exec(sql(arq));
  const reps = db.prepare("SELECT id, vinculo_subunidade AS v FROM reparticoes WHERE id IN (101, 102) ORDER BY id").all() as { v: string }[];
  assert.deepEqual(reps.map((r) => r.v), ["centro_custo", "proprio"]);
  const subs = db.prepare("SELECT reparticao_id AS r, nome, centros_custo AS c FROM subunidades").all() as { r: number; nome: string; c: string }[];
  assert.deepEqual(JSON.parse(JSON.stringify(subs)), [{ r: 101, nome: "Gabinete", c: '["PM RV, GGIM"]' }]);
  const dfds = db.prepare("SELECT id, centro_custo AS c, centro_custo_em AS em FROM dfds ORDER BY id").all() as { c: string | null; em: string | null }[];
  assert.deepEqual(dfds.map((d) => d.c), ["PM RV, GGIM", null]);
  assert.ok(dfds[0].em);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM mesa_colunas WHERE chave = 'centro de custo'").get() as { n: number }).n, 0, "a coluna genérica saiu");
  // Reaplicar não duplica a subunidade.
  db.exec(sql(arqs[i]).split("--> statement-breakpoint").slice(6).join(";"));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM subunidades").get() as { n: number }).n, 1);
});
