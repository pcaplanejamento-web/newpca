import { exigirUsuario, intId } from "@/lib/api-auth";
import { historicoProtocolo } from "@/lib/auditoria";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok } from "@/lib/http";
import { getProtocoloReparticao } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/** Histórico CONECTADO deste protocolo (capa/gestão + os DFDs e itens que passaram por ele) — escopado
 * por unidade. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const proto = await getProtocoloReparticao(id);
  if (!proto) return erro("Protocolo não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (proto.reparticaoId != null && !lista.some((r) => r.id === proto.reparticaoId)) return erro("Sem acesso a este protocolo.", 403);
  return ok({ historico: await historicoProtocolo(id) });
}
