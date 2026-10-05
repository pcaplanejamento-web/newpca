import { PermissaoExportar } from "@/components/ExportarTabelas";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MesaPca } from "@/components/MesaPca";
import { FerramentasAba } from "@/components/AbasEspaco";
import { OrcamentoPca } from "@/components/OrcamentoPca";
import { PainelPca } from "@/components/PainelPca";
import { PcaConfiguracao } from "@/components/PcaConfiguracao";
import { type AbaPca, PcaEspacoView } from "@/components/PcaEspacoView";
import { PlanilhasPca } from "@/components/PlanilhasPca";
import { UnitFilter } from "@/components/UnitFilter";
import { podeTela } from "@/lib/acesso";
import { acessoPagina } from "@/lib/acesso-pagina";
import type { UsuarioSessao } from "@/lib/auth";
import type { PodeTela } from "@/lib/papeis-core";
import { dadosComparativo } from "@/lib/comparativo-dados";
import { num } from "@/lib/format";
import { carregarMesaDoPca } from "@/lib/mesa-dados";
import { resumoVisao } from "@/lib/orcamento-visao";
import {
  dashboardDoPca,
  getPcaEspaco,
  listarVisoesOrcamento,
  orcamentoDoAno,
  orcamentoDoPca,
  type PcaEspaco,
  pcaTemDados,
} from "@/lib/pca-espaco";
import { getUnidades } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ABAS: AbaPca[] = ["dashboard", "orcamento", "mesa", "configuracao"];

// ESPAÇO do PCA: Dashboard · Orçamento (KPIs + Comparativo) · Mesa (protocolos) | Importação (lista) · Configuração.
export default async function PcaEspacoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; unidade?: string }>;
}) {
  const r = await acessoPagina("pca");
  if (r.bloqueio) return r.bloqueio;
  const { pode, acesso } = r;
  const u = acesso.u;
  const id = Number((await params).id);
  const sp = await searchParams;
  const pca = Number.isInteger(id) && id > 0 ? await getPcaEspaco(id) : null;
  if (!pca) notFound();
  const aba: AbaPca = ABAS.includes(sp.aba as AbaPca) ? (sp.aba as AbaPca) : "dashboard";
  const unidadePedida = sp.unidade ? Number.parseInt(sp.unidade, 10) : Number.NaN;

  // SÓ a aba ativa é montada (cada aba tem a sua carga — trocar de aba navega).
  let conteudo: ReactNode;
  if (aba === "dashboard") conteudo = await abaDashboard(pca, Number.isFinite(unidadePedida) ? unidadePedida : undefined);
  else if (aba === "orcamento") conteudo = await abaOrcamento(pca, u.id, pode, podeTela(acesso, "orcamento").configurar);
  else if (aba === "mesa") conteudo = await abaMesa(pca, u, pode);
  else {
    const [visoes, dados] = await Promise.all([listarVisoesOrcamento(), pcaTemDados(pca.id)]);
    const temDados = dados.planilhas > 0 ? `${num(dados.planilhas)} planilha(s)` : dados.dfds > 0 ? `${num(dados.dfds)} DFD(s) vinculados` : null;
    conteudo = (
      <PcaConfiguracao
        pca={{ id: pca.id, nome: pca.nome, ano: pca.ano, fonte: pca.fonte, status: pca.status, capa: pca.capa, orcamentoVisaoId: pca.orcamentoVisaoId, mesaMarcados: pca.mesaMarcados }}
        podeEditar={pode.configurar}
        podeExcluir={pode.excluir}
        temDados={temDados}
        visoes={visoes.map((v) => ({ id: v.id, nome: v.nome, resumo: resumoVisao(v.filtros) }))}
      />
    );
  }

  return (
    <PcaEspacoView
      pca={{ nome: pca.nome, ano: pca.ano, fonte: pca.fonte, status: pca.status }}
      aba={aba}
    >
      <PermissaoExportar permitido={pode.exportar}>{conteudo}</PermissaoExportar>
    </PcaEspacoView>
  );
}

