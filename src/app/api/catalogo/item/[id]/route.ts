import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { atualizarCatalogoItem, excluirCatalogoItem, removerItemDoCatalogo } from "@/lib/catalogo";
import { patchItemSchema, removerDoCatalogoSchema } from "@/lib/catalogo-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Edita os campos de UM item de catálogo (descrição/unidade/tipos) — só editor. O
 * CÓDIGO é imutável (chave global): para trocá-lo, exclua e crie de novo.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(patchItemSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarCatalogoItem(id, p.data);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "catalogo_item", entidadeId: id, resumo: `Item de catálogo #${id} editado`, depois: p.data });
  return ok();
}

/**
 * Corpo `{catalogoId}` opcional = REMOVER o item de UM catálogo (desfaz o compartilhamento;
 * se era o único catálogo, exclui o item). Sem corpo = EXCLUSÃO total. Só editor.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const rem = removerDoCatalogoSchema.safeParse(await req.json().catch(() => ({})));
  if (rem.success) {
    await removerItemDoCatalogo(id, rem.data.catalogoId);
    await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "catalogo_item", entidadeId: id, resumo: `Item #${id} removido do catálogo #${rem.data.catalogoId} (compartilhamento)`, antes: { catalogoId: rem.data.catalogoId } });
    return ok();
  }
  await excluirCatalogoItem(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "catalogo_item", entidadeId: id, resumo: `Item de catálogo #${id} excluído` });
  return ok();
}
