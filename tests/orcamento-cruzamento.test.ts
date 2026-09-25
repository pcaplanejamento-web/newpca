import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { salvarPreferenciaSchema } from "../src/lib/preferencias-validation.ts";
import {
  COL_EXTRA,
  COL_ROTULO,
  COL_TOTAL,
  colunasNaOrdem,
  chaveLayoutComparativo,
  coerceLayout,
  colunaPermitida,
  cruzar,
  LARGURA_MAX,
  LARGURA_MIN,
  LAYOUT_PADRAO,
  lancamentosDoRecorte,
  layoutIgual,
  MAX_COLUNAS_CRUZAMENTO,
  matrizCruzamento,
  medidaOrcamento,
  ordemDasColunas,
  ordenarLinhas,
  percentual,
  permissoesColunas,
  permissoesLinhas,
  semVazios,
  soltarColuna,
} from "../src/lib/orcamento-cruzamento.ts";

const V = { valorEmendaImpositiva: 0, valorSuplementacao: 0, valorEmpenho: 0, saldo: 0, valorAnulacao: 0 };
const L = [
  { ...V, unidade: "10 - SEMUS", nomeElemento: "DIÁRIAS", codigoElemento: "339014", valorInicial: 100 },
  { ...V, unidade: "10 - SEMUS", nomeElemento: "AUXÍLIOS", codigoElemento: "339048", valorInicial: 50, valorSuplementacao: 20, valorAnulacao: 5 },
  { ...V, unidade: "2 - SEMED", nomeElemento: "Diárias", codigoElemento: "339014", valorInicial: 30 },
  { ...V, unidade: "2 - SEMED", nomeElemento: "OBRAS", codigoElemento: "449051", valorInicial: 0 },
  { ...V, unidade: null, nomeElemento: "DIÁRIAS", codigoElemento: "339014", valorInicial: 7 },
];

