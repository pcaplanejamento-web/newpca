/**
 * EXPORTAR uma tabela em PDF — núcleo PURO (testado; sem pdf-lib): o LAYOUT das páginas. A4 deitado, o cabeçalho das
 * colunas repetido em cada página, as larguras pelo CONTEÚDO (cabem na página — a fonte diminui antes de cortar) e o
 * texto QUEBRADO por palavra dentro da célula (nada é cortado nem truncado: a linha alta continua na página seguinte).
 * A medida do texto entra INJETADA (`Medir` — a da fonte real no navegador, uma aproximada nos testes).
 */

export type Alinhamento = "left" | "center" | "right";

export type TabelaPdf = {
  titulo: string;
  /** A 2ª linha do topo (ex.: "128 linhas · filtros: Unidade, Estado"). */
  subtitulo?: string;
  cabecalho: string[];
  linhas: string[][];
  alinhar?: Alinhamento[];
};

/** Largura (pt) do texto no tamanho dado; `negrito` = a fonte do cabeçalho. */
export type Medir = (texto: string, tamanho: number, negrito?: boolean) => number;

/** A4 deitado (pt). */
export const PAGINA_PDF = { largura: 841.89, altura: 595.28, margem: 28 };
/** Topo (título + subtítulo) e rodapé (página/data) reservados em cada página. */
export const TOPO_PDF = 34;
export const RODAPE_PDF = 18;
export const PAD_H = 4;
export const PAD_V = 3;
/** Os tamanhos de fonte tentados, do maior ao menor, até as colunas caberem. */
export const TAMANHOS_PDF = [8, 7.5, 7, 6.5, 6, 5.5];
const MIN_COLUNA = 22;
/** Uma célula não "pede" mais que isto ao medir a largura natural (o resto quebra em linhas). */
const MAX_NATURAL = 260;

export const entrelinha = (tamanho: number) => tamanho * 1.22;

/** Espaços que QUEBRAM a linha — o espaço inseparável (o de "R$ 1.234,56") não: o valor nunca se parte. */
const ESPACOS = /[ \t\r\f\v]+/;

/** Quebra o texto em linhas que cabem em `largura` (por palavra; a palavra maior que a largura é partida por letra). */
export function quebrarTexto(texto: string, largura: number, tamanho: number, medir: Medir, negrito = false): string[] {
  const out: string[] = [];
  for (const paragrafo of String(texto ?? "").split("\n")) {
    const palavras = paragrafo.split(ESPACOS).filter(Boolean);
    if (palavras.length === 0) {
      out.push("");
      continue;
    }
    let atual = "";
    for (const p0 of palavras) {
      let p = p0;
      // Palavra maior que a coluna: parte por letra.
      while (medir(p, tamanho, negrito) > largura && p.length > 1) {
        if (atual) {
          out.push(atual);
          atual = "";
        }
        let n = p.length - 1;
        while (n > 1 && medir(p.slice(0, n), tamanho, negrito) > largura) n--;
        out.push(p.slice(0, n));
        p = p.slice(n);
      }
      const tentativa = atual ? `${atual} ${p}` : p;
      if (medir(tentativa, tamanho, negrito) <= largura) atual = tentativa;
      else {
        if (atual) out.push(atual);
        atual = p;
      }
    }
    out.push(atual);
  }
  return out.length ? out : [""];
}

/** A maior palavra do texto (a largura mínima que a coluna precisa para não partir palavras). */
function maiorPalavra(texto: string, tamanho: number, medir: Medir, negrito = false): number {
  let m = 0;
  for (const p of String(texto ?? "").split(/[ \t\r\f\v\n]+/)) if (p) m = Math.max(m, medir(p, tamanho, negrito));
  return m;
}

/** Por coluna, a largura NATURAL (o maior texto, até `MAX_NATURAL`) e a MÍNIMA (a maior palavra) — com o respiro. */
function medidasColunas(t: TabelaPdf, tamanho: number, medir: Medir): { natural: number[]; minimo: number[] } {
  const natural: number[] = [];
  const minimo: number[] = [];
  for (let j = 0; j < t.cabecalho.length; j++) {
    let nat = medir(t.cabecalho[j] ?? "", tamanho, true);
    let min = maiorPalavra(t.cabecalho[j] ?? "", tamanho, medir, true);
    for (const l of t.linhas) {
      const v = l[j] ?? "";
      if (!v) continue;
      nat = Math.max(nat, Math.min(MAX_NATURAL, medir(v, tamanho)));
      min = Math.max(min, Math.min(MAX_NATURAL, maiorPalavra(v, tamanho, medir)));
    }
    natural.push(Math.max(MIN_COLUNA, nat + 2 * PAD_H));
    minimo.push(Math.max(MIN_COLUNA, min + 2 * PAD_H));
  }
  return { natural, minimo };
}

