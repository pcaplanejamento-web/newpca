import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  colunasDaTabela,
  corRgb,
  PALETA_PADRAO,
  entrelinha,
  faixasDeColunas,
  largurasColunas,
  montarLayoutPdf,
  nomeArquivoPdf,
  PAGINA_PDF,
  quebrarTexto,
  type TabelaPdf,
  textoParaPdf,
} from "../src/lib/exportar-pdf-core.ts";
import { tabelaParaPdf } from "../src/lib/exportar-tabela.ts";

// Medida aproximada (0,5 do tamanho por caractere; negrito 0,55) — o layout é testado sem a fonte real.
const medir = (t: string, tam: number, b?: boolean) => t.length * tam * (b ? 0.55 : 0.5);
const UTIL = PAGINA_PDF.largura - 2 * PAGINA_PDF.margem;

describe("exportar-pdf-core — quebra de texto", () => {
  it("quebra por palavra, sem perder nenhuma letra", () => {
    const linhas = quebrarTexto("AQUISIÇÃO DE CADEIRAS PARA AS ESCOLAS MUNICIPAIS", 60, 8, medir);
    assert.ok(linhas.length > 1);
    assert.equal(linhas.join(" "), "AQUISIÇÃO DE CADEIRAS PARA AS ESCOLAS MUNICIPAIS");
    for (const l of linhas) assert.ok(medir(l, 8) <= 60 || !l.includes(" "));
  });
  it("palavra maior que a coluna é partida por letra (nada é cortado)", () => {
    const p = "X".repeat(40);
    const linhas = quebrarTexto(p, 40, 8, medir);
    assert.equal(linhas.join(""), p);
    for (const l of linhas) assert.ok(medir(l, 8) <= 40);
  });
  it("o espaço inseparável não quebra (R$ e o número ficam juntos)", () => {
    assert.deepEqual(quebrarTexto("valor R$\u00a012,00", 40, 8, medir), ["valor", "R$\u00a012,00"]);
  });
  it("vazio vira uma linha vazia; quebras de linha do texto ficam", () => {
    assert.deepEqual(quebrarTexto("", 50, 8, medir), [""]);
    assert.deepEqual(quebrarTexto("A\nB", 500, 8, medir), ["A", "B"]);
  });
});

describe("exportar-pdf-core — larguras e páginas", () => {
  const t: TabelaPdf = {
    titulo: "Teste",
    cabecalho: ["Nº", "Descrição", "Valor"],
    linhas: Array.from({ length: 300 }, (_, i) => [String(i + 1), `Item de teste número ${i + 1} com uma descrição comprida o bastante`, "R$ 1.234,56"]),
    alinhar: ["left", "left", "right"],
  };
  it("as colunas ocupam a largura útil", () => {
    const l = largurasColunas(t, UTIL, 8, medir);
    assert.ok(l);
    assert.ok(Math.abs((l ?? []).reduce((s, x) => s + x, 0) - UTIL) < 0.5);
  });
  it("toda linha aparece UMA vez, na ordem, nas páginas; cada página cabe na folha", () => {
    const lay = montarLayoutPdf(t, medir);
    const todas = lay.paginas.flatMap((p) => p.linhas.map((l) => l.celulas[0].join("")));
    assert.deepEqual(todas, t.linhas.map((l) => l[0]));
    assert.ok(lay.paginas.length > 1);
    const util = PAGINA_PDF.altura - 2 * PAGINA_PDF.margem;
    for (const p of lay.paginas) assert.ok(p.linhas.reduce((s, l) => s + l.altura, 0) + lay.cabecalho.altura <= util);
  });
  it("uma linha mais alta que a página CONTINUA na seguinte (nada se perde)", () => {
    const enorme = Array.from({ length: 4000 }, (_, i) => `palavra${i}`).join(" ");
    const lay = montarLayoutPdf({ titulo: "x", cabecalho: ["A", "B"], linhas: [["1", enorme]] }, medir);
    assert.ok(lay.paginas.length > 1);
    const texto = lay.paginas.flatMap((p) => p.linhas.flatMap((l) => l.celulas[1])).join(" ");
    assert.equal(texto, enorme);
    assert.ok(entrelinha(lay.tamanho) > 0);
  });
  it("tabela larga: FAIXAS de colunas com as fixas repetidas; cabendo, uma faixa só", () => {
    assert.deepEqual(faixasDeColunas(t, 1, medir), [[0, 1, 2]]);
    const larga: TabelaPdf = { titulo: "x", cabecalho: ["Unidade", ...Array.from({ length: 80 }, (_, j) => `Coluna ${j + 1}`)], linhas: [["SME", ...Array.from({ length: 80 }, () => "R$ 1.000.000,00")]] };
    const faixas = faixasDeColunas(larga, 1, medir);
    assert.ok(faixas.length > 1);
    for (const f of faixas) assert.equal(f[0], 0, "a 1ª coluna se repete");
    assert.deepEqual([...new Set(faixas.flatMap((f) => f.slice(1)))].sort((a, b) => a - b), Array.from({ length: 80 }, (_, j) => j + 1));
    const parte = colunasDaTabela(larga, faixas[0]);
    assert.equal(parte.cabecalho.length, faixas[0].length);
  });
});

