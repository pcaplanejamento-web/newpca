"use client";

import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { diasExibidos, type FeriadoDia, N_DIAS, OPCOES_CALENDARIO_PADRAO, OPCOES_LEMBRETE, type OpcoesCalendario, semanaIso, type VistaCalendario } from "@/lib/calendario-core";
import { dataBR, num } from "@/lib/format";
import { predicadoBusca } from "@/lib/tabela-filtros";
import {
  COR_ESTADO_PRAZO,
  DURACAO_PADRAO_MIN,
  type EstadoPrazo,
  type EventoCalendario,
  estadoPrazo,
  eventosDoDia,
  faixasDaSemana,
  fimDeSemana,
  gradeMes,
  horaDeMinutos,
  horaValida,
  layoutDoDia,
  minutosDe,
  NOMES_MES,
  ROTULO_ESTADO_PRAZO,
  rotuloTicket,
  semanaDe,
  somarDias,
  somarMes,
} from "@/lib/tarefas-core";
import { FOLGA, topoNoDocumento } from "./AlturaCheia";
import { ChipPreso } from "./BlocosTarefa";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { ehDesktop } from "./espacamento";
import { SearchField, SelectField, TextField } from "./Field";
import {
  IconCalendar,
  IconCheck,
  IconChecklist,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCirculo,
  IconCirculoCheck,
  IconGrip,
  IconImprimir,
  IconMenu,
  IconPlus,
  IconRepetir,
  IconSettings,
  IconTeclado,
} from "./icons";
import { JanelaFlutuante } from "./JanelaFlutuante";
import { Modal } from "./Modal";
import { segurar } from "./segurar";
import { Switch } from "./Switch";

export type MesCalendario = { ano: number; mes: number };
/** O que o calendário oferece à barra lateral: o dia em foco, "ir para", o mês à vista, a vista e os dias à vista. */
export type NavCalendario = { foco: string; irPara: (dia: string) => void; mes: MesCalendario; vista: VistaCalendario; destaque: string[] };
/** Onde criar: o dia, a hora (grade) e o fim (arrastando), e o ponto da tela (a janela de criação abre ao lado). */
export type SlotCriar = { data: string; hora: string | null; horaFim: string | null; ancora: { x: number; y: number; w: number; h: number } | null };
/** O evento provisório na grade enquanto a janela de criação está aberta ("(Sem título)"). */
export type RascunhoCalendario = { data: string; hora: string | null; horaFim: string | null; titulo: string };
/** Uma tarefa SEM PRAZO do painel (arrastar até um dia define o prazo). */
export type TarefaSemPrazo = { id: number; quadroId: number; ticket: number; titulo: string };

/** Altura de UMA hora na grade (px). */
const HORA_PX = 48;
const LIMIAR = 6;
const BORDA = 48;
const VEL = 12;
const LEGENDA: EstadoPrazo[] = ["ok", "vence", "hoje", "atrasada", "concluida"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeDia = (d: string) => DIAS_CURTOS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const mesDoDia = (d: string): MesCalendario => ({ ano: Number(d.slice(0, 4)), mes: Number(d.slice(5, 7)) });
const prefixoMes = (m: MesCalendario) => `${m.ano}-${String(m.mes).padStart(2, "0")}`;
const HORAS = Array.from({ length: 24 }, (_, h) => h);
const ROTULO_VISTA: Record<VistaCalendario, string> = { dia: "Dia", ndias: `${N_DIAS} dias`, semana: "Semana", mes: "Mês", ano: "Ano", agenda: "Programação" };
const TECLA_VISTA: Record<VistaCalendario, string> = { dia: "D", ndias: "X", semana: "S", mes: "M", ano: "Y", agenda: "A" };
const VISTA_DA_TECLA: Record<string, VistaCalendario> = { d: "dia", x: "ndias", s: "semana", w: "semana", m: "mes", y: "ano", a: "agenda" };
const CHAVE_VISTA = "calendario:vista";
const CHAVE_PAINEL = "calendario:painel-tarefas";
const lerLocal = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravarLocal = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // sem armazenamento: só não lembra
  }
};
type Retangulo = { x: number; y: number; w: number; h: number };
const retangulo = (el: Element): Retangulo => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
/** Desktop? (seguro no servidor — lá, `true`: o HTML nasce no layout do desktop). */
const ehDesktopSeguro = () => (typeof window === "undefined" ? true : ehDesktop());

/**
 * ALTURA ATÉ O FIM DA TELA (celular e desktop): do topo do bloco até a borda de baixo do display, menos o respiro de
 * baixo do `<main>` (no celular ele já soma a navegação inferior) — o calendário nunca faz a página rolar; tudo rola por
 * dentro. Mínimo de 460px (uma tela muito baixa rola um pouco, sem esmagar a grade).
 */
function useAlturaTela(ref: RefObject<HTMLElement | null>): number | null {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const calc = () => {
      const el = ref.current;
      if (!el) return;
      const main = el.closest("main");
      const pb = main ? Number.parseFloat(getComputedStyle(main).paddingBottom) || 0 : 16;
      setH(Math.max(460, Math.floor(window.innerHeight - topoNoDocumento(el) - pb - FOLGA)));
    };
    calc();
    window.addEventListener("resize", calc);
    const ro = new ResizeObserver(calc);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", calc);
      ro.disconnect();
    };
  }, [ref]);
  return h;
}

/** A altura (px) de um elemento, acompanhando o redimensionamento. */
function useAltura(ref: RefObject<HTMLElement | null>, chave: string): number {
  const [h, setH] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: remede quando o elemento muda (outra vista).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, [ref, chave]);
  return h;
}

/** Os minutos de AGORA no horário de Brasília (a linha do agora) — atualiza a cada minuto; `null` antes de montar. */
function useAgoraMin(): number | null {
  const [m, setM] = useState<number | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
    const ler = () => {
      const [h, mm] = fmt.format(new Date()).split(":").map(Number);
      setM(h * 60 + mm);
    };
    ler();
    const t = window.setInterval(ler, 60_000);
    return () => window.clearInterval(t);
  }, []);
  return m;
}

type Arrasto = { chave: string; rotulo: string; x: number; y: number; dia: string | null; hora: string | null };

/**
 * ARRASTAR um evento para outro dia/horário (mouse/caneta no evento; no toque, pela alça): o destino é o `[data-dia]` sob
 * o ponteiro — numa coluna da GRADE DE HORAS (`data-grade`) também a HORA (de 15 em 15 min). O destino fica destacado; o
 * contêiner que rola (`data-rolador`) rola sozinho perto das bordas. O clique que vem depois de um arrasto não abre nada.
 */
function useArrastoEventos(onSoltar?: (e: EventoCalendario, dia: string, hora: string | null) => void) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const encerrar = useRef<(() => void) | null>(null);
  const arrastou = useRef(false);
  useEffect(() => () => encerrar.current?.(), []);

  const iniciar = (ev0: ReactPointerEvent<HTMLElement>, e: EventoCalendario) => {
    if (!onSoltar || !ev0.isPrimary || ev0.button > 0) return;
    if (ev0.pointerType === "mouse") ev0.preventDefault();
    ev0.stopPropagation();
    encerrar.current?.();
    arrastou.current = false;
    const ponteiro = ev0.pointerId;
    const x0 = ev0.clientX;
    const y0 = ev0.clientY;
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let dia: string | null = null;
    let hora: string | null = null;
    let vel = 0;
    let rolador: HTMLElement | null = null;
    let raf = 0;
    let soltarCursor: (() => void) | null = null;
    const soltarSelecao = segurar("");

    const calcular = () => {
      const alvo = document.elementFromPoint(ultimo.x, ultimo.y)?.closest<HTMLElement>("[data-dia]") ?? null;
      const d = alvo?.dataset.dia ?? null;
      let h: string | null = null;
      if (alvo?.dataset.grade != null) {
        const r = alvo.getBoundingClientRect();
        h = horaDeMinutos(Math.round((((ultimo.y - r.top) / r.height) * 1440) / 15) * 15);
      }
      if (d === dia && h === hora) return;
      dia = d;
      hora = h;
      setArrasto({ chave: e.chave, rotulo: e.titulo, x: ultimo.x, y: ultimo.y, dia, hora });
    };
    const rolar = () => {
      if (vel) {
        if (rolador) rolador.scrollTop += vel;
        else window.scrollBy(0, vel);
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
        arrastou.current = true;
        soltarCursor = segurar("grabbing");
        raf = requestAnimationFrame(rolar);
      }
      if (ev.cancelable) ev.preventDefault();
      rolador = document.elementFromPoint(ultimo.x, ultimo.y)?.closest<HTMLElement>("[data-rolador]") ?? null;
      const r = rolador?.getBoundingClientRect();
      const topo = r?.top ?? 0;
      const base = r?.bottom ?? window.innerHeight;
      vel = ev.clientY < topo + BORDA ? -VEL : ev.clientY > base - BORDA ? VEL : 0;
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
      if (!ativo || ev.type !== "pointerup" || !dia) return;
      const mudouDia = e.tipo === "periodo" ? dia !== e.fim : dia !== e.inicio;
      const mudouHora = hora != null && e.tipo === "evento" && hora !== e.horaInicio;
      if (mudouDia || mudouHora) onSoltar(e, dia, e.tipo === "evento" ? hora : null);
    };
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  };

  const foiArrasto = () => {
    const f = arrastou.current;
    arrastou.current = false;
    return f;
  };
  return { arrasto, fantasma, iniciar, foiArrasto };
}

