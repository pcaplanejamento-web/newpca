/**
 * TEXTO FORMATADO (um markdown RESTRITO — descrição, notas e comentários das tarefas). Só lê o texto e devolve uma
 * ÁRVORE; quem desenha é o componente `TextoFormatado` (elementos React — nunca HTML cru). Sem banco e sem JSX.
 *
 * Blocos (por linha): `# `/`## `/`### ` título · `- `/`* ` lista · `1. ` lista numerada · `> ` citação · `---`
 * separador · o resto é parágrafo (linhas seguidas = quebra de linha; linha em branco separa parágrafos).
 * No texto: `**negrito**`, `*itálico*`/`_itálico_`, `` `código` ``, `[texto](https://…)`, endereços http(s) soltos e
 * `@menção`. Links só http/https.
 */

export type Inline =
  | { t: "texto"; v: string }
  | { t: "negrito"; f: Inline[] }
  | { t: "italico"; f: Inline[] }
  | { t: "codigo"; v: string }
  | { t: "link"; href: string; f: Inline[] }
  | { t: "mencao"; v: string }
  | { t: "quebra" };

export type Bloco =
  | { t: "par"; f: Inline[] }
  | { t: "titulo"; n: 1 | 2 | 3; f: Inline[] }
  | { t: "lista"; ordenada: boolean; itens: Inline[][] }
  | { t: "citacao"; f: Inline[] }
  | { t: "separador" };

/** Teto de texto lido (o resto é ignorado — os campos já têm teto menor). */
const MAX_TEXTO = 20_000;

