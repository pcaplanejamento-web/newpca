"use client";

import { useLinkStatus } from "next/link";
import { IconSpinner } from "./icons";

/**
 * Feedback IMEDIATO de um `Link` para uma tela pesada (`force-dynamic`): enquanto a navegação DAQUELE link está pendente,
 * um véu com o spinner cobre o conteúdo do link (o pai precisa ser `relative`). Deve ser filho do `<Link>`.
 */
export function CarregandoLink({ rotulo = "Abrindo…" }: { rotulo?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span role="status" className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-[var(--scrim)]">
      <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-soft">
        <IconSpinner className="h-4 w-4" />
        {rotulo}
      </span>
    </span>
  );
}
