import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MesaPca } from "@/components/MesaPca";
import { OrcamentoComparativo } from "@/components/OrcamentoComparativo";
import { OrcamentoPca } from "@/components/OrcamentoPca";
import { PainelPca } from "@/components/PainelPca";
import { PcaConfiguracao } from "@/components/PcaConfiguracao";
import { type AbaPca, PcaEspacoView } from "@/components/PcaEspacoView";
import { PlanilhasPca } from "@/components/PlanilhasPca";
import { UnitFilter } from "@/components/UnitFilter";
import { getUsuarioAtual } from "@/lib/auth";
import { dadosComparativo } from "@/lib/comparativo-dados";
import { num } from "@/lib/format";
import { carregarMesa } from "@/lib/mesa-dados";
import { resumoVisao } from "@/lib/orcamento-visao";
import type { AcaoDfdPca } from "@/lib/pca-core";
import {
  dashboardDoPca,
  dfdsEmOutroPca,
  getPcaEspaco,
  listarVisoesOrcamento,
  orcamentoDoAno,
  orcamentoDoPca,
  type PcaEspaco,
  pcaTemDados,
  vinculosDoPca,
} from "@/lib/pca-espaco";
import { getUnidades } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ABAS: AbaPca[] = ["dashboard", "orcamento", "comparativo", "mesa", "configuracao"];

// ESPAÇO do PCA: Dashboard · Orçamento · Comparativo · Mesa (protocolos) | Importação (lista) · Configuração.
export default async function PcaEspacoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; unidade?: string }>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const pca = Number.isInteger(id) && id > 0 ? await getPcaEspaco(id) : null;
  if (!pca) notFound();
  const u = await getUsuarioAtual();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";
  const aba: AbaPca = ABAS.includes(sp.aba as AbaPca) ? (sp.aba as AbaPca) : "dashboard";
  const unidadePedida = sp.unidade ? Number.parseInt(sp.unidade, 10) : Number.NaN;

  // SÓ a aba ativa é montada (cada aba tem a sua carga — trocar de aba navega).
  let conteudo: ReactNode;
  if (aba === "dashboard") conteudo = await abaDashboard(pca, Number.isFinite(unidadePedida) ? unidadePedida : undefined);
  else if (aba === "orcamento") {
    const orc = await orcamentoDoPca(pca);
    conteudo = (
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
          unidades: orc.unidades,
        }}
      />
    );
  } else if (aba === "comparativo") conteudo = await abaComparativo(pca, u?.id ?? null);
  else if (aba === "mesa") conteudo = await abaMesa(pca, u, podeEditar);
  else {
    const [visoes, dados] = await Promise.all([listarVisoesOrcamento(), pcaTemDados(pca.id)]);
    const temDados = dados.planilhas > 0 ? `${num(dados.planilhas)} planilha(s)` : dados.dfds > 0 ? `${num(dados.dfds)} DFD(s) vinculados` : null;
    conteudo = (
      <PcaConfiguracao
        pca={{ id: pca.id, nome: pca.nome, ano: pca.ano, fonte: pca.fonte, status: pca.status, capa: pca.capa, orcamentoVisaoId: pca.orcamentoVisaoId }}
        podeEditar={podeEditar}
        temDados={temDados}
        visoes={visoes.map((v) => ({ id: v.id, nome: v.nome, resumo: resumoVisao(v.filtros) }))}
      />
    );
  }

  return (
    <PcaEspacoView
      pca={{ nome: pca.nome, ano: pca.ano, fonte: pca.fonte, status: pca.status, capa: pca.capa }}
      aba={aba}
    >
      {conteudo}
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
        <div className="w-full sm:ml-auto sm:w-80">
          <UnitFilter unidades={dash.unidades} current={dash.unidadeId} />
        </div>
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
 * Aba COMPARATIVO: a MESMA tabela cruzada da tela do orçamento, sobre o orçamento do ANO do PCA, abrindo na visão que a
 * Configuração do PCA escolheu (trocável). Sem orçamento do ano ⇒ o aviso.
 */
async function abaComparativo(pca: PcaEspaco, usuarioId: number | null) {
  const orc = await orcamentoDoAno(pca.ano);
  if (!orc)
    return (
      <p className="rounded-card border border-dashed border-border-2 bg-surface p-10 text-center text-sm text-muted">
        {pca.ano == null ? "Defina o ano do PCA na aba Configuração." : `Nenhum orçamento de ${pca.ano} — importe o CUBO em Orçamento.`}
      </p>
    );
  return <OrcamentoComparativo titulo={`${orc.nome} ${orc.ano}`} visaoInicial={pca.orcamentoVisaoId} {...await dadosComparativo(orc.id, usuarioId)} />;
}

/** Aba MESA (fonte protocolo — só os protocolos ENVIADOS a este PCA) | IMPORTAÇÃO (fonte lista). */
async function abaMesa(pca: PcaEspaco, u: Awaited<ReturnType<typeof getUsuarioAtual>>, podeEditar: boolean) {
  if (pca.fonte === "lista") {
    const planilhas = await getUnidades(undefined, pca.id);
    return <PlanilhasPca pcaId={pca.id} planilhas={planilhas} podeEditar={podeEditar} />;
  }
  const [m, vs] = await Promise.all([carregarMesa(u, pca.id), vinculosDoPca(pca.id)]);
  // Enviados ainda não incorporados: quantos DFDs de cada um já estão em OUTRO PCA (ficam de fora).
  const naoInc = new Set(m.protocolos.filter((p) => p.pcaIncorporadoEm == null).map((p) => p.id));
  const doNaoInc = m.dfds.filter((d) => d.protocoloId != null && naoInc.has(d.protocoloId));
  const emOutro = await dfdsEmOutroPca(
    doNaoInc.map((d) => d.id),
    pca.id,
  );
  const emOutroPorProto: Record<number, number> = {};
  for (const d of doNaoInc) if (d.protocoloId != null && emOutro.has(d.id)) emOutroPorProto[d.protocoloId] = (emOutroPorProto[d.protocoloId] ?? 0) + 1;
  const acaoPorProtocolo: Record<number, AcaoDfdPca> = {};
  for (const v of vs) if (v.protocoloId != null && !acaoPorProtocolo[v.protocoloId]) acaoPorProtocolo[v.protocoloId] = v.acao;
  return (
    <MesaPca
      pca={{ id: pca.id, nome: pca.nome, ano: pca.ano }}
      emOutroPcaPorProtocolo={emOutroPorProto}
      acaoPorProtocolo={acaoPorProtocolo}
      podeEditar={m.podeEditar}
      dfds={m.dfds}
      protocolos={m.protocolos}
      reparticoes={m.reparticoes}
      reparticaoAtivaId={m.reparticaoAtivaId}
      pcas={m.pcas}
      regras={m.regras}
      orgaos={m.orgaos}
      pessoas={m.pessoas}
      outrasPessoas={m.outrasPessoas}
      situacoes={m.situacoes}
      usuarioId={m.usuarioId}
    />
  );
}
