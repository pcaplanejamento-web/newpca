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
  centrosPendentes,
  conflitosCentros,
  lerCentros,
  lerModo,
  subunidadeEscolhivel,
  motivoSubunidadesInvalidas,
  planoMover,
  subunidadeDoDfd,
} from "../src/lib/subunidades-core.ts";
import * as q from "../src/lib/subunidades-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// SUBUNIDADES (v1.271.0): o CENTRO DE CUSTO do DFD tem de estar no cadastro da unidade — um para toda a unidade (a
// subunidade é ESCOLHIDA no DFD; sem subunidades, a própria unidade) ou um por subunidade (o centro define a subunidade).
// Sem cadastro, com o centro fora dele ou sem a escolha, o DFD gravado fica com ERRO.

const POR_SUB = (subunidades: ConfigSubunidades["subunidades"]): ConfigSubunidades => ({ codigo: "SEPLAN", modo: "subunidades", centros: [], subunidades });

test("subunidadeDoDfd: os dois modos e as bordas (sem unidade, sem centro, sem cadastro, fora do cadastro, ambígua)", () => {
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: null, centroCusto: "X" }, POR_SUB([])), { subunidade: null, falta: null }, "sem unidade: nada");
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "" }, POR_SUB([])), { subunidade: null, falta: null }, "sem centro: a falta é do centro");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, X" }, null).falta, "semCadastro", "unidade sem cadastro = erro");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, X" }, POR_SUB([])).falta, "semCadastro");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, X" }, POR_SUB([{ id: 9, nome: "S", centros: [] }])).falta, "semCadastro", "subunidade sem centro não conta");

  const unico: ConfigSubunidades = { codigo: "SMS", modo: "unico", centros: ["PM RV, SMS", "PM RV, SAÚDE"], subunidades: [] };
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "pm rv, saude" }, unico).subunidade, { id: null, nome: "SMS" }, "único sem subunidades: a própria unidade");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, EDUCAÇÃO" }, unico).falta, "centroNaoCadastrado");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, SMS" }, { ...unico, centros: [] }).falta, "semCadastro");
  const escolhe: ConfigSubunidades = { ...unico, subunidades: [{ id: 5, nome: "Atenção Básica", centros: [] }, { id: 6, nome: "Hospital", centros: [] }] };
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, SMS" }, escolhe).falta, "naoEscolhida", "único com subunidades: tem de escolher");
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: 1, subunidadeId: 6, centroCusto: "PM RV, SMS" }, escolhe).subunidade, { id: 6, nome: "Hospital" });
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, subunidadeId: 99, centroCusto: "PM RV, SMS" }, escolhe).falta, "naoEscolhida", "de outra unidade não vale");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, subunidadeId: 6, centroCusto: "PM RV, OUTRA" }, escolhe).falta, "centroNaoCadastrado", "a escolha não dispensa o centro");
  assert.equal(subunidadeEscolhivel(escolhe, 6), true);
  assert.equal(subunidadeEscolhivel(escolhe, 9), false);
  assert.equal(subunidadeEscolhivel(POR_SUB([{ id: 6, nome: "H", centros: ["X"] }]), 6), false, "no por subunidade, nunca escolhida");

  const cfg = POR_SUB([
    { id: 1, nome: "Compras", centros: ["PM RV, SEPLAN, COMPRAS"] },
    { id: 2, nome: "Licitações", centros: ["PM RV, SEPLAN, LICITACOES", "LICITAÇÕES"] },
  ]);
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "pm rv,  seplan, compras" }, cfg).subunidade, { id: 1, nome: "Compras" }, "sem caixa/espaço");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, GABINETE, LICITAÇÕES" }, cfg).subunidade?.nome, "Licitações", "pelo último nome");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, SEPLAN, OUTRA" }, cfg).falta, "centroNaoCadastrado");
  const dupla = POR_SUB([
    { id: 1, nome: "A", centros: ["PM RV, X, GGIM"] },
    { id: 2, nome: "B", centros: ["PM RV, Y, GGIM"] },
  ]);
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, Z, GGIM" }, dupla).falta, "ambigua", "nunca chuta");
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: "PM RV, X, GGIM" }, dupla).subunidade?.nome, "A", "o texto IGUAL vence o último nome");
});

