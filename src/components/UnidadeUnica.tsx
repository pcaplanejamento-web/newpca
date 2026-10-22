"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useContext } from "react";
import { chaveDaRota } from "@/lib/escopo-unidades-core";
import type { ModuloEscopo } from "@/lib/escopo-cabecalho-core";

/** A unidade ÚNICA escolhida no cabeçalho (null = "Geral" ou nenhuma). Com ela, as telas tiram as colunas, filtros e
 *  opções de unidade — os dados já vêm só dela (o filtro é do servidor); "Geral" mostra a interface completa. */
export type UnidadeAtiva = { id: number; sigla: string; nome: string };

type Valor = { unidade: UnidadeAtiva | null; modulos: Partial<Record<ModuloEscopo, boolean>> };
const Ctx = createContext<Valor>({ unidade: null, modulos: {} });

/** `todasAsUnidades` = as abas (tela.aba) em que o grupo vê TODAS as unidades: lá a interface não é "de uma unidade". */
export function UnidadeUnica({
  children,
  unidade,
  modulos,
  todasAsUnidades,
}: Valor & { todasAsUnidades?: readonly string[]; children: ReactNode }) {
  const busca = useSearchParams();
  const chave = chaveDaRota(usePathname(), { aba: busca.get("aba"), pca: busca.get("pca") });
  const efetiva = chave && todasAsUnidades?.includes(chave) ? null : unidade;
  return <Ctx.Provider value={{ unidade: efetiva, modulos }}>{children}</Ctx.Provider>;
}

/** A unidade única do cabeçalho, ou null (Geral, fora do painel ou o módulo que NÃO obedece à unidade — Configurações →
 *  Filtro da unidade: lá os dados vêm de todas e as colunas de unidade ficam). Sem módulo = a Mesa (sempre obedece). */
export function useUnidadeUnica(modulo?: ModuloEscopo): UnidadeAtiva | null {
  const { unidade, modulos } = useContext(Ctx);
  if (!unidade) return null;
  return modulo && modulos[modulo] === false ? null : unidade;
}

/** As colunas/filtros de unidade SAEM? Só com a unidade única no cabeçalho E TODAS as linhas dela — uma linha sem
 *  unidade (a definir) ou de outra (protocolo com DFD de outra unidade, tarefa ligada a várias) mantém a coluna, que aí
 *  informa algo. */
export function useSemUnidade(valores: () => Iterable<string | null | undefined>, modulo?: ModuloEscopo): boolean {
  const unidade = useUnidadeUnica(modulo);
  if (!unidade) return false;
  return todasDaUnidade(valores(), unidade.sigla);
}

/** Todo valor é a sigla da unidade (vazio ou "—" = sem unidade → não). */
export function todasDaUnidade(valores: Iterable<string | null | undefined>, sigla: string): boolean {
  for (const v of valores) if (v !== sigla) return false;
  return true;
}
