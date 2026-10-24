import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  anosDoCard,
  CARD_PADRAO,
  cardPadrao,
  lerTipoCard,
  rotaDoCard,
  telaDoCard,
  catalogoDasLinhas,
  coberturaDoGrupo,
  type EdicaoCard,
  estadoCard,
  pendenciasDoCard,
  gruposDosVinculos,
  lerAnos,
  mapaDosVinculos,
  motivoCardInvalido,
  motivoVinculosInvalidos,
  previaPedido,
  rotuloAnos,
  semVinculo,
  type VinculoCard,
  vinculoDaLinha,
  vinculosDosGrupos,
} from "../src/lib/empenho-cards-core.ts";
import { comandoRegistrarCatalogo, comandosCriarCard, comandosGravarVinculos, consultaCatalogo, consultaVinculosCard } from "../src/lib/empenho-cards-sql.ts";
import { cardEmpenhoSchema, criarCardSchema, vinculosCardSchema } from "../src/lib/empenho-cards-validation.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const card: EdicaoCard = { nome: "Empenhos", ...CARD_PADRAO };
const v = (orgaoGestor: string, unidade: string | null, acao: string | null, orgaoId = 1, reparticaoId: number | null = null): VinculoCard => ({ orgaoGestor, unidade, acao, orgaoId, reparticaoId });

test("cards: os anos (relativos e fixos) — tolerantes, sem repetir, sem futuro", () => {
  assert.deepEqual(lerAnos("[0,-1,0,2024,1999,-3]"), [0, -1, 2024]);
  assert.deepEqual(lerAnos("x"), [0]);
  assert.deepEqual(lerAnos("[]"), [0]);
  assert.deepEqual(anosDoCard([0, -1, 2025, 2030], 2026), [2026, 2025]);
  assert.deepEqual(anosDoCard([-2, 2024], 2026), [2024]);
  assert.equal(rotuloAnos([0, 2024]), "Ano atual, 2024");
});

test("cards: a régua da configuração (a mesma da tela e do servidor)", () => {
  assert.equal(motivoCardInvalido(card), null);
  const m = (e: Partial<EdicaoCard>) => motivoCardInvalido({ ...card, ...e }) ?? "";
  assert.match(m({ nome: " " }), /nome/);
  assert.match(m({ cor: "red" }), /Cor/);
  assert.match(m({ urlBase: "https://outro.com" }), /HTTPS/);
  assert.match(m({ endpoint: "../x" }), /endpoint/);
  assert.match(m({ parametros: "{" }), /JSON/);
  assert.match(m({ parametros: '{"a":"{orgao}"}' }), /desconhecido/);
  assert.match(m({ anos: [] }), /ano/);
  assert.match(m({ anos: [1990] }), /Ano inválido/);
  assert.match(m({ frequenciaMin: 7 }), /Frequência/);
  assert.match(m({ horaInicio: "19:00", horaFim: "07:00" }), /antes do fim/);
  assert.match(m({ quedaSoma: 33 }), /queda/);
  assert.deepEqual(previaPedido(card, 2026, "2026-10-24").corpo, { dataInicio: "01/01/2026", dataFim: "31/12/2026" });
  assert.deepEqual(previaPedido(card, 2025, "2026-10-24").corpo, { dataInicio: "01/01/2025", dataFim: "31/12/2025" });
  const ok = { configuradoEm: "2026-10-24", vinculos: 2 };
  assert.equal(estadoCard({ ativa: true, ultimoStatus: "promovido", ...ok }).rotulo, "Automática");
  assert.equal(estadoCard({ ativa: true, ultimoStatus: "falhou", ...ok }).rotulo, "Com erro");
  assert.equal(estadoCard({ ativa: false, ultimoStatus: null, ...ok }, true).rotulo, "Importando");
  assert.equal(estadoCard({ ativa: true, ultimoStatus: null, configuradoEm: null, vinculos: 2 }).rotulo, "A configurar");
  assert.equal(estadoCard({ ativa: true, ultimoStatus: null, configuradoEm: "x", vinculos: 0 }).rotulo, "A configurar");
  // A CONFIGURAÇÃO vem antes de importar: 1º a Configuração confirmada, 2º ao menos um vínculo.
  assert.deepEqual(pendenciasDoCard({ configuradoEm: null }, 0).map((p) => p.aba), ["configuracao", "vinculos"]);
  assert.deepEqual(pendenciasDoCard({ configuradoEm: "x" }, 0).map((p) => p.aba), ["vinculos"]);
  assert.deepEqual(pendenciasDoCard({ configuradoEm: "x" }, 1), []);
  assert.ok(cardEmpenhoSchema.safeParse(card).success);
  assert.ok(!cardEmpenhoSchema.safeParse({ ...card, extra: 1 }).success);
  assert.ok(criarCardSchema.safeParse({ nome: "Saúde", copiarDe: 1 }).success);
  assert.ok(!vinculosCardSchema.safeParse({ vinculos: [{ ...v("A", null, null), orgaoId: 0 }] }).success);
});

