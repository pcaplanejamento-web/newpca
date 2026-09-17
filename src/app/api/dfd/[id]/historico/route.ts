import { exigirUsuario, intId } from "@/lib/api-auth";
import { historicoDe } from "@/lib/auditoria";
import { getDfdReparticao } from "@/lib/dfd";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Histórico de alterações DESTE DFD — escopado por unidade (quem vê o DFD vê o histórico). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (dfd.reparticaoId != null && !lista.some((r) => r.id === dfd.reparticaoId)) return erro("Sem acesso a este DFD.", 403);
  return ok({ historico: await historicoDe("dfd", id) });
}
