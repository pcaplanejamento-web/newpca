import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { coerceFonteAssinatura, escolherAssinatura, MSG_SEM_FONTE, PARA_TUDO, pedidoDaFonte } from "../src/lib/assinatura-dfd-centi.ts";
import { assinaturaDoPlanejamento } from "../src/lib/automacao-dfds-motor.ts";
import { lerConfigCenti } from "../src/lib/automacao-centi-core.ts";

// O ERRO de 16/11/2026: a automação emitia TODO DFD com o IdPlanejamentoAssinaturaDFD visto por último na tela da Centi —
// as seções 8–10 (equipe, secretário, autorização) saíam do planejamento de outro DFD. Agora a extensão aprende ONDE a
// tela achou a assinatura e o sistema lê a de CADA planejamento.

function pecas() {
  const ctx: Record<string, unknown> = { URL };
  vm.runInNewContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  const p = readFileSync("extensao-centi/centi-main.js", "utf8").match(/const PROTOCOLO = (\d+);/)?.[1];
  const A = ctx[`__pcaCentiAnexo_p${p}`] as { fonteDaAssinatura: (r: unknown, plan: string, s: string) => unknown };
  return { fonteDaAssinatura: (r: unknown, plan: string, s: string) => JSON.parse(JSON.stringify(A.fonteDaAssinatura(r, plan, s) ?? null)) };
}

// O load do planejamento como a Centi o devolve (padrão Fields), com as assinaturas DELE numa lista.
const loadPlan = (plan: number, assinaturas: { id: number; padrao?: boolean }[]) => ({
  Entity: {
    ModuleKey: 101026,
    Fields: [
      { Key: "Id", Value: plan },
      { Key: "Finalidade", Value: `PLANEJAMENTO ${plan}` },
      {
        Key: "AssinaturasDFD",
        Value: assinaturas.map((a) => ({ Fields: [{ Key: "Id", Value: a.id }, { Key: "Padrao", Value: a.padrao === true }, { Key: "Secretario", Value: "FULANO" }] })),
      },
    ],
  },
});

test("aprende do LOAD do planejamento: a lista das assinaturas dele (o nº trocado por {id})", () => {
  const { fonteDaAssinatura } = pecas();
  const respostas = [
    { caminho: "restauth/list?entity=900", metodo: "GET", corpo: null, j: { Lista: [{ Id: 163 }] } }, // não cita o planejamento
    { caminho: "restauth/load?entity=101026&key=131", metodo: "GET", corpo: null, j: loadPlan(131, [{ id: 163 }]) },
  ];
  const f = fonteDaAssinatura(respostas, "131", "163");
  assert.deepEqual(f, { metodo: "GET", caminho: "restauth/load?entity=101026&key={id}", corpo: null, lista: ["Entity", "@AssinaturasDFD"], chave: "@Id" });
  // O sistema aceita a fonte e lê, no load de OUTRO planejamento, a assinatura DELE (nunca a 163).
  const fonte = coerceFonteAssinatura(f);
  assert.ok(fonte);
  assert.deepEqual(pedidoDaFonte(fonte, "92"), { metodo: "GET", caminho: "restauth/load?entity=101026&key=92", corpo: null });
  assert.deepEqual(escolherAssinatura(loadPlan(92, [{ id: 871 }]), fonte, "92"), { id: "871" });
});

test("aprende da CONSULTA da janela (POST com o planejamento no corpo) e preenche para cada planejamento", () => {
  const { fonteDaAssinatura } = pecas();
  const corpo = { Page: 1, ItensPerPage: 50, Filtro: { IdComprasPlanejamento: 131 } };
  const respostas = [{ caminho: "restauth/postdata", metodo: "POST", corpo, j: { Data: [{ Id: 163, Descricao: "SMPG" }] } }];
  const f = fonteDaAssinatura(respostas, "131", "163");
  assert.deepEqual(f, { metodo: "POST", caminho: "restauth/postdata", corpo: { Page: 1, ItensPerPage: 50, Filtro: { IdComprasPlanejamento: "{id:n}" } }, lista: ["Data"], chave: "Id" });
  const fonte = coerceFonteAssinatura(f);
  assert.ok(fonte);
  assert.deepEqual(pedidoDaFonte(fonte, "1078")?.corpo, { Page: 1, ItensPerPage: 50, Filtro: { IdComprasPlanejamento: 1078 } });
});

