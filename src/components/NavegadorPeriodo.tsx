"use client";

import { useState } from "react";
import { navegarRef, noPeriodo, PERIODOS_METRICAS, type PeriodoMetricas, rotuloPeriodo } from "@/lib/mesa-metricas";
import { NOMES_MES, semanaDe } from "@/lib/tarefas-core";
import { MiniMes } from "./BarraCalendario";
import { Button } from "./Button";
import type { NavCalendario } from "./CalendarioTarefas";
import { Dropdown } from "./Dropdown";
import { IconChevronDown, IconChevronLeft, IconChevronRight } from "./icons";
import { Segmented } from "./Segmented";

type Passo = Exclude<PeriodoMetricas, "tudo">;
const ANTERIOR: Record<Passo, string> = { ano: "Ano anterior", mes: "Mês anterior", semana: "Semana anterior", dia: "Dia anterior" };
const PROXIMO: Record<Passo, string> = { ano: "Próximo ano", mes: "Próximo mês", semana: "Próxima semana", dia: "Próximo dia" };
const ESCOLHER: Record<Passo, string> = { ano: "Escolher o ano", mes: "Escolher o mês", semana: "Escolher a semana", dia: "Escolher o dia" };
const SEM_DADOS = new Set<string>();
const botaoSeta = "grid h-11 w-11 place-items-center rounded-control text-muted hover:bg-surface-2 lg:h-8 lg:w-8";

/**
 * NAVEGADOR DE PERÍODO — `Tudo | Ano | Mês | Semana | Dia` e, fora do Tudo, `‹ rótulo ›` + "Hoje": escolhe a JANELA e
 * anda por ela (o passo segue o período; a semana vai de segunda a domingo; o dia fica preso ao fim do mês). O RÓTULO
 * abre o seletor para SALTAR a qualquer data: o mini-mês do calendário (dia ou semana — a janela destacada), a grade dos
 * meses ou a dos anos, com um ponto onde há dados (`diasComDados`). O rótulo é anunciado (`aria-live`); "Hoje" só
 * aparece fora do período atual. Controlado; alvos de 44px no toque.
 */
