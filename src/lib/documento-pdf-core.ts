import { type Alinhamento, type Medir, quebrarTexto } from "./exportar-pdf-core.ts";

/**
 * DOCUMENTO em PDF (A4 em pé) — núcleo PURO do LAYOUT (sem pdf-lib/DOM → testável). Recebe BLOCOS (título, seção,
 * subseção, parágrafo, lista, destaques, nota, tabela) e devolve as PÁGINAS como operações de desenho (texto, retângulo,
 * linha) em coordenadas a partir do TOPO; `documento-pdf.ts` só as desenha. Regras para quem lê em papel: nada é cortado
 * (texto quebra por palavra; tabela longa continua na página seguinte com o CABEÇALHO repetido), um título nunca fica
 * sozinho no pé da página, toda página leva o título do documento no topo e o rodapé "<quem/quando> · Página N de M".
 * As cores são CSS (`#hex`, `var(--token)`) ou papéis da paleta (`@texto`, `@muted`, `@titulo`, `@cabecalhoFundo`,
 * `@cabecalhoTexto`, `@zebra`, `@borda`, `@destaque`).
 */

export type ColunaDoc = { titulo: string; peso: number; alinhar?: Alinhamento };
export type LinhaDoc = { celulas: string[]; cores?: (string | null | undefined)[]; destaque?: boolean };
export type DestaqueDoc = { rotulo: string; valor: string; detalhe?: string; cor?: string };

export type BlocoDoc =
  | { tipo: "titulo"; texto: string }
  | { tipo: "secao"; texto: string }
  | { tipo: "subsecao"; texto: string; detalhe?: string; corDetalhe?: string }
  | { tipo: "paragrafo"; texto: string; cor?: "muted" | "texto" }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "destaques"; itens: DestaqueDoc[] }
  | { tipo: "nota"; texto: string; cor: string }
  | { tipo: "tabela"; colunas: ColunaDoc[]; linhas: LinhaDoc[]; vazio?: string };

export type OpDoc =
  | { t: "texto"; x: number; y: number; tam: number; negrito: boolean; cor: string; texto: string }
  | { t: "retangulo"; x: number; y: number; w: number; h: number; cor: string }
  | { t: "linha"; x1: number; y1: number; x2: number; y2: number; cor: string; espessura: number };

/** A4 em pé (pt). */
export const PAGINA_A4 = { largura: 595.28, altura: 841.89, margem: 40 };
const TOPO = 26; // o título do documento + a linha, no alto de cada página
const RODAPE = 22;
const TAM = { titulo: 16, secao: 12, subsecao: 9.5, texto: 8.5, tabela: 7.5, rotulo: 7, valor: 11.5, cabecalhoPagina: 7.5, rodape: 7 };
const LH = (tam: number) => tam * 1.32;
const PAD = 4;
/** Espaço que um título precisa ver abaixo de si (senão vai à página seguinte junto com o conteúdo). */
const JUNTO = 60;

/** Tira de cada texto o que as fontes do PDF não têm (`textoParaPdf`) — aplicado a TODOS os textos dos blocos. */
export function limparBlocos(blocos: BlocoDoc[], limpo: (s: string) => string): BlocoDoc[] {
  return blocos.map((b) => {
    switch (b.tipo) {
      case "lista":
        return { ...b, itens: b.itens.map(limpo) };
      case "destaques":
        return { ...b, itens: b.itens.map((i) => ({ ...i, rotulo: limpo(i.rotulo), valor: limpo(i.valor), detalhe: i.detalhe ? limpo(i.detalhe) : i.detalhe })) };
      case "tabela":
        return {
          ...b,
          colunas: b.colunas.map((c) => ({ ...c, titulo: limpo(c.titulo) })),
          linhas: b.linhas.map((l) => ({ ...l, celulas: l.celulas.map(limpo) })),
          vazio: b.vazio ? limpo(b.vazio) : b.vazio,
        };
      case "subsecao":
        return { ...b, texto: limpo(b.texto), detalhe: b.detalhe ? limpo(b.detalhe) : b.detalhe };
      default:
        return { ...b, texto: limpo(b.texto) };
    }
  });
}

