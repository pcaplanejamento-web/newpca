import { getRegrasAvaliacao } from "./avaliacao";
import type { UsuarioSessao } from "./auth";
import { listarDfds, listarPcas } from "./dfd";
import { getGrupoAtivoId, getReparticaoContexto, getReparticaoFiltro } from "./grupos";
import { listarOrgaos } from "./orgaos";
import { listarProtocolos, listarProtocolosDoPca } from "./protocolo";
import { RESPONSAVEIS_VAZIO } from "./reparticao-responsaveis";
import { dadosMatchPorReparticao, responsaveisPorReparticao } from "./reparticoes";
import { listarSituacoes } from "./situacoes";
import { listarPessoasDoGrupo, pessoasPorIds } from "./usuarios";

/** O escopo de acesso por unidade das rotas: sem unidade OU uma unidade da lista (admin = todas). */
export function acessivelNaLista(lista: { id: number }[]) {
  const ids = new Set(lista.map((r) => r.id));
  return (reparticaoId: number | null | undefined) => reparticaoId == null || ids.has(reparticaoId);
}

/**
 * Dados da MESA (Protocolos · DFDs · Itens) — o MESMO carregamento da tela `/painel/mesa` e da aba Mesa do
 * PCA. Mesa PRINCIPAL: escopada pela unidade ativa do head (Geral = tudo), sem os protocolos enviados a um
 * PCA. Mesa do PCA (`pcaId`): só os protocolos ENVIADOS a ele, nas unidades ACESSÍVEIS ao usuário (a Mesa do
 * PCA é independente da unidade ativa). Mais as unidades enriquecidas com os RESPONSÁVEIS (conferência da
 * assinatura) e os campos de MATCH.
 */
/**
 * O que os BANNERS gravados (`BannersMesa`: protocolo · DFD · item) precisam: as unidades ACESSÍVEIS enriquecidas com os
 * RESPONSÁVEIS (conferência da assinatura) e os campos de MATCH, as regras do ADM, os órgãos, os PCAs e se edita. Usado
 * pela Mesa (`carregarMesa`) e pela consulta do Dashboard do PCA.
 */
export async function contextoBanners(u: UsuarioSessao | null) {
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
  const [rep, ctx] = await Promise.all([getReparticaoFiltro(u), contextoBanners(u)]);
  const acessivel = acessivelNaLista(ctx.lista);
  const [dfdsBrutos, protocolosBrutos, pessoas, situacoes] = await Promise.all([
    pcaId ? listarDfds(undefined, pcaId) : listarDfds(rep?.id),
    pcaId ? listarProtocolosDoPca(pcaId) : listarProtocolos(rep?.id),
    // Gestão do protocolo: as PESSOAS DO GRUPO ativo (as únicas designáveis como Responsável) e as
    // situações cadastradas pelo ADM.
    getGrupoAtivoId(u).then(listarPessoasDoGrupo),
    listarSituacoes(),
  ]);
  const protocolos = pcaId ? protocolosBrutos.filter((p) => acessivel(p.reparticaoId)) : protocolosBrutos;
  const dfds = pcaId ? dfdsBrutos.filter((d) => acessivel(d.reparticaoId)) : dfdsBrutos;
  // Diretório de EXIBIÇÃO (foto + apelido): quem aparece nas colunas Responsável/Distribuição e não é do
  // grupo (outro grupo, inativo) — só para mostrar, nunca como opção.
  const doGrupo = new Set(pessoas.map((p) => p.id));
  const outrasPessoas = await pessoasPorIds(
    protocolos.flatMap((p) => [p.responsavelId, p.distribuidorId]).filter((id) => id != null && !doGrupo.has(id)),
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
  };
}