test("cadastro: centro obrigatório, modo único com um só cadastro, nomes/centros repetidos, centro de outra unidade", () => {
  assert.equal(lerModo("marcado"), "unico", "os vínculos antigos = único");
  assert.equal(lerModo("subunidades"), "subunidades");
  assert.deepEqual(lerCentros('["a", " A ", "", "b"]'), ["a", "b"]);
  assert.deepEqual(lerCentros("{inválido"), []);
  assert.equal(chaveCentro("Câmara, GGIM"), "CAMARA GGIM");
  assert.equal(motivoSubunidadesInvalidas("subunidades", [], [{ nome: "A", centros: ["X"] }]), null);
  assert.equal(motivoSubunidadesInvalidas("unico", [], []), null, "sem cadastro é permitido (os DFDs ficam com erro)");
  assert.equal(motivoSubunidadesInvalidas("unico", ["PM RV, SMS"], [{ nome: "AB", centros: [] }]), null);
  assert.match(String(motivoSubunidadesInvalidas("unico", [], [{ nome: "AB", centros: [] }])), /Cadastre o centro de custo da unidade/);
  assert.match(String(motivoSubunidadesInvalidas("unico", ["X"], [{ nome: "AB", centros: ["Y"] }])), /não têm centro de custo próprio/);
  assert.match(String(motivoSubunidadesInvalidas("subunidades", ["X"], [])), /é de cada subunidade/);
  assert.match(String(motivoSubunidadesInvalidas("subunidades", [], [{ nome: "A", centros: [] }])), /Cadastre o centro de custo da subunidade “A”/);
  assert.match(String(motivoSubunidadesInvalidas("subunidades", [], [{ nome: "A", centros: ["X"] }, { nome: "a", centros: ["Y"] }])), /Duas subunidades/);
  assert.match(String(motivoSubunidadesInvalidas("subunidades", [], [{ nome: "A", centros: ["X"] }, { nome: "B", centros: ["x"] }])), /pertence a um só cadastro/);
  assert.match(String(motivoSubunidadesInvalidas("subunidades", [], [{ nome: " ", centros: ["X"] }])), /nome/);
  assert.deepEqual(conflitosCentros([], [{ nome: "A", centros: ["PM RV, GGIM"] }], [{ unidade: "GAB", subunidade: "Gabinete", centros: ["pm rv, ggim"] }]), ["“PM RV, GGIM” já está em Gabinete (GAB)"]);
  assert.deepEqual(conflitosCentros(["PM RV, SMS"], [], [{ unidade: "SMS2", subunidade: "", centros: ["PM RV, SMS"] }]), ["“PM RV, SMS” já está em SMS2"], "o centro da unidade também");
  assert.deepEqual(centrosDaConfig(POR_SUB([{ id: 1, nome: "A", centros: ["C1", "C2"] }])), ["C1", "C2"]);
  assert.deepEqual(centrosDaConfig({ codigo: "X", modo: "unico", centros: ["C1"], subunidades: [{ id: 1, nome: "A", centros: [] }] }), ["C1"], "o modo único: os da unidade");
});

