import { exigirEditor, exigirUsuario, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { aposMovimento, atualizarLista, cartoesNaLista, excluirLista, getLista, idsNaLista, quadroAcessivel } from "@/lib/tarefas";
import { editarListaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function listaDoEditor(ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return { resp: a.erro };
  const id = intId((await ctx.params).id);
  const l = id ? await getLista(id) : null;
  const q = l ? await quadroAcessivel(a.u, l.quadroId) : null;
  if (!l || !q) return { resp: erro("Lista não encontrada.", 404) };
  return { u: a.u, l, q };
}

/** Quantos cartões (inclusive arquivados) a lista tem — a confirmação da exclusão. */
export async function GET(_req: Request, ctx: Ctx) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const l = id ? await getLista(id) : null;
  if (!l || !(await quadroAcessivel(a.u, l.quadroId))) return erro("Lista não encontrada.", 404);
  return ok({ cartoes: await cartoesNaLista(l.id) });
}

/** Edita a lista (nome, limite WIP, "de concluídas", arquivada). */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await listaDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const p = await parseCorpo(editarListaSchema, req);
  if ("resp" in p) return p.resp;
  await atualizarLista(r.l.id, p.data);
  await registrarAuditoria({ usuario: r.u, acao: "editar", entidade: "tarefa_lista", entidadeId: r.l.id, resumo: `Lista "${r.l.nome}" editada`, antes: r.l, depois: p.data });
  return ok();
}

/**
 * Exclui a lista — qualquer uma. `?moverPara=<lista>` (do MESMO quadro, não arquivada) leva antes os cartões (inclusive os
 * arquivados) para o fim dela, no mesmo lote; sem, os cartões saem junto.
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const r = await listaDoEditor(ctx);
  if ("resp" in r) return r.resp;
  const para = new URL(req.url).searchParams.get("moverPara");
  const destino = para ? await getLista(intId(para) ?? 0) : null;
  if (para && (!destino || destino.quadroId !== r.l.quadroId || destino.arquivada || destino.id === r.l.id)) return erro("Lista de destino inválida.", 422);
  const ids = destino ? await idsNaLista(r.l.id) : [];
  const n = destino ? ids.length : await cartoesNaLista(r.l.id);
  await excluirLista(r.l.id, destino ?? undefined);
  await registrarAuditoria({
    usuario: r.u,
    acao: "excluir",
    entidade: "tarefa_lista",
    entidadeId: r.l.id,
    resumo: `Lista "${r.l.nome}" excluída${n ? (destino ? ` — ${n} cartão(ões) movido(s) para "${destino.nome}"` : ` — ${n} cartão(ões) excluído(s)`) : ""}`,
  });
  const atualizar = destino && ids.length ? await aposMovimento(r.u, r.q, ids, destino) : false;
  return ok({ atualizar });
}
