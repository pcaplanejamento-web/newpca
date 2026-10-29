"use client";

import { type ReactNode, useEffect, useState } from "react";
import { IconChevronDown } from "./icons";
import { duracaoMotionMs } from "./Modal";

/**
 * "MAIS INDICADORES": os indicadores principais ficam à vista (`children` vem antes, na tela) e os COMPLEMENTARES
 * (`extras`) abrem e fecham pela ALTURA (grid-template-rows 0fr ↔ 1fr) — sempre montados, os de baixo deslizam juntos e
 * nada pisca; fechado = inerte (fora do Tab). O corte só durante a transição (as sombras não ficam presas). A escolha fica
 * neste aparelho (`chave` no localStorage) e abre já pronta, sem animar na chegada. Execução e Frotas.
 */
export function MaisIndicadores({ chave, extras }: { chave: string; extras: ReactNode }) {
  const [mais, setMais] = useState(false);
  /** A abertura terminou (só então os cartões podem passar da borda — a sombra, o realce). */
  const [pronto, setPronto] = useState(false);
  const [animar, setAnimar] = useState(false);
  useEffect(() => {
    let v = false;
    try {
      v = localStorage.getItem(chave) === "1";
    } catch {
      /* sem armazenamento: fechado */
    }
    setMais(v);
    setPronto(v);
  }, [chave]);
  const alternar = () => {
    const novo = !mais;
    try {
      localStorage.setItem(chave, novo ? "1" : "0");
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
    // Sem movimento (sistema ou ADM) não há transição — nem o fim dela: fica pronto na hora.
    const semTransicao = duracaoMotionMs() === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setAnimar(!semTransicao);
    setPronto(semTransicao && novo);
    setMais(novo);
  };
  return (
    <>
      <div
        className={`grid ${animar ? "transition-[grid-template-rows,opacity,margin] duration-[calc(var(--motion-duration)*1.5)] ease-[var(--motion-ease)] motion-reduce:transition-none" : ""}`}
        style={{ gridTemplateRows: mais ? "1fr" : "0fr", opacity: mais ? 1 : 0, marginTop: mais ? 0 : "calc(-1 * var(--gap-block))" }}
        inert={!mais}
        aria-hidden={!mais}
        onTransitionEnd={(e) => e.target === e.currentTarget && e.propertyName === "grid-template-rows" && setPronto(mais)}
      >
        <div className={`min-h-0 ${mais && pronto ? "overflow-visible" : "overflow-hidden"}`}>{extras}</div>
      </div>
      <button
        type="button"
        aria-expanded={mais}
        onClick={alternar}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-card border border-border bg-surface text-[13px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)]"
      >
        {mais ? "Menos indicadores" : "Mais indicadores"}
        <IconChevronDown className={`h-4 w-4 transition-transform ${mais ? "rotate-180" : ""}`} />
      </button>
    </>
  );
}
