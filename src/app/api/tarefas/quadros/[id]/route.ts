import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarQuadro, excluirQuadro, quadroAcessivel } from "@/lib/tarefas";
import { editarQuadroSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Edita o quadro (nome, cor, descrição, arquivado). */
export async function PATCH(req: Request, ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!id || !q) return erro("Quadro não encontrado.", 404);
  const p = await parseCorpo(editarQuadroSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarQuadro(id, p.data);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "tarefa_quadro", entidadeId: id, resumo: `Quadro "${q.nome}" editado`, antes: q, depois: p.data });
  return ok();
}

/** Exclui o quadro (listas, cartões e etiquetas vão junto). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!id || !q) return erro("Quadro não encontrado.", 404);
  await excluirQuadro(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "tarefa_quadro", entidadeId: id, resumo: `Quadro "${q.nome}" excluído` });
  return ok();
}
