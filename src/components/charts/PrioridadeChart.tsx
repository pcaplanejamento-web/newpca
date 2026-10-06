"use client";

import { brl, brlCompact, num } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { Fatia } from "@/lib/queries";
import { BarrasH } from "./Barras";
import { ChartEmpty } from "./shared";

/** As prioridades na ordem e na COR da categoria (semáforo) — nunca pela posição. */
export const PRIORIDADES_DASH: { chave: string; rotulo: string; cor: string }[] = [
  { chave: "ALTA", rotulo: "Alta", cor: "var(--danger)" },
  { chave: "MÉDIA", rotulo: "Média", cor: "var(--warn)" },
  { chave: "BAIXA", rotulo: "Baixa", cor: "var(--ok)" },
  { chave: "—", rotulo: "Não definida", cor: "var(--faint)" },
];

/** O rótulo de leitura de uma prioridade ("ALTA" → "Alta"; "—" → "Não definida"). */
export const rotuloPrioridade = (chave: string) => PRIORIDADES_DASH.find((p) => p.chave === chave)?.rotulo ?? chave;

/**
 * PRIORIDADE dos DFDs (o valor dos itens por Alta · Média · Baixa · Não definida), barras horizontais nas cores do
 * semáforo. `onSelecionar` devolve o recorte (FILTRO cruzado do Dashboard); `ativos` = as prioridades filtradas.
 */
export function PrioridadeChart({
  data,
  onSelecionar,
  ativos,
}: {
  data: Fatia[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativos?: string[];
}) {
  const por = new Map(data.map((f) => [f.label, f]));
  const linhas = PRIORIDADES_DASH.filter((p) => por.has(p.chave)).map((p) => {
    const f = por.get(p.chave) as Fatia;
    return {
      chave: p.chave,
      rotulo: p.rotulo,
      titulo: `${p.rotulo}: ${brl(f.total)} · ${num(f.count)} itens`,
      segmentos: [{ chave: "v", valor: f.total, cor: p.cor, rotulo: p.rotulo }],
      valor: brlCompact(f.total),
      detalhe: `${num(f.count)} itens`,
      apagada: p.chave === "—",
      clicavel: true,
    };
  });
  if (!linhas.length) return <ChartEmpty />;
  const ativa = ativos?.length === 1 ? ativos[0] : null;
  return (
    <BarrasH
      ariaLabel="Valor por prioridade"
      linhas={linhas}
      ativa={onSelecionar ? ativa : undefined}
      acao="filtrar o Dashboard"
      onEscolher={onSelecionar ? (c) => onSelecionar({ dim: "prioridade", labels: [String(c)] }, rotuloPrioridade(String(c))) : undefined}
    />
  );
}
