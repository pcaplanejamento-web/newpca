"use client";

import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { dataBR, num } from "@/lib/format";
import {
  COR_ESTADO_PRAZO,
  contadoresCalendario,
  DIAS_SEMANA_CURTOS,
  type EstadoPrazo,
  estadoPrazo,
  faixasDaSemana,
  fimDeSemana,
  gradeMes,
  NOMES_MES,
  ROTULO_ESTADO_PRAZO,
  rotuloTicket,
  semanaDe,
  somarDias,
  somarMes,
  type TarefaCalendario,
  tarefasPorPrazo,
} from "@/lib/tarefas-core";
import { ChipPreso } from "./BlocosTarefa";
import { Button } from "./Button";
import { IconChevronLeft, IconChevronRight, IconGrip, IconPlus, IconRepetir, IconClose } from "./icons";
import { segurar } from "./segurar";
import { Segmented } from "./Segmented";

type Vista = "mes" | "semana" | "agenda";
type Mes = { ano: number; mes: number };
/** Quantas faixas cabem numa semana da grade antes do "+N". */
const POR_DIA = 3;
const LIMIAR = 6;
const BORDA = 48;
const VEL = 12;
const LEGENDA: EstadoPrazo[] = ["ok", "vence", "hoje", "atrasada", "concluida"];
const nomeDia = (d: string) => DIAS_SEMANA_CURTOS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const mesDoDia = (d: string): Mes => ({ ano: Number(d.slice(0, 4)), mes: Number(d.slice(5, 7)) });
const prefixoMes = (m: Mes) => `${m.ano}-${String(m.mes).padStart(2, "0")}`;

type Arrasto = { id: number; rotulo: string; x: number; y: number; dia: string | null };

/**
 * REAGENDAR arrastando (mouse/caneta na tarefa; no toque, pela alça): o dia sob o ponteiro (`[data-dia]`) é o destino —
 * destacado enquanto se arrasta; a página rola sozinha perto das bordas. Soltar num dia diferente do prazo = `onSoltar`.
 * O clique que vem depois de um arrasto não abre a tarefa (`foiArrasto`).
 */
