// "LER A TELA PROTOCOLO": o que a extensão APRENDE (centi-anexo.js em vm) e o núcleo puro do sistema (modelo, colunas,
// leitura das linhas, páginas e a emissão do PDF).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { coerceConfigAutomacao } from "../src/lib/automacao-core.ts";
import {
  coerceModeloTela,
  consultaPermitida,
  corpoEmissao,
  juntarProtocolos,
  lerLinhas,
  linhaPlana,
  modeloDoAprendiz,
  nomePdfProtocolo,
  numeroDoProcesso,
  type PedidoAprendido,
  proximaPagina,
  sugerirColunas,
} from "../src/lib/automacao-tela-protocolo.ts";

type J = ReturnType<typeof JSON.parse>;
type Pecas = Record<string, (...a: unknown[]) => J>;
function pecas(): Pecas {
  const ctx: Record<string, unknown> = { URL, URLSearchParams };
  vm.runInNewContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  const p = readFileSync("extensao-centi/centi-main.js", "utf8").match(/const PROTOCOLO = (\d+);/)?.[1];
  const x = ctx[`__pcaCentiAnexo_p${p}`] as Pecas;
  return Object.fromEntries(Object.entries(x).map(([k, f]) => [k, (...a: unknown[]) => (typeof f === "function" ? JSON.parse(JSON.stringify(f(...a) ?? null)) : f)]));
}

// Uma resposta no padrão da Centi: lista de objetos com {Fields:[{Key,Value}]}.
const linha = (id: number, processo: string, destino: string) => ({ Fields: [{ Key: "Id", Value: id }, { Key: "Processo", Value: processo }, { Key: "Data", Value: "01/10/2026" }, { Key: "DepartamentoDestino", Value: destino }, { Key: "Token", Value: "segredo" }] });
const resposta = (n: number, aba: string) => ({ Success: true, Entities: Array.from({ length: n }, (_, i) => linha(1000 + i, `${156800 + i}/2026`, aba)) });

test("extensão: só CONSULTAS de leitura são aprendidas/repetidas (salvar, excluir, tramitar e o arquivo, nunca)", () => {
  const A = pecas();
  assert.equal(A.consultaPermitida("restauth/list?entity=102908", "POST"), true);
  assert.equal(A.consultaPermitida("restauth/LoadObjectReference", "POST"), true);
  for (const c of ["restauth/save", "restauth/confirmsave", "restauth/delete?x=1", "restauth/tramitar", "restauth/operation", "restauth/getbinlink/abc", "rest/list"])
    assert.equal(A.consultaPermitida(c, "POST"), false, c);
  assert.equal(A.consultaPermitida("restauth/list", "DELETE"), false);
  // O núcleo do sistema usa a MESMA régua.
  assert.equal(consultaPermitida("restauth/list?entity=102908", "POST"), true);
  assert.equal(consultaPermitida("restauth/save", "POST"), false);
});

