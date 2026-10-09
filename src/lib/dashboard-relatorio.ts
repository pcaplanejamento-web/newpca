/**
 * RELATÓRIO do Dashboard do PCA em PDF (o botão "Relatório (PDF)"): os KPIs em destaques, os filtros aplicados e UMA
 * tabela por gráfico — cada categoria com os itens, o valor e o "% do total" + a linha TOTAL — nos blocos do gerador de
 * documento (`documento-pdf-core`). Núcleo PURO (testado): os MESMOS números que a tela mostra.
 */

import type { BlocoDoc, LinhaDoc } from "./documento-pdf-core.ts";
import { brl, num } from "./format.ts";

export type FatiaRel = { label: string; total: number; count: number };

export type EntradaRelatorioDash = {
  titulo: string;
  /** Os filtros por extenso ("" = sem filtro). */
  filtros: string;
  resumo: { total: number; count: number; ticket: number; maiorNome: string | null; maiorValor: number };
  graficos: { titulo: string; rotulo: string; fatias: FatiaRel[] }[];
};

const pctTexto = (v: number, total: number) =>
  total > 0 ? `${((v / total) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—";

export function blocosRelatorioDashboard(e: EntradaRelatorioDash): BlocoDoc[] {
  const blocos: BlocoDoc[] = [
    { tipo: "titulo", texto: e.titulo },
    { tipo: "paragrafo", texto: e.filtros ? `Filtros aplicados: ${e.filtros}.` : "Sem filtros: o PCA inteiro.", cor: "muted" },
    {
      tipo: "destaques",
      itens: [
        { rotulo: "Total planejado", valor: brl(e.resumo.total), detalhe: `em ${num(e.resumo.count)} itens` },
        { rotulo: "Qtd. de itens", valor: num(e.resumo.count) },
        { rotulo: "Ticket médio", valor: brl(e.resumo.ticket), detalhe: "por item" },
        { rotulo: "Maior item", valor: brl(e.resumo.maiorValor), detalhe: e.resumo.maiorNome ?? undefined },
      ],
    },
  ];
  for (const g of e.graficos) {
    if (!g.fatias.length) continue;
    const total = g.fatias.reduce((s, f) => s + f.total, 0);
    const itens = g.fatias.reduce((s, f) => s + f.count, 0);
    const linhas: LinhaDoc[] = [
      ...g.fatias.map((f) => ({ celulas: [f.label, num(f.count), brl(f.total), pctTexto(f.total, total)] })),
      { celulas: ["TOTAL", num(itens), brl(total), total > 0 ? "100,0%" : "—"], destaque: true },
    ];
    blocos.push(
      { tipo: "secao", texto: g.titulo },
      {
        tipo: "tabela",
        colunas: [
          { titulo: g.rotulo, peso: 4 },
          { titulo: "Itens", peso: 1.2, alinhar: "right" },
          { titulo: "Valor", peso: 2, alinhar: "right" },
          { titulo: "% do total", peso: 1.3, alinhar: "right" },
        ],
        linhas,
      },
    );
  }
  return blocos;
}
