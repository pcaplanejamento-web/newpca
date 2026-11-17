import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { assinaturaDoLoad, assinaturasDoLoad, coerceFonteAssinatura, escolherAssinatura, PARA_TUDO, pedidoDaFonte } from "../src/lib/assinatura-dfd-centi.ts";
import { assinaturaDoPlanejamento } from "../src/lib/automacao-dfds-motor.ts";
import { ajusteDaOperacao, lerConfigCenti } from "../src/lib/automacao-centi-core.ts";

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
  // Sem a lista no load nem a fonte: segue com a RESERVA e marca incerta (o DFD é analisado; as seções 8–10 não valem).
  const sem = (await assinaturaDoPlanejamento({ pedir: pedir as never, cfg: () => lerConfigCenti({ assinaturaDfd: "163" }) }, "131", "1", { j: { Entity: { Fields: [{ Key: "Itens", Value: [{ Id: 1 }] }] } } })) as { id: string; incerta?: true; motivo?: string };
  assert.equal(sem.id, "163");
  assert.equal(sem.incerta, true);
  assert.match(sem.motivo ?? "", /listas lidas: Entity\.Itens/);
  assert.ok(!PARA_TUDO.test(sem.motivo ?? ""), "a falta do registro não para a execução");
  // Sem fonte, mas com a lista no load do PRÓPRIO planejamento: lê dali.
  assert.deepEqual(await assinaturaDoPlanejamento({ pedir: pedir as never, cfg: () => lerConfigCenti(null) }, "131", "1", { j: loadPlan(131, [{ id: 77 }]) }), { id: "77" });
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
  // Só a RESERVA (o id da última emissão pela tela) vai junto — o sistema marca as seções 8–10 como não conferidas.
  assert.match(main, /reserva: operacaoTela\.assinatura \?\? reserva/);
});

test("seções 8–10 pelo load do PRÓPRIO planejamento: uma = ela; várias = a marcada; nunca chuta", () => {
  assert.deepEqual(assinaturaDoLoad(loadPlan(131, [{ id: 9 }]), "131"), { id: "9" });
  assert.deepEqual(assinaturaDoLoad(loadPlan(131, [{ id: 9 }, { id: 10, padrao: true }]), "131"), { id: "10" });
  assert.match((assinaturaDoLoad(loadPlan(131, [{ id: 9 }, { id: 10 }]), "131") as { erro: string }).erro, /2 registros/);
  assert.match((assinaturaDoLoad({ Entity: { Fields: [{ Key: "Id", Value: 131 }] } }, "131") as { erro: string }).erro, /Não achei/);
  // Lista em chave comum (fora do padrão Fields), id em "Id".
  assert.deepEqual(assinaturaDoLoad({ Entity: { PlanejamentoAssinaturas: [{ Id: 5 }] } }, "131"), { id: "5" });
  // Duas listas com "assinatura": vale a do DFD; sem ela, ambíguo.
  const duas = { Entity: { AssinaturasDFD: [{ Id: 5 }], AssinaturasEdital: [{ Id: 6 }] } };
  assert.deepEqual(assinaturaDoLoad(duas, "1"), { id: "5" });
  assert.ok("listas" in assinaturasDoLoad({ Entity: { AssinaturasA: [{ Id: 5 }], AssinaturasB: [{ Id: 6 }] } }));
});

test("com a fonte aprendida, o id lido tem de estar na lista do load do planejamento", async () => {
  const pedir = async () => ({ ok: true, j: { Data: [{ Id: 555 }] } });
  const cfg = lerConfigCenti({ fonteAssinatura: { metodo: "POST", caminho: "restauth/postdata", corpo: { Page: 1, Filtro: { Id: "{id:n}" } }, lista: ["Data"], chave: "Id" } });
  const r = (await assinaturaDoPlanejamento({ pedir: pedir as never, cfg: () => cfg }, "131", "1", { j: loadPlan(131, [{ id: 42 }]) })) as { incerta?: true; motivo?: string };
  assert.equal(r.incerta, true);
  assert.match(r.motivo ?? "", /não está no planejamento 131/);
});

test("extensão: chaves de id mais amplas e o diagnóstico sem valores", () => {
  const ctx: Record<string, unknown> = { URL };
  vm.runInNewContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  const p = readFileSync("extensao-centi/centi-main.js", "utf8").match(/const PROTOCOLO = (\d+);/)?.[1];
  const A = ctx[`__pcaCentiAnexo_p${p}`] as {
    fonteDaAssinatura: (r: unknown, plan: string, s: string) => unknown;
    diagnosticoAssinatura: (r: unknown, plan: string, s: string) => { respostas: number; lista: { caminho: string; aceito: boolean; cita: boolean; onde: string[] }[] };
  };
  const j = { Entity: { Fields: [{ Key: "Id", Value: 131 }, { Key: "Registros", Value: [{ IdAssinatura: 163, Nome: "X" }] }] } };
  const f = JSON.parse(JSON.stringify(A.fonteDaAssinatura([{ caminho: "restauth/load?entity=101026&key=131", metodo: "GET", corpo: null, j }], "131", "163")));
  assert.equal(f?.chave, "IdAssinatura");
  const d = A.diagnosticoAssinatura([{ caminho: "restauth/load?entity=101026&key=131", metodo: "GET", corpo: null, j }, { caminho: "restauth/save", metodo: "POST", corpo: {}, j: {} }], "131", "163");
  assert.equal(d.respostas, 2);
  assert.equal(d.lista[0].aceito, true);
  assert.equal(d.lista[0].cita, true);
  assert.deepEqual(Array.from(d.lista[0].onde), ["Entity.@Registros.*.IdAssinatura"]);
  assert.equal(d.lista[1].aceito, false);
  assert.ok(!JSON.stringify(d).includes("\"X\""), "nenhum valor da Centi no diagnóstico");
});

