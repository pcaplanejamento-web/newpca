import { intId } from "./api-auth";
import type { CardEmpenho } from "./empenho-cards-core";
import { getCard } from "./empenho-cards";
import { erro } from "./http";

/**
 * O CARD do caminho de uma rota (`/api/empenhos/cards/[id]/…`): o id válido e o card que existe. A PERMISSÃO vem da TELA
 * do card (Empenhos ou Liquidações — `telaDoCard`): a rota confere com `recusa(g.acesso, telaDoCard(card), ação)`.
 */
export async function cardDaRota(ctx: { params: Promise<{ id: string }> }): Promise<{ card: CardEmpenho } | { resp: Response }> {
  const id = intId((await ctx.params).id);
  if (!id) return { resp: erro("ID inválido.") };
  const card = await getCard(id);
  if (!card) return { resp: erro("Card não encontrado.", 404) };
  return { card };
}
