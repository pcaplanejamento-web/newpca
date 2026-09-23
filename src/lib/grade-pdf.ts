/**
 * GRADE DESENHADA de uma tabela em PDF — núcleo PURO (sem pdf.js/DOM; testável no Node).
 *
 * O DFD emitido pelo Centi desenha CADA célula da tabela de itens como um retângulo vetorial (borda + zebra).
 * Essas bordas dizem, sem adivinhação, onde começa e termina cada COLUNA (x) e cada LINHA da tabela (y): cada
 * trecho de texto (nº, código, descrição, unidade, valores) cai na célula certa — mesmo com descrição de
 * dezenas de linhas, linha em branco no meio, código quebrado em 2 linhas ou célula que atravessa a página.
 *  - `tracosDaOpList`: os traços RETOS (horizontais/verticais) desenhados na página (operator list do pdf.js);
 *  - `montarGrade`: as COLUNAS pelas bordas verticais em volta dos RÓTULOS do cabeçalho + as LINHAS da tabela
 *    por página (faixas entre bordas horizontais que atravessam as colunas-guia, fechadas pelas divisórias);
 *  - `colunaDe`/`linhaDe`: a coluna e a linha de um ponto.
 * PDF sem bordas (outro emissor, fixture) ⇒ `null`, e o parser segue pela geometria do texto.
 */

/** Traço reto desenhado na página, em coordenadas do PDF (as mesmas dos trechos de texto): horizontal (`o:"h"`,
 * na altura `c`, de x=`a` a x=`b`) ou vertical (`o:"v"`, na posição x=`c`, de y=`a` a y=`b`). */
export type PdfTraco = { page: number; o: "h" | "v"; c: number; a: number; b: number };

/** Códigos do `OPS` do pdf.js usados (injetados — o núcleo não importa o pdf.js). */
export type OpsGrade = {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  constructPath: number;
  endPath: number;
};

export type ColunaGrade<K extends string = string> = { key: K; x0: number; x1: number };
/** Uma LINHA da tabela numa página: a faixa entre duas bordas horizontais (topo > base). */
export type LinhaGrade = { topo: number; base: number };
export type Grade<K extends string = string> = {
  /** Colunas reconhecidas, da esquerda para a direita. */
  colunas: ColunaGrade<K>[];
  /** Por página: as linhas da tabela, do topo para a base. */
  linhas: Map<number, LinhaGrade[]>;
};

const RETO = 0.5; // desvio máximo (pt) para um segmento contar como horizontal/vertical
const MIN_TRACO = 0.5; // comprimento mínimo (pt) de um traço
const JUNTA = 1.5; // bordas mais próximas que isto são a MESMA (borda + zebra, traço duplo)
const COBERTURA = 0.6; // fração mínima de uma coluna/linha que a borda precisa cobrir

type Matriz = number[];
const mul = (a: Matriz, b: Matriz): Matriz => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const ehMatriz = (m: unknown): m is ArrayLike<number> =>
  m != null && typeof m === "object" && (m as ArrayLike<number>).length === 6 && typeof (m as ArrayLike<number>)[0] === "number";

/**
 * Traços RETOS desenhados numa página, a partir do operator list do pdf.js (`fnArray`/`argsArray`), rastreando a
 * CTM (save/restore/transform + a matriz dos Form XObjects). Curvas e caminhos só de recorte (clip) ficam de
 * fora. Retângulos viram as 4 bordas. Puro.
 */