test("extensão: o aprendiz guarda o pedido COMPLETO (sem segredos) e o resumo da resposta; escrita nunca", () => {
  const A = pecas();
  const corpo = JSON.stringify({ Entity: 102908, Filtro: { Departamentos: [7, 9], Situacao: "ARECEBER" }, Token: "abc", Take: 100, Skip: 0 });
  const r = A.registroDoAprendiz("https://rioverde.centi.com.br/wcf/restauth/list?entity=102908&token=x", "POST", corpo, 200, "application/json", JSON.stringify(resposta(3, "PLAN")));
  assert.equal(r.tipo, "consulta");
  assert.equal(r.caminho, "restauth/list?entity=102908");
  assert.equal(r.corpo.Token, undefined);
  assert.deepEqual(r.corpo.Filtro.Departamentos, [7, 9]);
  assert.deepEqual(r.resposta.lista, ["Entities"]);
  assert.equal(r.resposta.total, 3);
  assert.equal(r.resposta.linhas[0].Processo, "156800/2026");
  assert.equal(r.resposta.linhas[0].Token, undefined);
  assert.equal(A.registroDoAprendiz("https://rioverde.centi.com.br/wcf/restauth/save", "POST", corpo, 200, "application/json", "{}"), null);
  assert.equal(A.registroDoAprendiz("https://rioverde.centi.com.br/wcf/restauth/list", "POST", corpo, 500, "application/json", "{}"), null);
  // A operação só é aprendida quando GEROU UM ARQUIVO (um relatório).
  const op = JSON.stringify({ ModuleKey: 9001, Guid: "24e3e9d0-0000-4000-8000-000000000001", Params: [{ Key: "IdProtocolo", Value: "1001" }] });
  assert.equal(A.registroDoAprendiz("https://rioverde.centi.com.br/wcf/restauth/operation", "POST", op, 200, "application/json", '{"Success":true}'), null);
  const arq = A.registroDoAprendiz("https://rioverde.centi.com.br/wcf/restauth/operation", "POST", op, 200, "application/json", '{"File":{"Key":"0a1b2c3d-0000-4000-8000-00000000000a","FileName":"p.pdf"}}');
  assert.equal(arq.tipo, "operacao");
  assert.equal(A.chaveOperacao(JSON.parse(op)), "9001|24e3e9d0-0000-4000-8000-000000000001");
});

test("extensão e sistema achatam a linha do MESMO jeito (Fields incluído, segredos fora)", () => {
  const A = pecas();
  const l = linha(7, "1/2026", "X");
  assert.deepEqual(A.linhaPlana(l), linhaPlana(l));
});

function aprendido(): PedidoAprendido[] {
  const A = pecas();
  const corpo = (s: string) => JSON.stringify({ Entity: 102908, Situacao: s, Take: 2, Skip: 0 });
  const url = "https://rioverde.centi.com.br/wcf/restauth/list?entity=102908";
  return [
    A.registroDoAprendiz(url, "POST", JSON.stringify({ x: 1 }), 200, "application/json", JSON.stringify({ Departamentos: [{ Nome: "PLAN" }] })),
    A.registroDoAprendiz(url, "POST", corpo("ARECEBER"), 200, "application/json", JSON.stringify(resposta(2, "PLAN"))),
    A.registroDoAprendiz(url, "POST", corpo("EMANALISE"), 200, "application/json", JSON.stringify(resposta(1, "PLAN"))),
    A.registroDoAprendiz(
      "https://rioverde.centi.com.br/wcf/restauth/operation",
      "POST",
      JSON.stringify({ ModuleKey: 9001, Guid: "24e3e9d0-0000-4000-8000-000000000001", Params: [{ Key: "Formato", Value: "PDF" }, { Key: "IdProtocolo", Value: "1001" }] }),
      200,
      "application/json",
      '{"File":{"Key":"0a1b2c3d-0000-4000-8000-00000000000a"}}',
    ),
  ].filter(Boolean) as PedidoAprendido[];
}

test("modelo: as consultas de PROTOCOLOS (abas pelo corpo), colunas sugeridas e a emissão pelo ID da linha", () => {
  const { modelo, campos, total } = modeloDoAprendiz(aprendido(), new Date("2026-10-02T12:00:00Z"));
  assert.ok(modelo);
  assert.deepEqual(
    modelo.consultas.map((c) => c.rotulo),
    ["A Receber", "Em Análise"],
  );
  assert.equal(total, 3);
  assert.ok(campos.includes("DepartamentoDestino"));
  assert.equal(modelo.colunas.id, "Id");
  assert.equal(modelo.colunas.processo, "Processo");
  assert.equal(modelo.colunas.destino, "DepartamentoDestino");
  assert.deepEqual(modelo.emissao && { param: modelo.emissao.param, campo: modelo.emissao.campo }, { param: "IdProtocolo", campo: "Id" });
  // O modelo salvo passa pela normalização (e a configuração o guarda).
  assert.deepEqual(coerceModeloTela(JSON.parse(JSON.stringify(modelo))), modelo);
  assert.deepEqual(coerceConfigAutomacao({ telaProtocolo: modelo }).telaProtocolo, modelo);
});

