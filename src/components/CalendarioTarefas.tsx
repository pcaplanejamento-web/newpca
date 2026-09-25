"use client";

import { useMemo, useState } from "react";
import { dataBR, num } from "@/lib/format";
import {
  COR_ESTADO_PRAZO,
  estadoPrazo,
  gradeMes,
  NOMES_MES,
  ROTULO_ESTADO_PRAZO,
  rotuloTicket,
  type TarefaResumo,
  tarefasPorPrazo,
} from "@/lib/tarefas-core";
import { Button } from "./Button";
import { IconChevronLeft, IconChevronRight, IconRepetir } from "./icons";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** Quantos cartões cabem num dia antes do "+N". */
const POR_DIA = 3;

/** Um cartão resumido no dia: ticket + título, na cor do semáforo do prazo; tocar abre o detalhe. */
function CartaoDia({ t, hoje, onAbrir }: { t: TarefaResumo; hoje: string; onAbrir: (id: number) => void }) {
  const e = estadoPrazo(t.prazo, hoje, t.concluidaEm != null);
  return (
    <button
      type="button"
      onClick={() => onAbrir(t.id)}
      title={`${rotuloTicket(t.ticket)} ${t.titulo} — ${ROTULO_ESTADO_PRAZO[e]}`}
      className={`flex min-h-11 w-full items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[11.5px] leading-tight text-text transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-6 ${
        t.concluidaEm ? "text-muted line-through decoration-faint" : ""
      }`}
      style={{ boxShadow: `inset 3px 0 0 ${COR_ESTADO_PRAZO[e]}` }}
    >
      <span className="shrink-0 pl-1 font-mono text-[10.5px] text-faint">{rotuloTicket(t.ticket)}</span>
      <span className="truncate">{t.titulo}</span>
      {t.recorrencia && <IconRepetir aria-label="Recorrente" className="ml-auto h-3 w-3 shrink-0 text-faint" />}
    </button>
  );
}

/**
 * CALENDÁRIO das tarefas pelo PRAZO: o mês em grade (domingo → sábado; hoje marcado; cada cartão com a faixa na cor do
 * semáforo; "+N" abre o dia inteiro) com ← / → e "Hoje". No celular vira a AGENDA do mês (os dias com tarefas, em
 * lista). Recebe as tarefas JÁ FILTRADAS (os mesmos filtros do quadro); as sem prazo são só contadas.
 */
export function CalendarioTarefas({ tarefas, hoje, onAbrir }: { tarefas: TarefaResumo[]; hoje: string; onAbrir: (id: number) => void }) {
  const [mes, setMes] = useState(() => ({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }));
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const grade = useMemo(() => gradeMes(mes.ano, mes.mes), [mes]);
  const porDia = useMemo(() => tarefasPorPrazo(tarefas), [tarefas]);
  const semPrazo = tarefas.filter((t) => !t.prazo).length;
  const prefixo = `${mes.ano}-${String(mes.mes).padStart(2, "0")}`;
  const diasComTarefa = grade.flat().filter((d) => d.startsWith(prefixo) && porDia.has(d));
  const andar = (d: -1 | 1) => {
    setDiaAberto(null);
    setMes((m) => {
      const n = m.mes + d;
      return n < 1 ? { ano: m.ano - 1, mes: 12 } : n > 12 ? { ano: m.ano + 1, mes: 1 } : { ano: m.ano, mes: n };
    });
  };

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="icon" size="sm" aria-label="Mês anterior" icon={<IconChevronLeft className="h-4 w-4" />} onClick={() => andar(-1)} />
        <h2 className="min-w-[10rem] text-center text-[15px] font-semibold text-text">
          {NOMES_MES[mes.mes - 1]} {mes.ano}
        </h2>
        <Button variant="icon" size="sm" aria-label="Próximo mês" icon={<IconChevronRight className="h-4 w-4" />} onClick={() => andar(1)} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDiaAberto(null);
            setMes({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) });
          }}
        >
          Hoje
        </Button>
        {semPrazo > 0 && <span className="ml-auto text-[12px] text-muted">{num(semPrazo)} sem prazo (fora do calendário)</span>}
      </div>

      {/* Desktop/tablet: a grade do mês. */}
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface sm:block">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="py-1.5 text-center text-[11px] font-semibold text-muted">
              {d}
            </div>
          ))}
        </div>
        {grade.map((semana) => (
          <div key={semana[0]} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {semana.map((d) => {
              const lista = porDia.get(d) ?? [];
              const doMes = d.startsWith(prefixo);
              const aberto = diaAberto === d;
              const visiveis = aberto ? lista : lista.slice(0, POR_DIA);
              return (
                <div key={d} className={`min-h-28 space-y-0.5 border-r border-border p-1 last:border-r-0 ${doMes ? "" : "bg-surface-2/60"}`}>
                  <div className="flex justify-end px-1">
                    <span
                      className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11.5px] tabular-nums ${
                        d === hoje ? "bg-accent font-bold text-white" : doMes ? "text-text-2" : "text-faint"
                      }`}
                    >
                      {Number(d.slice(8))}
                    </span>
                  </div>
                  {visiveis.map((t) => (
                    <CartaoDia key={t.id} t={t} hoje={hoje} onAbrir={onAbrir} />
                  ))}
                  {lista.length > POR_DIA && (
                    <button
                      type="button"
                      onClick={() => setDiaAberto(aberto ? null : d)}
                      className="w-full rounded-[6px] px-1.5 py-0.5 text-left text-[11px] font-semibold text-accent hover:bg-surface-2"
                    >
                      {aberto ? "Menos" : `+${lista.length - POR_DIA}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Celular: a agenda do mês (só os dias com tarefas). */}
      <div className="space-y-3 sm:hidden">
        {diasComTarefa.length === 0 && <p className="rounded-card border border-dashed border-border-2 bg-surface px-4 py-8 text-center text-sm text-muted">Nenhuma tarefa com prazo neste mês.</p>}
        {diasComTarefa.map((d) => (
          <section key={d} className="rounded-card border border-border bg-surface p-2">
            <h3 className={`mb-1 px-1 text-[12px] font-semibold ${d === hoje ? "text-accent" : "text-text-2"}`}>
              {DIAS_SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]}, {dataBR(d)}
              {d === hoje ? " · hoje" : ""}
            </h3>
            {(porDia.get(d) ?? []).map((t) => (
              <CartaoDia key={t.id} t={t} hoje={hoje} onAbrir={onAbrir} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
