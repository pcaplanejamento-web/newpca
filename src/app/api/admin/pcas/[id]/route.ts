import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { atualizarPca, definirPcaAtivo, excluirPca } from "@/lib/dfd";
import { patchPcaSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Marca o PCA como ativo (`{ativo:true}`) OU edita nome/ano. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");

  const p = await parseCorpo(patchPcaSchema, req);
  if ("resp" in p) return p.resp;

  if ("ativo" in p.data) {
    await definirPcaAtivo(id);
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "pca", entidadeId: id, resumo: `PCA #${id} definido como ativo` });
  } else {
    await atualizarPca(id, p.data);
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "pca", entidadeId: id, resumo: `PCA #${id} editado`, depois: p.data });
  }
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  await excluirPca(id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "pca", entidadeId: id, resumo: `PCA #${id} excluído` });
  return ok();
}
