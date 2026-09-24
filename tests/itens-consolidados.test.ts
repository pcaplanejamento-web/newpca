import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consolidarItens,
  desvioDaMedia,
  desvioTexto,
  distintos,
  estadoConsolidado,
  type ItemConsolidavel,
  mediaDeReferencia,
  nivelVariacao,
  participacaoTexto,
  textoResumoConsolidado,
  varianteDescricao,
} from "../src/lib/itens-consolidados.ts";

type It = ItemConsolidavel & { dfd: string; protocolo: string | null };
let seq = 0;
const item = (p: Partial<It>): It => ({
  id: ++seq,
  codigo: "524194727",
  descricao: "PAPEL A4",
  unidade: "UN",
  quantidade: 1,
  valorUnitario: 10,
  valorTotal: 10,
  dfd: "1",
  protocolo: "P-1",
  ...p,
});

describe("consolidarItens — um item por código", () => {
  it("junta o MESMO código (só os dígitos): soma quantidades e totais; média PONDERADA pela quantidade", () => {
    const [l, ...resto] = consolidarItens([
      item({ codigo: "524.194.727", quantidade: 10, valorUnitario: 5, valorTotal: 50 }),
      item({ codigo: "524194727", quantidade: 30, valorUnitario: 9, valorTotal: 270 }),
    ]);
    assert.equal(resto.length, 0);
    assert.equal(l.codigo, "524194727");
    assert.equal(l.chave, "c:524194727");
    assert.equal(l.itens.length, 2);
    assert.equal(l.quantidade, 40);
    assert.equal(l.valorTotal, 320);
    // (10×5 + 30×9) ÷ 40 = 8 — a linha fecha: 40 × 8 = 320
    assert.equal(l.valorMedio, 8);
    assert.equal(l.valorMin, 5);
    assert.equal(l.valorMax, 9);
  });

  it("item SEM código não consolida: cada um fica numa linha própria", () => {
    const linhas = consolidarItens([item({ codigo: null }), item({ codigo: "  -  " }), item({ codigo: "" })]);
    assert.equal(linhas.length, 3);
    assert.ok(linhas.every((l) => l.codigo == null && l.chave.startsWith("i:") && l.itens.length === 1));
  });

  it("itens sem quantidade/preço: somam o que há, ficam fora da média e são contados", () => {
    const [l] = consolidarItens([
      item({ quantidade: null, valorUnitario: 7, valorTotal: null }),
      item({ quantidade: 4, valorUnitario: null, valorTotal: null }),
      item({ quantidade: 2, valorUnitario: 0, valorTotal: 0 }),
      item({ quantidade: 5, valorUnitario: 3, valorTotal: 15 }),
    ]);
    assert.equal(l.quantidade, 11);
    assert.equal(l.semQuantidade, 1);
    assert.equal(l.semValor, 2);
    assert.equal(l.foraDaMedia, 3); // cada item fora da média conta UMA vez (sem qtd, sem preço, preço zero)
    assert.equal(l.valorTotal, 15);
    assert.equal(l.valorMedio, 3); // só o item com quantidade E preço entra na média ponderada
    assert.equal(l.valorMin, 3);
    assert.equal(l.valorMax, 7); // o preço sem quantidade ainda conta na faixa
  });

  it("quantidade ZERADA ou negativa não é quantidade válida: fora da média e contada (nunca some calada)", () => {
    const [l] = consolidarItens([item({ quantidade: 0, valorUnitario: 10, valorTotal: 0 }), item({ quantidade: -2, valorUnitario: 12, valorTotal: 0 })]);
    assert.equal(l.semQuantidade, 2);
    assert.equal(l.foraDaMedia, 2);
    assert.equal(l.valorMedio, null);
    assert.equal(l.valorMin, 10);
    assert.equal(l.valorMax, 12);
  });

  it("unidades DIFERENTES: estatísticas por unidade, variação = a maior DENTRO de uma unidade, média de referência da unidade", () => {
    const [l] = consolidarItens([
      item({ unidade: "RESMA", quantidade: 120, valorUnitario: 24.9, valorTotal: 2988 }),
      item({ unidade: "resma", quantidade: 80, valorUnitario: 27.5, valorTotal: 2200 }),
      item({ unidade: "CX", quantidade: 10, valorUnitario: 139, valorTotal: 1390 }),
    ]);
    assert.equal(l.unidadesMistas, true);
    assert.deepEqual(
      l.porUnidade.map((u) => [u.texto, u.n, u.quantidade, u.valorMin, u.valorMax]),
      [
        ["RESMA", 2, 200, 24.9, 27.5],
        ["CX", 1, 10, 139, 139],
      ],
    );
    assert.ok(Math.abs((l.porUnidade[0].valorMedio ?? 0) - 25.94) < 1e-9);
    assert.equal(l.porUnidade[1].variacao, null);
    // A variação da linha NÃO mistura a caixa com a resma: é a da resma (≈ 7%), não a de 24,90 × 139 (> 100%).
    assert.ok(Math.abs((l.variacao ?? 0) - (l.porUnidade[0].variacao ?? -1)) < 1e-12);
    assert.ok((l.variacao ?? 1) < 0.1);
    assert.equal(mediaDeReferencia(l, " cx "), 139);
    assert.ok(Math.abs((mediaDeReferencia(l, "Resma") ?? 0) - 25.94) < 1e-9);
    assert.equal(mediaDeReferencia(l, null), null);
    assert.deepEqual(
      l.unidades.map((u) => [u.texto, u.n]),
      [
        ["RESMA", 2],
        ["CX", 1],
      ],
    );
    // Uma unidade só (UN = UNIDADE): não mistura — a referência é a média da linha.
    const [u] = consolidarItens([item({ unidade: "UN" }), item({ unidade: "unidade", valorUnitario: 20, valorTotal: 20 })]);
    assert.equal(u.unidadesMistas, false);
    assert.equal(mediaDeReferencia(u, "UN"), u.valorMedio);
  });

  it("nenhuma quantidade nem preço: tudo nulo, nunca NaN", () => {
    const [l] = consolidarItens([item({ quantidade: null, valorUnitario: null, valorTotal: null })]);
    assert.equal(l.quantidade, null);
    assert.equal(l.valorMedio, null);
    assert.equal(l.valorMin, null);
    assert.equal(l.variacao, null);
    assert.equal(l.valorTotal, 0);
    assert.equal(l.abc, null);
  });

  it("descrições e unidades distintas — sem diferença de caixa/acento/espaço; a mais frequente primeiro", () => {
    const [l] = consolidarItens([
      item({ descricao: "Caneta azul", unidade: "UN" }),
      item({ descricao: "CANETA  AZUL", unidade: "unidade" }),
      item({ descricao: "Caneta preta", unidade: "CX" }),
      item({ descricao: "caneta preta", unidade: "CX" }),
      item({ descricao: "Caneta preta", unidade: "cx" }),
      item({ descricao: null, unidade: null }),
    ]);
    assert.deepEqual(l.descricoes, [
      { texto: "Caneta preta", n: 3 },
      { texto: "Caneta azul", n: 2 },
    ]);
    assert.deepEqual(
      l.unidades.map((u) => u.n),
      [3, 2],
    );
    assert.equal(l.unidades[0].texto, "CX");
  });

  it("variação (coeficiente de variação amostral) só com 2+ preços; preços iguais = 0", () => {
    const [um] = consolidarItens([item({ codigo: "1" })]);
    assert.equal(um.variacao, null);
    const [iguais] = consolidarItens([item({ codigo: "2" }), item({ codigo: "2" })]);
    assert.equal(iguais.variacao, 0);
    const [l] = consolidarItens([item({ codigo: "3", valorUnitario: 10 }), item({ codigo: "3", valorUnitario: 20 })]);
    // média 15, desvio-padrão amostral √50 ≈ 7,07 → CV ≈ 0,4714
    assert.ok(Math.abs((l.variacao ?? 0) - Math.SQRT2 / 3) < 1e-12);
    assert.equal(nivelVariacao(l.variacao), "atencao");
    assert.equal(nivelVariacao(0.25), "ok");
    assert.equal(nivelVariacao(0.5), "atencao");
    assert.equal(nivelVariacao(0.51), "alerta");
    assert.equal(nivelVariacao(null), null);
  });

  it("ordem pelo VALOR (maior primeiro) e curva ABC pela participação acumulada ANTES da linha", () => {
    const linhas = consolidarItens([
      item({ codigo: "10", valorTotal: 5 }),
      item({ codigo: "20", valorTotal: 70 }),
      item({ codigo: "30", valorTotal: 15 }),
      item({ codigo: "40", valorTotal: 6 }),
      item({ codigo: "50", valorTotal: 4 }),
      item({ codigo: "60", valorTotal: 0 }),
    ]);
    // Total 100: 20 (0% antes) A · 30 (70% antes — cruza os 80%, ainda A) · 40 (85%) B · 10 (91%) B · 50 (96%) C · 60 sem valor.
    assert.deepEqual(
      linhas.map((l) => [l.codigo, l.abc]),
      [
        ["20", "A"],
        ["30", "A"],
        ["40", "B"],
        ["10", "B"],
        ["50", "C"],
        ["60", null],
      ],
    );
    assert.equal(linhas[0].participacao, 0.7);
    assert.ok(Math.abs(linhas.reduce((s, l) => s + l.participacao, 0) - 1) < 1e-12);
  });

  it("total NEGATIVO fica fora da base da curva ABC (as participações somam 100%)", () => {
    const linhas = consolidarItens([
      item({ codigo: "1", valorTotal: 700 }),
      item({ codigo: "2", valorTotal: 200 }),
      item({ codigo: "3", valorTotal: 100 }),
      item({ codigo: "4", valorTotal: -200 }),
    ]);
    assert.deepEqual(
      linhas.map((l) => [l.codigo, l.abc, l.participacao]),
      [
        ["1", "A", 0.7],
        ["2", "A", 0.2],
        ["3", "B", 0.1],
        ["4", null, 0],
      ],
    );
  });

  it("empate de valor: pelo código; o sem código depois", () => {
    const linhas = consolidarItens([item({ codigo: null, valorTotal: 1 }), item({ codigo: "9", valorTotal: 1 }), item({ codigo: "1", valorTotal: 1 })]);
    assert.deepEqual(
      linhas.map((l) => l.codigo),
      ["1", "9", null],
    );
  });

  it("um código com 300 mil preços: mín./máx. sem estourar a pilha", () => {
    const muitos = Array.from({ length: 300_000 }, (_, i) => item({ codigo: "7", quantidade: 1, valorUnitario: 1 + (i % 1000), valorTotal: 1 + (i % 1000) }));
    const [l] = consolidarItens(muitos);
    assert.equal(l.valorMin, 1);
    assert.equal(l.valorMax, 1000);
    assert.equal(l.itens.length, 300_000);
  });

  it("escala: 20 mil itens em 2 mil códigos, linear", () => {
    const muitos = Array.from({ length: 20_000 }, (_, i) => item({ codigo: String(i % 2000), quantidade: 1, valorUnitario: 1 + (i % 7), valorTotal: 1 + (i % 7) }));
    const t0 = performance.now();
    const linhas = consolidarItens(muitos);
    assert.equal(linhas.length, 2000);
    assert.equal(
      linhas.reduce((s, l) => s + l.itens.length, 0),
      20_000,
    );
    assert.ok(performance.now() - t0 < 1500);
  });
});

