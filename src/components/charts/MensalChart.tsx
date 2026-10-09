"use client";

import { brl, brlCompact, mesLabel, num } from "@/lib/format";
import type { ModoCronograma, RecorteDash } from "@/lib/origem-dash";
import { Segmented } from "../Segmented";
import { Colunas } from "./Barras";
import { ChartEmpty } from "./shared";

/** Uma coluna do cronograma (um mês). */
export type PontoCronograma = { ano: number; mes: number; total: number; count: number };

/**
 * CRONOGRAMA dos itens com MÊS DEFINIDO (colunas por token). Com `onModo`, a leitura: Por mês (só os de mês definido) ·
 * Acumulado (a soma corrida) · Distribuído (com `temGenericos` — o fluxo do ano: os genéricos entram com 1/12 do valor
 * em cada mês). `onSelecionar`: tocar num mês devolve o recorte (FILTRO cruzado — os itens com aquele mês definido);
 * `ativos` = as colunas filtradas ("AAAA-M") — as demais esmaecem.
 */
export function MensalChart({
  data,
  onSelecionar,
  ativos,
  modo = "mensal",
  onModo,
  temGenericos = false,
}: {
  data: PontoCronograma[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativos?: string[];
  modo?: ModoCronograma;
  onModo?: (m: ModoCronograma) => void;
  temGenericos?: boolean;
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
            { value: "mensal", label: "Por mês", dica: "Só os itens com o mês definido" },
            { value: "acumulado", label: "Acumulado", dica: "A soma corrida mês a mês" },
            ...(temGenericos
              ? [{ value: "distribuido" as const, label: "Distribuído", curto: "Distrib.", dica: "Com os genéricos (anual, semestral…) em 1/12 do valor por mês" }]
              : []),
          ]}
        />
      )}
      {!data.length ? (
        <ChartEmpty label="Nenhum item com o mês definido" />
      ) : (
        <Colunas
          ariaLabel={modo === "acumulado" ? "Valor planejado acumulado" : "Valor planejado por mês"}
          altura={200}
          formatar={brlCompact}
          colunas={data.map((d) => ({
            chave: chave(d),
            rotulo: mesLabel(d.mes, d.ano),
            valor: d.total,
            dica: {
              valor: brl(d.total),
              rotulo: `${mesLabel(d.mes, d.ano)} · ${num(d.count)} itens${modo === "acumulado" ? " (acumulado)" : modo === "distribuido" ? " (com os genéricos)" : ""}`,
            },
            cor: ativos?.length && !ativos.includes(chave(d)) ? "color-mix(in srgb, var(--accent) 30%, transparent)" : undefined,
          }))}
          onEscolher={
            onSelecionar
              ? (c) => {
                  const d = data.find((p) => chave(p) === c);
                  if (d) onSelecionar({ dim: "mes", ano: d.ano, mes: d.mes }, mesLabel(d.mes, d.ano));
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
