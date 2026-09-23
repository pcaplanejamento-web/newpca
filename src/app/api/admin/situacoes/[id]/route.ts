import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { situacaoProtocoloSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarSituacao, excluirSituacao, getSituacao } from "@/lib/situacoes";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(situacaoProtocoloSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getSituacao(id);
  if (!antes) return erro("Situação não encontrada.", 404);
  await atualizarSituacao(id, p.data);
  const dd = diffCampos(antes, { ...antes, ...p.data }, ["nome", "cor", "permiteMoverPca", "camadaPca"], {
    nome: "nome",
    cor: "cor",
    permiteMoverPca: "move para o PCA",
    camadaPca: "camada do PCA",
  });
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "situacao_protocolo",
    entidadeId: id,
    resumo: `Situação "${antes.nome}": ${dd.resumo || "editada"}`,
    antes: dd.antes,
    depois: dd.depois,
  });
  return ok();
}

/** Exclui a situação — os protocolos que a usavam ficam SEM situação. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getSituacao(id);
  if (!antes) return erro("Situação não encontrada.", 404);
  await excluirSituacao(id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "situacao_protocolo", entidadeId: id, resumo: `Situação "${antes.nome}" excluída`, antes });
  return ok();
}
