"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Fatia } from "@/lib/queries";
import { brl, num, pct } from "@/lib/format";
import { CHART_COLORS, ChartEmpty, TooltipBox } from "./shared";

const TOP = 8;

export function ClassificacaoChart({ data }: { data: Fatia[] }) {
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
                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                      {s.label}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
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
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span
              className="flex-1 truncate text-slate-600 dark:text-slate-300"
              title={s.label}
            >
              {s.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-800 dark:text-slate-100">
              {pct(s.total, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
