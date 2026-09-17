"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PontoMetrica } from "@/lib/cloudflare-core";
import { num } from "@/lib/format";
import { CHART_COLORS, ChartEmpty, TooltipBox, useChartTokens } from "./shared";

// Requisições por dia do Worker (monitoramento Cloudflare). Mesmo padrão do MensalChart.
export function MetricasChart({ data }: { data: PontoMetrica[] }) {
  const tk = useChartTokens();
  const rows = data.map((d) => ({ label: d.data.slice(5), requests: d.requests, errors: d.errors }));
  if (!rows.length) return <ChartEmpty label="Sem dados no período" />;

  return (
    <div className="h-56">
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
            tickFormatter={(v) => num(v)}
            tick={{ fontSize: 11, fill: tk.axis }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: tk.cursor }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { requests: number; errors: number };
              return (
                <TooltipBox>
                  <div className="font-semibold text-text">{label}</div>
                  <div className="text-muted">
                    {num(p.requests)} requisições · {num(p.errors)} erros
                  </div>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="requests" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
