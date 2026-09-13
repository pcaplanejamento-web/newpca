import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { excluirProtocolo, getProtocolo } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/** Protocolo completo + seus DFDs (para o banner de visualização). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const protocolo = await getProtocolo(id);
  if (!protocolo) return erro("Protocolo não encontrado.", 404);
  return ok({ protocolo });
}

/** Exclui o protocolo. Os DFDs permanecem (apenas desvinculados). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  await excluirProtocolo(id);
  return ok();
}
