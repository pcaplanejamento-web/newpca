"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import { parseNumberBR } from "@/lib/normalize";
import { type FaixaValor, indiceNoDominio, normalizarFaixa } from "@/lib/tabela-filtros";
import { Dropdown } from "./Dropdown";
import { Checkbox } from "./Field";
import { GatilhoFiltro } from "./GatilhoFiltro";
import { IconArrowDown, IconArrowUp } from "./icons";

/**
 * Filtro de FAIXA para colunas de VALORES (R$) no cabeçalho da tabela: ordenar (crescente/
 * decrescente), **barra de arrasto horizontal** com duas alças (do MENOR ao MAIOR valor mostrado —
 * o domínio já vem FACETADO pelos demais filtros da tabela), campos de mínimo/máximo digitáveis e o
 * **"Valor cheio"** (a faixa inteira = sem filtro): arrastar a barra DESMARCA o "Valor cheio"; marcá-lo
 * LIMPA a barra. A barra anda pelos valores EXISTENTES (cada passo = um valor distinto), então funciona
 * bem mesmo com valores muito desiguais. Emite `{min,max}` ou `null` (sem filtro). Toque: alças grandes.
 */
export function RangeFilterHeader({
  label,
  dominio,
  value,
  onApply,
  onSort,
  sortDir = null,
  align = "end",
  marcado = false,
  formatar = brl,
}: {
  label: string;
  /** Valores distintos e ORDENADOS das linhas que passam nos demais filtros. */
  dominio: number[];
  value?: FaixaValor;
  onApply: (f: FaixaValor | null) => void;
  onSort?: (dir: "asc" | "desc") => void;
  sortDir?: "asc" | "desc" | null;
  align?: "start" | "end";
  /** Coluna filtrada — tópico marcado. */
  marcado?: boolean;
  formatar?: (n: number) => string;
}) {
  return (
    <Dropdown
      align={align}
      ariaLabel={`Filtrar ${label}`}
      triggerClassName="w-full gap-1.5 px-1 py-2"
      panelClassName="p-0"
      width={312}
      trigger={<GatilhoFiltro label={label} sortDir={sortDir} marcado={marcado} />}
    >
      {(close) => (
        <PainelFaixa
          dominio={dominio}
          value={value}
          formatar={formatar}
          onApply={(f) => {
            onApply(f);
            close();
          }}
          onCancel={close}
          onSort={
            onSort
              ? (d) => {
                  onSort(d);
                  close();
                }
              : undefined
          }
        />
      )}
    </Dropdown>
  );
}

