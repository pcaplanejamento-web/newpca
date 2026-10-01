"use client";

import Link from "next/link";
import { useState } from "react";
import type { MonitoramentoArmazenamento } from "@/lib/cf-analytics";
import { CAP_REQUISICOES, formatarCpu, type PontoMetrica, requisicoesDoDia } from "@/lib/cloudflare-core";
import { num, pct } from "@/lib/format";
import { Callout } from "./Callout";
import { ChartCard } from "./ChartCard";
import { MetricasChart } from "./charts/MetricasChart";
import { type Column, DataTable } from "./DataTable";
import { KpiStat } from "./KpiStat";
import { OrigemDados } from "./OrigemDados";

const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const corUso = (razao: number) => (razao >= 0.9 ? "var(--danger)" : razao >= 0.7 ? "var(--warn)" : "var(--ok)");

const COLS_DIA: Column<PontoMetrica>[] = [
  { key: "data", header: "Dia (UTC)", nowrap: true, value: (p) => p.data, render: (p) => <span className="tabular-nums">{dataBR(p.data)}</span> },
  { key: "req", header: "Requisições", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.requests, render: (p) => num(p.requests) },
  { key: "err", header: "Erros", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.errors, render: (p) => num(p.errors) },
  { key: "sub", header: "Subrequisições", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.subrequests, render: (p) => num(p.subrequests) },
];

/**
 * Monitoramento do Worker (Cloudflare Workers Analytics) na tela de ARMAZENAMENTO: requisições de hoje × o teto do plano
 * gratuito, os 7 dias, a taxa de erro e a CPU do período + o gráfico por dia (clicar abre a origem). `null` = desligado em
 * Integrações (o ADM liga lá). Presentacional — os dados vêm do `GET /api/admin/armazenamento`.
 */
export function MonitoramentoWorker({ monitoramento, hojeUtc }: { monitoramento: MonitoramentoArmazenamento; hojeUtc: string }) {
  const [dia, setDia] = useState<PontoMetrica | null>(null);
  const [diaMostrado, setDiaMostrado] = useState<PontoMetrica | null>(null);

  if (monitoramento == null) {
    return (
      <Callout kind="info">
        Monitoramento do Worker desligado.{" "}
        <Link href="/painel/integracoes" className="font-semibold text-accent underline-offset-2 hover:underline">
          Ligue em Integrações → Monitoramento
        </Link>{" "}
        para ver requisições, erros e CPU aqui.
      </Callout>
    );
  }
  if (!monitoramento.disponivel) {
    return <Callout kind="danger">Métricas do Worker indisponíveis — {monitoramento.motivo}</Callout>;
  }
  const m = monitoramento.metricas;
  const hoje = requisicoesDoDia(m, hojeUtc);

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-4">
        <KpiStat
          label="Requisições hoje"
          value={num(hoje)}
          hint={`${pct(hoje, CAP_REQUISICOES)} de 100 mil/dia · reseta 00:00 UTC`}
          cor={corUso(hoje / CAP_REQUISICOES)}
        />
        <KpiStat label="Requisições (7 dias)" value={num(m.totalRequests)} hint={`${num(m.totalSubrequests)} subrequisições`} />
        <KpiStat
          label="Erros (7 dias)"
          value={num(m.totalErrors)}
          hint={`taxa de ${m.erroPct.toLocaleString("pt-BR")}%`}
          cor={m.erroPct >= 1 ? "var(--danger)" : m.totalErrors > 0 ? "var(--warn)" : "var(--ok)"}
        />
        <KpiStat label="CPU p99 (7 dias)" value={formatarCpu(m.cpuP99)} hint={`mediana ${formatarCpu(m.cpuP50)} · limite 10 ms`} />
      </div>
      <ChartCard title="Requisições por dia" subtitle="Worker newpca · últimos 7 dias — clique numa barra para ver a origem">
        <MetricasChart
          data={m.dias}
          onSelecionar={(p) => {
            setDia(p);
            setDiaMostrado(p);
          }}
        />
      </ChartCard>
      <OrigemDados
        aberto={dia != null}
        onClose={() => setDia(null)}
        titulo="Requisições por dia"
        recorte={diaMostrado ? dataBR(diaMostrado.data) : ""}
        resumo={[
          { label: "Requisições", value: num(diaMostrado?.requests ?? 0) },
          { label: "Erros", value: num(diaMostrado?.errors ?? 0) },
          { label: "Subrequisições", value: num(diaMostrado?.subrequests ?? 0) },
        ]}
        fonte="Cloudflare Workers Analytics (API GraphQL) — somatório diário (UTC) do Worker newpca, com cache de 60 s."
      >
        <DataTable
          columns={COLS_DIA}
          rows={m.dias}
          getKey={(p) => p.data}
          activeKey={diaMostrado?.data ?? null}
          pageSize={20}
          minWidth={420}
          resumo={(ps) =>
            `${num(ps.length)} dia(s) · ${num(ps.reduce((s, p) => s + p.requests, 0))} requisições · ${num(ps.reduce((s, p) => s + p.errors, 0))} erros`
          }
        />
      </OrigemDados>
    </div>
  );
}