/**
 * As LARGURAS das colunas num tamanho de fonte, ou `null` quando nem as menores palavras cabem. Cada coluna pede a sua
 * largura natural (o maior texto, até `MAX_NATURAL`); sobrando espaço, todas crescem na proporção; faltando, as que
 * pedem mais que a parte justa encolhem (quebrando linhas), nunca abaixo da maior palavra delas.
 */
export function largurasColunas(t: TabelaPdf, util: number, tamanho: number, medir: Medir): number[] | null {
  const n = t.cabecalho.length;
  if (n === 0) return [];
  const { natural, minimo } = medidasColunas(t, tamanho, medir);
  const somaMin = minimo.reduce((s, x) => s + x, 0);
  if (somaMin > util + 0.01) return null;
  const somaNat = natural.reduce((s, x) => s + x, 0);
  if (somaNat <= util) return natural.map((x) => (x / somaNat) * util);
  // Encolhe as que pedem mais: as "justas" ficam com o natural; o resto do espaço vai às demais, na proporção.
  const larg = [...natural];
  const livres = new Set(larg.map((_, j) => j));
  for (let volta = 0; volta < n; volta++) {
    const fixo = larg.reduce((s, x, j) => (livres.has(j) ? s : s + x), 0);
    const resto = util - fixo;
    const pedem = [...livres].reduce((s, j) => s + natural[j], 0);
    let mudou = false;
    for (const j of livres) {
      const parte = (natural[j] / pedem) * resto;
      if (parte < minimo[j]) {
        larg[j] = minimo[j];
        livres.delete(j);
        mudou = true;
      }
    }
    if (!mudou) {
      for (const j of livres) larg[j] = (natural[j] / pedem) * resto;
      break;
    }
  }
  return larg;
}

/** Tamanho de fonte de referência para decidir as FAIXAS de colunas (legível no papel). */
export const TAMANHO_FAIXA = 6.5;

/**
 * TABELA LARGA DEMAIS para uma página (ex.: a tabela cruzada com dezenas de colunas): as colunas em FAIXAS que cabem
 * no tamanho de referência, cada uma com as `fixas` primeiras colunas repetidas (o nome da linha, a sigla, o total) —
 * a mesma linha se lê em todas as faixas. Cabendo tudo, uma faixa só (todas as colunas).
 */
export function faixasDeColunas(t: TabelaPdf, fixas: number, medir: Medir): number[][] {
  const n = t.cabecalho.length;
  const todas = Array.from({ length: n }, (_, j) => j);
  const util = PAGINA_PDF.largura - 2 * PAGINA_PDF.margem;
  const { minimo } = medidasColunas(t, TAMANHO_FAIXA, medir);
  if (minimo.reduce((s, x) => s + x, 0) <= util) return [todas];
  let f = Math.max(0, Math.min(fixas, n - 1));
  // As fixas não podem ocupar a página inteira: sobra ao menos ~1/3 para as demais.
  while (f > 0 && minimo.slice(0, f).reduce((s, x) => s + x, 0) > util * 0.66) f--;
  const base = todas.slice(0, f);
  const largBase = base.reduce((s, j) => s + minimo[j], 0);
  const faixas: number[][] = [];
  let atual: number[] = [];
  let larg = largBase;
  for (let j = f; j < n; j++) {
    if (atual.length > 0 && larg + minimo[j] > util) {
      faixas.push([...base, ...atual]);
      atual = [];
      larg = largBase;
    }
    atual.push(j);
    larg += minimo[j];
  }
  if (atual.length) faixas.push([...base, ...atual]);
  return faixas;
}

/** A tabela só com as colunas dadas (uma faixa). */
export function colunasDaTabela(t: TabelaPdf, cols: number[]): TabelaPdf {
  return {
    ...t,
    cabecalho: cols.map((j) => t.cabecalho[j] ?? ""),
    linhas: t.linhas.map((l) => cols.map((j) => l[j] ?? "")),
    alinhar: t.alinhar ? cols.map((j) => t.alinhar?.[j] ?? "left") : undefined,
  };
}

export type LinhaLayout = { celulas: string[][]; altura: number; cabecalho?: boolean };
export type PaginaLayout = { linhas: LinhaLayout[] };
export type LayoutPdf = { tamanho: number; larguras: number[]; cabecalho: LinhaLayout; paginas: PaginaLayout[] };

/**
 * O LAYOUT completo: escolhe o maior tamanho de fonte em que as colunas cabem, quebra cada célula e distribui as linhas
 * nas páginas (o cabeçalho das colunas no topo de cada uma). Uma linha mais alta que a página CONTINUA na seguinte —
 * nenhuma informação é perdida.
 */
