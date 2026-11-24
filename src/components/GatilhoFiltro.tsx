"use client";

import { type ReactNode, useRef, useState } from "react";
import { type ControleDropdown, Dropdown } from "./Dropdown";
import { IconArrowDown, IconArrowUp, IconFilter, IconSort } from "./icons";
import { SetaDropdown } from "./SetaDropdown";

type Dir = "asc" | "desc" | null;
type Abertura = { teclado: boolean };

/** A SETA de ordenar de um cabeçalho de coluna: ↕ esmaecida sem ordem, ↑/↓ em accent com ela; tocar alterna crescente ⇄
 *  decrescente (a 1ª vez, crescente). Área de toque de 44px. A MESMA em toda tabela (`DataTable`, `TabelaCruzada`). */
export function BotaoOrdenar({ label, sortDir = null, onSort }: { label: string; sortDir?: Dir; onSort: (dir: "asc" | "desc") => void }) {
  const proxima = sortDir === "asc" ? "desc" : "asc";
  const Seta = sortDir === "asc" ? IconArrowUp : sortDir === "desc" ? IconArrowDown : IconSort;
  const rotulo = `Ordenar ${label} (${proxima === "asc" ? "crescente" : "decrescente"})`;
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      onClick={() => onSort(proxima)}
      // No toque, a área de toque passa de 44px (o `::after`) sem ocupar a largura do nome da coluna.
      className={`relative inline-flex h-11 w-6 shrink-0 items-center justify-center rounded-chip transition-colors after:absolute after:inset-y-0 after:-inset-x-2.5 after:content-[''] hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 desktop:h-6 desktop:w-5 desktop:after:hidden ${
        sortDir ? "text-accent" : "opacity-50"
      }`}
    >
      <Seta className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

/**
 * Cabeçalho PADRÃO de coluna de tabela — o MESMO em toda coluna: rótulo · SETA de ordenar · filtro.
 * - `onSort` (a coluna ordena) → a `BotaoOrdenar` logo depois do rótulo;
 * - `children` (a coluna filtra) → o painel do filtro: o rótulo e o "⌄" (o funil, com a coluna filtrada) o abrem — pelo
 *   teclado, o foco entra no painel e volta a quem abriu; o painel alinha à coluna inteira;
 * - `prefixo` = um ícone antes do rótulo (ex.: o cadeado da coluna travada) e `onRotulo` = o toque no rótulo sem filtro.
 * Coluna FILTRADA = tópico MARCADO (accent). Sem nada disso, só o rótulo, no MESMO lugar.
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
  prefixo,
  onRotulo,
  dica,
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
  prefixo?: ReactNode;
  onRotulo?: () => void;
  /** A dica do rótulo sem filtro (ex.: o motivo da trava). */
  dica?: string;
  children?: (fechar: () => void, abertura: Abertura) => ReactNode;
}) {
  const ancora = useRef<HTMLDivElement>(null);
  const controle = useRef<ControleDropdown>(null);
  const [aberto, setAberto] = useState(false);
  const filtra = !!children;
  const titulo = filtra ? `${marcado ? "Filtrada — " : ""}Filtrar: ${label}` : dica;
  const classeRotulo = "inline-flex min-h-11 min-w-0 items-center gap-1 rounded-chip py-2 text-left uppercase desktop:min-h-0";
  const conteudoRotulo = (
    <>
      {prefixo}
      <span className="truncate">{label}</span>
    </>
  );

  return (
    <div
      ref={ancora}
      className={`flex w-full items-center gap-0.5 rounded-chip px-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] transition-colors duration-[var(--motion-duration)] ${
        marcado ? "bg-accent-soft text-accent" : "text-faint"
      }`}
    >
      {filtra || onRotulo ? (
        <button
          type="button"
          title={titulo}
          aria-expanded={filtra ? aberto : undefined}
          aria-haspopup={filtra ? (papel === "dialog" ? "dialog" : "true") : undefined}
          onClick={(e) => (filtra ? controle.current?.alternar(e.detail === 0, e.currentTarget) : onRotulo?.())}
          className={`${classeRotulo} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}
        >
          {conteudoRotulo}
        </button>
      ) : (
        <span title={titulo} className={classeRotulo}>
          {conteudoRotulo}
        </span>
      )}
      {onSort && <BotaoOrdenar label={label} sortDir={sortDir} onSort={onSort} />}
      {children && (
        <Dropdown
          controle={controle}
          aberto={aberto}
          onAberto={setAberto}
          ancora={ancora}
          align={align}
          ariaLabel={`Filtrar ${label}`}
          title={titulo}
          papel={papel}
          width={width}
          panelClassName={panelClassName}
          className="flex min-w-5 flex-1"
          triggerClassName="w-full justify-end py-2 min-h-11 desktop:min-h-0"
          trigger={marcado ? <IconFilter className="h-3.5 w-3.5 shrink-0" aria-label="Filtrada" /> : <SetaDropdown className="h-3.5 w-3.5 opacity-60" />}
        >
          {children}
        </Dropdown>
      )}
    </div>
  );
}