/**
 * REDIMENSIONAR (a duração, como no Google Agenda): arrastar a BORDA de baixo de um evento com hora na grade — o fim anda
 * de 15 em 15 min (no mínimo 15 min depois do início); ao soltar, `onSoltar(e, horaFim)`. `previa` = o fim enquanto arrasta.
 */
function useRedimensionar(onSoltar?: (e: EventoCalendario, horaFim: string) => void) {
  const [previa, setPrevia] = useState<{ chave: string; fim: number } | null>(null);
  const encerrar = useRef<(() => void) | null>(null);
  const redimensionou = useRef(false);
  useEffect(() => () => encerrar.current?.(), []);
  const iniciar = (ev0: ReactPointerEvent<HTMLElement>, e: EventoCalendario) => {
    if (!onSoltar || !ev0.isPrimary || ev0.button > 0 || !horaValida(e.horaInicio)) return;
    ev0.preventDefault();
    ev0.stopPropagation();
    const coluna = ev0.currentTarget.closest<HTMLElement>("[data-grade]");
    if (!coluna) return;
    encerrar.current?.();
    redimensionou.current = false;
    const ponteiro = ev0.pointerId;
    const topo = minutosDe(e.horaInicio);
    let fim = horaValida(e.horaFim) && minutosDe(e.horaFim) > topo ? minutosDe(e.horaFim) : topo + DURACAO_PADRAO_MIN;
    const soltarCursor = segurar("ns-resize");
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      if (ev.cancelable) ev.preventDefault();
      const r = coluna.getBoundingClientRect();
      const min = Math.round((((ev.clientY - r.top) / r.height) * 1440) / 15) * 15;
      fim = Math.min(24 * 60 - 1, Math.max(topo + 15, min));
      redimensionou.current = true;
      setPrevia({ chave: e.chave, fim });
    };
    const limpar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      soltarCursor();
      encerrar.current = null;
    };
    const soltar = (ev: PointerEvent) => {
      if (ev.pointerId !== ponteiro) return;
      limpar();
      setPrevia(null);
      if (ev.type === "pointerup" && redimensionou.current) onSoltar(e, horaDeMinutos(fim));
    };
    encerrar.current = limpar;
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  };
  const foiRedimensionar = () => {
    const f = redimensionou.current;
    redimensionou.current = false;
    return f;
  };
  return { previa, iniciar, foiRedimensionar };
}

/**
 * CRIAR ARRASTANDO na grade de horas (mouse/caneta, como no Google Agenda): pressionar num horário vazio e arrastar marca
 * o intervalo (de 15 em 15 min); soltar abre a criação com início e fim. Um clique simples cria com 1 h. No toque, o toque
 * simples (`onClick`) cria — arrastar o dedo rola a grade.
 */
