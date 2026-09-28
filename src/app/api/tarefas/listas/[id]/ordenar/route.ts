import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { cartoesAtivosDaLista, getLista, quadroAcessivel, renumerarCartoes } from "@/lib/tarefas";
import { ordenarCartoes, ROTULO_ORDENACAO } from "@/lib/tarefas-core";
import { ordenarListaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** ORDENA os cartões ativos da lista pelo critério (prazo, criação, título, prioridade) — qualquer membro do grupo. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const l = id ? await getLista(id) : null;
  const q = l ? await quadroAcessivel(a.u, l.quadroId) : null;
  if (!l || !q) return erro("Lista não encontrada.", 404);
  const p = await parseCorpo(ordenarListaSchema, req);
  if ("resp" in p) return p.resp;
  const ids = ordenarCartoes(await cartoesAtivosDaLista(l.id), p.data.por);
  await renumerarCartoes(ids);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "tarefa_lista", entidadeId: l.id, resumo: `Lista "${l.nome}" ordenada por ${ROTULO_ORDENACAO[p.data.por].toLowerCase()}` });
  return ok({ ids });
}
