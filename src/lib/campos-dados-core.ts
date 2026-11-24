/**
 * CAMPOS DE DADOS nos textos — o "dado consolidado" que o sistema troca pelo valor na hora de montar o documento (o ano do
 * PCA, o valor total, a data da emissão…). Núcleo PURO (sem DOM, testado em tests/campos-dados.test.ts), o MESMO em todo o
 * sistema: no texto GRAVADO o campo é sempre `{{chave}}` (legível, sem migração — o que já está gravado continua valendo);
 * na TELA de edição ele aparece como um CHIP (um "emoji" do dado: o nome, sem as chaves) que se escolhe numa lista e se
 * apaga de uma vez. Só a chave válida e CONHECIDA vira chip; a desconhecida fica como texto (o editor avisa).
 */

/** A definição de um campo que o host oferece (a lista do seletor). */
export type CampoDado = {
  /** A chave gravada: `{{chave}}` (letra, depois letras/números — até 40). */
  chave: string;
  /** O nome no chip e na lista ("Ano do PCA"). */
  rotulo: string;
  /** O grupo da lista ("PCA", "Totais", "Emissão"). */
  grupo?: string;
  /** Para que serve (a 2ª linha da lista). */
  descricao?: string;
  /** O valor de agora (a prévia na lista e a dica do chip) — opcional. */
  exemplo?: string;
};

