"use client";

import { useLinkStatus } from "next/link";
import { IconSpinner } from "./icons";

/**
 * Carregamento DENTRO do card de um link (`useLinkStatus`): o card continua à vista — um leve escurecimento, um BRILHO
 * que varre o card, a BARRA indeterminada na borda de baixo (accent) e uma pílula de vidro com o rótulo. Com
 * "reduzir movimento", sem a varredura e com a barra parada.
 */
export function CarregandoLink({ rotulo = "Abrindo…" }: { rotulo?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span role="status" className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit] bg-black/15">
      <span
        aria-hidden
        className="animate-varrer-card absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />
      <span className="absolute inset-0 grid place-items-center">
        <span className="animate-fade-in-up flex items-center gap-2 rounded-full bg-black/50 px-3.5 py-2 text-xs font-semibold text-white shadow-soft ring-1 ring-white/20 backdrop-blur-md">
          <IconSpinner className="h-4 w-4" />
          {rotulo}
        </span>
      </span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-white/20">
        <span className="animate-barra-indeterminada block h-full w-full bg-accent" />
      </span>
    </span>
  );
}
