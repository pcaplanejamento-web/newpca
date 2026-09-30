/**
 * ESCOPO DE UNIDADES — de quais unidades a pessoa vê e altera os dados. Módulo PURO (cliente e servidor; testado).
 *
 * Três estados (antes "sem unidade" virava `null` = sem filtro, e quem não tinha grupo via a Mesa inteira):
 * - `todas`: o ADM (regra firme) ou um grupo que concede a unidade virtual "Geral" (código GERAL = todas);
 * - `unidades`: só as unidades listadas;
 * - `nenhuma`: sem grupo, ou grupo sem unidade — não vê dado nenhum.
 */

/** Código da unidade VIRTUAL "Geral" = todas as unidades (concedida por grupo; nunca editada). */
export const CODIGO_GERAL = "GERAL";

export function ehCodigoGeral(codigo: string | null | undefined): boolean {
  return (codigo ?? "").trim().toUpperCase() === CODIGO_GERAL;
}

export type UnidadeRef = { id: number; codigo: string };

export type EscopoUnidades = { tipo: "todas" } | { tipo: "unidades"; ids: readonly number[] } | { tipo: "nenhuma" };

export const ESCOPO_TODAS: EscopoUnidades = Object.freeze({ tipo: "todas" });
export const ESCOPO_NENHUMA: EscopoUnidades = Object.freeze({ tipo: "nenhuma" });

/** O que a pessoa ACESSA (detalhe e escrita): ADM = todas; a "Geral" entre as do grupo = todas; sem unidade = nenhuma. */
export function escopoDeAcesso(admin: boolean, lista: readonly UnidadeRef[]): EscopoUnidades {
  if (admin || lista.some((r) => ehCodigoGeral(r.codigo))) return ESCOPO_TODAS;
  if (lista.length === 0) return ESCOPO_NENHUMA;
  return { tipo: "unidades", ids: [...new Set(lista.map((r) => r.id))] };
}

/** O filtro das LISTAS (a unidade ATIVA do cabeçalho): todas · uma unidade · nenhuma (a consulta nem roda). */
export type FiltroLista = { tipo: "todas" } | { tipo: "unidade"; id: number; codigo: string } | { tipo: "nenhuma" };

export const FILTRO_TODAS: FiltroLista = Object.freeze({ tipo: "todas" });
export const FILTRO_NENHUMA: FiltroLista = Object.freeze({ tipo: "nenhuma" });

/**
 * O que as LISTAS mostram: a unidade ATIVA do cabeçalho — a "Geral" = todas as que a pessoa acessa; sem unidade ativa,
 * nada (o ADM, que acessa todas, vê todas).
 */
export function filtroDeLista(admin: boolean, ativa: UnidadeRef | null): FiltroLista {
  if (!ativa) return admin ? FILTRO_TODAS : FILTRO_NENHUMA;
  if (ehCodigoGeral(ativa.codigo)) return FILTRO_TODAS;
  return { tipo: "unidade", id: ativa.id, codigo: ativa.codigo };
}

/** O id para as consultas que filtram por UMA unidade: `null` = todas; `false` = nenhuma (a lista é vazia). */
export function idDoFiltro(f: FiltroLista): number | null | false {
  return f.tipo === "todas" ? null : f.tipo === "nenhuma" ? false : f.id;
}

/**
 * O registro está no escopo? O registro SEM unidade (`null`) fica com quem tem alguma unidade (como sempre foi); no
 * escopo "nenhuma", nada.
 */
export function unidadeNoEscopo(escopo: EscopoUnidades, reparticaoId: number | null | undefined): boolean {
  if (escopo.tipo === "todas") return true;
  if (escopo.tipo === "nenhuma") return false;
  return reparticaoId == null || escopo.ids.includes(reparticaoId);
}
