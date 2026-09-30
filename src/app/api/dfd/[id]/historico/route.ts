import { dfdLegivelNaMesa, escopoMesa, MSG_SEM_ACESSO_DFD } from "@/lib/acesso-mesa";
import { exigirAcesso, intId } from "@/lib/api-auth";
import { historicoDfd } from "@/lib/auditoria";
import { getDfdReparticao } from "@/lib/dfd";
import { regraHistoricoMesa, redigirHistorico } from "@/lib/historico-redacao";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Histórico de alterações DESTE DFD (campos, seções, assinaturas e ITENS — cada uma com a origem e o
 * protocolo por onde passou) — escopado por unidade (quem vê o DFD vê o histórico). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const esc = await escopoMesa();
  if (!esc || !(await dfdLegivelNaMesa(esc, { ...dfd, id }))) return erro(MSG_SEM_ACESSO_DFD, 403);
  // O que o papel não vê (ex.: o Responsável) também não sai pelo histórico.
  return ok({ historico: redigirHistorico(await historicoDfd(id), regraHistoricoMesa(esc.vis)) });
}