/** Monta as páginas. `titulo` vai no alto de cada página; `rodape` à esquerda do "Página N de M". */
export function montarDocumento(blocos: BlocoDoc[], medir: Medir, opcoes: { titulo: string; rodape: string }): OpDoc[][] {
  const { largura: W, altura: H, margem: M } = PAGINA_A4;
  const util = W - 2 * M;
  const inicio = M + TOPO;
  const fim = H - M - RODAPE;
  const paginas: OpDoc[][] = [];
  let ops: OpDoc[] = [];
  let y = inicio;
  const nova = () => {
    ops = [];
    paginas.push(ops);
    y = inicio;
  };
  nova();
  const noTopo = () => y === inicio;
  const garantir = (h: number) => {
    if (y + h > fim && !noTopo()) nova();
  };
  const texto = (s: string, x: number, base: number, tam: number, negrito: boolean, cor: string) => {
    if (s) ops.push({ t: "texto", x, y: base, tam, negrito, cor, texto: s });
  };
  // Linhas de um texto que podem continuar na página seguinte (parágrafo, item de lista, nota não).
  const linhas = (ls: string[], x: number, tam: number, negrito: boolean, cor: string) => {
    for (const l of ls) {
      garantir(LH(tam));
      texto(l, x, y + tam, tam, negrito, cor);
      y += LH(tam);
    }
  };

  for (const b of blocos) {
    switch (b.tipo) {
      case "titulo": {
        const ls = quebrarTexto(b.texto, util, TAM.titulo, medir, true);
        garantir(ls.length * LH(TAM.titulo) + JUNTO);
        linhas(ls, M, TAM.titulo, true, "@titulo");
        y += 2;
        break;
      }
      case "secao": {
        const ls = quebrarTexto(b.texto, util, TAM.secao, medir, true);
        if (!noTopo()) y += 12;
        garantir(ls.length * LH(TAM.secao) + 6 + JUNTO);
        linhas(ls, M, TAM.secao, true, "@titulo");
        ops.push({ t: "linha", x1: M, y1: y + 1, x2: M + util, y2: y + 1, cor: "@titulo", espessura: 0.8 });
        y += 8;
        break;
      }
      case "subsecao": {
        if (!noTopo()) y += 6;
        // O detalhe à DIREITA, na mesma linha quando cabe; senão, numa linha própria abaixo.
        const larguraDet = b.detalhe ? medir(b.detalhe, TAM.subsecao, true) : 0;
        const cabe = larguraDet > 0 && larguraDet + 24 < util * 0.45;
        const ls = quebrarTexto(b.texto, cabe ? util - larguraDet - 16 : util, TAM.subsecao, medir, true);
        const extra = b.detalhe && !cabe ? LH(TAM.subsecao) : 0;
        garantir(ls.length * LH(TAM.subsecao) + extra + 4 + JUNTO);
        const topo = y;
        ops.push({ t: "retangulo", x: M, y: topo - 2, w: 2.5, h: ls.length * LH(TAM.subsecao) + extra + 2, cor: "@titulo" });
        linhas(ls, M + 8, TAM.subsecao, true, "@texto");
        if (b.detalhe) {
          if (cabe) texto(b.detalhe, M + util - larguraDet, topo + TAM.subsecao, TAM.subsecao, true, b.corDetalhe ?? "@muted");
          else linhas([b.detalhe], M + 8, TAM.subsecao, true, b.corDetalhe ?? "@muted");
        }
        y += 4;
        break;
      }
      case "paragrafo": {
        linhas(quebrarTexto(b.texto, util, TAM.texto, medir), M, TAM.texto, false, b.cor === "muted" ? "@muted" : "@texto");
        y += 5;
        break;
      }
      case "lista": {
        for (const [i, item] of b.itens.entries()) {
          const marca = `${i + 1}.`;
          const ls = quebrarTexto(item, util - 16, TAM.texto, medir);
          garantir(LH(TAM.texto));
          texto(marca, M + 2, y + TAM.texto, TAM.texto, true, "@titulo");
          linhas(ls, M + 16, TAM.texto, false, "@texto");
          y += 2;
        }
        y += 4;
        break;
      }
      case "destaques": {
        const porLinha = Math.min(4, Math.max(1, b.itens.length));
        const gap = 8;
        const w = (util - gap * (porLinha - 1)) / porLinha;
        const h = 44;
        for (let i = 0; i < b.itens.length; i += porLinha) {
          garantir(h + gap);
          b.itens.slice(i, i + porLinha).forEach((d, k) => {
            const x = M + k * (w + gap);
            ops.push({ t: "retangulo", x, y, w, h, cor: "@zebra" });
            ops.push({ t: "retangulo", x, y, w: 2.5, h, cor: d.cor ?? "@borda" });
            texto(cortar(d.rotulo, w - 14, TAM.rotulo, medir, false), x + 9, y + 6 + TAM.rotulo, TAM.rotulo, false, "@muted");
            texto(cortar(d.valor, w - 14, TAM.valor, medir, true), x + 9, y + 20 + TAM.valor * 0.8, TAM.valor, true, d.cor ?? "@texto");
            if (d.detalhe) texto(cortar(d.detalhe, w - 14, TAM.rotulo, medir, false), x + 9, y + h - 6, TAM.rotulo, false, "@muted");
          });
          y += h + gap;
        }
        y += 2;
        break;
      }
      case "nota": {
        const ls = quebrarTexto(b.texto, util - 20, TAM.texto, medir);
        const h = ls.length * LH(TAM.texto) + 2 * PAD + 2;
        garantir(h);
        ops.push({ t: "retangulo", x: M, y, w: util, h, cor: "@destaque" });
        ops.push({ t: "retangulo", x: M, y, w: 3, h, cor: b.cor });
        ls.forEach((l, k) => {
          texto(l, M + 12, y + PAD + 1 + k * LH(TAM.texto) + TAM.texto, TAM.texto, false, "@texto");
        });
        y += h + 8;
        break;
      }
      case "tabela": {
        tabela(b);
        y += 8;
        break;
      }
    }
  }

  function tabela(b: Extract<BlocoDoc, { tipo: "tabela" }>) {
    const pesos = b.colunas.reduce((s, c) => s + c.peso, 0) || 1;
    const larg = b.colunas.map((c) => (c.peso / pesos) * util);
    const tam = TAM.tabela;
    const lh = LH(tam);
    const celulas = (vals: string[], negrito: boolean) => vals.map((v, j) => quebrarTexto(v ?? "", larg[j] - 2 * PAD, tam, medir, negrito));
    const cab = celulas(
      b.colunas.map((c) => c.titulo),
      true,
    );
    const altura = (cs: string[][]) => Math.max(1, ...cs.map((c) => c.length)) * lh + 2 * PAD;
    const hCab = altura(cab);
    const desenhar = (cs: string[][], cores: (string | null | undefined)[], negrito: boolean, fundo: string | null, cabecalho: boolean) => {
      const h = altura(cs);
      if (fundo) ops.push({ t: "retangulo", x: M, y, w: util, h, cor: fundo });
      let x = M;
      cs.forEach((c, j) => {
        const al = b.colunas[j]?.alinhar ?? "left"; // o título segue o alinhamento da coluna (números à direita)
        c.forEach((l, k) => {
          const tw = medir(l, tam, negrito);
          const tx = al === "right" ? x + larg[j] - PAD - tw : al === "center" ? x + (larg[j] - tw) / 2 : x + PAD;
          texto(l, tx, y + PAD + k * lh + tam, tam, negrito, cabecalho ? "@cabecalhoTexto" : (cores[j] ?? "@texto"));
        });
        x += larg[j];
      });
      ops.push({ t: "linha", x1: M, y1: y + h, x2: M + util, y2: y + h, cor: "@borda", espessura: 0.4 });
      y += h;
    };
    const cabecalho = () => {
      ops.push({ t: "linha", x1: M, y1: y, x2: M + util, y2: y, cor: "@borda", espessura: 0.4 });
      desenhar(cab, [], true, "@cabecalhoFundo", true);
    };
    const linhasT = b.linhas.length ? b.linhas : [{ celulas: [b.vazio ?? "Nenhum registro.", ...b.colunas.slice(1).map(() => "")], cores: ["@muted"] }];
    const primeira = celulas(linhasT[0].celulas, !!linhasT[0].destaque);
    // O cabeçalho nunca fica sozinho: vai junto com a 1ª linha.
    garantir(hCab + Math.min(altura(primeira), fim - inicio - hCab));
    cabecalho();
    linhasT.forEach((l, i) => {
      let cs = i === 0 ? primeira : celulas(l.celulas, !!l.destaque);
      const fundo = l.destaque ? "@destaque" : i % 2 === 1 ? "@zebra" : null;
      // Não cabe no resto da página: vai à seguinte (com o cabeçalho de novo). Mais alta que uma página INTEIRA: parte-se
      // em pedaços de linhas — nada é cortado.
      while (altura(cs) > fim - y) {
        if (y > inicio + hCab) {
          nova();
          cabecalho();
          continue;
        }
        const cabem = Math.max(1, Math.floor((fim - y - 2 * PAD) / lh));
        desenhar(
          cs.map((c) => c.slice(0, cabem)),
          l.cores ?? [],
          !!l.destaque,
          fundo,
          false,
        );
        cs = cs.map((c) => c.slice(cabem));
        nova();
        cabecalho();
      }
      desenhar(cs, l.cores ?? [], !!l.destaque, fundo, false);
    });
  }

  // Topo (o título do documento) e rodapé (quem/quando + Página N de M) em TODAS as páginas.
  const total = paginas.length;
  paginas.forEach((p, i) => {
    p.unshift(
      { t: "texto", x: M, y: M + TAM.cabecalhoPagina, tam: TAM.cabecalhoPagina, negrito: true, cor: "@muted", texto: cortar(opcoes.titulo, util, TAM.cabecalhoPagina, medir, true) },
      { t: "linha", x1: M, y1: M + 12, x2: M + util, y2: M + 12, cor: "@borda", espessura: 0.5 },
    );
    const pg = `Página ${i + 1} de ${total}`;
    const wpg = medir(pg, TAM.rodape);
    const base = H - M + 4;
    p.push(
      { t: "linha", x1: M, y1: H - M - 8, x2: M + util, y2: H - M - 8, cor: "@borda", espessura: 0.5 },
      { t: "texto", x: M, y: base, tam: TAM.rodape, negrito: false, cor: "@muted", texto: cortar(opcoes.rodape, util - wpg - 16, TAM.rodape, medir, false) },
      { t: "texto", x: M + util - wpg, y: base, tam: TAM.rodape, negrito: false, cor: "@muted", texto: pg },
    );
  });
  return paginas;
}

/** O texto numa linha só, com "…" quando não cabe. */
function cortar(s: string, largura: number, tam: number, medir: Medir, negrito: boolean): string {
  if (medir(s, tam, negrito) <= largura) return s;
  let n = s.length;
  while (n > 1 && medir(`${s.slice(0, n)}…`, tam, negrito) > largura) n--;
  return `${s.slice(0, n)}…`;
}
