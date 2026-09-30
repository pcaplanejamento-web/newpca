import { intId } from "@/lib/api-auth";
import { vePreviaPca } from "@/lib/acesso";
import { erro, ok } from "@/lib/http";
import { consultaProtocolo } from "@/lib/pca-espaco";

export const dynamic = "force-dynamic";

/**
 * CONSULTA PÚBLICA — um protocolo INCORPORADO ao PCA: a capa (sem CPF/CNPJ) + os DFDs dele que contam no PCA.
 * PCA publicado = qualquer visitante; em Preview, só quem VISUALIZA o PCA (grupo + papel).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; protocoloId: string }> }) {
  const p = await ctx.params;
  const pcaId = intId(p.id);
  const protocoloId = intId(p.protocoloId);
  if (!pcaId || !protocoloId) return erro("ID inválido.");
  const protocolo = await consultaProtocolo(pcaId, protocoloId, await vePreviaPca());
  return protocolo ? ok({ protocolo }) : erro("Protocolo não encontrado neste PCA.", 404);
}
