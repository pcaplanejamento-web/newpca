/**
 * TELA PÚBLICA (consulta do PCA sem login) — as abas que o ADM publica. Núcleo PURO (testado): a lista é FECHADA — só
 * Dashboard, Orçamento e Documentos podem ser públicas (Mesa, Importação e Configuração NUNCA); o Dashboard é sempre
 * público (é o que a tela inicial sempre mostrou).
 */

export const ABAS_PUBLICAS = ["dashboard", "orcamento", "documentos"] as const;
export type AbaPublica = (typeof ABAS_PUBLICAS)[number];

export const ROTULO_ABA_PUBLICA: Record<AbaPublica, string> = { dashboard: "Dashboard", orcamento: "Orçamento", documentos: "Documentos" };

/** O menu lateral da tela pública começa aberto ou recolhido (o ADM decide; o visitante alterna só na visita). */
export const MENUS_PUBLICO = ["aberto", "recolhido"] as const;
export type MenuPublico = (typeof MENUS_PUBLICO)[number];

export type ConfigPublico = { abas: AbaPublica[]; menu: MenuPublico };

export const PUBLICO_PADRAO: ConfigPublico = { abas: ["dashboard"], menu: "aberto" };

const ehAbaPublica = (v: unknown): v is AbaPublica => typeof v === "string" && (ABAS_PUBLICAS as readonly string[]).includes(v);

/** Qualquer JSON → a configuração válida: só as abas da lista, na ordem dela, com o Dashboard sempre. */
export function lerConfigPublico(v: unknown): ConfigPublico {
  const lidas = v && typeof v === "object" && Array.isArray((v as { abas?: unknown }).abas) ? (v as { abas: unknown[] }).abas : [];
  const set = new Set(lidas.filter(ehAbaPublica));
  set.add("dashboard");
  const menu = v && typeof v === "object" && (v as { menu?: unknown }).menu === "recolhido" ? "recolhido" : "aberto";
  return { abas: ABAS_PUBLICAS.filter((a) => set.has(a)), menu };
}

/** A aba pedida na URL → a que vale (fora das públicas = o Dashboard). */
export function abaPublicaPedida(cfg: ConfigPublico, pedida: string | undefined): AbaPublica {
  return ehAbaPublica(pedida) && cfg.abas.includes(pedida) ? pedida : "dashboard";
}

/** Os itens do MENU público: as abas publicadas + a CONSULTA DE ITENS (parte do Dashboard — sempre pública), logo depois dele. */
export type VistaPublica = AbaPublica | "consulta";
export const ROTULO_VISTA_PUBLICA: Record<VistaPublica, string> = { ...ROTULO_ABA_PUBLICA, consulta: "Consulta de itens" };

export function vistasDoMenu(cfg: ConfigPublico): VistaPublica[] {
  return cfg.abas.flatMap((a): VistaPublica[] => (a === "dashboard" ? ["dashboard", "consulta"] : [a]));
}

/** A vista pedida na URL → a que vale (fora do menu = o Dashboard). */
export function vistaPublicaPedida(cfg: ConfigPublico, pedida: string | undefined): VistaPublica {
  return pedida === "consulta" ? "consulta" : abaPublicaPedida(cfg, pedida);
}

/** A GUARDA de toda leitura pública: PCA publicado (ou visto por quem entrou — o Preview) + a aba publicada pelo ADM. */
export function podeLerPublico(pca: { status: string } | null, cfg: ConfigPublico, aba: AbaPublica, logado: boolean): boolean {
  if (!pca) return false;
  if (pca.status !== "publicado" && !logado) return false;
  return cfg.abas.includes(aba);
}

export function diffPublico(antes: ConfigPublico, depois: ConfigPublico): string {
  const r = (c: ConfigPublico) => c.abas.map((a) => ROTULO_ABA_PUBLICA[a]).join(", ");
  const partes: string[] = [];
  if (r(antes) !== r(depois)) partes.push(`abas públicas: ${r(antes)} → ${r(depois)}`);
  if (antes.menu !== depois.menu) partes.push(`menu: ${antes.menu} → ${depois.menu}`);
  return partes.join("; ") || "sem mudança";
}