export function montarLayoutPdf(t: TabelaPdf, medir: Medir): LayoutPdf {
  const util = PAGINA_PDF.largura - 2 * PAGINA_PDF.margem;
  let tamanho = TAMANHOS_PDF[TAMANHOS_PDF.length - 1];
  let larguras: number[] | null = null;
  for (const tam of TAMANHOS_PDF) {
    larguras = largurasColunas(t, util, tam, medir);
    if (larguras) {
      tamanho = tam;
      break;
    }
  }
  // Nem no menor tamanho as palavras cabem inteiras: largura igual para todas (as palavras longas partem por letra).
  if (!larguras) larguras = t.cabecalho.map(() => util / Math.max(1, t.cabecalho.length));
  const lh = entrelinha(tamanho);
  const celulasDe = (valores: string[], negrito: boolean) =>
    larguras.map((w, j) => quebrarTexto(valores[j] ?? "", Math.max(4, w - 2 * PAD_H), tamanho, medir, negrito));
  const alturaDe = (cel: string[][]) => Math.max(1, ...cel.map((c) => c.length)) * lh + 2 * PAD_V;
  const cabCel = celulasDe(t.cabecalho, true);
  const cabecalho: LinhaLayout = { celulas: cabCel, altura: alturaDe(cabCel), cabecalho: true };
  const corpo = PAGINA_PDF.altura - 2 * PAGINA_PDF.margem - TOPO_PDF - RODAPE_PDF - cabecalho.altura;

  const paginas: PaginaLayout[] = [{ linhas: [] }];
  let livre = corpo;
  const novaPagina = () => {
    paginas.push({ linhas: [] });
    livre = corpo;
  };
  for (const valores of t.linhas) {
    let cel = celulasDe(valores, false);
    for (;;) {
      const altura = alturaDe(cel);
      if (altura <= livre) {
        paginas[paginas.length - 1].linhas.push({ celulas: cel, altura });
        livre -= altura;
        break;
      }
      // Não cabe no resto da página: vai inteira para a próxima (se couber numa página), senão parte em duas.
      const cabe = Math.floor((livre - 2 * PAD_V) / lh);
      if (altura <= corpo && paginas[paginas.length - 1].linhas.length > 0) {
        novaPagina();
        continue;
      }
      if (cabe < 1) {
        novaPagina();
        continue;
      }
      const parte = cel.map((c) => c.slice(0, cabe));
      paginas[paginas.length - 1].linhas.push({ celulas: parte, altura: alturaDe(parte) });
      cel = cel.map((c) => c.slice(cabe));
      novaPagina();
    }
  }
  return { tamanho, larguras, cabecalho, paginas };
}

/** Pontuação/símbolos fora do WinAnsi (as fontes padrão do PDF) trocados pelo equivalente legível. */
const TROCAS: Record<string, string> = {
  "≥": ">=",
  "≤": "<=",
  "≠": "!=",
  "≈": "~",
  "→": "->",
  "←": "<-",
  "↑": "^",
  "↓": "v",
  "✓": "v",
  "✔": "v",
  "✗": "x",
  "Δ": "D",
  "Ω": "Ohm",
  "µ": "u",
  "−": "-",
  "‐": "-",
  "‑": "-",
  "′": "'",
  "″": '"',
  "√": "raiz",
  "⧫": "-",
  "●": "-",
  "■": "-",
  "▪": "-",
  "◆": "-",
};

/**
 * O texto na codificação das fontes padrão do PDF: o que a fonte tem fica como está (acentos do português incluídos);
 * o que não tem vira o equivalente (`TROCAS`), a letra sem o acento (NFKD) ou "?" — o PDF nunca falha por um caractere.
 */
export function textoParaPdf(texto: string, suportado: (cp: number) => boolean): string {
  let out = "";
  // Os espaços inseparáveis (o "R$ 1.234,56" do Intl) viram o NBSP das fontes do PDF — o valor não se parte.
  for (const ch of String(texto ?? "").replace(/[\u2007\u202f]/g, "\u00a0").replace(/\t/g, " ")) {
    const cp = ch.codePointAt(0) ?? 63;
    if (ch === "\n" || suportado(cp)) {
      out += ch;
      continue;
    }
    const troca = TROCAS[ch];
    if (troca) {
      out += troca;
      continue;
    }
    const base = ch.normalize("NFKD").replace(/\p{M}/gu, "");
    out += base && [...base].every((c) => suportado(c.codePointAt(0) ?? 0)) ? base : "?";
  }
  return out;
}

/** O nome do arquivo: "<nome> - AAAA-MM-DD.pdf", sem caracteres que o sistema de arquivos recusa. */
export function nomeArquivoPdf(nome: string, hojeIso: string): string {
  const base = nome.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "tabela";
  return `${base} - ${hojeIso}.pdf`;
}