export function tracosDaOpList(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: OpsGrade, page: number): PdfTraco[] {
  let ctm: Matriz = [1, 0, 0, 1, 0, 0];
  const pilha: Matriz[] = [];
  const out: PdfTraco[] = [];
  const ponto = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const segmento = (p: [number, number], q: [number, number]) => {
    const dx = Math.abs(p[0] - q[0]);
    const dy = Math.abs(p[1] - q[1]);
    if (dy <= RETO && dx >= MIN_TRACO) out.push({ page, o: "h", c: (p[1] + q[1]) / 2, a: Math.min(p[0], q[0]), b: Math.max(p[0], q[0]) });
    else if (dx <= RETO && dy >= MIN_TRACO) out.push({ page, o: "v", c: (p[0] + q[0]) / 2, a: Math.min(p[1], q[1]), b: Math.max(p[1], q[1]) });
  };
  for (let i = 0; i < fnArray.length; i++) {
    const f = fnArray[i];
    const args = argsArray[i];
    if (f === ops.save) pilha.push(ctm.slice());
    else if (f === ops.restore) ctm = pilha.pop() ?? ctm;
    else if (f === ops.transform) {
      if (ehMatriz(args)) ctm = mul(ctm, Array.from(args));
    } else if (f === ops.paintFormXObjectBegin) {
      pilha.push(ctm.slice());
      const m = (args as unknown[] | undefined)?.[0];
      if (ehMatriz(m)) ctm = mul(ctm, Array.from(m));
    } else if (f === ops.paintFormXObjectEnd) ctm = pilha.pop() ?? ctm;
    else if (f === ops.constructPath) {
      // pdf.js ≥ 5: [operador de pintura, [Float32Array do caminho], minMax]; comandos 0 moveTo · 1 lineTo ·
      // 2 curveTo (6 números) · 3 quadraticCurveTo (4) · 4 closePath.
      const [pintura, buf] = (args ?? []) as [number, (ArrayLike<number> | null)[] | undefined];
      if (pintura === ops.endPath) continue; // só recorte: não é desenho
      const d = buf?.[0];
      if (!d) continue;
      let inicio: [number, number] | null = null;
      let atual: [number, number] | null = null;
      for (let k = 0; k < d.length; ) {
        const cmd = d[k];
        if (cmd === 0) {
          inicio = atual = ponto(d[k + 1], d[k + 2]);
          k += 3;
        } else if (cmd === 1) {
          const p = ponto(d[k + 1], d[k + 2]);
          if (atual) segmento(atual, p);
          atual = p;
          k += 3;
        } else if (cmd === 2) {
          atual = ponto(d[k + 5], d[k + 6]);
          k += 7;
        } else if (cmd === 3) {
          atual = ponto(d[k + 3], d[k + 4]);
          k += 5;
        } else if (cmd === 4) {
          if (atual && inicio) segmento(atual, inicio);
          atual = inicio;
          k += 1;
        } else break; // comando desconhecido: abandona o caminho (nunca lê lixo)
      }
    }
  }
  return out;
}

/** Agrupa traços paralelos à mesma distância (≤ `JUNTA`): cada grupo = uma borda (posição média). */
function agruparTracos(ts: PdfTraco[]): { c: number; ts: PdfTraco[] }[] {
  const ord = [...ts].sort((p, q) => p.c - q.c);
  const grupos: { c: number; ts: PdfTraco[] }[] = [];
  for (const t of ord) {
    const g = grupos[grupos.length - 1];
    if (g && t.c - g.ts[g.ts.length - 1].c <= JUNTA) g.ts.push(t);
    else grupos.push({ c: t.c, ts: [t] });
  }
  for (const g of grupos) g.c = g.ts.reduce((s, t) => s + t.c, 0) / g.ts.length;
  return grupos;
}

/** Fração do intervalo [lo, hi] coberta pela união dos traços. */
function cobertura(ts: PdfTraco[], lo: number, hi: number): number {
  if (hi <= lo) return 0;
  const iv = ts
    .map((t) => [Math.max(t.a, lo), Math.min(t.b, hi)] as const)
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  let tot = 0;
  let fim = lo;
  for (const [a, b] of iv) {
    if (b <= fim) continue;
    tot += b - Math.max(a, fim);
    fim = b;
  }
  return tot / (hi - lo);
}

/**
 * Monta a GRADE da tabela: as colunas (bordas verticais em volta de cada RÓTULO do cabeçalho, na página do
 * cabeçalho) e, por página, as LINHAS (faixas entre bordas horizontais que cobrem as colunas `guias` e são
 * fechadas pelas divisórias verticais dessas colunas). `null` se faltar alguma coluna `obrigatorias`, se as
 * colunas se sobrepuserem ou se nenhuma página tiver linhas — aí o parser usa a geometria do texto. Puro.
 */
