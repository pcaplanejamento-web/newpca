import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { excluirEquipe, getEquipe, gravarEquipe, pessoasValidas, quadroAcessivel } from "@/lib/tarefas";
import { equipeSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function equipeDoEditor(ctx: Ctx) {
  const a = await exigirSessao();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const e = id ? await getEquipe(id) : null;
  const q = e ? await quadroAcessivel(a.u, e.quadroId) : null;
  if (!e || !q) return { resp: erro("Equipe não encontrada.", 404) };
  const negado = recusaNoQuadro(a.acesso, q, "configurar");
  if (negado) return { resp: negado };
  return { u: a.u, e, q };
}

/** Edita a equipe (nome, cor e as PESSOAS — muda todas as tarefas dela). */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await equipeDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(equipeSchema, req);
  if ("resp" in p) return p.resp;
  // Quem já estava na equipe e hoje está fora do grupo pode ficar (ou sair); ninguém de fora ENTRA.
  if (!(await pessoasValidas(r.q, p.data.membros, r.e.membros))) return erro("Só pessoas do quadro podem estar na equipe.", 422);
  await gravarEquipe({ id: r.e.id, quadroId: r.e.quadroId, ...p.data });
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_equipe", entidadeId: r.e.id, resumo: `Equipe "${r.e.nome}" editada`, antes: r.e, depois: p.data });
  return ok();
}

/** Exclui a equipe (sai das tarefas; os responsáveis de cada tarefa ficam). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await equipeDoEditor(ctx);
  if ("resp" in r) return r.resp;
  await excluirEquipe(r.e.id);
  await registrarAuditoria({ usuario: r.u, acao: "excluir", entidade: "tarefa_equipe", entidadeId: r.e.id, resumo: `Equipe "${r.e.nome}" excluída`, antes: r.e });
  return ok();
}
