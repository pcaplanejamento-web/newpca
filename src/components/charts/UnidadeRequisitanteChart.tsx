"use client";

import { brl, brlCompact, num } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { Fatia } from "@/lib/queries";
import { BarrasH } from "./Barras";
import { ChartEmpty } from "./shared";

const TOP = 10;
const OUTRAS = "__outras";

/**
 * VALOR POR UNIDADE (a requisitante no PCA por protocolos; a planilha no PCA por lista): as 10 maiores + "Outras N",
 * barras horizontais por token. `onSelecionar` devolve o recorte (FILTRO cruzado do Dashboard); `ativos` = as filtradas.
 */
export function UnidadeRequisitanteChart({
  data,
  onSelecionar,
  ativos,
}: {
  data: Fatia[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativos?: string[];
}) {
  if (!data.length) return <ChartEmpty />;
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, TOP);
  const rest = sorted.slice(TOP);
  const resto = rest.reduce((s, r) => ({ total: s.total + r.total, count: s.count + r.count }), { total: 0, count: 0 });
  const marcados = new Set(ativos ?? []);
  const ativa =
    marcados.size === 0
      ? null
      : marcados.size === 1 && top.some((t) => marcados.has(t.label))
        ? [...marcados][0]
        : rest.length > 0 && rest.every((r) => marcados.has(r.label))
          ? OUTRAS
          : null;
  const linhas = [
    ...top.map((f) => ({
      chave: f.label,
      rotulo: f.label === "—" ? "Sem unidade" : f.label,
      titulo: `${f.label === "—" ? "Sem unidade" : f.label}: ${brl(f.total)} · ${num(f.count)} itens`,
      segmentos: [{ chave: "v", valor: f.total, cor: "var(--accent)", rotulo: f.label }],
      valor: brlCompact(f.total),
      detalhe: `${num(f.count)} itens`,
      apagada: f.label === "—",
      clicavel: true,
    })),
    ...(rest.length
      ? [
          {
            chave: OUTRAS,
            rotulo: `Outras ${rest.length}`,
            titulo: `Outras ${rest.length}: ${rest.map((r) => r.label).join(", ")}`,
            segmentos: [{ chave: "v", valor: resto.total, cor: "var(--faint)", rotulo: "Outras" }],
            valor: brlCompact(resto.total),
            detalhe: `${num(resto.count)} itens`,
            apagada: true,
            clicavel: true,
          },
        ]
      : []),
  ];
  return (
    <BarrasH
      ariaLabel="Valor por unidade"
      linhas={linhas}
      ativa={onSelecionar ? ativa : undefined}
      acao="filtrar o Dashboard"
      onEscolher={
        onSelecionar
          ? (c) =>
              c === OUTRAS
                ? onSelecionar({ dim: "unidade", labels: rest.map((r) => r.label) }, `Outras ${rest.length}`)
                : onSelecionar({ dim: "unidade", labels: [String(c)] }, String(c) === "—" ? "Sem unidade" : String(c))
          : undefined
      }
    />
  );
}