test("conferência: Centro de Custo e cadastro só no DFD GRAVADO — ERRO sem cadastro; a análise de um arquivo nunca os aponta", () => {
  const regras = regrasPadrao();
  const semCadastro: RepConferencia = { id: 1, responsaveis: { padroes: [], temporarios: [] } as never, subunidade: { codigo: "SMS", modo: "unico", centros: [], subunidades: [] } };
  const rep: RepConferencia = { ...semCadastro, subunidade: { codigo: "SMS", modo: "unico", centros: ["PM RV, SMS"], subunidades: [] } };
  const c = { dfdTipo: null, categoria: null };
  assert.deepEqual(mensagensDoGravado({ centroCusto: null, subunidadeId: null }, rep, regras, c).map((m) => [m.chave, m.status]), [["dfd.centroCusto", "erro"]], "sem centro: só a do centro");
  assert.deepEqual(mensagensDoGravado({ centroCusto: "PM RV, SMS", subunidadeId: null }, semCadastro, regras, c).map((m) => [m.chave, m.status]), [["dfd.subunidade", "erro"]], "sem cadastro: ERRO");
  assert.deepEqual(mensagensDoGravado({ centroCusto: "PM RV, OUTRA", subunidadeId: null }, rep, regras, c).map((m) => [m.chave, m.status]), [["dfd.subunidade", "erro"]], "fora do cadastro: ERRO");
  assert.deepEqual(mensagensDoGravado({ centroCusto: "PM RV, SMS", subunidadeId: null }, rep, regras, c), [], "cadastrado: nada");
  const comSubs: RepConferencia = { ...rep, subunidade: { codigo: "SMS", modo: "unico", centros: ["PM RV, SMS"], subunidades: [{ id: 5, nome: "AB", centros: [] }] } };
  assert.deepEqual(mensagensDoGravado({ centroCusto: "PM RV, SMS", subunidadeId: null }, comSubs, regras, c).map((m) => [m.chave, m.status]), [["dfd.subunidade", "erro"]], "sem a escolha: ERRO");
  assert.deepEqual(mensagensDoGravado({ centroCusto: "PM RV, SMS", subunidadeId: 5 }, comSubs, regras, c), [], "escolhida: nada");
  assert.deepEqual(mensagensDoGravado({ centroCusto: null, subunidadeId: null }, null, regras, c), [], "sem unidade: a falta é a da unidade");
  // O ADM ignora o ponto: nada.
  const ignora = { ...regras, pontos: { "dfd.subunidade": "ignorar" as never } };
  assert.ok(!mensagensDoGravado({ centroCusto: "PM RV, SMS", subunidadeId: null }, semCadastro, ignora, c).length);
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
  const analise = avaliarLinhaDfd(d, semCadastro, { regras });
  assert.ok(!analise.mensagens.some((m) => m.chave === "dfd.centroCusto" || m.chave === "dfd.subunidade"));
  const gravado = avaliarLinhaDfd({ ...d, gravado: { centroCusto: "PM RV, SMS", subunidadeId: null } }, semCadastro, { regras });
  assert.ok(gravado.mensagens.some((m) => m.chave === "dfd.subunidade" && m.status === "erro"));
  assert.equal(gravado.estado, "erro");
});

const orm = (db: DatabaseSync) => drizzle(d1Sobre(db) as never, { schema }) as never as Parameters<typeof q.comandosGravarSubunidades>[0];
const lote = (o: unknown, cmds: unknown[]) => (o as { batch: (c: unknown[]) => Promise<unknown> }).batch(cmds);