function useArrastoDias<T extends TarefaCalendario>(onSoltar?: (t: T, dia: string) => void) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const fantasma = useRef<HTMLDivElement>(null);
  const encerrar = useRef<(() => void) | null>(null);
  const arrastou = useRef(false);
  useEffect(() => () => encerrar.current?.(), []);

  const iniciar = (e: ReactPointerEvent<HTMLElement>, t: T) => {
    if (!onSoltar || !e.isPrimary || e.button > 0) return;
    if (e.pointerType === "mouse") e.preventDefault();
    e.stopPropagation();
    encerrar.current?.();
    arrastou.current = false;
    const ponteiro = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const rotulo = `${rotuloTicket(t.ticket)} ${t.titulo}`;
    let ativo = false;
    let ultimo = { x: x0, y: y0 };
    let dia: string | null = null;
    let vel = 0;
    let raf = 0;
    let soltarCursor: (() => void) | null = null;
    const soltarSelecao = segurar("");

    const calcular = () => {
      const alvo = document.elementFromPoint(ultimo.x, ultimo.y)?.closest<HTMLElement>("[data-dia]")?.dataset.dia ?? null;
      if (alvo === dia) return;
      dia = alvo;
      setArrasto({ id: t.id, rotulo, x: ultimo.x, y: ultimo.y, dia });
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
      if (ativo && ev.type === "pointerup" && dia && dia !== t.prazo) onSoltar(t, dia);
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
 * Uma TAREFA no calendário: ticket + título (+ recorrente), a faixa na cor do SEMÁFORO do prazo (ou do quadro, no calendário
 * de todos os quadros — o semáforo vira o ponto). Tocar abre; arrastar reagenda (no toque, pela alça).
 */
function TarefaDia<T extends TarefaCalendario>({
  t,
  hoje,
  cor,
  compacta = false,
  onAbrir,
  onPegar,
}: {
  t: T;
  hoje: string;
  /** A cor do QUADRO (calendário de todos os quadros). */
  cor?: string;
  /** Na grade do mês: uma linha baixa. */
  compacta?: boolean;
  onAbrir: () => void;
  onPegar?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const e = estadoPrazo(t.prazo, hoje, t.concluidaEm != null);
  const faixa = cor ?? COR_ESTADO_PRAZO[e];
  return (
    <div className="group/tarefa relative flex min-w-0 items-stretch">
      <button
        type="button"
        onClick={onAbrir}
        onPointerDown={(ev) => ev.pointerType !== "touch" && onPegar?.(ev)}
        title={`${rotuloTicket(t.ticket)} ${t.titulo} — ${ROTULO_ESTADO_PRAZO[e]}${t.inicio && t.inicio !== t.prazo ? ` (início ${dataBR(t.inicio)})` : ""}`}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-[6px] px-1.5 text-left leading-tight text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          compacta ? "h-full text-[11px]" : "min-h-11 text-[12px] lg:min-h-8"
        } ${onPegar ? "cursor-grab active:cursor-grabbing" : ""} ${t.concluidaEm ? "text-muted line-through decoration-faint" : ""}`}
        style={{ background: `color-mix(in srgb, ${faixa} 12%, var(--surface))`, boxShadow: `inset 3px 0 0 ${faixa}` }}
      >
        {cor && <span aria-hidden className="ml-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: COR_ESTADO_PRAZO[e] }} />}
        <span className="shrink-0 pl-1 font-mono text-[10.5px] text-faint">{rotuloTicket(t.ticket)}</span>
        <span className="truncate">{t.titulo}</span>
        {t.recorrencia && <IconRepetir aria-label="Recorrente" className="ml-auto h-3 w-3 shrink-0 text-faint" />}
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
 * CALENDÁRIO das tarefas pelo PRAZO — três vistas (`Segmented`):
 * - **Mês**: a grade (domingo → sábado; fim de semana sombreado, hoje marcado, dias de fora esmaecidos). As tarefas com
 *   início → prazo viram FAIXAS contínuas na semana (`faixasDaSemana`); "+N" e o nº do dia abrem o DIA (a lista inteira).
 *   Setas movem entre os dias; Enter abre. No celular, a grade vira a MINI-GRADE (pontos por dia) + a lista do dia tocado.
 * - **Semana**: os 7 dias em colunas (desktop) ou empilhados (celular).
 * - **Agenda**: os dias do mês com tarefas, em lista.
 * ARRASTAR uma tarefa para outro dia REAGENDA (`onReagendar` — o início anda junto); "+" num dia = ADICIONAR TAREFA com
 * aquele prazo (`onNova`). Cabeçalho: navegação, os NÚMEROS (atrasadas · hoje · nesta semana · sem prazo) e a legenda.
 * Recebe as tarefas JÁ FILTRADAS. `corDe` = a cor do QUADRO (calendário de todos os quadros); `mes`/`onMes` = mês
 * controlado pelo host (o servidor carrega o mês pedido).
 */
export function CalendarioTarefas<T extends TarefaCalendario>({
  tarefas,
  hoje,
  onAbrir,
  onNova,
  onReagendar,
  corDe,
  contadores,
  mes: mesControlado,
  onMes,
  legenda,
}: {
  tarefas: T[];
  hoje: string;
  onAbrir: (t: T) => void;
  onNova?: (dia: string) => void;
  onReagendar?: (t: T, dia: string) => void;
  corDe?: (t: T) => string | undefined;
  /** Os números do cabeçalho vindos de fora (calendário de todos os quadros); sem eles, contados das `tarefas`. */
  contadores?: { atrasadas: number; hoje: number; naSemana: number; semPrazo: number };
  mes?: Mes;
  onMes?: (m: Mes) => void;
  /** A legenda extra (ex.: os quadros e as cores). */
  legenda?: ReactNode;
}) {
  const [mesLocal, setMesLocal] = useState<Mes>(() => mesControlado ?? mesDoDia(hoje));
  const mes = mesControlado ?? mesLocal;
  const [vista, setVista] = useState<Vista>("mes");
  const [foco, setFoco] = useState(() => (hoje.startsWith(prefixoMes(mes)) ? hoje : `${prefixoMes(mes)}-01`));
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [semanaAberta, setSemanaAberta] = useState<string | null>(null);
  const grade = useMemo(() => gradeMes(mes.ano, mes.mes), [mes.ano, mes.mes]);
  const porDia = useMemo(() => tarefasPorPrazo(tarefas), [tarefas]);
  const semana = useMemo(() => semanaDe(foco), [foco]);
  const prefixo = prefixoMes(mes);
  const cont = contadores ?? contadoresCalendario(tarefas, hoje);
  const dnd = useArrastoDias<T>(onReagendar);
  const pegar = onReagendar ? (t: T) => (e: ReactPointerEvent<HTMLElement>) => dnd.iniciar(e, t) : () => undefined;
  const abrir = (t: T) => {
    if (!dnd.foiArrasto()) onAbrir(t);
  };
  const cor = (t: T) => corDe?.(t);

  // O mês mudou por fora (o servidor carregou outro): o foco e o dia aberto acompanham.
  // biome-ignore lint/correctness/useExhaustiveDependencies: acompanha só a troca de mês.
  useEffect(() => {
    if (!foco.startsWith(prefixo)) setFoco(hoje.startsWith(prefixo) ? hoje : `${prefixo}-01`);
    setDiaAberto((d) => (d?.startsWith(prefixo) ? d : null));
  }, [prefixo]);

  const irMes = (m: Mes) => (onMes ? onMes(m) : setMesLocal(m));
  const andar = (d: -1 | 1) => {
    setSemanaAberta(null);
    if (vista === "semana") {
      const novo = somarDias(foco, 7 * d);
      setFoco(novo);
      if (!novo.startsWith(prefixo)) irMes(mesDoDia(novo));
    } else irMes(somarMes(mes.ano, mes.mes, d));
  };
  const irHoje = () => {
    setFoco(hoje);
    setDiaAberto(null);
    if (!hoje.startsWith(prefixo)) irMes(mesDoDia(hoje));
  };
  const titulo =
    vista === "semana"
      ? `${dataBR(semana[0]).slice(0, 5)} – ${dataBR(semana[6])}`
      : `${NOMES_MES[mes.mes - 1]} ${mes.ano}`;

  /** Setas entre os dias da grade (os botões `[data-dia-btn]`); Enter/Espaço abrem o dia. */
  const teclaDia = (e: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (passo == null) return;
    e.preventDefault();
    const alvo = somarDias(d, passo);
    document.querySelector<HTMLButtonElement>(`[data-dia-btn="${alvo}"]`)?.focus();
  };
  const alvoDrop = (d: string) => (dnd.arrasto?.dia === d ? "ring-2 ring-inset ring-accent bg-accent-soft" : "");

  const numeros = [
    { rotulo: "Atrasadas", valor: cont.atrasadas, cor: cont.atrasadas ? "var(--danger)" : undefined },
    { rotulo: "Hoje", valor: cont.hoje, cor: cont.hoje ? "var(--warn)" : undefined },
    { rotulo: "Nesta semana", valor: cont.naSemana },
    { rotulo: "Sem prazo", valor: cont.semPrazo },
  ];

  const listaDoDia = (d: string, fechar?: () => void) => {
    const lista = porDia.get(d) ?? [];
    return (
      <section data-dia={d} aria-label={`Tarefas de ${dataBR(d)}`} className={`rounded-card border border-border bg-surface p-2 transition-shadow ${alvoDrop(d)}`}>
        <div className="mb-1 flex items-center gap-1 px-1">
          <h3 className={`min-w-0 flex-1 text-[12.5px] font-semibold ${d === hoje ? "text-accent" : "text-text-2"}`}>
            {nomeDia(d)}, {dataBR(d)}
            {d === hoje ? " · hoje" : ""}
            <span className="ml-1.5 font-normal text-muted">
              {lista.length ? `${num(lista.length)} tarefa${lista.length === 1 ? "" : "s"}` : "sem tarefas"}
            </span>
          </h3>
          {onNova && <Button variant="ghost" size="sm" aria-label={`Adicionar tarefa com prazo em ${dataBR(d)}`} icon={<IconPlus className="h-4 w-4" />} onClick={() => onNova(d)} />}
          {fechar && <Button variant="ghost" size="sm" aria-label="Fechar o dia" icon={<IconClose className="h-4 w-4" />} onClick={fechar} />}
        </div>
        <div className="space-y-1">
          {lista.map((t) => (
            <TarefaDia key={t.id} t={t} hoje={hoje} cor={cor(t)} onAbrir={() => abrir(t)} onPegar={onReagendar ? pegar(t) : undefined} />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="icon" size="sm" aria-label={vista === "semana" ? "Semana anterior" : "Mês anterior"} icon={<IconChevronLeft className="h-4 w-4" />} onClick={() => andar(-1)} />
          <h2 className="min-w-[9.5rem] text-center text-[15px] font-semibold tabular-nums text-text" aria-live="polite">
            {titulo}
          </h2>
          <Button variant="icon" size="sm" aria-label={vista === "semana" ? "Próxima semana" : "Próximo mês"} icon={<IconChevronRight className="h-4 w-4" />} onClick={() => andar(1)} />
          <Button variant="ghost" size="sm" onClick={irHoje}>
            Hoje
          </Button>
        </div>
        <Segmented<Vista>
          ariaLabel="Vista do calendário"
          value={vista}
          onChange={(v) => {
            setVista(v);
            setSemanaAberta(null);
          }}
          options={[
            { value: "mes", label: "Mês" },
            { value: "semana", label: "Semana" },
            { value: "agenda", label: "Agenda" },
          ]}
        />
        {onNova && (
          <Button
            variant="accent"
            size="sm"
            className="ml-auto max-sm:w-11 max-sm:px-0"
            aria-label="Adicionar tarefa"
            icon={<IconPlus className="h-4 w-4" />}
            onClick={() => onNova(vista === "semana" ? foco : hoje.startsWith(prefixo) ? hoje : `${prefixo}-01`)}
          >
            <span className="max-sm:hidden">Adicionar tarefa</span>
          </Button>
        )}
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
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted lg:ml-auto" aria-label="Legenda do prazo">
          {LEGENDA.map((e) => (
            <li key={e} className="inline-flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COR_ESTADO_PRAZO[e] }} />
              {ROTULO_ESTADO_PRAZO[e]}
            </li>
          ))}
          {legenda}
        </ul>
      </div>

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
              const faixas = faixasDaSemana(tarefas, sem);
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
                  {sem.map((d, i) => {
                    const doMes = d.startsWith(prefixo);
                    return (
                      <div
                        key={`f${d}`}
                        data-dia={d}
                        style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                        className={`border-r border-border transition-colors last:border-r-0 ${!doMes ? "bg-surface-2/70" : fimDeSemana(d) ? "bg-surface-2/35" : ""} ${alvoDrop(d)}`}
                      />
                    );
                  })}
                  {sem.map((d, i) => {
                    const doMes = d.startsWith(prefixo);
                    return (
                      <div key={`n${d}`} style={{ gridColumn: i + 1, gridRow: 1 }} className="group/dia pointer-events-none z-[1] flex items-center justify-end gap-0.5 px-1">
                        {onNova && (
                          <button
                            type="button"
                            onClick={() => onNova(d)}
                            aria-label={`Adicionar tarefa com prazo em ${dataBR(d)}`}
                            className="pointer-events-auto grid h-6 w-6 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-accent focus-visible:opacity-100 group-hover/dia:opacity-100 any-pointer-coarse:opacity-100"
                          >
                            <IconPlus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          data-dia-btn={d}
                          onClick={() => setDiaAberto(diaAberto === d ? null : d)}
                          onKeyDown={(e) => teclaDia(e, d)}
                          aria-label={`${nomeDia(d)}, ${dataBR(d)}${d === hoje ? " (hoje)" : ""} — ${num(porDia.get(d)?.length ?? 0)} tarefa(s)`}
                          aria-pressed={diaAberto === d}
                          className={`pointer-events-auto grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11.5px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                            d === hoje ? "bg-accent font-bold text-white" : diaAberto === d ? "bg-accent-soft font-semibold text-accent" : doMes ? "text-text-2 hover:bg-surface-2" : "text-faint hover:bg-surface-2"
                          }`}
                        >
                          {Number(d.slice(8))}
                        </button>
                      </div>
                    );
                  })}
                  {faixas
                    .filter((f) => f.linha < mostrar)
                    .map((f) => (
                      <div
                        key={`t${f.tarefa.id}`}
                        className={`z-[1] min-w-0 px-0.5 py-px ${f.antes ? "pl-0" : ""} ${f.depois ? "pr-0" : ""} ${dnd.arrasto ? "pointer-events-none" : ""} ${dnd.arrasto?.id === f.tarefa.id ? "opacity-40" : ""}`}
                        style={{ gridColumn: `${f.coluna + 1} / span ${f.span}`, gridRow: f.linha + 2 }}
                      >
                        <TarefaDia t={f.tarefa} hoje={hoje} cor={cor(f.tarefa)} compacta onAbrir={() => abrir(f.tarefa)} onPegar={onReagendar ? pegar(f.tarefa) : undefined} />
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
          <div className="lg:hidden">
            <div className="overflow-hidden rounded-card border border-border bg-surface">
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
                    const lista = porDia.get(d) ?? [];
                    const doMes = d.startsWith(prefixo);
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
                        aria-label={`${dataBR(d)} — ${num(lista.length)} tarefa(s)`}
                        className={`flex h-12 flex-col items-center justify-center gap-1 transition-colors ${!doMes ? "text-faint" : "text-text-2"} ${fimDeSemana(d) && doMes ? "bg-surface-2/35" : ""} ${alvoDrop(d)}`}
                      >
                        <span
                          className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-[12.5px] tabular-nums ${
                            d === hoje ? "bg-accent font-bold text-white" : sel ? "bg-accent-soft font-semibold text-accent" : ""
                          }`}
                        >
                          {Number(d.slice(8))}
                        </span>
                        <span aria-hidden className="flex h-1.5 gap-0.5">
                          {lista.slice(0, 3).map((t) => (
                            <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ background: cor(t) ?? COR_ESTADO_PRAZO[estadoPrazo(t.prazo, hoje, t.concluidaEm != null)] }} />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* O DIA: no desktop, o aberto pelo nº/"+N"; no celular, sempre o tocado (ou o foco). */}
          <div className={diaAberto ? "" : "lg:hidden"}>{listaDoDia(diaAberto ?? foco, diaAberto ? () => setDiaAberto(null) : undefined)}</div>
        </>
      )}

      {vista === "semana" && (
        <div className="grid gap-2 lg:grid-cols-7">
          {semana.map((d) => {
            const lista = porDia.get(d) ?? [];
            return (
              <section
                key={d}
                data-dia={d}
                aria-label={`${nomeDia(d)}, ${dataBR(d)}`}
                className={`flex min-w-0 flex-col rounded-card border border-border p-1.5 transition-colors lg:min-h-[22rem] ${fimDeSemana(d) ? "bg-surface-2/50" : "bg-surface"} ${alvoDrop(d)}`}
              >
                <div className="mb-1 flex items-center gap-1 px-1">
                  <span className={`text-[11.5px] font-semibold ${d === hoje ? "text-accent" : "text-muted"}`}>{nomeDia(d)}</span>
                  <span className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-[13px] tabular-nums ${d === hoje ? "bg-accent font-bold text-white" : "text-text"}`}>
                    {Number(d.slice(8))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-faint lg:hidden">{lista.length ? `${num(lista.length)} tarefa(s)` : "sem tarefas"}</span>
                  {onNova && (
                    <Button variant="ghost" size="sm" className="ml-auto" aria-label={`Adicionar tarefa com prazo em ${dataBR(d)}`} icon={<IconPlus className="h-4 w-4" />} onClick={() => onNova(d)} />
                  )}
                </div>
                <div className="space-y-1">
                  {lista.map((t) => (
                    <TarefaDia key={t.id} t={t} hoje={hoje} cor={cor(t)} onAbrir={() => abrir(t)} onPegar={onReagendar ? pegar(t) : undefined} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {vista === "agenda" &&
        (() => {
          const dias = grade.flat().filter((d) => d.startsWith(prefixo) && porDia.has(d));
          return dias.length ? (
            <div className="space-y-2">{dias.map((d) => <div key={d}>{listaDoDia(d)}</div>)}</div>
          ) : (
            <p className="rounded-card border border-dashed border-border-2 bg-surface px-4 py-8 text-center text-sm text-muted">Nenhuma tarefa com prazo neste mês.</p>
          );
        })()}

      {dnd.arrasto && <ChipPreso rotulo={dnd.arrasto.rotulo} x={dnd.arrasto.x} y={dnd.arrasto.y} fantasma={dnd.fantasma} />}
    </div>
  );
}
