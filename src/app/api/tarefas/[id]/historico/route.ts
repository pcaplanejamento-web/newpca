import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { historicoEntidade } from "@/lib/auditoria";
import { erro, ok } from "@/lib/http";
import { tarefaAcessivel } from "@/lib/tarefas";
import { historicoSemPrivados } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

/** Histórico de alterações DESTA tarefa — quem vê a tarefa vê o histórico (sem o conteúdo dos eventos privados). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const r = id ? await tarefaAcessivel(a.u, id) : null;
  if (!id || !r) return erro("Tarefa não encontrada.", 404);
  const negado = recusaNoQuadro(a.acesso, r.quadro, "visualizar", true);
  if (negado) return negado;
  return ok({ historico: historicoSemPrivados(await historicoEntidade("tarefa", id)) });
}
