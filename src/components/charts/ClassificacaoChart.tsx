"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { brl, num, pct } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { Fatia } from "@/lib/queries";
import { ChartEmpty, corSerie, TooltipBox, useChartTokens } from "./shared";

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

  return (
    <div className="grid items-center gap-4 sm:grid-cols-2">
      <div className="relative h-56">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="label"
              innerRadius={54}
              outerRadius={84}
              paddingAngle={2}
              stroke="none"
              onClick={selecionar ? (_, i) => selecionar(i) : undefined}
              className={selecionar ? "cursor-pointer" : undefined}
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={cor(i)} fillOpacity={ativa(i) ? 1 : 0.28} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const s = payload[0].payload as Fatia;
                return (
                  <TooltipBox>
                    <div className="font-semibold text-text">{s.label}</div>
                    <div className="text-muted">
                      {brl(s.total)} · {num(s.count)} itens · {pct(s.total, total)}
                    </div>
                  </TooltipBox>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
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
                // Legenda = botão de filtro (alternar): alvo de 44px no toque, acessível por teclado.
                <button
                  type="button"
                  onClick={() => selecionar(i)}
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
