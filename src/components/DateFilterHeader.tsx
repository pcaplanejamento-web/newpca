"use client";

import { useState } from "react";
import type { IntervaloData } from "@/lib/tabela-filtros";
import { Dropdown } from "./Dropdown";
import { GatilhoFiltro } from "./GatilhoFiltro";
import { IconArrowDown, IconArrowUp } from "./icons";
import { type Periodo, PeriodoCorpo, periodoParaIntervalo } from "./PeriodoPicker";

// Filtro de DATA no cabeçalho da tabela. Reutiliza o MESMO componente de período
// (`PeriodoCorpo`: presets + ano + meses + intervalo) e acrescenta ordenar. Emite
// `{ de, ate }` (ISO) — a tabela filtra por intervalo. Por token; via portal, nunca corta.

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
  const [periodo, setPeriodo] = useState<Periodo>({ preset: "todo" });
  const btn =
    "flex-1 rounded-control border border-border-2 px-2 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-surface-2";

  return (
    <Dropdown
      align={align}
      ariaLabel={`Filtrar ${label}`}
      triggerClassName="w-full gap-1.5 px-1 py-2"
      width={300}
      trigger={<GatilhoFiltro label={label} sortDir={sortDir} marcado={ativo} />}
    >
      {(close) => (
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
            value={periodo}
            anos={anos ?? [new Date().getFullYear()]}
            onChange={(p) => {
              setPeriodo(p);
              onApply(periodoParaIntervalo(p));
            }}
            onClose={close}
          />
          <div className="flex justify-end px-2 pb-1">
            <button
              type="button"
              onClick={() => {
                setPeriodo({ preset: "todo" });
                onApply({});
                close();
              }}
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              Limpar
            </button>
          </div>
        </div>
      )}
    </Dropdown>
  );
}
