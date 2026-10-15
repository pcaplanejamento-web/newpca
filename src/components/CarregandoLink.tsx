"use client";

import { useLinkStatus } from "next/link";
import type { ComponentType } from "react";
import { IconSpinner } from "./icons";

/**
 * Carregamento DENTRO do card de um link (`useLinkStatus`): o card continua à vista — um leve escurecimento, um BRILHO
 * que varre o card, a BARRA indeterminada na borda de baixo (accent) e uma pílula com o anel que gira. Tudo só com
 * `transform` (o compositor anima mesmo com a página ocupada montando a tela). Com "reduzir movimento", tudo parado.
 */
export function CarregandoLink({ rotulo = "Abrindo…" }: { rotulo?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span role="status" className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit] bg-black/15">
      <span
        aria-hidden
        className="animate-varrer-card absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
      <span className="absolute inset-0 grid place-items-center">
        <span className="flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-2 text-xs font-semibold text-white shadow-soft ring-1 ring-white/15">
          <span aria-hidden className="animate-girar h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white" />
          {rotulo}
        </span>
      </span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-white/20">
        <span className="animate-barra-indeterminada block h-full w-full bg-accent" />
      </span>
    </span>
  );
}

/**
 * O ÍCONE de um item de navegação (menu lateral, barra inferior) que vira o spinner enquanto a tela pedida carrega — o
 * toque tem resposta na hora, sem esperar o servidor. Deve ficar DENTRO do `<Link>` (lê o `useLinkStatus`).
 */
export function IconeNavegacao({ Icon, className, strokeWidth }: { Icon: ComponentType<{ className?: string; strokeWidth?: number }>; className?: string; strokeWidth?: number }) {
  const { pending } = useLinkStatus();
  return pending ? <IconSpinner className={className} aria-label="Carregando" /> : <Icon className={className} strokeWidth={strokeWidth} />;
}
