import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarLista, ordenarListas, quadroAcessivel } from "@/lib/tarefas";
import { listaSchema, ordemListasSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function quadroDoEditor(ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!q) return { resp: erro("Quadro não encontrado.", 404) };
  return { u: a.u, q };
}

/** Cria uma LISTA no fim do quadro. */
export async function POST(req: Request, ctx: Ctx) {
  const r = await quadroDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(listaSchema, req);
  if ("resp" in p) return p.resp;
  const id = await criarLista(r.q.id, p.data);
  await registrarAuditoria({ usuario: r.u, acao: "criar", entidade: "tarefa_lista", entidadeId: id, resumo: `Lista "${p.data.nome}" criada no quadro "${r.q.nome}"` });
  return ok({ id });
}

/** Grava a ORDEM das listas do quadro. */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await quadroDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(ordemListasSchema, req);
  if ("resp" in p) return p.resp;
  await ordenarListas(r.q.id, p.data.ids);
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_quadro", entidadeId: r.q.id, resumo: `Listas do quadro "${r.q.nome}" reordenadas` });
  return ok();
}
