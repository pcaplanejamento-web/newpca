"use client";

import { brl, brlCompact, num } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { Fatia } from "@/lib/queries";
import { Pizza } from "./Pizza";
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
 * PRIORIDADE dos DFDs (o valor dos itens por Alta · Média · Baixa · Não definida) numa PIZZA moderna nas cores do
 * semáforo — o todo em poucos níveis; o raio de cada fatia cresce com o valor. `onSelecionar` devolve o recorte (FILTRO
 * cruzado do Dashboard); `ativos` = as prioridades filtradas.
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
  const fatias = PRIORIDADES_DASH.filter((p) => por.has(p.chave)).map((p) => {
    const f = por.get(p.chave) as Fatia;
    return { chave: p.chave, rotulo: p.rotulo, valor: f.total, cor: p.cor, detalhe: `${brl(f.total)} · ${num(f.count)} itens` };
  });
  if (!fatias.some((f) => f.valor > 0)) return <ChartEmpty />;
  const ativa = ativos?.length === 1 ? ativos[0] : null;
  return (
    <Pizza
      ariaLabel="Valor por prioridade"
      fatias={fatias}
      formatar={brlCompact}
      ativa={onSelecionar ? ativa : undefined}
      onEscolher={onSelecionar ? (c) => onSelecionar({ dim: "prioridade", labels: [c] }, rotuloPrioridade(c)) : undefined}
    />
  );
}
