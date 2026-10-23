import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  codigoCenti,
  codigosDosOrgaos,
  type EdicaoApi,
  estadoApi,
  lerLista,
  lerParametros,
  marcadoresUsados,
  montarCorpo,
  motivoApiInvalida,
  type OrgaoDoCadastro,
  orgaosSemCodigo,
  pedidosDoAno,
  previaPedido,
  registrosDaResposta,
  resumoResposta,
  urlBaseValida,
  urlDaApi,
} from "../src/lib/centi-apis-core.ts";
import { centiApiSchema, testarCentiApiSchema } from "../src/lib/centi-apis-validation.ts";

const base: EdicaoApi = {
  nome: "Empenhos",
  descricao: "",
  urlBase: "https://api.centi.com.br/portal",
  endpoint: "getempenhos",
  uf: "go",
  tenant: "rioverde",
  divisao: "ano",
  paginado: true,
  parametros: '{"dataInicio":"01/01/{ano}","dataFim":"31/12/{ano}"}',
  lista: [],
  orgaos: [],
  unidades: [],
  ativa: false,
  frequenciaMin: 120,
  diasUteis: true,
  horaInicio: "07:00",
  horaFim: "19:00",
  anos: 2,
};

const CADASTRO: OrgaoDoCadastro[] = [
  { id: 1, sigla: "PMRV", nome: "Prefeitura", codigoCenti: 2 },
  { id: 2, sigla: "FMS", nome: "Fundo de Saúde", codigoCenti: 3 },
  { id: 3, sigla: "SEM", nome: "Sem código", codigoCenti: null },
  { id: 4, sigla: "DUP", nome: "Mesmo código", codigoCenti: 2 },
];

const POR_ORGAO: EdicaoApi = { ...base, divisao: "orgao", parametros: '{"ano":"{ano}","idOrgao":"{orgao}"}' };

test("APIs da Centi: corpo com os marcadores (o valor inteiro vira número; dentro do texto, troca textual)", () => {
  const p = lerParametros('{"ano":"{ano}","idOrgao":"{orgao}","fonte":["{fonte}"],"ini":"01/01/{ano}","x":"{outro}"}');
  assert.ok(p.ok);
  assert.deepEqual(montarCorpo(p.ok && p.valor, { ano: 2026, orgao: 21, fonte: 100 }), { ano: 2026, idOrgao: 21, fonte: [100], ini: "01/01/2026", x: "{outro}" });
  assert.deepEqual(marcadoresUsados(p.ok && p.valor), ["ano", "fonte", "orgao", "outro"]);
});

test("APIs da Centi: parâmetros, listas e o código da Centi tolerantes", () => {
  assert.equal(lerParametros("[1]").ok, false);
  assert.equal(lerParametros("{").ok, false);
  assert.deepEqual(lerLista('[2,3,3,-1,0,"21",1.5]'), [2, 3, 21]);
  assert.deepEqual(lerLista("x"), []);
  assert.equal(codigoCenti("02"), 2);
  assert.equal(codigoCenti(" 28 "), 28);
  for (const v of [null, "", "abc", "0", "-3", "2.5"]) assert.equal(codigoCenti(v), null, String(v));
});

test("APIs da Centi: só HTTPS do domínio da Centi", () => {
  assert.equal(urlBaseValida("https://api.centi.com.br/portal"), true);
  for (const u of ["http://api.centi.com.br/portal", "https://api.centi.com.br.evil.com/p", "https://evilcenti.com.br/x", "https://u:s@api.centi.com.br/p", "https://api.centi.com.br:8443/p", "https://api.centi.com.br/p?x=1", "https://127.0.0.1/", "nada"]) {
    assert.equal(urlBaseValida(u), false, u);
  }
  assert.equal(urlDaApi({ urlBase: "https://api.centi.com.br/portal/", endpoint: "getempenhos", uf: "go", tenant: "rioverde" }), "https://api.centi.com.br/portal/getempenhos/go/rioverde");
});