describe("orcamento-cruzamento", () => {
  it("cruza linhas × colunas (ordem natural, chave sem caixa/acento, vazio = —) e fecha os totais", () => {
    const c = cruzar(L, "unidade", "nomeElemento", "inicial");
    assert.deepEqual(
      c.linhas.map((l) => l.rotulo),
      ["—", "2 - SEMED", "10 - SEMUS"],
    );
    assert.deepEqual(
      c.colunas.map((x) => x.rotulo),
      ["AUXÍLIOS", "DIÁRIAS", "OBRAS"],
    );
    const semus = c.linhas.find((l) => l.rotulo === "10 - SEMUS");
    assert.deepEqual(semus?.valores, [50, 100, 0]);
    assert.equal(c.linhas.find((l) => l.rotulo === "2 - SEMED")?.valores[1], 30, "Diárias = DIÁRIAS");
    assert.equal(c.total, 187);
    assert.equal(
      c.colunas.reduce((s, x) => s + x.total, 0),
      c.total,
    );
    assert.equal(
      c.linhas.reduce((s, x) => s + x.total, 0),
      c.total,
    );
  });

  it("medida atualizada = inicial + suplementação − anulação", () => {
    assert.equal(medidaOrcamento("atualizada").valor(L[1]), 65);
    assert.equal(cruzar(L, "unidade", "nomeElemento", "atualizada").total, 202);
  });

  it("colunas PERMITIDAS: não a mesma, com dados, até o teto e não 1 para 1", () => {
    const p = permissoesColunas(L, "nomeElemento");
    assert.equal(p.nomeElemento.permitida, false);
    assert.match(p.codigoElemento.motivo ?? "", /1 para 1/);
    assert.equal(p.unidade.permitida, true);
    assert.equal(p.funcao.permitida, false, "sem dados neste orçamento");
    assert.equal(permissoesLinhas(L).funcao.permitida, false);
    const muitos = Array.from({ length: MAX_COLUNAS_CRUZAMENTO + 1 }, (_, i) => ({ ...V, valorInicial: 1, ficha: String(i), unidade: i % 2 ? "A" : "B" }));
    assert.equal(permissoesColunas(muitos, "unidade").ficha.permitida, false);
    assert.equal(colunaPermitida(p, "codigoElemento"), "unidade");
    assert.equal(colunaPermitida(p, "unidade"), "unidade");
  });

  it("origem de cada número: a soma do recorte = a célula / linha / coluna / total", () => {
    const c = cruzar(L, "unidade", "nomeElemento", "inicial");
    const soma = (ls: typeof L) => ls.reduce((s, l) => s + l.valorInicial, 0);
    for (const linha of c.linhas) {
      assert.equal(soma(lancamentosDoRecorte(L, "unidade", "nomeElemento", linha.chave, null)), linha.total);
      c.colunas.forEach((col, j) => {
        assert.equal(soma(lancamentosDoRecorte(L, "unidade", "nomeElemento", linha.chave, col.chave)), linha.valores[j]);
      });
    }
    assert.equal(soma(lancamentosDoRecorte(L, "unidade", "nomeElemento", null, null)), c.total);
  });

  it("sem vazios tira linhas/colunas todas zeradas; ordenação por total e por coluna", () => {
    const c = semVazios(cruzar(L, "unidade", "nomeElemento", "inicial"));
    assert.deepEqual(
      c.colunas.map((x) => x.rotulo),
      ["AUXÍLIOS", "DIÁRIAS"],
    );
    assert.ok(c.linhas.every((l) => l.valores.length === 2));
    assert.deepEqual(
      ordenarLinhas(c, { por: "total", desc: true }).map((l) => l.rotulo),
      ["10 - SEMUS", "2 - SEMED", "—"],
    );
    const diarias = c.colunas[1].chave;
    assert.deepEqual(
      ordenarLinhas(c, { por: { coluna: diarias }, desc: false }).map((l) => l.rotulo),
      ["—", "2 - SEMED", "10 - SEMUS"],
    );
  });

  it("percentuais e matriz de exportação", () => {
    assert.equal(percentual(25, 100), 25);
    assert.equal(percentual(5, 0), null);
    const c = cruzar(L, "unidade", "nomeElemento", "inicial");
    const m = matrizCruzamento(c, c.linhas, "Unidade", { rotulo: "Sigla", de: (k) => (k.includes("SEMUS") ? "SMS" : "") });
    assert.deepEqual(m[0], ["Unidade", "Sigla", "Total", "AUXÍLIOS", "DIÁRIAS", "OBRAS"]);
    assert.deepEqual(m.at(-1), ["TOTAL", "", 187, 50, 137, 0]);
  });

  it("colunas na ordem dada (as ausentes saem) — os valores das linhas acompanham e o total não muda", () => {
    const c = cruzar(L, "unidade", "nomeElemento", "inicial");
    const [aux, dia] = c.colunas.map((x) => x.chave);
    const r = colunasNaOrdem(c, [dia, aux]);
    assert.deepEqual(
      r.colunas.map((x) => x.rotulo),
      ["DIÁRIAS", "AUXÍLIOS"],
    );
    assert.deepEqual(r.linhas.find((l) => l.rotulo === "10 - SEMUS")?.valores, [100, 50]);
    assert.equal(r.total, c.total, "ocultar não muda o total");
  });

  it("ordem exibida: congeladas na ordem delas + livres pela manual, o resto na ordem padrão", () => {
    const padrao = [COL_ROTULO, COL_EXTRA, COL_TOTAL, "a", "b", "c"];
    assert.deepEqual(ordemDasColunas(padrao, LAYOUT_PADRAO.fixadas, []), { fixadas: [COL_ROTULO, COL_EXTRA, COL_TOTAL], livres: ["a", "b", "c"] });
    assert.deepEqual(ordemDasColunas(padrao, ["b", COL_ROTULO, "sumiu"], ["c", COL_TOTAL]), {
      fixadas: ["b", COL_ROTULO],
      livres: ["c", COL_TOTAL, COL_EXTRA, "a"],
    });
  });

  it("ordem das linhas pela coluna EXTRA (sigla): vazios no fim", () => {
    const c = cruzar(L, "unidade", "nomeElemento", "inicial");
    const sigla: Record<string, string> = { "10 - SEMUS": "SMS", "2 - SEMED": "SME" };
    const ordem = ordenarLinhas(c, { por: "extra", desc: false }, (k) => sigla[k] ?? "");
    assert.deepEqual(
      ordem.map((l) => l.rotulo),
      ["2 - SEMED", "10 - SEMUS", "—"],
    );
    assert.deepEqual(
      ordenarLinhas(c, { por: "extra", desc: true }, (k) => sigla[k] ?? "").map((l) => l.rotulo),
      ["10 - SEMUS", "2 - SEMED", "—"],
    );
  });

  it("layout salvo: normaliza qualquer JSON e compara pelo conteúdo", () => {
    assert.deepEqual(coerceLayout(undefined), LAYOUT_PADRAO);
    assert.deepEqual(coerceLayout("lixo"), LAYOUT_PADRAO);
    const l = coerceLayout({
      larguras: { b: 10, a: 9999, x: "20" },
      fixadas: ["c1", "c1", 3],
      ocultas: [COL_TOTAL],
      ordemLinhas: { por: { coluna: "c1" }, desc: true },
      ordemColunas: "manual",
      ordemManual: ["c2"],
      extra: 1,
    });
    assert.deepEqual(l.larguras, { a: LARGURA_MAX, b: LARGURA_MIN });
    assert.deepEqual(l.fixadas, [COL_ROTULO, COL_EXTRA, COL_TOTAL, "c1"], "formato antigo: rótulo, Sigla e Total congelados + as de antes");
    assert.deepEqual(l.ordemLinhas, { por: { coluna: "c1" }, desc: true });
    assert.deepEqual(l.ordemManual, ["c2"]);
    assert.deepEqual(coerceLayout({ ordemColunas: "total-desc", ordemManual: ["x"] }).ordemManual, [], "ordem antiga não manual = padrão");
    assert.deepEqual(coerceLayout({ v: 2, fixadas: [], ocultas: [COL_ROTULO, "a"] }).fixadas, [], "formato atual: vale o que está salvo");
    assert.deepEqual(coerceLayout({ v: 2, ocultas: [COL_ROTULO, "a"] }).ocultas, ["a"], "o rótulo nunca é ocultado");
    assert.ok(layoutIgual({ ...l, larguras: { b: 56, a: 640 } }, l), "a ordem das chaves não importa");
    assert.ok(!layoutIgual(l, LAYOUT_PADRAO));
    assert.equal(chaveLayoutComparativo("unidade", "fonte"), "orcamento-comparativo:unidade:fonte");
  });

  it("preferência: chave segura e valor com teto", () => {
    assert.ok(salvarPreferenciaSchema.safeParse({ chave: "orcamento-comparativo:unidade:fonte", valor: LAYOUT_PADRAO }).success);
    assert.ok(!salvarPreferenciaSchema.safeParse({ chave: "a b/../", valor: {} }).success);
    assert.ok(!salvarPreferenciaSchema.safeParse({ chave: "x", valor: { g: "a".repeat(40_000) } }).success);
    assert.ok(!salvarPreferenciaSchema.safeParse({ chave: "x", valor: [1] }).success);
  });

  it("arrastar: soltar entre as congeladas CONGELA, depois delas SOLTA, na divisa mantém", () => {
    // congeladas [a, b] | livres [c, d]
    assert.deepEqual(soltarColuna(["a", "b"], ["c", "d"], "d", 1), { fixadas: ["a", "d", "b"], livres: ["c"] });
    assert.deepEqual(soltarColuna(["a", "b"], ["c", "d"], "a", 3), { fixadas: ["b"], livres: ["c", "d", "a"] });
    assert.deepEqual(soltarColuna(["a", "b"], ["c", "d"], "b", 1), { fixadas: ["a", "b"], livres: ["c", "d"] }, "divisa: segue congelada");
    assert.deepEqual(soltarColuna(["a", "b"], ["c", "d"], "c", 2), { fixadas: ["a", "b"], livres: ["c", "d"] }, "divisa: segue livre");
    assert.deepEqual(soltarColuna([], ["c", "d", "e"], "e", 0), { fixadas: [], livres: ["e", "c", "d"] }, "sem congeladas: só reordena");
    assert.deepEqual(soltarColuna(["a"], ["c"], "c", 99), { fixadas: ["a"], livres: ["c"] }, "destino fora do fim = fim");
  });

  it("formato antigo: Sigla/Total SOLTAS saem das congeladas; calor e zerados", () => {
    const l = coerceLayout({ ordemColunas: "manual", ordemManual: ["o"], soltas: [COL_TOTAL, "x"], calor: true, zerados: false });
    assert.deepEqual(l.fixadas, [COL_ROTULO, COL_EXTRA]);
    assert.deepEqual(l.ordemManual, ["o"]);
    assert.equal(l.calor, true);
    assert.equal(l.zerados, false);
    assert.equal(LAYOUT_PADRAO.zerados, true, "o padrão oculta os zerados");
    assert.ok(layoutIgual(coerceLayout(l), l), "o convertido é estável");
  });
});
