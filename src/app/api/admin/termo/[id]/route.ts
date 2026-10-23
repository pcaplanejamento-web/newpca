import { exigirAdmin, intId } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { situacaoDaVersao, termoPorId } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/** Uma versão: o texto congelado + quem aceitou e quem ainda deve. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Versão inválida.", 400);
  const t = await termoPorId(id);
  if (!t) return erro("Versão não encontrada.", 404);
  return ok({ termo: { id: t.id, versao: t.versao, estado: t.estado, texto: t.textoFinal, hash: t.hash, publicadoEm: t.publicadoEm, publicadoPor: t.publicadoPor }, ...(await situacaoDaVersao(id)) });
}