test("modelo: consulta de escrita ou corpo enorme é descartada; sem consulta válida = null", () => {
  const base = { rotulo: "X", metodo: "POST", corpo: {}, lista: [] };
  assert.equal(coerceModeloTela({ consultas: [{ ...base, caminho: "restauth/save" }] }), null);
  assert.equal(coerceModeloTela({ consultas: [{ ...base, caminho: "restauth/list", corpo: { a: "x".repeat(20000) } }] }), null);
  assert.equal(coerceModeloTela({ consultas: [{ ...base, caminho: "restauth/list" }] })?.consultas.length, 1);
  assert.equal(coerceModeloTela(null), null);
});

test("ler: linhas mapeadas, o mesmo protocolo em duas abas vira UMA linha com as abas", () => {
  const colunas = sugerirColunas(["Id", "Processo", "Data", "DepartamentoDestino"]);
  const a = lerLinhas(resposta(2, "PLAN"), { lista: ["Entities"], rotulo: "A Receber" }, colunas);
  const b = lerLinhas(resposta(1, "PLAN"), { lista: ["Entities"], rotulo: "Em Análise" }, colunas);
  assert.equal(a[0].numero, "156800");
  assert.equal(a[0].ano, "2026");
  assert.equal(a[0].destino, "PLAN");
  const j = juntarProtocolos([a, b]);
  assert.equal(j.length, 2);
  assert.deepEqual(j[0].abas, ["A Receber", "Em Análise"]);
  assert.deepEqual(numeroDoProcesso("Processo 000123 / 2025"), { numero: "123", ano: "2025" });
  assert.deepEqual(numeroDoProcesso("sem número"), { numero: null, ano: null });
});

test("páginas: a resposta cheia pede a próxima (skip ou page); a incompleta encerra", () => {
  assert.deepEqual(proximaPagina("restauth/list", { Take: 50, Skip: 0 }, 50), { caminho: "restauth/list", corpo: { Take: 50, Skip: 50 } });
  assert.equal(proximaPagina("restauth/list", { Take: 50, Skip: 0 }, 12), null);
  assert.deepEqual(proximaPagina("restauth/list?pageSize=20&page=1", null, 20), { caminho: "restauth/list?pageSize=20&page=2", corpo: null });
  assert.equal(proximaPagina("restauth/list", { Filtro: 1 }, 500), null);
});

test("emissão: o parâmetro do protocolo leva o campo da linha; o nome do PDF segue o processo", () => {
  const e = { moduleKey: 9001, guid: "24e3e9d0-0000-4000-8000-000000000001", params: [{ Key: "Formato", Value: "PDF" }, { Key: "IdProtocolo", Value: "1001" }], param: "IdProtocolo", campo: "Id" };
  assert.deepEqual(corpoEmissao(e, { bruto: { Id: "2042" } })?.Params, [
    { Key: "Formato", Value: "PDF" },
    { Key: "IdProtocolo", Value: "2042" },
  ]);
  assert.equal(corpoEmissao(e, { bruto: {} }), null);
  assert.equal(nomePdfProtocolo({ numero: "156844", ano: "2026", id: "9", origem: "SEPLAN - Planejamento" }), "SEPLAN - Protocolo 156844 - 2026.pdf");
});