/** A chave aceita: começa por letra, só letras e números (as chaves de sempre: `ano`, `valorExtenso`). */
export const RE_CHAVE_CAMPO = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
/** `{{ chave }}` num texto (espaços dentro tolerados). */
const RE_CAMPO = /\{\{\s*([a-zA-Z][a-zA-Z0-9]{0,39})\s*\}\}/g;
/** O "{{termo" logo antes do cursor (digitar "{{" abre as sugestões). */
export const RE_GATILHO_CAMPO = /\{\{([a-zA-Z0-9]{0,40})$/;
/** O atributo do chip no HTML do editor. */
export const ATRIBUTO_CAMPO = "data-campo";

export const escaparHtmlCampo = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** O mapa chave → definição (as chaves válidas; a primeira de cada chave vale). */
export function mapaCampos(campos: readonly CampoDado[] | undefined): ReadonlyMap<string, CampoDado> {
  const m = new Map<string, CampoDado>();
  for (const c of campos ?? []) if (RE_CHAVE_CAMPO.test(c.chave) && !m.has(c.chave)) m.set(c.chave, c);
  return m;
}

/** O texto gravado de um campo. */
export const textoDoCampo = (chave: string) => `{{${chave}}}`;

/** O HTML do CHIP de um campo (não editável por dentro: apaga-se inteiro, o cursor passa por cima). */
export function htmlChipCampo(c: CampoDado): string {
  const dica = [c.rotulo, c.exemplo ? `Agora: ${c.exemplo}` : "", textoDoCampo(c.chave)].filter(Boolean).join(" · ");
  return `<span ${ATRIBUTO_CAMPO}="${escaparHtmlCampo(c.chave)}" contenteditable="false" class="campo-dado" title="${escaparHtmlCampo(dica)}">${escaparHtmlCampo(c.rotulo)}</span>`;
}

/** Um trecho de TEXTO PURO → HTML com os `{{chave}}` conhecidos como chips (o resto escapado, como estava). */
export function htmlComCampos(texto: string, campos: ReadonlyMap<string, CampoDado>): string {
  if (!campos.size || !texto.includes("{{")) return escaparHtmlCampo(texto);
  let out = "";
  let desde = 0;
  for (const m of texto.matchAll(RE_CAMPO)) {
    const def = campos.get(m[1]);
    if (!def) continue;
    out += escaparHtmlCampo(texto.slice(desde, m.index)) + htmlChipCampo(def);
    desde = (m.index ?? 0) + m[0].length;
  }
  return out + escaparHtmlCampo(texto.slice(desde));
}

/** A chave de um elemento-chip (o atributo, validado) — `null` quando não é chip. */
export function chaveDoChip(getAttribute: ((nome: string) => string | null) | undefined): string | null {
  const k = getAttribute?.(ATRIBUTO_CAMPO) ?? null;
  return k && RE_CHAVE_CAMPO.test(k) ? k : null;
}

/** As chaves usadas num texto (sem repetir, na ordem). */
export function camposDoTexto(texto: string): string[] {
  return [...new Set([...texto.matchAll(RE_CAMPO)].map((m) => m[1]))];
}

/** As chaves usadas que a lista NÃO conhece (o aviso do editor). */
export function camposDesconhecidos(texto: string, conhecidos: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>): string[] {
  const tem = (k: string) => (conhecidos instanceof Map ? conhecidos.has(k) : Object.hasOwn(conhecidos, k));
  return camposDoTexto(texto).filter((k) => !tem(k));
}

/** Troca os `{{chave}}` conhecidos pelos valores (UMA passada — o valor trocado nunca é trocado de novo); o desconhecido fica. */
export function substituirCampos(texto: string, valores: Readonly<Record<string, string>>): string {
  return texto.replace(RE_CAMPO, (todo, k: string) => (Object.hasOwn(valores, k) ? valores[k] : todo));
}

/** Os campos que casam com o termo (chave, nome, grupo ou descrição; sem acento/caixa), na ordem da lista. */
export function filtrarCampos(campos: readonly CampoDado[], termo: string): CampoDado[] {
  const t = semAcento(termo.trim());
  if (!t) return [...campos];
  return campos.filter((c) => [c.chave, c.rotulo, c.grupo ?? "", c.descricao ?? ""].some((x) => semAcento(x).includes(t)));
}
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** O `{{chave}}` COMPLETO logo antes do cursor (quem digitou as chaves inteiras — vira chip na hora). */
export const RE_CAMPO_DIGITADO = /\{\{\s*([a-zA-Z][a-zA-Z0-9]{0,39})\s*\}\}$/;

/** Os campos da lista NA ORDEM em que aparecem (filtrados e agrupados) — a mesma ordem do ↑/↓ e do desenho. */
export const camposEmOrdem = (campos: readonly CampoDado[], termo: string): CampoDado[] => gruposDeCampos(filtrarCampos(campos, termo)).flatMap((g) => g.campos);

/** Os campos agrupados (na ordem em que os grupos aparecem). */
export function gruposDeCampos(campos: readonly CampoDado[]): { grupo: string; campos: CampoDado[] }[] {
  const m = new Map<string, CampoDado[]>();
  for (const c of campos) {
    const g = c.grupo ?? "Dados";
    m.set(g, [...(m.get(g) ?? []), c]);
  }
  return [...m].map(([grupo, cs]) => ({ grupo, campos: cs }));
}

/** O mínimo de um nó do DOM que a leitura de uma LINHA usa (o campo de uma linha passa o DOM real; os testes, uma árvore). */
export type NoLinha = { nodeType: number; nodeName: string; textContent: string | null; childNodes: ArrayLike<NoLinha>; getAttribute?: (nome: string) => string | null };

/** O conteúdo de um campo de UMA LINHA (texto + chips) → o texto gravado: o chip vira `{{chave}}`, quebras e espaços
 * especiais viram um espaço, o espaço de largura zero sai. */
export function textoDaLinha(raiz: NoLinha): string {
  const ler = (n: NoLinha): string => {
    if (n.nodeType === 3) return (n.textContent ?? "").replace(/\u200b/g, "").replace(/[\u00a0\r\n\t]/g, " ");
    if (n.nodeType !== 1) return "";
    if (n.nodeName.toUpperCase() === "BR") return " ";
    const chave = chaveDoChip(n.getAttribute);
    if (chave) return textoDoCampo(chave);
    return Array.from(n.childNodes).map(ler).join("");
  };
  return Array.from(raiz.childNodes).map(ler).join("").replace(/ {2,}/g, " ");
}