const hrefValido = (u: string) => /^https?:\/\/[^\s<>"]+$/i.test(u);

/**
 * O próximo trecho especial a partir de `i`: o índice de início, o fim (exclusivo) e o nó. `null` = texto puro até o fim.
 * A ordem das alternativas define a precedência (código > link > negrito > itálico > url > menção).
 */
const PADRAO = /`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^\n]+?)\*\*|(?<![\p{L}\p{N}*])\*([^\s*][^*\n]*?)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_([^\s_][^_\n]*?)_(?![\p{L}\p{N}_])|(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])|(?<![\p{L}\p{N}._-])@([\p{L}\p{N}._-]{2,60})/gu;

/** O texto de UMA linha em nós (recursivo no negrito/itálico/link). */
export function lerInline(s: string, prof = 0): Inline[] {
  const out: Inline[] = [];
  if (!s) return out;
  if (prof > 4) return [{ t: "texto", v: s }];
  const re = new RegExp(PADRAO.source, PADRAO.flags);
  let i = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > i) out.push({ t: "texto", v: s.slice(i, m.index) });
    if (m[1] != null) out.push({ t: "codigo", v: m[1] });
    else if (m[2] != null && m[3] != null) out.push(hrefValido(m[3]) ? { t: "link", href: m[3], f: lerInline(m[2], prof + 1) } : { t: "texto", v: m[0] });
    else if (m[4] != null) out.push({ t: "negrito", f: lerInline(m[4], prof + 1) });
    else if (m[5] != null) out.push({ t: "italico", f: lerInline(m[5], prof + 1) });
    else if (m[6] != null) out.push({ t: "italico", f: lerInline(m[6], prof + 1) });
    else if (m[7] != null) out.push(hrefValido(m[7]) ? { t: "link", href: m[7], f: [{ t: "texto", v: m[7] }] } : { t: "texto", v: m[7] });
    else if (m[8] != null) out.push({ t: "mencao", v: `@${m[8]}` });
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push({ t: "texto", v: s.slice(i) });
  // Texto vizinho fica junto (menos nós).
  return out.reduce<Inline[]>((acc, n) => {
    const ult = acc[acc.length - 1];
    if (n.t === "texto" && ult?.t === "texto") acc[acc.length - 1] = { t: "texto", v: ult.v + n.v };
    else acc.push(n);
    return acc;
  }, []);
}

const RE_TITULO = /^(#{1,3})\s+(.*)$/;
const RE_LISTA = /^\s*[-*•]\s+(.*)$/;
const RE_NUMERADA = /^\s*\d{1,3}[.)]\s+(.*)$/;
const RE_CITACAO = /^>\s?(.*)$/;
const RE_SEPARADOR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

/** O texto inteiro em BLOCOS. */
export function lerTextoFormatado(texto: string | null | undefined): Bloco[] {
  const linhas = (texto ?? "").slice(0, MAX_TEXTO).replace(/\r\n?/g, "\n").split("\n");
  const out: Bloco[] = [];
  let par: string[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;
  let cit: string[] = [];
  const fecharPar = () => {
    if (!par.length) return;
    const f: Inline[] = [];
    par.forEach((l, k) => {
      if (k) f.push({ t: "quebra" });
      f.push(...lerInline(l));
    });
    out.push({ t: "par", f });
    par = [];
  };
  const fecharLista = () => {
    if (lista) out.push({ t: "lista", ordenada: lista.ordenada, itens: lista.itens.map((x) => lerInline(x)) });
    lista = null;
  };
  const fecharCit = () => {
    if (!cit.length) return;
    const f: Inline[] = [];
    cit.forEach((l, k) => {
      if (k) f.push({ t: "quebra" });
      f.push(...lerInline(l));
    });
    out.push({ t: "citacao", f });
    cit = [];
  };
  const fecharTudo = () => {
    fecharPar();
    fecharLista();
    fecharCit();
  };
  for (const linha of linhas) {
    if (!linha.trim()) {
      fecharTudo();
      continue;
    }
    if (RE_SEPARADOR.test(linha)) {
      fecharTudo();
      out.push({ t: "separador" });
      continue;
    }
    const titulo = RE_TITULO.exec(linha);
    if (titulo) {
      fecharTudo();
      out.push({ t: "titulo", n: titulo[1].length as 1 | 2 | 3, f: lerInline(titulo[2].trim()) });
      continue;
    }
    const num = RE_NUMERADA.exec(linha);
    const item = num ? null : RE_LISTA.exec(linha);
    if (num || item) {
      const ordenada = !!num;
      fecharPar();
      fecharCit();
      if (lista && lista.ordenada !== ordenada) fecharLista();
      if (!lista) lista = { ordenada, itens: [] };
      lista.itens.push(((num ?? item) as RegExpExecArray)[1]);
      continue;
    }
    const c = RE_CITACAO.exec(linha);
    if (c) {
      fecharPar();
      fecharLista();
      cit.push(c[1]);
      continue;
    }
    fecharLista();
    fecharCit();
    par.push(linha);
  }
  fecharTudo();
  return out;
}

/** O texto SEM a marcação (a prévia de uma linha — ex.: o título de um aviso). */
export function textoPlano(texto: string | null | undefined): string {
  const plano = (f: Inline[]): string =>
    f
      .map((n) => (n.t === "texto" || n.t === "codigo" || n.t === "mencao" ? n.v : n.t === "quebra" ? " " : "f" in n ? plano(n.f) : ""))
      .join("");
  return lerTextoFormatado(texto)
    .map((b) => (b.t === "lista" ? b.itens.map(plano).join(" · ") : b.t === "separador" ? "" : plano(b.f)))
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Uma AÇÃO da barra do editor: envolve a seleção (negrito/itálico/código/link) ou prefixa as linhas (listas/título). */
export type AcaoTexto = "negrito" | "italico" | "codigo" | "link" | "lista" | "numerada" | "titulo" | "citacao";

/**
 * Aplica a ação ao texto com a SELEÇÃO [ini, fim) — devolve o texto novo e a seleção seguinte (o cursor fica dentro da
 * marcação quando nada estava selecionado).
 */
export function aplicarAcaoTexto(texto: string, ini: number, fim: number, acao: AcaoTexto): { texto: string; ini: number; fim: number } {
  const a = Math.max(0, Math.min(ini, fim));
  const b = Math.min(texto.length, Math.max(ini, fim));
  const sel = texto.slice(a, b);
  const envolver = (antes: string, depois: string, vazio: string) => {
    const miolo = sel || vazio;
    const novo = texto.slice(0, a) + antes + miolo + depois + texto.slice(b);
    return { texto: novo, ini: a + antes.length, fim: a + antes.length + miolo.length };
  };
  if (acao === "negrito") return envolver("**", "**", "texto");
  if (acao === "italico") return envolver("*", "*", "texto");
  if (acao === "codigo") return envolver("`", "`", "código");
  if (acao === "link") {
    const miolo = sel || "texto";
    const antes = `[${miolo}](`;
    const url = "https://";
    const novo = `${texto.slice(0, a)}${antes}${url})${texto.slice(b)}`;
    return { texto: novo, ini: a + antes.length, fim: a + antes.length + url.length };
  }
  // Prefixo por LINHA (as linhas tocadas pela seleção).
  const inicioLinha = texto.lastIndexOf("\n", a - 1) + 1;
  const fimLinha = (() => {
    const k = texto.indexOf("\n", b);
    return k < 0 ? texto.length : k;
  })();
  const bloco = texto.slice(inicioLinha, fimLinha);
  const linhas = bloco.split("\n");
  const prefixo = (k: number) => (acao === "lista" ? "- " : acao === "numerada" ? `${k + 1}. ` : acao === "titulo" ? "## " : "> ");
  const jaTem = linhas.every((l, k) => l.startsWith(prefixo(k)));
  const novoBloco = linhas.map((l, k) => (jaTem ? l.slice(prefixo(k).length) : prefixo(k) + l)).join("\n");
  const novo = texto.slice(0, inicioLinha) + novoBloco + texto.slice(fimLinha);
  return { texto: novo, ini: inicioLinha, fim: inicioLinha + novoBloco.length };
}
