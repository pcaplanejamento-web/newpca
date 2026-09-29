"use client";

import { useEffect, useRef, useState } from "react";
import { ATALHOS_PERIODO, MESES_PERIODO, PERIODO_TODO, type Periodo, rotuloPeriodo } from "@/lib/periodo";
import { Dropdown } from "./Dropdown";
import { IconChevronDown } from "./icons";

// Seletor de período (spec do usuário): atalhos + ano + grade de meses + intervalo (DE/ATÉ) + Limpar. O CORPO
// (`PeriodoCorpo`) é reutilizável — é o MESMO do filtro de datas das tabelas (DateFilterHeader, que soma a ordenação) e
// do `PeriodoPicker` (sem ordenação). A conversão em datas é pura: `intervaloDoPeriodo` (`@/lib/periodo`).

const campoData =
  "mt-0.5 h-11 w-full rounded-control border border-border-2 bg-surface px-2 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)]";

/** Corpo reutilizável do seletor de período. Os atalhos fecham o painel; ano/mês/intervalo permitem ajuste contínuo.
 * `onLimpar` = o link "Limpar" no pé; `autoFoco` = leva o foco à opção marcada (painel aberto pelo teclado). Alvos de
 * 44px no toque (abaixo do `lg`). Só componentes/tokens do design system. */
export function PeriodoCorpo({
  value = PERIODO_TODO,
  anos = [new Date().getFullYear()],
  onChange,
  onClose,
  onLimpar,
  autoFoco = false,
}: {
  value?: Periodo;
  anos?: number[];
  onChange?: (v: Periodo) => void;
  onClose?: () => void;
  onLimpar?: () => void;
  autoFoco?: boolean;
}) {
  const [ano, setAno] = useState<number>(value.ano ?? anos[0] ?? new Date().getFullYear());
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFoco) return;
    const el = ref.current;
    (el?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? el?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
  }, [autoFoco]);
  const emitir = (v: Periodo) => onChange?.(v);
  // O intervalo substitui o atalho/ano/mês (apagar o DE não volta ao mês); os dois vazios = todo o período.
  const intervalo = (campo: "de" | "ate", data: string) => {
    const de = campo === "de" ? data : (value.de ?? "");
    const ate = campo === "ate" ? data : (value.ate ?? "");
    emitir(de || ate ? { preset: "custom", ...(de ? { de } : {}), ...(ate ? { ate } : {}) } : PERIODO_TODO);
  };
  const opt = "min-h-11 rounded-control px-3 py-1.5 text-[13px] font-medium border lg:min-h-0";
  const ativo = "bg-accent text-white border-transparent";
  const inativo = "border-border-2 text-text-2 hover:bg-surface-2";

  return (
    <div ref={ref} className="p-1">
      <div className="flex flex-wrap gap-1.5">
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
              className={`min-h-11 rounded-pill border px-3 py-1.5 text-[12.5px] font-medium lg:min-h-0 ${marcado ? ativo : inativo}`}
            >
              {p.l}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Ano</span>
        <div className="flex flex-wrap gap-1.5">
          {anos.map((a) => {
            const marcado = value.ano === a && !value.mes;
            return (
              <button
                key={a}
                type="button"
                aria-pressed={marcado}
                onClick={() => {
                  setAno(a);
                  emitir({ ano: a });
                }}
                className={`${opt} ${marcado ? ativo : inativo}`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {MESES_PERIODO.map((m, i) => {
          const marcado = value.ano === ano && value.mes === i + 1;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={marcado}
              aria-label={`${m} de ${ano}`}
              onClick={() => emitir({ ano, mes: i + 1 })}
              className={`min-h-11 rounded-control border px-2 py-1.5 text-[13px] font-medium lg:min-h-0 ${marcado ? ativo : inativo}`}
            >
              {m}
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Intervalo</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted">
            DE
            <input type="date" value={value.de ?? ""} max={value.ate || undefined} onChange={(e) => intervalo("de", e.target.value)} className={campoData} />
          </label>
          <label className="text-[11px] text-muted">
            ATÉ
            <input type="date" value={value.ate ?? ""} min={value.de || undefined} onChange={(e) => intervalo("ate", e.target.value)} className={campoData} />
          </label>
        </div>
      </div>

      {onLimpar && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={onLimpar}
            className="inline-flex min-h-11 items-center rounded-control px-2 text-[12px] font-semibold text-accent hover:underline lg:min-h-0 lg:py-1"
          >
            Limpar
          </button>
        </div>
      )}
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
  onChange,
  rotulo = "Período",
  className,
}: {
  value?: Periodo;
  anos?: number[];
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
      width={300}
      triggerClassName="h-11 w-full gap-1.5 rounded-control border border-border-2 bg-surface-2 px-3 text-left transition-colors hover:bg-surface lg:h-[var(--h-control-sm)]"
      trigger={
        <>
          <span className="shrink-0 text-[12px] text-muted">{rotulo}</span>
          <span className="min-w-0 truncate text-[13px] font-semibold text-text">{texto}</span>
          <IconChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />
        </>
      }
    >
      {(fechar, { teclado }) => (
        // Fechar (atalho, Limpar, Esc) devolve o foco ao gatilho — o Dropdown cuida.
        <PeriodoCorpo
          value={value}
          anos={anos}
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
