import { brl, brlCompact, num } from "@/lib/format";
import type { Fatia, ItemRow, PontoMensal, Resumo, TopItem } from "@/lib/queries";
import { Callout } from "./Callout";
import { type ConsultaDashboard, DashboardPcaCliente } from "./DashboardPcaCliente";
import { IconEye } from "./icons";
import { KpiStat } from "./KpiStat";

export type DadosPainelPca = {
  resumo: Resumo;
  porClassificacao: Fatia[];
  porMes: PontoMensal[];
  porUnidadeMedida: Fatia[];
  top: TopItem[];
  itens: ItemRow[];
  /** PRÉVIA ligada (Configuração do PCA, só em Preview): os DFDs/protocolos ainda NÃO incorporados que entraram. */
  previa?: { dfds: number; protocolos: number } | null;
};

/**
 * DASHBOARD do PCA — os MESMOS KPIs e gráficos da tela inicial pública, no painel (aba Dashboard do
 * PCA) e na própria tela inicial. `hintItens` troca o complemento do KPI de itens (ex.: "5
 * protocolo(s) · 68 DFDs" na fonte protocolo). Gráficos + consulta = `DashboardPcaCliente` (clique → origem dos dados).
 */
export function PainelPca({
  dados,
  unidadeFiltrada = false,
  hintItens,
  consulta,
}: {
  dados: DadosPainelPca;
  unidadeFiltrada?: boolean;
  hintItens?: string;
  /** PCA de fonte protocolo: a consulta Protocolos · DFDs · Itens + banners discretos (`ConsultaPca`). */
  consulta?: ConsultaDashboard;
}) {
  const { resumo, previa } = dados;
  return (
    <div className="space-y-[var(--gap-block)]">
      {previa && (
        <Callout kind="info" icon={<IconEye className="h-4 w-4" />}>
          <b>Prévia do PCA</b> — os números incluem {num(previa.dfds)} DFD(s) de {num(previa.protocolos)} protocolo(s) ainda NÃO incorporados
          (enviados à Mesa do PCA e marcados na Mesa do sistema), como se fossem incorporados agora. Só aparece no painel, com o PCA em
          Preview; o que vale é o incorporado.
        </Callout>
      )}
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

      <DashboardPcaCliente
        porClassificacao={dados.porClassificacao}
        porMes={dados.porMes}
        porUnidadeMedida={dados.porUnidadeMedida}
        top={dados.top}
        itensTexto={JSON.stringify(dados.itens)}
        showUnidade={!unidadeFiltrada}
        consulta={consulta}
        previa={!!previa}
      />
    </div>
  );
}
