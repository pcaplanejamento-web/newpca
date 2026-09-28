"use client";

import { type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { duracaoMotionMs } from "./Modal";
import { segurar } from "./segurar";

/** O cartão em arrasto: onde foi pego (dx/dy dentro dele), o tamanho e o DESTINO (lista + posição, sem ele mesmo). */
export type ArrastoCartao = {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  largura: number;
  altura: number;
  listaId: number;
  indice: number;
  pousando?: boolean;
};

const LIMIAR = 6;
const BORDA = 56;
const VEL = 14;

/**
 * ARRASTAR cartões entre as listas de um quadro (o padrão do arrasto de colunas — `EdicaoColunas`): mouse/caneta no
 * cartão inteiro, toque pela ALÇA (o dedo no cartão rola a tela); o encaixe das colunas fica desligado durante o arrasto. Ouvintes na JANELA, começa depois de 6px, o cartão PRESO
 * anda direto no DOM (`translate3d`), a tela só re-renderiza quando o DESTINO muda, o quadro rola sozinho perto das
 * bordas (na horizontal; e a lista/página na vertical) e, ao soltar, o cartão POUSA no lugar sombreado antes de a ordem
 * mudar. O DOM: `[data-lista]` (a coluna) › `[data-cartoes]` (a pilha que rola) › `[data-cartao]`.
 */
export function useArrastoCartoes({
  quadro,
  onMover,
}: {
  /** O contêiner que rola na horizontal (as colunas). */
  quadro: RefObject<HTMLElement | null>;
  /** Ausente = sem arrasto. `indice` = a posição na lista de destino SEM o próprio cartão. */
  onMover?: (id: number, listaId: number, indice: number) => void;
}) {
  const [arrasto, setArrasto] = useState<ArrastoCartao | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const encerrar = useRef<(() => void) | null>(null);
  const arrastou = useRef(false);
  useEffect(() => () => encerrar.current?.(), []);

  const iniciar = (e: ReactPointerEvent<HTMLElement>, id: number, listaId: number) => {
    if (!onMover || !e.isPrimary || e.button > 0 || arrasto?.pousando) return;
    const cartao = e.currentTarget.closest<HTMLElement>("[data-cartao]");
    const rolo = quadro.current;
    if (!cartao || !rolo) return;
    if (e.pointerType === "mouse") e.preventDefault(); // sem seleção de texto (o clique segue valendo)
    encerrar.current?.();
    arrastou.current = false;
    const caixa = cartao.getBoundingClientRect();
    const pega = { dx: e.clientX - caixa.left, dy: e.clientY - caixa.top, largura: caixa.width, altura: caixa.height };
    const ponteiro = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let destino = { listaId, indice: -1 };
    let velX = 0;
    let velY = 0;
    let pilhaY: HTMLElement | null = null;
    let quadroRaf = 0;
    let soltarCursor: (() => void) | null = null;
    const soltarSelecao = segurar("");

    const calcular = () => {
      const colunas = [...rolo.querySelectorAll<HTMLElement>("[data-lista]")];
      if (!colunas.length) return;
      // A coluna sob o ponteiro (ou a mais próxima na horizontal).
      let col = colunas[0];
      let dist = Number.POSITIVE_INFINITY;
      for (const c of colunas) {
        const r = c.getBoundingClientRect();
        const d = ultimo.x < r.left ? r.left - ultimo.x : ultimo.x > r.right ? ultimo.x - r.right : 0;
        if (d < dist) {
          dist = d;
          col = c;
        }
      }
      const cartoes = [...col.querySelectorAll<HTMLElement>("[data-cartao]")].filter((c) => c.dataset.cartao !== String(id));
      const i = cartoes.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return ultimo.y < r.top + r.height / 2;
      });
      const novo = { listaId: Number(col.dataset.lista), indice: i < 0 ? cartoes.length : i };
      pilhaY = col.querySelector<HTMLElement>("[data-cartoes]");
      if (novo.listaId === destino.listaId && novo.indice === destino.indice) return;
      destino = novo;
      setArrasto({ id, x: ultimo.x, y: ultimo.y, ...pega, ...destino });
    };
    const moverFantasma = () => {
      if (fantasma.current) fantasma.current.style.transform = `translate3d(${ultimo.x - pega.dx}px, ${ultimo.y - pega.dy}px, 0)`;
    };
    const rolar = () => {
      if (velX) rolo.scrollLeft += velX;
      if (velY) {
        // A pilha da lista rola por dentro (desktop); sem rolagem própria (celular), rola a página.
        if (pilhaY && pilhaY.scrollHeight > pilhaY.clientHeight + 1) pilhaY.scrollTop += velY;
        else window.scrollBy(0, velY);
      }
      if (velX || velY) calcular();
      quadroRaf = requestAnimationFrame(rolar);
    };
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      ultimo = { x: ev.clientX, y: ev.clientY };
      if (!ativo) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < LIMIAR) return;
        ativo = true;
        arrastou.current = true;
        // O ENCAIXE das colunas (celular: `snap-x mandatory`) puxaria de volta cada passo da rolagem automática.
        rolo.style.scrollSnapType = "none";
        soltarCursor = segurar("grabbing");
        calcular();
        quadroRaf = requestAnimationFrame(rolar);
      }
      if (ev.cancelable) ev.preventDefault();
      const r = rolo.getBoundingClientRect();
      velX = ev.clientX < r.left + BORDA ? -VEL : ev.clientX > r.right - BORDA ? VEL : 0;
      const p = pilhaY && pilhaY.scrollHeight > pilhaY.clientHeight + 1 ? pilhaY.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      velY = ev.clientY < p.top + BORDA ? -VEL : ev.clientY > p.bottom - BORDA ? VEL : 0;
      moverFantasma();
      calcular();
    };
    const limpar = () => {
      cancelAnimationFrame(quadroRaf);
      rolo.style.scrollSnapType = "";
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      soltarCursor?.();
      soltarSelecao();
      encerrar.current = null;
    };
    // SOLTAR: o cartão POUSA no lugar sombreado e só então a ordem muda.
    const fim = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      limpar();
      // Só o clique LOGO depois do arrasto é ignorado — o próximo toque (num cartão sem alça, no celular) abre normalmente.
      if (ativo) window.setTimeout(() => (arrastou.current = false), 0);
      if (!ativo || ev.type !== "pointerup" || destino.indice < 0) return setArrasto(null);
      const final = destino;
      const aplicar = () => {
        setArrasto(null);
        onMover(id, final.listaId, final.indice);
      };
      const lugar = rolo.querySelector<HTMLElement>("[data-sombra-cartao]")?.getBoundingClientRect();
      const ms = duracaoMotionMs();
      if (!lugar || ms <= 0) return aplicar();
      setArrasto({ id, x: lugar.left + pega.dx, y: lugar.top + pega.dy, ...pega, ...final, pousando: true });
      window.setTimeout(aplicar, ms);
    };
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  };

  /** O último gesto foi um ARRASTO (o clique que vem depois não abre o cartão). */
  const foiArrasto = () => {
    const f = arrastou.current;
    arrastou.current = false;
    return f;
  };

  return { arrasto, fantasma, iniciar, foiArrasto };
}

