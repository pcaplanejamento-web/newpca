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

test("Gravar na coluna da Mesa: o mesmo alvo vale UMA vez (o último que chegou)", async () => {
  const chamadas: { c: string; body: unknown }[] = [];
  const api = async (c: string, init?: unknown) => {
    chamadas.push({ c, body: (init as { body?: unknown } | undefined)?.body });
    return c.endsWith("/colunas") ? { ok: true, coluna: { id: 7 } } : { ok: true };
  };
  const g: Grafo = { v: 1, nos: [no("i", "gatilho.inicio"), no("g", "saida.gravarColuna", { entidade: "dfd", coluna: "X", campoValor: "v", apagar: true })], conexoes: [lig("i", "g")] };
  const reg = new Map(REGISTRO_NOS);
  reg.set("gatilho.inicio", { ...(REGISTRO_NOS.get("gatilho.inicio") as DefNo), executar: async () => ({ saida: [{ id: 1, v: "A" }, { id: 2, v: "B" }, { id: 1, v: "C" }] }) });
  const r = await executarFluxo(g, reg, ctx({}, api));
  assert.equal(r.estado, "concluido", r.erro);
  assert.deepEqual(chamadas[1].body, { valores: [{ alvoId: 1, valor: "C" }, { alvoId: 2, valor: "B" }] });
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

/** Roda a automação ÚNICA ("Verificar DFDs na Centi") com o "O que verificar" dado — o host falso da Centi e do sistema. */
async function verificar(o: {
  dfds: Record<string, unknown>[];
  centi: (plan: string, entidade?: string) => Record<string, unknown> | Error;
  config: Record<string, unknown>;
  unidades?: Record<string, unknown>[];
  /** A LISTA da CM002 de cada órgão (a extensão falsa) — sem ela, a lista vem vazia. */
  cm002?: (entidade: string) => Record<string, unknown>[] | Error;
  /** Os órgãos com o ID da Centi (os outros órgãos tentados quando o planejamento não abre no do DFD). */
  mapa?: Record<string, string>;
}) {
  const { MODELOS_FLUXO, grafoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const pai = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-centi");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(pai && filho);
  const g = lerGrafo(grafoDoModelo(pai, new Map([["conferir-corrigir-1-dfd", 50]])));
  g.nos = g.nos.map((n) => (n.tipo === "dados.filtrarConferencia" ? { ...n, config: { ...n.config, ...o.config } } : n));
  const posts: { c: string; body: Record<string, unknown> }[] = [];
  const lidos: string[] = [];
  const cm002: string[] = [];
  const retomada = new Map<string, string>();
  const r = await executarFluxo(g, REGISTRO_NOS, {
    centi: async (acao: string, d?: unknown) => {
      if (acao !== "cm002") return { ok: true, linhas: [] };
      const ent = String((d as { entidade?: unknown } | undefined)?.entidade ?? "");
      cm002.push(ent);
      const x = o.cm002?.(ent) ?? [];
      return x instanceof Error ? { ok: false, erro: x.message } : { ok: true, linhas: x, total: x.length, completa: true };
    },
    api: async (c: string, init?: unknown) => {
      const body = ((init as { body?: unknown } | undefined)?.body ?? {}) as Record<string, unknown>;
      posts.push({ c, body });
      if (c.includes("execucao-dfds")) {
        const ids = (body.dfdIds ?? []) as number[];
        const ls = (body.linhas ?? []) as { valores: string[] }[];
        return { ok: true, atualizados: ids.length, linhas: ids.map((id, i) => ({ id, antes: null, situacao: ls[i]?.valores[1] })) };
      }
      return { ok: true, marcados: 1, alterados: 1, falhas: [], total: 1, cortadas: 0 };
    },
    cancelado: () => false,
    host: {
      protocolos: [],
      unidades: o.unidades ?? [],
      esperaCentiMs: 0,
      mapaEntidades: o.mapa ?? {},
      progresso: {
        ler: async () => [],
        gravar: async (_no: string, l: { chave: string; estado: string }[]) => {
          for (const x of l) retomada.set(x.chave.split("|")[0], x.estado);
        },
        limpar: async () => {},
      },
      __cache: new Map([["dfds", Promise.resolve(o.dfds)]]),
      carregarFluxo: async (id: number) => ({ id, nome: filho.nome, grafo: lerGrafo(filho.grafo) }),
      lerDfdCenti: async (plan: string, entidade?: string, pdf?: boolean) => {
        lidos.push(`${plan}@${entidade}:${pdf}`);
        const x = o.centi(plan, entidade);
        if (x instanceof Error) throw x;
        return { planejamento: plan, ...x };
      },
      corrigirPelaCenti: async (id: number) => {
        posts.push({ c: "corrigir", body: { id } });
        return { resultado: "corrigido", status: "convergente", motivo: null };
      },
    },
  });
  const gravado = (rota: string, campo: "situacao" | "centro") =>
    Object.fromEntries(
      posts
        .filter((p) => p.c.includes(rota))
        .flatMap((p) =>
          campo === "situacao"
            ? ((p.body.dfdIds ?? []) as number[]).map((id, i) => [id, ((p.body.linhas as { valores: string[] }[])[i]?.valores ?? [])[1]])
            : ((p.body.itens ?? []) as { dfdId: number; centro: string | null }[]).map((v) => [v.dfdId, v.centro]),
        ),
    );
  return { r, posts, lidos, cm002, retomada, situacoes: gravado("execucao-dfds", "situacao"), centros: gravado("centro-custo-dfds", "centro") };
}

test("Verificar DFDs na Centi — só a SITUAÇÃO: sem PDF, a de cada órgão (mesmo nº em dois órgãos) e “Não encontrado na Centi”", async () => {
  const dfds = [
    { id: 10, numero: "1028", planejamento: "1082", entidade: "6" },
    { id: 11, numero: "77", planejamento: "1082", entidade: "2" },
    { id: 12, numero: "500", planejamento: "999", entidade: "2" },
  ];
  const v = await verificar({
    dfds,
    config: { conteudo: false, situacao: true, centro: false },
    centi: (plan, ent) => (plan === "999" ? new Error("NAO_ENCONTRADO: a Centi não abriu o planejamento 999 — Registro não encontrado.") : { situacao: ent === "6" ? "Executado" : "Não Executado" }),
  });
  assert.equal(v.r.estado, "concluido", v.r.erro);
  assert.deepEqual(v.lidos.sort(), ["1082@2:false", "1082@6:false", "999@2:false"], "uma leitura por DFD, só o registro (sem PDF)");
  assert.deepEqual(v.situacoes, { 10: "Executado", 11: "Não Executado", 12: "Não encontrado na Centi" });
  assert.equal(v.posts.filter((p) => p.c.includes("conferencia-dfds") || p.c.includes("centro-custo-dfds")).length, 0, "nada do conteúdo nem do centro de custo");
  const ret = new Map((v.r.retorno ?? []).map((it) => [Number(it.id), it]));
  assert.equal(ret.size, 3, "um resultado por DFD");
  assert.equal(ret.get(10)?.situacaoGravada, "Executado");
});

test("Verificar DFDs na Centi — só o CENTRO DE CUSTO: grava o texto, aponta a unidade divergente/desconhecida e só troca com a caixa", async () => {
  const unidades = [
    { id: 1, codigo: "SEPLAN", nome: "Secretaria Municipal de Planejamento e Gestão", orgaoId: 1, centrosCusto: ["PM RV, SEPLAN"] },
    { id: 2, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1, centrosCusto: ["PM RV, GABINETE DO PREFEITO, GGIM"] },
    { id: 3, codigo: "SMC", nome: "Secretaria Municipal de Comunicação", orgaoId: 1 },
  ];
  const dfds = [
    { id: 1, numero: "10", planejamento: "100", entidade: "2", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 3, numero: "30", planejamento: "300", entidade: "2", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 4, numero: "40", planejamento: "400", entidade: "2", reparticaoId: 2, sigla: "GGIM", orgaoId: 1 },
    { id: 5, numero: "50", planejamento: "500", entidade: "2", reparticaoId: 3, sigla: "SMC", orgaoId: 1 },
    { id: 6, numero: "60", planejamento: "600", entidade: "2", reparticaoId: 3, sigla: "SMC", orgaoId: 1 },
  ];
  const centros: Record<string, string> = {
    "100": "PM RV, GABINETE DO PREFEITO, GGIM",
    "300": "PM RV, CAMARA MUNICIPAL, GUARDA CIVIL MUNICIPAL",
    "400": "PM RV, GABINETE DO PREFEITO, GGIM",
    "500": "PM RV, SECRETARIA MUNICIPAL DE COMUNICAÇÃO",
  };
  const centi = (plan: string) => (plan === "600" ? new Error("Sem resposta da extensão.") : { situacao: "Executado", centroCusto: centros[plan] });
  const v = await verificar({ dfds, unidades, config: { conteudo: false, situacao: false, centro: true }, centi });
  assert.equal(v.r.estado, "concluido", v.r.erro);
  assert.ok(v.lidos.every((l) => l.endsWith(":false")), "sem PDF");
  assert.deepEqual(v.centros, { 1: centros["100"], 3: centros["300"], 4: centros["400"], 5: centros["500"] }, "a leitura que falhou não grava (o valor de antes fica)");
  assert.equal(v.posts.filter((p) => p.c === "/api/dfd/massa").length, 0, "sem a caixa, a unidade não é trocada");
  const ap = v.r.apontados.map((a) => `${a.nivel}:${String(a.mensagem)}`);
  assert.ok(ap.some((t) => t.startsWith("atencao:DFD 10 (planejamento 100): no sistema SEPLAN, na Centi GGIM")), ap.join("\n"));
  assert.ok(ap.some((t) => t.startsWith("erro:") && t.includes("“GUARDA CIVIL MUNICIPAL” não existe no sistema") && t.includes("cadastre a unidade")), ap.join("\n"));
  assert.ok(!ap.some((t) => t.includes("DFD 40") || t.includes("DFD 50")), "a unidade igual não é apontada");
  assert.ok(ap.some((t) => t.startsWith("erro:") && t.includes("DFD 60")), "a falha de leitura é apontada (a retomada tenta de novo)");
  // Com a caixa: o divergente passa para a unidade da Centi (a edição em massa da Mesa) e não é mais apontado.
  const t = await verificar({ dfds, unidades, config: { conteudo: false, situacao: false, centro: true, trocarUnidade: true }, centi });
  assert.deepEqual(
    t.posts.filter((p) => p.c === "/api/dfd/massa").map((p) => p.body),
    [{ ids: [1], acao: { campo: "reparticao", reparticaoId: 2 } }],
  );
  assert.equal((t.r.retorno ?? []).find((it) => Number(it.id) === 1)?.unidadeTrocada, true);
  assert.ok(!t.r.apontados.some((a) => String(a.mensagem).startsWith("DFD 10 (planejamento 100): no sistema")));
});

test("Verificar DFDs na Centi — TUDO de uma vez: UMA leitura por DFD (com o PDF) serve à situação, ao centro de custo e ao conteúdo", async () => {
  const dfds = [{ id: 1, numero: "10", planejamento: "100", entidade: "2", reparticaoId: 2, sigla: "GGIM", orgaoId: 1, valor: 50, totalItens: 2, tipo: "DFD-S" }];
  const v = await verificar({
    dfds,
    unidades: [{ id: 2, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1, centrosCusto: ["PM RV, GABINETE DO PREFEITO, GGIM"] }],
    config: {},
    centi: () => ({ numero: "10", tipo: "DFD-S", valor: 50, totalItens: 2, situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" }),
  });
  assert.equal(v.r.estado, "concluido", v.r.erro);
  assert.deepEqual(v.lidos, ["100@2:true"], "uma leitura só, com o PDF (o conteúdo é verificado)");
  assert.deepEqual(v.situacoes, { 1: "Executado" });
  assert.deepEqual(v.centros, { 1: "PM RV, GABINETE DO PREFEITO, GGIM" });
  assert.deepEqual(
    v.posts.filter((p) => p.c.includes("conferencia-dfds")).flatMap((p) => (p.body.itens ?? []) as { dfdId: number; status: string }[]).map((x) => [x.dfdId, x.status]),
    [[1, "convergente"]],
  );
  const it = (v.r.retorno ?? [])[0];
  assert.equal(it?.situacaoGravada, "Executado");
  assert.equal(it?.unidadeConfere, "sim");
  assert.equal(it?.conferenciaCenti, "convergente");
  assert.equal(v.r.apontados.length, 0);
});

// A Centi 3.0.216.217: o planejamento abre só como PRÉVIA (sem a situação em texto e sem o centro de custo). A situação e
// o centro de custo vêm da LISTA da CM002 do órgão do DFD — a fonte de antes da unificação —, lida UMA vez por órgão.
const PREVIA = { situacao: "", centroCusto: "", finalidade: "", centroAusente: true, camposCenti: ["Finalidade", "Situacao", "Id"] };
const UNIDADES = [
  { id: 1, codigo: "SEPLAN", nome: "Secretaria Municipal de Planejamento e Gestão", orgaoId: 1, centrosCusto: ["PM RV, SEPLAN"] },
  { id: 2, codigo: "GGIM", nome: "Gabinete de Gestão Integrada Municipal", orgaoId: 1, centrosCusto: ["PM RV, GABINETE DO PREFEITO, GGIM"] },
];

test("Verificar DFDs na Centi — a PRÉVIA sem situação/centro: os dois pela CM002 do órgão, UMA leitura para todos os DFDs dele", async () => {
  const dfds = [
    { id: 1, numero: "227", planejamento: "277", entidade: "8", reparticaoId: 2, sigla: "GGIM", orgaoId: 1 },
    { id: 2, numero: "228", planejamento: "278", entidade: "8", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
    { id: 3, numero: "229", planejamento: "279", entidade: "8", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
  ];
  const v = await verificar({
    dfds,
    unidades: UNIDADES,
    config: { conteudo: false, situacao: true, centro: true },
    centi: () => PREVIA,
    cm002: (ent) =>
      ent === "8"
        ? [
            { id: "277", situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" },
            { id: "278", situacao: "Não Executado", centroCusto: "PM RV, SEPLAN" },
          ]
        : [],
  });
  assert.equal(v.r.estado, "concluido", v.r.erro);
  assert.deepEqual(v.cm002, ["8"], "a lista da CM002 do órgão é lida UMA vez (os DFDs em paralelo compartilham)");
  assert.deepEqual(v.situacoes, { 1: "Executado", 2: "Não Executado" }, "a situação da CM002; a do 279 (fora da lista) não é gravada");
  assert.deepEqual(v.centros, { 1: "PM RV, GABINETE DO PREFEITO, GGIM", 2: "PM RV, SEPLAN" }, "o centro de custo da CM002; o do 279 fica o gravado");
  const ap = v.r.apontados.map((a) => `${a.nivel}:${String(a.mensagem)}`);
  assert.ok(ap.some((t) => t.startsWith("atencao:DFD 229 (planejamento 279): situação não lida na Centi (a gravada foi mantida)") && t.includes("não veio na lista da CM002 do órgão 8")), ap.join("\n"));
  assert.ok(ap.some((t) => t.startsWith("atencao:") && t.includes("DFD 229") && t.includes("veio sem o centro de custo") && t.includes("O centro de custo gravado foi mantido")), ap.join("\n"));
  assert.ok(!ap.some((t) => t.includes("DFD 227") || t.includes("DFD 228")), "os lidos pela CM002 não são apontados");
});

test("Verificar DFDs na Centi — a CM002 também falha: ATENÇÃO com o motivo e o que fazer; nada é gravado nem apagado", async () => {
  const dfds = [{ id: 1, numero: "227", planejamento: "277", entidade: "8", reparticaoId: 2, sigla: "GGIM", orgaoId: 1 }];
  const v = await verificar({ dfds, unidades: UNIDADES, config: { conteudo: false, situacao: true, centro: true }, centi: () => PREVIA, cm002: () => new Error("Sem a consulta da CM002.") });
  assert.equal(v.r.estado, "concluido", v.r.erro);
  assert.deepEqual(v.situacoes, {});
  assert.deepEqual(v.centros, {}, "o centro de custo não lido nunca é apagado");
  const ap = v.r.apontados.map((a) => `${a.nivel}:${String(a.mensagem)}`);
  assert.ok(ap.some((t) => t.startsWith("atencao:") && t.includes("situação não lida") && t.includes("a CM002 do órgão 8 não foi lida") && t.includes("Pesquisar UMA vez")), ap.join("\n"));
  assert.ok(ap.some((t) => t.startsWith("atencao:") && t.includes("não conferido na Centi") && t.includes("a CM002 do órgão 8 não foi lida")), ap.join("\n"));
});

test("Verificar DFDs na Centi — o planejamento achado em OUTRO órgão nunca dá a situação nem o centro de custo", async () => {
  const dfds = [{ id: 1, numero: "30", planejamento: "300", entidade: "8", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 }];
  const v = await verificar({
    dfds,
    unidades: UNIDADES,
    mapa: { "o:1": "8", "o:2": "2" },
    config: { conteudo: false, situacao: true, centro: true },
    centi: (_plan, ent) => (ent === "8" ? new Error("Não consegui abrir o planejamento 300 na Centi (órgão 8).") : { situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" }),
    cm002: () => [{ id: "300", situacao: "Cancelado", centroCusto: "PM RV, SEPLAN" }],
  });
  assert.equal(v.r.estado, "concluido", v.r.erro);
  assert.deepEqual(v.lidos, ["300@8:false", "300@2:false"]);
  assert.deepEqual(v.situacoes, {}, "a situação de outro órgão não é gravada");
  assert.deepEqual(v.centros, {}, "o centro de custo de outro órgão não é gravado");
  assert.deepEqual(v.cm002, [], "nem a CM002 do órgão do DFD (o planejamento é de outro órgão)");
  const ap = v.r.apontados.map((a) => `${a.nivel}:${String(a.mensagem)}`);
  assert.ok(ap.some((t) => t.startsWith("atencao:") && t.includes("achado na Centi no órgão 2") && t.includes("situação não gravada")), ap.join("\n"));
  assert.ok(ap.some((t) => t.startsWith("atencao:") && t.includes("achado no órgão 2, não no do DFD") && t.includes("O centro de custo gravado foi mantido")), ap.join("\n"));
});

test("Verificar DFDs na Centi — o planejamento NÃO ABRE em nenhum órgão: a CM002 do órgão dá a situação e o centro de custo; sem a linha, o DFD falha", async () => {
  const dfds = [
    { id: 1, numero: "227", planejamento: "277", entidade: "8", reparticaoId: 2, sigla: "GGIM", orgaoId: 1 },
    { id: 2, numero: "228", planejamento: "278", entidade: "8", reparticaoId: 1, sigla: "SEPLAN", orgaoId: 1 },
  ];
  const v = await verificar({
    dfds,
    unidades: UNIDADES,
    config: { conteudo: false, situacao: true, centro: true },
    centi: (plan) => new Error(`Não consegui abrir o planejamento ${plan} na Centi (órgão 8).`),
    cm002: () => [{ id: "277", situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" }],
  });
  assert.equal(v.r.estado, "concluido", v.r.erro);
  assert.deepEqual(v.situacoes, { 1: "Executado" });
  assert.deepEqual(v.centros, { 1: "PM RV, GABINETE DO PREFEITO, GGIM" });
  assert.equal(v.retomada.get("1"), "ok");
  assert.equal(v.retomada.get("2"), "falha", "sem a linha da CM002: o DFD falha e a retomada o refaz");
  assert.ok(v.r.apontados.some((a) => a.nivel === "erro" && String(a.mensagem).includes("DFD 228") && String(a.mensagem).includes("não conferido")));
});

test("Verificar DFDs na Centi — o CONTEÚDO falha depois de o planejamento abrir: a situação e o centro de custo são gravados; o conteúdo fica não conferido e a retomada o refaz", async () => {
  const dfds = [{ id: 1, numero: "10", planejamento: "100", entidade: "2", reparticaoId: 2, sigla: "GGIM", orgaoId: 1, valor: 50, totalItens: 2, tipo: "DFD-S" }];
  const carga = { planejamento: "100", situacao: "Executado", centroCusto: "PM RV, GABINETE DO PREFEITO, GGIM", finalidade: "" };
  const falha = () => Object.assign(new Error("A Centi emitiu o DFD sem os valores dos itens (Emitir valor referência) — não conferido."), { carga });
  const v = await verificar({ dfds, unidades: UNIDADES, config: {}, centi: () => falha() });
  assert.equal(v.r.estado, "concluido", v.r.erro);
  assert.deepEqual(v.situacoes, { 1: "Executado" }, "a situação lida no load vale (as verificações são independentes)");
  assert.deepEqual(v.centros, { 1: "PM RV, GABINETE DO PREFEITO, GGIM" });
  assert.equal(v.posts.filter((p) => p.c.includes("conferencia-dfds")).flatMap((p) => (p.body.itens ?? []) as unknown[]).length, 0, "o conteúdo não conferido não é marcado");
  assert.equal(v.posts.filter((p) => p.c.includes("corrigir")).length, 0, "nem corrigido");
  assert.equal(v.retomada.get("1"), "falha");
  assert.ok(v.r.apontados.some((a) => a.nivel === "erro" && String(a.mensagem).includes("sem os valores dos itens")), v.r.apontados.map((a) => String(a.mensagem)).join("\n"));
  // Só o conteúdo pedido: a falha é do DFD inteiro, como sempre.
  const s = await verificar({ dfds, unidades: UNIDADES, config: { conteudo: true, situacao: false, centro: false }, centi: () => falha() });
  assert.equal(s.r.estado, "concluido", s.r.erro);
  assert.deepEqual(s.situacoes, {});
  assert.deepEqual(s.centros, {});
  assert.equal(s.retomada.get("1"), "falha");
  assert.ok(s.r.apontados.some((a) => a.nivel === "erro" && String(a.mensagem).includes("DFD 10") && String(a.mensagem).includes("sem os valores dos itens")));
});

test("O que verificar: nenhuma marcada = erro claro; a escolha vai em cada DFD", async () => {
  const def = REGISTRO_NOS.get("dados.filtrarConferencia") as DefNo;
  const c = ctx() as never;
  await assert.rejects(def.executar({ entrada: [{ id: 1 }] }, { conteudo: false, situacao: false, centro: false }, c, {}), /Escolha ao menos uma verificação/);
  const r = await def.executar({ entrada: [{ id: 1, conferenciaCenti: "convergente" }, { id: 2, conferenciaCenti: "divergente" }] }, { quais: "divergentes", corrigir: false, centro: false }, c, {});
  assert.deepEqual(r.saida?.map((x) => x.id), [2], "“Pela conferência gravada” filtra (com o conteúdo)");
  assert.deepEqual(r.saida?.[0].verificar, { conteudo: "sim", corrigir: "nao", situacao: "sim", centro: "nao", trocarUnidade: "nao", semDfd: "nao" });
  // Sem o conteúdo, o filtro da conferência não vale: todos seguem.
  const s = await def.executar({ entrada: [{ id: 1, conferenciaCenti: "convergente" }] }, { conteudo: false, quais: "divergentes" }, c, {});
  assert.equal(s.saida?.length, 1);
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

test("Fluxo salvo desatualizado: os tipos dos nós e as opções que o modelo liga e o salvo não tem", async () => {
  const { MODELOS_FLUXO, desatualizadoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(m);
  const g = lerGrafo(m.grafo);
  // Posição e ajustes (inclusive desligar uma opção — "false" gravado) não acusam.
  const desligado = (c: Record<string, unknown>) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === true ? false : v]));
  assert.equal(desatualizadoDoModelo({ nos: g.nos.map((n) => ({ ...n, x: 0, config: desligado(n.config) })) }, m), false);
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

test("ehMarcadorFim: o marcador sozinho da porta fim não conta como item", async () => {
  const { ehMarcadorFim } = await import("../src/lib/fluxo-core.ts");
  const { marcarExecutado } = await import("../src/lib/fluxo-ler-sistema.ts");
  assert.equal(ehMarcadorFim(marcarExecutado([], 1246)[0]), true);
  assert.equal(ehMarcadorFim(marcarExecutado([{ id: 1 }], 1)[0]), false);
});

test("Buscar DFD na Centi: UMA recusa do Emitir DFD fica no DFD; só 3 seguidas sem nenhum emitido param tudo", async () => {
  const { PREFIXO_RECUSA } = await import("../src/lib/automacao-centi-core.ts");
  const no = REGISTRO_NOS.get("leitura.dfdCenti") as DefNo;
  const ctxDe = (recusa: (p: string) => boolean) => ({
    centi: async () => ({ ok: true }),
    api: async () => ({ ok: true }),
    aviso: () => undefined,
    cancelado: () => false,
    host: {
      __cache: new Map<string, unknown>(),
      esperaCentiMs: 0,
      lerDfdCenti: async (plan: string) => {
        if (recusa(plan)) throw new Error(`${PREFIXO_RECUSA}A Centi negou a emissão do DFD do planejamento ${plan}: “Usuário sem permissão!”.`);
        return { planejamento: plan, situacao: "Executado" };
      },
    },
  });
  const itens = ["1", "2", "3", "4"].map((p) => ({ numero: p, planejamento: p, entidade: "2" }));
  // O 1º recusado e os demais emitidos: o fluxo segue, o 1º fica "não conferido" com o motivo.
  const r = (await no.executar({ entrada: itens }, { pdf: true }, ctxDe((p) => p === "1") as never, {} as never)) as { saida: Record<string, unknown>[] };
  assert.equal(r.saida.length, 4);
  assert.equal(r.saida[0].centiFalha, true);
  assert.match(String(r.saida[0].centiErro), /^A Centi negou a emissão do DFD do planejamento 1/);
  assert.ok(r.saida.slice(1).every((x) => x.centi));
  // Depois de um emitido, recusas seguidas não param (a operação funciona).
  const r2 = (await no.executar({ entrada: itens }, { pdf: true }, ctxDe((p) => p !== "1") as never, {} as never)) as { saida: Record<string, unknown>[] };
  assert.equal(r2.saida.filter((x) => x.centiFalha).length, 3);
  // 3 seguidas sem nenhum emitido: a operação mudou — para com a mensagem geral.
  await assert.rejects(no.executar({ entrada: itens }, { pdf: true }, ctxDe(() => true) as never, {} as never), /recusou o Emitir DFD em 3 planejamentos seguidos \(1, 2, 3\)/);
});
