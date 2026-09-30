import { escopoMesa, MSG_SEM_ACESSO_PROTOCOLO, protocoloLegivel } from "@/lib/acesso-mesa";
import { exigirAcesso, intId } from "@/lib/api-auth";
import { historicoProtocolo } from "@/lib/auditoria";
import { regraHistoricoMesa, redigirHistorico } from "@/lib/historico-redacao";
import { erro, ok } from "@/lib/http";
import { getProtocoloReparticao } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/** Histórico CONECTADO deste protocolo (capa/gestão + os DFDs e itens que passaram por ele) — escopado
 * por unidade. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const proto = await getProtocoloReparticao(id);
  if (!proto) return erro("Protocolo não encontrado.", 404);
  const esc = await escopoMesa();
  if (!esc || !protocoloLegivel(esc, { id, reparticaoId: proto.reparticaoId })) return erro(MSG_SEM_ACESSO_PROTOCOLO, 403);
  // O que o papel não vê (ex.: o Responsável) também não sai pelo histórico.
  return ok({ historico: redigirHistorico(await historicoProtocolo(id), regraHistoricoMesa(esc.vis)) });
}
