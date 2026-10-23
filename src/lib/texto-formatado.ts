/**
 * TEXTO FORMATADO (um markdown RESTRITO — descrição, notas e comentários das tarefas). Só lê o texto e devolve uma
 * ÁRVORE; quem desenha é o componente `TextoFormatado` (elementos React — nunca HTML cru). Sem banco e sem JSX.
 *
 * Blocos (por linha): `# `/`## `/`### ` título · `- `/`* ` lista · `1. ` lista numerada · `> ` citação · `---`
 * separador · o resto é parágrafo (linhas seguidas = quebra de linha; linha em branco separa parágrafos). O ALINHAMENTO vai
 * na frente da 1ª linha do bloco — `[[centro]]`, `[[direita]]`, `[[justificado]]` (sem marca = à esquerda); a lista
 * numerada guarda o número em que COMEÇA (`3. x` continua do 3).
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

export const ALINHAMENTOS = ["esquerda", "centro", "direita", "justificado"] as const;
export type Alinhamento = (typeof ALINHAMENTOS)[number];

/** A FONTE do bloco: `sans` (a do sistema — sem marca), `serif` (de documento) ou `mono` (de máquina). */
export const FONTES = ["sans", "serif", "mono"] as const;
export type Fonte = (typeof FONTES)[number];

export type Bloco =
  | { t: "par"; f: Inline[]; al?: Alinhamento; fo?: Fonte }
  | { t: "titulo"; n: 1 | 2 | 3; f: Inline[]; al?: Alinhamento; fo?: Fonte }
  | { t: "lista"; ordenada: boolean; itens: Inline[][]; inicio?: number; al?: Alinhamento; fo?: Fonte }
  | { t: "citacao"; f: Inline[]; al?: Alinhamento; fo?: Fonte }
  | { t: "separador" };

