"use client";

import { useEffect, type ReactNode } from "react";
import { IconClose } from "./icons";

const TAMANHO = { md: "sm:max-w-md", lg: "sm:max-w-lg" } as const;

/**
 * Modal compartilhado: bottom-sheet no mobile ↔ painel centralizado no desktop.
 * Fonte única para os diálogos (edição de usuário, configuração de tabela…).
 * Fecha no Esc; o clique no fundo fecha só quando `fecharNoBackdrop` (padrão).
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={fecharNoBackdrop ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-slate-900 ${TAMANHO[size]} ${
          scrollable ? "max-h-[92vh] overflow-y-auto" : ""
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">{titulo}</h3>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