test("cards: o vínculo mais ESPECÍFICO vale (ação › unidade orçamentária › órgão gestor); sem vínculo = nada é gravado", () => {
  const m = mapaDosVinculos([v("PMRV", null, null, 1), v("PMRV", "02.01", null, 1, 10), v("PMRV", "02.01", "2001", 1, 11)]);
  assert.equal(vinculoDaLinha(m, { orgaoGestor: "PMRV", unidadeOrcamentaria: "02.01", acao: "2001" })?.reparticaoId, 11);
  assert.equal(vinculoDaLinha(m, { orgaoGestor: "PMRV", unidadeOrcamentaria: "02.01", acao: "2002" })?.reparticaoId, 10);
  assert.equal(vinculoDaLinha(m, { orgaoGestor: "PMRV", unidadeOrcamentaria: "03.01", acao: null })?.reparticaoId, null);
  assert.equal(vinculoDaLinha(m, { orgaoGestor: "FMS", unidadeOrcamentaria: "1", acao: "1" }), null);
  // A unidade "" (vazia na Centi) só casa com o vínculo de unidade vazia ou o do órgão inteiro.
  const s = mapaDosVinculos([v("X", "", null, 1, 5)]);
  assert.equal(vinculoDaLinha(s, { orgaoGestor: "X", unidadeOrcamentaria: null, acao: null })?.reparticaoId, 5);
  assert.equal(vinculoDaLinha(s, { orgaoGestor: "X", unidadeOrcamentaria: "1", acao: null }), null);
});

test("cards: a regra dos vínculos — ação só com a unidade, sem repetir, unidade do mesmo órgão", () => {
  const cad = { orgaos: new Set([1, 2]), unidades: new Map<number, number | null>([[10, 1], [20, 2]]) };
  assert.equal(motivoVinculosInvalidos([v("A", null, null), v("A", "1", "x", 1, 10)], cad), null);
  assert.match(motivoVinculosInvalidos([v("A", null, "x")], cad) ?? "", /ação só pode/);
  assert.match(motivoVinculosInvalidos([v("A", "1", null), v("A", "1", null, 2)], cad) ?? "", /dois vínculos/);
  assert.match(motivoVinculosInvalidos([v("A", null, null, 9)], cad) ?? "", /Órgão do cadastro/);
  assert.match(motivoVinculosInvalidos([v("A", null, null, 1, 20)], cad) ?? "", /não é do órgão/);
  assert.match(motivoVinculosInvalidos([v(" ", null, null)], cad) ?? "", /órgão gestor/);
});

