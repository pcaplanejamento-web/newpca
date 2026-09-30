import { podeNoQuadro } from "@/lib/acesso";
import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { colocarListaApos, criarLista, MSG_QUADRO_ARQUIVADO, ordenarListas, quadroAcessivel } from "@/lib/tarefas";
import { criarListaSchema, ordemListasSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function quadroDoEditor(ctx: Ctx) {
  const a = await exigirSessao();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!q) return { resp: erro("Quadro não encontrado.", 404) };
  const negado = recusaNoQuadro(a.acesso, q, "configurar");
  if (negado) return { resp: negado };
  return { u: a.u, q };
}

/**
 * Cria uma LISTA no fim do quadro (ou logo depois de `aposId` — a cópia de uma lista). Qualquer MEMBRO do grupo do quadro
 * cria (a coluna "Adicionar outra lista"); limite de cartões, "de concluídas" e a posição são só dos editores.
 */
export async function POST(req: Request, ctx: Ctx) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const qid = intId((await ctx.params).id);
  const q = qid ? await quadroAcessivel(a.u, qid) : null;
  if (!q) return erro("Quadro não encontrado.", 404);
  const negado = recusaNoQuadro(a.acesso, q, "manipular");
  if (negado) return negado;
  if (q.arquivado) return erro(MSG_QUADRO_ARQUIVADO, 409);
  const p = await parseCorpo(criarListaSchema, req);
  if ("resp" in p) return p.resp;
  // Limite de cartões, "de concluídas" e a posição = Configurar.
  const editor = podeNoQuadro(a.acesso, q.grupoId).configurar;
  const { aposId, ...d } = p.data;
  const id = await criarLista(q.id, editor ? d : { nome: d.nome });
  if (aposId && editor) await colocarListaApos(q.id, id, aposId);
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "tarefa_lista", entidadeId: id, resumo: `Lista "${p.data.nome}" criada no quadro "${q.nome}"` });
  return ok({ id });
}

/** Grava a ORDEM das listas do quadro. */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await quadroDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(ordemListasSchema, req);
  if ("resp" in p) return p.resp;
  await ordenarListas(r.q.id, p.data.ids);
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_quadro", entidadeId: r.q.id, resumo: `Listas do quadro "${r.q.nome}" reordenadas` });
  return ok();
}
