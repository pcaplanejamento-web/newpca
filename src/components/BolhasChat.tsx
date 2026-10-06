"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Conversa, encostarBolhas, type PosicaoBolhas, topoDasBolhas } from "@/lib/chat-core";
import { Avatar } from "./Avatar";
import { IconTrash, IconUsers } from "./icons";
import { duracaoMotionMs } from "./Modal";
import { segurar } from "./segurar";

/** Uma bolha: a foto da pessoa (ou o mosaico de até 2 numa conversa em grupo), o ponto de presença e as não lidas. */
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
/** A LIXEIRA: o tamanho, a distância da base da área livre e o raio em que a bolha é ATRAÍDA para dentro dela. */
const LIXEIRA = { tam: 64, base: 28, ima: 72 };

function tela() {
  const largura = window.innerWidth;
  const altura = window.innerHeight;
  const desktop = largura >= 1024;
  return { largura, altura, desktop, topo: 64, base: desktop ? 16 : 84, tam: desktop ? TAM.desktop : TAM.celular };
}

type Arrasto = { conversa: Conversa; x: number; y: number; naLixeira: boolean };

const escPermitido = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role='dialog'][aria-modal='true']");

/**
 * As BOLHAS DO CHAT (estilo Messenger), por portal no `body`: uma por conversa aberta (a mais recente em cima; acima de 4,
 * "+N"). ARRASTAR uma bolha (mouse e toque — limiar de 6px) a leva presa ao dedo; ao soltar, a PILHA encosta na borda mais
 * perto (mola) naquela altura. Durante o arrasto surge a LIXEIRA no centro inferior: soltar nela EXCLUI a conversa (a bolha
 * é atraída e some dentro dela) — o único jeito de excluir. Tocar abre a JANELA ao lado da pilha; tocar de novo, Esc ou
 * qualquer toque fora MINIMIZA (com o alfinete `fixada`, só o toque na bolha e o Esc). No celular, a janela ocupa a tela.
 */
