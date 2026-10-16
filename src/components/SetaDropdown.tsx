"use client";

import { createContext, useContext } from "react";
import { IconChevronDown } from "./icons";

/** O estado do `Dropdown` em volta do gatilho: aberto e o LADO em que o painel abriu (decidido uma vez por abertura). */
export const EstadoDropdown = createContext<{ aberto: boolean; acima: boolean } | null>(null);

/**
 * A SETA de todo gatilho de dropdown: aponta para o lado OPOSTO da lista aberta ("toque aqui para fechar") — aberta
 * para baixo, gira suave até apontar para cima; aberta para cima, segue para baixo; fechada, volta. O estado vem do
 * `Dropdown` em volta (fora dele, parada). O giro é suave (1,75× o `--motion-duration`, ease-in-out; zero com "reduzir movimento").
 */
export function SetaDropdown({ className = "" }: { className?: string }) {
  const estado = useContext(EstadoDropdown);
  const girada = !!estado?.aberto && !estado.acima;
  return (
    <IconChevronDown
      aria-hidden="true"
      data-seta-dropdown={girada ? "aberta" : "fechada"}
      className={`shrink-0 transition-transform duration-[calc(var(--motion-duration)*1.75)] ease-[cubic-bezier(.65,0,.35,1)] ${girada ? "rotate-180" : ""} ${className}`}
    />
  );
}
