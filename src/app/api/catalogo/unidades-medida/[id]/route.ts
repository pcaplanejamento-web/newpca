import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarUnidadeMedida, excluirUnidadeMedida, getUnidadeMedida, prepararUnidade } from "@/lib/padronizacao";
import { unidadeMedidaSchema } from "@/lib/padronizacao-validation";

export const dynamic = "force-dynamic";

const ROTULOS = { sigla: "sigla", nome: "nome", sinonimos: "sinônimos", classificacaoId: "classificação" };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(unidadeMedidaSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getUnidadeMedida(id);
  if (!antes) return erro("Unidade de medida não encontrada.", 404);
  const pr = await prepararUnidade(p.data, id);
  if ("erro" in pr) return erro(pr.erro, pr.status);
  await atualizarUnidadeMedida(id, pr.dados);
  const dd = diffCampos(antes, { ...antes, ...pr.dados }, ["sigla", "nome", "sinonimos", "classificacaoId"], ROTULOS);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "unidade_medida",
    entidadeId: id,
    resumo: `Unidade de medida ${antes.sigla}: ${dd.resumo || "editada"}`,
    antes: dd.antes,
    depois: dd.depois,
  });
  return ok();
}

/** Exclui a unidade — os itens que a usavam passam a "não cadastrada" (nada é gravado nos itens). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getUnidadeMedida(id);
  if (!antes) return erro("Unidade de medida não encontrada.", 404);
  await excluirUnidadeMedida(id);
  await registrarAuditoria({
    usuario: g.u,
    acao: "excluir",
    entidade: "unidade_medida",
    entidadeId: id,
    resumo: `Unidade de medida ${antes.sigla} (${antes.nome}) excluída`,
    antes,
  });
  return ok();
}
