import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { editarProtocoloSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarProtocolo, excluirProtocolo, getProtocolo, getProtocoloReparticao } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/** Protocolo completo + seus DFDs (banner de visualização) — escopado por unidade. */
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

/** Edita um protocolo já gravado (banner destravado) — escopo por unidade. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(editarProtocoloSchema, req);
  if ("resp" in p) return p.resp;

  const proto = await getProtocoloReparticao(id);
  if (!proto) return erro("Protocolo não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);
  if (!acessivel(proto.reparticaoId)) return erro("Sem acesso a este protocolo.", 403);
  if (p.data.reparticaoId != null && !acessivel(p.data.reparticaoId)) {
    return erro("Sem acesso à unidade de destino.", 403);
  }

  await atualizarProtocolo(id, p.data);
  return ok();
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
