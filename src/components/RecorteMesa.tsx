"use client";

import { contarFiltros, ROTULO_VISAO_RECORTE, rotuloChipRecorte, type VisaoRecorte } from "@/lib/mesa-recorte";
import { IconClose } from "./icons";

type FiltrosRecorte = Partial<Record<VisaoRecorte, Record<string, unknown>>>;

/** As OUTRAS visões com filtros que recortam a visão aberta. */
export function visoesNoRecorte(filtros: FiltrosRecorte, atual: VisaoRecorte | null) {
  return (Object.keys(ROTULO_VISAO_RECORTE) as VisaoRecorte[])
    .filter((v) => v !== atual)
    .map((v) => ({ v, n: contarFiltros(filtros[v]) }))
    .filter((x) => x.n > 0);
}

/** O "Recorte da Mesa" dentro do menu de filtros do RODAPÉ da tabela: uma linha por OUTRA visão com filtros (✕ tira os
 * filtros dela) + "Limpar recorte" (zera os filtros das três visões). Nada quando nada recorta. */
export function RecorteMesa({
  filtros,
  atual,
  onRemover,
  onLimpar,
}: {
  /** Os filtros de coluna guardados de cada visão. */
  filtros: FiltrosRecorte;
  /** A visão aberta (os filtros dela ficam na própria tabela). */
  atual: VisaoRecorte | null;
  onRemover: (v: VisaoRecorte) => void;
  onLimpar: () => void;
}) {
  const outras = visoesNoRecorte(filtros, atual);
  if (outras.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recorte da Mesa</p>
        <button type="button" onClick={onLimpar} className="min-h-11 rounded px-1.5 text-[12px] font-medium text-accent hover:underline lg:min-h-7">
          Limpar recorte
        </button>
      </div>
      <ul className="space-y-0.5">
        {outras.map(({ v, n }) => (
          <li key={v} className="flex items-center justify-between gap-2 rounded-chip px-1.5 text-[13px] hover:bg-surface-2">
            <span className="min-w-0 truncate">{rotuloChipRecorte(v, n)}</span>
            <button
              type="button"
              onClick={() => onRemover(v)}
              title={`Tirar os filtros de ${ROTULO_VISAO_RECORTE[v]}`}
              aria-label={`Tirar os filtros de ${ROTULO_VISAO_RECORTE[v]}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-text lg:h-7 lg:w-7"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
