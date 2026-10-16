// PROTEÇÃO DE DADOS (núcleo puro, sem DOM/D1): o ADM escolhe os bloqueios (seleção/cópia nativa, impressão/captura,
// ocultar ao sair da janela e a marca d'água com quem vê), os PAPÉIS em que valem e se a tela pública também é bloqueada. Blob `configuracoes`, chave
// `protecao` — sem migração; tudo desligado por padrão (nada muda até o ADM ligar).

export type Bloqueios = { selecao: boolean; print: boolean; foco: boolean; marca: boolean };
export type ConfigProtecao = Bloqueios & { papeis: number[]; publica: boolean };

export const PROTECAO_PADRAO: ConfigProtecao = { selecao: false, print: false, foco: false, marca: false, papeis: [], publica: false };

/** Qualquer JSON → a config válida (ids de papel inteiros positivos, sem repetir, até 200). */
export function lerConfigProtecao(v: unknown): ConfigProtecao {
  if (!v || typeof v !== "object") return { ...PROTECAO_PADRAO, papeis: [] };
  const o = v as Record<string, unknown>;
  const papeis = Array.isArray(o.papeis)
    ? [...new Set(o.papeis.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0))].slice(0, 200)
    : [];
  return { selecao: o.selecao === true, print: o.print === true, foco: o.foco === true, marca: o.marca === true, papeis, publica: o.publica === true };
}

function bloqueiosDe(cfg: ConfigProtecao): Bloqueios | null {
  return cfg.selecao || cfg.print || cfg.foco || cfg.marca ? { selecao: cfg.selecao, print: cfg.print, foco: cfg.foco, marca: cfg.marca } : null;
}

/** Os bloqueios da pessoa pelo PAPEL dela (`null` = nenhum: papel fora da lista ou nada ligado). */
export function protecaoDoPapel(cfg: ConfigProtecao, papelId: number | null | undefined): Bloqueios | null {
  if (papelId == null || !cfg.papeis.includes(papelId)) return null;
  return bloqueiosDe(cfg);
}

/** Os bloqueios da TELA PÚBLICA (`null` = o ADM não a protege). */
export function protecaoPublica(cfg: ConfigProtecao): Bloqueios | null {
  return cfg.publica ? bloqueiosDe(cfg) : null;
}

/** Os campos que continuam selecionáveis/editáveis com a seleção bloqueada. */
export const SELETOR_CAMPO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** O atributo do `<html>` que COBRE a tela enquanto a janela está sem foco ("Ocultar ao sair da janela") — posto direto no
 * DOM pelo ouvinte, sem esperar o React. A proteção de captura/impressão é INVISÍVEL: nunca cobre a tela. */
export const ATRIBUTO_COBRIR = "data-protecao-cobrir";

/** O CSS GLOBAL dos bloqueios (vale desde a 1ª pintura e também nos banners por portal). */
export function cssProtecao(b: Bloqueios): string {
  const partes: string[] = [];
  if (b.selecao) {
    partes.push(
      "html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}",
      `:is(${SELETOR_CAMPO}){-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}`,
      "img{-webkit-user-drag:none}",
    );
  }
  if (b.print) {
    partes.push(
      '@media print{html,body{background:#fff!important}body *{visibility:hidden!important}body::before{content:"Impressão bloqueada pela administração do sistema.";visibility:visible;display:block;padding:48px;font:600 16px sans-serif;color:#000}}',
    );
  }
  if (b.marca) {
    // No PAPEL a marca d'água sai legível (a da tela é imperceptível).
    partes.push("@media print{[data-marca-dagua]{background-image:var(--marca-papel)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}");
  }
  if (b.foco) {
    partes.push(
      `html[${ATRIBUTO_COBRIR}] body{visibility:hidden!important}`,
      `html[${ATRIBUTO_COBRIR}]::after{content:"Conteúdo protegido pela administração do sistema";position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:var(--surface,#fff);color:var(--muted,#666);font:600 15px var(--font-sans,sans-serif)}`,
    );
  }
  return partes.join("\n");
}

/** Escapa o texto para dentro de um SVG. */
function escaparXml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

/** A opacidade da marca d'água: na TELA, abaixo do que o olho percebe (a captura a guarda — aparece ao realçar o
 * contraste); no PAPEL, legível. */
export const OPACIDADE_MARCA = { tela: 0.035, papel: 0.28 } as const;

/** A MARCA D'ÁGUA (quem vê + quando) como imagem de fundo repetida — um SVG em data-URL, diagonal, em cinza translúcido
 * (vale no claro e no escuro). O texto vai escapado e cortado a 120 caracteres. */
export function svgMarcaDagua(texto: string, opacidade: number = OPACIDADE_MARCA.tela): string {
  const t = escaparXml(texto.replace(/\s+/g, " ").trim().slice(0, 120));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="210" y="110" text-anchor="middle" transform="rotate(-24 210 110)" font-family="sans-serif" font-size="14" font-weight="600" fill="#808080" fill-opacity="${opacidade}">${t}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

const ROTULOS: Record<keyof Bloqueios | "publica", string> = {
  selecao: "bloquear seleção e cópia",
  print: "bloquear impressão e captura",
  foco: "ocultar ao sair da janela",
  marca: "marca d'água com quem vê",
  publica: "também na tela pública",
};

/** O resumo da mudança para a auditoria. */
export function diffProtecao(antes: ConfigProtecao, depois: ConfigProtecao, nomes: Map<number, string>): string {
  const linhas = (Object.keys(ROTULOS) as (keyof typeof ROTULOS)[])
    .filter((k) => antes[k] !== depois[k])
    .map((k) => `${ROTULOS[k]} ${depois[k] ? "ligado" : "desligado"}`);
  const a = [...antes.papeis].sort().join(",");
  const d = [...depois.papeis].sort().join(",");
  if (a !== d) linhas.push(`papéis: ${depois.papeis.map((id) => nomes.get(id) ?? `#${id}`).join(", ") || "nenhum"}`);
  return linhas.join("; ") || "sem mudança";
}
