import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { gravarEquipe, MSG_QUADRO_ARQUIVADO, pessoasValidas, quadroAcessivel } from "@/lib/tarefas";
import { equipeSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/** Cria uma EQUIPE do quadro (nome + cor + pessoas do grupo do quadro). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!q) return erro("Quadro não encontrado.", 404);
  const negado = recusaNoQuadro(a.acesso, q, "configurar");
  if (negado) return negado;
  if (q.arquivado) return erro(MSG_QUADRO_ARQUIVADO, 409);
  const p = await parseCorpo(equipeSchema, req);
  if ("resp" in p) return p.resp;
  if (!(await pessoasValidas(q, p.data.membros))) return erro("Só pessoas do quadro podem estar na equipe.", 422);
  const eid = await gravarEquipe({ quadroId: q.id, ...p.data });
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "tarefa_equipe",
    entidadeId: eid,
    resumo: `Equipe "${p.data.nome}" criada no quadro "${q.nome}"`,
    depois: p.data,
  });
  return ok({ id: eid });
}
