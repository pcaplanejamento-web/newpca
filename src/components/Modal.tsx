"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { IconClose } from "./icons";

const TAMANHO = { md: "sm:max-w-md", lg: "sm:max-w-lg", xl: "sm:max-w-4xl", full: "sm:max-w-6xl" } as const;

/** Painel LATERAL (mestre-detalhe): um 2º banner que aparece AO LADO do principal. */
export type ModalLateral = {
  /** Aberto = o painel lateral desliza para o lado; fechado = colapsado (só o principal). */
  aberto: boolean;
  titulo: string;
  /** Cabeçalho FIXO rico (ReactNode) — substitui o `titulo` textual no topo (ex.: nº + badges). */
  cabecalho?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  /** Slot de botões à esquerda do X do lateral (ex.: cadeado de edição). */
  acoesCabecalho?: ReactNode;
  onClose: () => void;
};

/** Card de um banner (cabeçalho fixo + corpo rolável + rodapé fixo). Reutilizado pelos 2 painéis. */
function Painel({
  titulo,
  cabecalho,
  onClose,
  rodape,
  bloqueado = false,
  acoesCabecalho,
  className = "",
  children,
}: {
  titulo: string;
  cabecalho?: ReactNode;
  onClose?: () => void;
  rodape?: ReactNode;
  bloqueado?: boolean;
  acoesCabecalho?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-soft sm:rounded-2xl ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        {cabecalho ? (
          <div className="min-w-0 flex-1">{cabecalho}</div>
        ) : (
          <h3 className="min-w-0 truncate text-base font-bold text-text">{titulo}</h3>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {acoesCabecalho}
          {onClose && !bloqueado && (
            <Button variant="icon" aria-label="Fechar" onClick={onClose}>
              <IconClose className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {rodape && <div className="shrink-0 border-t border-border bg-surface px-5 py-3">{rodape}</div>}
    </div>
  );
}

/**
 * Modal compartilhado: bottom-sheet no mobile ↔ painel centralizado no desktop.
 * Layout em coluna: **cabeçalho FIXO** + corpo rolável + **rodapé FIXO** opcional
 * (`rodape`, ex.: botões de ação). Fecha no Esc; o clique no fundo fecha só quando
 * `fecharNoBackdrop` (padrão). Com **`bloqueado`** (ex.: durante uma gravação em
 * andamento) NÃO fecha por nada — sem X, sem Esc, sem backdrop. Renderiza via
 * **portal em `document.body`** — assim o overlay `fixed` não é afetado por
 * ancestrais com `transform`/`overflow` (ex.: o painel do `Tabs`). Enquanto aberto,
 * **trava o scroll da página** (nada interage por trás). `acoesCabecalho` = slot de
 * botões à esquerda do X (ex.: cadeado de edição).
 *
 * **Mestre-detalhe** (`lateral`): quando presente, um **2º banner** aparece AO LADO
 * do principal (não dentro). No desktop os dois ficam lado a lado (o principal
 * desliza para a esquerda e o lateral surge à direita, via `grid-template-columns`
 * + `max-width` animados); no mobile o lateral cobre a tela (um por vez). O fechar
 * do lateral é ANIMADO (simétrico ao abrir) — o conteúdo fica montado até a
 * transição terminar. Esc fecha primeiro o lateral, depois o modal.
 */
export function Modal({
  open,
  onClose,
  titulo,
  cabecalho,
  size = "md",
  rodape,
  fecharNoBackdrop = true,
  bloqueado = false,
  acoesCabecalho,
  lateral,
  lateral2,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  /** Cabeçalho FIXO rico (ReactNode) — substitui o `titulo` textual no topo. */
  cabecalho?: ReactNode;
  size?: keyof typeof TAMANHO;
  rodape?: ReactNode;
  fecharNoBackdrop?: boolean;
  bloqueado?: boolean;
  acoesCabecalho?: ReactNode;
  lateral?: ModalLateral;
  /** 3º painel (à direita do `lateral`) — ex.: mensagens ao lado do DFD dentro do protocolo. */
  lateral2?: ModalLateral;
  children: ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Trava o scroll da página enquanto o modal está aberto (nada interage por trás).
  useEffect(() => {
    if (!open) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [open]);

  const lateralAberto = !!lateral?.aberto;
  // Mantém o lateral montado durante o fechamento (fecha ANIMADO, simétrico ao abrir).
  const [mostrarLateral, setMostrarLateral] = useState(false);
  const cacheLateral = useRef<{
    titulo: string;
    cabecalho: ReactNode;
    rodape: ReactNode;
    acoesCabecalho: ReactNode;
    children: ReactNode;
  } | null>(null);
  useEffect(() => {
    if (lateralAberto) setMostrarLateral(true);
    else if (!open) setMostrarLateral(false); // fechou o modal todo — não guarda o lateral antigo
  }, [lateralAberto, open]);
  if (lateral && lateralAberto) {
    cacheLateral.current = {
      titulo: lateral.titulo,
      cabecalho: lateral.cabecalho,
      rodape: lateral.rodape,
      acoesCabecalho: lateral.acoesCabecalho,
      children: lateral.children,
    };
  }

  // 2º painel lateral (à direita do 1º) — mesmo mecanismo de fechar animado.
  const lateral2Aberto = !!lateral2?.aberto;
  const [mostrarLateral2, setMostrarLateral2] = useState(false);
  const cacheLateral2 = useRef<{
    titulo: string;
    cabecalho: ReactNode;
    rodape: ReactNode;
    acoesCabecalho: ReactNode;
    children: ReactNode;
  } | null>(null);
  useEffect(() => {
    if (lateral2Aberto) setMostrarLateral2(true);
    else if (!open) setMostrarLateral2(false);
  }, [lateral2Aberto, open]);
  if (lateral2 && lateral2Aberto) {
    cacheLateral2.current = {
      titulo: lateral2.titulo,
      cabecalho: lateral2.cabecalho,
      rodape: lateral2.rodape,
      acoesCabecalho: lateral2.acoesCabecalho,
      children: lateral2.children,
    };
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || bloqueado) return;
      // Fecha do mais à direita para o mais à esquerda: lateral2 → lateral → modal.
      if (lateral2Aberto && lateral2) lateral2.onClose();
      else if (lateralAberto && lateral) lateral.onClose();
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, bloqueado, lateralAberto, lateral, lateral2Aberto, lateral2]);

  if (!open || !montado) return null;

  const scrim = (
    <div
      className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
      onClick={fecharNoBackdrop && !bloqueado ? onClose : undefined}
    />
  );

  // Modo simples (1 banner) — comportamento original, inalterado.
  if (!lateral) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        {scrim}
        <Painel
          titulo={titulo}
          cabecalho={cabecalho}
          onClose={onClose}
          rodape={rodape}
          bloqueado={bloqueado}
          acoesCabecalho={acoesCabecalho}
          className={TAMANHO[size]}
        >
          {children}
        </Painel>
      </div>,
      document.body,
    );
  }

  // Modo mestre-detalhe (2 OU 3 banners LADO A LADO) — os laterais deslizam ao lado.
  // Principal um pouco maior (comporta tabelas largas); no mobile mostra 1 por vez (o
  // mais à direita aberto). Cada painel aberto recebe uma fração proporcional.
  const conteudoLateral = lateralAberto ? lateral : cacheLateral.current;
  const conteudoLateral2 = lateral2Aberto ? lateral2 : cacheLateral2.current;
  const abertos = (lateralAberto ? 1 : 0) + (lateral2Aberto ? 1 : 0);
  const colP = (aberto: boolean) => (aberto ? "minmax(0,1fr)" : "0fr");
  const colMain = abertos > 0 ? "minmax(0,1.1fr)" : "1fr";
  let cols: string;
  if (isDesktop) {
    cols = lateral2 ? `${colMain} ${colP(lateralAberto)} ${colP(lateral2Aberto)}` : `${colMain} ${colP(lateralAberto)}`;
  } else if (lateral2) {
    cols = lateral2Aberto ? "0fr 0fr 1fr" : lateralAberto ? "0fr 1fr 0fr" : "1fr 0fr 0fr";
  } else {
    cols = lateralAberto ? "0fr 1fr" : "1fr 0fr";
  }
  const maxW = !isDesktop ? "100%" : abertos >= 2 ? "104rem" : abertos === 1 ? "84rem" : "64rem";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {scrim}
      <div
        className="grid w-full items-end gap-0 sm:items-start sm:gap-4"
        style={{
          maxWidth: maxW,
          gridTemplateColumns: cols,
          transition:
            "grid-template-columns var(--motion-duration) var(--motion-ease), max-width var(--motion-duration) var(--motion-ease)",
        }}
        onTransitionEnd={(e) => {
          if (e.propertyName !== "grid-template-columns") return;
          if (!lateralAberto) setMostrarLateral(false);
          if (!lateral2Aberto) setMostrarLateral2(false);
        }}
      >
        <div className="min-w-0 overflow-hidden">
          <Painel
            titulo={titulo}
            cabecalho={cabecalho}
            onClose={onClose}
            rodape={rodape}
            bloqueado={bloqueado}
            acoesCabecalho={acoesCabecalho}
          >
            {children}
          </Painel>
        </div>
        <div className="min-w-0 overflow-hidden">
          {mostrarLateral && conteudoLateral && lateral && (
            <Painel
              titulo={conteudoLateral.titulo}
              cabecalho={conteudoLateral.cabecalho}
              onClose={lateral.onClose}
              rodape={conteudoLateral.rodape}
              acoesCabecalho={conteudoLateral.acoesCabecalho}
              bloqueado={bloqueado}
            >
              {conteudoLateral.children}
            </Painel>
          )}
        </div>
        {lateral2 && (
          <div className="min-w-0 overflow-hidden">
            {mostrarLateral2 && conteudoLateral2 && (
              <Painel
                titulo={conteudoLateral2.titulo}
                cabecalho={conteudoLateral2.cabecalho}
                onClose={lateral2.onClose}
                rodape={conteudoLateral2.rodape}
                acoesCabecalho={conteudoLateral2.acoesCabecalho}
                bloqueado={bloqueado}
              >
                {conteudoLateral2.children}
              </Painel>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
