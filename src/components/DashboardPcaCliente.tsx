"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import { itensDoRecorte, type RecorteDash } from "@/lib/origem-dash";
import type { DfdDoPca, ProtocoloDoPca } from "@/lib/pca-espaco";
import type { Fatia, ItemRow, PontoMensal, TopItem } from "@/lib/queries";
import { BannersConsulta } from "./BannersConsulta";
import type { AberturaMesa } from "./BannersMesa";
import { ChartCard } from "./ChartCard";
import { ClassificacaoChart } from "./charts/ClassificacaoChart";
import { MensalChart } from "./charts/MensalChart";
import { TopItensChart } from "./charts/TopItensChart";
import { UnidadeChart } from "./charts/UnidadeChart";
import { ConsultaPca } from "./ConsultaPca";
import { ItemTable } from "./ItemTable";
import { OrigemDados } from "./OrigemDados";

/** Consulta do PCA de fonte protocolo (Protocolos · DFDs · Itens + banners discretos). */
export type ConsultaDashboard = { pcaId: number; protocolos: ProtocoloDoPca[]; dfds: DfdDoPca[] };

type Selecao = { grafico: string; rotulo: string; recorte: RecorteDash };

/**
 * GRÁFICOS + CONSULTA do Dashboard do PCA (painel e tela inicial) — UM cliente, p/ os itens trafegarem uma vez só.
 * Clicar numa fatia/barra abre a ORIGEM DOS DADOS (`OrigemDados` + `ItemTable` dos itens daquele recorte, pela MESMA
 * chave do gráfico — `itensDoRecorte`); no PCA de fonte protocolo o item abre o banner discreto da consulta.
 */
export function DashboardPcaCliente({
  porClassificacao,
  porMes,
  porUnidadeMedida,
  top,
  itens,
  totalItens,
  showUnidade,
  consulta,
}: {
  porClassificacao: Fatia[];
  porMes: PontoMensal[];
  porUnidadeMedida: Fatia[];
  top: TopItem[];
  itens: ItemRow[];
  /** Nº de itens do PCA (o KPI) — p/ avisar quando a lista (teto de 5.000) não traz todos. */
  totalItens: number;
  showUnidade: boolean;
  consulta?: ConsultaDashboard;
}) {
  const [sel, setSel] = useState<Selecao | null>(null);
  const [mostrada, setMostrada] = useState<Selecao | null>(null);
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const selecionar = (grafico: string) => (recorte: RecorteDash, rotulo: string) => {
    const s = { grafico, rotulo, recorte };
    setSel(s);
    setMostrada(s); // fica exibida enquanto o banner fecha (animação)
  };

  const origem = useMemo(() => (mostrada ? itensDoRecorte(itens, mostrada.recorte) : null), [itens, mostrada]);
  // O valor que o GRÁFICO mostra: no mês, o item ANUAL entra com 1/12.
  const valorNoGrafico = (origem?.itens ?? []).reduce(
    (s, i) => s + (mostrada?.recorte.dim === "mes" && i.anual ? (i.valorTotal ?? 0) / 12 : (i.valorTotal ?? 0)),
    0,
  );
  const incompleta = itens.length < totalItens;
  const abrirItem = consulta
    ? (r: ItemRow) => r.dfdId != null && setAberto({ tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.itemNumero ?? null, codigo: r.idProduto } })
    : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
        <ChartCard title="Classificação dos Itens" subtitle="Distribuição do valor por categoria — clique para ver a origem">
          <ClassificacaoChart data={porClassificacao} onSelecionar={selecionar("Classificação dos Itens")} />
        </ChartCard>
        <ChartCard title="Cronograma Mensal" subtitle="Valor planejado por mês desejado — clique para ver a origem">
          <MensalChart data={porMes} onSelecionar={selecionar("Cronograma Mensal")} />
        </ChartCard>
        <ChartCard title="Top 10 Itens por Valor" subtitle="Maiores contratações planejadas — clique para ver a origem">
          <TopItensChart data={top} onSelecionar={selecionar("Top 10 Itens por Valor")} />
        </ChartCard>
        <ChartCard title="Unidades de Medida" subtitle="Itens por unidade de medida — clique para ver a origem">
          <UnidadeChart data={porUnidadeMedida} onSelecionar={selecionar("Unidades de Medida")} />
        </ChartCard>
      </div>

      <ChartCard title="Consulta de Itens" subtitle={consulta ? "Itens e DFDs do PCA — clique numa linha para ver o detalhe" : "Busque, filtre e ordene os itens do PCA"}>
        {consulta ? (
          <ConsultaPca protocolos={consulta.protocolos} dfds={consulta.dfds} itens={itens} showUnidade={showUnidade} aberto={aberto} onAbrir={setAberto} />
        ) : (
          <ItemTable rows={itens} showUnidade={showUnidade} />
        )}
      </ChartCard>

      <OrigemDados
        aberto={sel != null}
        onClose={() => setSel(null)}
        titulo={mostrada?.grafico ?? ""}
        recorte={mostrada?.rotulo ?? ""}
        resumo={[
          { label: "Valor no gráfico", value: brl(valorNoGrafico) },
          { label: "Itens", value: num(origem?.itens.length ?? 0) },
        ]}
        fonte={
          consulta
            ? "Os itens ATIVOS dos DFDs incorporados a este PCA (a mesma lista da Consulta de Itens), agrupados pela mesma chave do gráfico."
            : "Os itens das planilhas importadas neste PCA (a mesma lista da Consulta de Itens), agrupados pela mesma chave do gráfico."
        }
        avisos={[
          origem?.anuais
            ? `${num(origem.anuais)} item(ns) com previsão ANUAL entram com 1/12 do valor em cada mês do cronograma (a tabela mostra o valor cheio).`
            : null,
          incompleta ? `A lista traz os ${num(itens.length)} itens de maior valor de ${num(totalItens)} — o gráfico considera todos.` : null,
        ]}
      >
        <ItemTable rows={origem?.itens ?? []} showUnidade={showUnidade} origem={!!consulta} onRowClick={abrirItem} ativo={aberto?.tipo === "item" ? aberto.itemId : null} />
      </OrigemDados>

      {consulta && <BannersConsulta pcaId={consulta.pcaId} abrir={aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}
