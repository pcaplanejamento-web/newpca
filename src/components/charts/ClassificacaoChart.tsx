"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Fatia } from "@/lib/queries";
import { brl, num, pct } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import { CHART_COLORS, ChartEmpty, TooltipBox } from "./shared";

const TOP = 8;

/** `onSelecionar` (opcional): clicar numa fatia/legenda abre a ORIGEM dos dados daquele recorte. */
export function ClassificacaoChart({ data, onSelecionar }: { data: Fatia[]; onSelecionar?: (r: RecorteDash, rotulo: string) => void }) {
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, TOP);
  const rest = sorted.slice(TOP);
  const restAgg = rest.reduce(
    (s, r) => ({ total: s.total + r.total, count: s.count + r.count }),
    { total: 0, count: 0 },
  );
  const slices: Fatia[] = rest.length
    ? [...top, { label: `Outros (${rest.length})`, ...restAgg }]
    : top;

  const total = slices.reduce((s, r) => s + r.total, 0);
  if (!total) return <ChartEmpty />;
  // A fatia "Outros" leva TODOS os rótulos agregados nela.
  const selecionar = onSelecionar
    ? (i: number) => onSelecionar({ dim: "classificacao", labels: i < top.length ? [top[i].label] : rest.map((r) => r.label) }, slices[i].label)
    : undefined;

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
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
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
          const conteudo = (
            <>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="flex-1 truncate text-left text-text-2" title={s.label}>
                {s.label}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-text">
                {pct(s.total, total)}
              </span>
            </>
          );
          return (
            <li key={i} className="text-xs">
              {selecionar ? (
                // Legenda clicável: alvo ≥ 44px no toque, acessível por teclado.
                <button
                  type="button"
                  onClick={() => selecionar(i)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-control px-1.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent sm:min-h-8"
                  title={`Ver a origem dos dados: ${s.label}`}
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