/** A LISTA em arrasto: onde foi pega, o tamanho e o DESTINO (a posição entre as outras listas). */
export type ArrastoLista = { id: number; x: number; y: number; dx: number; dy: number; largura: number; altura: number; indice: number; pousando?: boolean };

/**
 * ARRASTAR as LISTAS para reordená-las (como no Trello): pega-se pelo CABEÇALHO da lista (mouse/caneta; no toque, pela
 * alça). O MESMO padrão do arrasto de cartões — ouvintes na janela, limiar de 6px, a coluna PRESA anda no DOM
 * (`translate3d`), o quadro rola sozinho perto das bordas e, ao soltar, a coluna POUSA no lugar sombreado antes de a ordem
 * mudar. O clique logo depois do arrasto é engolido (não abre a edição do nome). `indice` = a posição SEM a própria lista.
 */
export function useArrastoListas({ quadro, onMover }: { quadro: RefObject<HTMLElement | null>; onMover?: (id: number, indice: number) => void }) {
  const [arrasto, setArrasto] = useState<ArrastoLista | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const encerrar = useRef<(() => void) | null>(null);
  useEffect(() => () => encerrar.current?.(), []);

  const iniciar = (e: ReactPointerEvent<HTMLElement>, id: number) => {
    if (!onMover || !e.isPrimary || e.button > 0 || arrasto?.pousando) return;
    const coluna = e.currentTarget.closest<HTMLElement>("[data-lista]");
    const rolo = quadro.current;
    if (!coluna || !rolo) return;
    if (e.pointerType === "mouse") e.preventDefault(); // sem seleção de texto (o clique segue valendo)
    encerrar.current?.();
    const caixa = coluna.getBoundingClientRect();
    const pega = { dx: e.clientX - caixa.left, dy: e.clientY - caixa.top, largura: caixa.width, altura: caixa.height };
    const ponteiro = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let indice = -1;
    let velX = 0;
    let raf = 0;
    let soltarCursor: (() => void) | null = null;
    let soltarSelecao: (() => void) | null = null;

    const calcular = () => {
      const outras = [...rolo.querySelectorAll<HTMLElement>("[data-lista]")].filter((c) => c.dataset.lista !== String(id) && c.dataset.lista !== "nova");
      const i = outras.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return ultimo.x < r.left + r.width / 2;
      });
      const novo = i < 0 ? outras.length : i;
      if (novo === indice) return;
      indice = novo;
      setArrasto({ id, x: ultimo.x, y: ultimo.y, ...pega, indice });
    };
    const moverFantasma = () => {
      if (fantasma.current) fantasma.current.style.transform = `translate3d(${ultimo.x - pega.dx}px, ${ultimo.y - pega.dy}px, 0)`;
    };
    const rolar = () => {
      if (velX) {
        rolo.scrollLeft += velX;
        calcular();
      }
      raf = requestAnimationFrame(rolar);
    };
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      ultimo = { x: ev.clientX, y: ev.clientY };
      if (!ativo) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < LIMIAR) return;
        ativo = true;
        rolo.style.scrollSnapType = "none";
        soltarSelecao = segurar("");
        soltarCursor = segurar("grabbing");
        calcular();
        raf = requestAnimationFrame(rolar);
      }
      if (ev.cancelable) ev.preventDefault();
      const r = rolo.getBoundingClientRect();
      velX = ev.clientX < r.left + BORDA ? -VEL : ev.clientX > r.right - BORDA ? VEL : 0;
      moverFantasma();
      calcular();
    };
    // O clique que o navegador dispara ao soltar (sobre o nome da lista) não pode abrir a edição.
    const engolirClique = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    const limpar = () => {
      cancelAnimationFrame(raf);
      rolo.style.scrollSnapType = "";
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      soltarCursor?.();
      soltarSelecao?.();
      encerrar.current = null;
    };
    const fim = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      limpar();
      if (!ativo) return;
      window.addEventListener("click", engolirClique, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", engolirClique, { capture: true }), 0);
      if (ev.type !== "pointerup" || indice < 0) return setArrasto(null);
      const final = indice;
      const aplicar = () => {
        setArrasto(null);
        onMover(id, final);
      };
      const lugar = rolo.querySelector<HTMLElement>("[data-sombra-lista]")?.getBoundingClientRect();
      const ms = duracaoMotionMs();
      if (!lugar || ms <= 0) return aplicar();
      setArrasto({ id, x: lugar.left + pega.dx, y: lugar.top + pega.dy, ...pega, indice: final, pousando: true });
      window.setTimeout(aplicar, ms);
    };
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  };

  return { arrasto, fantasma, iniciar };
}

