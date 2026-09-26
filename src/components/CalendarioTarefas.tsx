"use client";

import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { dataBR, num } from "@/lib/format";
import {
  COR_ESTADO_PRAZO,
  DIAS_SEMANA_CURTOS,
  type EstadoPrazo,
  type EventoCalendario,
  estadoPrazo,
  eventosDoDia,
  faixasDaSemana,
  fimDeSemana,
  gradeMes,
  horaDeMinutos,
  layoutDoDia,
  NOMES_MES,
  ROTULO_ESTADO_PRAZO,
  rotuloTicket,
  semanaDe,
  somarDias,
  somarMes,
} from "@/lib/tarefas-core";
import { ChipPreso } from "./BlocosTarefa";
import { Button } from "./Button";
import { IconChevronLeft, IconChevronRight, IconClose, IconFilter, IconGrip, IconPlus, IconRepetir } from "./icons";
import { Modal } from "./Modal";
import { segurar } from "./segurar";
import { Segmented } from "./Segmented";

type Vista = "dia" | "semana" | "mes" | "agenda";
export type MesCalendario = { ano: number; mes: number };
/** O que o calendário oferece à barra lateral: o dia em foco, "ir para" e o mês à vista. */
export type NavCalendario = { foco: string; irPara: (dia: string) => void; mes: MesCalendario };

