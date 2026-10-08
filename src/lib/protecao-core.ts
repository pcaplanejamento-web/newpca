// PROTEÇÃO DE DADOS (núcleo puro, sem DOM/D1): o ADM escolhe os bloqueios (seleção/cópia nativa, impressão/captura e
// ocultar ao sair da janela), os PAPÉIS em que valem e se a tela pública também é bloqueada. Blob `configuracoes`, chave
// `protecao` — sem migração; tudo desligado por padrão (nada muda até o ADM ligar).

export type Bloqueios = { selecao: boolean; print: boolean; foco: boolean };
export type ConfigProtecao = Bloqueios & { papeis: number[]; publica: boolean };

export const PROTECAO_PADRAO: ConfigProtecao = { selecao: false, print: false, foco: false, papeis: [], publica: false };

/** Qualquer JSON → a config válida (ids de papel inteiros positivos, sem repetir, até 200). */
export function lerConfigProtecao(v: unknown): ConfigProtecao {
  if (!v || typeof v !== "object") return { ...PROTECAO_PADRAO, papeis: [] };
  const o = v as Record<string, unknown>;
  const papeis = Array.isArray(o.papeis)
    ? [...new Set(o.papeis.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0))].slice(0, 200)
    : [];
  return { selecao: o.selecao === true, print: o.print === true, foco: o.foco === true, papeis, publica: o.publica === true };
}

function bloqueiosDe(cfg: ConfigProtecao): Bloqueios | null {
  return cfg.selecao || cfg.print || cfg.foco ? { selecao: cfg.selecao, print: cfg.print, foco: cfg.foco } : null;
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
  return partes.join("\n");
}

const ROTULOS: Record<keyof Bloqueios | "publica", string> = {
  selecao: "bloquear seleção e cópia",
  print: "bloquear impressão e captura",
  foco: "ocultar ao sair da janela",
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
