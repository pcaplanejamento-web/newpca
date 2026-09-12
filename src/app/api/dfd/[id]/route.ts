import { exigirEditor, intId } from "@/lib/api-auth";
import { excluirDfd } from "@/lib/dfd";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const r = await excluirDfd(id);
  if (!r.ok) return erro(r.erro, 409);
  return ok();
}
