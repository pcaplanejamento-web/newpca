"use client";

import {
  Fragment,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { IconGrip } from "./icons";

// Tabela do design system com ARRASTO ENTRE LINHAS (reordenar). Pointer Events =
// funciona no mouse e no toque (mobile), sem dependência nova. Ao arrastar:
// - uma PRÉVIA compacta acompanha o cursor (portal, fixed);
// - uma SOMBRA (placeholder) aparece no ponto onde a linha vai cair;
// - a linha original fica esmaecida.
// Chama `onReorder` com a nova ordem de ids ao soltar. Por token.
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
  preview,
  minWidth = 640,
  dica,
}: {
  items: T[];
  getId: (item: T) => Id;
  columns: ReorderColuna<T>[];
  acoes?: (item: T) => ReactNode;
  onReorder: (ids: Id[]) => void;
  /** Conteúdo da prévia flutuante (padrão: 1ª coluna). */
  preview?: (item: T) => ReactNode;
  minWidth?: number;
  dica?: ReactNode;
}) {
  const [ordem, setOrdem] = useState<T[]>(items);
  const ordemRef = useRef<T[]>(items);
  const [dragId, setDragId] = useState<Id | null>(null);
  const dragIdRef = useRef<Id | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const overIdxRef = useRef<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const arrastando = useRef(false);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  // Sincroniza com o pai quando não está arrastando (após salvar/recarregar).
  useEffect(() => {
    if (!arrastando.current) {
      ordemRef.current = items;
      setOrdem(items);
    }
  }, [items]);

  const totalCols = columns.length + (acoes ? 2 : 1);

  function iniciar(e: ReactPointerEvent, id: Id) {
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* ambiente sem captura de ponteiro */
    }
    arrastando.current = true;
    dragIdRef.current = id;
    setDragId(id);
    setPos({ x: e.clientX, y: e.clientY });
  }

  function mover(e: ReactPointerEvent) {
    if (!arrastando.current || dragIdRef.current == null) return;
    setPos({ x: e.clientX, y: e.clientY });
    const body = bodyRef.current;
    if (!body) return;
    const linhas = Array.from(body.querySelectorAll<HTMLElement>("tr[data-row]"));
    const y = e.clientY;
    let idx = linhas.length; // solta no fim por padrão
    for (let i = 0; i < linhas.length; i++) {
      const r = linhas[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    overIdxRef.current = idx;
    setOverIdx(idx);
  }

  function encerrar(e: ReactPointerEvent) {
    if (!arrastando.current) return;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    const arrasto = dragIdRef.current;
    const alvo = overIdxRef.current;
    arrastando.current = false;
    dragIdRef.current = null;
    overIdxRef.current = null;
    setDragId(null);
    setOverIdx(null);
    setPos(null);
    if (arrasto == null || alvo == null) return;
    const atual = ordemRef.current;
    const de = atual.findIndex((it) => getId(it) === arrasto);
    if (de === -1) return;
    let to = alvo;
    if (de < to) to -= 1; // ao remover a origem, os índices acima deslocam
    if (de === to) return;
    const next = [...atual];
    const [m] = next.splice(de, 1);
    next.splice(to, 0, m);
    ordemRef.current = next;
    setOrdem(next);
    onReorder(next.map(getId));
  }

  const head = "px-[var(--cell-px)] py-3 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint";
  const cell = "px-[var(--cell-px)] py-[var(--cell-py)] align-middle text-[13px] text-text-2";
  const itemArrastado = dragId != null ? ordem.find((it) => getId(it) === dragId) : null;

  const placeholder = (
    <tr aria-hidden>
      <td colSpan={totalCols} className="px-2 py-1">
        <div className="h-9 rounded-control border-2 border-dashed border-accent/60 bg-accent-soft/50" />
      </td>
    </tr>
  );

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
                <Fragment key={id}>
                  {dragId != null && overIdx === i && placeholder}
                  <tr
                    data-row
                    className={`border-b border-border transition-colors last:border-0 ${
                      dragId === id ? "opacity-40" : "hover:bg-surface-2"
                    }`}
                  >
                    <td className="w-10 px-2">
                      <button
                        type="button"
                        aria-label="Arraste para reordenar"
                        onPointerDown={(e) => iniciar(e, id)}
                        onPointerMove={mover}
                        onPointerUp={encerrar}
                        onPointerCancel={encerrar}
                        className="flex h-8 w-8 touch-none items-center justify-center rounded-control text-faint transition-colors hover:bg-surface-2 hover:text-text-2 active:cursor-grabbing"
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
                </Fragment>
              );
            })}
            {dragId != null && overIdx === ordem.length && placeholder}
            {ordem.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-12 text-center text-[13px] text-faint">
                  Nenhum registro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Prévia flutuante que acompanha o cursor (portal). */}
      {itemArrastado &&
        pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[300] flex max-w-[320px] items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-[13px] text-text shadow-soft"
            style={{ left: pos.x + 14, top: pos.y + 8 }}
          >
            <IconGrip className="h-3.5 w-3.5 shrink-0 text-faint" />
            <span className="min-w-0 truncate">
              {preview ? preview(itemArrastado) : columns[0]?.render(itemArrastado, 0)}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
