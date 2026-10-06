"use client";

import { brl, brlCompact, mesLabel, num } from "@/lib/format";
import type { ModoCronograma, RecorteDash } from "@/lib/origem-dash";
import { Segmented } from "../Segmented";
import { Colunas } from "./Barras";
import { ChartEmpty } from "./shared";

/** Uma coluna do cronograma (`mes: 0` = os anuais do ano; `semAnuais` = o mês sem os anuais). */
export type PontoCronograma = { ano: number; mes: number; total: number; count: number; semAnuais?: boolean };

const rotulo = (p: PontoCronograma) => (p.mes === 0 ? `anual/${String(p.ano).slice(-2)}` : mesLabel(p.mes, p.ano));

/**
 * CRONOGRAMA (colunas por token). Com `onModo`, a leitura: Por mês (o anual entra com 1/12 em cada mês) · Acumulado (a
 * soma corrida) · Anuais à parte (só com anuais — os meses sem eles + a coluna "Anual"). `onSelecionar`: tocar num mês
 * devolve o recorte (FILTRO cruzado); `ativo` = a coluna filtrada ("AAAA-M") — as demais esmaecem.
 */
export function MensalChart({
  data,
  onSelecionar,
  ativo,
  modo = "mensal",
  onModo,
  temAnuais = false,
}: {
  data: PontoCronograma[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativo?: string | null;
  modo?: ModoCronograma;
  onModo?: (m: ModoCronograma) => void;
  temAnuais?: boolean;
}) {
  const chave = (p: PontoCronograma) => `${p.ano}-${p.mes}`;
  return (
    <div className="space-y-2">
      {onModo && (
        <Segmented
          value={modo}
          onChange={onModo}
          ariaLabel="Leitura do cronograma"
          options={[
            { value: "mensal", label: "Por mês", dica: "O item anual entra com 1/12 do valor em cada mês" },
            { value: "acumulado", label: "Acumulado", dica: "A soma corrida mês a mês" },
            ...(temAnuais ? [{ value: "separado" as const, label: "Anuais à parte", curto: "Anuais", dica: "Os meses sem os anuais + uma coluna Anual" }] : []),
          ]}
        />
      )}
      {!data.length ? (
        <ChartEmpty label="Sem datas informadas" />
      ) : (
        <Colunas
          ariaLabel={modo === "acumulado" ? "Valor planejado acumulado" : "Valor planejado por mês"}
          altura={200}
          formatar={brlCompact}
          colunas={data.map((d) => ({
            chave: chave(d),
            rotulo: rotulo(d),
            valor: d.total,
            dica: {
              valor: brl(d.total),
              rotulo: `${d.mes === 0 ? `Anuais de ${d.ano}` : mesLabel(d.mes, d.ano)} · ${num(d.count)} itens${modo === "acumulado" ? " (acumulado)" : ""}`,
            },
            cor:
              ativo && ativo !== chave(d)
                ? "color-mix(in srgb, var(--accent) 30%, transparent)"
                : d.mes === 0
                  ? "var(--serie-4)"
                  : undefined,
          }))}
          onEscolher={
            onSelecionar
              ? (c) => {
                  const d = data.find((p) => chave(p) === c);
                  if (!d) return;
                  if (d.mes === 0) onSelecionar({ dim: "mes", ano: d.ano, mes: 0 }, `Anuais de ${d.ano}`);
                  else onSelecionar({ dim: "mes", ano: d.ano, mes: d.mes, ...(d.semAnuais ? { semAnuais: true } : {}) }, mesLabel(d.mes, d.ano));
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
