import { exigirAdmin, intId } from "@/lib/api-auth";
import { cadastroParaVinculos, catalogoCenti, conflitosEntreCards, getCard, listarCards, mapaOrgaosGestores, vinculosDoCard } from "@/lib/empenho-cards";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Um CARD da aba Importações: o resumo e, no de EMPENHOS, o que a aba Vínculos e a Configuração usam (os vínculos, o
 * catálogo da Centi, o cadastro, os conflitos entre cards e o mapa dos órgãos gestores) — lidos sob demanda.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigirAdmin();
  if ("erro" in a) return a.erro;
  const id = intId((await params).id);
  if (id == null) return erro("Card inválido.", 400);
  const base = await getCard(id);
  if (!base) return erro("Card não encontrado.", 404);
  const [card] = await listarCards(null, base.tipo, id);
  if (!card) return erro("Card não encontrado.", 404);
  if (card.tipo !== "empenhos") return ok({ card });
  const [vinculos, catalogo, cadastro, conflitos, mapa] = await Promise.all([vinculosDoCard(id), catalogoCenti(), cadastroParaVinculos(), conflitosEntreCards(id), mapaOrgaosGestores()]);
  return ok({ card, vinculos, catalogo, cadastro, conflitos, mapa });
}