test("APIs da Centi: os órgãos do CADASTRO viram os pedidos (nenhum escolhido = todos com o código; sem repetir)", () => {
  assert.deepEqual(codigosDosOrgaos([], CADASTRO), [2, 3]);
  assert.deepEqual(codigosDosOrgaos([2, 3], CADASTRO), [3]);
  assert.deepEqual(codigosDosOrgaos([3], CADASTRO), []);
  assert.deepEqual(orgaosSemCodigo([2, 3], CADASTRO).map((o) => o.sigla), ["SEM"]);
  assert.deepEqual(pedidosDoAno(POR_ORGAO, 2026, CADASTRO), [{ ano: 2026, orgao: 2 }, { ano: 2026, orgao: 3 }]);
  assert.deepEqual(pedidosDoAno({ ...base, divisao: "fonte", lista: [100, 101] }, 2026, CADASTRO), [{ ano: 2026, fonte: 100 }, { ano: 2026, fonte: 101 }]);
  assert.deepEqual(pedidosDoAno(base, 2025, CADASTRO), [{ ano: 2025 }]);
  assert.deepEqual(previaPedido({ ...base, parametros: '{"dataInicio":"{inicio}","dataFim":"{fim}"}' }, 2026, CADASTRO).corpo, { dataInicio: "01/01/2026", dataFim: "31/01/2026" }, "o teste lê janeiro");
  const p = previaPedido(POR_ORGAO, 2026, CADASTRO, 1);
  assert.deepEqual(p.corpo, { ano: 2026, idOrgao: 3 });
  assert.equal(p.pedidos.length, 2);
  assert.match(previaPedido({ ...POR_ORGAO, orgaos: [3] }, 2026, CADASTRO).erro ?? "", /Nenhum pedido/);
});

test("APIs da Centi: a régua da edição (a mesma da tela e do servidor)", () => {
  const m = (e: EdicaoApi, impl = false) => motivoApiInvalida(e, impl, CADASTRO) ?? "";
  assert.equal(motivoApiInvalida(base, false, CADASTRO), null);
  assert.match(m({ ...base, ativa: true }), /ainda não tem a importação/);
  assert.equal(motivoApiInvalida({ ...base, ativa: true }, true, CADASTRO), null);
  assert.match(m({ ...base, nome: " " }), /nome/);
  assert.match(m({ ...base, endpoint: "../x" }), /endpoint/);
  assert.match(m({ ...base, urlBase: "https://outro.com" }), /HTTPS/);
  assert.match(m({ ...base, parametros: "{" }), /JSON/);
  assert.match(m({ ...base, parametros: '{"a":"{xyz}"}' }), /desconhecido/);
  assert.match(m({ ...base, divisao: "orgao" }), /\{orgao\}/);
  assert.match(m({ ...POR_ORGAO, orgaos: [3] }), /ID da entidade na Centi/);
  assert.equal(motivoApiInvalida(POR_ORGAO, false, CADASTRO), null);
  assert.match(m({ ...base, divisao: "fonte", parametros: '{"fonte":"{fonte}"}' }), /fontes/);
  assert.match(m({ ...base, frequenciaMin: 7 }), /Frequência/);
  assert.match(m({ ...base, anos: 9 }), /anos/);
  assert.match(m({ ...base, horaInicio: "19:00", horaFim: "07:00" }), /antes do fim/);
  assert.match(m({ ...base, horaFim: "25:00" }), /Horário/);
});

