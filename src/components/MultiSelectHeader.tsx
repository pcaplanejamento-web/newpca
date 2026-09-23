"use client";

import { useMemo, useState } from "react";
import { opcoesDaBusca } from "@/lib/tabela-filtros";
import { Dropdown } from "./Dropdown";
import { GatilhoFiltro } from "./GatilhoFiltro";
import { IconArrowDown, IconArrowUp } from "./icons";

// Filtro de cabeçalho de tabela (spec do usuário): ordenar (crescente/decrescente)
// + busca + "Selecionar todos" + checkboxes + Aplicar/Cancelar/Remover. "Remover" (ou nada/tudo
// marcado) = sem filtro. Na tabela as OPÇÕES já vêm facetadas pelos demais filtros (conectados).
// BUSCA como no Excel: vários valores de uma vez com ":" ("168:170:174" — `opcoesDaBusca`); os resultados
// começam TODOS marcados e "Aplicar" (ou Enter) aplica SÓ os resultados marcados.
type Dir = "asc" | "desc" | null;

export function MultiSelectHeader({
  label,
  options,
  value,
  onApply,
  onSort,
  sortDir = null,
  align = "start",
  marcado,
}: {
  label: string;
  options: string[];
  value: string[];
  onApply: (sel: string[]) => void;
  onSort?: (dir: "asc" | "desc") => void;
  sortDir?: Dir;
  align?: "start" | "end";
  /** Coluna filtrada (tópico marcado). Padrão: há seleção que não cobre todas as opções. */
  marcado?: boolean;
}) {
  const filtrado = marcado ?? (value.length > 0 && !options.every((o) => value.includes(o)));

  return (
    <Dropdown
      align={align}
      ariaLabel={`Filtrar ${label}`}
      triggerClassName="w-full gap-1.5 px-1 py-2"
      panelClassName="p-0"
      width={280}
      trigger={<GatilhoFiltro label={label} sortDir={sortDir} marcado={filtrado} />}
    >
      {(close) => (
        <Painel
          label={label}
          options={options}
          value={value}
          onApply={(s) => {
            onApply(s);
            close();
          }}
          onCancel={close}
          onSort={onSort ? (d) => { onSort(d); close(); } : undefined}
        />
      )}
    </Dropdown>
  );
}

function Painel({
  options,
  value,
  onApply,
  onCancel,
  onSort,
}: {
  label: string;
  options: string[];
  value: string[];
  onApply: (sel: string[]) => void;
  onCancel: () => void;
  onSort?: (dir: "asc" | "desc") => void;
}) {
  // Abre com a seleção atual (restrita ao que a faceta oferece) ou, sem filtro, com tudo marcado.
  const [sel, setSel] = useState<Set<string>>(() => {
    if (!value.length) return new Set(options);
    const ofertadas = new Set(options);
    return new Set(value.filter((v) => ofertadas.has(v)));
  });
  const [q, setQ] = useState("");
  const visiveis = useMemo(() => opcoesDaBusca(options, q), [q, options]);
  const buscando = q.trim() !== "";
  // Seleção DA BUSCA, guardada com o termo: mudou a busca ⇒ os novos resultados começam todos marcados.
  const [selBusca, setSelBusca] = useState<{ q: string; set: Set<string> } | null>(null);
  const marcadas = useMemo(
    () => (!buscando ? sel : selBusca && selBusca.q === q ? selBusca.set : new Set(visiveis)),
    [buscando, sel, selBusca, q, visiveis],
  );
  const todosMarcados = visiveis.length > 0 && visiveis.every((o) => marcadas.has(o));
  const aplicaveis = buscando ? visiveis.filter((o) => marcadas.has(o)) : null;
  const podeAplicar = aplicaveis == null || aplicaveis.length > 0;

  function alternar(o: string) {
    const n = new Set(marcadas);
    if (n.has(o)) n.delete(o);
    else n.add(o);
    if (buscando) setSelBusca({ q, set: n });
    else setSel(n);
  }
  function alternarTodos() {
    const n = new Set(marcadas);
    if (todosMarcados) for (const o of visiveis) n.delete(o);
    else for (const o of visiveis) n.add(o);
    if (buscando) setSelBusca({ q, set: n });
    else setSel(n);
  }
  function aplicar() {
    if (podeAplicar) onApply(aplicaveis ?? [...sel]);
  }

  const btn = "flex-1 rounded-control border border-border-2 px-2 py-1.5 text-[12px] font-semibold";

  return (
    <div className="flex max-h-[min(70vh,420px)] w-full flex-col">
      {onSort && (
        <div className="flex gap-2 p-2">
          <button type="button" onClick={() => onSort("asc")} className={`${btn} inline-flex items-center justify-center gap-1 text-text-2 hover:bg-surface-2`}>
            <IconArrowUp className="h-3.5 w-3.5" /> Crescente
          </button>
          <button type="button" onClick={() => onSort("desc")} className={`${btn} inline-flex items-center justify-center gap-1 text-text-2 hover:bg-surface-2`}>
            <IconArrowDown className="h-3.5 w-3.5" /> Decrescente
          </button>
        </div>
      )}
      <div className="px-2 pb-1 pt-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              aplicar();
            }
          }}
          aria-label="Buscar valores (use : para vários)"
          placeholder="Filtrar (use : para vários)"
          className="h-[var(--h-control-sm)] w-full rounded-control border border-border-2 bg-surface px-2.5 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] font-semibold text-text">
        <input
          type="checkbox"
          checked={todosMarcados}
          onChange={alternarTodos}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        {buscando ? `Selecionar os ${visiveis.length} encontrados` : "Selecionar todos"}
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {visiveis.map((o) => (
          <label
            key={o}
            className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-text-2 hover:bg-surface-2"
          >
            <input
              type="checkbox"
              checked={marcadas.has(o)}
              onChange={() => alternar(o)}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="truncate" title={o}>{o}</span>
          </label>
        ))}
        {visiveis.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-faint">Nada encontrado</div>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-2">
        <button
          type="button"
          onClick={aplicar}
          disabled={!podeAplicar}
          className="flex-1 rounded-control bg-accent px-2 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Aplicar
        </button>
        <button type="button" onClick={onCancel} className={`${btn} text-text-2 hover:bg-surface-2`}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onApply([])}
          className="rounded-control px-2 py-1.5 text-[12px] font-semibold text-[color:var(--sit-cancelado)] hover:bg-surface-2"
        >
          Remover
        </button>
      </div>
    </div>
  );
}
