"use client";

import { brl, brlCompact, mesLabel, num } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { PontoMensal } from "@/lib/queries";
import { Colunas } from "./Barras";
import { ChartEmpty } from "./shared";

/**
 * CRONOGRAMA mensal (colunas por token). `onSelecionar`: tocar num mês devolve o recorte (o Dashboard o usa como FILTRO
 * cruzado); `ativo` = o mês filtrado ("AAAA-M") — os demais esmaecem.
 */
export function MensalChart({
  data,
  onSelecionar,
  ativo,
}: {
  data: PontoMensal[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativo?: string | null;
}) {
  if (!data.length) return <ChartEmpty label="Sem datas informadas" />;
  return (
    <Colunas
      ariaLabel="Valor planejado por mês"
      altura={200}
      formatar={brlCompact}
      colunas={data.map((d) => {
        const chave = `${d.ano}-${d.mes}`;
        return {
          chave,
          rotulo: mesLabel(d.mes, d.ano),
          valor: d.total,
          dica: { valor: brl(d.total), rotulo: `${mesLabel(d.mes, d.ano)} · ${num(d.count)} itens` },
          cor: ativo && ativo !== chave ? "color-mix(in srgb, var(--accent) 30%, transparent)" : undefined,
        };
      })}
      onEscolher={
        onSelecionar
          ? (chave) => {
              const d = data.find((p) => `${p.ano}-${p.mes}` === chave);
              if (d) onSelecionar({ dim: "mes", ano: d.ano, mes: d.mes }, mesLabel(d.mes, d.ano));
            }
          : undefined
      }
    />
  );
}