test("extensão: o `ler` passa pela trava de leitura, o `pedir` só repete a operação aprendida e o id é FIXO (chave no manifesto)", () => {
  const main = readFileSync("extensao-centi/centi-main.js", "utf8");
  assert.match(main, /async function ler\(d\) \{[\s\S]*?A\.consultaPermitida\(caminho, metodo\)/);
  assert.match(main, /const ACOES = \{ pedir, protocolo, anexar, gravador, aprender, ler, captura: capturaEmissao, grade: gradeDaTela \};/);
  assert.match(main, /operacoesAprendidas\(\)\.includes\(A\?\.chaveOperacao\(c\)\)/);
  // O aprendiz nunca guarda cabeçalhos (a sessão vai neles).
  assert.doesNotMatch(main.slice(main.indexOf("function aprenderResposta"), main.indexOf("const textoDoXhr")), /cabecalhos|__pcaHs/);
  const m = JSON.parse(readFileSync("extensao-centi/manifest.json", "utf8"));
  assert.match(m.key, /^MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA[A-Za-z0-9+/=]{300,}$/);
  assert.deepEqual(JSON.parse(readFileSync("extensao-centi/background.js", "utf8").match(/const ACOES_CENTI = (\[[^\]]+\]);/)?.[1] ?? "[]"), ["pedir", "protocolo", "anexar", "gravador", "aprender", "ler", "telaDepartamentos", "telaEmAnalise", "telaEmitir"]);
});

test("em análise: protocolos limpos e sem repetir; o casamento com o sistema respeita o ano; a escolha lembrada só com o que existe", async () => {
  const { normalizarProtocolosTela, noSistemaTela, departamentosEscolhidosValidos } = await import("../src/lib/automacao-tela-protocolo.ts");
  const ps = normalizarProtocolosTela([
    { protocolo: "0156844", ano: "2026", departamento: " PCA  - X ", natureza: "INCLUSÃO - PCA" },
    { protocolo: "156844", ano: "2026" },
    { protocolo: "", ano: "2026" },
    "lixo",
  ]);
  assert.deepEqual(
    ps.map((p) => [p.chave, p.departamento]),
    [["156844/2026", "PCA - X"]],
  );
  const casar = noSistemaTela([{ numero: "156844/2025" }, { numero: "157001" }, { numero: "160000/2026" }]);
  assert.equal(casar({ protocolo: "156844", ano: "2026" }), null);
  assert.deepEqual(casar({ protocolo: "157001", ano: "2026" }), { numero: "157001" });
  assert.deepEqual(casar({ protocolo: "160000", ano: "2026" }), { numero: "160000/2026" });
  assert.deepEqual(departamentosEscolhidosValidos(["A", "Z", 3, "A"], ["A", "B"]), ["A"]);
  assert.deepEqual(departamentosEscolhidosValidos(null, ["A"]), []);
});

test("tela protocolo: os dados do cadastro da Centi limpos, o casamento pelo Id e o nome do PDF", async () => {
  const { dadosCentiValidos, noSistemaTela, nomePdfEmAnalise } = await import("../src/lib/automacao-tela-protocolo.ts");
  assert.equal(dadosCentiValidos(null), null);
  const d = dadosCentiValidos({
    id: "002273524",
    campos: [{ rotulo: " Id ", valor: "2273524" }, { rotulo: "Id", valor: "x" }, { rotulo: "Protocolo", valor: "97608" }, { rotulo: "", valor: "y" }, { rotulo: "Valor", valor: 3 }, "lixo"],
  });
  assert.deepEqual(d, {
    id: "2273524",
    campos: [
      { rotulo: "Id", valor: "2273524" },
      { rotulo: "Protocolo", valor: "97608" },
      { rotulo: "Valor", valor: "" },
    ],
  });
  // O Id da Centi decide (mesmo com o nº renumerado); sem Id, o nº + ano.
  const casar = noSistemaTela([
    { numero: "155000/2026", idExterno: "2273524" },
    { numero: "97608/2026", idExterno: null },
  ]);
  assert.equal(casar({ protocolo: "97608", ano: "2026", id: "2273524" })?.numero, "155000/2026");
  assert.equal(casar({ protocolo: "97608", ano: "2026" })?.numero, "97608/2026");
  assert.equal(nomePdfEmAnalise({ protocolo: "97608", ano: "2026" }), "Protocolo 97608 - 2026.pdf");
});

