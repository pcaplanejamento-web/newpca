import { passaFiltroId } from "./escopo-unidades-core";
import type { UsuarioSessao } from "./auth";
import { protocolosParaAutomacao } from "./automacao";
import { getGrupoAtivoId } from "./grupos";
import { unidadeDoModulo } from "./escopo-cabecalho";
import { contextoBanners } from "./mesa-dados";
import { listarSituacoes } from "./situacoes";
import { listarPessoasDoGrupo, pessoasPorIds } from "./usuarios";

/** Tudo o que a tela da Automação recebe (a página e o `GET /api/admin/automacao/contexto` — a Mesa roda a automação
 * em segundo plano sem abrir a tela). Responsável = as pessoas do GRUPO ativo + as já gravadas de fora dele (só exibidas);
 * os banners da Mesa com o MESMO contexto da Mesa. */
export async function dadosDaAutomacao(u: UsuarioSessao) {
  const [todos, ctx, situacoes, grupoId, rep] = await Promise.all([
    protocolosParaAutomacao(),
    contextoBanners(u),
    listarSituacoes(),
    getGrupoAtivoId(u),
    unidadeDoModulo("automacao", u),
  ]);
  // A unidade do CABEÇALHO (Configurações → Filtro da unidade): só os protocolos dela.
  const protocolos = rep.id === null ? todos : rep.id === false ? [] : todos.filter((p) => passaFiltroId(rep.id, p.reparticaoId));
  const pessoas = await listarPessoasDoGrupo(grupoId);
  const doGrupo = new Set(pessoas.map((p) => p.id));
  const outras = await pessoasPorIds(protocolos.map((p) => p.responsavelId).filter((id) => id != null && !doGrupo.has(id)));
  return {
    protocolos,
    gestao: { pessoas, outras, situacoes: situacoes.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor })), usuarioId: u.id },
    banners: { pode: ctx.pode, reparticoes: ctx.reparticoes, regras: ctx.regras, orgaos: ctx.orgaos, pcas: ctx.pcas },
  };
}
export type DadosAutomacao = Awaited<ReturnType<typeof dadosDaAutomacao>>;
