"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Conversa, encostarBolhas, type PosicaoBolhas, topoDasBolhas } from "@/lib/chat-core";
import { Avatar } from "./Avatar";
import { IconClose, IconUsers } from "./icons";
import { segurar } from "./segurar";

/** Uma bolha: a foto da pessoa (ou o mosaico de até 3 numa conversa em grupo), o ponto de presença e as não lidas. */
export type Bolha = {
  conversa: Conversa;
  rotulo: string;
  fotos: { nome: string; foto?: string | null }[];
  /** A conversa do GRUPO ATIVO (ícone de pessoas em vez de foto). */
  grupoAtivo?: boolean;
  presenca?: "online" | "ausente";
  naoLidas: number;
  /** Chegou agora: a bolha QUICA. */
  nova?: boolean;
};

/** Medidas (px): a bolha, o vão entre elas, a margem da borda e as áreas que a pilha não cobre (o cabeçalho e, no celular,
 * a navegação inferior). */
const TAM = { celular: 48, desktop: 56 };
const VAO = 10;
const MARGEM = 12;
const LIMIAR = 6;
const JANELA = { largura: 340, altura: 480 };

function tela() {
  const largura = window.innerWidth;
  const altura = window.innerHeight;
  const desktop = largura >= 1024;
  return { largura, altura, desktop, topo: 64, base: desktop ? 16 : 84, tam: desktop ? TAM.desktop : TAM.celular };
}

/**
 * As BOLHAS DO CHAT (estilo Messenger), por portal no `body`: uma por conversa aberta (a mais recente em cima; acima de 4,
 * "+N"), arrastáveis para QUALQUER lugar (mouse e toque — limiar de 6px) e, ao soltar, ENCOSTAM na borda mais perto (mola);
 * arrastar até o "×" que aparece embaixo fecha todas; o "×" de cada uma (com o mouse por cima) fecha só ela. Tocar abre/
 * fecha a JANELA da conversa ao lado da pilha (no celular, em tela cheia). Só apresentação: o estado vem de quem usa.
 */
