import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vmDados from "node:vm";
import { type DefNo, esperar, executarFluxo, type Grafo, lerGrafo, lerTentar, nomeVariavel } from "../src/lib/fluxo-core.ts";
import { aplicarRegra, escolherColunas, lerColunas, lerRegras, operarVariavel, procurarNaTabela } from "../src/lib/fluxo-dados.ts";
import { REGISTRO_NOS } from "../src/lib/fluxo-nos.ts";

const ctx = (host: Record<string, unknown> = {}, api = async (_c: string, _i?: unknown) => ({ ok: false }) as Record<string, unknown>) => ({
  centi: async () => ({ ok: false }),
  api,
  cancelado: () => false,
  host,
});
const no = (id: string, tipo: string, config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ id, tipo, config, x: 0, y: 0, ...extra });
const lig = (de: string, para: string, saida = "saida", entrada = "entrada") => ({ de, saida, para, entrada });

test("Escolher colunas: caminho => nome, sem repetir, manter ou não os outros", () => {
  const cols = lerColunas("centi.Situacao => situacao\ncenti.Id\n\ncenti.Id => Id");
  assert.deepEqual(cols, [
    { de: "centi.Situacao", para: "situacao" },
    { de: "centi.Id", para: "Id" },
  ]);
  const it = { a: 1, centi: { Situacao: "EXECUTADO", Id: "12" } };
  assert.deepEqual(escolherColunas([it], cols, false), [{ situacao: "EXECUTADO", Id: "12" }]);
  assert.equal(escolherColunas([it], cols, true)[0].a, 1);
});

test("Procurar nas linhas: numa coluna (índice com a régua do igual), em todas, primeiro × todas, não encontrados", () => {
  const tabela = [
    { planejamento: "0120", situacao: "EXECUTADO" },
    { planejamento: "130", situacao: "CANCELADO", obs: { texto: "contrato 55" } },
    { planejamento: "130", situacao: "EM ANDAMENTO" },
  ];
  const itens = [{ p: "120" }, { p: "130" }, { p: "999" }, { p: "" }];
  const r = procurarNaTabela(itens, tabela, { valor: "{{p}}", coluna: "planejamento", operador: "igual", resultado: "primeiro" });
  assert.deepEqual(r.encontrados.map((x) => [x.p, (x.encontrado as { situacao: string }).situacao, x.encontrados]), [
    ["120", "EXECUTADO", 1],
    ["130", "CANCELADO", 2],
  ]);
  assert.deepEqual(r.naoEncontrados.map((x) => x.p), ["999", ""]);
  const todas = procurarNaTabela([{ p: "130" }], tabela, { valor: "{{p}}", coluna: "planejamento", operador: "igual", resultado: "todas" });
  assert.equal((todas.encontrados[0].encontrado as unknown[]).length, 2);
  const tudo = procurarNaTabela([], tabela, { valor: "contrato", coluna: "", operador: "contem", resultado: "primeiro" });
  assert.equal((tudo.encontrados[0].encontrado as { planejamento: string }).planejamento, "130", "procura em todas as colunas, inclusive as de dentro");
});

test("Regra: a 1ª que casa grava; senão valor/fixo/vazio/manter", () => {
  const regras = lerRegras("CANCEL => Cancelado\nEXECUT => Executado {{n}}\nlixo");
  assert.equal(regras.length, 2);
  const itens = [{ s: "EXECUTADO", n: 1 }, { s: "Cancelado", n: 2 }, { s: "EM ANDAMENTO", n: 3 }];
  const base = { origem: "s", regras, operador: "contem", senaoValor: "?", destino: "valor" };
  const r = aplicarRegra(itens, { ...base, senao: "valor" });
  assert.deepEqual(r.map((x) => x.valor), ["Executado 1", "Cancelado", "EM ANDAMENTO"]);
  assert.equal(aplicarRegra(itens, { ...base, senao: "fixo" })[2].valor, "?");
  assert.equal(aplicarRegra(itens, { ...base, senao: "vazio" })[2].valor, "");
  assert.equal("valor" in aplicarRegra(itens, { ...base, senao: "manter" })[2], false);
});

test("Variável: definir, somar, contar, acrescentar, limpar", () => {
  assert.equal(operarVariavel(undefined, "definir", "{{x}}", [{ x: "12" }]), 12);
  assert.equal(operarVariavel(undefined, "definir", "abc", []), "abc");
  assert.equal(operarVariavel(2, "somar", "{{v}}", [{ v: "1,5" }, { v: 3 }]), 6.5);
  assert.equal(operarVariavel(1, "contar", "", [{}, {}]), 3);
  assert.deepEqual(operarVariavel(["a"], "acrescentar", "{{v}}", [{ v: "b" }]), ["a", "b"]);
  assert.equal(operarVariavel(5, "limpar", "", []), "");
  assert.equal(nomeVariavel("total_lido"), "total_lido");
  assert.equal(nomeVariavel("1x"), "");
  assert.equal(nomeVariavel("a b"), "");
});

test("lerGrafo lê tentar/guardar com os tetos; inválidos somem", () => {
  const g = lerGrafo({ nos: [no("a", "dados.campos", {}, { tentar: { vezes: 99, esperaS: 9999 }, guardar: "estado_a" }), no("b", "dados.campos", {}, { tentar: { vezes: 0 }, guardar: "x y" })] });
  assert.deepEqual(g.nos[0].tentar, { vezes: 5, esperaS: 300 });
  assert.equal(g.nos[0].guardar, "estado_a");
  assert.equal(g.nos[1].tentar, undefined);
  assert.equal(g.nos[1].guardar, undefined);
  assert.equal(lerTentar({ vezes: 2 })?.esperaS, 0);
});