test("o registro das seções 8–10 num CAMPO do planejamento (não a assinatura digital)", () => {
  const load = { Entity: { Fields: [{ Key: "Id", Value: 131 }, { Key: "IdAssinaturaDigital", Value: 9 }, { Key: "IdPlanejamentoAssinaturaDFD", Value: 480 }] } };
  assert.deepEqual(assinaturaDoLoad(load, "131"), { id: "480" });
  const ref = { Entity: { Fields: [{ Key: "Id", Value: 131 }, { Key: "PlanejamentoAssinatura", Value: { Id: 77, Descricao: "X" } }] } };
  assert.deepEqual(assinaturaDoLoad(ref, "131"), { id: "77" });
  const so = { Entity: { Fields: [{ Key: "Id", Value: 131 }, { Key: "IdAssinaturaDigital", Value: 9 }, { Key: "EquipePlanejamento", Value: "x" }] } };
  const e = (assinaturaDoLoad(so, "131") as { erro: string }).erro;
  assert.match(e, /campos: .*IdAssinaturaDigital.*EquipePlanejamento/);
  assert.ok(!e.includes("“x”") && !/\b9\b/.test(e), "só nomes, nunca valores");
});

test("completar com o DFD do sistema: o mesmo nº de planejamento em dois órgãos traz OS DOIS DFDs (nunca o último por cima)", async () => {
  const { REGISTRO_NOS } = await import("../src/lib/fluxo-nos.ts");
  const def = REGISTRO_NOS.get("sistema.completarDfd") as unknown as { executar: (e: unknown, c: unknown, ctx: unknown) => Promise<{ saida: { id: number }[]; naoEncontrados: unknown[] }> };
  const dfds = [
    { id: 92, numero: "92", planejamento: "131", entidade: "2" },
    { id: 500, numero: "500", planejamento: "131", entidade: "3" },
    { id: 7, numero: "7", planejamento: "8", entidade: "2" },
  ];
  const cache = new Map<string, unknown>([["dfds", Promise.resolve(dfds)]]);
  const ctx = { host: { __cache: cache }, aviso: () => {}, cancelado: () => false };
  const r = await def.executar({ entrada: [{}] }, { planejamento: "131" }, ctx);
  assert.deepEqual(r.saida.map((x) => x.id).sort((a, b) => a - b), [92, 500]);
  assert.equal(r.naoEncontrados.length, 0);
});

test("emissão: o par visto na tela da Centi para o planejamento vale primeiro; sem ele, como sempre", async () => {
  const sem = { j: { Entity: { Fields: [{ Key: "Id", Value: 131 }, { Key: "Itens", Value: [{ Id: 1 }] }] } } };
  const pedir = async () => ({ ok: true });
  const comPar = lerConfigCenti({ paresAssinatura: { "131": "480", "92": "7" } });
  assert.deepEqual(await assinaturaDoPlanejamento({ pedir: pedir as never, cfg: () => comPar }, "131", "1", sem), { id: "480" });
  const r = (await assinaturaDoPlanejamento({ pedir: pedir as never, cfg: () => lerConfigCenti({ assinaturaReserva: "163" }) }, "131", "1", sem)) as { id: string };
  assert.equal(r.id, "163");
});

test("load: só a lista dos registros DO DFD do planejamento — nunca qualquer lista com “assinatura” no nome", () => {
  assert.ok("listas" in assinaturasDoLoad({ Entity: { Assinaturas: [{ Id: 5 }] } }), "assinaturas digitais/outras não valem");
  assert.deepEqual(assinaturaDoLoad({ Entity: { PlanejamentoAssinaturaDFD: [{ Id: 5 }] } }, "131"), { id: "5" });
  // Várias sem a marca "padrão" da Centi: não escolhe por um sim/não qualquer.
  const duas = { Entity: { AssinaturasDFD: [{ Id: 5, Ativo: true }, { Id: 6, Ativo: false }] } };
  assert.match((assinaturaDoLoad(duas, "131") as { erro: string }).erro, /2 registros/);
});

test("pares da tela: ajusteDaOperacao soma os pares (também sem a operação) e lerConfigCenti os normaliza", () => {
  const cfg = lerConfigCenti({ paresAssinatura: { "092": "7", x: "1", "5": "abc" } });
  assert.deepEqual(cfg.paresAssinatura, { "92": "7" });
  assert.deepEqual(ajusteDaOperacao(cfg, { pares: { "131": "480" } }), { paresAssinatura: { "92": "7", "131": "480" } });
  assert.equal(ajusteDaOperacao(cfg, { pares: { "92": "7" } }), null, "nada novo = nada muda");
  const main = readFileSync("extensao-centi/centi-main.js", "utf8");
  assert.match(main, /const PARES = "__pcaParesAssinatura_v1";/);
  assert.match(main, /pares\[k\] = String\(op\.assinatura\);/);
  assert.match(main, /reserva: operacaoTela\.assinatura \?\? reserva, pares \}/);
});
