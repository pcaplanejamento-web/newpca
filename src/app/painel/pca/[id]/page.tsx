import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Callout } from "@/components/Callout";
import { MesaPca } from "@/components/MesaPca";
import { OrcamentoPca } from "@/components/OrcamentoPca";
import { PainelPca } from "@/components/PainelPca";
import { PcaConfiguracao } from "@/components/PcaConfiguracao";
import { type AbaPca, PcaEspacoView } from "@/components/PcaEspacoView";
import { PlanilhasPca } from "@/components/PlanilhasPca";
import { getUsuarioAtual } from "@/lib/auth";
import { num } from "@/lib/format";
import { carregarMesa } from "@/lib/mesa-dados";
import { resumoVisao } from "@/lib/orcamento-visao";
import type { CamadaPca } from "@/lib/pca-core";
import {
  dashboardDoPca,
  dfdsDosProtocolos,
  dfdsEmOutroPca,
  getPcaEspaco,
  listarVisoesOrcamento,
  orcamentoDoPca,
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

  const [dash, orc, visoes, situacoes, dados] = await Promise.all([
    dashboardDoPca(pca, camada, Number.isFinite(unidadePedida) ? unidadePedida : undefined),
    orcamentoDoPca(pca, camada),
    listarVisoesOrcamento(),
    listarSituacoes(),
    pcaTemDados(pca.id),
  ]);

  // ---- Dashboard ----
  const rotuloCamada = camada === "publicado" ? "Publicado" : "Preview";
  const aviso =
    pca.fonte === "protocolo" && camada === "preview" && dash.protocolos.total > 0 ? (
      <Callout kind="warn">
        Visão Preview: {num(dash.protocolos.total)} protocolo(s) no PCA, {num(dash.protocolos.total - dash.protocolos.publicados)} ainda em
        situação de camada Preview. {pca.status === "publicado" ? `O público vê só os ${num(dash.protocolos.publicados)} publicados.` : "O PCA ainda não está publicado."}
      </Callout>
    ) : null;
  const abaDashboard =
    dash.resumo.count === 0 ? (
      <div className="space-y-4">
        {aviso}
        <p className="rounded-card border border-dashed border-border-2 bg-surface p-10 text-center text-sm text-muted">
          {pca.fonte === "lista"
            ? "Nenhum item ainda — importe as planilhas na aba Importação."
            : camada === "publicado"
              ? "Nenhum DFD na camada Publicado — a camada vem da situação do protocolo."
              : "Nenhum DFD ainda — mova protocolos na aba Mesa."}
        </p>
      </div>
    ) : (
      <div className="space-y-[var(--gap-col)]">
        {aviso}
        <PainelPca
          dados={dash}
          unidadeFiltrada={dash.unidadeId != null}
          hintItens={pca.fonte === "protocolo" ? `${num(camada === "publicado" ? dash.protocolos.publicados : dash.protocolos.total)} protocolo(s) · ${num(dash.dfds)} DFDs` : undefined}
        />
      </div>
    );

  // ---- Orçamento ----
  const abaOrcamento = (
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

  // ---- Mesa (protocolo) | Importação (lista) ----
  let abaMesa: ReactNode;
  if (pca.fonte === "lista") {
    const planilhas = await getUnidades(undefined, pca.id);
    abaMesa = <PlanilhasPca pcaId={pca.id} planilhas={planilhas} podeEditar={podeEditar} />;
  } else {
    const [m, vs] = await Promise.all([carregarMesa(u), vinculosDoPca(pca.id)]);
    // Protocolos do ANO (candidatos) + os já no PCA: quantos DFDs de cada um estão em OUTRO PCA.
    const candidatos = m.protocolos.filter((p) => pca.ano != null && p.anoPca === pca.ano).map((p) => p.id);
    const dfdsCand = await dfdsDosProtocolos(candidatos);
    const emOutro = await dfdsEmOutroPca(
      dfdsCand.map((d) => d.id),
      pca.id,
    );
    const emOutroPorProto: Record<number, number> = {};
    for (const d of dfdsCand) if (emOutro.has(d.id)) emOutroPorProto[d.protocoloId] = (emOutroPorProto[d.protocoloId] ?? 0) + 1;
    abaMesa = (
      <MesaPca
        pca={{ id: pca.id, nome: pca.nome, ano: pca.ano }}
        protocolosNoPca={[...new Set(vs.map((v) => v.protocoloId).filter((x): x is number => x != null))]}
        dfdsNoPca={vs.map((v) => v.dfdId)}
        emOutroPcaPorProtocolo={emOutroPorProto}
        podeEditar={m.podeEditar}
        dfds={m.dfds}
        protocolos={m.protocolos}
        reparticoes={m.reparticoes}
        reparticaoAtivaId={m.reparticaoAtivaId}
        pcas={m.pcas}
        regras={m.regras}
        orgaos={m.orgaos}
        pessoas={m.pessoas}
        situacoes={m.situacoes}
      />
    );
  }

  // ---- Configuração ----
  const temDados = dados.planilhas > 0 ? `${num(dados.planilhas)} planilha(s)` : dados.dfds > 0 ? `${num(dados.dfds)} DFD(s) vinculados` : null;
  const abaConfig = (
    <PcaConfiguracao
      pca={{ id: pca.id, nome: pca.nome, ano: pca.ano, fonte: pca.fonte, status: pca.status, capa: pca.capa, orcamentoVisaoId: pca.orcamentoVisaoId }}
      podeEditar={podeEditar}
      temDados={temDados}
      situacoesQueMovem={situacoes.filter((s) => s.permiteMoverPca).map((s) => ({ nome: s.nome, camada: s.camadaPca }))}
      visoes={visoes.map((v) => ({ id: v.id, nome: v.nome, resumo: resumoVisao(v.filtros) }))}
    />
  );

  return (
    <PcaEspacoView
      pca={{ nome: pca.nome, ano: pca.ano, fonte: pca.fonte, status: pca.status, capa: pca.capa }}
      camada={camada}
      abaInicial={aba}
      abas={{ dashboard: abaDashboard, orcamento: abaOrcamento, mesa: abaMesa, configuracao: abaConfig }}
    />
  );
}
