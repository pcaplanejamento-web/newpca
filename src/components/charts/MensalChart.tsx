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
import type { PontoMensal } from "@/lib/queries";
import { brl, brlCompact, mesLabel, num } from "@/lib/format";
import { AXIS, GRID, ChartEmpty, TooltipBox } from "./shared";

export function MensalChart({ data }: { data: PontoMensal[] }) {
  const rows = data.map((d) => ({
    label: mesLabel(d.mes, d.ano),
    total: d.total,
    count: d.count,
  }));
  if (!rows.length) return <ChartEmpty label="Sem datas informadas" />;

  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => brlCompact(v)}
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
            width={66}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.12)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { total: number; count: number };
              return (
                <TooltipBox>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    {label}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {brl(p.total)} · {num(p.count)} itens
                  </div>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={46} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
