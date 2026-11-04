import { type ColunaMesa, colunasDe, colunasNosItens, type ColunasMesa, type EntidadeColuna } from "@/lib/mesa-colunas-core";
import { CelulaTexto } from "./CelulaLista";
import type { Column } from "./DataTable";

/**
 * As COLUNAS que as automações criaram numa tabela da Mesa (o nó "Gravar na coluna da Mesa"): uma por coluna da entidade,
 * com o valor gravado para a linha (vazio = "—"). Filtráveis, ordenáveis e exportáveis como as demais.
 */
export function colunasDaAutomacao<T>(c: ColunasMesa | undefined, entidade: EntidadeColuna, idDe: (r: T) => number): Column<T>[] {
  return colunasDe(c, entidade).map((col) => colunaDe(c, col, idDe, "auto"));
}

/** As colunas de DFD marcadas "também nos Itens" na tabela de Itens: o valor é o do DFD de cada item (`dfdIdDe`). */
export function colunasDoDfdNosItens<T>(c: ColunasMesa | undefined, dfdIdDe: (r: T) => number): Column<T>[] {
  return colunasNosItens(c).map((col) => colunaDe(c, col, dfdIdDe, "autoDfd"));
}

function colunaDe<T>(c: ColunasMesa | undefined, col: ColunaMesa, idDe: (r: T) => number, prefixo: string): Column<T> {
  const valores = c?.valores[col.id] ?? {};
  const valor = (r: T) => valores[idDe(r)] ?? "";
  return {
    key: `${prefixo}:${col.id}`,
    header: col.nome,
    minWidth: 140,
    value: (r: T) => valor(r) || "—",
    render: (r: T) => (valor(r) ? <CelulaTexto texto={valor(r)} /> : <span className="text-faint">—</span>),
  };
}
