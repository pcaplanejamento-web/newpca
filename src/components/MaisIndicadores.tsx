"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconChevronDown } from "./icons";

/**
 * "MAIS INDICADORES": os indicadores principais ficam à vista (`children` vem antes, na tela) e os COMPLEMENTARES
 * (`extras`) abrem num PAINEL POR CIMA do conteúdo, preso logo abaixo do botão — nada do que está embaixo se move (a
 * barra, a tabela e a altura dela ficam onde estão). Sempre montado (sem piscar), fechado = inerte; fecha no toque fora,
 * no Esc (o foco volta ao botão) e no próprio botão. Execução, Frotas, Empenhos, Liquidações, Pagamentos.
 */
export function MaisIndicadores({ extras }: { extras: ReactNode }) {
  const [mais, setMais] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mais) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node | null;
      if (alvo && !raiz.current?.contains(alvo) && !(alvo as Element).closest?.(".avisos-flutuantes")) setMais(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setMais(false);
      botao.current?.focus();
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [mais]);
  return (
    <div ref={raiz} className="relative">
      <button
        ref={botao}
        type="button"
        aria-expanded={mais}
        onClick={() => setMais((v) => !v)}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-card border border-border bg-surface text-[13px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)]"
      >
        {mais ? "Menos indicadores" : "Mais indicadores"}
        <IconChevronDown className={`h-4 w-4 transition-transform ${mais ? "rotate-180" : ""}`} />
      </button>
      <div
        inert={!mais}
        aria-hidden={!mais}
        className={`absolute inset-x-0 top-full z-20 mt-2 max-h-[min(70dvh,40rem)] overflow-y-auto rounded-card border border-border bg-bg p-[var(--pad-card)] shadow-flutuante transition-[opacity,transform,visibility] duration-[var(--motion-duration)] ease-[var(--motion-ease)] motion-reduce:transition-none ${
          mais ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
        }`}
      >
        {extras}
      </div>
    </div>
  );
}
