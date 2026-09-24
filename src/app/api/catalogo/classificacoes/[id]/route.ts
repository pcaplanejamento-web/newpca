import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarClassificacao, excluirClassificacao, getClassificacao, prepararClassificacao } from "@/lib/padronizacao";
import { classificacaoItemSchema } from "@/lib/padronizacao-validation";

export const dynamic = "force-dynamic";

const ROTULOS = { nome: "nome", cor: "cor", palavras: "palavras-chave" };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(classificacaoItemSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getClassificacao(id);
  if (!antes) return erro("Classificação não encontrada.", 404);
  const pr = await prepararClassificacao(p.data, id);
  if ("erro" in pr) return erro(pr.erro, pr.status);
  await atualizarClassificacao(id, pr.dados);
  const dd = diffCampos(antes, { ...antes, ...pr.dados }, ["nome", "cor", "palavras"], ROTULOS);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "classificacao_item",
    entidadeId: id,
    resumo: `Classificação "${antes.nome}": ${dd.resumo || "editada"}`,
    antes: dd.antes,
    depois: dd.depois,
  });
  return ok();
}

/** Exclui a classificação — as unidades que a indicavam ficam sem classificação; os itens voltam a ser reclassificados. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getClassificacao(id);
  if (!antes) return erro("Classificação não encontrada.", 404);
  await excluirClassificacao(id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "classificacao_item", entidadeId: id, resumo: `Classificação "${antes.nome}" excluída`, antes });
  return ok();
}
