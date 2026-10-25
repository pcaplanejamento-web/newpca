"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ATALHOS_PERIODO,
  intervaloDoPeriodo,
  limitesDosMeses,
  MESES_PERIODO,
  mesesDisponiveis,
  PERIODO_TODO,
  type Periodo,
  rotuloPeriodo,
} from "@/lib/periodo";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { IconLimpar } from "./icons";
import { SetaDropdown } from "./SetaDropdown";

// Seletor de período (spec do usuário): cabeçalho com Limpar + atalhos + ano + grade de meses + intervalo (DE/ATÉ). O CORPO
// (`PeriodoCorpo`) é reutilizável — é o MESMO do filtro de datas das tabelas (DateFilterHeader, que soma a ordenação) e
// do `PeriodoPicker` (sem ordenação). A conversão em datas é pura: `intervaloDoPeriodo` (`@/lib/periodo`).

/** A PEÇA padrão do painel (atalho, ano, mês, campo de data e a ordenação do filtro das tabelas): a mesma altura (44px no
 * toque, a dos controles no desktop), o raio dos controles, a borda e o foco do sistema. */
export const PECA_PERIODO =
  "flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-control border px-2 text-[13px] font-medium transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)]";
export const PECA_LIVRE = "border-border-2 bg-surface text-text-2 hover:bg-surface-2";
const MARCADA = "border-transparent bg-accent text-white";
/** O ano do mês escolhido: contorno accent (mostra a qual ano o mês pertence). */
const CONTEM = "border-accent bg-surface text-accent hover:bg-surface-2";
const DESLIGADA = "cursor-not-allowed border-border bg-surface-2/40 text-faint";
const TITULO = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";
const campoData = `${PECA_PERIODO} w-full justify-start bg-surface text-text border-border-2 font-normal`;

/** Corpo reutilizável do seletor de período: o cabeçalho (o período escolhido + Limpar em ícone), os atalhos, o ano, os
 * meses do ano e o intervalo — tudo CONECTADO: `meses` ("AAAA-MM", os que têm dado) decide quais meses do ano marcado são
 * escolhíveis (`mesesDisponiveis`; sem dado no ano, até o mês de hoje) e limita o DE/ATÉ (`limitesDosMeses`). Os atalhos
 * fecham o painel; ano/mês/intervalo permitem ajuste contínuo. `autoFoco` = leva o foco à opção marcada (painel aberto
 * pelo teclado). Só componentes/tokens do design system. */