export function montarGrade<K extends string>(
  tracos: PdfTraco[],
  rotulos: { key: K; x: number; y: number; page: number }[],
  obrigatorias: K[],
  guias: [K, K],
): Grade<K> | null {
  if (tracos.length === 0 || rotulos.length === 0) return null;
  const pagCab = rotulos[0].page;
  const yLo = Math.min(...rotulos.map((r) => r.y)) - 2;
  const yHi = Math.max(...rotulos.map((r) => r.y)) + 6;
  const xs = agruparTracos(tracos.filter((t) => t.page === pagCab && t.o === "v" && t.a <= yHi && t.b >= yLo)).map((g) => g.c);
  if (xs.length < 2) return null;
  const colunas: ColunaGrade<K>[] = [];
  for (const r of rotulos) {
    if (colunas.some((c) => c.key === r.key)) continue;
    let x0: number | null = null;
    let x1: number | null = null;
    for (const x of xs) {
      if (x <= r.x + 0.5) x0 = x;
      else if (x1 == null && x > r.x + 1.5) x1 = x;
    }
    if (x0 != null && x1 != null && x1 - x0 >= 6) colunas.push({ key: r.key, x0, x1 });
  }
  colunas.sort((p, q) => p.x0 - q.x0);
  for (let i = 1; i < colunas.length; i++) if (colunas[i].x0 < colunas[i - 1].x1 - 1) return null; // sobrepostas
  if (!obrigatorias.every((k) => colunas.some((c) => c.key === k))) return null;
  const g0 = colunas.find((c) => c.key === guias[0]);
  const g1 = colunas.find((c) => c.key === guias[1]);
  if (!g0 || !g1) return null;

  const porPagina = new Map<number, { hs: PdfTraco[]; vs: PdfTraco[] }>();
  for (const t of tracos) {
    let p = porPagina.get(t.page);
    if (!p) {
      p = { hs: [], vs: [] };
      porPagina.set(t.page, p);
    }
    (t.o === "h" ? p.hs : p.vs).push(t);
  }
  const linhas = new Map<number, LinhaGrade[]>();
  for (const [page, p] of porPagina) {
    const hs = p.hs;
    const vs = agruparTracos(p.vs);
    // Bordas horizontais que atravessam as DUAS colunas-guia (uma borda de linha da tabela cruza todas as colunas).
    const bordas = agruparTracos(hs)
      .filter((g) => cobertura(g.ts, g0.x0, g0.x1) >= COBERTURA && cobertura(g.ts, g1.x0, g1.x1) >= COBERTURA)
      .map((g) => g.c)
      .sort((p, q) => q - p);
    // Divisórias verticais das colunas-guia (fecham a célula): uma faixa só é LINHA da tabela se elas a cobrem —
    // exclui a faixa do rodapé/cabeçalho do documento e os quadros das seções (sem essas divisórias).
    const divisoria = (x: number) => vs.filter((g) => Math.abs(g.c - x) <= JUNTA).flatMap((g) => g.ts);
    const dA = divisoria(g0.x1);
    const dB = divisoria(g1.x0);
    const faixas: LinhaGrade[] = [];
    for (let i = 0; i + 1 < bordas.length; i++) {
      const topo = bordas[i];
      const base = bordas[i + 1];
      if (topo - base < 3) continue;
      if (cobertura(dA, base, topo) >= COBERTURA && cobertura(dB, base, topo) >= COBERTURA) faixas.push({ topo, base });
    }
    if (faixas.length > 0) linhas.set(page, faixas);
  }
  return linhas.size > 0 ? { colunas, linhas } : null;
}

/** A coluna da grade onde COMEÇA um trecho em `x` (o texto fica dentro da célula, depois da borda). */
export function colunaDe<K extends string>(grade: Grade<K>, x: number): K | null {
  for (const c of grade.colunas) if (x >= c.x0 - 1 && x < c.x1 - 0.5) return c.key;
  return null;
}

/** Índice da LINHA da tabela (na página) que contém a linha de base `y`; `null` fora da tabela. */
export function linhaDe(grade: Grade, page: number, y: number): number | null {
  const ls = grade.linhas.get(page);
  if (!ls) return null;
  for (let i = 0; i < ls.length; i++) if (y < ls[i].topo + 0.5 && y > ls[i].base - 0.5) return i;
  return null;
}
