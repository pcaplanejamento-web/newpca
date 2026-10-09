import type { Fatia, PontoMensal, Resumo, TopItem } from "@/lib/queries";
import { type ConsultaDashboard, DashboardPcaCliente } from "./DashboardPcaCliente";

export type DadosPainelPca = {
  resumo: Resumo;
  porClassificacao: Fatia[];
  porMes: PontoMensal[];
  porUnidadeMedida: Fatia[];
  top: TopItem[];
  /** Os itens no texto compacto (`itensParaTexto`, montado no memo do Dashboard). */
  itensTexto: string;
  /** PRÉVIA ligada (Configuração do PCA, só em Preview): os DFDs/protocolos ainda NÃO incorporados que entraram — a
   * explicação mora no (?) ao lado das abas do espaço do PCA. */
  previa?: { dfds: number; protocolos: number } | null;
};

/**
 * DASHBOARD do PCA — os MESMOS KPIs e gráficos da tela inicial pública, no painel (aba Dashboard do
 * PCA) e na própria tela inicial. `hintItens` troca o complemento do KPI de itens (ex.: "5
 * protocolo(s) · 68 DFDs" na fonte protocolo). KPIs + gráficos + consulta = `DashboardPcaCliente` (filtro cruzado, explorador e origem dos dados).
 */
export function PainelPca({
  dados,
  unidadeFiltrada = false,
  hintItens,
  consulta,
  nome,
}: {
  dados: DadosPainelPca;
  unidadeFiltrada?: boolean;
  hintItens?: string;
  /** PCA de fonte protocolo: a consulta Protocolos · DFDs · Itens + banners discretos (`ConsultaPca`). */
  consulta?: ConsultaDashboard;
  /** O nome do PCA (o título do relatório em PDF). */
  nome?: string;
}) {
  const { resumo, previa } = dados;
  return (
    <DashboardPcaCliente
      resumo={resumo}
      nome={nome}
      hintItens={hintItens}
      unidadeFiltrada={unidadeFiltrada}
      porClassificacao={dados.porClassificacao}
      porMes={dados.porMes}
      porUnidadeMedida={dados.porUnidadeMedida}
      itensTexto={dados.itensTexto}
      showUnidade={!unidadeFiltrada}
      consulta={consulta}
      previa={!!previa}
    />
  );
}