test("esperar respeita o cancelamento", async () => {
  assert.equal(await esperar(10, () => false), true);
  assert.equal(await esperar(5000, () => true), false);
});

test("Motor: REPETE o nó que falha e GUARDA o estado; a Variável lê {{estado.executado}}", async () => {
  let chamadas = 0;
  const reg = new Map(REGISTRO_NOS);
  reg.set("teste.falha2", {
    tipo: "teste.falha2",
    categoria: "dados",
    rotulo: "Falha 2 vezes",
    descricao: "",
    icone: "alert",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [],
    rodaSemItens: true,
    executar: async () => {
      chamadas++;
      if (chamadas < 3) throw new Error("instável");
      return { saida: [{ ok: 1 }] };
    },
  });
  const g: Grafo = {
    v: 1,
    nos: [no("i", "gatilho.inicio"), no("f", "teste.falha2", {}, { tentar: { vezes: 2, esperaS: 0 }, guardar: "leitura" }), no("v", "dados.variavel", { acao: "ler", nome: "leitura" })],
    conexoes: [lig("i", "f"), lig("f", "v")],
  };
  const host: Record<string, unknown> = {};
  const r = await executarFluxo(g, reg, ctx(host));
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(chamadas, 3);
  const est = r.retorno[0].leitura as { executado: boolean; itens: number; vezes: number };
  assert.deepEqual([est.executado, est.itens, est.vezes], [true, 1, 1]);
  // Sem repetições suficientes, falha.
  chamadas = -10;
  const r2 = await executarFluxo({ ...g, nos: g.nos.map((n) => (n.id === "f" ? { ...n, tentar: { vezes: 1, esperaS: 0 } } : n)) }, reg, ctx({}));
  assert.equal(r2.estado, "falhou");
});

test("Parar o laço quando: o laço termina antes de acabar a fila", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      no("i", "gatilho.inicio"),
      no("d", "entrada.ids", { ids: "1:2:3:4:5" }),
      no("l", "logica.laco", { tamanho: 1 }),
      no("p", "logica.parar", { campo: "planejamento", operador: "igual", valor: "3" }),
      no("f", "dados.campos", { linhas: "fim = sim" }),
    ],
    conexoes: [lig("i", "d"), lig("d", "l"), lig("l", "p", "lote"), lig("p", "l", "saida", "volta"), lig("l", "f", "fim")],
  };
  const r = await executarFluxo(g, REGISTRO_NOS, ctx());
  assert.equal(r.estado, "concluido", r.erro);
  assert.deepEqual(
    r.retorno.map((x) => String(x.planejamento)),
    ["1", "2", "3"],
  );
});

test("Gravar na coluna da Mesa: cria/acha a coluna e grava por id; sem id/valor vai a ignorados", async () => {
  const chamadas: { c: string; body: unknown }[] = [];
  const api = async (c: string, init?: unknown) => {
    chamadas.push({ c, body: (init as { body?: unknown } | undefined)?.body });
    return c.endsWith("/colunas") ? { ok: true, coluna: { id: 7 } } : { ok: true };
  };
  const g: Grafo = {
    v: 1,
    nos: [no("i", "gatilho.inicio"), no("r", "dados.regra", { origem: "s", operador: "contem", regras: "EXEC => Executado", senao: "vazio" }), no("g", "saida.gravarColuna", { entidade: "dfd", coluna: "Situação Centi" })],
    conexoes: [lig("i", "r"), lig("r", "g")],
  };
  // O Início entrega um item vazio; troca por itens de teste.
  const reg = new Map(REGISTRO_NOS);
  reg.set("gatilho.inicio", { ...(REGISTRO_NOS.get("gatilho.inicio") as DefNo), executar: async () => ({ saida: [{ id: 1, s: "EXECUTADO" }, { id: 2, s: "OUTRO" }, { s: "EXECUTADO" }] }) });
  const r = await executarFluxo(g, reg, ctx({}, api));
  assert.equal(r.estado, "concluido", r.erro);
  assert.deepEqual(chamadas[0], { c: "/api/admin/automacao/colunas", body: { entidade: "dfd", nome: "Situação Centi" } });
  assert.deepEqual(chamadas[1].body, { valores: [{ alvoId: 1, valor: "Executado" }] });
  assert.equal(r.passos.g.itens, 3, "1 gravado + 2 ignorados (valor vazio e sem id)");
});

test("Procurar com a chave extra (entidade): o mesmo nº em outra entidade não casa", () => {
  const tabela = [
    { planejamento: "10", entidade: "2", situacao: "Executado" },
    { planejamento: "10", entidade: "3", situacao: "Não Executado" },
  ];
  const r = procurarNaTabela([{ planejamento: "010", entidade: "3" }, { planejamento: "10", entidade: "9" }], tabela, {
    valor: "{{planejamento}}",
    coluna: "planejamento",
    operador: "igual",
    resultado: "primeiro",
    extra: { campo: "entidade", coluna: "entidade" },
  });
  assert.deepEqual(r.encontrados.map((x) => (x.encontrado as { situacao: string }).situacao), ["Não Executado"]);
  assert.equal(r.naoEncontrados.length, 1);
});

