import { getRegrasAvaliacao } from "./avaliacao";
import type { UsuarioSessao } from "./auth";
import { listarDfds, listarPcas } from "./dfd";
import { carregarEdicoes } from "./edicoes-tabela";
import { getGrupoAtivoId, getReparticaoContexto, getReparticaoFiltro } from "./grupos";
import { FILTRO_MESA_TODOS, filtroInicialMesa, PREF_DADOS_COMPLETOS } from "./mesa-filtros";
import { listarOrgaos } from "./orgaos";
import type { AcaoDfdPca } from "./pca-core";
import { anoMarcadosDoPca, dfdsEmOutroPca, vinculosDoPca } from "./pca-espaco";
import { getPcaFiltro, pcasDoFiltro } from "./pca-filtro";
import { listarPreferenciasTabela } from "./preferencias-tabela";
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

/** O prefixo das chaves das edições salvas das tabelas da Mesa (a principal e a do PCA têm as suas). */
const prefixoEdicoesMesa = (pcaId?: number) => (pcaId ? "mesa-pca:" : "mesa:");

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
  // Mesa do PCA com a visão dos MARCADOS ligada (Configuração do PCA): também os do ano dele ainda na Mesa do sistema.
  const anoMarcados = pcaId ? await anoMarcadosDoPca(pcaId) : null;
  const [dfdsBrutos, protocolosBrutos, pessoas, situacoes, edicoes, prefCompletos] = await Promise.all([
    pcaId ? listarDfds(undefined, pcaId, null, anoMarcados) : listarDfds(rep?.id, undefined, ano),
    pcaId ? listarProtocolosDoPca(pcaId, anoMarcados) : listarProtocolos(rep?.id, ano),
    // Gestão do protocolo: as PESSOAS DO GRUPO ativo (as únicas designáveis como Responsável) e as
    // situações cadastradas pelo ADM.
    getGrupoAtivoId(u).then(listarPessoasDoGrupo),
    listarSituacoes(),
    // As EDIÇÕES SALVAS das tabelas desta Mesa (as do usuário e as públicas) — a do PCA tem as suas (outras colunas).
    carregarEdicoes(u?.id ?? null, prefixoEdicoesMesa(pcaId)),
    // O botão "Dados completos" da barra (a preferência do usuário — a Mesa já ABRE assim, sem piscar).
    u ? listarPreferenciasTabela(u.id, PREF_DADOS_COMPLETOS) : Promise.resolve({} as Record<string, unknown>),
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
    usuarioId: u?.id ?? null,
    podeEditar: ctx.podeEditar,
    /** Filtro com que a Mesa ABRE (preferência do Perfil; na Mesa do PCA, todos). */
    filtroInicial: pcaId ? FILTRO_MESA_TODOS : filtroInicialMesa(pref, u?.id ?? null),
    /** O PCA do cabeçalho que está filtrando a Mesa principal (`null` = todos). */
    pcaFiltro,
    /** Mesa do PCA: o ano dos MARCADOS ainda na Mesa do sistema que ela também mostra (`null` = visão desligada). */
    anoMarcados,
    edicoes: { prefixo: prefixoEdicoesMesa(pcaId), ...edicoes },
    /** As tabelas abrem com os DADOS COMPLETOS (texto inteiro, todas as listas) — a escolha do usuário no botão da barra. */
    dadosCompletos: (prefCompletos[PREF_DADOS_COMPLETOS] as { ligado?: unknown } | undefined)?.ligado === true,
  };
}

/**
 * Dados da MESA DO PCA (`MesaPca`) — o MESMO carregamento da aba Mesa do espaço do PCA e da Mesa principal com o seletor
 * de Mesa num PCA (`/painel/mesa?pca=`): a Mesa do PCA (`carregarMesa(u, pcaId)`, com os marcados conforme a
 * Configuração dele) + a ação de cada protocolo incorporado e, dos enviados ainda não incorporados, quantos DFDs já estão
 * em OUTRO PCA (ficam de fora da incorporação).
 */
export async function carregarMesaDoPca(u: UsuarioSessao | null, pca: { id: number; nome: string; ano: number | null }) {
  const [m, vs] = await Promise.all([carregarMesa(u, pca.id), vinculosDoPca(pca.id)]);
  const naoInc = new Set(m.protocolos.filter((p) => p.pcaIncorporadoEm == null).map((p) => p.id));
  const doNaoInc = m.dfds.filter((d) => d.protocoloId != null && naoInc.has(d.protocoloId));
  const emOutro = await dfdsEmOutroPca(
    doNaoInc.map((d) => d.id),
    pca.id,
  );
  const emOutroPcaPorProtocolo: Record<number, number> = {};
  for (const d of doNaoInc)
    if (d.protocoloId != null && emOutro.has(d.id)) emOutroPcaPorProtocolo[d.protocoloId] = (emOutroPcaPorProtocolo[d.protocoloId] ?? 0) + 1;
  const acaoPorProtocolo: Record<number, AcaoDfdPca> = {};
  for (const v of vs) if (v.protocoloId != null && !acaoPorProtocolo[v.protocoloId]) acaoPorProtocolo[v.protocoloId] = v.acao;
  return {
    pca: { id: pca.id, nome: pca.nome, ano: pca.ano },
    emOutroPcaPorProtocolo,
    acaoPorProtocolo,
    marcados: m.anoMarcados != null,
    podeEditar: m.podeEditar,
    dfds: m.dfds,
    protocolos: m.protocolos,
    reparticoes: m.reparticoes,
    reparticaoAtivaId: m.reparticaoAtivaId,
    pcas: m.pcas,
    regras: m.regras,
    orgaos: m.orgaos,
    pessoas: m.pessoas,
    outrasPessoas: m.outrasPessoas,
    situacoes: m.situacoes,
    usuarioId: m.usuarioId,
    edicoes: m.edicoes,
    dadosCompletos: m.dadosCompletos,
  };
}