test("cards: grupos ⇄ vínculos (as ações do mesmo destino juntas) e a cobertura do catálogo", () => {
  const vs = [v("A", "1", "y", 1, 10), v("A", "1", "x", 1, 10), v("A", null, null, 1), v("B", "2", null, 2)];
  const gs = gruposDosVinculos(vs);
  assert.equal(gs.length, 3);
  assert.deepEqual(gs.find((g) => g.unidade === "1")?.acoes, ["x", "y"]);
  assert.equal(vinculosDosGrupos(gs).length, 4);
  const cat = catalogoDasLinhas([
    { orgaoGestor: "A", unidadeOrcamentaria: "1", acao: "x" },
    { orgaoGestor: "A", unidadeOrcamentaria: "1", acao: "x" },
    { orgaoGestor: "A", unidadeOrcamentaria: "9", acao: "z" },
    { orgaoGestor: "C", unidadeOrcamentaria: null, acao: null },
  ]).map(([orgaoGestor, unidade, acao, registros]) => ({ orgaoGestor, unidade, acao, registros, ultimoAno: 2026 }));
  assert.deepEqual(cat.find((c) => c.acao === "x")?.registros, 2);
  assert.deepEqual(semVinculo(cat, vs).map((c) => c.orgaoGestor), ["C"]);
  const gAcoes = gs.find((g) => g.unidade === "1");
  assert.ok(gAcoes);
  assert.deepEqual(coberturaDoGrupo(gAcoes, cat, vs), { itens: 1, registros: 2 });
  const gInteiro = gs.find((g) => g.orgaoGestor === "A" && g.unidade == null);
  assert.ok(gInteiro);
  assert.deepEqual(coberturaDoGrupo(gInteiro, cat, vs), { itens: 1, registros: 1 }, "o mais específico de outro grupo não conta aqui");
});

function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'), (2, 'Fundo', 'FMS'); INSERT INTO reparticoes (id, orgao_id, codigo, nome) VALUES (10, 1, 'SEMED', 'Educação'), (20, 2, 'FMS', 'Saúde')");
  raw.exec("INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos')");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const emp = raw.prepare("INSERT INTO empenhos (card_id, chave, ano, numero, orgao_gestor, unidade_orcamentaria, acao, valor_empenhado, orgao_id, reparticao_id) VALUES (1, ?, 2026, ?, ?, ?, ?, 1, ?, ?)");
  return { raw, db, emp };
}

test("cards no banco: gravar os vínculos REFAZ os empenhos — o sem vínculo SAI, os demais acompanham", async () => {
  const b = banco();
  b.emp.run("k1", "1", "PMRV", "02.01", "2001", 1, null);
  b.emp.run("k2", "2", "FMS", "1", "1", 2, null);
  const vs = Array.from({ length: 40 }, (_, i) => v("PMRV", "02.01", `A${i}`, 1, 10)).concat([v("PMRV", "02.01", "2001", 1, 10)]);
  await b.db.batch(comandosGravarVinculos(b.db, 1, vs) as never);
  assert.equal((await consultaVinculosCard(b.db, 1)).length, 41);
  const linhas = b.raw.prepare("SELECT chave, orgao_id, reparticao_id FROM empenhos ORDER BY chave").all();
  assert.deepEqual(linhas.map((l) => [l.chave, l.reparticao_id]), [["k1", 10]], "o FMS sem vínculo saiu do banco");
  assert.ok(b.raw.prepare("SELECT vinculos_em FROM empenho_cards WHERE id = 1").get()?.vinculos_em);
  // Trocar para o órgão inteiro leva o empenho ao órgão (sem unidade).
  await b.db.batch(comandosGravarVinculos(b.db, 1, [v("PMRV", null, null, 1)]) as never);
  assert.deepEqual(b.raw.prepare("SELECT reparticao_id FROM empenhos").get()?.reparticao_id, null);
});

test("cards no banco: criar COPIA os vínculos de outro card; o catálogo soma os registros do mesmo lote", async () => {
  const b = banco();
  await b.db.batch(comandosGravarVinculos(b.db, 1, [v("PMRV", null, null, 1), v("FMS", "1", null, 2, 20)]) as never);
  const r = (await b.db.batch(comandosCriarCard(b.db, { nome: "Saúde" }, 1) as never)) as unknown[];
  const novo = (r[r.length - 1] as { id: number }[])[0].id;
  assert.equal(novo, 2);
  assert.equal((await consultaVinculosCard(b.db, 2)).length, 2);
  await b.db.batch(comandosCriarCard(b.db, { nome: "Vazio" }, null) as never);
  assert.equal((await consultaVinculosCard(b.db, 3)).length, 0);

  await comandoRegistrarCatalogo(b.db, 7, 2026, [["PMRV", "02.01", "2001", 3]]);
  await comandoRegistrarCatalogo(b.db, 7, 2026, [["PMRV", "02.01", "2001", 2], ["FMS", "", "", 1]]);
  await comandoRegistrarCatalogo(b.db, 8, 2025, [["PMRV", "02.01", "2001", 4]]);
  const cat = await consultaCatalogo(b.db);
  assert.deepEqual(cat.map((c) => [c.orgaoGestor, c.registros, c.ultimoAno]).sort(), [["FMS", 1, 2026], ["PMRV", 4, 2026]]);

  // Excluir o card leva os vínculos e os empenhos (cascata).
  b.emp.run("k9", "9", "PMRV", "x", "y", 1, null);
  b.raw.exec("DELETE FROM empenho_cards WHERE id = 1");
  assert.equal(b.raw.prepare("SELECT COUNT(*) AS n FROM empenho_card_vinculos WHERE card_id = 1").get()?.n, 0);
  assert.equal(b.raw.prepare("SELECT COUNT(*) AS n FROM empenhos").get()?.n, 0);
});

