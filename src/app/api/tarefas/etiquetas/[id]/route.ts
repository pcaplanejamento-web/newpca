import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarEtiqueta, excluirEtiqueta, getEtiqueta, quadroAcessivel } from "@/lib/tarefas";
import { etiquetaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function etiquetaDoEditor(ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const e = id ? await getEtiqueta(id) : null;
  const q = e ? await quadroAcessivel(a.u, e.quadroId) : null;
  if (!e || !q) return { resp: erro("Etiqueta não encontrada.", 404) };
  return { u: a.u, e };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const r = await etiquetaDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(etiquetaSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarEtiqueta(r.e.id, p.data);
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_etiqueta", entidadeId: r.e.id, resumo: `Etiqueta "${r.e.nome}" editada`, antes: r.e, depois: p.data });
  return ok();
}

/** Exclui a etiqueta (sai dos cartões). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await etiquetaDoEditor(ctx);
  if ("resp" in r) return r.resp;
  await excluirEtiqueta(r.e.id);
  await registrarAuditoria({ usuario: r.u, acao: "excluir", entidade: "tarefa_etiqueta", entidadeId: r.e.id, resumo: `Etiqueta "${r.e.nome}" excluída` });
  return ok();
}
