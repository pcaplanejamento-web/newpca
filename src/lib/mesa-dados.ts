import { getRegrasAvaliacao } from "./avaliacao";
import type { UsuarioSessao } from "./auth";
import { listarDfds, listarPcas } from "./dfd";
import { getGrupoAtivoId, getReparticaoContexto, getReparticaoFiltro } from "./grupos";
import { listarOrgaos } from "./orgaos";
import { listarProtocolos } from "./protocolo";
import { RESPONSAVEIS_VAZIO } from "./reparticao-responsaveis";
import { dadosMatchPorReparticao, responsaveisPorReparticao } from "./reparticoes";
import { listarSituacoes } from "./situacoes";
import { listarPessoasDoGrupo, pessoasPorIds } from "./usuarios";

/**
 * Dados da MESA (Protocolos · DFDs · Itens) — o MESMO carregamento da tela `/painel/mesa` e da aba
 * Mesa do PCA: listas escopadas pela unidade ativa do head (Geral = tudo) + as unidades enriquecidas
 * com os RESPONSÁVEIS (conferência da assinatura) e os campos de MATCH.
 */
export async function carregarMesa(u: UsuarioSessao | null) {
  const rep = await getReparticaoFiltro(u);
  const [dfds, protocolos, repCtx, pcas, regras, orgaos, pessoas, situacoes] = await Promise.all([
    listarDfds(rep?.id),
    listarProtocolos(rep?.id),
    getReparticaoContexto(u),
    listarPcas(),
    getRegrasAvaliacao(),
    listarOrgaos(),
    // Gestão do protocolo: as PESSOAS DO GRUPO ativo (as únicas designáveis como Responsável) e as
    // situações cadastradas pelo ADM.
    getGrupoAtivoId(u).then(listarPessoasDoGrupo),
    listarSituacoes(),
  ]);
  // Diretório de EXIBIÇÃO (foto + apelido): quem aparece nas colunas Responsável/Distribuição e não é do
  // grupo (outro grupo, inativo) — só para mostrar, nunca como opção.
  const doGrupo = new Set(pessoas.map((p) => p.id));
  const outrasPessoas = await pessoasPorIds(
    protocolos.flatMap((p) => [p.responsavelId, p.distribuidorId]).filter((id) => id != null && !doGrupo.has(id)),
  );
  const ids = repCtx.lista.map((r) => r.id);
  const [respMap, matchMap] = await Promise.all([responsaveisPorReparticao(ids), dadosMatchPorReparticao(ids)]);
  const reparticoes = repCtx.lista.map((r) => ({
    ...r,
    responsaveis: respMap[r.id] ?? RESPONSAVEIS_VAZIO,
    numeroInteressado: matchMap[r.id]?.numeroInteressado ?? null,
    setorRequisitante: matchMap[r.id]?.setorRequisitante ?? null,
    orgaoId: matchMap[r.id]?.orgaoId ?? null,
    orgaoProprio: matchMap[r.id]?.orgaoProprio ?? false,
    oculto: matchMap[r.id]?.oculto ?? false,
  }));
  return {
    dfds,
    protocolos,
    reparticoes,
    // Em "Geral" (rep=null) não há unidade ativa específica — Geral comporta qualquer unidade.
    reparticaoAtivaId: rep?.id ?? null,
    pcas,
    regras,
    orgaos,
    pessoas,
    outrasPessoas,
    situacoes,
    usuarioId: u?.id ?? null,
    podeEditar: u?.role === "admin" || u?.role === "gestor",
  };
}
