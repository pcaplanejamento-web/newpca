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
    bg: "#ffffff", surface: "#ffffff", "surface-2": "#f4f6f8", text: "#0f1626",
    "text-2": "#2d3644", muted: "#586173", faint: "#8a93a3", border: "#ebeef2",
    "border-2": "#dee2e8", accent: "#4f46e5", "accent-soft": "#eef1ff",
    track: "#ebeef2", "sb-active": "#f4f6f8", "kpi-bar": "#dee2e8",
  },
  dark: {
    bg: "#0a0c11", surface: "#141821", "surface-2": "#1a1f2a", text: "#f4f6f9",
    "text-2": "#cbd2dd", muted: "#98a1b2", faint: "#6d7585", border: "#232834",
    "border-2": "#2c3340", accent: "#818cf8", "accent-soft": "#20233c",
    track: "#232834", "sb-active": "#191d27", "kpi-bar": "#2c3340",
  },
};

export type Aparencia = {
  cores?: { light?: Record<string, string>; dark?: Record<string, string> };
  radius?: number;
  density?: "compact" | "default" | "comfortable";
  motion?: "off" | "reduced" | "default" | "smooth";
  /** Elevação dos cards: "ring" (anel/sombra padrão) ou "soft" (sombra suave). */
  elevation?: "ring" | "soft";
  /** Estilo dos KPIs: "outline" (contorno, padrão) ou "filled" (preenchido). */
  kpi?: "outline" | "filled";
  /** Ícones (lucide): espessura, tom global (opcional), preenchido e animação. */
  icones?: {
    stroke?: number;
    tint?: string;
    fill?: "none" | "duotone";
    anim?: "none" | "hover";
  };
  identidade?: { nome?: string; subtitulo?: string; favicon?: string };
  /** TABELAS (Configurações → Tabelas): linhas por página com que as tabelas de rolagem interna (a Mesa) abrem. */
  tabelas?: { linhas?: LinhasTabela };
};

/** Linhas por página das tabelas de rolagem interna (o seletor do rodapé) e o padrão de fábrica. */
export const LINHAS_TABELA = [30, 50, 100, 200] as const;
export type LinhasTabela = (typeof LINHAS_TABELA)[number];
export const LINHAS_TABELA_PADRAO: LinhasTabela = 30;

/** As linhas iniciais das tabelas definidas pelo ADM (valor fora das opções = o padrão de fábrica). */
export function linhasTabela(a: Aparencia): LinhasTabela {
  const v = a.tabelas?.linhas;
  return LINHAS_TABELA.includes(v as LinhasTabela) ? (v as LinhasTabela) : LINHAS_TABELA_PADRAO;
}

/** Chaves VISUAIS da aparência (o "Restaurar padrão" da tela Aparência zera só estas — identidade, tabelas e os blocos
 * irmãos do mesmo registro, como a avaliação e as integrações, ficam). */
export const CHAVES_VISUAIS = ["cores", "radius", "density", "motion", "elevation", "kpi", "icones"] as const;

/** A configuração SEM as chaves visuais (o que sobrevive ao "Restaurar padrão" da Aparência). */
export function semChavesVisuais<T extends Record<string, unknown>>(dados: T): Partial<T> {
  const resto: Record<string, unknown> = { ...dados };
  for (const k of CHAVES_VISUAIS) delete resto[k];
  return resto as Partial<T>;
}

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
  if (a.icones) {
    const linhas: string[] = [];
    if (typeof a.icones.stroke === "number" && Number.isFinite(a.icones.stroke)) {
      // clampa e limita casas decimais — só número entra no CSS.
      const s = Math.round(Math.max(1, Math.min(3, a.icones.stroke)) * 100) / 100;
      linhas.push(`--icon-stroke:${s};`);
    }
    if (typeof a.icones.tint === "string" && HEX.test(a.icones.tint)) {
      linhas.push(`--icon-tint:${a.icones.tint};`);
    }
    if (linhas.length) css += `:root{${linhas.join("")}}`;
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