export function NavegadorPeriodo({
  periodo,
  data,
  hoje,
  onChange,
  diasComDados = SEM_DADOS,
}: {
  periodo: PeriodoMetricas;
  /** A data de referência (AAAA-MM-DD). */
  data: string;
  /** Hoje (AAAA-MM-DD, Brasília). */
  hoje: string;
  onChange: (v: { periodo: PeriodoMetricas; data: string }) => void;
  /** Os dias (AAAA-MM-DD) com dados — o ponto no seletor de data. */
  diasComDados?: Set<string>;
}) {
  const passo = periodo === "tudo" ? null : periodo;
  const rotulo = rotuloPeriodo(periodo, data, hoje);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Segmented<PeriodoMetricas>
        ariaLabel="Período das métricas"
        value={periodo}
        options={PERIODOS_METRICAS.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(p) => onChange({ periodo: p, data })}
      />
      {passo && (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label={ANTERIOR[passo]}
            title={ANTERIOR[passo]}
            icon={<IconChevronLeft className="h-4 w-4" />}
            onClick={() => onChange({ periodo, data: navegarRef(data, periodo, -1) })}
          />
          <Dropdown
            ariaLabel={`${ESCOLHER[passo]} — ${rotulo}`}
            width={288}
            triggerClassName="h-11 min-w-[8.5rem] justify-center gap-1 rounded-control px-2 text-[13px] font-semibold text-text tabular-nums transition-colors hover:bg-surface-2 lg:h-[var(--h-control-sm)]"
            trigger={
              <>
                <span aria-live="polite">{rotulo}</span>
                <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
              </>
            }
          >
            {(fechar) => {
              const escolher = (d: string) => {
                onChange({ periodo, data: d });
                fechar();
              };
              if (passo === "dia" || passo === "semana") {
                // O MINI-MÊS do calendário, com a janela à vista destacada (a semana inteira, de segunda a domingo).
                const nav: NavCalendario = {
                  foco: data,
                  irPara: escolher,
                  mes: { ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)) },
                  vista: passo,
                  destaque: passo === "semana" ? semanaDe(data, 1) : [data],
                };
                return <MiniMes nav={nav} hoje={hoje} diasComEvento={diasComDados} inicioSemana={1} />;
              }
              return passo === "mes" ? (
                <GradeMeses data={data} hoje={hoje} diasComDados={diasComDados} onEscolher={escolher} />
              ) : (
                <GradeAnos data={data} hoje={hoje} diasComDados={diasComDados} onEscolher={escolher} />
              );
            }}
          </Dropdown>
          <Button
            variant="ghost"
            size="sm"
            aria-label={PROXIMO[passo]}
            title={PROXIMO[passo]}
            icon={<IconChevronRight className="h-4 w-4" />}
            onClick={() => onChange({ periodo, data: navegarRef(data, periodo, 1) })}
          />
          {!noPeriodo(hoje, periodo, data) && (
            <Button variant="secondary" size="sm" onClick={() => onChange({ periodo, data: hoje })}>
              Hoje
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Célula das grades de mês/ano — as MESMAS marcas do mini-mês: o atual (hoje) cheio, o escolhido em accent suave e um
 * ponto onde há dados. */
function CelulaGrade({ rotulo, nome, atual, escolhido, comDados, onClick }: { rotulo: string; nome: string; atual: boolean; escolhido: boolean; comDados: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={nome}
      aria-current={escolhido ? "date" : undefined}
      onClick={onClick}
      className={`relative grid h-11 place-items-center rounded-control text-[12.5px] tabular-nums transition-colors lg:h-8 ${
        atual ? "bg-accent font-bold text-white" : escolhido ? "bg-accent-soft font-semibold text-accent" : "text-text-2 hover:bg-surface-2"
      }`}
    >
      {rotulo}
      {comDados && !atual && <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
    </button>
  );
}

/** Os 12 meses de um ano (‹ ano ›) — escolher um mantém o dia (preso ao fim do mês). */
function GradeMeses({ data, hoje, diasComDados, onEscolher }: { data: string; hoje: string; diasComDados: Set<string>; onEscolher: (d: string) => void }) {
  const anoRef = Number(data.slice(0, 4));
  const mesRef = Number(data.slice(5, 7));
  const [ano, setAno] = useState(anoRef);
  const comDados = new Set([...diasComDados].map((d) => d.slice(0, 7)));
  return (
    <div className="p-1">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" aria-label="Ano anterior" onClick={() => setAno((a) => a - 1)} className={botaoSeta}>
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[12.5px] font-semibold text-text tabular-nums">{ano}</span>
        <button type="button" aria-label="Próximo ano" onClick={() => setAno((a) => a + 1)} className={botaoSeta}>
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {NOMES_MES.map((nome, i) => {
          const chave = `${ano}-${String(i + 1).padStart(2, "0")}`;
          return (
            <CelulaGrade
              key={chave}
              rotulo={nome.slice(0, 3)}
              nome={`${nome} de ${ano}`}
              atual={chave === hoje.slice(0, 7)}
              escolhido={chave === data.slice(0, 7)}
              comDados={comDados.has(chave)}
              onClick={() => onEscolher(navegarRef(data, "mes", (ano - anoRef) * 12 + (i + 1 - mesRef)))}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Os anos com dados (+ o atual e o escolhido) — escolher um mantém o dia e o mês. */
function GradeAnos({ data, hoje, diasComDados, onEscolher }: { data: string; hoje: string; diasComDados: Set<string>; onEscolher: (d: string) => void }) {
  const anoRef = Number(data.slice(0, 4));
  const anoHoje = Number(hoje.slice(0, 4));
  const comDados = new Set([...diasComDados].map((d) => Number(d.slice(0, 4))));
  const anos = [...new Set([...comDados, anoHoje, anoRef])].filter(Number.isFinite).sort((a, b) => a - b);
  return (
    <div className="grid grid-cols-3 gap-1 p-1">
      {anos.map((a) => (
        <CelulaGrade
          key={a}
          rotulo={String(a)}
          nome={String(a)}
          atual={a === anoHoje}
          escolhido={a === anoRef}
          comDados={comDados.has(a)}
          onClick={() => onEscolher(navegarRef(data, "ano", a - anoRef))}
        />
      ))}
    </div>
  );
}
