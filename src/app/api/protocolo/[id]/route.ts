import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok } from "@/lib/http";
import { excluirProtocolo, getProtocolo, getProtocoloReparticao } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/** Protocolo completo + seus DFDs (banner de visualização) — escopado por repartição. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const protocolo = await getProtocolo(id);
  if (!protocolo) return erro("Protocolo não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (protocolo.reparticaoId != null && !lista.some((r) => r.id === protocolo.reparticaoId)) {
    return erro("Sem acesso a este protocolo.", 403);
  }
  return ok({ protocolo });
}

/** Exclui o protocolo. Os DFDs permanecem (apenas desvinculados). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const proto = await getProtocoloReparticao(id);
  if (!proto) return erro("Protocolo não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (proto.reparticaoId != null && !lista.some((r) => r.id === proto.reparticaoId)) {
    return erro("Sem acesso a este protocolo.", 403);
  }
  await excluirProtocolo(id);
  return ok();
}