describe("apoios da visão consolidada", () => {
  it("distintos: na ordem em que aparecem, sem vazios", () => {
    const itens = [item({ protocolo: "P-2" }), item({ protocolo: null }), item({ protocolo: "P-1" }), item({ protocolo: "P-2" }), item({ protocolo: "  " })];
    assert.deepEqual(
      distintos(itens, (i) => i.protocolo),
      ["P-2", "P-1"],
    );
  });

  it("variante da descrição: a MESMA chave da consolidação (1 = a mais frequente); sem descrição = 0", () => {
    const [l] = consolidarItens([item({ descricao: "Caneta azul" }), item({ descricao: "Caneta preta" }), item({ descricao: "caneta  PRETA" }), item({ descricao: null })]);
    const v = varianteDescricao(l.descricoes);
    assert.deepEqual(
      l.itens.map((it) => v(it.descricao)),
      [2, 1, 1, 0],
    );
    assert.equal(v("CANETA AZUL "), 2);
    assert.equal(v("outra"), 0);
    assert.equal(v("   "), 0);
  });

  it("desvio da média: fração; sem preço ou sem média = null", () => {
    assert.ok(Math.abs((desvioDaMedia(12, 10) ?? 0) - 0.2) < 1e-12);
    assert.ok(Math.abs((desvioDaMedia(8, 10) ?? 0) + 0.2) < 1e-12);
    assert.equal(desvioDaMedia(null, 10), null);
    assert.equal(desvioDaMedia(0, 10), null);
    assert.equal(desvioDaMedia(5, null), null);
  });

  it("textos do desvio e da participação: sinal só quando arredonda a algo; fatia mínima = '< 0,1%'", () => {
    const t = (s: string) => s.replace(/\u00a0/g, " ");
    assert.equal(t(desvioTexto(0.036)), "+3,6%");
    assert.equal(t(desvioTexto(-0.017)), "−1,7%");
    assert.equal(desvioTexto(0), "0%");
    assert.equal(desvioTexto(-0.0001), "0%");
    assert.equal(t(participacaoTexto(0.7)), "70%");
    assert.equal(participacaoTexto(0.0002), "< 0,1%");
    assert.equal(participacaoTexto(0), "0%");
  });

  it("resumo em texto pronto para colar (código, quantidade, média, faixa, total, origem)", () => {
    const [l] = consolidarItens([
      item({ codigo: "77", descricao: "Toner", unidade: "UN", quantidade: 10, valorUnitario: 5, valorTotal: 50 }),
      item({ codigo: "77", descricao: "TONER", unidade: "CX", quantidade: 30, valorUnitario: 9, valorTotal: 270 }),
    ]);
    const t = textoResumoConsolidado(l, { dfds: ["1201", "1243"], protocolos: ["P-1"] }).replace(/\u00a0/g, " ");
    assert.deepEqual(t.split("\n"), [
      "Código 77 — Toner",
      "Quantidade total: 40 UN + CX (unidades diferentes)",
      "Por unidade: UN 10 · médio R$ 5,00; CX 30 · médio R$ 9,00",
      "Valor unitário médio (ponderado, mistura unidades): R$ 8,00 · faixa R$ 5,00 a R$ 9,00",
      "Valor total: R$ 320,00 (100% do total · curva ABC: A)",
      "Itens: 2 em 2 DFD(s) — 1201, 1243 · protocolo(s) P-1",
    ]);
    // Uma unidade só: sem a linha "Por unidade" e com a variação.
    const [u] = consolidarItens([
      item({ codigo: "78", descricao: "Toner", quantidade: 10, valorUnitario: 5, valorTotal: 50 }),
      item({ codigo: "78", descricao: "Toner", quantidade: 30, valorUnitario: 9, valorTotal: 270 }),
    ]);
    assert.deepEqual(textoResumoConsolidado(u, { dfds: ["1201"], protocolos: [] }).replace(/\u00a0/g, " ").split("\n").slice(1, 3), [
      "Quantidade total: 40 UN",
      "Valor unitário médio (ponderado): R$ 8,00 · faixa R$ 5,00 a R$ 9,00 · variação 40,4%",
    ]);
  });

  it("estado agrupa o MESMO problema em vários itens, com a contagem; erros primeiro; filtro sem contagem", () => {
    const e = estadoConsolidado([
      [{ status: "erro", chave: "item.valorUnitario", texto: "Item sem valor unitário." }],
      [
        { status: "erro", chave: "item.valorUnitario", texto: "Item sem valor unitário." },
        { status: "atencao", chave: "item.duplicado", texto: "Item repetido — item 3.", cor: "#f59e0b" },
      ],
      [{ status: "erro", chave: "item.quantidade", texto: "Item sem quantidade." }],
      [],
    ]);
    assert.deepEqual(
      e.mensagens.map((m) => [m.status, m.rotulo]),
      [
        ["erro", "Item sem valor (2)"],
        ["erro", "Item sem quantidade"],
        ["atencao", "Item duplicado"],
      ],
    );
    assert.equal(e.mensagens[0].texto, "Item sem valor — 2 de 4 itens.");
    assert.equal(e.mensagens[2].cor, "#f59e0b");
    assert.deepEqual(e.rotulos, ["Item sem valor", "Item sem quantidade", "Item duplicado"]);
    assert.deepEqual(estadoConsolidado([[], []]), { mensagens: [], rotulos: [] });
  });
});