/** Quantas faixas cabem numa semana da grade do mês antes do "+N". */
const POR_DIA = 3;
/** Altura de UMA hora na grade (px). */
const HORA_PX = 48;
const LIMIAR = 6;
const BORDA = 48;
const VEL = 12;
const LEGENDA: EstadoPrazo[] = ["ok", "vence", "hoje", "atrasada", "concluida"];
const nomeDia = (d: string) => DIAS_SEMANA_CURTOS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const mesDoDia = (d: string): MesCalendario => ({ ano: Number(d.slice(0, 4)), mes: Number(d.slice(5, 7)) });
const prefixoMes = (m: MesCalendario) => `${m.ano}-${String(m.mes).padStart(2, "0")}`;
const HORAS = Array.from({ length: 24 }, (_, h) => h);

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
 * o ponteiro — numa coluna da GRADE DE HORAS (`data-grade`) também a HORA (a posição, de 15 em 15 min). O destino fica
 * destacado; a página rola sozinha perto das bordas. O clique que vem depois de um arrasto não abre o evento.
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
    const rotulo = e.titulo;
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let dia: string | null = null;
    let hora: string | null = null;
    let vel = 0;
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
      setArrasto({ chave: e.chave, rotulo, x: ultimo.x, y: ultimo.y, dia, hora });
    };
    const rolar = () => {
      if (vel) {
        window.scrollBy(0, vel);
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
      vel = ev.clientY < BORDA ? -VEL : ev.clientY > window.innerHeight - BORDA ? VEL : 0;
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

/** A cor de um evento: a própria, senão a do QUADRO; o período da tarefa sem quadro com cor usa o SEMÁFORO do prazo. */
function corDoEvento(e: EventoCalendario, hoje: string, corQuadro?: (quadroId: number) => string | undefined) {
  const semaforo = COR_ESTADO_PRAZO[estadoPrazo(e.fim, hoje, e.concluida)];
  return { faixa: e.cor ?? corQuadro?.(e.quadroId) ?? (e.tipo === "periodo" ? semaforo : "var(--accent)"), semaforo };
}

/** "09:30–10:00 · " / "" — o horário no rótulo do evento. */
const horarioDe = (e: EventoCalendario) => (e.diaInteiro || !e.horaInicio ? "" : `${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ""}`);

/**
 * UM EVENTO no calendário: horário (se tiver) + título + #ticket, a faixa na cor do evento/quadro (o período da tarefa leva
 * o ponto do SEMÁFORO do prazo; a ocorrência da recorrência, tracejada). Tocar abre o banner; arrastar reagenda (no
 * toque, pela alça — só nas listas; a ocorrência da recorrência não se arrasta).
 */
function EventoChip({
  e,
  hoje,
  corQuadro,
  compacta = false,
  onAbrir,
  onPegar,
}: {
  e: EventoCalendario;
  hoje: string;
  corQuadro?: (quadroId: number) => string | undefined;
  compacta?: boolean;
  onAbrir: () => void;
  onPegar?: (ev: ReactPointerEvent<HTMLElement>) => void;
}) {
  const { faixa, semaforo } = corDoEvento(e, hoje, corQuadro);
  const hora = horarioDe(e);
  const titulo = `${e.titulo}${hora ? ` — ${hora}` : ""} · ${rotuloTicket(e.ticket)}${e.tipo === "periodo" ? ` — ${ROTULO_ESTADO_PRAZO[estadoPrazo(e.fim, hoje, e.concluida)]}` : ""}${e.tipo === "recorrencia" ? " (próxima ocorrência)" : ""}`;
  return (
    <div className="relative flex min-w-0 items-stretch">
      <button
        type="button"
        onClick={onAbrir}
        onPointerDown={(ev) => ev.pointerType !== "touch" && onPegar?.(ev)}
        title={titulo}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-[6px] px-1.5 text-left leading-tight text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          compacta ? "h-full text-[11px]" : "min-h-11 text-[12px] lg:min-h-8"
        } ${onPegar ? "cursor-grab active:cursor-grabbing" : ""} ${e.concluida ? "text-muted line-through decoration-faint" : ""} ${
          e.tipo === "recorrencia" ? "border border-dashed" : ""
        }`}
        style={{ background: `color-mix(in srgb, ${faixa} 14%, var(--surface))`, boxShadow: `inset 3px 0 0 ${faixa}`, borderColor: e.tipo === "recorrencia" ? faixa : undefined }}
      >
        {e.tipo === "periodo" && <span aria-hidden className="ml-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: semaforo }} />}
        {hora && <span className="shrink-0 pl-0.5 font-semibold tabular-nums text-text-2">{e.horaInicio}</span>}
        <span className="truncate">{e.titulo}</span>
        {!compacta && <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint">{rotuloTicket(e.ticket)}</span>}
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

/**
 * CALENDÁRIO por EVENTOS (o módulo Calendário e a aba Calendário do quadro) — o essencial do Google Agenda:
 * - vistas **Dia · Semana · Mês · Agenda** (`Segmented`; atalhos D/S/M/A, T = hoje, ←/→ = anterior/próximo);
 * - **Dia/Semana**: a GRADE DE HORAS (os eventos com horário posicionados pela hora, lado a lado quando se cruzam —
 *   `layoutDoDia`; a faixa "dia inteiro" no topo; a LINHA DO AGORA); tocar num horário vazio = CRIAR ali (`onCriar`). No
 *   celular a Semana vira os dias empilhados;
 * - **Mês**: a grade com as FAIXAS (início → fim contínuos — `faixasDaSemana`), "+N" abre a semana, o nº do dia abre o DIA;
 *   setas movem entre os dias. No celular: a mini-grade (pontos) + a lista do dia tocado;
 * - **Agenda**: os dias do mês com eventos.
 * ARRASTAR reagenda (`onMover` — dia, e a hora na grade; a recorrência não se arrasta). Cabeçalho: navegação, "Criar",
 * os NÚMEROS e a legenda. `lateral` = a barra (mini-mês + conjuntos) — coluna à esquerda no desktop, folha no celular.
 * Recebe os eventos JÁ FILTRADOS/VISÍVEIS. `mes`/`onMes` = mês controlado pelo host (o servidor carrega o mês pedido).
 */
export function CalendarioTarefas({
  eventos,
  hoje,
  contadores,
  onAbrir,
  onCriar,
  onMover,
  corQuadro,
  mes: mesControlado,
  onMes,
  legenda,
  lateral,
  rotuloLateral = "Filtros",
}: {
  eventos: EventoCalendario[];
  hoje: string;
  contadores: { atrasadas: number; hoje: number; naSemana: number; semPrazo: number };
  onAbrir: (e: EventoCalendario) => void;
  /** Criar no dia (e na hora, na grade). */
  onCriar?: (slot: { data: string; hora: string | null }) => void;
  onMover?: (e: EventoCalendario, dia: string, hora: string | null) => void;
  corQuadro?: (quadroId: number) => string | undefined;
  mes?: MesCalendario;
  onMes?: (m: MesCalendario) => void;
  legenda?: ReactNode;
  lateral?: (nav: NavCalendario) => ReactNode;
  rotuloLateral?: string;
}) {
  const [mesLocal, setMesLocal] = useState<MesCalendario>(() => mesControlado ?? mesDoDia(hoje));
  const mes = mesControlado ?? mesLocal;
  const [vista, setVista] = useState<Vista>("mes");
  const [foco, setFoco] = useState(() => (hoje.startsWith(prefixoMes(mes)) ? hoje : `${prefixoMes(mes)}-01`));
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [semanaAberta, setSemanaAberta] = useState<string | null>(null);
  const [lateralAberta, setLateralAberta] = useState(false);
  const grade = useMemo(() => gradeMes(mes.ano, mes.mes), [mes.ano, mes.mes]);
  const semana = useMemo(() => semanaDe(foco), [foco]);
  const prefixo = prefixoMes(mes);
  const dnd = useArrastoEventos(onMover);
  const agoraMin = useAgoraMin();
  const pegar = (e: EventoCalendario) => (onMover && e.tipo !== "recorrencia" ? (ev: ReactPointerEvent<HTMLElement>) => dnd.iniciar(ev, e) : undefined);
  const abrir = (e: EventoCalendario) => {
    if (!dnd.foiArrasto()) onAbrir(e);
  };

  // O mês mudou por fora (o servidor carregou outro): o foco e o dia aberto acompanham.
  // biome-ignore lint/correctness/useExhaustiveDependencies: acompanha só a troca de mês.
  useEffect(() => {
    if (!foco.startsWith(prefixo)) setFoco(hoje.startsWith(prefixo) ? hoje : `${prefixo}-01`);
    setDiaAberto((d) => (d?.startsWith(prefixo) ? d : null));
  }, [prefixo]);

  const irMes = (m: MesCalendario) => (onMes ? onMes(m) : setMesLocal(m));
  const irPara = (d: string) => {
    setFoco(d);
    setSemanaAberta(null);
    if (vista === "mes") setDiaAberto(d);
    if (!d.startsWith(prefixo)) irMes(mesDoDia(d));
  };
  const andar = (dir: -1 | 1) => {
    setSemanaAberta(null);
    if (vista === "dia" || vista === "semana") {
      const novo = somarDias(foco, (vista === "dia" ? 1 : 7) * dir);
      setFoco(novo);
      if (!novo.startsWith(prefixo)) irMes(mesDoDia(novo));
    } else irMes(somarMes(mes.ano, mes.mes, dir));
  };
  const irHoje = () => {
    setFoco(hoje);
    setDiaAberto(null);
    if (!hoje.startsWith(prefixo)) irMes(mesDoDia(hoje));
  };
  const trocarVista = (v: Vista) => {
    setVista(v);
    setSemanaAberta(null);
  };

  // Atalhos (como no Google Agenda): D/S/M/A = vista, T = hoje, ←/→ = anterior/próximo — fora de campos e de banners.
  const atalhos = useRef({ trocarVista, irHoje, andar });
  atalhos.current = { trocarVista, irHoje, andar };
  useEffect(() => {
    const tecla = (ev: globalThis.KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return;
      const alvo = ev.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']") || document.querySelector("[role='dialog']")) return;
      const k = ev.key.toLowerCase();
      const v = ({ d: "dia", s: "semana", m: "mes", a: "agenda" } as Record<string, Vista>)[k];
      if (v) atalhos.current.trocarVista(v);
      else if (k === "t") atalhos.current.irHoje();
      else if (ev.key === "ArrowLeft" && !alvo?.closest("[data-dia-btn]")) atalhos.current.andar(-1);
      else if (ev.key === "ArrowRight" && !alvo?.closest("[data-dia-btn]")) atalhos.current.andar(1);
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const titulo =
    vista === "dia"
      ? `${nomeDia(foco)}, ${dataBR(foco)}`
      : vista === "semana"
        ? `${dataBR(semana[0]).slice(0, 5)} – ${dataBR(semana[6])}`
        : `${NOMES_MES[mes.mes - 1]} ${mes.ano}`;
  const passo = vista === "dia" ? "Dia" : vista === "semana" ? "Semana" : "Mês";

  /** Setas entre os dias da grade do mês (os botões `[data-dia-btn]`); Enter/Espaço abrem o dia. */
  const teclaDia = (ev: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const p = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (p == null) return;
    ev.preventDefault();
    ev.stopPropagation();
    document.querySelector<HTMLButtonElement>(`[data-dia-btn="${somarDias(d, p)}"]`)?.focus();
  };
  const alvoDrop = (d: string) => (dnd.arrasto?.dia === d ? "ring-2 ring-inset ring-accent bg-accent-soft" : "");
  const doDia = (d: string) => eventosDoDia(eventos, d);

  const numeros = [
    { rotulo: "Atrasadas", valor: contadores.atrasadas, cor: contadores.atrasadas ? "var(--danger)" : undefined },
    { rotulo: "Hoje", valor: contadores.hoje, cor: contadores.hoje ? "var(--warn)" : undefined },
    { rotulo: "Nesta semana", valor: contadores.naSemana },
    { rotulo: "Sem prazo", valor: contadores.semPrazo },
  ];

  /** A LISTA de um dia (agenda, semana no celular, dia aberto do mês). */
  const listaDoDia = (d: string, fechar?: () => void) => {
    const lista = doDia(d);
    return (
      <section data-dia={d} aria-label={`Eventos de ${dataBR(d)}`} className={`rounded-card border border-border bg-surface p-2 transition-shadow ${alvoDrop(d)}`}>
        <div className="mb-1 flex items-center gap-1 px-1">
          <h3 className={`min-w-0 flex-1 text-[12.5px] font-semibold ${d === hoje ? "text-accent" : "text-text-2"}`}>
            {nomeDia(d)}, {dataBR(d)}
            {d === hoje ? " · hoje" : ""}
            <span className="ml-1.5 font-normal text-muted">{lista.length ? `${num(lista.length)} evento${lista.length === 1 ? "" : "s"}` : "sem eventos"}</span>
          </h3>
          {onCriar && <Button variant="ghost" size="sm" aria-label={`Criar em ${dataBR(d)}`} icon={<IconPlus className="h-4 w-4" />} onClick={() => onCriar({ data: d, hora: null })} />}
          {fechar && <Button variant="ghost" size="sm" aria-label="Fechar o dia" icon={<IconClose className="h-4 w-4" />} onClick={fechar} />}
        </div>
        <div className="space-y-1">
          {lista.map((e) => (
            <EventoChip key={e.chave} e={e} hoje={hoje} corQuadro={corQuadro} onAbrir={() => abrir(e)} onPegar={pegar(e)} />
          ))}
        </div>
      </section>
    );
  };

  /** A GRADE DE HORAS de 1 (Dia) ou 7 (Semana) dias. */
  const gradeHoras = (dias: string[]) => {
    const diaInteiro = eventos.filter((e) => e.diaInteiro || e.inicio !== e.fim);
    const faixas = faixasDaSemana(diaInteiro, dias);
    const linhasTopo = faixas.reduce((m, f) => Math.max(m, f.linha + 1), 0);
    const colunas = `3rem repeat(${dias.length}, minmax(0, 1fr))`;
    return (
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {dias.length > 1 && (
          <div className="grid border-b border-border bg-surface-2" style={{ gridTemplateColumns: colunas }}>
            <span />
            {dias.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setFoco(d);
                  trocarVista("dia");
                }}
                className="flex min-h-11 flex-col items-center justify-center py-1 lg:min-h-0"
                aria-label={`Ver o dia ${dataBR(d)}`}
              >
                <span className={`text-[11px] font-semibold ${fimDeSemana(d) ? "text-faint" : "text-muted"}`}>{nomeDia(d)}</span>
                <span className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-[13px] tabular-nums ${d === hoje ? "bg-accent font-bold text-white" : "text-text"}`}>
                  {Number(d.slice(8))}
                </span>
              </button>
            ))}
          </div>
        )}
        {/* Dia inteiro (e os de vários dias) — as faixas no topo. */}
        <div className="grid border-b border-border" style={{ gridTemplateColumns: colunas, gridTemplateRows: `repeat(${Math.max(1, linhasTopo)}, minmax(1.75rem, auto))` }}>
          <span className="row-span-full flex items-center justify-end pr-1.5 text-[10px] text-faint" style={{ gridColumn: 1, gridRow: "1 / -1" }}>
            dia todo
          </span>
          {dias.map((d, i) => (
            <div key={`t${d}`} data-dia={d} style={{ gridColumn: i + 2, gridRow: "1 / -1" }} className={`border-l border-border ${fimDeSemana(d) ? "bg-surface-2/35" : ""} ${alvoDrop(d)}`} />
          ))}
          {faixas.map((f) => (
            <div
              key={f.item.chave}
              className={`z-[1] min-w-0 p-0.5 ${dnd.arrasto ? "pointer-events-none" : ""} ${dnd.arrasto?.chave === f.item.chave ? "opacity-40" : ""}`}
              style={{ gridColumn: `${f.coluna + 2} / span ${f.span}`, gridRow: f.linha + 1 }}
            >
              <EventoChip e={f.item} hoje={hoje} corQuadro={corQuadro} compacta onAbrir={() => abrir(f.item)} onPegar={pegar(f.item)} />
            </div>
          ))}
        </div>
        {/* As horas: rola por dentro (abre nas 7h). */}
        <div
          className="max-h-[62dvh] overflow-y-auto"
          ref={(el) => {
            if (el && !el.dataset.rolou) {
              el.scrollTop = 7 * HORA_PX - 12;
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
              return (
                <div
                  key={d}
                  data-dia={d}
                  data-grade=""
                  onClick={(ev) => {
                    if (!onCriar || ev.target !== ev.currentTarget) return;
                    const r = ev.currentTarget.getBoundingClientRect();
                    onCriar({ data: d, hora: horaDeMinutos(Math.floor((((ev.clientY - r.top) / r.height) * 1440) / 30) * 30) });
                  }}
                  className={`relative border-l border-border ${fimDeSemana(d) ? "bg-surface-2/35" : ""} ${onCriar ? "cursor-cell" : ""} ${dnd.arrasto?.dia === d ? "bg-accent-soft" : ""}`}
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HORA_PX - 1}px, var(--border) ${HORA_PX - 1}px, var(--border) ${HORA_PX}px)` }}
                >
                  {layout.map((l) => (
                    <div
                      key={l.evento.chave}
                      className={`absolute z-[1] p-px ${dnd.arrasto ? "pointer-events-none" : ""} ${dnd.arrasto?.chave === l.evento.chave ? "opacity-40" : ""}`}
                      style={{ top: (l.topo / 60) * HORA_PX, height: (l.altura / 60) * HORA_PX, left: `${(l.coluna / l.colunas) * 100}%`, width: `${100 / l.colunas}%` }}
                    >
                      <EventoCaixa e={l.evento} hoje={hoje} corQuadro={corQuadro} onAbrir={() => abrir(l.evento)} onPegar={pegar(l.evento)} />
                    </div>
                  ))}
                  {d === hoje && agoraMin != null && (
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[2] h-0.5 bg-[var(--danger)]" style={{ top: (agoraMin / 60) * HORA_PX }}>
                      <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
                    </div>
                  )}
                  {dnd.arrasto?.dia === d && dnd.arrasto.hora && (
                    <span className="pointer-events-none absolute right-1 z-[3] rounded bg-accent px-1 text-[10.5px] font-semibold text-white" style={{ top: (Number(dnd.arrasto.hora.slice(0, 2)) + Number(dnd.arrasto.hora.slice(3)) / 60) * HORA_PX }}>
                      {dnd.arrasto.hora}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const cabecalho = (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="icon" size="sm" aria-label={`${passo} anterior`} icon={<IconChevronLeft className="h-4 w-4" />} onClick={() => andar(-1)} />
          <h2 className="min-w-[9.5rem] text-center text-[15px] font-semibold tabular-nums text-text" aria-live="polite">
            {titulo}
          </h2>
          <Button variant="icon" size="sm" aria-label={`${passo === "Mês" ? "Próximo" : "Próxima"} ${passo.toLowerCase()}`} icon={<IconChevronRight className="h-4 w-4" />} onClick={() => andar(1)} />
          <Button variant="ghost" size="sm" onClick={irHoje} title="Hoje (T)">
            Hoje
          </Button>
        </div>
        <Segmented<Vista>
          ariaLabel="Vista do calendário"
          value={vista}
          onChange={trocarVista}
          options={[
            { value: "dia", label: "Dia" },
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mês" },
            { value: "agenda", label: "Agenda" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          {lateral && (
            <Button variant="secondary" size="sm" className="lg:hidden" icon={<IconFilter className="h-4 w-4" />} onClick={() => setLateralAberta(true)}>
              {rotuloLateral}
            </Button>
          )}
          {onCriar && (
            <Button variant="accent" size="sm" className="max-sm:w-11 max-sm:px-0" aria-label="Criar" icon={<IconPlus className="h-4 w-4" />} onClick={() => onCriar({ data: foco, hora: null })}>
              <span className="max-sm:hidden">Criar</span>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {numeros.map((n) => (
            <div key={n.rotulo} className="flex items-baseline gap-1.5">
              <dt className="text-muted">{n.rotulo}</dt>
              <dd className="font-semibold tabular-nums text-text" style={n.cor ? { color: n.cor } : undefined}>
                {num(n.valor)}
              </dd>
            </div>
          ))}
        </dl>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted lg:ml-auto" aria-label="Legenda">
          {LEGENDA.map((e) => (
            <li key={e} className="inline-flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COR_ESTADO_PRAZO[e] }} />
              {ROTULO_ESTADO_PRAZO[e]}
            </li>
          ))}
          {legenda}
        </ul>
      </div>
    </div>
  );

  const corpo = (
    <>
      {vista === "mes" && (
        <>
          {/* Desktop: a grade do mês com as faixas. */}
          <div className="hidden overflow-hidden rounded-card border border-border bg-surface lg:block">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2">
              {DIAS_SEMANA_CURTOS.map((d, i) => (
                <div key={d} className={`py-1.5 text-center text-[11px] font-semibold ${i === 0 || i === 6 ? "text-faint" : "text-muted"}`}>
                  {d}
                </div>
              ))}
            </div>
            {grade.map((sem) => {
              const faixas = faixasDaSemana(eventos, sem);
              const linhas = faixas.reduce((m, f) => Math.max(m, f.linha + 1), 0);
              const aberta = semanaAberta === sem[0];
              const mostrar = aberta ? linhas : Math.min(linhas, POR_DIA);
              const escondidas = sem.map((_, i) => faixas.filter((f) => f.linha >= mostrar && f.coluna <= i && f.coluna + f.span > i).length);
              return (
                <div
                  key={sem[0]}
                  className="grid min-h-28 grid-cols-7 border-b border-border last:border-b-0"
                  style={{ gridTemplateRows: `2rem ${mostrar ? `repeat(${mostrar}, 1.5rem) ` : ""}minmax(1.5rem, 1fr)` }}
                >
                  {sem.map((d, i) => (
                    <div
                      key={`f${d}`}
                      data-dia={d}
                      style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                      className={`border-r border-border transition-colors last:border-r-0 ${!d.startsWith(prefixo) ? "bg-surface-2/70" : fimDeSemana(d) ? "bg-surface-2/35" : ""} ${alvoDrop(d)}`}
                    />
                  ))}
                  {sem.map((d, i) => (
                    <div key={`n${d}`} style={{ gridColumn: i + 1, gridRow: 1 }} className="group/dia pointer-events-none z-[1] flex items-center justify-end gap-0.5 px-1">
                      {onCriar && (
                        <button
                          type="button"
                          onClick={() => onCriar({ data: d, hora: null })}
                          aria-label={`Criar em ${dataBR(d)}`}
                          className="pointer-events-auto grid h-6 w-6 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-accent focus-visible:opacity-100 group-hover/dia:opacity-100 any-pointer-coarse:opacity-100"
                        >
                          <IconPlus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        data-dia-btn={d}
                        onClick={() => setDiaAberto(diaAberto === d ? null : d)}
                        onDoubleClick={() => {
                          setFoco(d);
                          trocarVista("dia");
                        }}
                        onKeyDown={(ev) => teclaDia(ev, d)}
                        aria-label={`${nomeDia(d)}, ${dataBR(d)}${d === hoje ? " (hoje)" : ""} — ${num(doDia(d).length)} evento(s)`}
                        aria-pressed={diaAberto === d}
                        className={`pointer-events-auto grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11.5px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          d === hoje
                            ? "bg-accent font-bold text-white"
                            : diaAberto === d
                              ? "bg-accent-soft font-semibold text-accent"
                              : d.startsWith(prefixo)
                                ? "text-text-2 hover:bg-surface-2"
                                : "text-faint hover:bg-surface-2"
                        }`}
                      >
                        {Number(d.slice(8))}
                      </button>
                    </div>
                  ))}
                  {faixas
                    .filter((f) => f.linha < mostrar)
                    .map((f) => (
                      <div
                        key={f.item.chave}
                        className={`z-[1] min-w-0 px-0.5 py-px ${f.antes ? "pl-0" : ""} ${f.depois ? "pr-0" : ""} ${dnd.arrasto ? "pointer-events-none" : ""} ${dnd.arrasto?.chave === f.item.chave ? "opacity-40" : ""}`}
                        style={{ gridColumn: `${f.coluna + 1} / span ${f.span}`, gridRow: f.linha + 2 }}
                      >
                        <EventoChip e={f.item} hoje={hoje} corQuadro={corQuadro} compacta onAbrir={() => abrir(f.item)} onPegar={pegar(f.item)} />
                      </div>
                    ))}
                  {sem.map((d, i) =>
                    escondidas[i] > 0 || (aberta && linhas > POR_DIA && i === 0) ? (
                      <div key={`m${d}`} style={{ gridColumn: i + 1, gridRow: mostrar + 2 }} className="z-[1] px-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setSemanaAberta(aberta ? null : sem[0])}
                          className="min-h-6 rounded-[6px] px-1.5 text-left text-[11px] font-semibold text-accent hover:bg-surface-2"
                        >
                          {aberta ? "Menos" : `+${escondidas[i]}`}
                        </button>
                      </div>
                    ) : null,
                  )}
                </div>
              );
            })}
          </div>

          {/* Celular e tablet: a mini-grade (pontos); a lista do dia tocado vem logo abaixo. */}
          <div className="overflow-hidden rounded-card border border-border bg-surface lg:hidden">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2">
              {DIAS_SEMANA_CURTOS.map((d) => (
                <div key={d} className="py-1 text-center text-[10.5px] font-semibold text-muted">
                  {d.slice(0, 1)}
                </div>
              ))}
            </div>
            {grade.map((sem) => (
              <div key={sem[0]} className="grid grid-cols-7">
                {sem.map((d) => {
                  const lista = doDia(d);
                  const sel = (diaAberto ?? foco) === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      data-dia={d}
                      onClick={() => {
                        setDiaAberto(d);
                        setFoco(d);
                      }}
                      aria-pressed={sel}
                      aria-label={`${dataBR(d)} — ${num(lista.length)} evento(s)`}
                      className={`flex h-12 flex-col items-center justify-center gap-1 transition-colors ${!d.startsWith(prefixo) ? "text-faint" : "text-text-2"} ${fimDeSemana(d) && d.startsWith(prefixo) ? "bg-surface-2/35" : ""} ${alvoDrop(d)}`}
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
          {/* O DIA: no desktop, o aberto pelo nº/"+N"; no celular, sempre o tocado (ou o foco). */}
          <div className={diaAberto ? "" : "lg:hidden"}>{listaDoDia(diaAberto ?? foco, diaAberto ? () => setDiaAberto(null) : undefined)}</div>
        </>
      )}

      {vista === "semana" && (
        <>
          <div className="hidden lg:block">{gradeHoras(semana)}</div>
          <div className="space-y-2 lg:hidden">
            {semana.map((d) => (
              <div key={d}>{listaDoDia(d)}</div>
            ))}
          </div>
        </>
      )}

      {vista === "dia" && gradeHoras([foco])}

      {vista === "agenda" &&
        (() => {
          const dias = grade.flat().filter((d) => d.startsWith(prefixo) && doDia(d).length > 0);
          return dias.length ? (
            <div className="space-y-2">
              {dias.map((d) => (
                <div key={d}>{listaDoDia(d)}</div>
              ))}
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-border-2 bg-surface px-4 py-8 text-center text-sm text-muted">Nenhum evento neste mês.</p>
          );
        })()}
    </>
  );

  const nav: NavCalendario = { foco, irPara, mes };
  return (
    <div className={lateral ? "lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-start lg:gap-[var(--gap-block)]" : ""}>
      {lateral && <aside className="hidden lg:block">{lateral(nav)}</aside>}
      <div className="min-w-0 space-y-[var(--gap-block)]">
        {cabecalho}
        {corpo}
      </div>
      {lateral && (
        <Modal open={lateralAberta} onClose={() => setLateralAberta(false)} titulo={rotuloLateral} size="md">
          {lateral({ ...nav, irPara: (d) => {
              irPara(d);
              setLateralAberta(false);
            } })}
        </Modal>
      )}
      {dnd.arrasto && <ChipPreso rotulo={`${dnd.arrasto.rotulo}${dnd.arrasto.hora ? ` · ${dnd.arrasto.hora}` : ""}`} x={dnd.arrasto.x} y={dnd.arrasto.y} fantasma={dnd.fantasma} />}
    </div>
  );
}

/** Um evento COM HORA na grade de horas: a caixa do horário (título + horário; baixa = uma linha). */
function EventoCaixa({
  e,
  hoje,
  corQuadro,
  onAbrir,
  onPegar,
}: {
  e: EventoCalendario;
  hoje: string;
  corQuadro?: (quadroId: number) => string | undefined;
  onAbrir: () => void;
  onPegar?: (ev: ReactPointerEvent<HTMLElement>) => void;
}) {
  const { faixa } = corDoEvento(e, hoje, corQuadro);
  return (
    <button
      type="button"
      onClick={onAbrir}
      onPointerDown={(ev) => onPegar?.(ev)}
      title={`${e.titulo} — ${horarioDe(e)} · ${rotuloTicket(e.ticket)}${e.local ? ` · ${e.local}` : ""}`}
      className={`flex h-full w-full flex-col overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-[11px] leading-tight text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${onPegar ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${e.concluida ? "text-muted line-through" : ""}`}
      style={{ background: `color-mix(in srgb, ${faixa} 22%, var(--surface))`, boxShadow: `inset 3px 0 0 ${faixa}` }}
    >
      <span className="truncate font-semibold">{e.titulo}</span>
      <span className="truncate tabular-nums text-text-2">
        {horarioDe(e)}
        {e.local ? ` · ${e.local}` : ""}
      </span>
    </button>
  );
}
