"use client";

import { brl, brlCompact, dec } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { TopItem } from "@/lib/queries";
import { BarrasH } from "./Barras";
import { ChartEmpty, corSerie } from "./shared";

/**
 * TOP itens por valor (barras horizontais por token). `onSelecionar`: tocar devolve o recorte do item (o Dashboard o usa
 * como FILTRO cruzado); `ativo` = o item filtrado.
 */
export function TopItensChart({
  data,
  onSelecionar,
  ativo,
}: {
  data: TopItem[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativo?: number | null;
}) {
  const rows = data.filter((d) => d.valor > 0);
  if (!rows.length) return <ChartEmpty />;
  return (
    <BarrasH
      ariaLabel="Maiores itens por valor"
      ativa={onSelecionar ? (ativo ?? null) : undefined}
      acao="filtrar o Dashboard"
      onEscolher={
        onSelecionar
          ? (chave) => {
              const d = rows.find((r) => r.id === chave);
              if (d) onSelecionar({ dim: "item", id: d.id }, d.nome ?? `Item ${d.id}`);
            }
          : undefined
      }
      linhas={rows.map((d) => ({
        chave: d.id,
        rotulo: d.nome ?? "—",
        titulo: `${d.nome ?? "—"} — ${brl(d.valor)}${d.quantidade != null ? ` · ${dec(d.quantidade)} ${d.unidadeMedida ?? ""}` : ""}${d.codigo ? ` · ${d.codigo}` : ""}`,
        segmentos: [{ chave: "v", valor: d.valor, cor: corSerie(3), rotulo: d.nome ?? "—" }],
        valor: brlCompact(d.valor),
        detalhe: d.codigo ?? undefined,
      }))}
    />
  );
}
