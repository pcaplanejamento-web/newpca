import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarCampo, excluirCampo, getCampo, listarCampos, quadroAcessivel } from "@/lib/tarefas";
import { campoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function campoDoEditor(ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const c = id ? await getCampo(id) : null;
  const q = c ? await quadroAcessivel(a.u, c.quadroId) : null;
  if (!c || !q) return { resp: erro("Campo não encontrado.", 404) };
  return { u: a.u, c };
}

/** Edita o campo (trocar o tipo apaga os valores; tirar opções apaga os valores sem opção). */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await campoDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(campoSchema, req);
  if ("resp" in p) return p.resp;
  const outros = (await listarCampos([r.c.quadroId])).filter((c) => c.id !== r.c.id);
  if (outros.some((c) => c.nome.toLocaleLowerCase("pt-BR") === p.data.nome.toLocaleLowerCase("pt-BR"))) return erro("Já existe um campo com esse nome.", 409);
  await atualizarCampo(r.c.id, r.c, p.data);
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_campo", entidadeId: r.c.id, resumo: `Campo "${r.c.nome}" editado`, antes: r.c, depois: p.data });
  return ok();
}

/** Exclui o campo (os valores saem das tarefas). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await campoDoEditor(ctx);
  if ("resp" in r) return r.resp;
  await excluirCampo(r.c.id);
  await registrarAuditoria({ usuario: r.u, acao: "excluir", entidade: "tarefa_campo", entidadeId: r.c.id, resumo: `Campo "${r.c.nome}" excluído` });
  return ok();
}
