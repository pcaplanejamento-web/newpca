"use client";

import { navegarRef, noPeriodo, PERIODOS_METRICAS, type PeriodoMetricas, rotuloPeriodo } from "@/lib/mesa-metricas";
import { Button } from "./Button";
import { IconChevronLeft, IconChevronRight } from "./icons";
import { Segmented } from "./Segmented";

const PASSO: Record<Exclude<PeriodoMetricas, "tudo">, string> = { ano: "Ano", mes: "Mês", dia: "Dia" };

/**
 * NAVEGADOR DE PERÍODO — `Tudo | Ano | Mês | Dia` e, fora do Tudo, `‹ rótulo ›` + "Hoje": escolhe a JANELA e anda por
 * ela (o passo segue o período — um dia, um mês ou um ano da data de referência; o dia fica preso ao fim do mês). O
 * rótulo é anunciado (`aria-live`); "Hoje" só aparece fora do período atual. Controlado; alvos de 44px no toque.
 */
export function NavegadorPeriodo({
  periodo,
  data,
  hoje,
  onChange,
}: {
  periodo: PeriodoMetricas;
  /** A data de referência (AAAA-MM-DD). */
  data: string;
  /** Hoje (AAAA-MM-DD, Brasília). */
  hoje: string;
  onChange: (v: { periodo: PeriodoMetricas; data: string }) => void;
}) {
  const passo = periodo === "tudo" ? null : PASSO[periodo];
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Segmented<PeriodoMetricas>
        ariaLabel="Período das métricas"
        value={periodo}
        options={PERIODOS_METRICAS.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(p) => onChange({ periodo: p, data })}
      />
      {passo && (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${passo} anterior`}
            title={`${passo} anterior`}
            icon={<IconChevronLeft className="h-4 w-4" />}
            onClick={() => onChange({ periodo, data: navegarRef(data, periodo, -1) })}
          />
          <span aria-live="polite" className="min-w-[8.5rem] px-1 text-center text-[13px] font-semibold text-text tabular-nums">
            {rotuloPeriodo(periodo, data, hoje)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Próximo ${passo.toLowerCase()}`}
            title={`Próximo ${passo.toLowerCase()}`}
            icon={<IconChevronRight className="h-4 w-4" />}
            onClick={() => onChange({ periodo, data: navegarRef(data, periodo, 1) })}
          />
          {!noPeriodo(hoje, periodo, data) && (
            <Button variant="secondary" size="sm" onClick={() => onChange({ periodo, data: hoje })}>
              Hoje
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
