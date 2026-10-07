import { colunasDe, type ColunasMesa, type EntidadeColuna } from "@/lib/mesa-colunas-core";
import { CelulaTexto } from "./CelulaLista";
import type { Column } from "./DataTable";

/**
 * As COLUNAS que as automações criaram numa tabela da Mesa (o nó "Gravar na coluna da Mesa"): uma por coluna da entidade,
 * com o valor gravado para a linha (vazio = "—"). Filtráveis, ordenáveis e exportáveis como as demais.
 */
export function colunasDaAutomacao<T>(c: ColunasMesa | undefined, entidade: EntidadeColuna, idDe: (r: T) => number): Column<T>[] {
  return colunasDe(c, entidade).map((col) => {
    const valores = c?.valores[col.id] ?? {};
    const valor = (r: T) => valores[idDe(r)] ?? "";
    return {
      key: `auto:${col.id}`,
      header: col.nome,
      minWidth: 140,
      value: (r: T) => valor(r) || "—",
      render: (r: T) => (valor(r) ? <CelulaTexto texto={valor(r)} /> : <span className="text-faint">—</span>),
    };
  });
}