test("Tabela: teto de linhas/bytes, colunas pela união e o recorte de colunas e linhas", async () => {
  const { linhasParaTabela, recorteTabela, MAX_LINHAS_TABELA } = await import("../src/lib/fluxo-dados.ts");
  const r = linhasParaTabela(Array.from({ length: MAX_LINHAS_TABELA + 3 }, (_, i) => (i % 2 ? { a: i } : { a: i, b: "x" })));
  assert.equal(r.linhas.length, MAX_LINHAS_TABELA);
  assert.equal(r.cortadas, 3);
  assert.deepEqual(r.colunas, ["a", "b"]);
  assert.deepEqual(recorteTabela([{ a: 1, b: 2 }, { a: 3, b: 4 }, { a: 5, b: 6 }], lerColunas("b => B"), 2, 3), [{ B: 4 }, { B: 6 }]);
});

test("Modelo “Execução dos DFDs na CM002”: grava a situação, aponta os fora da CM002 e salva os só na Centi numa tabela", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "cm002");
  assert.ok(m);
  const dfds = [
    { id: 1, numero: "1707", planejamento: "1732", entidade: "2" },
    { id: 2, numero: "228", planejamento: "0278", entidade: "2" },
    { id: 3, numero: "500", planejamento: "999", entidade: "3" },
  ];
  const pedidos: string[] = [];
  const posts: { c: string; body: unknown }[] = [];
  const centi = async (_a: string, d: unknown) => {
    const ent = (d as { entidade: string }).entidade;
    pedidos.push(ent);
    return ent === "2"
      ? { ok: true, linhas: [{ id: "1732", situacao: "Executado" }, { id: "278", situacao: "Não Executado" }, { id: "1731", situacao: "Não Executado" }] }
      : { ok: true, linhas: [] };
  };
  const api = async (c: string, init?: unknown) => {
    posts.push({ c, body: (init as { body?: unknown } | undefined)?.body });
    return c.includes("execucao-dfds") ? { ok: true, lidos: 2, atualizados: 2 } : { ok: true, total: 1, cortadas: 0 };
  };
  const r = await executarFluxo(lerGrafo(m.grafo), REGISTRO_NOS, {
    centi,
    api,
    cancelado: () => false,
    host: { protocolos: [], __cache: new Map([["dfds", Promise.resolve(dfds)]]) },
  });
  assert.equal(r.estado, "concluido", r.erro);
  assert.deepEqual(pedidos.sort(), ["2", "3"], "só as entidades dos DFDs, uma vez cada");
  const grav = posts.find((p) => p.c.includes("execucao-dfds"));
  assert.ok(grav);
  assert.deepEqual(((grav as { body: unknown }).body as { linhas: unknown[]; dfdIds: number[] }).dfdIds, [1, 2]);
  assert.deepEqual(((grav as { body: unknown }).body as { linhas: { valores: string[] }[] }).linhas.map((l) => l.valores), [
    ["1732", "Executado"],
    ["0278", "Não Executado"],
  ]);
  const nao = posts.filter((p) => p.c.includes("execucao-dfds"))[1];
  assert.ok(nao);
  assert.deepEqual(((nao as { body: unknown }).body as { linhas: { valores: string[] }[] }).linhas.map((l) => l.valores), [["999", "Não encontrado na CM002"]]);
  const tab = posts.find((p) => p.c.includes("/tabelas"));
  assert.ok(tab);
  assert.deepEqual(((tab as { body: unknown }).body as { linhas: { planejamento: string }[] }).linhas.map((l) => l.planejamento), ["1731"]);
  assert.deepEqual(r.apontados.map((a) => a.mensagem).sort(), [
    "DFD 228 (planejamento 0278): Não Executado na CM002",
    "DFD 500 (planejamento 999) não está na CM002 do órgão 3",
  ]);
});

test("Órgão na Centi: o do item (com trava), fixos e um órgão por vez trocando na Centi", async () => {
  const def = REGISTRO_NOS.get("centi.orgao") as DefNo;
  const trocas: unknown[] = [];
  const c = {
    centi: async (acao: string, d: unknown) => {
      trocas.push([acao, (d as { entidade: unknown }).entidade]);
      return { ok: true };
    },
    api: async () => ({ ok: false }),
    cancelado: () => false,
    host: {},
    aviso: () => {},
  } as never;
  const itens = [{ n: 1, entidade: "02" }, { n: 2, entidade: "6" }, { n: 3, entidade: "" }];
  const r1 = await def.executar({ entrada: itens }, { origem: "itens" }, c, {});
  assert.deepEqual(r1.saida?.map((x) => x.entidade), ["2", "6"]);
  assert.equal(r1.semOrgao?.length, 1);
  const r2 = await def.executar({ entrada: itens }, { origem: "itens", orgaos: "6" }, c, {});
  assert.deepEqual(r2.saida?.map((x) => x.n), [2]);
  const r3 = await def.executar({ entrada: itens.slice(0, 1) }, { origem: "fixo", orgaos: "3; 4" }, c, {});
  assert.deepEqual(r3.saida?.map((x) => x.entidade), ["3", "4"]);
  const est = {};
  const a = await def.executar({ entrada: itens }, { origem: "itens", entrega: "umPorVez" }, c, est);
  assert.deepEqual(a.lote?.map((x) => x.n), [1]);
  assert.equal(a.semOrgao?.length, 1);
  const b = await def.executar({ volta: [{ ok: 1 }] }, { origem: "itens", entrega: "umPorVez" }, c, est);
  assert.deepEqual(b.lote?.map((x) => x.n), [2]);
  const f = await def.executar({ volta: [{ ok: 2 }] }, { origem: "itens", entrega: "umPorVez" }, c, est);
  assert.equal(f.fim?.length, 2);
  assert.deepEqual(trocas, [["trocarOrgao", "2"], ["trocarOrgao", "6"], ["trocarOrgao", null]]);
});

