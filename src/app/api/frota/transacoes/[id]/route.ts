import { podeTela } from "@/lib/acesso";
import { exigirSessao, intId } from "@/lib/api-auth";
import { escopoDaFrota, transacaoCompleta } from "@/lib/frota";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** UMA transação inteira (o banner do abastecimento ou da manutenção): a tela do tipo (ou o painel Frotas), no escopo. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Id inválido.", 422);
  const t = await transacaoCompleta(id, await escopoDaFrota());
  const acao = "visualizar" as const;
  if (!t || !(podeTela(g.acesso, t.tipo === "abastecimento" ? "combustivel" : "manutencao")[acao] || podeTela(g.acesso, "frotas")[acao])) return erro("Não encontrado.", 404);
  return ok({ transacao: t });
}
