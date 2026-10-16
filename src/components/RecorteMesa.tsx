"use client";

import { contarFiltros, ROTULO_VISAO_RECORTE, rotuloChipRecorte, type VisaoRecorte } from "@/lib/mesa-recorte";
import { IconClose } from "./icons";

/** A faixa "Recorte da Mesa": um chip por OUTRA visão com filtros que recortam a visão aberta (✕ tira os filtros dela) +
 * "Limpar recorte" (zera os filtros das três visões). Some quando nada recorta. */
export function RecorteMesa({
  filtros,
  atual,
  onRemover,
  onLimpar,
}: {
  /** Os filtros de coluna guardados de cada visão. */
  filtros: Partial<Record<VisaoRecorte, Record<string, unknown>>>;
  /** A visão aberta (os filtros dela ficam na própria tabela, não viram chip). */
  atual: VisaoRecorte | null;
  onRemover: (v: VisaoRecorte) => void;
  onLimpar: () => void;
}) {
  const outras = (Object.keys(ROTULO_VISAO_RECORTE) as VisaoRecorte[])
    .filter((v) => v !== atual)
    .map((v) => ({ v, n: contarFiltros(filtros[v]) }))
    .filter((x) => x.n > 0);
  if (outras.length === 0) return null;
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0 text-[12px]" aria-label="Recorte da Mesa">
      <span className="font-semibold text-muted">Recorte da Mesa:</span>
      {outras.map(({ v, n }) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-chip border border-accent/40 bg-accent-soft py-0.5 pl-2.5 pr-1 text-accent">
          {rotuloChipRecorte(v, n)}
          <button
            type="button"
            onClick={() => onRemover(v)}
            title={`Tirar os filtros de ${ROTULO_VISAO_RECORTE[v]}`}
            aria-label={`Tirar os filtros de ${ROTULO_VISAO_RECORTE[v]}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 pointer-coarse:h-8 pointer-coarse:w-8"
          >
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onLimpar}
        className="rounded px-1.5 py-0.5 font-medium text-muted underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        Limpar recorte
      </button>
    </fieldset>
  );
}
