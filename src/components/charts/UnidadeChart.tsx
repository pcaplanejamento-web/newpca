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
import type { Fatia } from "@/lib/queries";
import { brl, num } from "@/lib/format";
import { CHART_COLORS, ChartEmpty, TooltipBox, useChartTokens } from "./shared";

export function UnidadeChart({ data }: { data: Fatia[] }) {
  const tk = useChartTokens();
  const rows = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((d) => ({ label: d.label, count: d.count, total: d.total }));
  if (!rows.length) return <ChartEmpty />;

  return (
    <div style={{ height: Math.max(200, rows.length * 34) }}>
      <ResponsiveContainer>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} stroke={tk.grid} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: tk.axis }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={92}
            tick={{ fontSize: 11, fill: tk.axis }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: tk.cursor }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Fatia;
              return (
                <TooltipBox>
                  <div className="font-semibold text-text">{p.label}</div>
                  <div className="text-muted">
                    {num(p.count)} itens · {brl(p.total)}
                  </div>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="count" fill={CHART_COLORS[1]} radius={[0, 6, 6, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
