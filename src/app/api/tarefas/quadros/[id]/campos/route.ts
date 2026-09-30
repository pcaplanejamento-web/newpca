import { exigirSessao, intId, recusaNoQuadro } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { MAX_CAMPOS } from "@/lib/tarefas-core";
import { criarCampo, listarCampos, MSG_QUADRO_ARQUIVADO, ordenarCampos, quadroAcessivel } from "@/lib/tarefas";
import { campoSchema, ordemCamposSchema } from "@/lib/tarefas-validation";

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
  if (q.arquivado) return { resp: erro(MSG_QUADRO_ARQUIVADO, 409) };
  return { u: a.u, q };
}

/** Cria um CAMPO personalizado do quadro (até `MAX_CAMPOS`; nome único no quadro). */
export async function POST(req: Request, ctx: Ctx) {
  const r = await quadroDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(campoSchema, req);
  if ("resp" in p) return p.resp;
  const atuais = await listarCampos([r.q.id]);
  if (atuais.length >= MAX_CAMPOS) return erro(`Até ${MAX_CAMPOS} campos por quadro.`, 409);
  if (atuais.some((c) => c.nome.toLocaleLowerCase("pt-BR") === p.data.nome.toLocaleLowerCase("pt-BR"))) return erro("Já existe um campo com esse nome.", 409);
  const id = await criarCampo(r.q.id, p.data);
  await registrarAuditoria({ usuario: r.u, acao: "criar", entidade: "tarefa_campo", entidadeId: id, resumo: `Campo "${p.data.nome}" criado no quadro "${r.q.nome}"`, depois: p.data });
  return ok({ id });
}

/** A ORDEM nova dos campos (todos os do quadro). */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await quadroDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(ordemCamposSchema, req);
  if ("resp" in p) return p.resp;
  const atuais = new Set((await listarCampos([r.q.id])).map((c) => c.id));
  if (p.data.ids.length !== atuais.size || p.data.ids.some((id) => !atuais.has(id))) return erro("A lista de campos mudou — recarregue.", 409);
  await ordenarCampos(r.q.id, p.data.ids);
  return ok();
}
