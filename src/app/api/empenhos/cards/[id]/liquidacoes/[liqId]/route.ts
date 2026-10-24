import { exigirSessao, intId, recusa } from "@/lib/api-auth";
import { cardDaRota } from "@/lib/empenho-card-rota";
import { telaDoCard } from "@/lib/empenho-cards-core";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { liquidacaoCompleta } from "@/lib/liquidacoes-tela";

export const dynamic = "force-dynamic";

/**
 * UMA liquidação do card com TUDO (o registro, o órgão e a unidade do cadastro e o EMPENHO ligado pelo número — de qualquer
 * ano) — o banner da aba Liquidações. Fora do escopo da pessoa responde como inexistente (não revela).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; liqId: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "visualizar");
  if (negado) return negado;
  const id = intId((await ctx.params).liqId);
  if (id == null) return erro("Liquidação inválida.", 422);
  const liquidacao = await liquidacaoCompleta(a.card.id, id, await escopoDosEmpenhos(), getDb());
  if (!liquidacao) return erro("Liquidação não encontrada.", 404);
  return ok({ liquidacao });
}
