import type { FiltroId } from "./escopo-unidades-core";
/**
 * FILTRO DA UNIDADE DO CABEÇALHO — quais telas obedecem à unidade escolhida no cabeçalho (Configurações → "Filtro da
 * unidade"). Módulo PURO (cliente e servidor; testado). A Mesa sempre obedece; os demais módulos o ADM liga/desliga.
 * A unidade "Geral" (ou nenhuma escolhida pelo ADM) = sem filtro, como sempre.
 */

export const MODULOS_ESCOPO = ["pca", "orcamento", "catalogo", "tarefas", "calendario", "automacao"] as const;
export type ModuloEscopo = (typeof MODULOS_ESCOPO)[number];

/** Catálogo: `usados` = só os itens/históricos cujo código aparece nos DFDs da unidade; `todos` = o catálogo inteiro. */
export const MODOS_CATALOGO = ["usados", "todos"] as const;
export type ModoCatalogo = (typeof MODOS_CATALOGO)[number];

export type ConfigEscopo = {
  /** Os módulos que obedecem à unidade do cabeçalho. */
  modulos: Record<ModuloEscopo, boolean>;
  catalogo: ModoCatalogo;
  /** Orçamento: mostrar também os lançamentos SEM vínculo a nenhuma unidade. */
  orcamentoSemVinculo: boolean;
  /** Tarefas/Calendário: mostrar também as tarefas SEM vínculo a protocolo/DFD/item. */
  tarefasSemVinculo: boolean;
};

export const CONFIG_ESCOPO_PADRAO: ConfigEscopo = Object.freeze({
  modulos: Object.freeze({ pca: true, orcamento: true, catalogo: true, tarefas: true, calendario: true, automacao: true }),
  catalogo: "usados",
  orcamentoSemVinculo: false,
  tarefasSemVinculo: true,
}) as ConfigEscopo;

export const ROTULO_MODULO_ESCOPO: Record<ModuloEscopo, string> = {
  pca: "PCA",
  orcamento: "Orçamento",
  catalogo: "Catálogo",
  tarefas: "Tarefas",
  calendario: "Calendário",
  automacao: "Automação",
};

const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);

/** Qualquer JSON → a config válida (o que falta vale o padrão). */
export function lerConfigEscopo(v: unknown): ConfigEscopo {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const m = o.modulos && typeof o.modulos === "object" ? (o.modulos as Record<string, unknown>) : {};
  const p = CONFIG_ESCOPO_PADRAO;
  return {
    modulos: Object.fromEntries(MODULOS_ESCOPO.map((k) => [k, bool(m[k], p.modulos[k])])) as Record<ModuloEscopo, boolean>,
    catalogo: o.catalogo === "todos" ? "todos" : "usados",
    orcamentoSemVinculo: bool(o.orcamentoSemVinculo, p.orcamentoSemVinculo),
    tarefasSemVinculo: bool(o.tarefasSemVinculo, p.tarefasSemVinculo),
  };
}

/** O que mudou, em texto (auditoria). */
export function diffConfigEscopo(a: ConfigEscopo, b: ConfigEscopo): string[] {
  const d: string[] = [];
  for (const k of MODULOS_ESCOPO) if (a.modulos[k] !== b.modulos[k]) d.push(`${ROTULO_MODULO_ESCOPO[k]} ${b.modulos[k] ? "obedece" : "não obedece"}`);
  if (a.catalogo !== b.catalogo) d.push(`catálogo: ${b.catalogo === "usados" ? "só os itens usados pela unidade" : "inteiro"}`);
  if (a.orcamentoSemVinculo !== b.orcamentoSemVinculo) d.push(`orçamento sem vínculo ${b.orcamentoSemVinculo ? "visível" : "oculto"}`);
  if (a.tarefasSemVinculo !== b.tarefasSemVinculo) d.push(`tarefas sem vínculo ${b.tarefasSemVinculo ? "visíveis" : "ocultas"}`);
  return d;
}

/**
 * A unidade que FILTRA um módulo: o id da unidade (`idDoFiltro`), `null` = sem filtro (Geral, ou módulo desligado) e
 * `false` = nenhuma (a lista fica vazia).
 */
export function filtroDoModulo(cfg: ConfigEscopo, modulo: ModuloEscopo, id: FiltroId): FiltroId {
  return cfg.modulos[modulo] ? id : null;
}

/** A tarefa entra na unidade? Pelas UNIDADES dos vínculos (protocolo/DFD/item); sem vínculo, conforme a config. */
export function tarefaNaUnidade(unidades: readonly number[], id: number | readonly number[], semVinculo: boolean): boolean {
  if (unidades.length === 0) return semVinculo;
  return typeof id === "number" ? unidades.includes(id) : unidades.some((u) => id.includes(u));
}

/** O lançamento do orçamento entra na unidade? Pela unidade de cadastro dele (o vínculo); sem vínculo, conforme a config. */
export function lancamentoNaUnidade(unidadeId: number | null | undefined, id: number | readonly number[], semVinculo: boolean): boolean {
  if (unidadeId == null) return semVinculo;
  return typeof id === "number" ? unidadeId === id : id.includes(unidadeId);
}
