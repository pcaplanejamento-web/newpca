import { intId } from "@/lib/api-auth";
import { getUsuarioAtual } from "@/lib/auth";
import { erro, ok } from "@/lib/http";
import { consultaDfd } from "@/lib/pca-espaco";

export const dynamic = "force-dynamic";

/**
 * CONSULTA PÚBLICA — um DFD do PCA (tela inicial e painel), HIGIENIZADO: sem CPF, matrícula, e-mail, telefone e
 * assinaturas; só os itens que contam no PCA. PCA publicado = qualquer visitante; em Preview, só logado.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; dfdId: string }> }) {
  const p = await ctx.params;
  const pcaId = intId(p.id);
  const dfdId = intId(p.dfdId);
  if (!pcaId || !dfdId) return erro("ID inválido.");
  const dfd = await consultaDfd(pcaId, dfdId, !!(await getUsuarioAtual()));
  return dfd ? ok({ dfd }) : erro("DFD não encontrado neste PCA.", 404);
}
