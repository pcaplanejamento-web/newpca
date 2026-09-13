import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { excluirDfd, getDfd } from "@/lib/dfd";
import { vincularDfdSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { vincularDfd } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/** DFD completo (para o banner de visualização). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const dfd = await getDfd(id);
  if (!dfd) return erro("DFD não encontrado.", 404);
  return ok({ dfd });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
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
  await vincularDfd(id, p.data.protocoloId);
  return ok();
}
