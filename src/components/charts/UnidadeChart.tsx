"use client";

import { useState } from "react";
import { brl, brlCompact, num } from "@/lib/format";
import type { RecorteDash } from "@/lib/origem-dash";
import type { Fatia } from "@/lib/queries";
import { Segmented } from "../Segmented";
import { BarrasH } from "./Barras";
import { ChartEmpty, corSerie } from "./shared";

const TOP = 10;
const OUTRAS = "__outras";

/**
 * UNIDADES DE MEDIDA (barras horizontais por token): as 10 maiores + "Outras N" (nada some), na medida escolhida — Itens
 * ou R$. `onSelecionar` devolve o recorte (FILTRO cruzado do Dashboard); `ativos` = os rótulos filtrados.
 */
export function UnidadeChart({
  data,
  onSelecionar,
  ativos,
}: {
  data: Fatia[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativos?: string[];
}) {
  const [medida, setMedida] = useState<"count" | "total">("count");
  const sorted = [...data].sort((a, b) => b[medida] - a[medida] || a.label.localeCompare(b.label, "pt-BR"));
  if (!sorted.length) return <ChartEmpty />;
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
  const formatar = (f: { total: number; count: number }) => (medida === "count" ? num(f.count) : brlCompact(f.total));
  const detalhe = (f: { total: number; count: number }) => (medida === "count" ? brlCompact(f.total) : `${num(f.count)} itens`);
  const linhas = [
    ...top.map((f) => ({
      chave: f.label,
      rotulo: f.label,
      titulo: `${f.label}: ${num(f.count)} itens · ${brl(f.total)}`,
      segmentos: [{ chave: "v", valor: f[medida], cor: corSerie(1), rotulo: f.label }],
      valor: formatar(f),
      detalhe: detalhe(f),
    })),
    ...(rest.length
      ? [
          {
            chave: OUTRAS,
            rotulo: `Outras ${rest.length}`,
            titulo: `Outras ${rest.length}: ${rest.map((r) => r.label).join(", ")}`,
            segmentos: [{ chave: "v", valor: resto[medida], cor: "var(--faint)", rotulo: "Outras" }],
            valor: formatar(resto),
            detalhe: detalhe(resto),
            apagada: true,
            clicavel: true,
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-2">
      <Segmented
        value={medida}
        onChange={setMedida}
        ariaLabel="Medida das unidades de medida"
        options={[
          { value: "count", label: "Itens" },
          { value: "total", label: "Valor" },
        ]}
      />
      <BarrasH
        ariaLabel="Itens por unidade de medida"
        ativa={onSelecionar ? ativa : undefined}
        acao="filtrar o Dashboard"
        onEscolher={
          onSelecionar
            ? (chave) =>
                chave === OUTRAS
                  ? onSelecionar({ dim: "unidadeMedida", labels: rest.map((r) => r.label) }, `Outras ${rest.length}`)
                  : onSelecionar({ dim: "unidadeMedida", labels: [String(chave)] }, String(chave))
            : undefined
        }
        linhas={linhas}
      />
    </div>
  );
}
