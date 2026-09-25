import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarAutomacao, excluirAutomacao, getAutomacao, quadroAcessivel } from "@/lib/tarefas";
import { editarAutomacaoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function automacaoDoEditor(ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const x = id ? await getAutomacao(id) : null;
  const q = x ? await quadroAcessivel(a.u, x.quadroId) : null;
  if (!x || !q) return { resp: erro("Automação não encontrada.", 404) };
  return { u: a.u, x };
}

/** Liga/desliga a automação. */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await automacaoDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(editarAutomacaoSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarAutomacao(r.x.id, p.data.ativa);
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_automacao", entidadeId: r.x.id, resumo: `Automação ${p.data.ativa ? "ligada" : "desligada"}` });
  return ok();
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await automacaoDoEditor(ctx);
  if ("resp" in r) return r.resp;
  await excluirAutomacao(r.x.id);
  await registrarAuditoria({ usuario: r.u, acao: "excluir", entidade: "tarefa_automacao", entidadeId: r.x.id, resumo: "Automação excluída" });
  return ok();
}
