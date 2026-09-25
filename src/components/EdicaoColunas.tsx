"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { LARGURA_MAX, LARGURA_MIN, soltarColuna } from "@/lib/colunas-layout";
import { IconArrowDown, IconArrowUp, IconEyeOff, IconFixar, IconGrip, IconSort } from "./icons";
import { duracaoMotionMs } from "./Modal";

/**
 * EDIÇÃO DE COLUNAS direto no cabeçalho — as peças COMPARTILHADAS pela tabela cruzada do Comparativo e pela `DataTable`
 * (Mesa): a alça de ARRASTO (a coluna levanta, vai presa ao cursor, a sombra mostra o destino e ela pousa), as ações
 * congelar · ocultar · ordenar e a borda de LARGURA. Mouse, toque e teclado.
 */

/** Enquanto o usuário SEGURA algo (arrastar uma coluna, ajustar a largura): nenhuma seleção de texto (bloqueia o
 * `selectstart` e limpa a que houver) e o cursor da ação no documento inteiro. Devolve a função que desfaz. */
function segurar(cursor: string): () => void {
  const corpo = document.body.style;
  const antes = { cursor: corpo.cursor, selecao: corpo.userSelect };
  const bloquear = (e: Event) => e.preventDefault();
  corpo.cursor = cursor;
  corpo.userSelect = "none";
  window.getSelection()?.removeAllRanges();
  document.addEventListener("selectstart", bloquear);
  return () => {
    corpo.cursor = antes.cursor;
    corpo.userSelect = antes.selecao;
    document.removeEventListener("selectstart", bloquear);
  };
}

/** Alça de LARGURA na borda direita do cabeçalho: arrastar (mouse ou toque), ←/→ no teclado, duplo clique = padrão. */
function AlcaLargura({ rotulo, largura: definida, onLargura }: { rotulo: string; largura?: number; onLargura: (px: number | null) => void }) {
  const [ativa, setAtiva] = useState(false);
  const alca = useRef<HTMLSpanElement>(null);
  const [atual, setAtual] = useState(0); // a largura exibida (px) — o valor do separador para leitores de tela
  const largura = (el: HTMLElement) => (el.parentElement as HTMLElement).getBoundingClientRect().width;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-mede quando a largura DEFINIDA muda.
  useLayoutEffect(() => {
    if (alca.current) setAtual(Math.round(largura(alca.current)));
  }, [definida]);
  const iniciar = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const el = e.currentTarget;
    const x0 = e.clientX;
    const w0 = largura(el);
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    setAtiva(true);
    const soltar = segurar("col-resize");
    let quadro = 0;
    const mover = (ev: PointerEvent) => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => onLargura(w0 + ev.clientX - x0));
    };
    const fim = () => {
      cancelAnimationFrame(quadro);
      soltar();
      setAtiva(false);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", fim);
      el.removeEventListener("pointercancel", fim);
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", fim);
    el.addEventListener("pointercancel", fim);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: separador INTERATIVO (arrastável/teclado) — o <hr> não recebe foco nem eventos.
    <span
      ref={alca}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={atual}
      aria-valuemin={LARGURA_MIN}
      aria-valuemax={LARGURA_MAX}
      aria-label={`Largura de ${rotulo} (setas ajustam, duplo clique volta ao padrão)`}
      tabIndex={0}
      onPointerDown={iniciar}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={() => onLargura(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onLargura(largura(e.currentTarget) + (e.key === "ArrowRight" ? 16 : -16));
      }}
      className="group/alca absolute inset-y-0 -right-2 z-10 w-4 cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span
        className={`absolute inset-y-1.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${
          ativa ? "bg-accent" : "bg-border-2 group-hover/alca:bg-accent/60 group-focus-visible/alca:bg-accent"
        }`}
      />
    </span>
  );
}