describe("exportar-pdf-core — texto e nome", () => {
  it("o que a fonte tem fica; símbolos fora viram o equivalente; o resto, '?'", () => {
    const winAnsi = (cp: number) => cp < 256 || [0x2014, 0x2013, 0x201c, 0x201d, 0x2026, 0x20ac].includes(cp);
    assert.equal(textoParaPdf("Ação ≥ 10 — “ok” → fim", winAnsi), "Ação >= 10 — “ok” -> fim");
    assert.equal(textoParaPdf("漢", winAnsi), "?");
    assert.equal(textoParaPdf("a\u202fb\tc", winAnsi), "a\u00a0b c", "inseparável vira NBSP; TAB vira espaço");
  });
  it("nome do arquivo seguro com a data", () => {
    assert.equal(nomeArquivoPdf("Mesa - Itens/2026", "2026-10-02"), "Mesa - Itens-2026 - 2026-10-02.pdf");
  });
  it("tabelaParaPdf: números formatados como na tela e alinhados à direita", () => {
    const r = tabelaParaPdf(
      [
        { cabecalho: "Nome", valor: (x: { n: string; v: number }) => x.n },
        { cabecalho: "Valor", numero: (x: { n: string; v: number }) => x.v, formatar: (n) => `R$ ${n}` },
      ],
      [{ n: "A", v: 10 }],
    );
    assert.deepEqual(r, { cabecalho: ["Nome", "Valor"], linhas: [["A", "R$ 10"]], alinhar: ["left", "right"], cores: [[null, null]] });
  });
  it("tabelaParaPdf: a cor da coluna (como na tela); sem ela, número negativo em vermelho", () => {
    const r = tabelaParaPdf(
      [
        { cabecalho: "Estado", valor: (x: { e: string; v: number }) => x.e, cor: (x: { e: string; v: number }) => (x.e === "Erro" ? "var(--danger)" : null) },
        { cabecalho: "Valor", numero: (x: { e: string; v: number }) => x.v },
      ],
      [
        { e: "Erro", v: 5 },
        { e: "Ok", v: -3 },
      ],
    );
    assert.deepEqual(r.cores, [
      ["var(--danger)", null],
      [null, "var(--danger)"],
    ]);
  });
  it("corRgb: hex, rgb() e var(--token) pela paleta; o resto, null", () => {
    assert.deepEqual(corRgb("#ffffff"), [1, 1, 1]);
    assert.deepEqual(corRgb("#000"), [0, 0, 0]);
    assert.deepEqual(corRgb("rgb(255, 0, 0)"), [1, 0, 0]);
    assert.deepEqual(corRgb("var(--danger)"), corRgb(PALETA_PADRAO.tokens.danger));
    assert.equal(corRgb("oklch(0.5 0.1 200)"), null);
    assert.equal(corRgb(null), null);
  });
});
