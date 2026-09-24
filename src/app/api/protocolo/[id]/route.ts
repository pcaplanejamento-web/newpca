import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { detalheSeguro, registrarAuditoria } from "@/lib/auditoria";
import { listarDfdsCompletosDoProtocolo } from "@/lib/dfd";
import { editarProtocoloSchema } from "@/lib/dfd-validation";
import { getGrupoAtivoId, getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarProtocolo, detalheEdicaoProtocolo, excluirProtocolo, getProtocolo, getProtocoloReparticao, listarSobrescritos } from "@/lib/protocolo";
import { unidadesConferencia } from "@/lib/reparticoes";
import { getSituacao } from "@/lib/situacoes";
import { edicaoPermitidaTravado, estaTravado, mensagemTravaPca, motivoNaoExcluirProtocolo } from "@/lib/pca-core";
import { pcaDeProtocolos } from "@/lib/trava-pca";
import { pessoaDoGrupo } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** Protocolo + seus DFDs (banner) — escopado por unidade. Com `?completo=1`, os DFDs vêm COMPLETOS
 * (cabeçalho/seções/assinaturas/itens) + as unidades deles com os responsáveis — o banner do protocolo
 * GRAVADO usa a MESMA conferência/componentes da análise. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const protocolo = await getProtocolo(id);
  if (!protocolo) return erro("Protocolo não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (protocolo.reparticaoId != null && !lista.some((r) => r.id === protocolo.reparticaoId)) {
    return erro("Sem acesso a este protocolo.", 403);
  }
  if (new URL(req.url).searchParams.get("completo") !== "1") return ok({ protocolo });
  const [dfds, sobrescritos] = await Promise.all([
    listarDfdsCompletosDoProtocolo(id),
    // O RASTRO dos DFDs sobrescritos por outro protocolo (cinza) — com o protocolo ATUAL de cada um.
    listarSobrescritos(id, (rid) => rid == null || lista.some((r) => r.id === rid)),
  ]);
  const unidades = await unidadesConferencia(dfds.map((d) => d.reparticaoId));
  return ok({ protocolo, dfds, unidades, sobrescritos });
}

/** Edita um protocolo já gravado — o banner (capa/unidade) ou a célula da Mesa (responsável/situação).
 * Escopo por unidade; o responsável tem de ser uma pessoa ATIVA do grupo e a situação, uma cadastrada pelo ADM. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(editarProtocoloSchema, req);
  if ("resp" in p) return p.resp;
  const { origem, ...campos } = p.data;

  const proto = await getProtocolo(id);
  if (!proto) return erro("Protocolo não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);
  if (!acessivel(proto.reparticaoId)) return erro("Sem acesso a este protocolo.", 403);
  // TRAVA do PCA: incorporado ⇒ só a gestão (responsável/situação) passa.
  if (estaTravado(proto) && !edicaoPermitidaTravado(campos)) return erro(mensagemTravaPca(proto.pcaNome), 423);
  if (campos.reparticaoId != null && !acessivel(campos.reparticaoId)) {
    return erro("Sem acesso à unidade de destino.", 403);
  }
  // Responsável: só uma pessoa ATIVA do GRUPO ativo de quem edita (manter o atual nunca é recusado).
  if (campos.responsavelId != null && campos.responsavelId !== proto.responsavelId && !(await pessoaDoGrupo(campos.responsavelId, await getGrupoAtivoId(a.u))))
    return erro("Escolha como responsável uma pessoa ativa do seu grupo.", 422);
  if (campos.situacaoId != null && !(await getSituacao(campos.situacaoId))) return erro("Situação não encontrada (Configurações → Situações).", 422);

  await atualizarProtocolo(id, campos);
  // Histórico: o que mudou, antes → depois, com rótulos legíveis (sigla da unidade, nomes).
  const detalhe = await detalheSeguro(() => detalheEdicaoProtocolo(proto, campos), {});
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "protocolo",
    entidadeId: id,
    resumo: `Protocolo ${proto.numero}: ${detalhe.campos?.map((c) => c.rotulo).join(", ") || "editado"}`,
    protocoloId: id,
    origem: origem ?? "banner",
    detalhe,
  });
  return ok();
}

/** Exclui o protocolo EM CASCATA (os DFDs vinculados e seus itens são apagados junto — `excluirProtocolo`). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const proto = await getProtocoloReparticao(id);
  if (!proto) return erro("Protocolo não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (proto.reparticaoId != null && !lista.some((r) => r.id === proto.reparticaoId)) {
    return erro("Sem acesso a este protocolo.", 403);
  }
  // Protocolo em um PCA (enviado ou incorporado) NÃO é excluído: o enviado volta pela "Devolver à Mesa" (e então sai
  // da Mesa principal); o incorporado é permanente (423, a trava).
  const noPca = (await pcaDeProtocolos([id])).get(id);
  if (noPca) return erro(motivoNaoExcluirProtocolo(noPca, noPca.nome) ?? "Protocolo em um PCA não é excluído.", noPca.pcaIncorporadoEm ? 423 : 409);
  await excluirProtocolo(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "protocolo", entidadeId: id, resumo: `Protocolo #${id} excluído (com os DFDs vinculados)`, protocoloId: id, origem: "exclusao" });
  return ok();
}
