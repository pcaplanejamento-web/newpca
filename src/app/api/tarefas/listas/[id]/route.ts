import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarLista, cartoesNaLista, excluirLista, getLista, quadroAcessivel } from "@/lib/tarefas";
import { editarListaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function listaDoEditor(ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const l = id ? await getLista(id) : null;
  const q = l ? await quadroAcessivel(a.u, l.quadroId) : null;
  if (!l || !q) return { resp: erro("Lista não encontrada.", 404) };
  return { u: a.u, l };
}

/** Edita a lista (nome, limite WIP, "de concluídas", arquivada). */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await listaDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(editarListaSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarLista(r.l.id, p.data);
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_lista", entidadeId: r.l.id, resumo: `Lista "${r.l.nome}" editada`, antes: r.l, depois: p.data });
  return ok();
}

/** Exclui a lista — só VAZIA (com cartões, arquive-a ou mova os cartões). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await listaDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const n = await cartoesNaLista(r.l.id);
  if (n > 0) return erro(`A lista tem ${n} cartão(ões) — mova-os ou arquive a lista.`, 409);
  await excluirLista(r.l.id);
  await registrarAuditoria({ usuario: r.u, acao: "excluir", entidade: "tarefa_lista", entidadeId: r.l.id, resumo: `Lista "${r.l.nome}" excluída` });
  return ok();
}
