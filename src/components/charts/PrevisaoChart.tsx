"use client";

import { brl, brlCompact, num } from "@/lib/format";
import { DEFINICAO_GRUPOS, type FatiaPrevisao, PREVISOES_DASH, type RecorteDash } from "@/lib/origem-dash";
import { BarraSegmentada, BarrasH } from "./Barras";
import { ChartEmpty } from "./shared";

/** A cor de cada grupo do quadro Mês definido × Genérico × Sem previsão (tokens). */
const COR_DEFINICAO: Record<string, string> = { "Mês definido": "var(--accent)", Genérico: "var(--serie-4)", "Sem previsão": "var(--faint)" };
const corPeriodo = (label: string) => PREVISOES_DASH.find((p) => p.chave === label)?.cor ?? "var(--faint)";
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const mesmas = (a: readonly string[] | undefined, b: readonly string[]) => !!a && a.length === b.length && b.every((x) => a.includes(x));

/**
 * DEFINIÇÃO DA PREVISÃO — os itens com o MÊS DEFINIDO × os de definição GENÉRICA (anual, semestral, quadrimestral,
 * trimestral) × os sem previsão: a barra da composição do valor + uma linha por grupo (valor, itens e %). Tocar filtra
 * o Dashboard (`dim: "previsao"`); `ativos` = as definições filtradas.
 */
export function DefinicaoPrevisaoChart({
  data,
  onSelecionar,
  ativos,
}: {
  data: FatiaPrevisao[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativos?: string[];
}) {
  if (!data.some((f) => f.count > 0)) return <ChartEmpty />;
  const grupo = (label: string) => DEFINICAO_GRUPOS.find((g) => g.label === label)?.chaves ?? [label];
  const ativa = data.find((f) => mesmas(ativos, grupo(f.label)))?.label ?? null;
  return (
    <div className="space-y-3">
      <BarraSegmentada altura={14} trilho segmentos={data.map((f) => ({ chave: f.label, valor: f.total, cor: COR_DEFINICAO[f.label], rotulo: f.label }))} />
      <BarrasH
        ariaLabel="Valor por definição da previsão"
        linhas={data.map((f) => ({
          chave: f.label,
          rotulo: f.label,
          titulo: `${f.label}: ${brl(f.total)} · ${num(f.count)} itens · ${pct(f.pct)} do valor`,
          segmentos: [{ chave: "v", valor: f.total, cor: COR_DEFINICAO[f.label], rotulo: f.label }],
          valor: pct(f.pct),
          detalhe: `${brlCompact(f.total)} · ${num(f.count)} itens`,
          apagada: f.count === 0 || f.label === "Sem previsão",
          clicavel: f.count > 0,
        }))}
        ativa={onSelecionar ? ativa : undefined}
        acao="filtrar o Dashboard"
        onEscolher={
          onSelecionar
            ? (c) => onSelecionar({ dim: "previsao", labels: [...grupo(String(c))] }, String(c) === "Genérico" ? "Genérico (anual, semestral…)" : String(c))
            : undefined
        }
      />
    </div>
  );
}

/**
 * CONTRATAÇÕES PERIÓDICAS — os itens de definição GENÉRICA (sem mês) por periodicidade: Anual · Semestral ·
 * Quadrimestral · Trimestral, separados do cronograma mensal. Tocar filtra o Dashboard (`dim: "previsao"`).
 */
export function PeriodicidadeChart({
  data,
  onSelecionar,
  ativos,
}: {
  data: FatiaPrevisao[];
  onSelecionar?: (r: RecorteDash, rotulo: string) => void;
  ativos?: string[];
}) {
  if (!data.length) return <ChartEmpty label="Nenhum item de definição genérica" />;
  const ativa = ativos?.length === 1 ? ativos[0] : null;
  return (
    <BarrasH
      ariaLabel="Valor por periodicidade"
      linhas={data.map((f) => ({
        chave: f.label,
        rotulo: f.label,
        titulo: `${f.label}: ${brl(f.total)} · ${num(f.count)} itens · ${pct(f.pct)} dos genéricos`,
        segmentos: [{ chave: "v", valor: f.total, cor: corPeriodo(f.label), rotulo: f.label }],
        valor: brlCompact(f.total),
        detalhe: `${num(f.count)} itens · ${pct(f.pct)}`,
        clicavel: true,
      }))}
      ativa={onSelecionar ? ativa : undefined}
      acao="filtrar o Dashboard"
      onEscolher={onSelecionar ? (c) => onSelecionar({ dim: "previsao", labels: [String(c)] }, String(c)) : undefined}
    />
  );
}