test("nunca chuta: resposta que não cita o planejamento, id em dois lugares ou inexistente = nada aprendido", () => {
  const { fonteDaAssinatura } = pecas();
  assert.equal(fonteDaAssinatura([{ caminho: "restauth/list?entity=900", metodo: "GET", corpo: null, j: { Lista: [{ Id: 163 }] } }], "131", "163"), null);
  const dois = { Entity: { Fields: [{ Key: "Id", Value: 131 }, { Key: "ListaA", Value: [{ Id: 163 }] }, { Key: "ListaB", Value: [{ Id: 163 }] }] } };
  assert.equal(fonteDaAssinatura([{ caminho: "restauth/load?entity=101026&key=131", metodo: "GET", corpo: null, j: dois }], "131", "163"), null);
  assert.equal(fonteDaAssinatura([{ caminho: "restauth/load?entity=101026&key=131", metodo: "GET", corpo: null, j: loadPlan(131, [{ id: 7 }]) }], "131", "163"), null);
  // Escrita nunca é modelo (só consulta de leitura).
  assert.equal(fonteDaAssinatura([{ caminho: "restauth/save", metodo: "POST", corpo: { Id: 131 }, j: { Lista: [{ Id: 163 }] } }], "131", "163"), null);
});

test("várias assinaturas: só com a MARCA da escolhida; senão o DFD não é emitido", () => {
  const { fonteDaAssinatura } = pecas();
  const f = coerceFonteAssinatura(
    fonteDaAssinatura([{ caminho: "restauth/load?entity=101026&key=131", metodo: "GET", corpo: null, j: loadPlan(131, [{ id: 163, padrao: true }, { id: 164 }]) }], "131", "163"),
  );
  assert.equal(f?.marca, "@Padrao");
  assert.deepEqual(escolherAssinatura(loadPlan(92, [{ id: 5 }, { id: 6, padrao: true }]), f as never, "92"), { id: "6" });
  const semMarca = { ...(f as object), marca: undefined } as never;
  assert.match((escolherAssinatura(loadPlan(92, [{ id: 5 }, { id: 6 }]), semMarca, "92") as { erro: string }).erro, /2 assinaturas/);
  assert.match((escolherAssinatura(loadPlan(92, []), f as never, "92") as { erro: string }).erro, /não tem assinatura/);
});

test("emissão: sem a fonte aprendida PARA tudo; com ela, usa o load já feito ou a consulta, no planejamento pedido", async () => {
  const pedidos: unknown[] = [];
  const pedir = async (acao: string, dados: unknown) => {
    pedidos.push([acao, dados]);
    return { ok: true, j: { Data: [{ Id: 555 }] } };
  };
  const sem = await assinaturaDoPlanejamento({ pedir: pedir as never, cfg: () => lerConfigCenti(null) }, "131", "1", { j: {} });
  assert.deepEqual(sem, { erro: MSG_SEM_FONTE, ambiente: true });
  assert.ok(PARA_TUDO.test(MSG_SEM_FONTE), "a falta da fonte para a execução inteira");
  const peloLoad = lerConfigCenti({ fonteAssinatura: { metodo: "GET", caminho: "restauth/load?entity=101026&key={id}", lista: ["Entity", "@AssinaturasDFD"], chave: "@Id" } });
  assert.deepEqual(await assinaturaDoPlanejamento({ pedir: pedir as never, cfg: () => peloLoad }, "131", "1", { j: loadPlan(131, [{ id: 42 }]) }), { id: "42" });
  assert.equal(pedidos.length, 0, "o load já feito serve — nenhum pedido a mais");
  const pelaConsulta = lerConfigCenti({ fonteAssinatura: { metodo: "POST", caminho: "restauth/postdata", corpo: { Page: 1, Filtro: { Id: "{id:n}" } }, lista: ["Data"], chave: "Id" } });
  assert.deepEqual(await assinaturaDoPlanejamento({ pedir: pedir as never, cfg: () => pelaConsulta }, "1078", "3", { j: {} }), { id: "555" });
  assert.deepEqual(pedidos[0], ["ler", { metodo: "POST", caminho: "restauth/postdata", corpo: { Page: 1, Filtro: { Id: 1078 } }, entidade: "3" }]);
});

test("a extensão guarda as respostas da TELA e aprende a fonte no Processar; o estado a leva ao sistema", () => {
  const main = readFileSync("extensao-centi/centi-main.js", "utf8");
  assert.match(main, /respostasTela\.unshift\(\{ caminho: c\.caminho, metodo: m, corpo: b, j \}\)/);
  assert.match(main, /pecas\.fonteDaAssinatura\(respostasTela, op\.planejamento, op\.assinatura\)/);
  assert.match(main, /operacao: operacaoComFonte\(\)/);
  // O id em si nunca vai ao sistema: só a fonte (o "estado" tira assinatura e planejamento).
  assert.match(main, /const \{ assinatura: _a, planejamento: _p, \.\.\.op \} = operacaoTela;/);
});
