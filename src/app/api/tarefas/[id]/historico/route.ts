import { exigirUsuario, intId } from "@/lib/api-auth";
import { historicoEntidade } from "@/lib/auditoria";
import { erro, ok } from "@/lib/http";
import { tarefaAcessivel } from "@/lib/tarefas";
import { historicoSemPrivados } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

/** Histórico de alterações DESTA tarefa — quem vê a tarefa vê o histórico (sem o conteúdo dos eventos privados). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id || !(await tarefaAcessivel(a.u, id))) return erro("Tarefa não encontrada.", 404);
  return ok({ historico: historicoSemPrivados(await historicoEntidade("tarefa", id)) });
}
