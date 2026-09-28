"use client";

import { type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ROTULO_BLOCO, ROTULO_METADADO, type TipoBloco, type TipoMetadado } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import {
  IconArrowDown,
  IconArrowUp,
  IconAtribuir,
  IconCalendar,
  IconChecklist,
  IconClock,
  IconEtiqueta,
  IconGrip,
  IconLink,
  IconNota,
  IconPlus,
  IconBandeira,
  IconEstimativa,
  IconTrash,
  IconWeb,
} from "./icons";
import { segurar } from "./segurar";

/** O ícone de cada bloco do corpo — o mesmo no menu "+ Adicionar", na moldura e no cartão. */
export const ICONE_BLOCO: Record<TipoBloco, ComponentType<{ className?: string }>> = {
  nota: IconNota,
  checklist: IconChecklist,
  link: IconWeb,
  eventos: IconClock,
  vinculo: IconLink,
};
/** O ícone de cada METADADO (a faixa do topo do detalhe). */
export const ICONE_METADADO: Record<TipoMetadado, ComponentType<{ className?: string }>> = {
  membros: IconAtribuir,
  etiquetas: IconEtiqueta,
  datas: IconCalendar,
  prioridade: IconBandeira,
  estimativa: IconEstimativa,
};

/** O bloco da tarefa sendo arrastado (reordenar). */
export type CargaBloco = { id: string };
type Arrasto = { carga: CargaBloco; rotulo: string; x: number; y: number; indice: number };

const LIMIAR = 6;
const BORDA = 56;
const VEL = 12;

/** O primeiro ancestral que rola na vertical (o corpo do banner). */
function rolagemDe(el: HTMLElement | null): HTMLElement | null {
  for (let e = el?.parentElement ?? null; e; e = e.parentElement) {
    const o = getComputedStyle(e).overflowY;
    if ((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 1) return e;
  }
  return null;
}

/**
 * ARRASTAR blocos da tarefa (o padrão do arrasto de cartões): a ALÇA de um bloco o reordena. Ouvintes na JANELA, começa depois de 6px, a lista (`[data-bloco]` dentro de
 * `lista`) só re-renderiza quando o DESTINO muda (a linha-guia), o banner rola sozinho perto das bordas e o chip preso
 * segue o ponteiro. Sem arrastar (clique/toque) = `onToque`.
 */
export function useArrastoBlocos(lista: RefObject<HTMLElement | null>, onSoltar: (carga: CargaBloco, indice: number) => void) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const encerrar = useRef<(() => void) | null>(null);
  useEffect(() => () => encerrar.current?.(), []);

  const iniciar = (e: ReactPointerEvent<HTMLElement>, carga: CargaBloco, rotulo: string, onToque?: () => void) => {
    if (!e.isPrimary || e.button > 0) return;
    const alvo = lista.current;
    if (!alvo) return;
    if (e.pointerType === "mouse") e.preventDefault();
    encerrar.current?.();
    const ponteiro = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let indice = -1;
    let vel = 0;
    let raf = 0;
    let soltarCursor: (() => void) | null = null;
    const soltarSelecao = segurar("");
    const rolo = rolagemDe(alvo);

    const calcular = () => {
      const blocos = [...alvo.querySelectorAll<HTMLElement>("[data-bloco]")].filter((b) => b.dataset.bloco !== carga.id);
      const i = blocos.findIndex((b) => {
        const r = b.getBoundingClientRect();
        return ultimo.y < r.top + r.height / 2;
      });
      const novo = i < 0 ? blocos.length : i;
      if (novo === indice) return;
      indice = novo;
      setArrasto({ carga, rotulo, x: ultimo.x, y: ultimo.y, indice });
    };
    const rolar = () => {
      if (vel && rolo) {
        rolo.scrollTop += vel;
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
        soltarCursor = segurar("grabbing");
        calcular();
        raf = requestAnimationFrame(rolar);
      }
      if (ev.cancelable) ev.preventDefault();
      const r = rolo?.getBoundingClientRect();
      vel = r ? (ev.clientY < r.top + BORDA ? -VEL : ev.clientY > r.bottom - BORDA ? VEL : 0) : 0;
      if (fantasma.current) fantasma.current.style.transform = `translate3d(${ultimo.x + 12}px, ${ultimo.y + 12}px, 0)`;
      calcular();
    };
    const limpar = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      soltarCursor?.();
      soltarSelecao();
      encerrar.current = null;
    };
    const fim = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      limpar();
      setArrasto(null);
      if (!ativo) {
        if (ev.type === "pointerup") onToque?.();
        return;
      }
      // Solto longe da lista (acima/abaixo dela na horizontal fora) ainda vale: a posição é a da linha-guia.
      if (ev.type === "pointerup" && indice >= 0) onSoltar(carga, indice);
    };
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  };

  return { arrasto, fantasma, iniciar };
}

/** O chip PRESO ao ponteiro durante um arrasto (um bloco da tarefa, uma tarefa no calendário). */
export function ChipPreso({ rotulo, x, y, fantasma }: { rotulo: string; x: number; y: number; fantasma: RefObject<HTMLDivElement | null> }) {
  return createPortal(
    <div aria-hidden ref={fantasma} className="pointer-events-none fixed top-0 left-0 z-[300] will-change-transform" style={{ transform: `translate3d(${x + 12}px, ${y + 12}px, 0)` }}>
      <span className="inline-flex h-9 max-w-[16rem] animate-levantar items-center gap-1.5 rounded-full border border-accent bg-surface px-3 text-[12.5px] font-semibold text-accent shadow-soft">
        <IconGrip className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{rotulo}</span>
      </span>
    </div>,
    document.body,
  );
}

