"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { IconClose } from "./icons";

const TAMANHO = { md: "sm:max-w-md", lg: "sm:max-w-lg" } as const;

/**
 * Modal compartilhado: bottom-sheet no mobile ↔ painel centralizado no desktop.
 * Fecha no Esc; o clique no fundo fecha só quando `fecharNoBackdrop` (padrão).
 * Renderiza via **portal em `document.body`** — assim o overlay `fixed` NÃO é
 * afetado por ancestrais com `transform`/`overflow` (ex.: painel do `Tabs`), que
 * quebrariam o posicionamento e recortariam o modal.
 */
export function Modal({
  open,
  onClose,
  titulo,
  size = "md",
  scrollable = false,
  fecharNoBackdrop = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  size?: keyof typeof TAMANHO;
  scrollable?: boolean;
  fecharNoBackdrop?: boolean;
  children: ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
        onClick={fecharNoBackdrop ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full rounded-t-2xl border border-border bg-surface p-5 shadow-soft sm:rounded-2xl ${TAMANHO[size]} ${
          scrollable ? "max-h-[92vh] overflow-y-auto" : ""
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-text">{titulo}</h3>
          <Button variant="icon" aria-label="Fechar" onClick={onClose}>
            <IconClose className="h-5 w-5" />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
