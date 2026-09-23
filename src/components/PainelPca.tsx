import { brl, brlCompact, num } from "@/lib/format";
import type { Fatia, ItemRow, PontoMensal, Resumo, TopItem } from "@/lib/queries";
import { ChartCard } from "./ChartCard";
import { ClassificacaoChart } from "./charts/ClassificacaoChart";
import { MensalChart } from "./charts/MensalChart";
import { TopItensChart } from "./charts/TopItensChart";
import { UnidadeChart } from "./charts/UnidadeChart";
import { ItemTable } from "./ItemTable";
import { KpiStat } from "./KpiStat";

export type DadosPainelPca = {
  resumo: Resumo;
  porClassificacao: Fatia[];
  porMes: PontoMensal[];
  porUnidadeMedida: Fatia[];
  top: TopItem[];
  itens: ItemRow[];
};

/**
 * DASHBOARD do PCA — os MESMOS KPIs e gráficos da tela inicial pública, no painel (aba Dashboard do
 * PCA) e na própria tela inicial. `hintItens` troca o complemento do KPI de itens (ex.: "5
 * protocolo(s) · 68 DFDs" na fonte protocolo).
 */
export function PainelPca({
  dados,
  unidadeFiltrada = false,
  hintItens,
}: {
  dados: DadosPainelPca;
  unidadeFiltrada?: boolean;
  hintItens?: string;
}) {
  const { resumo } = dados;
  return (
    <div className="space-y-[var(--gap-col)]">
      <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiStat label="Total Planejado" value={brlCompact(resumo.total)} hint={`em ${num(resumo.count)} itens`} />
        <KpiStat
          label="Qtd. de Itens"
          value={num(resumo.count)}
          cor="var(--sit-finalizado)"
          hint={hintItens ?? (unidadeFiltrada ? "itens na unidade" : `${num(resumo.numUnidades)} unidade(s)`)}
        />
        <KpiStat label="Ticket Médio" value={brl(resumo.ticket)} cor="var(--sit-em-analise)" hint="por item" />
        <KpiStat label="Maior Item" value={brlCompact(resumo.maiorValor)} cor="var(--sit-devolvido)" hint={resumo.maiorNome ?? "—"} />
      </div>

      <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-2">
        <ChartCard title="Classificação dos Itens" subtitle="Distribuição do valor por categoria">
          <ClassificacaoChart data={dados.porClassificacao} />
        </ChartCard>
        <ChartCard title="Cronograma Mensal" subtitle="Valor planejado por mês desejado">
          <MensalChart data={dados.porMes} />
        </ChartCard>
        <ChartCard title="Top 10 Itens por Valor" subtitle="Maiores contratações planejadas">
          <TopItensChart data={dados.top} />
        </ChartCard>
        <ChartCard title="Unidades de Medida" subtitle="Itens por unidade de medida">
          <UnidadeChart data={dados.porUnidadeMedida} />
        </ChartCard>
      </div>

      <ChartCard title="Consulta de Itens" subtitle="Busque, filtre e ordene os itens do PCA">
        <ItemTable rows={dados.itens} showUnidade={!unidadeFiltrada} />
      </ChartCard>
    </div>
  );
}
