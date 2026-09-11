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
import { CHART_COLORS, ChartEmpty, TooltipBox, useChartTokens } from "./shared";

export function MensalChart({ data }: { data: PontoMensal[] }) {
  const tk = useChartTokens();
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
          <CartesianGrid strokeDasharray="3 3" stroke={tk.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: tk.axis }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => brlCompact(v)}
            tick={{ fontSize: 11, fill: tk.axis }}
            axisLine={false}
            tickLine={false}
            width={66}
          />
          <Tooltip
            cursor={{ fill: tk.cursor }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { total: number; count: number };
              return (
                <TooltipBox>
                  <div className="font-semibold text-text">{label}</div>
                  <div className="text-muted">
                    {brl(p.total)} · {num(p.count)} itens
                  </div>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} maxBarSize={46} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