test("APIs da Centi: o resumo da resposta do teste (lista direta ou dentro de um objeto, total, campos e amostra)", () => {
  const lista = JSON.stringify([
    { Id: 1, Numero: "10", Historico: "x".repeat(400), TotalRegistros: 1530 },
    { Id: 2, Numero: "11", Extra: { a: 1 } },
  ]);
  const r = resumoResposta(lista);
  assert.equal(r.itens, 2);
  assert.equal(r.total, 1530);
  assert.deepEqual(r.campos, ["Id", "Numero", "Historico", "TotalRegistros", "Extra"]);
  assert.equal(r.amostra[0].Historico.length, 160);
  assert.equal(r.amostra[1].Extra, '{"a":1}');
  assert.equal(r.mensagem, null);
  assert.equal(resumoResposta(JSON.stringify({ TotalRegistros: 7, data: [{ a: 1 }] })).total, 7);
  assert.deepEqual(registrosDaResposta({ ok: true, itens: [{ a: 1 }] }), [{ a: 1 }]);
  assert.match(resumoResposta("[]").mensagem ?? "", /sem registros/);
  assert.match(resumoResposta("<html>erro</html>").mensagem ?? "", /não é JSON/);
  assert.match(resumoResposta("").mensagem ?? "", /vazia/);
  assert.match(resumoResposta('{"ok":true}').mensagem ?? "", /lista de registros/);
});

test("APIs da Centi: estado na tela (a de importação manual não diz 'Em preparação')", () => {
  const e = (chave: string, ativa: boolean, implementada: boolean, ultimoStatus: string | null) => estadoApi({ chave, ativa, implementada, ultimoStatus }).rotulo;
  assert.equal(e("liquidacoes", false, false, null), "Em preparação");
  assert.equal(e("empenhos", false, false, null), "Importação manual");
  assert.equal(e("empenhos", false, false, "completo"), "Importação manual");
  assert.equal(e("empenhos", false, false, "parcial"), "Última importação incompleta");
  assert.equal(e("empenhos", false, true, null), "Desligada");
  assert.equal(e("empenhos", true, true, "falhou"), "Com erro");
  assert.equal(e("empenhos", true, true, "completo"), "Ativa");
});

test("APIs da Centi: o Zod recusa campos a mais e tetos estourados; o teste pede ano e pedido válidos", () => {
  assert.equal(centiApiSchema.safeParse(base).success, true);
  assert.equal(centiApiSchema.safeParse({ ...base, implementada: true }).success, false);
  assert.equal(centiApiSchema.safeParse({ ...base, lista: Array.from({ length: 201 }, (_, i) => i + 1) }).success, false);
  assert.equal(centiApiSchema.safeParse({ ...base, parametros: `{"x":"${"a".repeat(2100)}"}` }).success, false);
  assert.equal(testarCentiApiSchema.safeParse({ edicao: base, ano: 2026 }).success, true);
  assert.equal(testarCentiApiSchema.safeParse({ edicao: base, ano: 1990 }).success, false);
  assert.equal(testarCentiApiSchema.safeParse({ edicao: base, ano: 2026, pedido: -1 }).success, false);
});

test("APIs da Centi: as migrações semeiam as 5 APIs desligadas e válidas, com o escopo pelo cadastro", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../drizzle/0129_centi_apis.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../drizzle/0130_centi_apis_escopo.sql", import.meta.url), "utf8"));
  const linhas = db.prepare("SELECT * FROM centi_apis ORDER BY ordem").all() as Record<string, unknown>[];
  assert.deepEqual(
    linhas.map((l) => l.chave),
    ["empenhos", "liquidacoes", "pagamentos", "contratos", "receita"],
  );
  for (const l of linhas) {
    assert.equal(l.ativa, 0);
    assert.equal(l.implementada, 0);
    assert.equal(l.orgaos, "[]");
    assert.equal(l.unidades, "[]");
    if (l.divisao === "orgao") assert.equal(l.lista, "[]");
    const e: EdicaoApi = {
      ...base,
      nome: String(l.nome),
      endpoint: String(l.endpoint),
      divisao: l.divisao as EdicaoApi["divisao"],
      paginado: l.paginado === 1,
      parametros: String(l.parametros),
      lista: lerLista(l.lista),
    };
    assert.equal(motivoApiInvalida(e, false, CADASTRO), null, String(l.chave));
  }
  assert.equal(lerLista(linhas[3].lista).length, 66);
  assert.throws(() => db.exec("INSERT INTO centi_apis (chave, nome, endpoint) VALUES ('empenhos', 'x', 'y')"));
});
