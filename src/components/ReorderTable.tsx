"use client";

import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { IconGrip } from "./icons";

// Tabela do design system com ARRASTO ENTRE LINHAS (reordenar). Pointer Events =
// funciona no mouse e no toque (mobile), sem dependência nova. Chama `onReorder`
// com a nova ordem de ids ao soltar. Por token; rola no mobile sem estourar.
type Id = number | string;

export type ReorderColuna<T> = {
  header: string;
  render: (item: T, index: number) => ReactNode;
  align?: "left" | "right";
  minWidth?: number;
};

export function ReorderTable<T>({
  items,
  getId,
  columns,
  acoes,
  onReorder,
  minWidth = 640,
  dica,
}: {
  items: T[];
  getId: (item: T) => Id;
  columns: ReorderColuna<T>[];
  acoes?: (item: T) => ReactNode;
  onReorder: (ids: Id[]) => void;
  minWidth?: number;
  dica?: ReactNode;
}) {
  const [ordem, setOrdem] = useState<T[]>(items);
  const ordemRef = useRef<T[]>(items);
  const [dragId, setDragId] = useState<Id | null>(null);
  const arrastando = useRef(false);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  // Sincroniza com o pai quando não está arrastando (após salvar/recarregar).
  useEffect(() => {
    if (!arrastando.current) {
      ordemRef.current = items;
      setOrdem(items);
    }
  }, [items]);

  const aplicar = (next: T[]) => {
    ordemRef.current = next;
    setOrdem(next);
  };

  function iniciar(e: ReactPointerEvent, id: Id) {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    arrastando.current = true;
    setDragId(id);
  }

  function mover(e: ReactPointerEvent) {
    if (!arrastando.current || dragId == null) return;
    const body = bodyRef.current;
    if (!body) return;
    const linhas = Array.from(body.querySelectorAll<HTMLElement>("tr[data-row]"));
    const y = e.clientY;
    let alvo = linhas.length - 1;
    for (let i = 0; i < linhas.length; i++) {
      const r = linhas[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        alvo = i;
        break;
      }
    }
    const atual = ordemRef.current;
    const de = atual.findIndex((it) => getId(it) === dragId);
    if (de === -1 || de === alvo) return;
    const next = [...atual];
    const [m] = next.splice(de, 1);
    next.splice(alvo, 0, m);
    aplicar(next);
  }

  function soltar(e: ReactPointerEvent) {
    if (!arrastando.current) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    arrastando.current = false;
    setDragId(null);
    onReorder(ordemRef.current.map(getId));
  }

  const head = "px-[var(--cell-px)] py-3 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint";
  const cell = "px-[var(--cell-px)] py-[var(--cell-py)] align-middle text-[13px] text-text-2";

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-ring">
      {dica && (
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5 text-[12px] text-muted">
          <IconGrip className="h-3.5 w-3.5 shrink-0 opacity-70" />
          {dica}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>
          <thead className="border-b border-border bg-surface-2">
            <tr>
              <th className="w-10 px-2 py-3" aria-label="Reordenar" />
              {columns.map((c) => (
                <th
                  key={c.header}
                  className={`${head} ${c.align === "right" ? "text-right" : "text-left"}`}
                  style={c.minWidth ? { minWidth: c.minWidth } : undefined}
                >
                  {c.header}
                </th>
              ))}
              {acoes && <th className={`${head} text-right`}>Ações</th>}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {ordem.map((item, i) => {
              const id = getId(item);
              return (
                <tr
                  key={id}
                  data-row
                  className={`border-b border-border transition-colors last:border-0 ${
                    dragId === id ? "bg-accent-soft/60" : "hover:bg-surface-2"
                  }`}
                >
                  <td className="w-10 px-2">
                    <button
                      type="button"
                      aria-label="Arraste para reordenar"
                      onPointerDown={(e) => iniciar(e, id)}
                      onPointerMove={mover}
                      onPointerUp={soltar}
                      onPointerCancel={soltar}
                      className="flex h-8 w-8 touch-none items-center justify-center rounded-control text-faint transition-colors hover:bg-surface hover:text-text-2 active:cursor-grabbing"
                      style={{ cursor: "grab" }}
                    >
                      <IconGrip className="h-4 w-4" />
                    </button>
                  </td>
                  {columns.map((c) => (
                    <td key={c.header} className={`${cell} ${c.align === "right" ? "text-right" : ""}`}>
                      {c.render(item, i)}
                    </td>
                  ))}
                  {acoes && <td className="px-[var(--cell-px)] py-[var(--cell-py)] text-right">{acoes(item)}</td>}
                </tr>
              );
            })}
            {ordem.length === 0 && (
              <tr>
                <td colSpan={columns.length + (acoes ? 2 : 1)} className="px-4 py-12 text-center text-[13px] text-faint">
                  Nenhum registro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
