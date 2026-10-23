import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  apiDosCampos,
  camposDaApi,
  type EdicaoApi,
  estadoApi,
  lerLista,
  lerParametros,
  marcadoresUsados,
  montarCorpo,
  motivoApiInvalida,
  pedidosPorAno,
  previaPedido,
  urlBaseValida,
  urlDaApi,
} from "../src/lib/centi-apis-core.ts";
import { centiApiSchema } from "../src/lib/centi-apis-validation.ts";

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
  ativa: false,
  frequenciaMin: 120,
  diasUteis: true,
  horaInicio: "07:00",
  horaFim: "19:00",
  anos: 2,
};

test("APIs da Centi: corpo com os marcadores (o valor inteiro vira número; dentro do texto, troca textual)", () => {
  const p = lerParametros('{"ano":"{ano}","idOrgao":"{orgao}","fonte":["{fonte}"],"ini":"01/01/{ano}","x":"{outro}"}');
  assert.ok(p.ok);
  assert.deepEqual(montarCorpo(p.ok && p.valor, { ano: 2026, orgao: 21, fonte: 100 }), {
    ano: 2026,
    idOrgao: 21,
    fonte: [100],
    ini: "01/01/2026",
    x: "{outro}",
  });
  assert.deepEqual(marcadoresUsados(p.ok && p.valor), ["ano", "fonte", "orgao", "outro"]);
});

test("APIs da Centi: parâmetros e lista tolerantes", () => {
  assert.equal(lerParametros("[1]").ok, false);
  assert.equal(lerParametros("{").ok, false);
  assert.deepEqual(lerLista("[2,3,3,-1,0,\"21\",1.5]"), [2, 3, 21]);
  assert.deepEqual(lerLista("x"), []);
  assert.deepEqual(lerLista(null), []);
});

test("APIs da Centi: só HTTPS do domínio da Centi", () => {
  assert.equal(urlBaseValida("https://api.centi.com.br/portal"), true);
  assert.equal(urlBaseValida("https://centi.com.br"), true);
  for (const u of [
    "http://api.centi.com.br/portal",
    "https://api.centi.com.br.evil.com/portal",
    "https://evilcenti.com.br/x",
    "https://u:s@api.centi.com.br/portal",
    "https://api.centi.com.br:8443/portal",
    "https://api.centi.com.br/portal?x=1",
    "https://127.0.0.1/",
    "nada",
  ]) {
    assert.equal(urlBaseValida(u), false, u);
  }
  assert.equal(urlDaApi({ urlBase: "https://api.centi.com.br/portal/", endpoint: "getempenhos", uf: "go", tenant: "rioverde" }), "https://api.centi.com.br/portal/getempenhos/go/rioverde");
});

test("APIs da Centi: a régua da edição (a mesma da tela e do servidor)", () => {
  assert.equal(motivoApiInvalida(base, false), null);
  assert.match(motivoApiInvalida({ ...base, ativa: true }, false) ?? "", /ainda não tem a importação/);
  assert.equal(motivoApiInvalida({ ...base, ativa: true }, true), null);
  assert.match(motivoApiInvalida({ ...base, nome: " " }, false) ?? "", /nome/);
  assert.match(motivoApiInvalida({ ...base, endpoint: "../x" }, false) ?? "", /endpoint/);
  assert.match(motivoApiInvalida({ ...base, urlBase: "https://outro.com" }, false) ?? "", /HTTPS/);
  assert.match(motivoApiInvalida({ ...base, parametros: "{" }, false) ?? "", /JSON/);
  assert.match(motivoApiInvalida({ ...base, parametros: '{"a":"{xyz}"}' }, false) ?? "", /desconhecido/);
  assert.match(motivoApiInvalida({ ...base, divisao: "orgao" }, false) ?? "", /\{orgao\}/);
  assert.match(motivoApiInvalida({ ...base, divisao: "orgao", parametros: '{"idOrgao":"{orgao}"}' }, false) ?? "", /órgãos/);
  assert.equal(motivoApiInvalida({ ...base, divisao: "orgao", parametros: '{"idOrgao":"{orgao}"}', lista: [2] }, false), null);
  assert.match(motivoApiInvalida({ ...base, frequenciaMin: 7 }, false) ?? "", /Frequência/);
  assert.match(motivoApiInvalida({ ...base, anos: 9 }, false) ?? "", /anos/);
  assert.match(motivoApiInvalida({ ...base, horaInicio: "19:00", horaFim: "07:00" }, false) ?? "", /antes do fim/);
  assert.match(motivoApiInvalida({ ...base, horaFim: "25:00" }, false) ?? "", /Horário/);
});

