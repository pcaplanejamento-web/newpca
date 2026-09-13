import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { excluirDfd, getDfd, getDfdReparticao } from "@/lib/dfd";
import { vincularDfdSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getProtocoloReparticao, vincularDfd } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/** DFD completo (para o banner de visualização) — escopado por repartição. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfd(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (dfd.reparticaoId != null && !lista.some((r) => r.id === dfd.reparticaoId)) {
    return erro("Sem acesso a este DFD.", 403);
  }
  return ok({ dfd });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  const { lista } = await getReparticaoContexto(a.u);
  if (dfd.reparticaoId != null && !lista.some((r) => r.id === dfd.reparticaoId)) {
    return erro("Sem acesso a este DFD.", 403);
  }
  const r = await excluirDfd(id);
  if (!r.ok) return erro(r.erro, 409);
  return ok();
}

/** Vincula (ou desvincula com `null`) o DFD a um protocolo — rule 4. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(vincularDfdSchema, req);
  if ("resp" in p) return p.resp;

  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);

  const dfd = await getDfdReparticao(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  if (!acessivel(dfd.reparticaoId)) return erro("Sem acesso a este DFD.", 403);
  // Não vincular a um protocolo de repartição inacessível.
  if (p.data.protocoloId != null) {
    const proto = await getProtocoloReparticao(p.data.protocoloId);
    if (!proto) return erro("Protocolo não encontrado.", 404);
    if (!acessivel(proto.reparticaoId)) return erro("Sem acesso ao protocolo de destino.", 403);
  }

  await vincularDfd(id, p.data.protocoloId);
  return ok();
}