// As MARCAS do bloco na frente da 1ª linha: alinhamento e fonte ("[[centro]] [[serif]] …"); repetidas valem pela ÚLTIMA.
const RE_ALINHAMENTO = /^(?:\[\[(?:centro|direita|justificado|serif|mono)\]\]\s?)+/;
const RE_MARCA = /\[\[(centro|direita|justificado|serif|mono)\]\]/g;
/** As marcas de uma linha → alinhamento, fonte e o resto da linha. */
export function lerMarcas(linha: string): { al?: Alinhamento; fo?: Fonte; resto: string } {
  const m = RE_ALINHAMENTO.exec(linha);
  if (!m) return { resto: linha };
  let al: Alinhamento | undefined;
  let fo: Fonte | undefined;
  for (const [, x] of m[0].matchAll(RE_MARCA)) {
    if (x === "serif" || x === "mono") fo = x;
    else al = x as Alinhamento;
  }
  return { al, fo, resto: linha.slice(m[0].length) };
}
/** A marca de alinhamento na frente de uma linha ("" para a esquerda). */
export const marcaAlinhamento = (al: Alinhamento | undefined) => (al && al !== "esquerda" ? `[[${al}]] ` : "");
/** As marcas do bloco (alinhamento + fonte) na frente de uma linha. */
export const marcasBloco = (al: Alinhamento | undefined, fo: Fonte | undefined) => `${marcaAlinhamento(al)}${fo && fo !== "sans" ? `[[${fo}]] ` : ""}`;
/** A fonte em CSS (`font-family`) — a mesma no editor, na leitura e no e-mail. */
export const CSS_FONTE: Record<Fonte, string> = {
  sans: "inherit",
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace',
};
/** A linha sem a marca de alinhamento (quem lê o texto linha a linha — o PDF do termo). */
export const semAlinhamento = (linha: string) => linha.replace(RE_ALINHAMENTO, "");
/** O texto inteiro sem as marcas de alinhamento (quem lê o texto cru). */
export const semMarcas = (texto: string) => texto.split("\n").map(semAlinhamento).join("\n");
/** O alinhamento em CSS (`text-align`). */
export const CSS_ALINHAMENTO: Record<Alinhamento, string> = { esquerda: "left", centro: "center", direita: "right", justificado: "justify" };

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
  let lista: { ordenada: boolean; itens: string[]; inicio: number; al?: Alinhamento; fo?: Fonte } | null = null;
  let cit: string[] = [];
  let alPar: Alinhamento | undefined;
  let alCit: Alinhamento | undefined;
  let foPar: Fonte | undefined;
  let foCit: Fonte | undefined;
  const fecharPar = () => {
    if (!par.length) return;
    const f: Inline[] = [];
    par.forEach((l, k) => {
      if (k) f.push({ t: "quebra" });
      f.push(...lerInline(l));
    });
    out.push({ t: "par", f, ...(alPar ? { al: alPar } : {}), ...(foPar ? { fo: foPar } : {}) });
    par = [];
  };
  const fecharLista = () => {
    if (lista)
      out.push({
        t: "lista",
        ordenada: lista.ordenada,
        itens: lista.itens.map((x) => lerInline(x)),
        ...(lista.ordenada && lista.inicio !== 1 ? { inicio: lista.inicio } : {}),
        ...(lista.al ? { al: lista.al } : {}),
        ...(lista.fo ? { fo: lista.fo } : {}),
      });
    lista = null;
  };
  const fecharCit = () => {
    if (!cit.length) return;
    const f: Inline[] = [];
    cit.forEach((l, k) => {
      if (k) f.push({ t: "quebra" });
      f.push(...lerInline(l));
    });
    out.push({ t: "citacao", f, ...(alCit ? { al: alCit } : {}), ...(foCit ? { fo: foCit } : {}) });
    cit = [];
  };
  const fecharTudo = () => {
    fecharPar();
    fecharLista();
    fecharCit();
  };
  for (const bruta of linhas) {
    const { al, fo, resto: linha } = lerMarcas(bruta);
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
      const t = { t: "titulo" as const, n: titulo[1].length as 1 | 2 | 3, f: lerInline(titulo[2].trim()) };
      out.push({ ...t, ...(al ? { al } : {}), ...(fo ? { fo } : {}) });
      continue;
    }
    const num = RE_NUMERADA.exec(linha);
    const item = num ? null : RE_LISTA.exec(linha);
    if (num || item) {
      const ordenada = !!num;
      fecharPar();
      fecharCit();
      if (lista && lista.ordenada !== ordenada) fecharLista();
      if (!lista) lista = { ordenada, itens: [], inicio: num ? Number(/\d+/.exec(linha)?.[0] ?? 1) : 1, al, fo };
      lista.itens.push(((num ?? item) as RegExpExecArray)[1]);
      continue;
    }
    const c = RE_CITACAO.exec(linha);
    if (c) {
      fecharPar();
      fecharLista();
      if (!cit.length) {
        alCit = al;
        foCit = fo;
      }
      cit.push(c[1]);
      continue;
    }
    fecharLista();
    fecharCit();
    if (!par.length) {
      alPar = al;
      foPar = fo;
    }
    par.push(linha);
  }
  fecharTudo();
  return out;
}

/** Os trechos SEM a marcação; `quebra` = o que entra no lugar da quebra de linha; `enderecos` = o link vira "texto
 * (endereço)" quando os dois diferem (onde o link não é clicável). */
function plano(f: Inline[], quebra: string, enderecos = false): string {
  return f
    .map((n) => {
      if (n.t === "texto" || n.t === "codigo" || n.t === "mencao") return n.v;
      if (n.t === "quebra") return quebra;
      const dentro = plano(n.f, quebra, enderecos);
      return enderecos && n.t === "link" && dentro !== n.href ? `${dentro} (${n.href})` : dentro;
    })
    .join("");
}

/** O texto SEM a marcação NUMA LINHA (a prévia — ex.: o texto de um aviso no sino). */
export function textoPlano(texto: string | null | undefined): string {
  const linha = (f: Inline[]) => plano(f, " ");
  return lerTextoFormatado(texto)
    .map((b) => (b.t === "lista" ? b.itens.map(linha).join(" · ") : b.t === "separador" ? "" : linha(b.f)))
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** O texto SEM a marcação mantendo as LINHAS (o .ics do calendário, a versão em texto do e-mail, a notificação do sistema). */
export function textoSimples(texto: string | null | undefined): string {
  return lerTextoFormatado(texto)
    .map((b) => {
      if (b.t === "lista") return b.itens.map((f, i) => `${b.ordenada ? `${(b.inicio ?? 1) + i}.` : "•"} ${plano(f, " ", true)}`).join("\n");
      if (b.t === "separador") return "—";
      return plano(b.f, "\n", true);
    })
    .join("\n\n")
    .trim();
}