test("tela protocolo: o Emitir documentos aprendido da tela vira a emissão POR CÓDIGO (o parâmetro com o Id)", async () => {
  const { emissaoDoPedido, coerceEmissaoProtocolo, corpoEmissaoProtocolo, mesmaEmissao, normalizarProtocolosTela } = await import("../src/lib/automacao-tela-protocolo.ts");
  const guid = "24e3e9d0-1111-2222-3333-444455556666";
  const pedido = {
    ModuleKey: 102999,
    Guid: guid.toUpperCase(),
    Params: [
      { Key: "Modelo", Value: "3" },
      { Key: "IdProtocolo", Value: "2328622" },
      { Key: "AnexarAoProtocolo", Value: "0" },
    ],
  };
  const e = emissaoDoPedido(pedido, "2328622");
  assert.deepEqual(e, { moduleKey: 102999, guid, params: pedido.Params, param: "IdProtocolo" });
  assert.equal(emissaoDoPedido(pedido, "999"), null);
  assert.equal(emissaoDoPedido({ ...pedido, Guid: "x" }, "2328622"), null);
  assert.deepEqual(coerceEmissaoProtocolo(e), e);
  assert.equal(coerceEmissaoProtocolo({ ...e, param: "Outro" }), null);
  const corpo = corpoEmissaoProtocolo(e as NonNullable<typeof e>, "002273524");
  assert.equal(corpo?.Params.find((x) => x.Key === "IdProtocolo")?.Value, "2273524");
  assert.equal(corpo?.Params.find((x) => x.Key === "Modelo")?.Value, "3");
  assert.equal(mesmaEmissao(e, coerceEmissaoProtocolo(JSON.parse(JSON.stringify(e)))), true);
  assert.equal(mesmaEmissao(e, null), false);
  // A grade traz o Id e a data de entrada de cada protocolo.
  assert.deepEqual(normalizarProtocolosTela([{ protocolo: "152688", ano: "2026", id: "02328622", entrada: "24/09/2026" }])[0], {
    chave: "152688/2026",
    protocolo: "152688",
    ano: "2026",
    id: "2328622",
    entrada: "24/09/2026",
    departamento: "",
    interessado: "",
    solicitante: "",
    natureza: "",
  });
});

test("tela protocolo: a emissão por código sai SÍNCRONA (Assíncrono = não, no formato capturado)", async () => {
  const { corpoEmissaoProtocolo, ehParamAssincrono, valorSincrono } = await import("../src/lib/automacao-tela-protocolo.ts");
  for (const k of ["Assincrono", "ASSÍNCRONO", "AssincronoEmissao", "Async", "Assync"]) assert.equal(ehParamAssincrono(k), true, k);
  for (const k of ["Background", "IdProtocolo", "Documentos", "SendMail"]) assert.equal(ehParamAssincrono(k), false, k);
  assert.deepEqual(["true", "True", "TRUE", "1", "S", "s", "Sim", "SIM", "Y", "x"].map(valorSincrono), ["false", "False", "FALSE", "0", "N", "n", "Não", "NÃO", "N", "0"]);
  const e = {
    moduleKey: 122310,
    guid: "fe4d8f41-c3e6-77e5-8e58-94654fefe22e",
    param: "IdProtocolo",
    params: [
      { Key: "IdProtocolo", Value: "2328622" },
      { Key: "Assincrono", Value: "true" },
      { Key: "Documentos", Value: "1;2" },
      { Key: "Background", Value: "0" },
    ],
  };
  const corpo = corpoEmissaoProtocolo(e, "2273524");
  assert.deepEqual(corpo?.Params, [
    { Key: "IdProtocolo", Value: "2273524" },
    { Key: "Assincrono", Value: "false" },
    { Key: "Documentos", Value: "1;2" },
    { Key: "Background", Value: "0" },
  ]);
});
