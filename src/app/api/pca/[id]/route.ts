import { exigirEditor, intId } from "@/lib/api-auth";
import { excluirPca } from "@/lib/dfd";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  await excluirPca(id);
  return ok();
}
