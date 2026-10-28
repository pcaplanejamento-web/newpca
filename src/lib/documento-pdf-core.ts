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
export type LinhaDoc = {
  celulas: string[];
  cores?: (string | null | undefined)[];
  /** Negrito por célula (ex.: o rótulo de uma sub-linha). */
  negritos?: boolean[];
  destaque?: boolean;
  /**
   * SUB-LINHA da linha de cima: as `continua` primeiras colunas são as MESMAS do grupo (ficam vazias, sem a divisória entre
   * elas — como uma célula mesclada) e as demais ganham uma linha interna própria. O grupo inteiro tem o MESMO fundo; numa
   * quebra de página, a sub-linha repete as colunas do grupo com "(continuação)".
   */
  continua?: number;
};
export type DestaqueDoc = { rotulo: string; valor: string; detalhe?: string; cor?: string };

export type BlocoDoc =
  | { tipo: "titulo"; texto: string; alinhar?: "centro" }
  | { tipo: "secao"; texto: string }
  | { tipo: "subsecao"; texto: string; detalhe?: string; corDetalhe?: string }
  | { tipo: "paragrafo"; texto: string; cor?: "muted" | "texto"; alinhar?: "centro" | "justificado"; negrito?: boolean }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "destaques"; itens: DestaqueDoc[] }
  | { tipo: "nota"; texto: string; cor: string }
  | { tipo: "tabela"; colunas: ColunaDoc[]; linhas: LinhaDoc[]; vazio?: string }
  /** QUADRO emoldurado (ex.: o painel da assinatura): título + pares rótulo/valor + nota; nunca se parte entre páginas. */
  | { tipo: "quadro"; titulo: string; itens: { rotulo: string; valor: string }[]; nota?: string; cor: string };

export type OpDoc =
  | { t: "texto"; x: number; y: number; tam: number; negrito: boolean; cor: string; texto: string }
  | { t: "retangulo"; x: number; y: number; w: number; h: number; cor: string }
  | { t: "linha"; x1: number; y1: number; x2: number; y2: number; cor: string; espessura: number }
  /** A imagem do TIMBRE (a única imagem do documento — `OpcoesDocumento.timbre`). */
  | { t: "timbre"; x: number; y: number; w: number; h: number };

/** O TIMBRE no alto de cada página: a imagem na LARGURA da folha (a proporção dela) no lugar do título do documento. */
export type TimbreDoc = { largura: number; altura: number };

/** A4 em pé (pt). */
export const PAGINA_A4 = { largura: 595.28, altura: 841.89, margem: 40 };
const TOPO = 26; // o título do documento + a linha, no alto de cada página
const RODAPE = 22;
const TAM = { titulo: 16, secao: 12, subsecao: 9.5, texto: 8.5, tabela: 7.5, rotulo: 7, valor: 11.5, cabecalhoPagina: 7.5, rodape: 7, carimbo: 6.5 };
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
      case "quadro":
        return { ...b, titulo: limpo(b.titulo), itens: b.itens.map((i) => ({ rotulo: limpo(i.rotulo), valor: limpo(i.valor) })), nota: b.nota ? limpo(b.nota) : b.nota };
      case "subsecao":
        return { ...b, texto: limpo(b.texto), detalhe: b.detalhe ? limpo(b.detalhe) : b.detalhe };
      default:
        return { ...b, texto: limpo(b.texto) };
    }
  });
}

/**
 * Monta as páginas. `titulo` vai no alto de cada página; `rodape` à esquerda do "Página N de M". `carimbo` = o CARIMBO
 * de assinatura em TODAS as páginas (uma faixa emoldurada acima do rodapé; "{pagina}" e "{total}" são trocados).
 */