/** Ação DIRETA no cabeçalho da coluna (congelar/ocultar/ordenar) — alinhadas no topo, discretas, accent quando ligadas. */
function AcaoColuna({ rotulo, ligada, icone, onClick, disabled = false }: { rotulo: string; ligada: boolean; icone: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={ligada}
      aria-label={rotulo}
      title={rotulo}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-9 w-7 shrink-0 place-items-center rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-30 lg:h-7 lg:w-7 ${
        ligada ? "bg-accent/10 text-accent" : "text-faint hover:bg-surface hover:text-text-2"
      }`}
    >
      {icone}
    </button>
  );
}

/**
 * O cabeçalho de uma coluna EM EDIÇÃO (dentro de um `th` `relative`): a ALÇA de arrasto na faixa esquerda com a altura
 * toda (←/→ no teclado movem), as ações congelar · ocultar · ordenar (▲/▼) ALINHADAS no topo, o conteúdo (o nome — ou o
 * filtro, na `DataTable`) e a borda de LARGURA à direita.
 */
export function CabecalhoEdicao({
  rotulo,
  congelada,
  oculta,
  podeOcultar = true,
  ordem,
  onArrastar,
  onMover,
  onCongelar,
  onOcultar,
  onOrdenar,
  largura,
  onLargura,
  children,
}: {
  rotulo: string;
  congelada: boolean;
  oculta: boolean;
  podeOcultar?: boolean;
  /** A ordenação desta coluna (`null` = não ordena por ela). */
  ordem: "asc" | "desc" | null;
  onArrastar: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onMover: (delta: -1 | 1) => void;
  onCongelar: () => void;
  onOcultar: () => void;
  onOrdenar: () => void;
  largura?: number;
  onLargura: (px: number | null) => void;
  children: ReactNode;
}) {
  const Seta = ordem == null ? IconSort : ordem === "desc" ? IconArrowDown : IconArrowUp;
  return (
    <>
      <button
        type="button"
        aria-label={`Mover ${rotulo} (arraste; ←/→ no teclado)`}
        title="Arraste para mover"
        onPointerDown={onArrastar}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          onMover(e.key === "ArrowLeft" ? -1 : 1);
        }}
        className="absolute inset-y-0 left-0 grid w-5 cursor-grab touch-none select-none place-items-center text-faint transition-colors hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 active:cursor-grabbing"
      >
        <IconGrip className="h-3.5 w-3.5" />
      </button>
      <div className="mb-1 flex items-center justify-center gap-0.5">
        <AcaoColuna
          rotulo={congelada ? `Descongelar ${rotulo}` : `Congelar ${rotulo}`}
          ligada={congelada}
          icone={<IconFixar className="h-3.5 w-3.5" />}
          onClick={onCongelar}
        />
        <AcaoColuna
          rotulo={!podeOcultar ? `${rotulo} não se oculta` : oculta ? `Mostrar ${rotulo}` : `Ocultar ${rotulo}`}
          ligada={oculta}
          icone={<IconEyeOff className="h-3.5 w-3.5" />}
          onClick={onOcultar}
          disabled={!podeOcultar}
        />
        <AcaoColuna
          rotulo={ordem == null ? `Ordenar por ${rotulo}` : `${rotulo}: ${ordem === "desc" ? "decrescente" : "crescente"} (inverter)`}
          ligada={ordem != null}
          icone={<Seta className="h-3.5 w-3.5" />}
          onClick={onOrdenar}
        />
      </div>
      {children}
      <AlcaLargura rotulo={rotulo} largura={largura} onLargura={onLargura} />
    </>
  );
}

/** O arrasto em curso — só o que muda a TABELA (o destino); a posição da coluna presa ao cursor anda direto no DOM. */
export type ArrastoColuna = { chave: string; x: number; y: number; dx: number; dy: number; largura: number; destino: number; pousando?: boolean };

/**
 * ARRASTAR colunas (edição): o nome é a alça — mouse ou toque. Os ouvintes ficam na JANELA (a prévia REORDENA os
 * cabeçalhos no DOM, e mover um nó derruba o pointer capture). A coluna presa segue o cursor DIRETO no DOM (sem
 * re-renderizar a tabela a cada movimento); a tabela só muda quando o DESTINO muda (`vista` = a ordem com a coluna já no
 * lugar onde vai ficar). O destino = antes da 1ª coluna (sem a arrastada) cujo meio fica à direita do cursor; perto das
 * bordas, a tabela rola sozinha. Ao SOLTAR, a coluna POUSA no lugar sombreado e só então `onOrdem` aplica. Os cabeçalhos
 * editáveis são os `thead th[data-col]` dentro de `raiz`.
 */
export function useArrastoColunas({
  raiz,
  rolagem,
  ordem,
  onOrdem,
}: {
  raiz: RefObject<HTMLElement | null>;
  rolagem: RefObject<HTMLElement | null>;
  ordem: { fixadas: string[]; livres: string[] };
  /** Ausente = sem edição (o arrasto não começa). */
  onOrdem?: (fixadas: string[], livres: string[]) => void;
}) {
  const [arrasto, setArrasto] = useState<ArrastoColuna | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const encerrar = useRef<(() => void) | null>(null);
  // Desmontar no meio de um arrasto (ex.: sair da edição) desfaz tudo — ouvintes, cursor, seleção.
  useEffect(() => () => encerrar.current?.(), []);

  const iniciar = (e: ReactPointerEvent<HTMLButtonElement>, chave: string) => {
    if (!onOrdem || !e.isPrimary || e.button > 0 || arrasto?.pousando) return;
    const th = e.currentTarget.closest("th");
    const rolo = rolagem.current;
    if (!th || !rolo) return;
    if (e.pointerType === "mouse") e.preventDefault(); // sem seleção nem foco a partir daqui (o clique segue valendo)
    encerrar.current?.();
    e.currentTarget.focus({ preventScroll: true });
    const caixa = th.getBoundingClientRect();
    const pega = { dx: e.clientX - caixa.left, dy: e.clientY - caixa.top, largura: caixa.width };
    const ponteiro = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let destino = -1;
    let vel = 0;
    let quadro = 0;
    let soltarCursor: (() => void) | null = null;
    const soltarSelecao = segurar("");
    const calcular = () => {
      const lista = [...(raiz.current?.querySelectorAll<HTMLElement>("thead th[data-col]") ?? [])].filter((c) => c.dataset.col !== chave);
      const i = lista.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return ultimo.x < r.left + r.width / 2;
      });
      const novo = i < 0 ? lista.length : i;
      if (novo === destino) return;
      destino = novo;
      setArrasto({ chave, x: ultimo.x, y: ultimo.y, ...pega, destino });
    };
    const moverFantasma = () => {
      if (fantasma.current) fantasma.current.style.transform = `translate3d(${ultimo.x - pega.dx}px, ${ultimo.y - pega.dy}px, 0)`;
    };
    const rolar = () => {
      if (vel) {
        rolo.scrollLeft += vel;
        calcular();
      }
      quadro = requestAnimationFrame(rolar);
    };
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      ultimo = { x: ev.clientX, y: ev.clientY };
      if (!ativo) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ativo = true;
        soltarCursor = segurar("grabbing");
        quadro = requestAnimationFrame(rolar);
      }
      const r = rolo.getBoundingClientRect();
      vel = ev.clientX < r.left + 56 ? -14 : ev.clientX > r.right - 56 ? 14 : 0;
      moverFantasma();
      calcular();
    };
    const limpar = () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      soltarCursor?.();
      soltarSelecao();
      encerrar.current = null;
    };
    // SOLTAR: a coluna presa POUSA no lugar sombreado (voa até ele e volta ao tamanho) e só então a ordem é aplicada.
    const fim = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      limpar();
      if (!ativo || ev.type !== "pointerup" || destino < 0) return setArrasto(null);
      const r = soltarColuna(ordem.fixadas, ordem.livres, chave, destino);
      const lugar = raiz.current?.querySelector<HTMLElement>(`thead th[data-col="${CSS.escape(chave)}"]`)?.getBoundingClientRect();
      const aplicar = () => {
        setArrasto(null);
        onOrdem(r.fixadas, r.livres);
      };
      const ms = duracaoMotionMs();
      if (!lugar || ms <= 0) return aplicar();
      setArrasto({ chave, x: lugar.left + pega.dx, y: lugar.top + pega.dy, ...pega, destino, pousando: true });
      window.setTimeout(aplicar, ms);
    };
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  };

  /** Move UMA posição (teclado ←/→) a coluna que está na posição `p` da ordem exibida. */
  const mover = (chave: string, p: number, delta: -1 | 1) => {
    if (!onOrdem) return;
    const r = soltarColuna(ordem.fixadas, ordem.livres, chave, delta < 0 ? Math.max(0, p - 1) : p + 1);
    onOrdem(r.fixadas, r.livres);
  };
  /** Congela/descongela UMA coluna (vai ao fim das congeladas / ao início das livres). */
  const congelar = (chave: string) => {
    if (!onOrdem) return;
    const { fixadas: f, livres: l } = ordem;
    if (f.includes(chave)) onOrdem(f.filter((x) => x !== chave), [chave, ...l]);
    else onOrdem([...f, chave], l.filter((x) => x !== chave));
  };

  const vista = arrasto ? soltarColuna(ordem.fixadas, ordem.livres, arrasto.chave, arrasto.destino) : ordem;
  return { arrasto, vista, fantasma, iniciar, mover, congelar };
}

/** A coluna PRESA ao cursor (no mesmo ponto em que foi pega): o nome + as primeiras células. LEVANTA ao pegar e POUSA ao
 * soltar. */
export function ColunaPresa({
  arrasto,
  fantasma,
  rotulo,
  celulas,
  direita = false,
}: {
  arrasto: ArrastoColuna;
  fantasma: RefObject<HTMLDivElement | null>;
  rotulo: string;
  celulas: ReactNode[];
  direita?: boolean;
}) {
  return createPortal(
    <div
      aria-hidden
      ref={fantasma}
      className="pointer-events-none fixed top-0 left-0 z-[300] select-none will-change-transform"
      style={{
        width: arrasto.largura,
        transform: `translate3d(${arrasto.x - arrasto.dx}px, ${arrasto.y - arrasto.dy}px, 0)`,
        transition: arrasto.pousando ? "transform var(--motion-duration) var(--motion-ease)" : undefined,
      }}
    >
      <div
        className={`animate-levantar overflow-hidden rounded-control border border-accent/60 bg-surface text-[13px] transition-[scale,box-shadow] duration-[var(--motion-duration)] ${
          arrasto.pousando ? "scale-100 shadow-none" : "scale-[1.04] shadow-soft"
        }`}
      >
        <div className="flex items-center justify-center gap-1 border-b border-border bg-surface-2 px-5 py-2 text-center text-[12px] font-medium text-text">
          <span className="truncate">{rotulo}</span>
        </div>
        {celulas.map((c, i) => (
          <div key={i} className={`truncate border-b border-border/60 py-1.5 pr-3 pl-5 tabular-nums text-text-2 ${direita ? "text-right" : ""}`}>
            {c}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
