import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Callout } from "@/components/Callout";
import { MesaPca } from "@/components/MesaPca";
import { OrcamentoPca } from "@/components/OrcamentoPca";
import { PainelPca } from "@/components/PainelPca";
import { PcaConfiguracao } from "@/components/PcaConfiguracao";
import { type AbaPca, PcaEspacoView } from "@/components/PcaEspacoView";
import { PlanilhasPca } from "@/components/PlanilhasPca";
import { UnitFilter } from "@/components/UnitFilter";
import { getUsuarioAtual } from "@/lib/auth";
import { num } from "@/lib/format";
import { carregarMesa } from "@/lib/mesa-dados";
import { resumoVisao } from "@/lib/orcamento-visao";
import type { AcaoDfdPca, CamadaPca } from "@/lib/pca-core";
import {
  dashboardDoPca,
  dfdsEmOutroPca,
  getPcaEspaco,
  listarVisoesOrcamento,
  orcamentoDoPca,
  type PcaEspaco,
  pcaTemDados,
  vinculosDoPca,
} from "@/lib/pca-espaco";
import { getUnidades } from "@/lib/queries";
import { listarSituacoes } from "@/lib/situacoes";

export const dynamic = "force-dynamic";

const ABAS: AbaPca[] = ["dashboard", "orcamento", "mesa", "configuracao"];

// ESPAÇO do PCA: Dashboard · Orçamento · Mesa (protocolos) | Importação (lista) · Configuração.
export default async function PcaEspacoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; camada?: string; unidade?: string }>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const pca = Number.isInteger(id) && id > 0 ? await getPcaEspaco(id) : null;
  if (!pca) notFound();
  const u = await getUsuarioAtual();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";
  const camada: CamadaPca = pca.fonte === "protocolo" && sp.camada === "publicado" ? "publicado" : "preview";
  const aba: AbaPca = ABAS.includes(sp.aba as AbaPca) ? (sp.aba as AbaPca) : "dashboard";
  const unidadePedida = sp.unidade ? Number.parseInt(sp.unidade, 10) : Number.NaN;

  const rotuloCamada = camada === "publicado" ? "Publicado" : "Preview";
  // SÓ a aba ativa é montada (cada aba tem a sua carga — trocar de aba navega).
  let conteudo: ReactNode;
  if (aba === "dashboard") conteudo = await abaDashboard(pca, camada, Number.isFinite(unidadePedida) ? unidadePedida : undefined);
  else if (aba === "orcamento") {
    const orc = await orcamentoDoPca(pca, camada);
    conteudo = (
      <OrcamentoPca
        dados={{
          ano: pca.ano,
          orcamento: orc.orcamento,
          visaoNome: orc.visao?.nome ?? null,
          bruto: orc.bruto,
          filtrado: orc.filtrado,
          linhas: orc.linhas,
          planejado: orc.planejado,
          unidades: orc.unidades,
          camadaRotulo: pca.fonte === "protocolo" ? rotuloCamada : "da lista",
        }}
      />
    );
  } else if (aba === "mesa") conteudo = await abaMesa(pca, u, podeEditar);
  else {
    const [visoes, situacoes, dados] = await Promise.all([listarVisoesOrcamento(), listarSituacoes(), pcaTemDados(pca.id)]);
    const temDados = dados.planilhas > 0 ? `${num(dados.planilhas)} planilha(s)` : dados.dfds > 0 ? `${num(dados.dfds)} DFD(s) vinculados` : null;
    conteudo = (
      <PcaConfiguracao
        pca={{ id: pca.id, nome: pca.nome, ano: pca.ano, fonte: pca.fonte, status: pca.status, capa: pca.capa, orcamentoVisaoId: pca.orcamentoVisaoId }}
        podeEditar={podeEditar}
        temDados={temDados}
        situacoesQueMovem={situacoes.filter((s) => s.permiteMoverPca).map((s) => ({ nome: s.nome, camada: s.camadaPca }))}
        visoes={visoes.map((v) => ({ id: v.id, nome: v.nome, resumo: resumoVisao(v.filtros) }))}
      />
    );
  }

  return (
    <PcaEspacoView
      pca={{ nome: pca.nome, ano: pca.ano, fonte: pca.fonte, status: pca.status, capa: pca.capa }}
      camada={camada}
      aba={aba}
    >
      {conteudo}
    </PcaEspacoView>
  );
}

/** Aba DASHBOARD: os MESMOS KPIs/gráficos do público + o filtro por unidade + o aviso da camada Preview. */
async function abaDashboard(pca: PcaEspaco, camada: CamadaPca, unidade?: number) {
  const dash = await dashboardDoPca(pca, camada, unidade);
  const aviso =
    pca.fonte === "protocolo" && camada === "preview" && dash.protocolos.total > dash.protocolos.publicados ? (
      <Callout kind="warn">
        Visão Preview: {num(dash.protocolos.total)} protocolo(s) incorporado(s), {num(dash.protocolos.total - dash.protocolos.publicados)} ainda em
        situação de camada Preview. {pca.status === "publicado" ? `O público vê só os ${num(dash.protocolos.publicados)} publicados.` : "O PCA ainda não está publicado."}
      </Callout>
    ) : null;
  if (dash.resumo.count === 0)
    return (
      <div className="space-y-4">
        {aviso}
        <p className="rounded-card border border-dashed border-border-2 bg-surface p-10 text-center text-sm text-muted">
          {pca.fonte === "lista"
            ? "Nenhum item ainda — importe as planilhas na aba Importação."
            : camada === "publicado"
              ? "Nenhum DFD na camada Publicado — a camada vem da situação do protocolo."
              : "Nenhum DFD ainda — envie protocolos pela Mesa principal e incorpore-os na aba Mesa."}
        </p>
      </div>
    );
  return (
    <div className="space-y-[var(--gap-col)]">
      {aviso}
      {dash.unidades.length > 1 && (
        <div className="w-full sm:ml-auto sm:w-80">
          <UnitFilter unidades={dash.unidades} current={dash.unidadeId} />
        </div>
      )}
      <PainelPca
        dados={dash}
        unidadeFiltrada={dash.unidadeId != null}
        hintItens={pca.fonte === "protocolo" ? `${num(camada === "publicado" ? dash.protocolos.publicados : dash.protocolos.total)} protocolo(s) · ${num(dash.dfds)} DFDs` : undefined}
      />
    </div>
  );
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