test("Modelo “Unidades dos DFDs × Centro de Custo”: aponta as divergências/desconhecidas e troca SÓ os marcados, por destino", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "unidades-cm002");
  assert.ok(m);
  const unidades = [
    { id: 1, codigo: "SEPLAN", nome: "Secretaria Municipal de Planejamento e Gestão", orgaoId: 1, centroCusto: "PM RV, SEPLAN" },
    { id: 2, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1, centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" },
    { id: 3, codigo: "SMC", nome: "Secretaria Municipal de Comunicação", orgaoId: 1 },
  ];
  const dfds = [
    { id: 1, numero: "10", planejamento: "100", entidade: "2", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 2, numero: "20", planejamento: "200", entidade: "2", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 3, numero: "30", planejamento: "300", entidade: "2", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 4, numero: "40", planejamento: "400", entidade: "2", reparticaoId: 2, sigla: "GGIM", orgaoId: 1 },
    { id: 5, numero: "50", planejamento: "500", entidade: "2", reparticaoId: 3, sigla: "SMC", orgaoId: 1 },
    { id: 6, numero: "60", planejamento: "600", entidade: "", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 7, numero: "70", planejamento: "700", entidade: "2", reparticaoId: 3, sigla: "SMC", orgaoId: 1 },
  ];
  const centi = async () => ({
    ok: true,
    linhas: [
      { id: "100", situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" },
      { id: "200", situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" },
      { id: "300", situacao: "Executado", centroCusto: "PM RV, CAMARA MUNICIPAL, GUARDA CIVIL MUNICIPAL" },
      { id: "400", situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" },
      { id: "500", situacao: "Executado", centroCusto: "PM RV, SECRETARIA MUNICIPAL DE COMUNICAÇÃO" },
    ],
  });
  const grafo = lerGrafo(m.grafo);
  const sel = grafo.nos.find((n) => n.tipo === "entrada.selecionar");
  assert.ok(sel);
  sel.config = { ...sel.config, marcados: ["2"] };
  const posts: { c: string; body: unknown }[] = [];
  const api = async (c: string, init?: unknown) => {
    const body = (init as { body?: unknown } | undefined)?.body;
    posts.push({ c, body });
    if (c === "/api/admin/automacao/colunas") return { ok: true, coluna: { id: (body as { nome: string }).nome === "Centro de Custo" ? 11 : 12 } };
    return { ok: true, alterados: 1, falhas: [] };
  };
  const r = await executarFluxo(grafo, REGISTRO_NOS, { centi, api, cancelado: () => false, host: { protocolos: [], unidades, __cache: new Map([["dfds", Promise.resolve(dfds)]]) } });
  assert.equal(r.estado, "concluido", r.erro);
  // As duas colunas da Mesa (DFDs, também nos Itens) com TODO DFD — os de fora da CM002 e sem órgão também.
  const colunas = posts.filter((p) => p.c === "/api/admin/automacao/colunas").map((p) => p.body);
  assert.deepEqual(
    colunas.sort((a, b) => (a as { nome: string }).nome.length - (b as { nome: string }).nome.length),
    [
      { entidade: "dfd", nome: "Centro de Custo", nosItens: true },
      { entidade: "dfd", nome: "Centro de Custo confere", nosItens: true },
    ],
  );
  const valoresDe = (id: number) =>
    Object.fromEntries(
      posts
        .filter((p) => p.c === `/api/admin/automacao/colunas/${id}`)
        .flatMap((p) => (p.body as { valores: { alvoId: number; valor: string | null }[] }).valores)
        .map((v) => [v.alvoId, v.valor]),
    );
  assert.deepEqual(valoresDe(11), {
    1: "PM RV, GABINETE DO PREFEITO, GGIM",
    2: "PM RV, GABINETE DO PREFEITO, GGIM",
    3: "PM RV, CAMARA MUNICIPAL, GUARDA CIVIL MUNICIPAL",
    4: "PM RV, GABINETE DO PREFEITO, GGIM",
    5: "PM RV, SECRETARIA MUNICIPAL DE COMUNICAÇÃO",
    6: null,
    7: null,
  });
  assert.deepEqual(valoresDe(12), {
    1: "Não confere",
    2: "Não confere",
    3: "Não confere",
    4: "Confere",
    5: "Sem cadastro",
    6: "Órgão sem ID da Centi",
    7: "Não está na CM002",
  });
  const massa = posts.filter((p) => p.c === "/api/dfd/massa");
  assert.deepEqual(massa.map((p) => p.body), [{ ids: [2], acao: { campo: "reparticao", reparticaoId: 2 } }], "só o marcado, para a unidade da Centi");
  const msgs = r.apontados.map((a) => a.mensagem).sort();
  assert.ok(msgs.some((t) => String(t).startsWith("DFD 10 (planejamento 100): no sistema SEPLAN, na Centi GGIM")));
  assert.ok(msgs.some((t) => String(t).includes("“GUARDA CIVIL MUNICIPAL” não existe no sistema")));
  assert.ok(!msgs.some((t) => String(t).startsWith("DFD 40")), "a unidade igual não é apontada");
});

test("Modelo “Unidades × Centro de Custo”: a CM002 SEM a coluna — cada DFD é lido pelo ID (o registro do planejamento)", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "unidades-cm002");
  assert.ok(m);
  const unidades = [
    { id: 1, codigo: "SEPLAN", nome: "Secretaria Municipal de Planejamento e Gestão", orgaoId: 1 },
    { id: 2, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1 },
  ];
  const dfds = [
    { id: 1, numero: "10", planejamento: "100", entidade: "2", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 2, numero: "20", planejamento: "200", entidade: "2", reparticaoId: 2, sigla: "GGIM", orgaoId: 1 },
    { id: 3, numero: "30", planejamento: "300", entidade: "2", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
  ];
  // A consulta aprendida traz só Id + Situação (a da Execução).
  const centi = async () => ({ ok: true, linhas: dfds.map((d) => ({ id: d.planejamento, situacao: "Executado", centroCusto: "" })) });
  const lidos: string[] = [];
  const gravados = new Map<number, string | null>();
  const lerDfdCenti = async (plan: string, entidade?: string, pdf?: boolean) => {
    lidos.push(`${plan}@${entidade}:${pdf}`);
    if (plan === "300") throw new Error("Sem resposta do sistema");
    return { planejamento: plan, situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM", finalidade: "" };
  };
  const r = await executarFluxo(lerGrafo(m.grafo), REGISTRO_NOS, {
    centi,
    api: async (c: string, init?: unknown) => {
      const body = (init as { body?: { valores?: { alvoId: number; valor: string | null }[] } } | undefined)?.body;
      if (c === "/api/admin/automacao/colunas/1") for (const v of body?.valores ?? []) gravados.set(v.alvoId, v.valor);
      return c === "/api/admin/automacao/colunas" ? { ok: true, coluna: { id: 1 } } : { ok: true, alterados: 0, falhas: [] };
    },
    cancelado: () => false,
    host: { protocolos: [], unidades, lerDfdCenti, __cache: new Map([["dfds", Promise.resolve(dfds)]]) },
  });
  assert.equal(r.estado, "concluido", r.erro);
  assert.deepEqual(lidos.sort(), ["100@2:false", "200@2:false", "300@2:false"], "só o load (sem PDF), na entidade do órgão");
  const msgs = r.apontados.map((a) => String(a.mensagem));
  assert.ok(msgs.some((t) => t.startsWith("DFD 10 (planejamento 100): no sistema SEPLAN, na Centi GGIM")), msgs.join("\n"));
  assert.ok(!msgs.some((t) => t.startsWith("DFD 20")), "a unidade igual não é apontada");
  assert.ok(msgs.some((t) => t.startsWith("DFD 30") && t.includes("não conferido na Centi")), msgs.join("\n"));
  assert.ok(!msgs.some((t) => t.includes("o planejamento na Centi não trouxe")));
  assert.deepEqual([...gravados.keys()].sort(), [1, 2, 3], "os lidos pelo ID mantêm o id do DFD para as colunas");
});

test("Conferir unidade no fluxo salvo ANTIGO (sem o SE/Buscar): o próprio nó lê o planejamento pelo ID", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "unidades-cm002");
  assert.ok(m);
  // O diagrama de antes da v1.266.7: o Procurar ligado direto ao Conferir.
  const g = lerGrafo(m.grafo);
  const se = g.nos.find((n) => n.tipo === "logica.se");
  const busca = g.nos.find((n) => n.tipo === "leitura.dfdCenti");
  const proc = g.nos.find((n) => n.tipo === "logica.procurar");
  const conf = g.nos.find((n) => n.tipo === "dados.conferirUnidade");
  assert.ok(se && busca && proc && conf);
  g.nos = g.nos.filter((n) => n !== se && n !== busca);
  g.conexoes = g.conexoes.filter((c) => ![se.id, busca.id].includes(c.de) && ![se.id, busca.id].includes(c.para));
  g.conexoes.push({ de: proc.id, saida: "encontrados", para: conf.id, entrada: "entrada" });
  const unidades = [
    { id: 1, codigo: "SEPLAN", nome: "Secretaria Municipal de Planejamento e Gestão", orgaoId: 1 },
    { id: 2, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1 },
  ];
  const dfds = [
    { id: 1, numero: "93", planejamento: "132", entidade: "2", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 2, numero: "94", planejamento: "133", entidade: "2", reparticaoId: 2, sigla: "GGIM", orgaoId: 1 },
  ];
  const centi = async () => ({
    ok: true,
    linhas: [
      { id: "132", situacao: "Executado", centroCusto: "" },
      { id: "133", situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" },
    ],
  });
  const lidos: string[] = [];
  const lerDfdCenti = async (plan: string, entidade?: string, pdf?: boolean) => {
    lidos.push(`${plan}@${entidade}:${pdf}`);
    return { planejamento: plan, centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM", finalidade: "" };
  };
  const r = await executarFluxo(g, REGISTRO_NOS, {
    centi,
    api: async (c: string) => (c === "/api/admin/automacao/colunas" ? { ok: true, coluna: { id: 1 } } : { ok: true, alterados: 0, falhas: [] }),
    cancelado: () => false,
    host: { protocolos: [], unidades, lerDfdCenti, __cache: new Map([["dfds", Promise.resolve(dfds)]]) },
  });
  assert.equal(r.estado, "concluido", r.erro);
  assert.deepEqual(lidos, ["132@2:false"], "só o que veio sem centro de custo, sem PDF");
  const msgs = r.apontados.map((a) => String(a.mensagem));
  assert.ok(msgs.some((t) => t.startsWith("DFD 93 (planejamento 132): no sistema SEPLAN, na Centi GGIM")), msgs.join("\n"));
  assert.ok(!msgs.some((t) => t.includes("não trouxe o centro de custo")), msgs.join("\n"));
});

test("Conferir unidade: sem nenhuma fonte de centro de custo, a mensagem lista as colunas da linha da CM002", async () => {
  const { conferirUnidades } = await import("../src/lib/fluxo-dados.ts");
  const r = conferirUnidades([{ numero: "1", planejamento: "9", encontrado: { id: "9", situacao: "Executado", centroCusto: "", finalidade: "" } }], []);
  assert.match(String(r.desconhecidas[0]?.mensagem), /campos que vieram: id, situacao, centroCusto, finalidade/);
  // A linha da CM002 sem o centro de custo cede ao registro lido pelo ID.
  const u = [{ id: 5, codigo: "SEPLAN", nome: "Secretaria Municipal de Planejamento e Gestão", orgaoId: 1 }];
  const ok = conferirUnidades([{ numero: "1", planejamento: "9", reparticaoId: 5, orgaoId: 1, encontrado: { id: "9", centroCusto: "" }, centi: { centroCusto: "PM RV, SEPLAN" } }], u);
  assert.equal(ok.conformes.length, 1);
});

test("acharValor com filtro: o nome do centro de custo, nunca o Id numérico ao lado", async () => {
  const { acharValor, ehTextoComLetras } = await import("../src/lib/fluxo-core.ts");
  const re = /^(id)?centro.?(de)?.?custo|^(id)?c\.?\s?custo/i;
  assert.equal(acharValor({ Entity: { IdCentroCusto: 12, CentroCusto: { Descricao: "PM RV, SEPLAN" } } }, re, 0, ehTextoComLetras), "PM RV, SEPLAN");
  assert.equal(acharValor({ Entity: { Fields: [{ Key: "IdCentroCusto", Value: { Id: 12, Descricao: "PM RV, GGIM" } }] } }, re, 0, ehTextoComLetras), "PM RV, GGIM");
  assert.equal(acharValor({ IdCentroCusto: 12 }, re, 0, ehTextoComLetras), undefined);
});

test("Conferir unidade: o planejamento lido sem centro de custo diz os campos que a Centi devolveu", async () => {
  const { conferirUnidades } = await import("../src/lib/fluxo-dados.ts");
  const { nomesDosCampos } = await import("../src/lib/fluxo-core.ts");
  assert.deepEqual(nomesDosCampos({ Entity: { Fields: [{ Key: "Id", Value: 1 }, { Key: "Situacao", Value: { Descricao: "X" } }] } }), ["Id", "Situacao"]);
  const r = conferirUnidades([{ numero: "1", planejamento: "9", centi: { situacao: "X", centroCusto: "", camposCenti: ["Id", "Situacao"] } }], []);
  assert.match(String(r.desconhecidas[0]?.mensagem), /não trouxe o centro de custo \(campos que vieram: Id, Situacao\)/);
});

test("Trocar a unidade: agrupa por destino em fatias de 20 e devolve as recusas do servidor com o motivo", async () => {
  const def = REGISTRO_NOS.get("saida.trocarUnidade") as DefNo;
  const corpos: { ids: number[]; acao: { reparticaoId: number } }[] = [];
  const ctx = {
    centi: async () => ({}),
    api: async (_c: string, init?: unknown) => {
      const b = (init as { body: { ids: number[]; acao: { reparticaoId: number } } }).body;
      corpos.push(b);
      return { ok: true, alterados: b.ids.length - 1, falhas: [{ id: b.ids[0], numero: "", motivo: "assinatura" }] };
    },
    cancelado: () => false,
    host: {},
    aviso: () => {},
  } as never;
  const itens = [...Array.from({ length: 25 }, (_, i) => ({ id: i + 1, unidadeCentiId: 7 })), { id: 99, unidadeCentiId: 8 }, { id: 100 }];
  const r = await def.executar({ entrada: itens }, {}, ctx, {});
  assert.deepEqual(corpos.map((b) => [b.acao.reparticaoId, b.ids.length]), [[7, 20], [7, 5], [8, 1]]);
  assert.equal(r.alterados?.length, 23);
  assert.deepEqual(r.erros?.map((x) => [x.id, x.motivo]), [[100, "Sem o DFD ou a unidade nova."], [1, "assinatura"], [21, "assinatura"], [99, "assinatura"]]);
});

test("Nó CM002: a mesma régua da Execução — só para quando NENHUM planejamento do órgão veio; a lista parcial segue", async () => {
  const def = REGISTRO_NOS.get("centi.cm002") as DefNo;
  const dfds = Array.from({ length: 1300 }, (_, i) => ({ id: i + 1, planejamento: String(i + 17), entidade: "2" }));
  const avisos: string[] = [];
  const ctx = (resp: Record<string, unknown>) =>
    ({ centi: async () => resp, api: async () => ({ ok: false }), cancelado: () => false, host: {}, aviso: (t: string) => avisos.push(t) }) as never;
  const pagina = Array.from({ length: 50 }, (_, i) => ({ id: String(i + 17), situacao: "Executado" }));
  // Parte dos planejamentos na lista: segue (os de fora viram “não está na CM002” no Procurar).
  const r = await def.executar({ entrada: dfds }, { dosItens: true }, ctx({ ok: true, linhas: pagina, completa: false, tamanho: 50 }), {});
  assert.equal(r.saida?.length, 50);
  assert.ok(avisos.some((t) => t.includes("não confirmou a lista inteira")));
  // Nenhum: a consulta aprendida está filtrada — para.
  const fora = Array.from({ length: 50 }, (_, i) => ({ id: String(i + 5000), situacao: "Executado" }));
  await assert.rejects(def.executar({ entrada: dfds }, { dosItens: true }, ctx({ ok: true, linhas: fora }), {}), /Nenhum dos 1300 planejamentos do órgão 2/);
});
test("Extensão: leitura completa da CM002, nomes de página/tamanho/total e total em texto", () => {
  const ctx: Record<string, unknown> = { URL };
  vmDados.runInNewContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  const p = Number(/const PROTOCOLO = (\d+)/.exec(readFileSync("extensao-centi/centi-main.js", "utf8"))?.[1]);
  const A = ctx[`__pcaCentiAnexo_p${p}`] as {
    leituraCompleta: (o: { total: number | null; lidas: number; tamanho: number; curta: boolean }) => boolean;
    totalDaResposta: (j: unknown) => number | null;
    comPagina: (c: string, b: unknown, i: number | null) => { corpo: unknown; tamanho: number };
  };
  assert.equal(A.leituraCompleta({ total: 1294, lidas: 50, tamanho: 50, curta: false }), false);
  assert.equal(A.leituraCompleta({ total: 1294, lidas: 1294, tamanho: 50, curta: false }), true);
  assert.equal(A.leituraCompleta({ total: null, lidas: 50, tamanho: 50, curta: false }), false, "página repetida");
  assert.equal(A.leituraCompleta({ total: null, lidas: 120, tamanho: 50, curta: true }), true, "terminou numa página curta");
  assert.equal(A.leituraCompleta({ total: null, lidas: 700, tamanho: 50, curta: false }), true, "sem paginação passou do tamanho");
  assert.equal(A.totalDaResposta({ Data: { Lista: [{ Id: 1 }], TotalRecords: "1294" } }), 1294);
  assert.equal(A.totalDaResposta({ Data: { Lista: [{ Id: 1 }], QtdRegistros: 88 } }), 88);
  const r = A.comPagina("restauth/postdata", { Filtro: { PageNumber: 1, PerPage: 50 } }, 2);
  assert.equal(r.tamanho, 50);
  assert.deepEqual(JSON.parse(JSON.stringify(r.corpo)), { Filtro: { PageNumber: 3, PerPage: 50 } });
});

test("Extensão 1.29: o tamanho da página descoberto pelos DADOS, página e total por trecho e o diagnóstico", () => {
  const ctx: Record<string, unknown> = { URL };
  vmDados.runInNewContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  const p = Number(/const PROTOCOLO = (\d+)/.exec(readFileSync("extensao-centi/centi-main.js", "utf8"))?.[1]);
  const A = ctx[`__pcaCentiAnexo_p${p}`] as {
    campoDoTamanho: (c: string, b: unknown, lidas: number) => string | null;
    comPagina: (c: string, b: unknown, i: number | null, todos?: number | null, campo?: string | null) => { corpo: unknown; tamanho: number };
    totalDaResposta: (j: unknown) => number | null;
    diagnosticoConsulta: (c: string, b: unknown) => string;
    leituraCompleta: (o: { total: number | null; lidas: number; tamanho: number; curta: boolean }) => boolean;
  };
  const corpo = { Filtro: { Qtde: 50, NumeroDaPagina: 1, Nome: "X" } };
  // "Qtde" não é um nome conhecido: o valor = as 50 linhas que vieram ⇒ é o tamanho.
  assert.equal(A.comPagina("restauth/postdata", corpo, 0).tamanho, 0);
  const campo = A.campoDoTamanho("restauth/postdata", corpo, 50);
  assert.equal(campo, "Qtde");
  assert.equal(A.campoDoTamanho("restauth/postdata", corpo, 37), null);
  const r = A.comPagina("restauth/postdata", corpo, 2, 100000, campo);
  assert.equal(r.tamanho, 50);
  assert.deepEqual(JSON.parse(JSON.stringify(r.corpo)), { Filtro: { Qtde: 50, NumeroDaPagina: 3, Nome: "X" } });
  const todos = A.comPagina("restauth/postdata", corpo, null, 100000, campo);
  assert.deepEqual(JSON.parse(JSON.stringify(todos.corpo)), { Filtro: { Qtde: 100000, NumeroDaPagina: 1, Nome: "X" } });
  // Na URL também.
  assert.equal(A.campoDoTamanho("restauth/list?entity=5&lote=50", null, 50), "lote");
  // Total por trecho (o exato ainda vale primeiro).
  assert.equal(A.totalDaResposta({ Data: { Lista: [{ Id: 1 }], TotalDeLinhas: 1294 } }), 1294);
  assert.equal(A.totalDaResposta({ Data: { Lista: [{ Id: 1 }], Total: 10, QtdeTotal: 99 } }), 10);
  // A leitura parada no tamanho descoberto é incompleta.
  assert.equal(A.leituraCompleta({ total: null, lidas: 50, tamanho: 50, curta: false }), false);
  // Diagnóstico: só nomes e números, nunca texto.
  const d = A.diagnosticoConsulta("restauth/postdata?p=1&q=abc", { Filtro: { Qtde: 50, Nome: "Fulano", Ref: null }, Token: "segredo" });
  assert.equal(d, "Filtro.Qtde=50, Filtro.Ref=null, ?p=1");
});

test("Nó CM002: a extensão antiga pede atualização e o diagnóstico vai na mensagem", async () => {
  const def = REGISTRO_NOS.get("centi.cm002") as DefNo;
  const dfds = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, planejamento: String(i + 1), entidade: "6" }));
  const pagina = Array.from({ length: 50 }, (_, i) => ({ id: String(i + 500), situacao: "Executado" }));
  const ctx = (resp: Record<string, unknown>) =>
    ({ centi: async () => resp, api: async () => ({ ok: false }), cancelado: () => false, host: {}, aviso: () => {} }) as never;
  await assert.rejects(def.executar({ entrada: dfds }, { dosItens: true }, ctx({ ok: true, linhas: pagina }), {}), /Atualize a extensão da Centi/);
  await assert.rejects(
    def.executar({ entrada: dfds }, { dosItens: true }, ctx({ ok: true, linhas: pagina, completa: false, tamanho: 50, modo: "página a página", paginas: 1, diagnostico: "Filtro.Qtde=50" }), {}),
    /modo página a página; 1 pág\.; consulta: Filtro\.Qtde=50/,
  );
});