export function montarDocumento(
  blocos: BlocoDoc[],
  medir: Medir,
  opcoes: { titulo: string; rodape: string; carimbo?: { titulo: string; linhas: string[]; cor: string }; timbre?: TimbreDoc; margem?: number },
): OpDoc[][] {
  const { largura: W, altura: H } = PAGINA_A4;
  const M = opcoes.margem ?? PAGINA_A4.margem;
  const util = W - 2 * M;
  // Com o timbre, ele ocupa o alto da folha (na largura inteira) e o conteúdo começa logo abaixo.
  const hTimbre = opcoes.timbre ? (W * opcoes.timbre.altura) / opcoes.timbre.largura : 0;
  const inicio = opcoes.timbre ? hTimbre + 8 : M + TOPO;
  const hCarimbo = opcoes.carimbo ? (opcoes.carimbo.linhas.length + 1) * LH(TAM.carimbo) + 2 * PAD + 6 : 0;
  const fim = H - M - RODAPE - hCarimbo;
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
  // Linhas de um texto que podem continuar na página seguinte (parágrafo, item de lista, nota não). `alinhar`: centro =
  // cada linha no meio; justificado = as palavras espalhadas até a margem (menos a última linha, como no editor de texto).
  const linhas = (ls: string[], x: number, tam: number, negrito: boolean, cor: string, alinhar?: "centro" | "justificado") => {
    ls.forEach((l, k) => {
      garantir(LH(tam));
      const base = y + tam;
      const palavras = l.split(" ").filter(Boolean);
      if (alinhar === "centro") texto(l, x + (util - (x - M) - medir(l, tam, negrito)) / 2, base, tam, negrito, cor);
      else if (alinhar === "justificado" && k < ls.length - 1 && palavras.length > 1) {
        const larguras = palavras.map((p) => medir(p, tam, negrito));
        const vao = (util - (x - M) - larguras.reduce((s2, w) => s2 + w, 0)) / (palavras.length - 1);
        let xx = x;
        palavras.forEach((p, j) => {
          texto(p, xx, base, tam, negrito, cor);
          xx += larguras[j] + vao;
        });
      } else texto(l, x, base, tam, negrito, cor);
      y += LH(tam);
    });
  };

  for (const b of blocos) {
    switch (b.tipo) {
      case "titulo": {
        const ls = quebrarTexto(b.texto, util, TAM.titulo, medir, true);
        garantir(ls.length * LH(TAM.titulo) + JUNTO);
        linhas(ls, M, TAM.titulo, true, "@titulo", b.alinhar);
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
        linhas(quebrarTexto(b.texto, util, TAM.texto, medir, !!b.negrito), M, TAM.texto, !!b.negrito, b.cor === "muted" ? "@muted" : "@texto", b.alinhar);
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
      case "quadro": {
        const larguraRot = Math.max(...b.itens.map((i) => medir(i.rotulo, TAM.texto, false)), 0) + 10;
        const larguraVal = util - 24 - larguraRot;
        const pares = b.itens.map((i) => quebrarTexto(i.valor, larguraVal, TAM.texto, medir, true));
        const notaLs = b.nota ? quebrarTexto(b.nota, util - 24, TAM.rotulo, medir) : [];
        const h = 2 * PAD + 8 + LH(TAM.subsecao) + 6 + pares.reduce((s2, ls) => s2 + ls.length * LH(TAM.texto), 0) + (notaLs.length ? 6 + notaLs.length * LH(TAM.rotulo) : 0) + 4;
        if (!noTopo()) y += 6;
        garantir(h);
        const topo = y;
        ops.push({ t: "retangulo", x: M, y: topo, w: util, h, cor: "@destaque" });
        for (const [x1, y1, x2, y2] of [
          [M, topo, M + util, topo],
          [M, topo + h, M + util, topo + h],
          [M, topo, M, topo + h],
          [M + util, topo, M + util, topo + h],
        ])
          ops.push({ t: "linha", x1, y1, x2, y2, cor: b.cor, espessura: 1.2 });
        ops.push({ t: "retangulo", x: M, y: topo, w: 4, h, cor: b.cor });
        let yy = topo + PAD + 6;
        texto(b.titulo, M + 14, yy + TAM.subsecao, TAM.subsecao, true, b.cor);
        yy += LH(TAM.subsecao) + 6;
        b.itens.forEach((i, k) => {
          texto(i.rotulo, M + 14, yy + TAM.texto, TAM.texto, false, "@muted");
          pares[k].forEach((l, n) => {
            texto(l, M + 14 + larguraRot, yy + n * LH(TAM.texto) + TAM.texto, TAM.texto, true, "@texto");
          });
          yy += pares[k].length * LH(TAM.texto);
        });
        if (notaLs.length) {
          yy += 6;
          notaLs.forEach((l, n) => {
            texto(l, M + 14, yy + n * LH(TAM.rotulo) + TAM.rotulo, TAM.rotulo, false, "@muted");
          });
        }
        y = topo + h + 8;
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
    // `negrito` por célula; `borda` = de qual coluna parte a divisória de baixo (a sub-linha seguinte mescla as primeiras)
    // e se é o fim do GRUPO (mais forte).
    const desenhar = (
      cs: string[][],
      cores: (string | null | undefined)[],
      negrito: (j: number) => boolean,
      fundo: string | null,
      cabecalho: boolean,
      borda: { de: number; fimGrupo: boolean } = { de: 0, fimGrupo: true },
    ) => {
      const h = altura(cs);
      if (fundo) ops.push({ t: "retangulo", x: M, y, w: util, h, cor: fundo });
      let x = M;
      cs.forEach((c, j) => {
        const al = b.colunas[j]?.alinhar ?? "left"; // o título segue o alinhamento da coluna (números à direita)
        c.forEach((l, k) => {
          const tw = medir(l, tam, negrito(j));
          const tx = al === "right" ? x + larg[j] - PAD - tw : al === "center" ? x + (larg[j] - tw) / 2 : x + PAD;
          texto(l, tx, y + PAD + k * lh + tam, tam, negrito(j), cabecalho ? "@cabecalhoTexto" : (cores[j] ?? "@texto"));
        });
        x += larg[j];
      });
      const x1 = M + larg.slice(0, borda.de).reduce((s, w) => s + w, 0);
      ops.push({ t: "linha", x1, y1: y + h, x2: M + util, y2: y + h, cor: "@borda", espessura: borda.fimGrupo ? 0.6 : 0.35 });
      y += h;
    };
    const cabecalho = () => {
      ops.push({ t: "linha", x1: M, y1: y, x2: M + util, y2: y, cor: "@borda", espessura: 0.4 });
      desenhar(cab, [], () => true, "@cabecalhoFundo", true);
    };
    const linhasT: LinhaDoc[] = b.linhas.length ? b.linhas : [{ celulas: [b.vazio ?? "Nenhum registro.", ...b.colunas.slice(1).map(() => "")], cores: ["@muted"] }];
    const negritoDe = (l: LinhaDoc) => (j: number) => !!l.destaque || !!l.negritos?.[j];
    // O último valor de cada coluna no grupo (as sub-linhas mesclam as primeiras colunas com ele).
    let ultimos: string[] = [];
    const celulasDe = (l: LinhaDoc, repetir: boolean) => {
      // Sub-linha no TOPO de uma página: repete as colunas mescladas (quem lê a folha avulsa sabe de quem é).
      const vals = l.continua && repetir ? l.celulas.map((v, j) => (j < (l.continua ?? 0) ? (j === 0 ? `${ultimos[0]} (continuação)` : (ultimos[j] ?? "")) : v)) : l.celulas;
      return vals.map((v, j) => quebrarTexto(v ?? "", larg[j] - 2 * PAD, tam, medir, negritoDe(l)(j)));
    };
    const primeira = celulasDe(linhasT[0], false);
    // O cabeçalho nunca fica sozinho: vai junto com a 1ª linha.
    garantir(hCab + Math.min(altura(primeira), fim - inicio - hCab));
    cabecalho();
    let grupo = -1;
    linhasT.forEach((l, i) => {
      if (!l.continua) {
        grupo++;
        ultimos = [];
      }
      const proxima = linhasT[i + 1];
      const borda = { de: proxima?.continua ?? 0, fimGrupo: !proxima?.continua };
      let cs = i === 0 ? primeira : celulasDe(l, false);
      // O GRUPO inteiro (linha + sub-linhas) tem o mesmo fundo — a zebra é por grupo.
      const fundo = l.destaque ? "@destaque" : grupo % 2 === 1 ? "@zebra" : null;
      // Não cabe no resto da página: vai à seguinte (com o cabeçalho de novo). Mais alta que uma página INTEIRA: parte-se
      // em pedaços de linhas — nada é cortado.
      while (altura(cs) > fim - y) {
        if (y > inicio + hCab) {
          nova();
          cabecalho();
          cs = celulasDe(l, true);
          continue;
        }
        const cabem = Math.max(1, Math.floor((fim - y - 2 * PAD) / lh));
        desenhar(
          cs.map((c) => c.slice(0, cabem)),
          l.cores ?? [],
          negritoDe(l),
          fundo,
          false,
        );
        cs = cs.map((c) => c.slice(cabem));
        nova();
        cabecalho();
      }
      desenhar(cs, l.cores ?? [], negritoDe(l), fundo, false, borda);
      l.celulas.forEach((v, j) => {
        if (v) ultimos[j] = v;
      });
    });
  }

  // Topo (o título do documento) e rodapé (quem/quando + Página N de M) em TODAS as páginas.
  const total = paginas.length;
  paginas.forEach((p, i) => {
    if (opcoes.timbre) p.unshift({ t: "timbre", x: 0, y: 0, w: W, h: hTimbre });
    else
      p.unshift(
        { t: "texto", x: M, y: M + TAM.cabecalhoPagina, tam: TAM.cabecalhoPagina, negrito: true, cor: "@muted", texto: cortar(opcoes.titulo, util, TAM.cabecalhoPagina, medir, true) },
        { t: "linha", x1: M, y1: M + 12, x2: M + util, y2: M + 12, cor: "@borda", espessura: 0.5 },
      );
    const pg = `Página ${i + 1} de ${total}`;
    const wpg = medir(pg, TAM.rodape);
    const base = H - M + 4;
    const c = opcoes.carimbo;
    if (c) {
      const topo = H - M - RODAPE - hCarimbo + 4;
      const h = hCarimbo - 6;
      p.push({ t: "retangulo", x: M, y: topo, w: util, h, cor: "@destaque" });
      for (const [x1, y1, x2, y2] of [
        [M, topo, M + util, topo],
        [M, topo + h, M + util, topo + h],
        [M, topo, M, topo + h],
        [M + util, topo, M + util, topo + h],
      ])
        p.push({ t: "linha", x1, y1, x2, y2, cor: c.cor, espessura: 0.8 });
      p.push({ t: "retangulo", x: M, y: topo, w: 3, h, cor: c.cor });
      const troca = (s2: string) => s2.replaceAll("{pagina}", String(i + 1)).replaceAll("{total}", String(total));
      [c.titulo, ...c.linhas].forEach((l, k) => {
        p.push({ t: "texto", x: M + 10, y: topo + PAD + k * LH(TAM.carimbo) + TAM.carimbo, tam: TAM.carimbo, negrito: k === 0, cor: k === 0 ? c.cor : "@texto", texto: cortar(troca(l), util - 16, TAM.carimbo, medir, k === 0) });
      });
    }
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
