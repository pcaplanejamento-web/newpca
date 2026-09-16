import { exigirEditor, intId } from "@/lib/api-auth";
import { atualizarCatalogo, excluirCatalogo, getCatalogo } from "@/lib/catalogo";
import { patchCatalogoSchema } from "@/lib/catalogo-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Edita (nome/tipos padrão) ou EXCLUI um catálogo — só editor. Excluir apaga os itens. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(patchCatalogoSchema, req);
  if ("resp" in p) return p.resp;
  if (!(await getCatalogo(id))) return erro("Catálogo não encontrado.", 404);
  await atualizarCatalogo(id, p.data);
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  await excluirCatalogo(id);
  return ok();
}
