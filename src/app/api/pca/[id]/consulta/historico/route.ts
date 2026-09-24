import { intId } from "@/lib/api-auth";
import { getUsuarioAtual } from "@/lib/auth";
import { erro, ok } from "@/lib/http";
import { consultaHistorico } from "@/lib/pca-espaco";

export const dynamic = "force-dynamic";

/**
 * CONSULTA PÚBLICA — histórico de um DFD (`?dfd=`) ou protocolo (`?protocolo=`) do PCA: só o que passou por
 * protocolos INCORPORADOS ao PCA, sem o autor e sem dados pessoais/assinaturas.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const pcaId = intId((await ctx.params).id);
  const q = new URL(req.url).searchParams;
  const dfd = intId(q.get("dfd") ?? "");
  const protocolo = intId(q.get("protocolo") ?? "");
  if (!pcaId || (!dfd && !protocolo)) return erro("Parâmetros inválidos.");
  const historico = await consultaHistorico(pcaId, dfd ? { dfd } : { protocolo: protocolo as number }, !!(await getUsuarioAtual()));
  return historico ? ok({ historico }) : erro("Não encontrado neste PCA.", 404);
}
