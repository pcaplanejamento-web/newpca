"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TopItem } from "@/lib/queries";
import { brl, brlCompact, dec } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import { CHART_COLORS, ChartEmpty, TooltipBox, useChartTokens } from "./shared";

/** `onSelecionar` (opcional): clicar numa barra abre a ORIGEM daquele item. */
export function TopItensChart({ data, onSelecionar }: { data: TopItem[]; onSelecionar?: (r: RecorteDash, rotulo: string) => void }) {
  const tk = useChartTokens();
  const rows = data
    .filter((d) => d.valor > 0)
    .map((d) => ({
      id: d.id,
      label: d.nome ?? "—",
      valor: d.valor,
      quantidade: d.quantidade,
      unidadeMedida: d.unidadeMedida,
      codigo: d.codigo,
    }));
  if (!rows.length) return <ChartEmpty />;

  return (
    <div style={{ height: Math.max(220, rows.length * 36) }}>
      <ResponsiveContainer>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} stroke={tk.grid} />
          <XAxis
            type="number"
            tickFormatter={(v) => brlCompact(v)}
            tick={{ fontSize: 11, fill: tk.axis }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={170}
            tick={{ fontSize: 11, fill: tk.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 28)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: tk.cursor }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as {
                label: string;
                valor: number;
                quantidade: number | null;
                unidadeMedida: string | null;
                codigo: string | null;
              };
              return (
                <TooltipBox>
                  <div className="max-w-[240px] font-semibold text-text">{p.label}</div>
                  <div className="text-muted">
                    {brl(p.valor)}
                    {p.quantidade != null
                      ? ` · ${dec(p.quantidade)} ${p.unidadeMedida ?? ""}`
                      : ""}
                  </div>
                  {p.codigo ? <div className="text-faint">Unidade {p.codigo}</div> : null}
                </TooltipBox>
              );
            }}
          />
          <Bar
            dataKey="valor"
            fill={CHART_COLORS[3]}
            radius={[0, 6, 6, 0]}
            maxBarSize={22}
            onClick={onSelecionar ? (_, i) => onSelecionar({ dim: "item", id: rows[i].id }, rows[i].label) : undefined}
            className={onSelecionar ? "cursor-pointer" : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
