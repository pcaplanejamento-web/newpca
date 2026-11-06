import { intId } from "@/lib/api-auth";
import { erro } from "@/lib/http";
import { pesquisaPublica } from "@/lib/pesquisa-publica";

export const dynamic = "force-dynamic";

/**
 * CONSULTA PÚBLICA — o índice da PESQUISA do cabeçalho da tela pública (sem sessão): só PCA publicado e só as abas que o
 * ADM publicou, com os textos livres mascarados (`pesquisaPublica`). Fora disso, 404 (não revela o que existe). O
 * navegador guarda na memória da aba e procura nele (`PesquisaPublica`).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const pcaId = intId((await ctx.params).id);
  const corpo = pcaId ? await pesquisaPublica(pcaId) : null;
  if (!corpo) return erro("PCA não encontrado.", 404);
  return new Response(corpo, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
