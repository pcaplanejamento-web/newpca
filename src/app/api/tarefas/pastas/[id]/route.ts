import { exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atualizarPasta, definirQuadrosDaPasta, excluirPastaDoBanco, pastaAcessivel, podeOrganizarPasta } from "@/lib/tarefas";
import { editarPastaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** A pasta, se a pessoa pode ORGANIZÁ-LA (a pública: editores; a privada: o dono). */
async function pastaOrganizavel(ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const p = id ? await pastaAcessivel(a.u, id) : null;
  if (!p) return { resp: erro("Pasta não encontrada.", 404) };
  if (!podeOrganizarPasta(a.u, p)) return { resp: erro(p.privado ? "Só o dono organiza a pasta privada." : "Só editores organizam a pasta pública.", 403) };
  return { u: a.u, p };
}

/** Edita a pasta: nome, cor e os QUADROS de dentro (a lista completa, na ordem). A privacidade é fixa depois de criada. */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await pastaOrganizavel(ctx);
  if ("resp" in r) return r.resp;
  const b = await parseCorpo(editarPastaSchema, req);
  if ("resp" in b) return b.resp;
  const { quadros, ...d } = b.data;
  if (quadros) {
    const motivo = await definirQuadrosDaPasta(r.u, r.p, quadros);
    if (motivo) return erro(motivo, 422);
  }
  await atualizarPasta(Number(r.p.id), d);
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_pasta", entidadeId: Number(r.p.id), resumo: `Pasta "${r.p.nome}" editada`, antes: r.p, depois: b.data });
  return ok();
}

/** Exclui a pasta: os quadros ficam soltos (os privados continuam privados). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await pastaOrganizavel(ctx);
  if ("resp" in r) return r.resp;
  await excluirPastaDoBanco(Number(r.p.id));
  await registrarAuditoria({ usuario: r.u, acao: "excluir", entidade: "tarefa_pasta", entidadeId: Number(r.p.id), resumo: `Pasta "${r.p.nome}" excluída`, antes: r.p });
  return ok();
}