test("cards no banco: a unidade/órgão excluído leva os empenhos; a unidade que muda de órgão leva vínculo e empenhos", async () => {
  const b = banco();
  b.raw.exec("INSERT INTO reparticoes (id, orgao_id, codigo, nome) VALUES (11, 1, 'SEMAD', 'Adm')");
  await b.db.batch(comandosGravarVinculos(b.db, 1, [v("PMRV", "1", null, 1, 10), v("PMRV", "2", null, 1, 11)]) as never);
  b.emp.run("k1", "1", "PMRV", "1", "", 1, 10);
  b.emp.run("k2", "2", "PMRV", "2", "", 1, 11);
  b.raw.exec("UPDATE reparticoes SET orgao_id = 2 WHERE id = 11");
  assert.equal(b.raw.prepare("SELECT orgao_id FROM empenhos WHERE chave = 'k2'").get()?.orgao_id, 2);
  assert.equal(b.raw.prepare("SELECT orgao_id FROM empenho_card_vinculos WHERE reparticao_id = 11").get()?.orgao_id, 2);
  b.raw.exec("DELETE FROM reparticoes WHERE id = 10");
  assert.deepEqual(b.raw.prepare("SELECT chave FROM empenhos").all().map((l) => l.chave), ["k2"]);
  assert.equal(b.raw.prepare("SELECT COUNT(*) AS n FROM empenho_card_vinculos WHERE reparticao_id = 10").get()?.n, 0);
});

