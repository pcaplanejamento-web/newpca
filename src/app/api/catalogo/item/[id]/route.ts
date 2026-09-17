import { exigirEditor, intId } from "@/lib/api-auth";
import { atualizarCatalogoItem, excluirCatalogoItem } from "@/lib/catalogo";
import { patchItemSchema } from "@/lib/catalogo-validation";
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
  return ok();
}

/** Exclui UM item do catálogo (recalcula o total) — só editor. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  await excluirCatalogoItem(id);
  return ok();
}