export function BolhasChat({
  bolhas,
  extras,
  ativa,
  posicao,
  onPosicao,
  onTocar,
  onFechar,
  onFecharTodas,
  onExtras,
  janela,
}: {
  bolhas: Bolha[];
  /** Quantas conversas abertas ficaram fora da pilha ("+N" abre a lista). */
  extras: number;
  /** A conversa com a janela aberta. */
  ativa: Conversa | null;
  posicao: PosicaoBolhas;
  onPosicao: (p: PosicaoBolhas) => void;
  onTocar: (c: Conversa) => void;
  onFechar: (c: Conversa) => void;
  onFecharTodas: () => void;
  onExtras: () => void;
  /** O conteúdo da janela da conversa ativa. */
  janela: ReactNode;
}) {
  const [t, setT] = useState<ReturnType<typeof tela> | null>(null);
  useEffect(() => {
    const medir = () => setT(tela());
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  /** Arrastando: o deslocamento da pilha e se está sobre o "×". */
  const [arrasto, setArrasto] = useState<{ dx: number; dy: number; sobreAlvo: boolean } | null>(null);
  const engolirClique = useRef(false);
  const n = bolhas.length + (extras > 0 ? 1 : 0);
  const alturaPilha = t ? n * t.tam + Math.max(0, n - 1) * VAO : 0;
  const esquerda = t ? (posicao.lado === "esq" ? MARGEM : t.largura - MARGEM - t.tam) : 0;
  const topo = t ? topoDasBolhas(posicao, t, alturaPilha) : 0;

  const pegar = useCallback(
    (e: React.PointerEvent) => {
      if (!t || e.button > 0) return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let ativo = false;
      let soltar: (() => void) | null = null;
      let ultimo = { dx: 0, dy: 0, sobreAlvo: false };
      const alvo = { x: t.largura / 2, y: t.altura - t.base - 40 };
      const mover = (ev: PointerEvent) => {
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (!ativo) {
          if (Math.hypot(dx, dy) < LIMIAR) return;
          ativo = true;
          soltar = segurar("grabbing");
        }
        ev.preventDefault();
        const sobreAlvo = Math.hypot(ev.clientX - alvo.x, ev.clientY - alvo.y) < 56;
        ultimo = { dx, dy, sobreAlvo };
        setArrasto(ultimo);
      };
      const fim = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", fim);
        window.removeEventListener("pointercancel", fim);
        soltar?.();
        if (!ativo) return;
        engolirClique.current = true;
        window.setTimeout(() => {
          engolirClique.current = false;
        }, 0);
        setArrasto(null);
        if (ultimo.sobreAlvo) return onFecharTodas();
        const cx = esquerda + ultimo.dx + t.tam / 2;
        onPosicao(encostarBolhas(cx, topo + ultimo.dy, t, alturaPilha));
      };
      window.addEventListener("pointermove", mover, { passive: false });
      window.addEventListener("pointerup", fim);
      window.addEventListener("pointercancel", fim);
    },
    [t, esquerda, topo, alturaPilha, onPosicao, onFecharTodas],
  );

  // Esc fecha a janela (menos com um diálogo por cima).
  useEffect(() => {
    if (!ativa) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role='dialog'][aria-modal='true']")) onTocar(ativa);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [ativa, onTocar]);

  if (!t || (!bolhas.length && !extras)) return null;
  const indiceAtiva = bolhas.findIndex((b) => b.conversa === ativa);
  // A janela AO LADO da pilha (do lado de dentro da tela), alinhada à bolha ativa e presa na área livre.
  const jTopo = Math.min(Math.max(t.topo, topo + Math.max(0, indiceAtiva) * (t.tam + VAO)), Math.max(t.topo, t.altura - t.base - JANELA.altura));
  const jLado = posicao.lado === "dir" ? { right: MARGEM + t.tam + 12 } : { left: MARGEM + t.tam + 12 };
  const telaCheia = t.largura < 640;

  return createPortal(
    <>
      {ativa && janela && (
        <section
          aria-label="Conversa"
          className={`fixed z-[61] flex animate-janela-cresce flex-col overflow-hidden bg-surface ${telaCheia ? "inset-0" : "rounded-card border border-border shadow-soft"}`}
          style={
            telaCheia
              ? undefined
              : { ...jLado, top: jTopo, width: JANELA.largura, height: Math.min(JANELA.altura, t.altura - t.topo - t.base), transformOrigin: posicao.lado === "dir" ? "right top" : "left top" }
          }
        >
          {janela}
        </section>
      )}
      <ul
        aria-label="Conversas abertas"
        className={`fixed z-[60] m-0 flex list-none flex-col p-0 ${arrasto ? "" : "bolha-encosta"} ${telaCheia && ativa ? "hidden" : ""}`}
        style={{ left: esquerda + (arrasto?.dx ?? 0), top: topo + (arrasto?.dy ?? 0), gap: VAO, touchAction: "none" }}
      >
        {bolhas.map((b) => (
          <li key={b.conversa} className={`group/bolha relative ${b.nova ? "animate-cabeca-entra" : ""}`}>
            <button
              type="button"
              onPointerDown={pegar}
              onClick={() => !engolirClique.current && onTocar(b.conversa)}
              aria-label={`${b.rotulo}${b.naoLidas ? ` — ${b.naoLidas} não lida${b.naoLidas === 1 ? "" : "s"}` : ""}`}
              aria-expanded={ativa === b.conversa}
              title={`${b.rotulo} — arraste para mover`}
              className={`relative block cursor-grab rounded-full shadow-soft transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:cursor-grabbing ${
                ativa === b.conversa ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""
              }`}
            >
              <FotoBolha b={b} />
              {b.naoLidas > 0 && (
                <span key={b.naoLidas} className="animate-selo-pop absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-bold text-white ring-2 ring-surface">
                  {b.naoLidas > 99 ? "99+" : b.naoLidas}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onFechar(b.conversa)}
              aria-label={`Fechar a conversa ${b.rotulo}`}
              title="Fechar a conversa"
              className={`absolute -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-text text-surface opacity-0 shadow-soft transition-opacity group-hover/bolha:opacity-100 focus-visible:opacity-100 ${posicao.lado === "dir" ? "-left-1.5" : "-right-1.5"} any-pointer-coarse:hidden`}
            >
              <IconClose className="h-3 w-3" />
            </button>
          </li>
        ))}
        {extras > 0 && (
          <li>
            <button
              type="button"
              onPointerDown={pegar}
              onClick={() => !engolirClique.current && onExtras()}
              aria-label={`Mais ${extras} conversa${extras === 1 ? "" : "s"}`}
              title={`Mais ${extras} conversa${extras === 1 ? "" : "s"}`}
              className="grid cursor-grab place-items-center rounded-full bg-surface-2 text-[14px] font-semibold text-text-2 shadow-soft ring-1 ring-border"
              style={{ width: t.tam, height: t.tam }}
            >
              +{extras}
            </button>
          </li>
        )}
      </ul>
      {arrasto && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed z-[59] grid h-14 w-14 place-items-center rounded-full text-white shadow-soft transition-[background-color,scale] ${arrasto.sobreAlvo ? "animate-alvo-fechar bg-[var(--danger)]" : "bg-text/70"}`}
          style={{ left: t.largura / 2 - 28, top: t.altura - t.base - 68 }}
        >
          <IconClose className="h-6 w-6" />
        </div>
      )}
    </>,
    document.body,
  );
}

/** A foto da bolha: a pessoa (com o ponto de presença), o mosaico da conversa em grupo ou o ícone do grupo ativo. */
export function FotoBolha({ b }: { b: Pick<Bolha, "fotos" | "grupoAtivo" | "presenca" | "rotulo"> }) {
  if (b.grupoAtivo)
    return (
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-white lg:h-14 lg:w-14">
        <IconUsers className="h-6 w-6" />
      </span>
    );
  if (b.fotos.length > 1)
    return (
      <span className="relative block h-12 w-12 rounded-full bg-surface lg:h-14 lg:w-14">
        {b.fotos.slice(0, 2).map((f, i) => (
          <span key={`${f.nome}-${i}`} className={`absolute rounded-full ring-2 ring-surface ${i ? "right-0 bottom-0" : "top-0 left-0"}`}>
            <Avatar nome={f.nome} foto={f.foto} size="md" />
          </span>
        ))}
        {b.fotos.length > 2 && (
          <span className="absolute -bottom-0.5 -left-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-surface-2 px-1 text-[10px] font-semibold text-text-2 ring-2 ring-surface">
            +{b.fotos.length - 2}
          </span>
        )}
      </span>
    );
  const f = b.fotos[0] ?? { nome: b.rotulo };
  return <Avatar nome={f.nome} foto={f.foto} size="bolha" presenca={b.presenca} pulsar={b.presenca === "online"} />;
}
