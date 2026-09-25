import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { acaoValida, criarAutomacao, getLista, listarAutomacoes, quadroAcessivel } from "@/lib/tarefas";
import { MAX_AUTOMACOES } from "@/lib/tarefas-core";
import { automacaoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Cria uma AUTOMAÇÃO do quadro (editores): "quando entrar na lista X / for concluída, fazer Y". */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!q) return erro("Quadro não encontrado.", 404);
  const p = await parseCorpo(automacaoSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  if ((await listarAutomacoes(q.id)).length >= MAX_AUTOMACOES) return erro(`Até ${MAX_AUTOMACOES} automações por quadro.`, 409);
  if (d.gatilho === "entrar_lista") {
    const l = d.listaId ? await getLista(d.listaId) : null;
    if (!l || l.quadroId !== q.id) return erro("Lista inválida.", 422);
  }
  if (d.acao.tipo === "mover_lista" && d.gatilho === "entrar_lista" && d.acao.listaId === d.listaId) return erro("A regra moveria a tarefa para a mesma lista.", 422);
  if (!(await acaoValida(q, d.acao))) return erro("A ação aponta uma lista, etiqueta ou pessoa que não é deste quadro.", 422);
  const aid = await criarAutomacao(q.id, { gatilho: d.gatilho, listaId: d.listaId ?? null, acao: d.acao });
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_automacao", entidadeId: aid, resumo: `Automação criada no quadro "${q.nome}"`, depois: d });
  return ok({ id: aid });
}
