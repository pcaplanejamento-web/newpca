"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { IconClose } from "./icons";

const TAMANHO = { md: "sm:max-w-md", lg: "sm:max-w-lg", xl: "sm:max-w-4xl" } as const;

/**
 * Modal compartilhado: bottom-sheet no mobile ↔ painel centralizado no desktop.
 * Layout em coluna: **cabeçalho FIXO** + corpo rolável + **rodapé FIXO** opcional
 * (`rodape`, ex.: botões de ação). Fecha no Esc; o clique no fundo fecha só quando
 * `fecharNoBackdrop` (padrão). Com **`bloqueado`** (ex.: durante uma gravação em
 * andamento) NÃO fecha por nada — sem X, sem Esc, sem backdrop. Renderiza via
 * **portal em `document.body`** — assim o overlay `fixed` não é afetado por
 * ancestrais com `transform`/`overflow` (ex.: o painel do `Tabs`).
 */
export function Modal({
  open,
  onClose,
  titulo,
  size = "md",
  rodape,
  fecharNoBackdrop = true,
  bloqueado = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  size?: keyof typeof TAMANHO;
  rodape?: ReactNode;
  fecharNoBackdrop?: boolean;
  bloqueado?: boolean;
  children: ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !bloqueado) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, bloqueado]);

  if (!open || !montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
        onClick={fecharNoBackdrop && !bloqueado ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-soft sm:rounded-2xl ${TAMANHO[size]}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h3 className="min-w-0 truncate text-base font-bold text-text">{titulo}</h3>
          {!bloqueado && (
            <Button variant="icon" aria-label="Fechar" onClick={onClose}>
              <IconClose className="h-5 w-5" />
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && (
          <div className="shrink-0 border-t border-border bg-surface px-5 py-3">{rodape}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
