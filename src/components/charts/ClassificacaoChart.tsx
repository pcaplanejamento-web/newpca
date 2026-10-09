"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, type PieSectorDataItem, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { brl, brlCompact, num, pct } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { Fatia } from "@/lib/queries";
import { ChartEmpty, corSerie, useChartTokens } from "./shared";

const TOP = 8;

/**
 * Rosca da CLASSIFICAÇÃO. `onSelecionar`: tocar na fatia/legenda devolve o recorte (o Dashboard o usa como FILTRO
 * cruzado). `ativos` = os rótulos filtrados (as demais fatias esmaecem); `corDe` = o índice da cor de cada rótulo — a cor
 * da categoria fica a MESMA com ou sem filtro.
 */
export function ClassificacaoChart({
  data,
  onSelecionar,
  ativos,
  corDe,
}: {
  data: Fatia[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativos?: string[];
  corDe?: (label: string) => number;
}) {
  const tk = useChartTokens();
  const [foco, setFoco] = useState<number | null>(null);
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, TOP);
  const rest = sorted.slice(TOP);
  const restAgg = rest.reduce((s, r) => ({ total: s.total + r.total, count: s.count + r.count }), { total: 0, count: 0 });
  const slices: Fatia[] = rest.length ? [...top, { label: `Outros (${rest.length})`, ...restAgg }] : top;
  const total = slices.reduce((s, r) => s + r.total, 0);
  if (!total) return <ChartEmpty />;
  const rotulos = (i: number) => (i < top.length ? [top[i].label] : rest.map((r) => r.label));
  const marcados = new Set(ativos ?? []);
  const ativa = (i: number) => marcados.size === 0 || rotulos(i).some((l) => marcados.has(l));
  const indice = (i: number) => (i < top.length ? (corDe?.(top[i].label) ?? i) : -1);
  const cor = (i: number) => (indice(i) < 0 ? tk.axis : tk.serie[indice(i) % tk.serie.length]);
  const corCss = (i: number) => (indice(i) < 0 ? "var(--faint)" : corSerie(indice(i)));
  const selecionar = onSelecionar ? (i: number) => onSelecionar({ dim: "classificacao", labels: rotulos(i) }, slices[i].label) : undefined;
  // O CENTRO da rosca: a fatia em foco (mouse/foco na legenda) ou, sem foco, o total.
  const emFoco = foco != null ? slices[foco] : null;

  return (
    <div className="grid items-center gap-4 sm:grid-cols-2">
      <div className="relative h-56">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="label"
              innerRadius={58}
              outerRadius={86}
              paddingAngle={2}
              cornerRadius={4}
              stroke="none"
              animationDuration={700}
              animationEasing="ease-out"
              activeShape={(p: PieSectorDataItem) => (
                <Sector {...p} outerRadius={(p.outerRadius ?? 86) + 7} innerRadius={(p.innerRadius ?? 58) - 2} />
              )}
              onMouseEnter={(_, i) => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
              onClick={selecionar ? (_, i) => selecionar(i) : undefined}
              className={selecionar ? "cursor-pointer outline-none" : "outline-none"}
            >
              {slices.map((_, i) => (
                <Cell
                  key={i}
                  fill={cor(i)}
                  fillOpacity={ativa(i) ? (foco == null || foco === i ? 1 : 0.55) : 0.22}
                  style={{ transition: "fill-opacity 0.25s ease" }}
                />
              ))}
            </Pie>
            {/* Sem caixa de dica (o centro da rosca mostra a fatia) — só liga o realce da fatia ativa. */}
            <Tooltip content={() => null} cursor={false} />
          </PieChart>
        </ResponsiveContainer>
        <div aria-live="polite" className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div key={emFoco?.label ?? "total"} className="animate-fade-in-up max-w-[7.5rem]">
            <div className="truncate text-[11px] text-muted">{emFoco ? emFoco.label : "Total"}</div>
            <div className="text-lg font-bold leading-tight text-text tabular-nums">{brlCompact(emFoco ? emFoco.total : total)}</div>
            <div className="text-[11px] text-faint tabular-nums">
              {emFoco ? `${pct(emFoco.total, total)} · ${num(emFoco.count)} itens` : `${num(slices.reduce((t, f) => t + f.count, 0))} itens`}
            </div>
          </div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {slices.map((s, i) => {
          const marcada = marcados.size > 0 && ativa(i);
          const conteudo = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corCss(i), opacity: ativa(i) ? 1 : 0.35 }} />
              <span className={`flex-1 truncate text-left ${ativa(i) ? "text-text-2" : "text-faint"}`} title={s.label}>
                {s.label}
              </span>
              <span className={`shrink-0 font-medium tabular-nums ${ativa(i) ? "text-text" : "text-faint"}`}>{pct(s.total, total)}</span>
            </>
          );
          return (
            <li key={i} className="text-xs">
              {selecionar ? (
                // Legenda = botão de filtro (alternar): alvo de 44px no toque, acessível por teclado; o foco/mouse
                // mostra a fatia no centro da rosca.
                <button
                  type="button"
                  onClick={() => selecionar(i)}
                  onMouseEnter={() => setFoco(i)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(i)}
                  onBlur={() => setFoco(null)}
                  aria-pressed={marcada}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-control px-1.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent sm:min-h-8 ${
                    marcada ? "bg-accent-soft" : ""
                  }`}
                  title={`${s.label}: ${brl(s.total)} · ${num(s.count)} itens — ${marcada ? "tirar o filtro" : "filtrar o Dashboard"}`}
                >
                  {conteudo}
                </button>
              ) : (
                <div className="flex items-center gap-2">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