/** A linha-guia onde o bloco vai entrar. */
export function GuiaBloco() {
  return <div aria-hidden className="h-1 rounded-full bg-accent" />;
}

/**
 * O MENU "+ Adicionar" do detalhe (o "Adicionar ao cartão" do Trello): os METADADOS que ainda não estão na faixa
 * (membros, etiquetas, datas, prioridade, estimativa) e os BLOCOS do corpo que ainda cabem (nota e link sempre; checklist,
 * eventos e vínculo uma vez). Escolher = o host acrescenta.
 */
export function MenuAdicionarCartao({
  metadados,
  blocos,
  disabled = false,
  onMetadado,
  onBloco,
}: {
  metadados: TipoMetadado[];
  blocos: TipoBloco[];
  disabled?: boolean;
  onMetadado: (t: TipoMetadado) => void;
  onBloco: (t: TipoBloco) => void;
}) {
  if (!metadados.length && !blocos.length) return null;
  return (
    <Dropdown
      width={250}
      ariaLabel="Adicionar ao cartão"
      triggerClassName={`h-11 gap-1.5 rounded-control border border-border bg-surface-2 px-3 text-[13px] font-semibold text-text-2 hover:bg-surface lg:h-[var(--h-control-sm)] ${disabled ? "pointer-events-none opacity-50" : ""}`}
      trigger={
        <>
          <IconPlus className="h-4 w-4" />
          Adicionar
        </>
      }
    >
      {(fechar) => {
        const item = (chave: string, rotulo: string, Icone: ComponentType<{ className?: string }>, fn: () => void) => (
          <button
            key={chave}
            type="button"
            onClick={() => {
              fechar();
              fn();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 lg:min-h-9"
          >
            <Icone className="h-4 w-4 text-muted" />
            {rotulo}
          </button>
        );
        return (
          <div className="space-y-0.5">
            <p className="px-2 pt-1 pb-0.5 text-[12px] font-semibold text-muted">Adicionar ao cartão</p>
            {metadados.map((t) => item(`m-${t}`, ROTULO_METADADO[t], ICONE_METADADO[t], () => onMetadado(t)))}
            {metadados.length > 0 && blocos.length > 0 && <div className="my-1 border-t border-border" />}
            {blocos.map((t) => item(`b-${t}`, ROTULO_BLOCO[t], ICONE_BLOCO[t], () => onBloco(t)))}
          </div>
        );
      }}
    </Dropdown>
  );
}

/**
 * A MOLDURA de um bloco da tarefa: a ALÇA (arrasta para reordenar; no toque, também), o título com o ícone, ↑/↓ (teclado
 * e toque), remover e o conteúdo. `arrastando` = o lugar que ele ocupa enquanto é movido (sombreado).
 */
export function MolduraBloco({
  id,
  tipo,
  titulo,
  primeiro,
  ultimo,
  disabled = false,
  arrastando = false,
  onPegar,
  onMover,
  onRemover,
  children,
}: {
  id: string;
  tipo: TipoBloco;
  titulo?: string;
  primeiro: boolean;
  ultimo: boolean;
  disabled?: boolean;
  arrastando?: boolean;
  onPegar?: (e: ReactPointerEvent<HTMLElement>) => void;
  onMover: (direcao: -1 | 1) => void;
  onRemover: () => void;
  children: ReactNode;
}) {
  const Icone = ICONE_BLOCO[tipo];
  const nome = titulo ?? ROTULO_BLOCO[tipo];
  return (
    <section
      data-bloco={id}
      aria-label={nome}
      className={`rounded-card border border-border bg-surface transition-opacity duration-[var(--motion-duration)] ${arrastando ? "opacity-40" : ""}`}
    >
      <header className="flex items-center gap-1 border-b border-border py-1 pr-1 pl-0.5">
        {!disabled && onPegar ? (
          <span
            role="presentation"
            title="Arrastar para reordenar"
            onPointerDown={onPegar}
            className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-faint hover:text-text-2 active:cursor-grabbing lg:h-[var(--h-control-sm)] lg:w-9"
          >
            <IconGrip className="h-4 w-4" />
          </span>
        ) : (
          <span className="w-2" />
        )}
        <Icone className="h-4 w-4 shrink-0 text-text-2" />
        <h3 className="min-w-0 flex-1 truncate pl-1 text-[13.5px] font-bold text-text">{nome}</h3>
        {!disabled && (
          <div className="flex shrink-0 gap-0.5">
            <Button variant="ghost" size="xs" disabled={primeiro} aria-label={`Mover ${nome} para cima`} icon={<IconArrowUp className="h-4 w-4" />} onClick={() => onMover(-1)} />
            <Button variant="ghost" size="xs" disabled={ultimo} aria-label={`Mover ${nome} para baixo`} icon={<IconArrowDown className="h-4 w-4" />} onClick={() => onMover(1)} />
            <Button variant="ghost" size="xs" aria-label={`Remover ${nome}`} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} onClick={onRemover} />
          </div>
        )}
      </header>
      <div className="p-[var(--pad-card)]">{children}</div>
    </section>
  );
}
