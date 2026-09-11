// Aparência controlada pelo ADM → CSS. Serialização SEGURA (anti-XSS): só
// tokens de uma allowlist recebem valores estritamente hex; raio é número
// clampado. Nada de string livre entra no CSS injetado. Módulo puro (testável).

/** Tokens de cor que o ADM pode editar (allowlist). Chave = nome do CSS var. */
export const TOKENS_COR = [
  "bg", "surface", "surface-2", "text", "text-2", "muted", "faint",
  "border", "border-2", "accent", "accent-soft", "track", "sb-active", "kpi-bar",
] as const;
export type TokenCor = (typeof TOKENS_COR)[number];

/** Defaults de fábrica (espelham globals.css §2) — para o painel do ADM iniciar
 * os seletores e para "restaurar padrão". */
export const DEFAULT_CORES: { light: Record<TokenCor, string>; dark: Record<TokenCor, string> } = {
  light: {
    bg: "#ffffff", surface: "#ffffff", "surface-2": "#fafaf8", text: "#1c1c22",
    "text-2": "#3f3f3a", muted: "#8a8a80", faint: "#b5b5aa", border: "#f1f1eb",
    "border-2": "#e9e9e2", accent: "#4f46e5", "accent-soft": "#eef0ff",
    track: "#f1f1eb", "sb-active": "#fafaf8", "kpi-bar": "#e9e9e2",
  },
  dark: {
    bg: "#08080c", surface: "#14141b", "surface-2": "#191922", text: "#f3f3f5",
    "text-2": "#c7c7d2", muted: "#83839a", faint: "#565668", border: "#20202b",
    "border-2": "#282836", accent: "#818cf8", "accent-soft": "#1e1e3a",
    track: "#20202b", "sb-active": "#1c1c26", "kpi-bar": "#26263a",
  },
};

export type Aparencia = {
  cores?: { light?: Record<string, string>; dark?: Record<string, string> };
  radius?: number;
  density?: "compact" | "default" | "comfortable";
  motion?: "off" | "reduced" | "default" | "smooth";
  identidade?: { nome?: string; subtitulo?: string; favicon?: string };
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const PERMITIDAS = new Set<string>(TOKENS_COR);

function blocoCores(sel: string, cores?: Record<string, string>): string {
  if (!cores) return "";
  const linhas: string[] = [];
  for (const [k, v] of Object.entries(cores)) {
    if (PERMITIDAS.has(k) && typeof v === "string" && HEX.test(v)) {
      linhas.push(`--${k}:${v};`);
    }
  }
  return linhas.length ? `${sel}{${linhas.join("")}}` : "";
}

/** Gera o CSS de override (cores claro/escuro + raio). Seguro por construção. */
export function aparenciaToCss(a: Aparencia): string {
  let css = "";
  css += blocoCores('[data-theme="light"]', a.cores?.light);
  css += blocoCores('[data-theme="dark"]', a.cores?.dark);
  if (typeof a.radius === "number" && Number.isFinite(a.radius)) {
    const r = Math.max(0, Math.min(24, Math.round(a.radius)));
    css +=
      `:root{--radius-card:${r}px;--radius-control:${Math.max(6, r - 4)}px;` +
      `--radius-chip:${Math.max(4, r - 5)}px;--radius-segment:${Math.max(6, r - 3)}px;}`;
  }
  return css;
}

/** Parse tolerante do JSON persistido em `configuracoes.dados`. */
export function parseAparencia(dados: string | null | undefined): Aparencia {
  if (!dados) return {};
  try {
    const o = JSON.parse(dados);
    return o && typeof o === "object" ? (o as Aparencia) : {};
  } catch {
    return {};
  }
}
