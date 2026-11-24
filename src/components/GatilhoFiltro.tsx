"use client";

import { type ReactNode, useRef, useState } from "react";
import { Dropdown } from "./Dropdown";
import { IconArrowDown, IconArrowUp, IconFilter, IconSort } from "./icons";
import { SetaDropdown } from "./SetaDropdown";

type Dir = "asc" | "desc" | null;
type Abertura = { teclado: boolean };

/**
 * Cabeçalho de coluna com FILTRO — o MESMO nos três tipos (valores, datas e faixa R$): rótulo · SETA de ordenar ·
 * filtro. A seta é um botão próprio: tocar alterna crescente ⇄ decrescente (a `DataTable` decide se a ordem é
 * numérica ou alfabética); sem ordem, ela aparece esmaecida (↕). O rótulo e o "⌄" abrem o painel do filtro (o painel
 * alinha à coluna inteira). Coluna FILTRADA = tópico MARCADO (accent + funil no lugar do "⌄").
 */
export function CabecalhoFiltro({
  label,
  sortDir = null,
  onSort,
  marcado = false,
  align = "start",
  width,
  papel,
  panelClassName,
  children,
}: {
  label: string;
  sortDir?: Dir;
  onSort?: (dir: "asc" | "desc") => void;
  marcado?: boolean;
  align?: "start" | "end";
  width?: number;
  papel?: "menu" | "dialog";
  panelClassName?: string;
  children: (fechar: () => void, abertura: Abertura) => ReactNode;
}) {
  const ancora = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const proxima = sortDir === "asc" ? "desc" : "asc";
  const SetaOrdem = sortDir === "asc" ? IconArrowUp : sortDir === "desc" ? IconArrowDown : IconSort;

  return (
    <div
      ref={ancora}
      className={`flex w-full items-center gap-0.5 rounded-chip px-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] transition-colors duration-[var(--motion-duration)] ${
        marcado ? "bg-accent-soft text-accent" : "text-faint"
      }`}
    >
      <button
        type="button"
        title={`${marcado ? "Filtrada — " : ""}Filtrar: ${label}`}
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="min-h-11 min-w-0 truncate rounded-chip py-2 text-left uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 desktop:min-h-0"
      >
        {label}
      </button>
      {onSort && (
        <button
          type="button"
          title={`Ordenar ${label} (${proxima === "asc" ? "crescente" : "decrescente"})`}
          aria-label={`Ordenar ${label} (${proxima === "asc" ? "crescente" : "decrescente"})`}
          onClick={() => onSort(proxima)}
          className={`inline-flex h-11 w-7 shrink-0 items-center justify-center rounded-chip transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 desktop:h-6 desktop:w-5 ${
            sortDir ? "" : "opacity-50"
          }`}
        >
          <SetaOrdem className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
      <Dropdown
        aberto={aberto}
        onAberto={setAberto}
        ancora={ancora}
        align={align}
        ariaLabel={`Filtrar ${label}`}
        title={`${marcado ? "Filtrada — " : ""}Filtrar: ${label}`}
        papel={papel}
        width={width}
        panelClassName={panelClassName}
        className="flex min-w-5 flex-1"
        triggerClassName="w-full justify-end py-2 min-h-11 desktop:min-h-0"
        trigger={
          marcado ? (
            <IconFilter className="h-3.5 w-3.5 shrink-0" aria-label="Filtrada" />
          ) : (
            <SetaDropdown className="h-3.5 w-3.5 opacity-60" />
          )
        }
      >
        {children}
      </Dropdown>
    </div>
  );
}