/** O LUGAR onde a lista vai cair (a sombra, no tamanho dela). */
export function SombraLista({ largura, altura }: { largura: number; altura: number }) {
  return <div data-sombra-lista aria-hidden className="shrink-0 rounded-xl bg-accent/10 ring-1 ring-accent/30 ring-inset" style={{ width: largura, height: altura }} />;
}

/**
 * O cartão (ou a LISTA — com `altura`) PRESO ao cursor, no ponto em que foi pego — o conteúdo real, inclinado; LEVANTA ao
 * pegar e POUSA ao soltar.
 */
export function CartaoPreso({
  arrasto,
  fantasma,
  children,
}: {
  /** `entrando` = pousa ENCOLHENDO e sumindo (o quadro que entra numa pasta). */
  arrasto: Pick<ArrastoCartao, "x" | "y" | "dx" | "dy" | "largura" | "pousando"> & { altura?: number; entrando?: boolean };
  fantasma: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return createPortal(
    <div
      aria-hidden
      ref={fantasma}
      className="pointer-events-none fixed top-0 left-0 z-[300] select-none will-change-transform"
      style={{
        width: arrasto.largura,
        // A LISTA presa não passa da altura que tinha (as colunas altas rolam por dentro).
        ...(arrasto.altura ? { height: arrasto.altura } : {}),
        transform: `translate3d(${arrasto.x - arrasto.dx}px, ${arrasto.y - arrasto.dy}px, 0)`,
        transition: arrasto.pousando ? "transform var(--motion-duration) var(--motion-ease)" : undefined,
      }}
    >
      <div
        className={`animate-levantar transition-[rotate,scale,box-shadow,opacity] duration-[var(--motion-duration)] ${arrasto.altura ? "h-full [&>*]:!max-h-full [&>*]:h-full" : ""} ${
          arrasto.pousando ? (arrasto.entrando ? "rotate-0 scale-[0.2] opacity-0" : "rotate-0 scale-100") : "rotate-2 scale-[1.03] [&>*]:shadow-soft"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** O LUGAR onde o cartão vai cair (a sombra, na altura dele). */
export function SombraCartao({ altura }: { altura: number }) {
  return <div data-sombra-cartao aria-hidden className="shrink-0 rounded-card bg-accent/10 ring-1 ring-accent/30 ring-inset" style={{ height: altura }} />;
}
