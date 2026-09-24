"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Feedback } from "@/lib/semantic";
import { IconAlert, IconCheck, IconClose, IconInfo, IconSpinner } from "./icons";

/** Região ÚNICA (no `body`) onde os avisos flutuantes se empilham — canto inferior, acima da navegação
 * inferior do celular, da barra de seleção fixa (`--reserva-rodape`) e do rodapé da tabela da Mesa
 * (`--rodape-tabela` — o "Importar" e a paginação ficam livres), ver `.avisos-flutuantes`. */
const REGIAO = "avisos-flutuantes";
function regiao(): HTMLElement {
  let el = document.getElementById(REGIAO);
  if (!el) {
    el = document.createElement("div");
    el.id = REGIAO;
    el.className = "avisos-flutuantes";
    document.body.appendChild(el);
  }
  return el;
}

const ICONE: Record<Feedback, ReactNode> = {
  danger: <IconAlert className="h-4 w-4" />,
  warn: <IconAlert className="h-4 w-4" />,
  ok: <IconCheck className="h-4 w-4" />,
  info: <IconInfo className="h-4 w-4" />,
};

/**
 * AVISO FLUTUANTE — o componente padrão para feedback transitório (erro de importação, leitura em
 * andamento, resultado, falha de uma ação): aparece PEQUENO no canto inferior do display, sem deformar
 * nada ao redor (portal numa região fixa; vários se empilham). Cor/ícone pelo token de feedback
 * (`--danger/--warn/--ok/--info`); `carregando` troca o ícone pelo spinner; `onClose` mostra o X (alvo de
 * 44px) e `duracao` (ms) fecha sozinho. O `toast` usa o MESMO componente. Só tokens do design-system.
 */
export function AvisoFlutuante({
  kind = "info",
  titulo,
  children,
  onClose,
  duracao,
  carregando = false,
}: {
  kind?: Feedback;
  titulo?: string;
  children?: ReactNode;
  /** Fechar (X). Sem ele, o aviso some quando o dono deixa de renderizá-lo. */
  onClose?: () => void;
  /** Fecha sozinho após N ms (exige `onClose`). */
  duracao?: number;
  /** Em andamento (spinner no lugar do ícone). */
  carregando?: boolean;
}) {
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  useEffect(() => setAlvo(regiao()), []);
  // O fechamento automático usa a versão MAIS RECENTE do `onClose` (o timer não reinicia a cada render).
  const fecharRef = useRef(onClose);
  fecharRef.current = onClose;
  useEffect(() => {
    if (!duracao || !fecharRef.current) return;
    const t = window.setTimeout(() => fecharRef.current?.(), duracao);
    return () => window.clearTimeout(t);
  }, [duracao]);

  if (!alvo) return null;
  const cor = `var(--${kind})`;
  return createPortal(
    <div
      role={kind === "danger" || kind === "warn" ? "alert" : "status"}
      className="animate-fade-in-up pointer-events-auto flex items-start gap-2 rounded-card border bg-surface py-2 pl-2.5 pr-1 text-[12.5px] leading-snug shadow-soft"
      style={{ borderColor: `color-mix(in srgb, ${cor} 38%, var(--border))`, boxShadow: `inset 3px 0 0 ${cor}` }}
    >
      <span className="mt-px shrink-0" style={{ color: cor }}>
        {carregando ? <IconSpinner className="h-4 w-4" /> : ICONE[kind]}
      </span>
      <div className="min-w-0 flex-1 break-words">
        {titulo && (
          <p className="font-semibold" style={{ color: cor }}>
            {titulo}
          </p>
        )}
        {/* Texto longo (ex.: muitas falhas de uma edição em massa) ROLA dentro do aviso — o título e o X ficam
            sempre ao alcance e o aviso nunca cobre a tela. */}
        {children && <div className="max-h-[35dvh] overflow-y-auto overscroll-contain text-text-2">{children}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={onClose}
          // Alvo de toque de 44px (a área clicável passa do círculo visível).
          className="relative -my-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-text-2 after:absolute after:-inset-2 after:content-['']"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      )}
    </div>,
    alvo,
  );
}
