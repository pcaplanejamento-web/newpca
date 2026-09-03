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
import { AXIS, GRID, ChartEmpty, TooltipBox } from "./shared";

export function UnidadeChart({ data }: { data: Fatia[] }) {
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
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={92}
            tick={{ fontSize: 11, fill: AXIS }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.12)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Fatia;
              return (
                <TooltipBox>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    {p.label}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {num(p.count)} itens · {brl(p.total)}
                  </div>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="count" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
