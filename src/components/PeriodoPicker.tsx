"use client";

import { useState } from "react";
import { Dropdown } from "./Dropdown";
import { IconChevronDown } from "./icons";

// Seletor de período (spec do usuário): presets + ano + grade de meses +
// intervalo (DE/ATÉ). O CORPO (`PeriodoCorpo`) é reutilizável — é o MESMO
// componente usado no filtro de datas das tabelas (DateFilterHeader).
export type Periodo = {
  preset?: "todo" | "hoje" | "semana" | "mes" | "custom";
  ano?: number;
  mes?: number;
  de?: string;
  ate?: string;
};

const PRESETS: { k: NonNullable<Periodo["preset"]>; l: string }[] = [
  { k: "todo", l: "Todo o período" },
  { k: "hoje", l: "Hoje" },
  { k: "semana", l: "Esta semana" },
  { k: "mes", l: "Este mês" },
];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function rotuloPeriodo(v: Periodo): string {
  if (v.de || v.ate) return `${v.de || "…"} – ${v.ate || "…"}`;
  if (v.mes && v.ano) return `${MESES[v.mes - 1]} ${v.ano}`;
  if (v.ano) return String(v.ano);
  return PRESETS.find((p) => p.k === v.preset)?.l ?? "Todo o período";
}

/** Converte um Período em intervalo concreto {de, ate} (ISO local) para filtrar
 * colunas de data das tabelas. "todo" → sem limites. */
export function periodoParaIntervalo(v: Periodo): { de?: string; ate?: string } {
  if (v.de || v.ate) return { de: v.de || undefined, ate: v.ate || undefined };
  const hoje = new Date();
  if (v.preset === "hoje") {
    const d = iso(hoje);
    return { de: d, ate: d };
  }
  if (v.preset === "semana") {
    const ini = new Date(hoje);
    ini.setDate(hoje.getDate() - hoje.getDay());
    const fim = new Date(ini);
    fim.setDate(ini.getDate() + 6);
    return { de: iso(ini), ate: iso(fim) };
  }
  if (v.preset === "mes") {
    return {
      de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
      ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
    };
  }
  if (v.ano && v.mes) {
    return { de: iso(new Date(v.ano, v.mes - 1, 1)), ate: iso(new Date(v.ano, v.mes, 0)) };
  }
  if (v.ano) return { de: `${v.ano}-01-01`, ate: `${v.ano}-12-31` };
  return {};
}

// Corpo reutilizável do seletor de período. Presets fecham o popover; ano/mês/
// intervalo permitem ajuste contínuo. Só componentes/tokens do design system.
export function PeriodoCorpo({
  value = { preset: "todo" },
  anos = [new Date().getFullYear()],
  onChange,
  onClose,
}: {
  value?: Periodo;
  anos?: number[];
  onChange?: (v: Periodo) => void;
  onClose?: () => void;
}) {
  const [ano, setAno] = useState<number>(value.ano ?? anos[0]);
  const emitir = (v: Periodo) => onChange?.(v);
  const opt =
    "rounded-control px-3 py-1.5 text-[13px] font-medium border border-border-2 text-text-2 hover:bg-surface-2";
  const ativo = "bg-accent text-white border-transparent";

  return (
    <div className="p-1">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.k}
            type="button"
            onClick={() => {
              emitir({ preset: p.k });
              onClose?.();
            }}
            className={`rounded-pill px-3 py-1.5 text-[12.5px] font-medium ${
              value.preset === p.k && !value.ano ? ativo : "border border-border-2 text-text-2 hover:bg-surface-2"
            }`}
          >
            {p.l}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Ano</span>
        <div className="flex flex-wrap gap-1.5">
          {anos.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAno(a);
                emitir({ ano: a });
              }}
              className={`${opt} ${value.ano === a && !value.mes ? ativo : ""}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {MESES.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => emitir({ ano, mes: i + 1 })}
            className={`rounded-control px-2 py-1.5 text-[13px] font-medium ${
              value.ano === ano && value.mes === i + 1
                ? ativo
                : "border border-border-2 text-text-2 hover:bg-surface-2"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Intervalo</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted">
            DE
            <input
              type="date"
              value={value.de ?? ""}
              onChange={(e) => emitir({ ...value, preset: "custom", de: e.target.value })}
              className="mt-0.5 h-[var(--h-control-sm)] w-full rounded-control border border-border-2 bg-surface px-2 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>
          <label className="text-[11px] text-muted">
            ATÉ
            <input
              type="date"
              value={value.ate ?? ""}
              onChange={(e) => emitir({ ...value, preset: "custom", ate: e.target.value })}
              className="mt-0.5 h-[var(--h-control-sm)] w-full rounded-control border border-border-2 bg-surface px-2 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export function PeriodoPicker({
  value = { preset: "todo" },
  anos = [new Date().getFullYear()],
  onChange,
}: {
  value?: Periodo;
  anos?: number[];
  onChange?: (v: Periodo) => void;
}) {
  return (
    <Dropdown
      ariaLabel="Período"
      triggerClassName="gap-1.5 rounded-chip border border-border-2 bg-surface px-3 h-[var(--h-control-sm)] text-[13px] font-medium text-text-2 hover:bg-surface-2"
      trigger={
        <>
          <span className="truncate">{rotuloPeriodo(value)}</span>
          <IconChevronDown className="h-3.5 w-3.5 opacity-60" />
        </>
      }
      width={300}
    >
      {(close) => <PeriodoCorpo value={value} anos={anos} onChange={onChange} onClose={close} />}
    </Dropdown>
  );
}
