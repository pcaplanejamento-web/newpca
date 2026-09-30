import { getAcesso, podeMesa } from "./acesso";
import { getRegrasAvaliacao } from "./avaliacao";
import type { UsuarioSessao } from "./auth";
import { listarDfds, listarPcas } from "./dfd";
import { getDb } from "./db";
import { carregarEdicoes } from "./edicoes-tabela";
import { idDoFiltro } from "./escopo-unidades-core";
import { getGrupoAtivoId, unidadesAcessiveis, unidadesDaSessao } from "./grupos";
import { consultaExecucao } from "./mesa-execucao-sql";
import { FILTRO_MESA_TODOS, filtroInicialMesa, PREF_DADOS_COMPLETOS } from "./mesa-filtros";
import type { AtividadeTupla } from "./mesa-metricas";
import { listarOrgaos } from "./orgaos";
import { PODE_MESA_NADA } from "./papeis-core";
import type { AcaoDfdPca } from "./pca-core";
import { anoMarcadosDoPca, dfdsEmOutroPca, vinculosDoPca } from "./pca-espaco";
import { getPcaFiltro, pcasDoFiltro } from "./pca-filtro";
import { listarPreferenciasTabela } from "./preferencias-tabela";
import { listarProtocolos, listarProtocolosDoPca } from "./protocolo";
import { RESPONSAVEIS_VAZIO } from "./reparticao-responsaveis";
import { dadosMatchPorReparticao, responsaveisPorReparticao } from "./reparticoes";
import { listarSituacoes } from "./situacoes";
import { listarPessoasDoGrupo, mesaResponsavelGravado, pessoasPorIds } from "./usuarios";

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
 * RESPONSÁVEIS (conferência da assinatura) e os campos de MATCH, as regras do ADM, os órgãos, os PCAs e o que o PAPEL
 * permite nas duas Mesas (cada protocolo segue a sua).
 */
async function contextoBanners(u: UsuarioSessao | null) {
  // As unidades ACESSÍVEIS (com a "Geral" no grupo ou o ADM, todas — os banners conferem e editam o de qualquer uma).
  const un = await unidadesDaSessao(u);
  const lista = await unidadesAcessiveis(un);
  const ids = lista.map((r) => r.id);
  const [respMap, matchMap, pcas, regras, orgaos, acesso] = await Promise.all([
    responsaveisPorReparticao(ids),
    dadosMatchPorReparticao(ids),
    listarPcas(),
    getRegrasAvaliacao(),
    listarOrgaos(),
    getAcesso(),
  ]);
  const reparticoes = lista.map((r) => ({
    ...r,
    responsaveis: respMap[r.id] ?? RESPONSAVEIS_VAZIO,
    numeroInteressado: matchMap[r.id]?.numeroInteressado ?? null,
    setorRequisitante: matchMap[r.id]?.setorRequisitante ?? null,
    orgaoId: matchMap[r.id]?.orgaoId ?? null,
    orgaoProprio: matchMap[r.id]?.orgaoProprio ?? false,
    oculto: matchMap[r.id]?.oculto ?? false,
  }));
  return { un, reparticoes, pcas, regras, orgaos, pode: acesso ? podeMesa(acesso) : PODE_MESA_NADA };
}

/** O prefixo das chaves das edições salvas das tabelas da Mesa (a principal e a do PCA têm as suas). */
const prefixoEdicoesMesa = (pcaId?: number) => (pcaId ? "mesa-pca:" : "mesa:");

export async function carregarMesa(u: UsuarioSessao | null, pcaId?: number) {
  const [ctx, pref] = await Promise.all([contextoBanners(u), pcaId ? ("todos" as const) : mesaResponsavelGravado(u?.id)]);
  // Mesa principal: a unidade ATIVA (a "Geral" = todas; sem grupo/unidade = nada). Mesa do PCA: o escopo de acesso.
  const repId = idDoFiltro(ctx.un.filtro);
  const nada = repId === false;
  const acessivel = ctx.un.acessivel;
  // PCA do CABEÇALHO (só a Mesa principal — a do PCA já é de um PCA): filtra pelo ano do PCA do protocolo/DFD.
  // Mesa do PCA com a visão dos MARCADOS ligada (Configuração do PCA): também os do ano dele ainda na Mesa do sistema.
  const [pcaFiltro, anoMarcados] = await Promise.all([
    pcaId ? null : pcasDoFiltro(ctx.pcas).then(getPcaFiltro),
    pcaId ? anoMarcadosDoPca(pcaId) : null,
  ]);
  const ano = pcaFiltro?.ano ?? null;
  const [dfdsBrutos, protocolosBrutos, pessoas, situacoes, edicoes, prefCompletos] = await Promise.all([
    pcaId ? listarDfds(undefined, pcaId, null, anoMarcados) : nada ? [] : listarDfds(repId ?? undefined, undefined, ano),
    pcaId ? listarProtocolosDoPca(pcaId, anoMarcados) : nada ? [] : listarProtocolos(repId ?? undefined, ano),
    // Gestão do protocolo: as PESSOAS DO GRUPO ativo (as únicas designáveis como Responsável) e as
    // situações cadastradas pelo ADM.
    // Sem grupo ativo, todas as pessoas só para o ADM (os demais, ninguém — não veem dado nenhum).
    getGrupoAtivoId(u).then((g) => (g == null && !u?.admin ? [] : listarPessoasDoGrupo(g))),
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
    // Em "Geral" não há unidade ativa específica — Geral comporta qualquer unidade.
    reparticaoAtivaId: repId || null,
    pcas: ctx.pcas,
    regras: ctx.regras,
    orgaos: ctx.orgaos,
    pessoas,
    outrasPessoas,
    situacoes,
    usuarioId: u?.id ?? null,
    pode: ctx.pode,
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
    pode: m.pode,
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

/**
 * HISTÓRICO DE EXECUÇÃO da Mesa principal (as métricas de governança do Dashboard): os REENVIOS (correções) e as AÇÕES
 * dos protocolos DA MESA — o MESMO escopo das listas (unidade ativa, PCA do cabeçalho, fora de um PCA) —, por protocolo,
 * pessoa, dia (Brasília) e tipo, em tuplas compactas.
 */
export async function execucaoDaMesa(reparticaoId: number | null, anoPca: number | null): Promise<AtividadeTupla[]> {
  const linhas = await consultaExecucao(getDb(), { reparticaoId, anoPca });
  return linhas.flatMap((l): AtividadeTupla[] =>
    l.tipo === "reenvio" || l.tipo === "acao" ? [[l.protocoloId, l.usuarioId ?? null, l.dia, l.tipo, Number(l.n) || 0]] : [],
  );
}