export function BolhasChat({
  bolhas,
  extras,
  ativa,
  fixada,
  posicao,
  onPosicao,
  onTocar,
  onMinimizar,
  onExcluir,
  onExtras,
  janela,
}: {
  bolhas: Bolha[];
  /** Quantas conversas abertas ficaram fora da pilha ("+N" abre a lista). */
  extras: number;
  /** A conversa com a janela aberta. */
  ativa: Conversa | null;
  /** A janela fica aberta mesmo tocando fora (o alfinete). */
  fixada: boolean;
  posicao: PosicaoBolhas;
  onPosicao: (p: PosicaoBolhas) => void;
  onTocar: (c: Conversa) => void;
  onMinimizar: () => void;
  onExcluir: (c: Conversa) => void;
  onExtras: () => void;
  /** O conteúdo da janela de uma conversa (a aberta, ou a que está fechando — a animação de saída). */
  janela: (c: Conversa) => ReactNode;
}) {
  const [t, setT] = useState<ReturnType<typeof tela> | null>(null);
  useEffect(() => {
    const medir = () => setT(tela());
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  /** A bolha que está SUMINDO na lixeira (a animação antes de excluir). */
  const [sumindo, setSumindo] = useState<Conversa | null>(null);
  const engolirClique = useRef(false);
  const pilhaRef = useRef<HTMLUListElement>(null);
  const janelaRef = useRef<HTMLElement>(null);

  // A janela EXIBIDA: a ativa — e, ao minimizar, a que está saindo até o fim da animação (o MESMO elemento: nada remonta).
  const [exibida, setExibida] = useState<Conversa | null>(ativa);
  const [fechando, setFechando] = useState(false);
  useEffect(() => {
    if (ativa) {
      setExibida(ativa);
      setFechando(false);
      return;
    }
    setFechando(true);
    const x = window.setTimeout(() => {
      setExibida(null);
      setFechando(false);
    }, duracaoMotionMs() + 40);
    return () => window.clearTimeout(x);
  }, [ativa]);

  // MINIMIZAR: o Esc sempre; qualquer toque FORA da janela e das bolhas, menos com o alfinete (ou num aviso/diálogo por cima).
  useEffect(() => {
    if (!ativa) return;
    const fora = (e: PointerEvent) => {
      if (fixada) return;
      const alvo = e.target as Element | null;
      if (!alvo || janelaRef.current?.contains(alvo) || pilhaRef.current?.contains(alvo)) return;
      if (alvo.closest?.(".avisos-flutuantes, [role='dialog'], [data-sobre-dropdown]")) return;
      onMinimizar();
    };
    const tecla = (e: KeyboardEvent) => escPermitido(e) && onMinimizar();
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", tecla);
    };
  }, [ativa, fixada, onMinimizar]);

  const n = bolhas.length + (extras > 0 ? 1 : 0);
  const passo = t ? t.tam + VAO : 0;
  const alturaPilha = t ? n * t.tam + Math.max(0, n - 1) * VAO : 0;
  const esquerda = t ? (posicao.lado === "esq" ? MARGEM : t.largura - MARGEM - t.tam) : 0;
  const topo = t ? topoDasBolhas(posicao, t, alturaPilha) : 0;
  const lixeira = t ? { x: t.largura / 2, y: t.altura - t.base - LIXEIRA.base - LIXEIRA.tam / 2 } : { x: 0, y: 0 };

  const pegar = useCallback(
    (e: React.PointerEvent, conversa: Conversa, indice: number) => {
      if (!t || e.button > 0) return;
      // Segura JÁ na pressão (antes do limiar): o navegador não começa a selecionar texto nem a arrastar a foto.
      if (e.pointerType === "mouse") e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const yBolha = topo + indice * passo;
      // Onde o dedo pegou a bolha (ela segue presa nesse ponto).
      const dx0 = x0 - esquerda;
      const dy0 = y0 - yBolha;
      let ativo = false;
      let soltar: (() => void) | null = null;
      let ultimo: Arrasto = { conversa, x: esquerda, y: yBolha, naLixeira: false };
      const mover = (ev: PointerEvent) => {
        if (!ativo) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < LIMIAR) return;
          ativo = true;
          soltar = segurar("grabbing");
        }
        ev.preventDefault();
        const naLixeira = Math.hypot(ev.clientX - lixeira.x, ev.clientY - lixeira.y) < LIXEIRA.ima;
        if (naLixeira && !ultimo.naLixeira) navigator.vibrate?.(10);
        // Perto da lixeira, a bolha é ATRAÍDA para o centro dela (ímã).
        ultimo = naLixeira
          ? { conversa, x: lixeira.x - t.tam / 2, y: lixeira.y - t.tam / 2, naLixeira }
          : { conversa, x: ev.clientX - dx0, y: ev.clientY - dy0, naLixeira };
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
        if (ultimo.naLixeira) {
          // Some DENTRO da lixeira (a animação) e então é excluída.
          setSumindo(conversa);
          window.setTimeout(() => {
            setSumindo(null);
            setArrasto(null);
            onExcluir(conversa);
          }, duracaoMotionMs() + 120);
          return;
        }
        setArrasto(null);
        // A PILHA vai para onde a bolha foi solta: o lado mais perto, a altura em que ela ficou.
        onPosicao(encostarBolhas(ultimo.x + t.tam / 2, ultimo.y - indice * passo, t, alturaPilha));
      };
      window.addEventListener("pointermove", mover, { passive: false });
      window.addEventListener("pointerup", fim);
      window.addEventListener("pointercancel", fim);
    },
    [t, passo, esquerda, topo, alturaPilha, lixeira.x, lixeira.y, onPosicao, onExcluir],
  );

  if (!t || (!bolhas.length && !extras && !exibida)) return null;
  const indiceAtiva = Math.max(
    0,
    bolhas.findIndex((b) => b.conversa === exibida),
  );
  // A janela AO LADO da pilha (do lado de dentro da tela), alinhada à bolha ativa e presa na área livre; cresce A PARTIR da
  // bolha (a origem da animação é o centro dela).
  const yAtiva = topo + indiceAtiva * passo;
  const altJanela = Math.min(JANELA.altura, t.altura - t.topo - t.base);
  const jTopo = Math.min(Math.max(t.topo, yAtiva), Math.max(t.topo, t.altura - t.base - altJanela));
  const jLado = posicao.lado === "dir" ? { right: MARGEM + t.tam + 14 } : { left: MARGEM + t.tam + 14 };
  const telaCheia = t.largura < 640;
  const arrastando = arrasto != null && sumindo == null;

  return createPortal(
    <>
      {exibida && (
        <section
          ref={janelaRef}
          aria-label="Conversa"
          className={`fixed z-[61] flex flex-col overflow-hidden bg-surface ${fechando ? "animate-janela-sai" : "animate-janela-cresce"} ${
            telaCheia ? "inset-0" : "rounded-card border border-border shadow-flutuante"
          }`}
          style={
            telaCheia
              ? undefined
              : {
                  ...jLado,
                  top: jTopo,
                  width: JANELA.largura,
                  height: altJanela,
                  transformOrigin: `${posicao.lado === "dir" ? "right" : "left"} ${Math.max(0, yAtiva - jTopo + t.tam / 2)}px`,
                }
          }
        >
          {janela(exibida)}
        </section>
      )}
      <ul
        ref={pilhaRef}
        aria-label="Conversas abertas"
        // Nada de arrasto/seleção NATIVOS (a imagem da foto "saía" com o mouse) nem o menu de salvar imagem no toque longo:
        // o arrasto é o da bolha.
        onDragStart={(e) => e.preventDefault()}
        className={`fixed z-[60] m-0 flex list-none flex-col p-0 select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none [&_img]:[-webkit-user-drag:none] ${arrasto ? "" : "bolha-encosta"} ${telaCheia && ativa ? "hidden" : ""}`}
        style={{ left: esquerda, top: topo, gap: VAO, touchAction: "none" }}
      >
        {bolhas.map((b, i) => {
          const presa = arrasto?.conversa === b.conversa ? arrasto : null;
          return (
            <li
              key={b.conversa}
              className={`relative ${b.nova && !presa ? "animate-cabeca-entra" : ""}`}
              style={
                presa
                  ? {
                      // Presa ao dedo (a partir do lugar dela na pilha); na lixeira, encolhe e some dentro.
                      transform: `translate3d(${presa.x - esquerda}px, ${presa.y - (topo + i * passo)}px, 0) scale(${sumindo === b.conversa ? 0.1 : presa.naLixeira ? 0.82 : 1.08})`,
                      opacity: sumindo === b.conversa ? 0 : 1,
                      transition: presa.naLixeira ? "transform calc(var(--motion-duration) * 1.2) cubic-bezier(0.34, 1.56, 0.64, 1), opacity var(--motion-duration) ease-in" : "none",
                      zIndex: 2,
                    }
                  : undefined
              }
            >
              <button
                type="button"
                draggable={false}
                onPointerDown={(e) => pegar(e, b.conversa, i)}
                onClick={() => !engolirClique.current && onTocar(b.conversa)}
                aria-label={`${b.rotulo}${b.naoLidas ? ` — ${b.naoLidas} não lida${b.naoLidas === 1 ? "" : "s"}` : ""}`}
                aria-expanded={ativa === b.conversa}
                title={`${b.rotulo} — tocar abre ou minimiza; arraste para mover, ou até a lixeira para excluir`}
                className={`relative flex h-12 w-12 cursor-grab items-center justify-center rounded-full transition-[transform,box-shadow] duration-[var(--motion-duration)] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:cursor-grabbing lg:h-14 lg:w-14 ${
                  presa ? "shadow-erguida" : "shadow-flutuante"
                } ${ativa === b.conversa ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
              >
                <FotoBolha b={b} />
                {b.naoLidas > 0 && (
                  <span key={b.naoLidas} className="animate-selo-pop absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-bold text-white ring-2 ring-surface">
                    {b.naoLidas > 99 ? "99+" : b.naoLidas}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {extras > 0 && (
          <li>
            <button
              type="button"
              onClick={onExtras}
              aria-label={`Mais ${extras} conversa${extras === 1 ? "" : "s"}`}
              title={`Mais ${extras} conversa${extras === 1 ? "" : "s"}`}
              className="flex items-center justify-center rounded-full bg-surface text-[14px] font-semibold text-text-2 shadow-flutuante transition-transform duration-[var(--motion-duration)] hover:scale-105"
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
          className={`pointer-events-none fixed z-[59] ${arrastando ? "animate-lixeira-entra" : "animate-lixeira-sai"}`}
          style={{ width: LIXEIRA.tam, height: LIXEIRA.tam, left: lixeira.x - LIXEIRA.tam / 2, top: lixeira.y - LIXEIRA.tam / 2 }}
        >
          <span
            className={`flex h-full w-full items-center justify-center rounded-full text-white shadow-flutuante transition-[background-color,transform] duration-[var(--motion-duration)] ${
              arrasto.naLixeira ? "scale-[1.18] bg-[var(--danger)]" : "bg-[color-mix(in_oklab,var(--text)_70%,transparent)]"
            }`}
          >
            <IconTrash className={`h-6 w-6 transition-transform duration-[var(--motion-duration)] ${arrasto.naLixeira ? "-rotate-12 scale-110" : ""}`} />
          </span>
        </div>
      )}
      {arrastando && (
        <p aria-live="polite" className="sr-only">
          {arrasto.naLixeira ? "Solte para excluir a conversa" : "Arraste até a lixeira para excluir"}
        </p>
      )}
    </>,
    document.body,
  );
}

/** A foto da bolha: a pessoa (com o ponto de presença), o mosaico da conversa em grupo ou o ícone do grupo ativo — sempre
 * um CÍRCULO perfeito do tamanho da bolha. */
export function FotoBolha({ b }: { b: Pick<Bolha, "fotos" | "grupoAtivo" | "presenca" | "rotulo"> }) {
  if (b.grupoAtivo)
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white lg:h-14 lg:w-14">
        <IconUsers className="h-6 w-6" />
      </span>
    );
  if (b.fotos.length > 1)
    return (
      <span className="relative flex h-12 w-12 rounded-full bg-surface lg:h-14 lg:w-14">
        {b.fotos.slice(0, 2).map((f, i) => (
          <span key={`${f.nome}-${i}`} className={`absolute flex rounded-full ring-2 ring-surface ${i ? "right-0 bottom-0" : "top-0 left-0"}`}>
            <Avatar nome={f.nome} foto={f.foto} size="md" />
          </span>
        ))}
        {b.fotos.length > 2 && (
          <span className="absolute -bottom-0.5 -left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2 px-1 text-[10px] font-semibold text-text-2 ring-2 ring-surface">
            +{b.fotos.length - 2}
          </span>
        )}
      </span>
    );
  const f = b.fotos[0] ?? { nome: b.rotulo };
  return <Avatar nome={f.nome} foto={f.foto} size="bolha" presenca={b.presenca} pulsar={b.presenca === "online"} />;
}
