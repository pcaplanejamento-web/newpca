import { getRegrasAvaliacao } from "./avaliacao";
import type { UsuarioSessao } from "./auth";
import { listarDfds, listarPcas } from "./dfd";
import { getGrupoAtivoId, getReparticaoContexto, getReparticaoFiltro } from "./grupos";
import { FILTRO_MESA_TODOS, filtroInicialMesa } from "./mesa-filtros";
import { listarOrgaos } from "./orgaos";
import { listarPadronizacao } from "./padronizacao";
import { getPcaFiltro, pcasDoFiltro } from "./pca-filtro";
import { listarProtocolos, listarProtocolosDoPca } from "./protocolo";
import { RESPONSAVEIS_VAZIO } from "./reparticao-responsaveis";
import { dadosMatchPorReparticao, responsaveisPorReparticao } from "./reparticoes";
import { listarSituacoes } from "./situacoes";
import { listarPessoasDoGrupo, mesaResponsavelGravado, pessoasPorIds } from "./usuarios";

/** O escopo de acesso por unidade das rotas: sem unidade OU uma unidade da lista (admin = todas). */
export function acessivelNaLista(lista: { id: number }[]) {
  const ids = new Set(lista.map((r) => r.id));
  return (reparticaoId: number | null | undefined) => reparticaoId == null || ids.has(reparticaoId);
}

/**
 * Dados da MESA (Protocolos · DFDs · Itens) — o MESMO carregamento da tela `/painel/mesa` e da aba Mesa do
 * PCA. Mesa PRINCIPAL: escopada pela unidade ativa do head (Geral = tudo) e pelo PCA do CABEÇALHO (todos = sem
 * filtro), sem os protocolos enviados a um PCA, abrindo com o RESPONSÁVEL da preferência do usuário (Perfil). Mesa
 * do PCA (`pcaId`): só os protocolos ENVIADOS a ele, nas unidades ACESSÍVEIS ao usuário (independente da unidade e do
 * PCA do head; abre com todos). Mais as unidades enriquecidas com os RESPONSÁVEIS (conferência da assinatura) e os
 * campos de MATCH.
 */
/**
 * O que os BANNERS gravados (`BannersMesa`: protocolo · DFD · item) precisam: as unidades ACESSÍVEIS enriquecidas com os
 * RESPONSÁVEIS (conferência da assinatura) e os campos de MATCH, as regras do ADM, os órgãos, os PCAs e se edita.
 */
async function contextoBanners(u: UsuarioSessao | null) {
  const repCtx = await getReparticaoContexto(u);
  const ids = repCtx.lista.map((r) => r.id);
  const [respMap, matchMap, pcas, regras, orgaos] = await Promise.all([
    responsaveisPorReparticao(ids),
    dadosMatchPorReparticao(ids),
    listarPcas(),
    getRegrasAvaliacao(),
    listarOrgaos(),
  ]);
  const reparticoes = repCtx.lista.map((r) => ({
    ...r,
    responsaveis: respMap[r.id] ?? RESPONSAVEIS_VAZIO,
    numeroInteressado: matchMap[r.id]?.numeroInteressado ?? null,
    setorRequisitante: matchMap[r.id]?.setorRequisitante ?? null,
    orgaoId: matchMap[r.id]?.orgaoId ?? null,
    orgaoProprio: matchMap[r.id]?.orgaoProprio ?? false,
    oculto: matchMap[r.id]?.oculto ?? false,
  }));
  return { lista: repCtx.lista, reparticoes, pcas, regras, orgaos, podeEditar: u?.role === "admin" || u?.role === "gestor" };
}

export async function carregarMesa(u: UsuarioSessao | null, pcaId?: number) {
  const [rep, ctx, pref] = await Promise.all([
    getReparticaoFiltro(u),
    contextoBanners(u),
    pcaId ? ("todos" as const) : mesaResponsavelGravado(u?.id),
  ]);
  const acessivel = acessivelNaLista(ctx.lista);
  // PCA do CABEÇALHO (só a Mesa principal — a do PCA já é de um PCA): filtra pelo ano do PCA do protocolo/DFD.
  const pcaFiltro = pcaId ? null : await getPcaFiltro(await pcasDoFiltro(ctx.pcas));
  const ano = pcaFiltro?.ano ?? null;
  const [dfdsBrutos, protocolosBrutos, pessoas, situacoes, padronizacao] = await Promise.all([
    pcaId ? listarDfds(undefined, pcaId) : listarDfds(rep?.id, undefined, ano),
    pcaId ? listarProtocolosDoPca(pcaId) : listarProtocolos(rep?.id, ano),
    // Gestão do protocolo: as PESSOAS DO GRUPO ativo (as únicas designáveis como Responsável) e as
    // situações cadastradas pelo ADM.
    getGrupoAtivoId(u).then(listarPessoasDoGrupo),
    listarSituacoes(),
    // Catálogo → Unidades de medida | Classificações: a unidade comparada e a classificação de cada item (visão Itens).
    // Auxiliar: uma falha aqui nunca derruba a Mesa (as colunas da padronização só não aparecem).
    listarPadronizacao().catch((e) => {
      console.error("[mesa] padronização indisponível:", e);
      return { unidades: [], classificacoes: [] };
    }),
  ]);
  const protocolos = pcaId ? protocolosBrutos.filter((p) => acessivel(p.reparticaoId)) : protocolosBrutos;
  const dfds = pcaId ? dfdsBrutos.filter((d) => acessivel(d.reparticaoId)) : dfdsBrutos;
  // Diretório de EXIBIÇÃO (foto + apelido): quem aparece nas colunas Responsável/Distribuição e não é do
  // grupo (outro grupo, inativo) — só para mostrar, nunca como opção. O próprio usuário entra sempre: a Mesa pode abrir
  // filtrada por ele (a foto dele no filtro de Responsável).
  const doGrupo = new Set(pessoas.map((p) => p.id));
  const outrasPessoas = await pessoasPorIds(
    [...protocolos.flatMap((p) => [p.responsavelId, p.distribuidorId]), u?.id].filter((id) => id != null && !doGrupo.has(id)),
  );
  return {
    dfds,
    protocolos,
    reparticoes: ctx.reparticoes,
    // Em "Geral" (rep=null) não há unidade ativa específica — Geral comporta qualquer unidade.
    reparticaoAtivaId: rep?.id ?? null,
    pcas: ctx.pcas,
    regras: ctx.regras,
    orgaos: ctx.orgaos,
    pessoas,
    outrasPessoas,
    situacoes,
    padronizacao,
    usuarioId: u?.id ?? null,
    podeEditar: ctx.podeEditar,
    /** Filtro com que a Mesa ABRE (preferência do Perfil; na Mesa do PCA, todos). */
    filtroInicial: pcaId ? FILTRO_MESA_TODOS : filtroInicialMesa(pref, u?.id ?? null),
    /** O PCA do cabeçalho que está filtrando a Mesa principal (`null` = todos). */
    pcaFiltro,
  };
}
