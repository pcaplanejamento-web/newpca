"use client";

import { useEffect, useMemo, useState } from "react";
import { dataBR, num } from "@/lib/format";
import { DIAS_SEMANA_CURTOS, gradeMes, NOMES_MES, type OcultosCalendario, ROTULO_TIPO_EVENTO, rotuloTicket, somarMes, TIPOS_EVENTO, type TipoEvento } from "@/lib/tarefas-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { MesCalendario, NavCalendario } from "./CalendarioTarefas";
import { Checkbox, SearchField } from "./Field";
import { IconChevronLeft, IconChevronRight } from "./icons";

/** Um CONJUNTO de eventos = uma tarefa (com quantos eventos ela tem no período). */
export type ConjuntoTarefa = { id: number; ticket: number; titulo: string; eventos: number };
export type GrupoConjuntos = { quadro: { id: number; nome: string; cor: string }; tarefas: ConjuntoTarefa[] };

/** O MINI-MÊS da barra (ir para qualquer data): hoje marcado, o dia em foco destacado, ponto nos dias com eventos. */
export function MiniMes({ nav, hoje, diasComEvento }: { nav: NavCalendario; hoje: string; diasComEvento: Set<string> }) {
  const [m, setM] = useState<MesCalendario>(nav.mes);
  // O calendário mudou de mês: o mini-mês acompanha.
  useEffect(() => setM(nav.mes), [nav.mes.ano, nav.mes.mes]);
  const grade = useMemo(() => gradeMes(m.ano, m.mes), [m.ano, m.mes]);
  const prefixo = `${m.ano}-${String(m.mes).padStart(2, "0")}`;
  return (
    <div className="rounded-card border border-border bg-surface p-2">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" aria-label="Mês anterior" onClick={() => setM(somarMes(m.ano, m.mes, -1))} className="grid h-11 w-11 place-items-center rounded-control text-muted hover:bg-surface-2 lg:h-8 lg:w-8">
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[12.5px] font-semibold text-text">
          {NOMES_MES[m.mes - 1]} {m.ano}
        </span>
        <button type="button" aria-label="Próximo mês" onClick={() => setM(somarMes(m.ano, m.mes, 1))} className="grid h-11 w-11 place-items-center rounded-control text-muted hover:bg-surface-2 lg:h-8 lg:w-8">
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-faint">
        {DIAS_SEMANA_CURTOS.map((d) => (
          <span key={d}>{d.slice(0, 1)}</span>
        ))}
      </div>
      {grade.map((sem) => (
        <div key={sem[0]} className="grid grid-cols-7">
          {sem.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => nav.irPara(d)}
              aria-label={`Ir para ${dataBR(d)}`}
              aria-current={d === nav.foco ? "date" : undefined}
              className={`relative mx-auto grid h-11 w-full max-w-11 place-items-center rounded-full text-[12px] tabular-nums transition-colors lg:h-8 ${
                d === hoje ? "bg-accent font-bold text-white" : d === nav.foco ? "bg-accent-soft font-semibold text-accent" : d.startsWith(prefixo) ? "text-text-2 hover:bg-surface-2" : "text-faint hover:bg-surface-2"
              }`}
            >
              {Number(d.slice(8))}
              {diasComEvento.has(d) && d !== hoje && <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A BARRA do calendário (como a lista de agendas do Google): o MINI-MÊS, os TIPOS de evento (Período da tarefa ·
 * Recorrência · Eventos) e os CONJUNTOS — cada TAREFA é um conjunto de eventos, agrupadas por QUADRO (a cor dele): marcar/
 * desmarcar mostra/esconde a tarefa ou o quadro inteiro; busca na lista; "Mostrar todos"/"Ocultar todos". Controlada —
 * `onOcultos` recebe o novo estado (quem usa grava a preferência).
 */
export function BarraCalendario({
  nav,
  hoje,
  diasComEvento,
  grupos,
  porTipo,
  ocultos,
  onOcultos,
}: {
  nav: NavCalendario;
  hoje: string;
  diasComEvento: Set<string>;
  grupos: GrupoConjuntos[];
  /** Quantos eventos de cada tipo há no período. */
  porTipo: Record<TipoEvento, number>;
  ocultos: OcultosCalendario;
  onOcultos: (o: OcultosCalendario) => void;
}) {
  const [busca, setBusca] = useState("");
  const casa = predicadoBusca(busca);
  const visiveis = grupos
    .map((g) => ({ ...g, tarefas: casa ? g.tarefas.filter((t) => casa([t.titulo, rotuloTicket(t.ticket), g.quadro.nome])) : g.tarefas }))
    .filter((g) => g.tarefas.length > 0);
  const alternar = <K extends "tarefas" | "quadros">(k: K, id: number) =>
    onOcultos({ ...ocultos, [k]: ocultos[k].includes(id) ? ocultos[k].filter((x) => x !== id) : [...ocultos[k], id] });
  const todasIds = grupos.flatMap((g) => g.tarefas.map((t) => t.id));
  const algumOculto = ocultos.tarefas.length > 0 || ocultos.quadros.length > 0 || ocultos.tipos.length > 0;

  return (
    <div className="space-y-[var(--gap-block)]">
      <MiniMes nav={nav} hoje={hoje} diasComEvento={diasComEvento} />
      <section className="rounded-card border border-border bg-surface p-2" aria-label="Tipos de evento">
        <p className="px-1 pb-1 text-[12px] font-semibold text-text-2">Tipos</p>
        {TIPOS_EVENTO.map((t) => (
          <div key={t} className="flex min-h-11 items-center justify-between gap-2 px-1 lg:min-h-8">
            <Checkbox
              checked={!ocultos.tipos.includes(t)}
              onChange={() => onOcultos({ ...ocultos, tipos: ocultos.tipos.includes(t) ? ocultos.tipos.filter((x) => x !== t) : [...ocultos.tipos, t] })}
              label={ROTULO_TIPO_EVENTO[t]}
            />
            <span className="text-[11px] tabular-nums text-faint">{num(porTipo[t])}</span>
          </div>
        ))}
      </section>
      <section className="rounded-card border border-border bg-surface p-2" aria-label="Conjuntos de eventos">
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <p className="text-[12px] font-semibold text-text-2">Conjuntos (tarefas)</p>
          <button
            type="button"
            onClick={() => onOcultos(algumOculto ? { tarefas: [], quadros: [], tipos: [] } : { ...ocultos, tarefas: todasIds })}
            className="min-h-11 rounded-control px-1.5 text-[11.5px] font-semibold text-accent hover:bg-surface-2 lg:min-h-7"
          >
            {algumOculto ? "Mostrar todos" : "Ocultar todos"}
          </button>
        </div>
        {grupos.length > 6 || grupos.reduce((s, g) => s + g.tarefas.length, 0) > 8 ? (
          <div className="px-1 pb-1">
            <SearchField compacto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tarefa" aria-label="Buscar tarefa nos conjuntos" />
          </div>
        ) : null}
        {visiveis.length === 0 && <p className="px-1 py-3 text-[12px] text-muted">{grupos.length ? "Nenhuma tarefa encontrada." : "Nenhum evento no período."}</p>}
        <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
          {visiveis.map((g) => {
            const quadroOculto = ocultos.quadros.includes(g.quadro.id);
            return (
              <div key={g.quadro.id}>
                <div className="flex min-h-11 items-center gap-1.5 px-1 lg:min-h-8">
                  <Checkbox checked={!quadroOculto} onChange={() => alternar("quadros", g.quadro.id)} label="" aria-label={`Mostrar o quadro ${g.quadro.nome}`} />
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: g.quadro.cor }} />
                  <span className="min-w-0 truncate text-[12.5px] font-semibold text-text" title={g.quadro.nome}>
                    {g.quadro.nome}
                  </span>
                </div>
                <ul className={`ml-4 border-l border-border pl-1.5 ${quadroOculto ? "opacity-50" : ""}`}>
                  {g.tarefas.map((t) => (
                    <li key={t.id} className="flex min-h-11 items-center gap-1.5 lg:min-h-8">
                      <Checkbox
                        checked={!ocultos.tarefas.includes(t.id)}
                        disabled={quadroOculto}
                        onChange={() => alternar("tarefas", t.id)}
                        label=""
                        aria-label={`Mostrar ${rotuloTicket(t.ticket)} ${t.titulo}`}
                      />
                      <span className="shrink-0 font-mono text-[10.5px] text-faint">{rotuloTicket(t.ticket)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-text-2" title={t.titulo}>
                        {t.titulo}
                      </span>
                      <span className="shrink-0 text-[10.5px] tabular-nums text-faint">{t.eventos}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
