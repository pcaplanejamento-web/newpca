import { dfdLegivelNaMesa, escopoMesa, MSG_SEM_ACESSO_DFD } from "@/lib/acesso-mesa";
import { exigirAcesso, intId } from "@/lib/api-auth";
import { consultaHistoricoCenti } from "@/lib/conferencia-centi-sql";
import { getDb } from "@/lib/db";
import { getDfdReparticao } from "@/lib/dfd";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O HISTÓRICO da conferência DESTE DFD com a Centi (as 20 últimas mudanças do resultado) — o mesmo escopo do histórico
 * do DFD (quem vê o DFD na Mesa vê as conferências dele). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const esc = await escopoMesa();
  if (!esc || !(await dfdLegivelNaMesa(esc, { ...dfd, id }))) return erro(MSG_SEM_ACESSO_DFD, 403);
  return ok({ historico: await consultaHistoricoCenti(getDb(), id) });
}
