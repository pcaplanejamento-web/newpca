import { atualizarPagina, excluirPagina, paginaPorId, slugEmUso } from "@/lib/agendamento";
import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { tarefaAcessivel } from "@/lib/tarefas";
import { editarPaginaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

async function daPessoa(ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const pg = id ? await paginaPorId(id) : null;
  if (!pg || pg.usuarioId !== a.u.id) return { resp: erro("Página não encontrada.", 404) };
  return { u: a.u, pg };
}

/** Liga/desliga (`{ativa}`) ou regrava a página inteira (só a da própria pessoa). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await daPessoa(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(editarPaginaSchema, req);
  if ("resp" in p) return p.resp;
  if ("slug" in p.data) {
    if (!(await tarefaAcessivel(r.u, p.data.tarefaId))) return erro("Tarefa não encontrada.", 404);
    if (await slugEmUso(p.data.slug, r.pg.id)) return erro("Este endereço já está em uso — escolha outro.", 409);
  }
  await atualizarPagina(r.pg.id, p.data);
  await registrarAuditoria({
    usuario: r.u,
    acao: "editar",
    entidade: "pagina_agendamento",
    entidadeId: r.pg.id,
    resumo: "slug" in p.data ? `Página de agendamento "${p.data.titulo}" alterada` : `Página de agendamento "${r.pg.titulo}" ${p.data.ativa ? "ativada" : "desativada"}`,
  });
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await daPessoa(ctx);
  if ("resp" in r) return r.resp;
  await excluirPagina(r.pg.id);
  await registrarAuditoria({ usuario: r.u, acao: "excluir", entidade: "pagina_agendamento", entidadeId: r.pg.id, resumo: `Página de agendamento "${r.pg.titulo}" excluída` });
  return ok();
}
