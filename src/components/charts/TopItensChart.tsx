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
import { AXIS, GRID, ChartEmpty, TooltipBox } from "./shared";

export function TopItensChart({ data }: { data: TopItem[] }) {
  const rows = data
    .filter((d) => d.valor > 0)
    .map((d) => ({
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
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            tickFormatter={(v) => brlCompact(v)}
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={170}
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 28)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.12)" }}
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
                  <div className="max-w-[240px] font-semibold text-slate-800 dark:text-slate-100">
                    {p.label}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {brl(p.valor)}
                    {p.quantidade != null
                      ? ` · ${dec(p.quantidade)} ${p.unidadeMedida ?? ""}`
                      : ""}
                  </div>
                  {p.codigo ? (
                    <div className="text-slate-400">Unidade {p.codigo}</div>
                  ) : null}
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="valor" fill="#a855f7" radius={[0, 6, 6, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