/** Texto editável de um limite (pt-BR, 2 casas). */
const txt = (n: number | undefined) => (n == null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function PainelFaixa({
  dominio,
  value,
  formatar,
  onApply,
  onCancel,
  onSort,
}: {
  dominio: number[];
  value?: FaixaValor;
  formatar: (n: number) => string;
  onApply: (f: FaixaValor | null) => void;
  onCancel: () => void;
  onSort?: (dir: "asc" | "desc") => void;
}) {
  const n = dominio.length;
  const menor = dominio[0];
  const maior = dominio[n - 1];
  // Limites da seleção (números); a barra deriva deles. Sem filtro = a faixa inteira ("valor cheio").
  const [min, setMin] = useState<number | undefined>(value?.min ?? menor);
  const [max, setMax] = useState<number | undefined>(value?.max ?? maior);
  const [cheio, setCheio] = useState(value?.min == null && value?.max == null);
  const [minTxt, setMinTxt] = useState(txt(value?.min ?? menor));
  const [maxTxt, setMaxTxt] = useState(txt(value?.max ?? maior));

  const lo = indiceNoDominio(dominio, min, "min");
  const hi = Math.max(lo, indiceNoDominio(dominio, max, "max"));
  const pct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 0);
  const naFaixa = n === 0 ? 0 : hi - lo + 1;

  /** Arrastar a barra: DESMARCA o "valor cheio" (a barra representa o mínimo/máximo inicial). */
  function arrastar(lado: "min" | "max", i: number) {
    setCheio(false);
    if (lado === "min") {
      const v = dominio[Math.min(i, hi)];
      setMin(v);
      setMinTxt(txt(v));
    } else {
      const v = dominio[Math.max(i, lo)];
      setMax(v);
      setMaxTxt(txt(v));
    }
  }
  /** Marcar o "valor cheio" LIMPA a barra (volta à faixa inteira). */
  function marcarCheio(v: boolean) {
    setCheio(v);
    if (v) {
      setMin(menor);
      setMax(maior);
      setMinTxt(txt(menor));
      setMaxTxt(txt(maior));
    }
  }
  /** Limite digitado (confirma ao sair do campo/Enter). */
  function digitar(lado: "min" | "max", s: string) {
    const v = parseNumberBR(s) ?? undefined;
    setCheio(false);
    if (lado === "min") {
      setMin(v);
      setMinTxt(txt(v));
    } else {
      setMax(v);
      setMaxTxt(txt(v));
    }
  }

  const btn = "flex-1 rounded-control border border-border-2 px-2 py-1.5 text-[12px] font-semibold";
  const campo =
    "h-[var(--h-control-sm)] w-full rounded-control border border-border-2 bg-surface px-2.5 text-right text-[13px] tabular-nums text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <div className="flex w-full flex-col">
      {onSort && (
        <div className="flex gap-2 p-2">
          <button type="button" onClick={() => onSort("asc")} className={`${btn} inline-flex items-center justify-center gap-1 text-text-2 hover:bg-surface-2`}>
            <IconArrowUp className="h-3.5 w-3.5" /> Crescente
          </button>
          <button type="button" onClick={() => onSort("desc")} className={`${btn} inline-flex items-center justify-center gap-1 text-text-2 hover:bg-surface-2`}>
            <IconArrowDown className="h-3.5 w-3.5" /> Decrescente
          </button>
        </div>
      )}

      <div className="border-y border-border px-3 py-2.5">
        <Checkbox label="Valor cheio" checked={cheio} onChange={(e) => marcarCheio(e.target.checked)} />
      </div>

      {n === 0 ? (
        <p className="px-3 py-4 text-center text-[12px] text-faint">Nenhum valor nesta coluna com os filtros atuais.</p>
      ) : (
        <div className="px-3 pb-2 pt-3">
          <div className="flex items-baseline justify-between gap-2 text-[12px] font-semibold tabular-nums text-text">
            <span>{formatar(dominio[lo])}</span>
            <span className="text-faint">—</span>
            <span>{formatar(dominio[hi])}</span>
          </div>
          {/* Barra de arrasto: trilho + trecho selecionado + duas alças (inputs range sobrepostos). */}
          <div className="faixa-dupla">
            {/* O centro da alça anda de 12px a (100% − 12px): trilho e trecho seguem o mesmo recuo. */}
            <div className="pointer-events-none absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-track" />
            <div
              className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
              style={{
                left: `calc(12px + (100% - 24px) * ${pct(lo) / 100})`,
                right: `calc(12px + (100% - 24px) * ${(100 - pct(hi)) / 100})`,
                background: cheio ? "var(--border-2)" : "var(--accent)",
              }}
            />
            <input
              type="range"
              aria-label="Valor mínimo"
              aria-valuetext={formatar(dominio[lo])}
              min={0}
              max={Math.max(0, n - 1)}
              step={1}
              value={lo}
              disabled={n < 2}
              onChange={(e) => arrastar("min", Number(e.target.value))}
              // Alças encostadas no fim: a do mínimo fica por cima (senão não dá para puxá-la de volta).
              style={{ zIndex: lo >= n - 1 || lo > (n - 1) / 2 ? 3 : 2 }}
            />
            <input
              type="range"
              aria-label="Valor máximo"
              aria-valuetext={formatar(dominio[hi])}
              min={0}
              max={Math.max(0, n - 1)}
              step={1}
              value={hi}
              disabled={n < 2}
              onChange={(e) => arrastar("max", Number(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
              Mín.
              <input
                inputMode="decimal"
                className={campo}
                value={minTxt}
                onChange={(e) => setMinTxt(e.target.value)}
                onBlur={(e) => digitar("min", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && digitar("min", (e.target as HTMLInputElement).value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
              Máx.
              <input
                inputMode="decimal"
                className={campo}
                value={maxTxt}
                onChange={(e) => setMaxTxt(e.target.value)}
                onBlur={(e) => digitar("max", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && digitar("max", (e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            {cheio ? `Todos os ${n} valores` : `${naFaixa} de ${n} valores na faixa`}
          </p>
        </div>
      )}

      <div className="flex gap-2 border-t border-border p-2">
        <button
          type="button"
          onClick={() => onApply(cheio ? null : normalizarFaixa({ min, max }, dominio))}
          className="flex-1 rounded-control bg-accent px-2 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Aplicar
        </button>
        <button type="button" onClick={onCancel} className={`${btn} text-text-2 hover:bg-surface-2`}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onApply(null)}
          className="rounded-control px-2 py-1.5 text-[12px] font-semibold text-[color:var(--sit-cancelado)] hover:bg-surface-2"
        >
          Remover
        </button>
      </div>
    </div>
  );
}