export function PeriodoCorpo({
  value = PERIODO_TODO,
  anos = [new Date().getFullYear()],
  meses,
  onChange,
  onClose,
  onLimpar,
  autoFoco = false,
}: {
  value?: Periodo;
  anos?: number[];
  meses?: readonly string[];
  onChange?: (v: Periodo) => void;
  onClose?: () => void;
  onLimpar?: () => void;
  autoFoco?: boolean;
}) {
  // O ano aberto: o do valor; senão o mais recente com algum mês escolhível.
  const [ano, setAno] = useState<number>(
    () => value.ano ?? anos.find((a) => mesesDisponiveis(a, meses).some(Boolean)) ?? anos[0] ?? new Date().getFullYear(),
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFoco) return;
    const el = ref.current;
    (el?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? el?.querySelector<HTMLElement>("[aria-pressed]:not(:disabled)"))?.focus({
      preventScroll: true,
    });
  }, [autoFoco]);
  const emitir = (v: Periodo) => onChange?.(v);
  // O intervalo substitui o atalho/ano/mês (apagar o DE não volta ao mês); os dois vazios = todo o período.
  const intervalo = (campo: "de" | "ate", data: string) => {
    const de = campo === "de" ? data : (value.de ?? "");
    const ate = campo === "ate" ? data : (value.ate ?? "");
    emitir(de || ate ? { preset: "custom", ...(de ? { de } : {}), ...(ate ? { ate } : {}) } : PERIODO_TODO);
  };
  const disponiveis = useMemo(() => mesesDisponiveis(ano, meses), [ano, meses]);
  const lim = useMemo(() => limitesDosMeses(meses), [meses]);
  const escolhido = Object.keys(intervaloDoPeriodo(value)).length > 0;

  return (
    <div ref={ref} className="space-y-3 p-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Período</span>
          <span className="block truncate text-[14px] font-semibold text-text">{rotuloPeriodo(value)}</span>
        </div>
        {onLimpar && (
          <Button
            variant="icon"
            size="xs"
            icon={<IconLimpar className="h-4 w-4" />}
            aria-label="Limpar período"
            title={escolhido ? "Limpar período" : "Nenhum período escolhido"}
            disabled={!escolhido}
            onClick={onLimpar}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-3">
        {ATALHOS_PERIODO.map((p) => {
          const marcado = value.preset === p.k && !value.ano;
          return (
            <button
              key={p.k}
              type="button"
              aria-pressed={marcado}
              onClick={() => {
                emitir({ preset: p.k });
                onClose?.();
              }}
              className={`${PECA_PERIODO} ${marcado ? MARCADA : PECA_LIVRE}`}
            >
              <span className="truncate">{p.l}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-border pt-3">
        <span className={TITULO}>Ano</span>
        <div className="grid grid-cols-4 gap-1.5">
          {anos.map((a) => {
            const marcado = value.ano === a && !value.mes;
            const contem = value.ano === a && !!value.mes;
            return (
              <button
                key={a}
                type="button"
                aria-pressed={marcado}
                onClick={() => {
                  setAno(a);
                  emitir({ ano: a });
                }}
                className={`${PECA_PERIODO} tabular-nums ${marcado ? MARCADA : contem || (a === ano && !value.ano) ? CONTEM : PECA_LIVRE}`}
              >
                {a}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {MESES_PERIODO.map((m, i) => {
            const marcado = value.ano === ano && value.mes === i + 1;
            const pode = marcado || disponiveis[i];
            return (
              <button
                key={m}
                type="button"
                aria-pressed={marcado}
                aria-label={`${m} de ${ano}`}
                title={pode ? `${m} de ${ano}` : `Sem dados em ${m} ${ano}`}
                disabled={!pode}
                onClick={() => emitir({ ano, mes: i + 1 })}
                className={`${PECA_PERIODO} ${marcado ? MARCADA : pode ? PECA_LIVRE : DESLIGADA}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <span className={TITULO}>Intervalo</span>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="min-w-0 text-[11px] font-medium text-muted">
            <span className="mb-1 block">De</span>
            <input
              type="date"
              value={value.de ?? ""}
              min={lim.min}
              max={value.ate || lim.max}
              onChange={(e) => intervalo("de", e.target.value)}
              className={campoData}
            />
          </label>
          <label className="min-w-0 text-[11px] font-medium text-muted">
            <span className="mb-1 block">Até</span>
            <input
              type="date"
              value={value.ate ?? ""}
              min={value.de || lim.min}
              max={lim.max}
              onChange={(e) => intervalo("ate", e.target.value)}
              className={campoData}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * SELETOR DE PERÍODO — o gatilho no visual do `SelectField compacto` ("Período" + o valor + a seta; 44px no toque) e o
 * `PeriodoCorpo` num painel (`dialog`), sem ordenação. Escolher um atalho, "Limpar" ou Esc fecham e devolvem o foco ao
 * gatilho; aberto pelo teclado, o foco vai à opção marcada. `className` = o invólucro (ex.: largura cheia no celular).
 */
export function PeriodoPicker({
  value = PERIODO_TODO,
  anos = [new Date().getFullYear()],
  meses,
  onChange,
  rotulo = "Período",
  className,
}: {
  value?: Periodo;
  anos?: number[];
  /** Os meses com dado ("AAAA-MM") — o painel só oferece estes (ver `PeriodoCorpo`). */
  meses?: readonly string[];
  onChange?: (v: Periodo) => void;
  rotulo?: string;
  className?: string;
}) {
  const texto = rotuloPeriodo(value);
  return (
    <Dropdown
      papel="dialog"
      ariaLabel={`${rotulo}: ${texto}`}
      className={className}
      width={320}
      triggerClassName="h-11 w-full gap-1.5 rounded-control border border-border-2 bg-surface-2 px-3 text-left transition-colors hover:bg-surface lg:h-[var(--h-control-sm)]"
      trigger={
        <>
          <span className="shrink-0 text-[12px] text-muted">{rotulo}</span>
          <span className="min-w-0 truncate text-[13px] font-semibold text-text">{texto}</span>
          <SetaDropdown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />
        </>
      }
    >
      {(fechar, { teclado }) => (
        // Fechar (atalho, Limpar, Esc) devolve o foco ao gatilho — o Dropdown cuida.
        <PeriodoCorpo
          value={value}
          anos={anos}
          meses={meses}
          onChange={onChange}
          onClose={fechar}
          onLimpar={
            onChange
              ? () => {
                  onChange(PERIODO_TODO);
                  fechar();
                }
              : undefined
          }
          autoFoco={teclado}
        />
      )}
    </Dropdown>
  );
}