test("migração 0143: a API, os vínculos de Órgãos e Unidades, as importações e os empenhos vão ao 1º card", () => {
  const raw = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "drizzle");
  const arqs = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const i = arqs.findIndex((f) => f.startsWith("0143_"));
  for (const a of arqs.slice(0, i)) raw.exec(readFileSync(join(dir, a), "utf8"));
  raw.exec(`
    DELETE FROM orgaos; DELETE FROM reparticoes;
    INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'), (2, 'Fundo', 'FMS');
    INSERT INTO reparticoes (id, orgao_id, codigo, nome) VALUES (10, 1, 'SEMED', 'Educação'), (11, 1, 'SEMAD', 'Adm');
    INSERT INTO centi_unidades (id, orgao_gestor, unidade) VALUES (1, 'PMRV', '02.01'), (2, 'PMRV', '02.02');
    UPDATE orgaos SET centi_orgao_gestor = 'FMS' WHERE id = 2;
    UPDATE reparticoes SET centi_unidade_id = 1 WHERE id = 10;
    UPDATE reparticoes SET centi_unidade_id = 2 WHERE id = 11;
    INSERT INTO centi_acoes (centi_unidade_id, acao, reparticao_id, registros) VALUES (2, '2001', 11, 5), (2, '2002', NULL, 1);
    UPDATE centi_apis SET anos = 3 WHERE chave = 'empenhos';
    INSERT INTO centi_lotes (id, api_chave, ano, estado) VALUES (1, 'empenhos', 2026, 'promovido'), (2, 'receita', 2026, 'promovido');
  `);
  const ins = raw.prepare("INSERT INTO empenhos (chave, ano, numero, orgao_gestor, unidade_orcamentaria, acao, valor_empenhado) VALUES (?, 2026, ?, ?, ?, ?, 1)");
  ins.run("a", "1", "PMRV", "02.01", "9");
  ins.run("b", "2", "PMRV", "02.02", "2001");
  ins.run("c", "3", "PMRV", "02.02", "2002");
  ins.run("d", "4", "FMS", "x", "y");
  ins.run("e", "5", "OUTRO", "x", "y");
  raw.exec(readFileSync(join(dir, arqs[i]), "utf8"));

  assert.deepEqual(raw.prepare("SELECT id, nome, anos FROM empenho_cards").all().map((c) => [c.id, c.nome, c.anos]), [[1, "Empenhos", "[0,-1,-2]"]]);
  const vs = raw.prepare("SELECT orgao_gestor, unidade, acao, orgao_id, reparticao_id FROM empenho_card_vinculos ORDER BY orgao_gestor, unidade, acao").all();
  assert.deepEqual(vs.map((x) => [x.orgao_gestor, x.unidade, x.acao, x.orgao_id, x.reparticao_id]), [
    ["FMS", null, null, 2, null],
    ["PMRV", "02.01", null, 1, 10],
    ["PMRV", "02.02", "2001", 1, 11],
  ]);
  assert.deepEqual(raw.prepare("SELECT id, card_id FROM centi_lotes").all().map((l) => [l.id, l.card_id]), [[1, 1]]);
  const e = raw.prepare("SELECT chave, card_id, orgao_id, reparticao_id FROM empenhos ORDER BY chave").all();
  assert.deepEqual(e.map((x) => [x.chave, x.card_id, x.orgao_id, x.reparticao_id]), [["a", 1, 1, 10], ["b", 1, 1, 11], ["d", 1, 2, null]], "a ação 2002 e o OUTRO sem vínculo saíram");
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM centi_catalogo").get()?.n, 2);
  for (const t of ["centi_apis", "centi_unidades", "centi_acoes"]) assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?").get(t)?.n, 0, t);
  const cols = (t: string) => raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  assert.ok(!cols("reparticoes").includes("centi_unidade_id") && !cols("orgaos").includes("centi_orgao_gestor") && !cols("centi_lotes").includes("api_chave"));
  // 0144: o card que já tem vínculos conta como configurado; um card novo, não.
  raw.exec("INSERT INTO empenho_cards (id, nome) VALUES (2, 'Novo')");
  const j = arqs.findIndex((f) => f.startsWith("0144_"));
  raw.exec(readFileSync(join(dir, arqs[j]), "utf8"));
  assert.deepEqual(raw.prepare("SELECT id, configurado_em IS NOT NULL AS c FROM empenho_cards ORDER BY id").all().map((c) => [c.id, c.c]), [[1, 1], [2, 0]]);
});

test("cards de LIQUIDAÇÕES: a origem é exigida, o padrão é a API de liquidações e as pendências seguem a origem", () => {
  const liq: EdicaoCard = { nome: "Liquidações", ...cardPadrao("liquidacoes", 4) };
  assert.equal(liq.endpoint, "getliquidacoes");
  assert.equal(liq.origemId, 4);
  assert.equal(motivoCardInvalido(liq, "liquidacoes"), null);
  assert.match(motivoCardInvalido({ ...liq, origemId: null }, "liquidacoes") ?? "", /card de empenhos de origem/);
  assert.match(motivoCardInvalido({ ...card, origemId: 4 }) ?? "", /Só o card de liquidações/);
  assert.deepEqual(cardPadrao("empenhos", 4), CARD_PADRAO, "o de empenhos não tem origem");
  assert.deepEqual(pendenciasDoCard({ configuradoEm: "x", tipo: "liquidacoes", origemId: null }, 3).map((p) => p.aba), ["configuracao"]);
  assert.deepEqual(pendenciasDoCard({ configuradoEm: "x", tipo: "liquidacoes", origemId: 4 }, 0).map((p) => p.aba), ["vinculos"]);
  assert.deepEqual(pendenciasDoCard({ configuradoEm: "x", tipo: "liquidacoes", origemId: 4 }, 2), []);
  assert.equal(rotaDoCard({ id: 7, tipo: "liquidacoes" }, "importacao"), "/painel/liquidacoes/7?aba=importacao");
  assert.equal(telaDoCard({ tipo: lerTipoCard("x") }), "empenhos");
});
