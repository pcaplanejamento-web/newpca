import { exigirAdmin, intId } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { historicoDeAcesso } from "@/lib/seguranca-alertas";

export const dynamic = "force-dynamic";

/** O HISTÓRICO DE ACESSO de um usuário (o banner do usuário, ADM). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (id == null) return erro("Usuário inválido.", 400);
  return ok(await historicoDeAcesso(id));
}