test("Fluxo salvo desatualizado: só os tipos dos nós contam", async () => {
  const { MODELOS_FLUXO, desatualizadoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "unidades-cm002");
  assert.ok(m);
  const g = lerGrafo(m.grafo);
  assert.equal(desatualizadoDoModelo({ nos: g.nos.map((n) => ({ ...n, x: 0, config: {} })) }, m), false);
  assert.equal(desatualizadoDoModelo({ nos: g.nos.filter((n) => n.tipo !== "logica.se") }, m), true);
});

test("Captura de colunas da tela: o nome do campo pelo título, a escolha gravada e o valor de cada coluna", async () => {
  const { chaveDoTitulo, lerCaptura, valorCapturado } = await import("../src/lib/fluxo-dados.ts");
  assert.equal(chaveDoTitulo("Centro Custo"), "centroCusto");
  assert.equal(chaveDoTitulo("DATA INICIAL"), "dataInicial");
  assert.equal(chaveDoTitulo("Código"), "codigo");
  assert.equal(chaveDoTitulo("Nº"), "n");
  assert.deepEqual(lerCaptura("CentroCustoDescricao|Centro Custo; Codigo|Código; X|Código"), [
    { campo: "CentroCustoDescricao", titulo: "Centro Custo", chave: "centroCusto" },
    { campo: "Codigo", titulo: "Código", chave: "codigo" },
    { campo: "X", titulo: "Código", chave: "codigo2" },
  ]);
  assert.equal(valorCapturado({ tela: { Codigo: "03.52.000" } }, "Codigo"), "03.52.000");
  assert.equal(valorCapturado({ centi: { "Lotacao.Id": "4", "Lotacao.Descricao": "PM RV, GGIM" } }, "Lotacao"), "PM RV, GGIM");
  assert.equal(valorCapturado({}, "Codigo"), "");
});

