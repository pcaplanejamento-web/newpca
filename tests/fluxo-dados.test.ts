import assert from "node:assert/strict";
import { test } from "node:test";
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
