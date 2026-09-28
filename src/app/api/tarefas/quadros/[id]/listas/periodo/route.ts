import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { listasDoPeriodo } from "@/lib/calendario-core";
import { listarFeriados } from "@/lib/feriados";
import { erro, ok, parseCorpo } from "@/lib/http";
import { gerarListasDoPeriodo, MSG_QUADRO_ARQUIVADO, quadroAcessivel } from "@/lib/tarefas";
import { periodoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** GERA as listas dos DIAS de um mês no quadro (só as que faltam; só os dias úteis, se pedido) — editores. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!q) return erro("Quadro não encontrado.", 404);
  if (q.arquivado) return erro(MSG_QUADRO_ARQUIVADO, 409);
  const p = await parseCorpo(periodoSchema, req);
  if ("resp" in p) return p.resp;
  const dias = listasDoPeriodo(p.data.ano, p.data.mes, p.data.diasUteis ? await listarFeriados() : [], p.data.diasUteis);
  const criadas = await gerarListasDoPeriodo(q.id, dias);
  if (criadas)
    await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_quadro", entidadeId: q.id, resumo: `${criadas} lista(s) dos dias de ${String(p.data.mes).padStart(2, "0")}/${p.data.ano} criadas no quadro "${q.nome}"` });
  return ok({ criadas, dias: dias.length });
}