test("APIs da Centi: prévia, pedidos por ano e estado", () => {
  const p = previaPedido({ ...base, divisao: "orgao", parametros: '{"ano":"{ano}","idOrgao":"{orgao}"}', lista: [21, 22] }, 2026);
  assert.equal(p.url, "https://api.centi.com.br/portal/getempenhos/go/rioverde");
  assert.deepEqual(p.corpo, { ano: 2026, idOrgao: 21 });
  assert.equal(previaPedido({ ...base, parametros: "{" }, 2026).corpo, null);
  assert.equal(pedidosPorAno({ divisao: "ano", lista: [1, 2] }), 1);
  assert.equal(pedidosPorAno({ divisao: "orgao", lista: [1, 2] }), 2);
  assert.equal(estadoApi({ ativa: false, implementada: false, ultimoStatus: null }).rotulo, "Em preparação");
  assert.equal(estadoApi({ ativa: false, implementada: true, ultimoStatus: null }).rotulo, "Desligada");
  assert.equal(estadoApi({ ativa: true, implementada: true, ultimoStatus: "falhou" }).rotulo, "Com erro");
  assert.equal(estadoApi({ ativa: true, implementada: true, ultimoStatus: "completo" }).rotulo, "Ativa");
});

test("APIs da Centi: o Zod recusa campos a mais e tetos estourados", () => {
  assert.equal(centiApiSchema.safeParse(base).success, true);
  assert.equal(centiApiSchema.safeParse({ ...base, implementada: true }).success, false);
  assert.equal(centiApiSchema.safeParse({ ...base, lista: Array.from({ length: 201 }, (_, i) => i + 1) }).success, false);
  assert.equal(centiApiSchema.safeParse({ ...base, parametros: `{"x":"${"a".repeat(2100)}"}` }).success, false);
});

test("APIs da Centi: a migração semeia as 5 APIs desligadas, com cadastros válidos e a lista certa de órgãos", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../drizzle/0129_centi_apis.sql", import.meta.url), "utf8"));
  const linhas = db.prepare("SELECT * FROM centi_apis ORDER BY ordem").all() as Record<string, unknown>[];
  assert.deepEqual(
    linhas.map((l) => l.chave),
    ["empenhos", "liquidacoes", "pagamentos", "contratos", "receita"],
  );
  for (const l of linhas) {
    assert.equal(l.ativa, 0);
    assert.equal(l.implementada, 0);
    const e: EdicaoApi = {
      nome: String(l.nome),
      descricao: String(l.descricao),
      urlBase: String(l.url_base),
      endpoint: String(l.endpoint),
      uf: String(l.uf),
      tenant: String(l.tenant),
      divisao: l.divisao as EdicaoApi["divisao"],
      paginado: l.paginado === 1,
      parametros: String(l.parametros),
      lista: lerLista(l.lista),
      ativa: false,
      frequenciaMin: Number(l.frequencia_min),
      diasUteis: l.dias_uteis === 1,
      horaInicio: String(l.hora_inicio),
      horaFim: String(l.hora_fim),
      anos: Number(l.anos),
    };
    assert.equal(motivoApiInvalida(e, false), null, String(l.chave));
  }
  const liq = lerLista(linhas[1].lista);
  for (const id of [21, 22, 23, 24, 25, 28]) assert.ok(liq.includes(id), `órgão ${id}`);
  for (const id of [12, 13, 14, 17, 19, 20]) assert.ok(!liq.includes(id), `órgão ${id} não existe`);
  assert.equal(lerLista(linhas[3].lista).length, 66);
  assert.throws(() => db.exec("INSERT INTO centi_apis (chave, nome, endpoint) VALUES ('empenhos', 'x', 'y')"));
});

test("APIs da Centi: ida e volta pelos campos do banner (sim/não, lista e números)", () => {
  const e: EdicaoApi = { ...base, divisao: "orgao", parametros: '{"idOrgao":"{orgao}"}', lista: [2, 21, 28], ativa: true, diasUteis: false, paginado: false };
  const c = camposDaApi(e);
  assert.equal(c.lista, "2; 21; 28");
  assert.equal(c.ativa, "1");
  assert.deepEqual(apiDosCampos(c), e);
  assert.deepEqual(apiDosCampos({ ...c, lista: " 3,4 4;; 5 x " }).lista, [3, 4, 5]);
  assert.equal(apiDosCampos({ ...c, divisao: "outra" }).divisao, "ano");
});