function useCriarArrastando(onCriar?: (slot: SlotCriar) => void) {
  const [selecao, setSelecao] = useState<{ dia: string; ini: number; fim: number } | null>(null);
  const toque = useRef(false);
  const iniciar = (ev0: ReactPointerEvent<HTMLElement>, dia: string) => {
    toque.current = ev0.pointerType === "touch";
    if (!onCriar || ev0.pointerType === "touch" || ev0.button > 0 || ev0.target !== ev0.currentTarget) return;
    ev0.preventDefault();
    const coluna = ev0.currentTarget;
    const r0 = coluna.getBoundingClientRect();
    const minDe = (y: number) => Math.max(0, Math.min(24 * 60, Math.trunc(((y - r0.top) / r0.height) * 1440)));
    const ini = Math.floor(minDe(ev0.clientY) / 15) * 15;
    let fim = ini + 15;
    let moveu = false;
    const soltarCursor = segurar("");
    const mover = (e: PointerEvent) => {
      const m = Math.ceil(minDe(e.clientY) / 15) * 15;
      if (Math.abs(m - ini) >= 15) moveu = true;
      if (!moveu) return;
      fim = Math.max(ini + 15, m);
      setSelecao({ dia, ini, fim });
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      soltarCursor();
      const i = moveu ? ini : Math.floor(ini / 30) * 30;
      const f = moveu ? Math.min(fim, 24 * 60 - 1) : Math.min(i + 60, 24 * 60 - 1);
      const r = coluna.getBoundingClientRect();
      setSelecao(null);
      onCriar({ data: dia, hora: horaDeMinutos(i), horaFim: horaDeMinutos(f), ancora: { x: r.left, y: r.top + (i / 1440) * r.height, w: r.width, h: ((f - i) / 1440) * r.height } });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };
  /** O toque simples na grade (o mouse já tratou no pointerdown). */
  const tocar = (ev: { clientY: number; currentTarget: HTMLElement; target: EventTarget }, dia: string) => {
    if (!onCriar || !toque.current || ev.target !== ev.currentTarget) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const i = Math.floor((((ev.clientY - r.top) / r.height) * 1440) / 30) * 30;
    onCriar({ data: dia, hora: horaDeMinutos(i), horaFim: horaDeMinutos(Math.min(i + 60, 24 * 60 - 1)), ancora: null });
  };
  return { selecao, iniciar, tocar };
}

/** A cor de um evento: a própria, senão a do QUADRO; o período da tarefa sem quadro com cor usa o SEMÁFORO do prazo. */
function corDoEvento(e: EventoCalendario, hoje: string, corQuadro?: (quadroId: number) => string | undefined) {
  const semaforo = COR_ESTADO_PRAZO[estadoPrazo(e.fim, hoje, e.concluida)];
  if (e.pca) return { faixa: "var(--info)", semaforo };
  return { faixa: e.cor ?? corQuadro?.(e.quadroId) ?? (e.tipo === "periodo" ? semaforo : "var(--accent)"), semaforo };
}

/** A origem curta do evento no chip: "#12" (tarefa) ou "PCA" (previsão do PCA). */
const origemCurta = (e: EventoCalendario) => (e.pca ? "PCA" : rotuloTicket(e.ticket));
/** "09:30–10:00" / "" — o horário no rótulo do evento. */
const horarioDe = (e: EventoCalendario) => (e.diaInteiro || !e.horaInicio ? "" : `${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ""}`);

/**
 * UM EVENTO no calendário: horário (se tiver) + título + #ticket, na cor do evento/quadro — o PERÍODO da tarefa leva o
 * CÍRCULO de concluir (como a tarefa do Google) na cor do semáforo; a recorrência e o PCA vêm tracejados. Tocar abre o
 * banner; arrastar reagenda (no toque, pela alça — só nas listas).
 */
function EventoChip({
  e,
  hoje,
  corQuadro,
  compacta = false,
  onAbrir,
  onPegar,
  onConcluir,
  recusado = false,
}: {
  e: EventoCalendario;
  hoje: string;
  corQuadro?: (quadroId: number) => string | undefined;
  compacta?: boolean;
  onAbrir: () => void;
  onPegar?: (ev: ReactPointerEvent<HTMLElement>) => void;
  onConcluir?: () => void;
  /** Quem vê RECUSOU o convite (riscado, esmaecido). */
  recusado?: boolean;
}) {
  const { faixa, semaforo } = corDoEvento(e, hoje, corQuadro);
  const hora = horarioDe(e);
  const titulo = `${e.titulo}${hora ? ` — ${hora}` : ""} · ${e.pca ? e.pca.pcaNome : rotuloTicket(e.ticket)}${e.tipo === "periodo" ? ` — ${ROTULO_ESTADO_PRAZO[estadoPrazo(e.fim, hoje, e.concluida)]}` : ""}${e.tipo === "recorrencia" ? (e.prevista ? " (ocorrência prevista)" : " (próxima ocorrência)") : ""}`;
  const tracejado = e.tipo === "recorrencia" || e.tipo === "pca";
  const livre = e.ocupado === false;
  return (
    <div
      className={`relative flex h-full min-w-0 items-stretch rounded-[6px] ${tracejado ? "border border-dashed" : livre ? "border" : ""} ${recusado ? "opacity-60" : ""}`}
      style={{ background: livre ? "var(--surface)" : `color-mix(in srgb, ${faixa} 14%, var(--surface))`, borderColor: tracejado || livre ? faixa : undefined }}
    >
      {e.tipo === "periodo" && onConcluir ? (
        <button
          type="button"
          onClick={onConcluir}
          aria-label={e.concluida ? `Reabrir ${e.titulo}` : `Concluir ${e.titulo}`}
          title={e.concluida ? "Reabrir a tarefa" : "Concluir a tarefa"}
          className={`grid shrink-0 place-items-center rounded-l-[6px] transition-colors hover:text-[var(--ok)] ${compacta ? "w-5" : "w-11 lg:w-7"}`}
          style={{ color: e.concluida ? "var(--ok)" : semaforo }}
        >
          {e.concluida ? <IconCirculoCheck className="h-3.5 w-3.5" /> : <IconCirculo className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <span aria-hidden className="w-[3px] shrink-0 rounded-l-[6px]" style={{ background: faixa }} />
      )}
      <button
        type="button"
        onClick={onAbrir}
        onPointerDown={(ev) => ev.pointerType !== "touch" && onPegar?.(ev)}
        title={titulo}
        className={`flex min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left leading-tight text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          compacta ? "h-full text-[11px]" : "min-h-11 text-[12.5px] lg:min-h-8"
        } ${onPegar ? "cursor-grab active:cursor-grabbing" : ""} ${e.concluida || recusado ? "text-muted line-through decoration-faint" : ""}`}
      >
        {e.tipo === "periodo" && !onConcluir && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: semaforo }} />}
        {hora && <span className="shrink-0 font-semibold tabular-nums text-text-2">{e.horaInicio}</span>}
        <span className="truncate">{e.titulo}</span>
        {!compacta && <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint">{origemCurta(e)}</span>}
        {e.recorrente && <IconRepetir aria-label="Recorrente" className={`${compacta ? "ml-auto" : ""} h-3 w-3 shrink-0 text-faint`} />}
      </button>
      {onPegar && !compacta && (
        <span
          role="presentation"
          title="Arrastar para outro dia"
          onPointerDown={(ev) => ev.pointerType === "touch" && onPegar(ev)}
          className="hidden w-11 shrink-0 touch-none items-center justify-center text-faint any-pointer-coarse:flex"
        >
          <IconGrip className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

/** Um evento COM HORA na grade de horas: a caixa do horário (título + horário) e a BORDA de baixo que muda a duração. */
function EventoCaixa({
  e,
  hoje,
  corQuadro,
  onAbrir,
  onPegar,
  onRedimensionar,
  fimPrevia = null,
  recusado = false,
}: {
  e: EventoCalendario;
  hoje: string;
  corQuadro?: (quadroId: number) => string | undefined;
  onAbrir: () => void;
  onPegar?: (ev: ReactPointerEvent<HTMLElement>) => void;
  onRedimensionar?: (ev: ReactPointerEvent<HTMLElement>) => void;
  fimPrevia?: number | null;
  recusado?: boolean;
}) {
  const { faixa } = corDoEvento(e, hoje, corQuadro);
  const livre = e.ocupado === false;
  const horario = fimPrevia != null ? `${e.horaInicio}–${horaDeMinutos(fimPrevia)}` : horarioDe(e);
  return (
    <div className="relative h-full w-full">
      <button
        type="button"
        onClick={onAbrir}
        onPointerDown={(ev) => onPegar?.(ev)}
        title={`${e.titulo} — ${horario} · ${origemCurta(e)}${e.local ? ` · ${e.local}` : ""}`}
        className={`flex h-full w-full flex-col overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-[11px] leading-tight text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${onPegar ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${e.concluida || recusado ? "text-muted line-through" : ""} ${recusado ? "opacity-60" : ""}`}
        style={{
          background: livre ? "var(--surface)" : `color-mix(in srgb, ${faixa} 22%, var(--surface))`,
          boxShadow: livre ? `inset 3px 0 0 ${faixa}, inset 0 0 0 1px ${faixa}` : `inset 3px 0 0 ${faixa}`,
        }}
      >
        <span className="truncate font-semibold">{e.titulo}</span>
        <span className="truncate tabular-nums text-text-2">
          {horario}
          {e.local ? ` · ${e.local}` : ""}
        </span>
      </button>
      {onRedimensionar && (
        <span
          role="presentation"
          title="Arrastar para mudar a duração"
          onPointerDown={onRedimensionar}
          className="absolute inset-x-1 bottom-0 flex h-2 cursor-ns-resize touch-none items-end justify-center any-pointer-coarse:h-4"
        >
          <span aria-hidden className="mb-0.5 h-1 w-6 rounded-full bg-[color-mix(in_srgb,var(--text)_30%,transparent)]" />
        </span>
      )}
    </div>
  );
}

/** O evento provisório "(Sem título)" enquanto a janela de criação está aberta. */
function ChipRascunho({ titulo, horario }: { titulo: string; horario?: string }) {
  return (
    <div className="flex h-full min-h-5 w-full flex-col justify-center overflow-hidden rounded-[6px] bg-accent px-1.5 py-0.5 text-[11px] leading-tight text-white shadow-soft">
      <span className="truncate font-semibold">{titulo.trim() || "(Sem título)"}</span>
      {horario && <span className="truncate tabular-nums opacity-90">{horario}</span>}
    </div>
  );
}

/** Um item do menu de vistas (a tecla de atalho à direita). */
function ItemMenu({ rotulo, tecla, ativo, onClick }: { rotulo: string; tecla?: string; ativo?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={!!ativo}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2.5 text-left text-[13px] lg:min-h-9 ${ativo ? "bg-accent-soft font-semibold text-accent" : "text-text hover:bg-surface-2"}`}
    >
      {rotulo}
      {tecla && <kbd className="font-mono text-[11px] text-faint">{tecla}</kbd>}
    </button>
  );
}
/** Uma opção de marcar do menu de vistas (✓). */
function ItemMarcar({ rotulo, marcado, onClick }: { rotulo: string; marcado: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={marcado}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] text-text hover:bg-surface-2 lg:min-h-9"
    >
      <span className="grid h-4 w-4 place-items-center text-accent">{marcado && <IconCheck className="h-4 w-4" />}</span>
      {rotulo}
    </button>
  );
}

const ATALHOS: [string, string][] = [
  ["Dia · 4 dias · Semana · Mês · Ano · Programação", "D · X · S · M · Y · A"],
  ["Hoje", "T"],
  ["Anterior · seguinte", "← → ou P · N"],
  ["Criar", "C"],
  ["Ir para uma data", "G"],
  ["Buscar", "/"],
  ["Esta ajuda", "?"],
];

/**
 * CALENDÁRIO por EVENTOS (o módulo Calendário e a aba Calendário do quadro) — minimalista, no padrão do Google Agenda, e
 * OCUPANDO A TELA (`useAlturaTela`: a página não rola — a barra lateral, a grade e os painéis rolam por dentro):
 * - BARRA: menu (celular) · Hoje · ‹ › · o período · o menu de VISTAS (Dia · 4 dias · Semana · Mês · Ano · Programação, com
 *   as teclas + Mostrar fins de semana / tarefas concluídas / número da semana + Imprimir) · atalhos · ⚙ configurações · o
 *   painel das TAREFAS SEM PRAZO · Criar;
 * - LATERAL (`lateral`): os números, o conteúdo do host (mini-mês, filtros, conjuntos) e a legenda; no celular, folha;
 * - Dia · 4 dias · Semana: a GRADE DE HORAS (dia todo no topo; eventos pela hora, lado a lado quando se cruzam; a LINHA DO
 *   AGORA; o EXPEDIENTE — fora dele, sombreado; o fuso); pressionar e ARRASTAR num horário vazio cria com o intervalo; o
 *   teclado também cria (foco na coluna, ↑/↓, Enter); a BORDA de baixo muda a duração;
 * - Mês: a grade ENCHE a altura (quantas faixas cabem por dia sai da altura real; "+N mais" abre o dia ao lado);
 * - Ano: os 12 meses; Programação: a lista.
 * ARRASTAR reagenda (`onMover`; a recorrência e o PCA não se arrastam); o CÍRCULO do período conclui/reabre
 * (`onConcluir`). `rascunho` = o "(Sem título)" enquanto se cria; `semPrazo` = o painel das tarefas sem prazo (arrastar
 * até um dia). Recebe os eventos JÁ FILTRADOS; `mes`/`onMes` = mês controlado pelo host; `onAno` = a vista Ano pede o ano.
 */
export function CalendarioTarefas({
  eventos: eventosEntrada,
  hoje,
  contadores,
  onAbrir,
  onCriar,
  onMover,
  onRedimensionar,
  onConcluir,
  corQuadro,
  mes: mesControlado,
  onMes,
  onAno,
  legenda,
  lateral,
  rotuloLateral = "Filtros",
  opcoes = OPCOES_CALENDARIO_PADRAO,
  onOpcoes,
  configuracoes,
  feriados,
  rascunho = null,
  semPrazo,
  nomeQuadro,
  onAbrirTarefa,
  usuarioId = null,
}: {
  eventos: EventoCalendario[];
  hoje: string;
  contadores: { atrasadas: number; hoje: number; naSemana: number; semPrazo: number };
  onAbrir: (e: EventoCalendario) => void;
  /** Criar no dia (e na hora/intervalo, na grade). */
  onCriar?: (slot: SlotCriar) => void;
  onMover?: (e: EventoCalendario, dia: string, hora: string | null) => void;
  onRedimensionar?: (e: EventoCalendario, horaFim: string) => void;
  onConcluir?: (e: EventoCalendario) => void;
  corQuadro?: (quadroId: number) => string | undefined;
  mes?: MesCalendario;
  onMes?: (m: MesCalendario) => void;
  onAno?: (anual: boolean) => void;
  legenda?: ReactNode;
  lateral?: (nav: NavCalendario) => ReactNode;
  rotuloLateral?: string;
  opcoes?: OpcoesCalendario;
  onOpcoes?: (o: OpcoesCalendario) => void;
  /** Conteúdo extra das configurações (⚙) — ex.: exportar/assinar. */
  configuracoes?: ReactNode;
  feriados?: Map<string, FeriadoDia[]>;
  rascunho?: RascunhoCalendario | null;
  semPrazo?: TarefaSemPrazo[];
  nomeQuadro?: (quadroId: number) => string | undefined;
  onAbrirTarefa?: (id: number) => void;
  /** Quem vê (os convites que RECUSOU ficam riscados — ou somem, com "Mostrar eventos recusados" desligado). */
  usuarioId?: number | null;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const altura = useAlturaTela(raiz);
  const [mesLocal, setMesLocal] = useState<MesCalendario>(() => mesControlado ?? mesDoDia(hoje));
  const mes = mesControlado ?? mesLocal;
  const [vista, setVista] = useState<VistaCalendario>("mes");
  const [foco, setFoco] = useState(() => (hoje.startsWith(prefixoMes(mes)) ? hoje : `${prefixoMes(mes)}-01`));
  const [diaAberto, setDiaAberto] = useState<{ dia: string; ancora: Retangulo | null } | null>(null);
  const [lateralAberta, setLateralAberta] = useState(false);
  const [config, setConfig] = useState(false);
  const [ajuda, setAjuda] = useState(false);
  const [irData, setIrData] = useState<string | null>(null);
  const [painel, setPainel] = useState(false);
  const [buscaSemPrazo, setBuscaSemPrazo] = useState("");
  const inicioSemana = opcoes.inicioSegunda ? 1 : 0;
  const grade = useMemo(() => gradeMes(mes.ano, mes.mes, inicioSemana), [mes.ano, mes.mes, inicioSemana]);
  const semana = useMemo(() => semanaDe(foco, inicioSemana), [foco, inicioSemana]);
  const exibir = (sem: string[]) => diasExibidos(sem, opcoes);
  const nCols = opcoes.ocultarFimDeSemana ? 5 : 7;
  const colunasSemana = { gridTemplateColumns: `${opcoes.numeroSemana ? "1.75rem " : ""}repeat(${nCols}, minmax(0, 1fr))` };
  const prefixo = prefixoMes(mes);
  const recusou = (e: EventoCalendario) => usuarioId != null && !!e.convidados?.some((c) => c.usuarioId === usuarioId && c.resposta === "nao");
  const eventos = useMemo(
    () => eventosEntrada.filter((e) => !(opcoes.ocultarConcluidas && e.concluida) && !(opcoes.ocultarRecusados && usuarioId != null && e.convidados?.some((c) => c.usuarioId === usuarioId && c.resposta === "nao"))),
    [eventosEntrada, opcoes.ocultarConcluidas, opcoes.ocultarRecusados, usuarioId],
  );
  const dnd = useArrastoEventos(onMover);
  const rd = useRedimensionar(onRedimensionar);
  const cria = useCriarArrastando(onCriar);
  const agoraMin = useAgoraMin();
  const [slot, setSlot] = useState<{ dia: string; min: number } | null>(null);
  const corpoMes = useRef<HTMLDivElement>(null);
  const alturaMes = useAltura(corpoMes, `${vista}:${prefixo}`);

  // A vista e o painel lembrados neste aparelho (conveniência — sem armazenamento, só não lembra).
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao montar.
  useEffect(() => {
    const v = lerLocal(CHAVE_VISTA) as VistaCalendario | null;
    if (v && v in ROTULO_VISTA && v !== "mes") trocarVista(v);
    setPainel(lerLocal(CHAVE_PAINEL) === "1");
  }, []);

  const pegar = (e: EventoCalendario) => (onMover && (e.tipo === "periodo" || e.tipo === "evento") ? (ev: ReactPointerEvent<HTMLElement>) => dnd.iniciar(ev, e) : undefined);
  const abrir = (e: EventoCalendario) => {
    if (!dnd.foiArrasto() && !rd.foiRedimensionar()) onAbrir(e);
  };
  const concluir = (e: EventoCalendario) => (onConcluir && e.tipo === "periodo" && !e.pca ? () => onConcluir(e) : undefined);
  const feriadoDe = (d: string) => feriados?.get(d);
  const nomeFeriado = (d: string) => feriadoDe(d)?.map((f) => f.nome).join(", ");

  // O mês mudou por fora (o servidor carregou outro): o foco acompanha.
  // biome-ignore lint/correctness/useExhaustiveDependencies: acompanha só a troca de mês.
  useEffect(() => {
    if (vista !== "ano" && !foco.startsWith(prefixo)) setFoco(hoje.startsWith(prefixo) ? hoje : `${prefixo}-01`);
  }, [prefixo]);

  const irMes = (m: MesCalendario) => (onMes ? onMes(m) : setMesLocal(m));
  const irPara = (d: string) => {
    setFoco(d);
    if (vista === "mes" && !ehDesktopSeguro()) setDiaAberto({ dia: d, ancora: null });
    if (vista === "ano") trocarVista("dia", d);
    else if (!d.startsWith(prefixo)) irMes(mesDoDia(d));
  };
  const andar = (dir: -1 | 1) => {
    setDiaAberto(null);
    if (vista === "dia" || vista === "semana" || vista === "ndias") {
      const novo = somarDias(foco, (vista === "dia" ? 1 : vista === "ndias" ? N_DIAS : 7) * dir);
      setFoco(novo);
      if (!novo.startsWith(prefixo)) irMes(mesDoDia(novo));
    } else if (vista === "ano") {
      const m = { ano: mes.ano + dir, mes: mes.mes };
      setFoco(`${prefixoMes(m)}-01`);
      irMes(m);
    } else irMes(somarMes(mes.ano, mes.mes, dir));
  };
  const irHoje = () => {
    setFoco(hoje);
    setDiaAberto(null);
    if (!hoje.startsWith(prefixo)) irMes(mesDoDia(hoje));
  };
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  function trocarVista(v: VistaCalendario, dia?: string) {
    if ((v === "ano") !== (vistaRef.current === "ano")) onAno?.(v === "ano");
    vistaRef.current = v;
    setVista(v);
    setDiaAberto(null);
    gravarLocal(CHAVE_VISTA, v);
    if (dia) {
      setFoco(dia);
      if (!dia.startsWith(prefixo)) irMes(mesDoDia(dia));
    }
  }
  const alternarPainel = () => {
    setPainel((p) => {
      gravarLocal(CHAVE_PAINEL, p ? "0" : "1");
      return !p;
    });
  };
  const opcao = <K extends keyof OpcoesCalendario>(k: K, v: OpcoesCalendario[K]) => onOpcoes?.({ ...opcoes, [k]: v });

  // Atalhos (como no Google Agenda) — fora de campos, menus e banners.
  const atalhos = useRef({ trocarVista, irHoje, andar, criar: () => {}, buscar: () => {} });
  atalhos.current = {
    trocarVista,
    irHoje,
    andar,
    criar: () => onCriar?.({ data: foco, hora: null, horaFim: null, ancora: null }),
    buscar: () => raiz.current?.querySelector<HTMLInputElement>("input[type='search']")?.focus(),
  };
  useEffect(() => {
    const tecla = (ev: globalThis.KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return;
      const alvo = ev.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']") || document.querySelector("[role='dialog']")) return;
      const k = ev.key.toLowerCase();
      const v = VISTA_DA_TECLA[k];
      if (v) atalhos.current.trocarVista(v);
      else if (k === "t") atalhos.current.irHoje();
      else if (k === "c") atalhos.current.criar();
      else if (k === "g") setIrData("");
      else if (ev.key === "/") atalhos.current.buscar();
      else if (ev.key === "?") setAjuda(true);
      else if ((ev.key === "ArrowLeft" || k === "p") && !alvo?.closest("[data-dia-btn], fieldset")) atalhos.current.andar(-1);
      else if ((ev.key === "ArrowRight" || k === "n") && !alvo?.closest("[data-dia-btn], fieldset")) atalhos.current.andar(1);
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const diasNdias = useMemo(() => Array.from({ length: N_DIAS }, (_, i) => somarDias(foco, i)), [foco]);
  const diasVisiveis = vista === "dia" ? [foco] : vista === "ndias" ? diasNdias : vista === "semana" ? exibir(semana) : [];
  const mesCurto = (d: string) => MESES_CURTOS[Number(d.slice(5, 7)) - 1];
  const tituloIntervalo = (a: string, b: string) =>
    a.slice(0, 7) === b.slice(0, 7) ? `${NOMES_MES[Number(a.slice(5, 7)) - 1]} de ${a.slice(0, 4)}` : `${mesCurto(a)} – ${mesCurto(b)} de ${b.slice(0, 4)}`;
  const titulo =
    vista === "dia"
      ? `${nomeDia(foco)}, ${Number(foco.slice(8))} de ${NOMES_MES[Number(foco.slice(5, 7)) - 1].toLowerCase()} de ${foco.slice(0, 4)}`
      : vista === "semana" || vista === "ndias"
        ? tituloIntervalo(diasVisiveis[0] ?? foco, diasVisiveis.at(-1) ?? foco)
        : vista === "ano"
          ? String(mes.ano)
          : `${NOMES_MES[mes.mes - 1]} de ${mes.ano}`;
  const passo = vista === "dia" ? "Dia" : vista === "ano" ? "Ano" : vista === "semana" ? "Semana" : vista === "ndias" ? "Período" : "Mês";

  /** Setas entre os dias da grade do mês (os botões `[data-dia-btn]`). */
  const teclaDia = (ev: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const p = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (p == null) return;
    ev.preventDefault();
    ev.stopPropagation();
    document.querySelector<HTMLButtonElement>(`[data-dia-btn="${somarDias(d, p)}"]`)?.focus();
  };
  const alvoDrop = (d: string) => (dnd.arrasto?.dia === d ? "ring-2 ring-inset ring-accent bg-accent-soft" : "");
  /** O fundo do dia: feriado em âmbar suave; fim de semana sombreado. */
  const fundoDia = (d: string) => (feriadoDe(d) ? "bg-[color-mix(in_srgb,var(--warn)_8%,transparent)]" : fimDeSemana(d) ? "bg-surface-2/40" : "");
  const doDia = (d: string) => eventosDoDia(eventos, d);

  const numeros = [
    { rotulo: "Atrasadas", valor: contadores.atrasadas, cor: contadores.atrasadas ? "var(--danger)" : undefined },
    { rotulo: "Hoje", valor: contadores.hoje, cor: contadores.hoje ? "var(--warn)" : undefined },
    { rotulo: "Na semana", valor: contadores.naSemana },
    { rotulo: "Sem prazo", valor: contadores.semPrazo },
  ];

  /** A LISTA de um dia (programação, semana no celular, o "+N mais" do mês, o dia no celular). */
  const listaDoDia = (d: string) => {
    const lista = doDia(d);
    const rasc = rascunho?.data === d ? rascunho : null;
    return (
      <section data-dia={d} aria-label={`Eventos de ${dataBR(d)}`} className={`rounded-control transition-shadow ${alvoDrop(d)}`}>
        <div className="mb-1 flex items-center gap-2 px-1">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-semibold tabular-nums ${d === hoje ? "bg-accent text-white" : "text-text"}`}>
            {Number(d.slice(8))}
          </span>
          <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-2">
            {nomeDia(d)}, {mesCurto(d)}
            {nomeFeriado(d) && <span className="ml-1.5 font-semibold text-[var(--warn)]">· {nomeFeriado(d)}</span>}
          </h3>
          {onCriar && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Criar em ${dataBR(d)}`}
              icon={<IconPlus className="h-4 w-4" />}
              onClick={(ev) => onCriar({ data: d, hora: null, horaFim: null, ancora: retangulo(ev.currentTarget) })}
            />
          )}
        </div>
        <div className="space-y-1">
          {lista.map((e) => (
            <EventoChip key={e.chave} e={e} hoje={hoje} corQuadro={corQuadro} onAbrir={() => abrir(e)} onPegar={pegar(e)} onConcluir={concluir(e)} recusado={recusou(e)} />
          ))}
          {rasc && (
            <div className="h-9">
              <ChipRascunho titulo={rasc.titulo} horario={rasc.hora ? `${rasc.hora}${rasc.horaFim ? `–${rasc.horaFim}` : ""}` : undefined} />
            </div>
          )}
          {!lista.length && !rasc && <p className="px-1 py-2 text-[12.5px] text-muted">Nada neste dia.</p>}
        </div>
      </section>
    );
  };

  /** A GRADE DE HORAS de 1 (Dia), N (4 dias) ou 5–7 (Semana) dias. */
  const gradeHoras = (dias: string[]) => {
    const diaInteiro = eventos.filter((e) => e.diaInteiro || e.inicio !== e.fim);
    const faixas = faixasDaSemana(diaInteiro, dias);
    const rascTopo = rascunho && !rascunho.hora && dias.includes(rascunho.data) ? rascunho : null;
    const ocupadasTopo = faixas.reduce((m, f) => Math.max(m, f.linha + 1), 0);
    const linhasTopo = ocupadasTopo + (rascTopo ? 1 : 0);
    const colunas = `3.25rem repeat(${dias.length}, minmax(0, 1fr))`;
    const ini = opcoes.expedienteInicio ? minutosDe(opcoes.expedienteInicio) : null;
    const fim = opcoes.expedienteFim ? minutosDe(opcoes.expedienteFim) : null;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid shrink-0 border-b border-border" style={{ gridTemplateColumns: colunas }}>
          <span className="flex items-end justify-end pb-1 pr-1.5 text-[10px] text-faint" title="Horário de Brasília">
            GMT-03
          </span>
          {dias.map((d) => (
            <button key={d} type="button" onClick={() => trocarVista("dia", d)} className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 py-1" aria-label={`Ver o dia ${dataBR(d)}`}>
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${d === hoje ? "text-accent" : fimDeSemana(d) ? "text-faint" : "text-muted"}`}>{nomeDia(d)}</span>
              <span className={`grid h-8 min-w-8 place-items-center rounded-full px-1 text-[17px] tabular-nums ${d === hoje ? "bg-accent font-bold text-white" : "text-text"}`}>
                {Number(d.slice(8))}
              </span>
              {nomeFeriado(d) && (
                <span className="max-w-full truncate px-1 text-[10px] font-semibold text-[var(--warn)]" title={nomeFeriado(d)}>
                  {nomeFeriado(d)}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* Dia inteiro (e os de vários dias) — as faixas no topo. */}
        <div className="grid shrink-0 border-b border-border" style={{ gridTemplateColumns: colunas, gridTemplateRows: `repeat(${Math.max(1, linhasTopo)}, minmax(1.5rem, auto))` }}>
          <span className="flex items-center justify-end pr-1.5 text-[10px] text-faint" style={{ gridColumn: 1, gridRow: "1 / -1" }}>
            dia todo
          </span>
          {dias.map((d, i) => (
            <div
              key={`t${d}`}
              data-dia={d}
              onClick={(ev) => ev.target === ev.currentTarget && onCriar?.({ data: d, hora: null, horaFim: null, ancora: retangulo(ev.currentTarget) })}
              style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
              className={`border-l border-border ${onCriar ? "cursor-cell" : ""} ${fundoDia(d)} ${alvoDrop(d)}`}
            />
          ))}
          {faixas.map((f) => (
            <div
              key={f.item.chave}
              className={`z-[1] min-w-0 p-0.5 ${dnd.arrasto ? "pointer-events-none" : ""} ${dnd.arrasto?.chave === f.item.chave ? "opacity-40" : ""}`}
              style={{ gridColumn: `${f.coluna + 2} / span ${f.span}`, gridRow: f.linha + 1 }}
            >
              <EventoChip e={f.item} hoje={hoje} corQuadro={corQuadro} compacta onAbrir={() => abrir(f.item)} onPegar={pegar(f.item)} onConcluir={concluir(f.item)} recusado={recusou(f.item)} />
            </div>
          ))}
          {rascTopo && (
            <div className="pointer-events-none z-[1] p-0.5" style={{ gridColumn: dias.indexOf(rascTopo.data) + 2, gridRow: linhasTopo }}>
              <ChipRascunho titulo={rascTopo.titulo} />
            </div>
          )}
        </div>
        {/* As horas: rolam por dentro (abrem no início do expediente). */}
        <div
          data-rolador=""
          className="min-h-0 flex-1 overflow-y-auto"
          ref={(el) => {
            if (el && !el.dataset.rolou) {
              el.scrollTop = ((ini ?? 7 * 60) / 60) * HORA_PX - 12;
              el.dataset.rolou = "1";
            }
          }}
        >
          <div className="grid" style={{ gridTemplateColumns: colunas, height: 24 * HORA_PX }}>
            <div className="relative">
              {HORAS.slice(1).map((h) => (
                <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10.5px] tabular-nums text-faint" style={{ top: h * HORA_PX }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {dias.map((d) => {
              const layout = layoutDoDia(doDia(d).filter((e) => !e.diaInteiro && e.inicio === e.fim));
              const sel = cria.selecao?.dia === d ? cria.selecao : null;
              const rasc = rascunho?.data === d && rascunho.hora ? rascunho : null;
              const rIni = rasc?.hora ? minutosDe(rasc.hora) : 0;
              const rFim = rasc?.horaFim && horaValida(rasc.horaFim) ? minutosDe(rasc.horaFim) : rIni + 60;
              return (
                <fieldset
                  key={d}
                  data-dia={d}
                  data-grade=""
                  tabIndex={onCriar ? 0 : undefined}
                  aria-label={`Horários de ${nomeDia(d)}, ${dataBR(d)}${onCriar ? " — ↑/↓ escolhem a hora, Enter cria um evento" : ""}`}
                  onFocus={(ev) =>
                    onCriar && ev.target === ev.currentTarget && setSlot((x) => (x?.dia === d ? x : { dia: d, min: agoraMin != null && d === hoje ? Math.ceil(agoraMin / 30) * 30 : (ini ?? 9 * 60) }))
                  }
                  onBlur={(ev) => ev.target === ev.currentTarget && setSlot(null)}
                  onKeyDown={(ev) => {
                    if (!onCriar || ev.target !== ev.currentTarget || !slot) return;
                    const p = { ArrowUp: -30, ArrowDown: 30 }[ev.key];
                    if (p) {
                      ev.preventDefault();
                      const min = Math.max(0, Math.min(23 * 60 + 30, slot.min + p));
                      setSlot({ dia: d, min });
                      const rolador = ev.currentTarget.closest<HTMLElement>("[data-rolador]");
                      if (rolador) {
                        const y = (min / 60) * HORA_PX;
                        if (y < rolador.scrollTop || y > rolador.scrollTop + rolador.clientHeight - HORA_PX) rolador.scrollTop = y - rolador.clientHeight / 2;
                      }
                    } else if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      const r = ev.currentTarget.getBoundingClientRect();
                      onCriar({
                        data: d,
                        hora: horaDeMinutos(slot.min),
                        horaFim: horaDeMinutos(Math.min(slot.min + 60, 24 * 60 - 1)),
                        ancora: { x: r.left, y: r.top + (slot.min / 1440) * r.height, w: r.width, h: HORA_PX },
                      });
                    }
                  }}
                  onPointerDown={(ev) => cria.iniciar(ev, d)}
                  onClick={(ev) => cria.tocar(ev, d)}
                  className={`relative min-w-0 border-l border-border focus-visible:outline-none ${fundoDia(d)} ${onCriar ? "cursor-cell" : ""} ${dnd.arrasto?.dia === d ? "bg-accent-soft" : ""}`}
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HORA_PX - 1}px, var(--border) ${HORA_PX - 1}px, var(--border) ${HORA_PX}px)` }}
                >
                  {ini != null && fim != null && (
                    <>
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bg-surface-2/50" style={{ height: (ini / 60) * HORA_PX }} />
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 bg-surface-2/50" style={{ top: (fim / 60) * HORA_PX }} />
                    </>
                  )}
                  {slot?.dia === d && (
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[2] rounded-[4px] ring-2 ring-accent" style={{ top: (slot.min / 60) * HORA_PX, height: HORA_PX / 2 }}>
                      <span className="absolute left-1 top-0.5 rounded bg-accent px-1 text-[10.5px] font-semibold text-white">{horaDeMinutos(slot.min)} — Enter cria</span>
                    </div>
                  )}
                  {layout.map((l) => {
                    const fimPrevia = rd.previa?.chave === l.evento.chave ? rd.previa.fim : null;
                    return (
                      <div
                        key={l.evento.chave}
                        className={`absolute z-[1] p-px ${dnd.arrasto || cria.selecao ? "pointer-events-none" : ""} ${dnd.arrasto?.chave === l.evento.chave ? "opacity-40" : ""}`}
                        style={{
                          top: (l.topo / 60) * HORA_PX,
                          height: (((fimPrevia ?? l.topo + l.altura) - l.topo) / 60) * HORA_PX,
                          left: `${(l.coluna / l.colunas) * 100}%`,
                          width: `${100 / l.colunas}%`,
                        }}
                      >
                        <EventoCaixa
                          e={l.evento}
                          hoje={hoje}
                          corQuadro={corQuadro}
                          onAbrir={() => abrir(l.evento)}
                          onPegar={pegar(l.evento)}
                          fimPrevia={fimPrevia}
                          recusado={recusou(l.evento)}
                          onRedimensionar={onRedimensionar && l.evento.tipo === "evento" ? (ev) => rd.iniciar(ev, l.evento) : undefined}
                        />
                      </div>
                    );
                  })}
                  {(sel || rasc) && (
                    <div
                      className="pointer-events-none absolute inset-x-0.5 z-[3]"
                      style={
                        sel
                          ? { top: (sel.ini / 60) * HORA_PX, height: ((sel.fim - sel.ini) / 60) * HORA_PX }
                          : { top: (rIni / 60) * HORA_PX, height: (Math.max(15, rFim - rIni) / 60) * HORA_PX }
                      }
                    >
                      <ChipRascunho titulo={sel ? "" : (rasc?.titulo ?? "")} horario={sel ? `${horaDeMinutos(sel.ini)}–${horaDeMinutos(sel.fim)}` : `${horaDeMinutos(rIni)}–${horaDeMinutos(rFim)}`} />
                    </div>
                  )}
                  {d === hoje && agoraMin != null && (
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[2] h-0.5 bg-[var(--danger)]" style={{ top: (agoraMin / 60) * HORA_PX }}>
                      <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
                    </div>
                  )}
                  {dnd.arrasto?.dia === d && dnd.arrasto.hora && (
                    <span className="pointer-events-none absolute right-1 z-[3] rounded bg-accent px-1 text-[10.5px] font-semibold text-white" style={{ top: (minutosDe(dnd.arrasto.hora) / 60) * HORA_PX }}>
                      {dnd.arrasto.hora}
                    </span>
                  )}
                </fieldset>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  /** A grade do MÊS (desktop) — as semanas dividem a altura; quantas faixas cabem por dia sai da altura real. */
  const gradeDoMes = () => {
    const linhaH = alturaMes > 0 ? alturaMes / grade.length : 110;
    const porDia = Math.max(1, Math.floor((linhaH - 26 - 20) / 22));
    const off = opcoes.numeroSemana ? 2 : 1;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid shrink-0 border-b border-border" style={colunasSemana}>
          {opcoes.numeroSemana && <span />}
          {exibir(grade[0]).map((d) => (
            <div key={d} className={`py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide ${fimDeSemana(d) ? "text-faint" : "text-muted"}`}>
              {nomeDia(d)}
            </div>
          ))}
        </div>
        <div ref={corpoMes} className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${grade.length}, minmax(0, 1fr))` }}>
          {grade.map((semCompleta) => {
            const sem = exibir(semCompleta);
            const faixas = faixasDaSemana(eventos, sem);
            const rasc = rascunho && sem.includes(rascunho.data) ? rascunho : null;
            const colRasc = rasc ? sem.indexOf(rasc.data) : -1;
            // O "(Sem título)" entra na 1ª linha livre do dia dele (ou na última que cabe).
            const linhaRasc = rasc ? Math.min(porDia - 1, faixas.filter((f) => f.coluna <= colRasc && f.coluna + f.span > colRasc).reduce((m, f) => Math.max(m, f.linha + 1), 0)) : -1;
            const escondidas = sem.map((_, i) => faixas.filter((f) => f.linha >= porDia && f.coluna <= i && f.coluna + f.span > i).length);
            return (
              <div key={sem[0]} className="grid min-h-0 border-b border-border last:border-b-0" style={{ ...colunasSemana, gridTemplateRows: `26px repeat(${porDia}, 22px) minmax(0, 1fr)` }}>
                {opcoes.numeroSemana && (
                  <span className="flex items-start justify-center pt-1.5 text-[10px] font-semibold tabular-nums text-faint" style={{ gridColumn: 1, gridRow: "1 / -1" }} title="Semana do ano">
                    {semanaIso(sem[0])}
                  </span>
                )}
                {sem.map((d, i) => (
                  <div
                    key={`f${d}`}
                    data-dia={d}
                    onClick={(ev) => ev.target === ev.currentTarget && onCriar?.({ data: d, hora: null, horaFim: null, ancora: retangulo(ev.currentTarget) })}
                    style={{ gridColumn: i + off, gridRow: "1 / -1" }}
                    className={`border-l border-border transition-colors first:border-l-0 ${onCriar ? "cursor-cell" : ""} ${!d.startsWith(prefixo) ? "bg-surface-2/60" : fundoDia(d)} ${alvoDrop(d)}`}
                  />
                ))}
                {sem.map((d, i) => (
                  <div key={`n${d}`} style={{ gridColumn: i + off, gridRow: 1 }} className="pointer-events-none z-[1] flex min-w-0 items-center justify-between gap-1 px-1.5">
                    {nomeFeriado(d) ? (
                      <span className="min-w-0 truncate text-[10.5px] font-semibold text-[var(--warn)]" title={nomeFeriado(d)}>
                        {nomeFeriado(d)}
                      </span>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      data-dia-btn={d}
                      onClick={() => trocarVista("dia", d)}
                      onKeyDown={(ev) => teclaDia(ev, d)}
                      aria-label={`${nomeDia(d)}, ${dataBR(d)}${d === hoje ? " (hoje)" : ""} — ${num(doDia(d).length)} evento(s); abrir o dia`}
                      className={`pointer-events-auto grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1 text-[12px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        d === hoje ? "bg-accent font-bold text-white" : d.startsWith(prefixo) ? "text-text-2 hover:bg-surface-2" : "text-faint hover:bg-surface-2"
                      }`}
                    >
                      {Number(d.slice(8)) === 1 ? `1 ${mesCurto(d)}` : Number(d.slice(8))}
                    </button>
                  </div>
                ))}
                {faixas
                  .filter((f) => f.linha < porDia && !(rasc && f.linha === linhaRasc && f.coluna <= colRasc && f.coluna + f.span > colRasc))
                  .map((f) => (
                    <div
                      key={f.item.chave}
                      className={`z-[1] min-w-0 px-0.5 py-px ${f.antes ? "pl-0" : ""} ${f.depois ? "pr-0" : ""} ${dnd.arrasto ? "pointer-events-none" : ""} ${dnd.arrasto?.chave === f.item.chave ? "opacity-40" : ""}`}
                      style={{ gridColumn: `${f.coluna + off} / span ${f.span}`, gridRow: f.linha + 2 }}
                    >
                      <EventoChip e={f.item} hoje={hoje} corQuadro={corQuadro} compacta onAbrir={() => abrir(f.item)} onPegar={pegar(f.item)} onConcluir={concluir(f.item)} recusado={recusou(f.item)} />
                    </div>
                  ))}
                {rasc && linhaRasc >= 0 && (
                  <div className="pointer-events-none z-[2] min-w-0 px-0.5 py-px" style={{ gridColumn: colRasc + off, gridRow: linhaRasc + 2 }}>
                    <ChipRascunho titulo={rasc.titulo} />
                  </div>
                )}
                {sem.map((d, i) =>
                  escondidas[i] > 0 ? (
                    <div key={`m${d}`} style={{ gridColumn: i + off, gridRow: porDia + 2 }} className="z-[1] min-w-0 px-1">
                      <button
                        type="button"
                        onClick={(ev) => setDiaAberto({ dia: d, ancora: retangulo(ev.currentTarget) })}
                        className="h-5 rounded-[6px] px-1.5 text-left text-[11px] font-semibold text-muted hover:bg-surface-2 hover:text-text"
                      >
                        +{escondidas[i]} mais
                      </button>
                    </div>
                  ) : null,
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /** Celular/tablet: a mini-grade (pontos) e, embaixo, a lista do dia tocado — a lista rola por dentro. */
  const mesCelular = () => {
    const dia = diaAberto?.dia ?? foco;
    const cols = { gridTemplateColumns: `repeat(${nCols}, minmax(0, 1fr))` };
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border">
          <div className="grid" style={cols}>
            {exibir(grade[0]).map((d) => (
              <div key={d} className="py-1 text-center text-[10.5px] font-semibold text-muted">
                {nomeDia(d).slice(0, 1)}
              </div>
            ))}
          </div>
          {grade.map((sem) => (
            <div key={sem[0]} className="grid" style={cols}>
              {exibir(sem).map((d) => {
                const lista = doDia(d);
                const sel = dia === d;
                return (
                  <button
                    key={d}
                    type="button"
                    data-dia={d}
                    onClick={() => {
                      setDiaAberto({ dia: d, ancora: null });
                      setFoco(d);
                    }}
                    aria-pressed={sel}
                    aria-label={`${dataBR(d)}${nomeFeriado(d) ? ` (${nomeFeriado(d)})` : ""} — ${num(lista.length)} evento(s)`}
                    className={`flex h-11 flex-col items-center justify-center gap-0.5 transition-colors ${!d.startsWith(prefixo) ? "text-faint" : nomeFeriado(d) ? "text-[var(--warn)]" : "text-text-2"} ${alvoDrop(d)}`}
                  >
                    <span className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-[12.5px] tabular-nums ${d === hoje ? "bg-accent font-bold text-white" : sel ? "bg-accent-soft font-semibold text-accent" : ""}`}>
                      {Number(d.slice(8))}
                    </span>
                    <span aria-hidden className="flex h-1.5 gap-0.5">
                      {lista.slice(0, 3).map((e) => (
                        <span key={e.chave} className="h-1.5 w-1.5 rounded-full" style={{ background: corDoEvento(e, hoje, corQuadro).faixa }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div data-rolador="" className="min-h-0 flex-1 overflow-y-auto p-2">
          {listaDoDia(dia)}
        </div>
      </div>
    );
  };

  /** A vista ANO: os 12 meses (pontos nos dias com evento); tocar num dia abre o Dia, o nome do mês abre o Mês. */
  const vistaAno = () => {
    const comEvento = new Set<string>();
    for (const e of eventos) for (let d = e.inicio, i = 0; d <= e.fim && i < 400; d = somarDias(d, 1), i++) comEvento.add(d);
    return (
      <div data-rolador="" className="grid h-full min-h-0 grid-cols-1 content-start gap-x-8 gap-y-5 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const g = gradeMes(mes.ano, m, inicioSemana);
          const pre = `${mes.ano}-${String(m).padStart(2, "0")}`;
          return (
            <section key={m} aria-label={`${NOMES_MES[m - 1]} de ${mes.ano}`}>
              <button type="button" onClick={() => trocarVista("mes", `${pre}-01`)} className="mb-1 min-h-9 rounded-control px-1 text-[13px] font-semibold text-text hover:text-accent">
                {NOMES_MES[m - 1]}
              </button>
              <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-faint">
                {g[0].map((d) => (
                  <span key={d}>{nomeDia(d).slice(0, 1)}</span>
                ))}
              </div>
              {g.map((sem) => (
                <div key={sem[0]} className="grid grid-cols-7">
                  {sem.map((d) =>
                    d.startsWith(pre) ? (
                      <button
                        key={d}
                        type="button"
                        onClick={() => trocarVista("dia", d)}
                        aria-label={`${dataBR(d)}${comEvento.has(d) ? " — com eventos" : ""}`}
                        title={nomeFeriado(d)}
                        className={`relative mx-auto grid h-9 w-full max-w-9 place-items-center rounded-full text-[12px] tabular-nums lg:h-7 lg:max-w-7 ${
                          d === hoje ? "bg-accent font-bold text-white" : feriadoDe(d) ? "text-[var(--warn)] hover:bg-surface-2" : "text-text-2 hover:bg-surface-2"
                        }`}
                      >
                        {Number(d.slice(8))}
                        {comEvento.has(d) && d !== hoje && <span aria-hidden className="absolute bottom-0.5 h-1 w-1 rounded-full bg-accent" />}
                      </button>
                    ) : (
                      <span key={d} />
                    ),
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    );
  };

  /** A PROGRAMAÇÃO: os dias com eventos (e os feriados) do mês, em lista — rola até hoje. */
  const vistaAgenda = () => {
    const dias = grade.flat().filter((d) => d.startsWith(prefixo) && (doDia(d).length > 0 || !!nomeFeriado(d)));
    return (
      <div
        data-rolador=""
        className="h-full min-h-0 space-y-4 overflow-y-auto p-3"
        ref={(el) => {
          if (el && el.dataset.mes !== prefixo) {
            el.dataset.mes = prefixo;
            const alvo = el.querySelector<HTMLElement>(`[data-dia="${dias.find((d) => d >= hoje) ?? ""}"]`);
            if (alvo) el.scrollTop = alvo.offsetTop - el.offsetTop - 8;
          }
        }}
      >
        {dias.length ? dias.map((d) => <div key={d}>{listaDoDia(d)}</div>) : <p className="py-10 text-center text-sm text-muted">Nenhum evento neste mês.</p>}
      </div>
    );
  };

  const corpo =
    vista === "mes" ? (
      <>
        <div className="hidden h-full lg:block">{gradeDoMes()}</div>
        <div className="h-full lg:hidden">{mesCelular()}</div>
      </>
    ) : vista === "semana" ? (
      <>
        <div className="hidden h-full lg:block">{gradeHoras(exibir(semana))}</div>
        <div data-rolador="" className="h-full space-y-4 overflow-y-auto p-2 lg:hidden">
          {exibir(semana).map((d) => (
            <div key={d}>{listaDoDia(d)}</div>
          ))}
        </div>
      </>
    ) : vista === "ndias" ? (
      gradeHoras(diasNdias)
    ) : vista === "dia" ? (
      gradeHoras([foco])
    ) : vista === "ano" ? (
      vistaAno()
    ) : (
      vistaAgenda()
    );

  const menuVista = (
    <Dropdown
      align="end"
      width={264}
      ariaLabel={`Vista do calendário: ${ROTULO_VISTA[vista]}`}
      triggerClassName="h-11 gap-1.5 rounded-control border border-border-2 bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-2 lg:h-[var(--h-control-sm)]"
      trigger={
        <>
          {ROTULO_VISTA[vista]}
          <IconChevronDown className="h-4 w-4 text-muted" />
        </>
      }
    >
      {(fechar) => (
        <div>
          {(Object.keys(ROTULO_VISTA) as VistaCalendario[]).map((v) => (
            <ItemMenu
              key={v}
              rotulo={ROTULO_VISTA[v]}
              tecla={TECLA_VISTA[v]}
              ativo={v === vista}
              onClick={() => {
                trocarVista(v);
                fechar();
              }}
            />
          ))}
          {onOpcoes && (
            <>
              <hr className="my-1.5 border-border" />
              <ItemMarcar rotulo="Mostrar fins de semana" marcado={!opcoes.ocultarFimDeSemana} onClick={() => opcao("ocultarFimDeSemana", !opcoes.ocultarFimDeSemana)} />
              <ItemMarcar rotulo="Mostrar tarefas concluídas" marcado={!opcoes.ocultarConcluidas} onClick={() => opcao("ocultarConcluidas", !opcoes.ocultarConcluidas)} />
              {usuarioId != null && <ItemMarcar rotulo="Mostrar eventos recusados" marcado={!opcoes.ocultarRecusados} onClick={() => opcao("ocultarRecusados", !opcoes.ocultarRecusados)} />}
              <ItemMarcar rotulo="Mostrar número da semana" marcado={opcoes.numeroSemana} onClick={() => opcao("numeroSemana", !opcoes.numeroSemana)} />
            </>
          )}
          <hr className="my-1.5 border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              fechar();
              window.setTimeout(() => window.print(), 50);
            }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] text-text hover:bg-surface-2 lg:min-h-9"
          >
            <IconImprimir className="h-4 w-4 text-muted" />
            Imprimir
          </button>
        </div>
      )}
    </Dropdown>
  );

  const barra = (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 print:hidden">
      {lateral && <Button variant="icon" size="sm" className="lg:hidden" aria-label={rotuloLateral} icon={<IconMenu className="h-4 w-4" />} onClick={() => setLateralAberta(true)} />}
      <Button variant="secondary" size="sm" onClick={irHoje} title="Hoje (T)">
        Hoje
      </Button>
      <div className="flex items-center">
        <Button variant="ghost" size="sm" aria-label={`${passo} anterior`} icon={<IconChevronLeft className="h-4 w-4" />} onClick={() => andar(-1)} />
        <Button variant="ghost" size="sm" aria-label={`${passo} seguinte`} icon={<IconChevronRight className="h-4 w-4" />} onClick={() => andar(1)} />
      </div>
      <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-text lg:text-[19px]" aria-live="polite">
        {titulo}
      </h2>
      <div className="flex items-center gap-1">
        {menuVista}
        <Button variant="ghost" size="sm" aria-label="Atalhos do teclado" title="Atalhos (?)" className="max-lg:hidden" icon={<IconTeclado className="h-4 w-4" />} onClick={() => setAjuda(true)} />
        <Button variant="ghost" size="sm" aria-label="Configurações do calendário" title="Configurações" icon={<IconSettings className="h-4 w-4" />} onClick={() => setConfig(true)} />
        {semPrazo && (
          <Button
            variant={painel ? "secondary" : "ghost"}
            size="sm"
            aria-label="Tarefas sem prazo"
            aria-pressed={painel}
            title="Tarefas sem prazo"
            icon={<IconChecklist className="h-4 w-4" />}
            onClick={alternarPainel}
          />
        )}
        {onCriar && (
          <Button
            variant="accent"
            size="sm"
            className="max-sm:w-11 max-sm:px-0"
            aria-label="Criar"
            title="Criar (C)"
            icon={<IconPlus className="h-4 w-4" />}
            onClick={(ev) => onCriar({ data: foco, hora: null, horaFim: null, ancora: retangulo(ev.currentTarget) })}
          >
            <span className="max-sm:hidden">Criar</span>
          </Button>
        )}
      </div>
    </div>
  );

  const nav: NavCalendario = { foco, irPara, mes, vista, destaque: diasVisiveis };
  const comNumeros = (conteudo: ReactNode) => (
    <div className="space-y-[var(--gap-block)]">
      <dl className="grid grid-cols-4 gap-1 rounded-card border border-border bg-surface px-1 py-2 text-center">
        {numeros.map((n) => (
          <div key={n.rotulo} className="flex min-w-0 flex-col-reverse">
            <dt className="truncate text-[10.5px] text-muted">{n.rotulo}</dt>
            <dd className="text-[16px] font-semibold tabular-nums text-text" style={n.cor ? { color: n.cor } : undefined}>
              {num(n.valor)}
            </dd>
          </div>
        ))}
      </dl>
      {conteudo}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-1 text-[11px] text-muted" aria-label="Legenda">
        {LEGENDA.map((e) => (
          <li key={e} className="inline-flex items-center gap-1">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COR_ESTADO_PRAZO[e] }} />
            {ROTULO_ESTADO_PRAZO[e]}
          </li>
        ))}
        {legenda}
      </ul>
    </div>
  );

  const casaSemPrazo = predicadoBusca(buscaSemPrazo);
  const listaSemPrazo = (semPrazo ?? []).filter((t) => !casaSemPrazo || casaSemPrazo([t.titulo, rotuloTicket(t.ticket), nomeQuadro?.(t.quadroId) ?? ""]));
  const pseudo = (t: TarefaSemPrazo): EventoCalendario => ({
    chave: `s${t.id}`,
    tipo: "periodo",
    tarefaId: t.id,
    quadroId: t.quadroId,
    ticket: t.ticket,
    titulo: t.titulo,
    tarefaTitulo: t.titulo,
    tarefaPrazo: null,
    inicio: "",
    fim: "",
    diaInteiro: true,
    horaInicio: null,
    horaFim: null,
    local: null,
    descricao: null,
    cor: null,
    concluida: false,
    recorrente: false,
    eventoId: null,
    lembreteMin: null,
    prevista: false,
    pca: null,
  });
  const conteudoPainel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border p-2.5">
        <p className="text-[13px] font-semibold text-text">
          Tarefas sem prazo <span className="font-normal tabular-nums text-muted">({num(semPrazo?.length ?? 0)})</span>
        </p>
        <p className="text-[11.5px] text-muted">Arraste até um dia para definir o prazo.</p>
        {(semPrazo?.length ?? 0) > 6 && <SearchField compacto value={buscaSemPrazo} onChange={(e) => setBuscaSemPrazo(e.target.value)} placeholder="Buscar" aria-label="Buscar tarefa sem prazo" />}
      </div>
      <ul className="relative min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {listaSemPrazo.map((t) => (
          <li key={t.id} className="flex items-stretch rounded-[6px] border border-border bg-surface" style={{ boxShadow: `inset 3px 0 0 ${corQuadro?.(t.quadroId) ?? "var(--accent)"}` }}>
            <button
              type="button"
              onPointerDown={(ev) => ev.pointerType !== "touch" && dnd.iniciar(ev, pseudo(t))}
              onClick={() => !dnd.foiArrasto() && onAbrirTarefa?.(t.id)}
              className={`min-h-11 min-w-0 flex-1 px-2.5 py-1.5 text-left lg:min-h-9 ${onMover ? "cursor-grab active:cursor-grabbing" : ""}`}
              title={t.titulo}
            >
              <span className="block truncate text-[12.5px] text-text">{t.titulo}</span>
              <span className="block truncate text-[10.5px] text-faint">
                {rotuloTicket(t.ticket)}
                {nomeQuadro?.(t.quadroId) ? ` · ${nomeQuadro(t.quadroId)}` : ""}
              </span>
            </button>
            {onMover && (
              <span
                role="presentation"
                onPointerDown={(ev) => ev.pointerType === "touch" && dnd.iniciar(ev, pseudo(t))}
                className="hidden w-11 shrink-0 touch-none items-center justify-center text-faint any-pointer-coarse:flex"
              >
                <IconGrip className="h-4 w-4" />
              </span>
            )}
          </li>
        ))}
        {!listaSemPrazo.length && <li className="px-1 py-6 text-center text-[12.5px] text-muted">{semPrazo?.length ? "Nada encontrado." : "Todas as tarefas abertas têm prazo."}</li>}
      </ul>
    </div>
  );

  return (
    <div ref={raiz} className="flex min-h-0 flex-col gap-[var(--gap-block)] print:!h-auto" style={altura ? { height: altura } : undefined}>
      {barra}
      <div className="flex min-h-0 flex-1 gap-[var(--gap-block)]">
        {lateral && (
          <aside className="relative hidden w-[16rem] shrink-0 overflow-y-auto overscroll-contain lg:block print:hidden" aria-label={rotuloLateral}>
            {comNumeros(lateral(nav))}
          </aside>
        )}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-card border border-border bg-surface shadow-ring print:overflow-visible">{corpo}</div>
        {semPrazo && painel && (
          <aside className="relative hidden w-[16rem] shrink-0 overflow-hidden rounded-card border border-border bg-surface lg:block print:hidden" aria-label="Tarefas sem prazo">
            {conteudoPainel}
          </aside>
        )}
      </div>

      {/* O "+N mais" do mês: o dia inteiro, ao lado. */}
      <JanelaFlutuante
        aberta={!!diaAberto?.ancora && vista === "mes"}
        ancora={diaAberto?.ancora ?? null}
        titulo={diaAberto ? `Eventos de ${dataBR(diaAberto.dia)}` : ""}
        onFechar={() => setDiaAberto(null)}
        largura={320}
      >
        {diaAberto && listaDoDia(diaAberto.dia)}
      </JanelaFlutuante>
      {lateral && (
        <Modal open={lateralAberta} onClose={() => setLateralAberta(false)} titulo={rotuloLateral} size="md">
          {comNumeros(
            lateral({
              ...nav,
              irPara: (d) => {
                irPara(d);
                setLateralAberta(false);
              },
            }),
          )}
        </Modal>
      )}
      {semPrazo && (
        <Modal open={painel && !ehDesktopSeguro()} onClose={alternarPainel} titulo="Tarefas sem prazo" size="md">
          <div className="h-[60dvh]">{conteudoPainel}</div>
        </Modal>
      )}
      <Modal open={config} onClose={() => setConfig(false)} titulo="Configurações do calendário" size="md">
        <div className="space-y-5">
          {onOpcoes && (
            <section className="space-y-1" aria-label="Exibição">
              <p className="pb-1 text-[12.5px] font-semibold text-text-2">Exibição</p>
              <Switch checked={opcoes.inicioSegunda} onChange={(v) => opcao("inicioSegunda", v)} label="Semana começa na segunda" />
              <Switch checked={!opcoes.ocultarFimDeSemana} onChange={(v) => opcao("ocultarFimDeSemana", !v)} label="Mostrar fins de semana" />
              <Switch checked={!opcoes.ocultarConcluidas} onChange={(v) => opcao("ocultarConcluidas", !v)} label="Mostrar tarefas concluídas" />
              {usuarioId != null && <Switch checked={!opcoes.ocultarRecusados} onChange={(v) => opcao("ocultarRecusados", !v)} label="Mostrar eventos recusados" />}
              <Switch checked={opcoes.numeroSemana} onChange={(v) => opcao("numeroSemana", v)} label="Mostrar número da semana" />
            </section>
          )}
          {onOpcoes && (
            <SelectField
              label="Lembrete padrão dos eventos novos"
              value={opcoes.lembretePadrao == null ? "" : String(opcoes.lembretePadrao)}
              onChange={(e) => opcao("lembretePadrao", e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">Sem lembrete</option>
              {OPCOES_LEMBRETE.map((o) => (
                <option key={o.min} value={String(o.min)}>
                  {o.rotulo}
                </option>
              ))}
            </SelectField>
          )}
          {onOpcoes && (
            <section className="space-y-2" aria-label="Horário de expediente">
              <Switch
                checked={opcoes.expedienteInicio != null}
                onChange={(v) => onOpcoes({ ...opcoes, expedienteInicio: v ? "08:00" : null, expedienteFim: v ? "18:00" : null })}
                label="Horário de expediente (fora dele fica sombreado)"
              />
              {opcoes.expedienteInicio != null && (
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Início"
                    type="time"
                    value={opcoes.expedienteInicio ?? ""}
                    onChange={(e) => horaValida(e.target.value) && (opcoes.expedienteFim ?? "") > e.target.value && opcao("expedienteInicio", e.target.value)}
                  />
                  <TextField
                    label="Fim"
                    type="time"
                    value={opcoes.expedienteFim ?? ""}
                    onChange={(e) => horaValida(e.target.value) && e.target.value > (opcoes.expedienteInicio ?? "") && opcao("expedienteFim", e.target.value)}
                  />
                </div>
              )}
            </section>
          )}
          {configuracoes}
        </div>
      </Modal>
      <Modal open={ajuda} onClose={() => setAjuda(false)} titulo="Atalhos do teclado" size="md">
        <dl className="space-y-2.5 text-[13px]">
          {ATALHOS.map(([acao, teclas]) => (
            <div key={acao} className="flex items-center justify-between gap-3">
              <dt className="text-text-2">{acao}</dt>
              <dd>
                <kbd className="rounded-[6px] border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-text">{teclas}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </Modal>
      <Modal
        open={irData != null}
        onClose={() => setIrData(null)}
        titulo="Ir para uma data"
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIrData(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!/^\d{4}-\d{2}-\d{2}$/.test(irData ?? "")}
              onClick={() => {
                if (irData) trocarVista(vista === "ano" || vista === "agenda" ? "dia" : vista, irData);
                setIrData(null);
              }}
            >
              Ir
            </Button>
          </div>
        }
      >
        <TextField label="Data" type="date" value={irData ?? ""} onChange={(e) => setIrData(e.target.value)} />
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
          <IconCalendar className="h-3.5 w-3.5" />
          Atalho: G
        </p>
      </Modal>
      {dnd.arrasto && <ChipPreso rotulo={`${dnd.arrasto.rotulo}${dnd.arrasto.hora ? ` · ${dnd.arrasto.hora}` : ""}`} x={dnd.arrasto.x} y={dnd.arrasto.y} fantasma={dnd.fantasma} />}
    </div>
  );
}