test("Nó CM002: as colunas escolhidas viram campos do item (e o item fica leve sem 'Trazer todas')", async () => {
  const pedidos: unknown[] = [];
  const centi = async (acao: string, dados: unknown) => {
    pedidos.push({ acao, dados });
    return {
      ok: true,
      total: 1,
      completa: true,
      colunasTela: [{ titulo: "Centro Custo", campo: "CC" }],
      linhas: [{ id: "1769", situacao: "Não Executado", finalidade: "", centroCusto: "PM RV, GGIM", centi: { Id: "1769", CC: "PM RV, GGIM", Codigo: "03.52.000" }, tela: { CC: "PM RV, GGIM", Codigo: "03.52.000" } }],
    };
  };
  const grafo = {
    v: 1,
    nos: [
      { id: "a", tipo: "gatilho.inicio", x: 0, y: 0, config: {} },
      { id: "b", tipo: "centi.cm002", x: 0, y: 0, config: { entidades: "2", capturar: "CC|Centro Custo; Codigo|Código" } },
    ],
    conexoes: [{ de: "a", saida: "saida", para: "b", entrada: "entrada" }],
  };
  const r = await executarFluxo(grafo as never, REGISTRO_NOS, { centi: centi as never, api: (async () => ({})) as never, cancelado: () => false, host: {} });
  assert.equal(r.estado, "concluido", r.erro);
  assert.deepEqual((pedidos[0] as { dados: { colunas: boolean } }).dados.colunas, true, "pede as colunas quando há captura");
  const it = r.retorno[0] as Record<string, unknown> | undefined;
  assert.equal(it?.centroCusto, "PM RV, GGIM");
  assert.equal(it?.codigo, "03.52.000");
  assert.equal("centi" in (it ?? {}), false);
});
