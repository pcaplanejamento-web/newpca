"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { OpcoesCalendario } from "@/lib/calendario-core";
import { dataBR, num } from "@/lib/format";
import { diasSemanaCurtos, gradeMes, NOMES_MES, type OcultosCalendario, OCULTOS_VAZIO, ROTULO_TIPO_EVENTO, rotuloTicket, somarMes, TIPOS_EVENTO, type TipoEvento, temOculto } from "@/lib/tarefas-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { MesCalendario, NavCalendario } from "./CalendarioTarefas";
import { Checkbox, SearchField } from "./Field";
import { Switch } from "./Switch";
import { IconChevronLeft, IconChevronRight } from "./icons";

/** Um CONJUNTO de eventos = uma tarefa (com quantos eventos ela tem no período). */
export type ConjuntoTarefa = { id: number; ticket: number; titulo: string; eventos: number };
export type GrupoConjuntos = { quadro: { id: number; nome: string; cor: string }; tarefas: ConjuntoTarefa[] };
/** Um PCA com previsões no período (o cronograma de contratações — um conjunto próprio). */
export type ConjuntoPca = { id: number; nome: string; eventos: number };

/** O MINI-MÊS da barra (ir para qualquer data): hoje marcado, o dia em foco destacado, ponto nos dias com eventos. */
export function MiniMes({ nav, hoje, diasComEvento, inicioSemana = 0 }: { nav: NavCalendario; hoje: string; diasComEvento: Set<string>; inicioSemana?: 0 | 1 }) {
  const { ano, mes } = nav.mes;
  const [m, setM] = useState<MesCalendario>({ ano, mes });
  // O calendário mudou de mês: o mini-mês acompanha.
  useEffect(() => setM({ ano, mes }), [ano, mes]);
  const grade = useMemo(() => gradeMes(m.ano, m.mes, inicioSemana), [m.ano, m.mes, inicioSemana]);
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
        {diasSemanaCurtos(inicioSemana).map((d) => (
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
 * Recorrência · Eventos · Previsão do PCA) + os FERIADOS, os CONJUNTOS — cada TAREFA é um conjunto de eventos, agrupadas
 * por QUADRO (a cor dele), e cada PCA um conjunto do cronograma: marcar/desmarcar mostra/esconde a tarefa, o quadro ou o
 * PCA; busca na lista; "Mostrar todos"/"Ocultar todos" —, as OPÇÕES da pessoa (semana começando na segunda, ocultar o
 * fim de semana) e `extras` (exportar/assinar). Controlada — `onOcultos`/`onOpcoes` recebem o novo estado (quem usa
 * grava a preferência).
 */
export function BarraCalendario({
  nav,
  hoje,
  diasComEvento,
  grupos,
  pcas = [],
  porTipo,
  feriadosNoPeriodo = 0,
  ocultos,
  onOcultos,
  opcoes,
  onOpcoes,
  extras,
}: {
  nav: NavCalendario;
  hoje: string;
  diasComEvento: Set<string>;
  grupos: GrupoConjuntos[];
  pcas?: ConjuntoPca[];
  /** Quantos eventos de cada tipo há no período. */
  porTipo: Record<TipoEvento, number>;
  feriadosNoPeriodo?: number;
  ocultos: OcultosCalendario;
  onOcultos: (o: OcultosCalendario) => void;
  opcoes?: OpcoesCalendario;
  onOpcoes?: (o: OpcoesCalendario) => void;
  extras?: ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const casa = predicadoBusca(busca);
  const visiveis = grupos
    .map((g) => ({ ...g, tarefas: casa ? g.tarefas.filter((t) => casa([t.titulo, rotuloTicket(t.ticket), g.quadro.nome])) : g.tarefas }))
    .filter((g) => g.tarefas.length > 0);
  const alternar = <K extends "tarefas" | "quadros" | "pcas">(k: K, id: number) =>
    onOcultos({ ...ocultos, [k]: ocultos[k].includes(id) ? ocultos[k].filter((x) => x !== id) : [...ocultos[k], id] });
  const todasIds = grupos.flatMap((g) => g.tarefas.map((t) => t.id));
  const algumOculto = temOculto(ocultos);
  const pcasVisiveis = casa ? pcas.filter((p) => casa([p.nome])) : pcas;

  return (
    <div className="space-y-[var(--gap-block)]">
      <MiniMes nav={nav} hoje={hoje} diasComEvento={diasComEvento} inicioSemana={opcoes?.inicioSegunda ? 1 : 0} />
      <section className="rounded-card border border-border bg-surface p-2" aria-label="Tipos de evento">
        <p className="px-1 pb-1 text-[12px] font-semibold text-text-2">Tipos</p>
        {TIPOS_EVENTO.filter((t) => t !== "pca" || pcas.length > 0).map((t) => (
          <div key={t} className="flex min-h-11 items-center justify-between gap-2 px-1 lg:min-h-8">
            <Checkbox
              checked={!ocultos.tipos.includes(t)}
              onChange={() => onOcultos({ ...ocultos, tipos: ocultos.tipos.includes(t) ? ocultos.tipos.filter((x) => x !== t) : [...ocultos.tipos, t] })}
              label={ROTULO_TIPO_EVENTO[t]}
            />
            <span className="text-[11px] tabular-nums text-faint">{num(porTipo[t])}</span>
          </div>
        ))}
        <div className="flex min-h-11 items-center justify-between gap-2 px-1 lg:min-h-8">
          <Checkbox checked={!ocultos.feriados} onChange={() => onOcultos({ ...ocultos, feriados: !ocultos.feriados })} label="Feriados" />
          <span className="text-[11px] tabular-nums text-faint">{num(feriadosNoPeriodo)}</span>
        </div>
      </section>
      <section className="rounded-card border border-border bg-surface p-2" aria-label="Conjuntos de eventos">
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <p className="text-[12px] font-semibold text-text-2">Conjuntos (tarefas)</p>
          <button
            type="button"
            onClick={() => onOcultos(algumOculto ? OCULTOS_VAZIO : { ...ocultos, tarefas: todasIds, pcas: pcas.map((p) => p.id) })}
            className="min-h-11 rounded-control px-1.5 text-[11.5px] font-semibold text-accent hover:bg-surface-2 lg:min-h-7"
          >
            {algumOculto ? "Mostrar todos" : "Ocultar todos"}
          </button>
        </div>
        {grupos.length > 6 || grupos.reduce((s, g) => s + g.tarefas.length, 0) + pcas.length > 8 ? (
          <div className="px-1 pb-1">
            <SearchField compacto value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tarefa" aria-label="Buscar tarefa nos conjuntos" />
          </div>
        ) : null}
        {visiveis.length === 0 && pcasVisiveis.length === 0 && (
          <p className="px-1 py-3 text-[12px] text-muted">{grupos.length || pcas.length ? "Nada encontrado." : "Nenhum evento no período."}</p>
        )}
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
          {pcasVisiveis.length > 0 && (
            <div>
              <p className="flex min-h-11 items-center gap-1.5 px-1 text-[12.5px] font-semibold text-text lg:min-h-8">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-[var(--info)]" />
                Cronograma do PCA
              </p>
              <ul className="ml-4 border-l border-border pl-1.5">
                {pcasVisiveis.map((p) => (
                  <li key={p.id} className="flex min-h-11 items-center gap-1.5 lg:min-h-8">
                    <Checkbox checked={!ocultos.pcas.includes(p.id)} onChange={() => alternar("pcas", p.id)} label="" aria-label={`Mostrar a previsão do ${p.nome}`} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text-2" title={p.nome}>
                      {p.nome}
                    </span>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-faint">{p.eventos}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      {opcoes && onOpcoes && (
        <section className="space-y-1 rounded-card border border-border bg-surface p-2" aria-label="Opções do calendário">
          <p className="px-1 pb-1 text-[12px] font-semibold text-text-2">Opções</p>
          <div className="px-1">
            <Switch checked={opcoes.inicioSegunda} onChange={(v) => onOpcoes({ ...opcoes, inicioSegunda: v })} label="Semana começa na segunda" />
          </div>
          <div className="px-1">
            <Switch checked={opcoes.ocultarFimDeSemana} onChange={(v) => onOpcoes({ ...opcoes, ocultarFimDeSemana: v })} label="Ocultar sábado e domingo" />
          </div>
        </section>
      )}
      {extras}
    </div>
  );
}
