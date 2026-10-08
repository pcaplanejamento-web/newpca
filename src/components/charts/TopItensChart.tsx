"use client";

import { brl, brlCompact, dec } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { TopItem } from "@/lib/queries";
import { BarrasH } from "./Barras";
import { ChartEmpty, corSerie } from "./shared";

/**
 * TOP itens por valor (barras horizontais por token, com a POSIÇÃO de cada um) — o Dashboard mostra os 100 maiores numa
 * lista que rola por dentro (`alturaMax`). `onSelecionar`: tocar devolve o recorte do item (FILTRO cruzado); `ativo` = o
 * item filtrado.
 */
export function TopItensChart({
  data,
  onSelecionar,
  ativo,
  alturaMax,
}: {
  data: TopItem[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativo?: number | null;
  /** Altura máxima (px): a lista rola por dentro (o Top 100). */
  alturaMax?: number;
}) {
  const rows = data.filter((d) => d.valor > 0);
  if (!rows.length) return <ChartEmpty />;
  return (
    <div className={alturaMax ? "-mr-1 overflow-y-auto pr-1" : undefined} style={alturaMax ? { maxHeight: alturaMax } : undefined}>
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
      linhas={rows.map((d, i) => ({
        chave: d.id,
        rotulo: (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="w-6 shrink-0 text-right text-[11px] text-faint tabular-nums">{i + 1}º</span>
            <span className="truncate">{d.nome ?? "—"}</span>
          </span>
        ),
        titulo: `${d.nome ?? "—"} — ${brl(d.valor)}${d.quantidade != null ? ` · ${dec(d.quantidade)} ${d.unidadeMedida ?? ""}` : ""}${d.codigo ? ` · ${d.codigo}` : ""}`,
        segmentos: [{ chave: "v", valor: d.valor, cor: corSerie(3), rotulo: d.nome ?? "—" }],
        valor: brlCompact(d.valor),
        detalhe: d.codigo ?? undefined,
      }))}
    />
    </div>
  );
}