test("builders: gravar o cadastro inteiro (modo, centros da unidade, ordem, saem/ficam/novas) e nunca mexer em outra unidade (D1 real)", async () => {
  const db = bancoMigrado();
  db.exec("INSERT INTO reparticoes (id, codigo, nome) VALUES (1, 'SMS', 'Saúde'), (2, 'SEPLAN', 'Planejamento')");
  const o = orm(db);
  await lote(o, q.comandosGravarSubunidades(o, 1, "subunidades", [], [{ nome: "Atenção Básica", centros: ["PM RV, AB"] }, { nome: "Hospital", centros: ["PM RV, HMU"] }]));
  const ids = (db.prepare("SELECT id, nome, ordem FROM subunidades WHERE reparticao_id = 1 ORDER BY ordem").all() as { id: number; nome: string }[]).map((r) => r.id);
  assert.equal(ids.length, 2);
  assert.equal((db.prepare("SELECT vinculo_subunidade AS v FROM reparticoes WHERE id = 1").get() as { v: string }).v, "subunidades");
  // Sai a 1ª, a 2ª muda de nome e vai ao topo, entra uma nova.
  await lote(o, q.comandosGravarSubunidades(o, 1, "subunidades", [], [{ id: ids[1], nome: "Hospital Municipal", centros: ["PM RV, HMU"] }, { nome: "UPA", centros: ["PM RV, UPA"] }]));
  const depois = db.prepare("SELECT id, nome, ordem, centros_custo AS c FROM subunidades WHERE reparticao_id = 1 ORDER BY ordem").all() as { id: number; nome: string; ordem: number; c: string }[];
  assert.deepEqual(depois.map((r) => [r.nome, r.ordem]), [["Hospital Municipal", 0], ["UPA", 1]]);
  assert.equal(depois[0].id, ids[1], "a que fica é a MESMA linha");
  assert.deepEqual(JSON.parse(depois[0].c), ["PM RV, HMU"]);
  // Para o modo único: os centros na unidade, as subunidades só com o nome; a escolhida no DFD cai com a excluída.
  db.prepare("INSERT INTO dfds (id, numero, reparticao_id, subunidade_id) VALUES (10, '10', 1, ?)").run(ids[1]);
  await lote(o, q.comandosGravarSubunidades(o, 1, "unico", ["PM RV, HMU", "PM RV, UPA"], [{ id: ids[1], nome: "Hospital Municipal", centros: [] }]));
  const u = db.prepare("SELECT vinculo_subunidade AS v, centro_custo AS c FROM reparticoes WHERE id = 1").get() as { v: string; c: string };
  assert.deepEqual([u.v, JSON.parse(u.c)], ["unico", ["PM RV, HMU", "PM RV, UPA"]]);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM subunidades WHERE reparticao_id = 1").get() as { n: number }).n, 1);
  assert.equal((db.prepare("SELECT subunidade_id AS s FROM dfds WHERE id = 10").get() as { s: number }).s, ids[1]);
  await lote(o, q.comandosGravarSubunidades(o, 1, "unico", ["PM RV, HMU"], []));
  assert.equal((db.prepare("SELECT subunidade_id AS s FROM dfds WHERE id = 10").get() as { s: number | null }).s, null, "a excluída deixa o DFD sem subunidade");
  // Nunca mexe nas de outra unidade.
  await lote(o, q.comandosGravarSubunidades(o, 2, "subunidades", [], [{ nome: "Compras", centros: ["PM RV, COMPRAS"] }]));
  await lote(o, q.comandosGravarSubunidades(o, 1, "unico", ["PM RV, HMU"], []));
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
  db.exec(sql(arqs[i]));
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

test("migração 0177: saem Próprio e Marcado — as subunidades sem centro saem, o modo vem da quantidade e a escolha do DFD é zerada", () => {
  const arqs = readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort();
  const i = arqs.indexOf("0177_subunidade_por_centro.sql");
  assert.ok(i > 0);
  const sql = (arq: string) => readFileSync(join(process.cwd(), "drizzle", arq), "utf8");
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const arq of arqs.slice(0, i)) db.exec(sql(arq));
  db.exec(`INSERT INTO reparticoes (id, codigo, nome, vinculo_subunidade) VALUES
    (101, 'GGIM', 'Gabinete', 'centro_custo'), (102, 'SMS', 'Saúde', 'marcado'), (103, 'SEPLAN', 'Planejamento', 'proprio'), (104, 'SEMED', 'Educação', 'centro_custo')`);
  db.exec(`INSERT INTO subunidades (id, reparticao_id, nome, centros_custo) VALUES
    (10, 101, 'Gabinete', '["PM RV, GGIM"]'), (20, 102, 'AB', '[]'), (21, 102, 'HMU', '["PM RV, HMU"]'), (40, 104, 'Escolas', '["E"]'), (41, 104, 'Creches', '["C"]')`);
  db.exec("INSERT INTO dfds (id, numero, reparticao_id, subunidade_id) VALUES (1, '1', 102, 20), (2, '2', 102, 21)");
  db.exec(sql(arqs[i]));
  const reps = db.prepare("SELECT id, vinculo_subunidade AS v FROM reparticoes WHERE id > 100 ORDER BY id").all() as { v: string }[];
  assert.deepEqual(reps.map((r) => r.v), ["unico", "unico", "unico", "subunidades"]);
  const subs = db.prepare("SELECT id, nome FROM subunidades ORDER BY id").all() as { id: number; nome: string }[];
  assert.deepEqual(subs.map((s) => [s.id, s.nome]), [[10, "GGIM"], [21, "SMS"], [40, "Escolas"], [41, "Creches"]], "sem centro saem; no único, o nome da unidade");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM dfds WHERE subunidade_id IS NOT NULL").get() as { n: number }).n, 0);
  db.exec(sql(arqs[i]));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM subunidades").get() as { n: number }).n, 4, "idempotente");
});

test("a troca de unidade do DFD mantém a subunidade escolhida SÓ se for da unidade nova (D1 real)", async () => {
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

test("migração 0178: no modo único o centro passa à unidade e a linha com o nome dela sai; o por subunidade fica", () => {
  const arqs = readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort();
  const i = arqs.indexOf("0178_centro_da_unidade.sql");
  assert.ok(i > 0);
  const sql = (arq: string) => readFileSync(join(process.cwd(), "drizzle", arq), "utf8");
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const arq of arqs.slice(0, i)) db.exec(sql(arq));
  db.exec(`INSERT INTO reparticoes (id, codigo, nome, vinculo_subunidade, centro_custo) VALUES
    (101, 'GGIM', 'Gabinete', 'unico', 'PM RV, GGIM'), (102, 'SEPLAN', 'Planejamento', 'unico', NULL), (104, 'SEMED', 'Educação', 'subunidades', 'velho')`);
  db.exec(`INSERT INTO subunidades (id, reparticao_id, nome, centros_custo) VALUES
    (10, 101, 'GGIM', '["PM RV, GGIM"]'), (40, 104, 'Escolas', '["E"]'), (41, 104, 'Creches', '["C"]')`);
  db.exec(sql(arqs[i]));
  const reps = db.prepare("SELECT centro_custo AS c FROM reparticoes WHERE id > 100 ORDER BY id").all() as { c: string }[];
  assert.deepEqual(reps.map((r) => JSON.parse(r.c)), [["PM RV, GGIM"], [], []]);
  assert.deepEqual((db.prepare("SELECT id FROM subunidades ORDER BY id").all() as { id: number }[]).map((s) => s.id), [40, 41]);
  // Reaplicar não muda nada (as subunidades do único, só com o nome, ficam).
  db.exec("INSERT INTO subunidades (id, reparticao_id, nome, centros_custo) VALUES (11, 101, 'AB', '[]')");
  db.exec(sql(arqs[i]));
  assert.deepEqual(JSON.parse((db.prepare("SELECT centro_custo AS c FROM reparticoes WHERE id = 101").get() as { c: string }).c), ["PM RV, GGIM"]);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM subunidades WHERE id = 11").get() as { n: number }).n, 1);
});

test("ida e volta no D1 real: o cadastro gravado é o lido (modo, centros da unidade, subunidades) e define a subunidade do DFD", async () => {
  const db = bancoMigrado();
  db.exec("INSERT INTO reparticoes (id, codigo, nome) VALUES (1, 'PGM', 'Procuradoria')");
  const o = orm(db);
  const centros = lerCentros(["PM RV, PROCURADORIA-GERAL DO MUNICÍPIO, PGM", " pm rv, procuradoria-geral do município, pgm "]);
  assert.equal(centros.length, 1, "repetido sem caixa/espaço sai antes de gravar");
  await lote(o, q.comandosGravarSubunidades(o, 1, "unico", centros, [{ nome: "Contencioso", centros: [] }, { nome: "Consultivo", centros: [] }]));
  // A leitura como `lerConfigSubunidades` faz (as MESMAS colunas e a régua `lerModo`/`lerCentros`).
  const u = db.prepare("SELECT codigo, vinculo_subunidade AS modo, centro_custo AS centros FROM reparticoes WHERE id = 1").get() as { codigo: string; modo: string; centros: string };
  const subs = await q.consultaSubunidades(o, [1]);
  const cfg: ConfigSubunidades = {
    codigo: u.codigo,
    modo: lerModo(u.modo),
    centros: lerModo(u.modo) === "unico" ? lerCentros(u.centros) : [],
    subunidades: subs.map((s) => ({ id: s.id, nome: s.nome, centros: lerCentros(s.centros) })),
  };
  assert.deepEqual(cfg.centros, ["PM RV, PROCURADORIA-GERAL DO MUNICÍPIO, PGM"]);
  assert.deepEqual(cfg.subunidades.map((s) => [s.nome, s.centros]), [["Contencioso", []], ["Consultivo", []]]);
  // O DFD com o centro gravado pela automação e a subunidade escolhida.
  db.exec("INSERT INTO dfds (id, numero, reparticao_id) VALUES (1, '1', 1)");
  await (o as unknown as { all: (s: unknown) => Promise<unknown[]> }).all(q.sqlCentroCusto([{ id: 1, centro: "PM RV, PROCURADORIA-GERAL DO MUNICÍPIO, PGM" }]));
  const d = db.prepare("SELECT centro_custo AS c FROM dfds WHERE id = 1").get() as { c: string };
  assert.equal(subunidadeDoDfd({ reparticaoId: 1, centroCusto: d.c }, cfg).falta, "naoEscolhida");
  const escolhida = cfg.subunidades[1].id;
  db.prepare("UPDATE dfds SET subunidade_id = ? WHERE id = 1").run(escolhida);
  assert.deepEqual(subunidadeDoDfd({ reparticaoId: 1, subunidadeId: escolhida, centroCusto: d.c }, cfg).subunidade, { id: escolhida, nome: "Consultivo" });
  // Regravar o mesmo cadastro mantém as linhas (os mesmos ids) — a escolha do DFD continua valendo.
  await lote(o, q.comandosGravarSubunidades(o, 1, "unico", centros, cfg.subunidades.map((s) => ({ id: s.id, nome: s.nome, centros: [] }))));
  assert.equal((db.prepare("SELECT subunidade_id AS s FROM dfds WHERE id = 1").get() as { s: number }).s, escolhida);
});

test("centrosPendentes e planoMover: os centros dos DFDs fora do cadastro e o MOVER entre cadastros (pela chave)", () => {
  const unico: ConfigSubunidades = { codigo: "FMS", modo: "unico", centros: ["PM RV, FMS"], subunidades: [] };
  assert.deepEqual(centrosPendentes(unico, ["pm rv, fms", "FUNDO SAÚDE, FARMÁCIA", "Fundo Saude, Farmacia", " "]), ["FUNDO SAÚDE, FARMÁCIA"], "sem repetir e sem os cadastrados");
  assert.deepEqual(centrosPendentes(null, ["X"]), ["X"], "sem cadastro: todos pendentes");
  const outras = [
    { reparticaoId: 2, unidade: "FMAS", subunidadeId: 7, subunidade: "Farmacêutica", centros: ["FUNDO SAUDE, FARMACIA", "FMAS, ASSIST"] },
    { reparticaoId: 3, unidade: "SMS", subunidadeId: null, subunidade: "", centros: ["PM RV, SMS"] },
  ];
  const p = planoMover(["fundo saúde, farmácia"], outras);
  assert.equal(p.length, 1, "só o cadastro que muda");
  assert.deepEqual([p[0].reparticaoId, p[0].subunidadeId, p[0].centros, p[0].tirados, p[0].rotulo], [2, 7, ["FMAS, ASSIST"], ["FUNDO SAUDE, FARMACIA"], "Farmacêutica (FMAS)"]);
  assert.deepEqual(planoMover([], outras), []);
});

test("builders: as opções contam os DFDs DA UNIDADE (primeiro) e o mover tira o centro do outro cadastro no mesmo lote (D1 real)", async () => {
  const db = bancoMigrado();
  db.exec("INSERT INTO reparticoes (id, codigo, nome, vinculo_subunidade, centro_custo) VALUES (1, 'FMS', 'Saúde', 'unico', '[]'), (2, 'FMAS', 'Assistência', 'subunidades', '[]'), (3, 'SMS', 'SMS', 'unico', '[\"PM RV, SMS\"]')");
  db.exec(`INSERT INTO subunidades (id, reparticao_id, nome, centros_custo) VALUES (7, 2, 'Farmacêutica', '["FUNDO SAUDE, FARMACIA","FMAS, ASSIST"]')`);
  db.exec("INSERT INTO dfds (id, numero, reparticao_id, centro_custo) VALUES (1, '1', 2, 'A OUTRA'), (2, '2', 2, 'A OUTRA'), (3, '3', 1, 'FUNDO SAUDE, FARMACIA'), (4, '4', 1, 'Z FMS')");
  const o = orm(db);
  const opcoes = await q.consultaCentrosDosDfds(o, 1);
  assert.deepEqual(opcoes.map((x) => [x.centro, Number(x.dfds), Number(x.daUnidade)]), [["FUNDO SAUDE, FARMACIA", 1, 1], ["Z FMS", 1, 1], ["A OUTRA", 2, 0]], "os da unidade primeiro");
  const porUnidade = await q.consultaCentrosPorUnidade(o);
  assert.equal(porUnidade.length, 3);
  const plano = planoMover(["FUNDO SAUDE, FARMACIA"], [{ reparticaoId: 2, unidade: "FMAS", subunidadeId: 7, subunidade: "Farmacêutica", centros: ["FUNDO SAUDE, FARMACIA", "FMAS, ASSIST"] }, { reparticaoId: 3, unidade: "SMS", subunidadeId: null, subunidade: "", centros: ["PM RV, SMS"] }]);
  await lote(o, [...q.comandosTirarCentros(o, plano), ...q.comandosGravarSubunidades(o, 1, "unico", ["FUNDO SAUDE, FARMACIA"], [])]);
  assert.deepEqual(JSON.parse((db.prepare("SELECT centros_custo AS c FROM subunidades WHERE id = 7").get() as { c: string }).c), ["FMAS, ASSIST"]);
  assert.deepEqual(JSON.parse((db.prepare("SELECT centro_custo AS c FROM reparticoes WHERE id = 1").get() as { c: string }).c), ["FUNDO SAUDE, FARMACIA"]);
  // Tirar da UNIDADE (modo único) e nunca da subunidade de outra unidade com o mesmo id.
  await lote(o, q.comandosTirarCentros(o, [{ reparticaoId: 3, subunidadeId: null, centros: [] }, { reparticaoId: 3, subunidadeId: 7, centros: [] }]));
  assert.deepEqual(JSON.parse((db.prepare("SELECT centro_custo AS c FROM reparticoes WHERE id = 3").get() as { c: string }).c), []);
  assert.deepEqual(JSON.parse((db.prepare("SELECT centros_custo AS c FROM subunidades WHERE id = 7").get() as { c: string }).c), ["FMAS, ASSIST"]);
});
