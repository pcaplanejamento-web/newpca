import { DocumentosPublicos } from "@/components/DocumentosPublicos";
import { IconInbox } from "@/components/icons";
import { OrcamentoPca } from "@/components/OrcamentoPca";
import { PainelPca } from "@/components/PainelPca";
import { ProtecaoDados } from "@/components/ProtecaoDados";
import { TelaPublica } from "@/components/TelaPublica";
import { getAparencia } from "@/lib/aparencia";
import { getUsuarioAtual } from "@/lib/auth";
import { listarDocumentos } from "@/lib/documentos";
import { dataHoraBR, num } from "@/lib/format";
import { dashboardDoPca, getPcaEspaco, listarPcasPublicados, orcamentoDoAno, orcamentoDoPca, type PcaEspaco } from "@/lib/pca-espaco";
import { getConfigProtecao } from "@/lib/protecao";
import { protecaoPublica } from "@/lib/protecao-core";
import { getConfigPublico } from "@/lib/publico";
import { scriptMenuPublico } from "@/lib/menu-lateral";
import { podeLerPublico, vistaPublicaPedida, vistasDoMenu } from "@/lib/publico-core";

export const dynamic = "force-dynamic";

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-card border border-dashed border-border-2 bg-surface p-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-card bg-surface-2 text-faint">
        <IconInbox className="h-8 w-8" />
      </div>
      <p className="mt-5 text-base font-bold text-text">Dados do PCA em breve</p>
      <p className="mt-2 text-sm text-muted">{texto}</p>
    </div>
  );
}

/** Aba ORÇAMENTO pública: só o PCA × Orçamento por unidade (sem o Comparativo do CUBO, vínculos, visões nem relatório). */
async function abaOrcamento(pca: PcaEspaco) {
  const orc = await orcamentoDoPca(pca, await orcamentoDoAno(pca.ano), null);
  return (
    <OrcamentoPca
      consulta
      podeExportar={false}
      dados={{
        pcaId: pca.id,
        ano: pca.ano,
        orcamento: orc.orcamento,
        visaoNome: orc.visao?.nome ?? null,
        bruto: orc.bruto,
        filtrado: orc.filtrado,
        linhas: orc.linhas,
        planejado: orc.planejado,
        previa: null,
        visaoId: orc.visao?.id ?? null,
        ausentes: [],
        unidades: orc.unidades,
        orgaos: orc.orgaos,
        grupos: orc.grupos,
      }}
    />
  );
}

/** Aba DOCUMENTOS pública: os do PCA, sem quem enviou. */
async function abaDocumentos(pca: PcaEspaco) {
  const docs = (await listarDocumentos(null, pca.id)).map((d) => ({ ...d, autor: null, link: null }));
  return <DocumentosPublicos pcaId={pca.id} documentos={docs} />;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ unidade?: string; pca?: string; aba?: string }> }) {
  const sp = await searchParams;
  const [publicados, aparencia, protecaoCfg, cfg, usuario] = await Promise.all([
    listarPcasPublicados(),
    getAparencia(),
    getConfigProtecao(),
    getConfigPublico(),
    getUsuarioAtual().catch(() => null),
  ]);
  // Logado: o atalho do cabeçalho — o ADM vai às Configurações; os demais, ao painel (as Configurações são só do ADM).
  const painel = usuario ? (usuario.admin ? { href: "/painel/configuracoes", rotulo: "Configurar", dica: "Ir para as Configurações" } : { href: "/painel", rotulo: "Sistema", dica: "Ir para o sistema" }) : null;
  const protecao = protecaoPublica(protecaoCfg);

  // PCA escolhido no dropdown (só os PUBLICADOS); padrão = o ativo, senão o mais recente.
  const pedido = sp.pca ? Number.parseInt(sp.pca, 10) : Number.NaN;
  const escolhido = publicados.find((p) => p.id === pedido) ?? publicados[0];
  const pca = escolhido ? await getPcaEspaco(escolhido.id) : null;
  // A aba que vale: só as publicadas pelo ADM (outra na URL = o Dashboard) e só de PCA publicado.
  const pedida = vistaPublicaPedida(cfg, sp.aba);
  const aba = pedida === "consulta" ? "dashboard" : pedida;
  const liberada = podeLerPublico(pca, cfg, aba, false);
  const vista = liberada ? pedida : "dashboard";
  let unidades: { lista: { id: number; codigo: string; municipio: string }[]; atual?: number } | undefined;

  let conteudo: React.ReactNode;
  if (!pca || !liberada) conteudo = <Vazio texto="A equipe ainda não publicou o Plano de Contratações Anual." />;
  else if (aba === "orcamento") conteudo = await abaOrcamento(pca);
  else if (aba === "documentos") conteudo = await abaDocumentos(pca);
  else {
    const unidadePedida = sp.unidade ? Number.parseInt(sp.unidade, 10) : Number.NaN;
    const dados = await dashboardDoPca(pca, Number.isFinite(unidadePedida) ? unidadePedida : undefined);
    unidades = { lista: dados.unidades, atual: dados.unidadeId ?? undefined };
    const comProtocolos = pca.fonte === "protocolo" || dados.protocolos > 0;
    conteudo =
      dados.resumo.count === 0 ? (
        <Vazio texto={`A equipe ainda não publicou os dados do ${pca.nome}.`} />
      ) : (
          <PainelPca
            vista={vista === "consulta" ? "consulta" : "graficos"}
            semFiltroUnidade={dados.unidades.length > 1}
            nome={pca.nome}
            dados={dados}
            unidadeFiltrada={dados.unidadeId != null}
            hintItens={comProtocolos ? `${num(dados.protocolos)} protocolo(s) · ${num(dados.dfds)} DFDs` : undefined}
            consulta={comProtocolos ? { pcaId: pca.id, protocolos: dados.protocolosLista, dfds: dados.dfdsLista } : undefined}
          />
      );
  }

  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trecho estático (scriptMenuPublico), só o booleano do ADM. */}
      <script dangerouslySetInnerHTML={{ __html: scriptMenuPublico(cfg.menu === "recolhido") }} />
      {protecao && <ProtecaoDados {...protecao} quem={`Consulta pública · ${dataHoraBR(new Date().toISOString())}`} />}
      <TelaPublica painel={painel} identidade={aparencia.identidade} vistas={pca ? vistasDoMenu(cfg) : ["dashboard"]} vista={vista} unidades={unidades} pcaId={pca?.id ?? null} pcas={publicados}>
        {conteudo}
      </TelaPublica>
    </>
  );
}