/** Aba DASHBOARD: os MESMOS KPIs/gráficos do público (tudo o que foi incorporado) + o filtro por unidade. */
async function abaDashboard(pca: PcaEspaco, unidade?: number) {
  const dash = await dashboardDoPca(pca, unidade);
  if (dash.resumo.count === 0)
    return (
      <p className="rounded-card border border-dashed border-border-2 bg-surface p-10 text-center text-sm text-muted">
        {pca.fonte === "lista"
          ? "Nenhum item ainda — importe as planilhas na aba Importação."
          : "Nenhum item ainda — envie protocolos pela Mesa principal e incorpore-os na aba Mesa."}
      </p>
    );
  return (
    <div className="space-y-[var(--gap-block)]">
      {dash.unidades.length > 1 && (
        <FerramentasAba>
          <div className="w-full sm:w-80">
            <UnitFilter compacto unidades={dash.unidades} current={dash.unidadeId} />
          </div>
        </FerramentasAba>
      )}
      <PainelPca
        dados={dash}
        unidadeFiltrada={dash.unidadeId != null}
        hintItens={pca.fonte === "protocolo" ? `${num(dash.protocolos)} protocolo(s) · ${num(dash.dfds)} DFDs` : undefined}
        consulta={pca.fonte === "protocolo" ? { pcaId: pca.id, protocolos: dash.protocolosLista, dfds: dash.dfdsLista } : undefined}
      />
    </div>
  );
}

/**
 * Aba ORÇAMENTO: os KPIs (dotação do CUBO do ANO do PCA × planejado) e, abaixo, o COMPARATIVO — a MESMA tabela cruzada da
 * tela do orçamento (na visão da Configuração do PCA, trocável) e o PCA × Orçamento por unidade. Um só orçamento do ano.
 */
async function abaOrcamento(pca: PcaEspaco, usuarioId: number | null, pode: PodeTela, podeEditarVisao: boolean) {
  const ref = await orcamentoDoAno(pca.ano);
  // As visões vêm com o comparativo; sem orçamento do ano, só a lista (a engrenagem ainda escolhe a visão).
  const [orc, comp, visoesSemOrc] = await Promise.all([
    orcamentoDoPca(pca, ref),
    ref ? dadosComparativo(ref.id, usuarioId) : null,
    ref || !pode.configurar ? null : listarVisoesOrcamento(),
  ]);
  return (
    <OrcamentoPca
      dados={{
        pcaId: pca.id,
        ano: pca.ano,
        orcamento: orc.orcamento,
        visaoNome: orc.visao?.nome ?? null,
        bruto: orc.bruto,
        filtrado: orc.filtrado,
        linhas: orc.linhas,
        planejado: orc.planejado,
        previa: orc.previa,
        visaoId: orc.visao?.id ?? null,
        ausentes: orc.ausentes,
        unidades: orc.unidades,
        orgaos: orc.orgaos,
      }}
      comparativo={ref && comp ? { titulo: `${ref.nome} ${ref.ano}`, visaoInicial: pca.orcamentoVisaoId, ...comp } : null}
      podeExportar={pode.exportar}
      podePublicar={pode.configurar}
      visoes={comp?.visoes ?? visoesSemOrc ?? []}
      podeEditarVisao={podeEditarVisao}
    />
  );
}

/** Aba MESA (fonte protocolo — só os protocolos ENVIADOS a este PCA) | IMPORTAÇÃO (fonte lista). */
async function abaMesa(pca: PcaEspaco, u: UsuarioSessao, pode: PodeTela) {
  if (pca.fonte === "lista") {
    const planilhas = await getUnidades(undefined, pca.id);
    return <PlanilhasPca pcaId={pca.id} planilhas={planilhas} podeImportar={pode.importar} podeExcluir={pode.excluir} />;
  }
  return <MesaPca {...await carregarMesaDoPca(u, pca)} />;
}
