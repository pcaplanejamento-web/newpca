"use client";

import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MARGEM = 8;

/**
 * DICA FLUTUANTE rica (o que o `title` do navegador não faz: lista organizada, cores, valores): aparece com o MOUSE sobre o
 * elemento (ou o foco do teclado) num painel por PORTAL no `body` — nunca cortado pela rolagem de uma tabela —, abaixo do
 * elemento (acima quando não cabe), preso à tela. Some ao sair, ao rolar e no Esc. No toque não aparece (o toque é do
 * próprio elemento — ex.: abrir o banner com o mesmo conteúdo). Só leitura: nada clicável dentro.
 */
export function DicaFlutuante({ conteudo, children, largura = 340 }: { conteudo: ReactNode; children: ReactNode; largura?: number }) {
  const id = useId();
  const ancora = useRef<HTMLSpanElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const mostrar = useCallback(() => {
    const r = ancora.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(largura, window.innerWidth - 2 * MARGEM);
    setPos({ left: Math.min(Math.max(MARGEM, r.right - w), window.innerWidth - w - MARGEM), top: r.bottom + 6 });
  }, [largura]);
  const esconder = useCallback(() => setPos(null), []);

  // Não cabe embaixo: vai para cima do elemento.
  useLayoutEffect(() => {
    const p = painel.current;
    const r = ancora.current?.getBoundingClientRect();
    if (!pos || !p || !r) return;
    const h = p.offsetHeight;
    if (pos.top + h > window.innerHeight - MARGEM && r.top - h - 6 > MARGEM) setPos({ left: pos.left, top: r.top - h - 6 });
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && esconder();
    window.addEventListener("scroll", esconder, true);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("scroll", esconder, true);
      window.removeEventListener("keydown", tecla);
    };
  }, [pos, esconder]);

  return (
    <span
      ref={ancora}
      role="none"
      className="inline-flex"
      aria-describedby={pos ? id : undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && mostrar()}
      onPointerLeave={esconder}
      onFocus={mostrar}
      onBlur={esconder}
      onClick={esconder}
    >
      {children}
      {pos &&
        createPortal(
          <div
            ref={painel}
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[90] rounded-card border border-border bg-surface p-3 text-left text-[12.5px] text-text shadow-soft animate-fade-in-up"
            style={{ left: pos.left, top: pos.top, width: Math.min(largura, window.innerWidth - 2 * MARGEM) }}
          >
            {conteudo}
          </div>,
          document.body,
        )}
    </span>
  );
}
