"use client";

import { useState } from "react";
import { intervaloDoPeriodo, PERIODO_TODO, type Periodo } from "@/lib/periodo";
import type { IntervaloData } from "@/lib/tabela-filtros";
import { Dropdown } from "./Dropdown";
import { GatilhoFiltro } from "./GatilhoFiltro";
import { IconArrowDown, IconArrowUp } from "./icons";
import { PeriodoCorpo } from "./PeriodoPicker";

// Filtro de DATA no cabeçalho da tabela. Reutiliza o MESMO componente de período
// (`PeriodoCorpo`: atalhos + ano + meses + intervalo + Limpar) e acrescenta ordenar. Emite
// `{ de, ate }` (ISO) — a tabela filtra por intervalo. Por token; via portal, nunca corta. Escolher/limpar/ordenar
// fecham e devolvem o foco ao gatilho (o Dropdown cuida).

export function DateFilterHeader({
  label,
  value,
  onApply,
  onSort,
  sortDir = null,
  align = "start",
  anos,
}: {
  label: string;
  value?: IntervaloData;
  onApply: (v: IntervaloData) => void;
  onSort?: (dir: "asc" | "desc") => void;
  sortDir?: "asc" | "desc" | null;
  align?: "start" | "end";
  anos?: number[];
}) {
  const ativo = !!(value?.de || value?.ate);
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_TODO);
  // O painel mostra o filtro que VALE: sem filtro (limpo por fora, ex.: "Limpar filtros"), "todo"; com um filtro que o
  // período escolhido aqui não explica (restaurado de uma edição salva, tabela remontada), o intervalo DE/ATÉ dele.
  const escolhido = intervaloDoPeriodo(periodo);
  const mostrado: Periodo = !ativo
    ? PERIODO_TODO
    : escolhido.de === value?.de && escolhido.ate === value?.ate
      ? periodo
      : { preset: "custom", ...(value?.de ? { de: value.de } : {}), ...(value?.ate ? { ate: value.ate } : {}) };
  const btn =
    "min-h-11 flex-1 rounded-control border border-border-2 px-2 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-surface-2 lg:min-h-0";

  return (
    <Dropdown
      align={align}
      ariaLabel={`Filtrar ${label}`}
      papel="dialog"
      triggerClassName="w-full gap-1.5 px-1 py-2"
      width={300}
      trigger={<GatilhoFiltro label={label} sortDir={sortDir} marcado={ativo} />}
    >
      {(close, { teclado }) => (
        <div className="w-full">
          {onSort && (
            <div className="mb-1 flex gap-2 px-1">
              <button
                type="button"
                onClick={() => {
                  onSort("asc");
                  close();
                }}
                className={`${btn} inline-flex items-center justify-center gap-1`}
              >
                <IconArrowUp className="h-3.5 w-3.5" /> Crescente
              </button>
              <button
                type="button"
                onClick={() => {
                  onSort("desc");
                  close();
                }}
                className={`${btn} inline-flex items-center justify-center gap-1`}
              >
                <IconArrowDown className="h-3.5 w-3.5" /> Decrescente
              </button>
            </div>
          )}
          <PeriodoCorpo
            value={mostrado}
            anos={anos ?? [new Date().getFullYear()]}
            onChange={(p) => {
              setPeriodo(p);
              onApply(intervaloDoPeriodo(p));
            }}
            onClose={close}
            onLimpar={() => {
              setPeriodo(PERIODO_TODO);
              onApply({});
              close();
            }}
            autoFoco={teclado}
          />
        </div>
      )}
    </Dropdown>
  );
}
