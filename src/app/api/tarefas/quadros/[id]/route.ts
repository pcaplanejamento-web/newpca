import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { resolverImagemFundo } from "@/lib/imagem-fundo";
import { atualizarQuadro, excluirQuadro, quadroAcessivel } from "@/lib/tarefas";
import { editarQuadroSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Edita o quadro (nome, cor, descrição, arquivado, formato do título, IMAGEM DE FUNDO — o link resolvido para o da imagem). */
export async function PATCH(req: Request, ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!id || !q) return erro("Quadro não encontrado.", 404);
  const p = await parseCorpo(editarQuadroSchema, req);
  if ("resp" in p) return p.resp;
  const { fundoAjuste, ...resto } = p.data;
  const d: Parameters<typeof atualizarQuadro>[1] = {
    ...resto,
    ...(fundoAjuste !== undefined ? { fundoAjuste: fundoAjuste ? JSON.stringify(fundoAjuste) : null } : {}),
    // Uma imagem NOVA começa centralizada (o enquadramento da anterior não vale para ela).
    ...(resto.fundoUrl !== undefined && fundoAjuste === undefined ? { fundoAjuste: null } : {}),
  };
  if (d.fundoUrl) {
    try {
      d.fundoUrl = await resolverImagemFundo(d.fundoUrl);
    } catch (e) {
      return erro((e as Error).message, 422);
    }
  }
  await atualizarQuadro(id, d);
  await registrarAuditoria({ usuario: a.u, acao: "editar", entidade: "tarefa_quadro", entidadeId: id, resumo: `Quadro "${q.nome}" editado`, antes: q, depois: d });
  return ok({ fundoUrl: d.fundoUrl });
}

/** Exclui o quadro (listas, cartões e etiquetas vão junto). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  const q = id ? await quadroAcessivel(a.u, id) : null;
  if (!id || !q) return erro("Quadro não encontrado.", 404);
  await excluirQuadro(id);
  await registrarAuditoria({ usuario: a.u, acao: "excluir", entidade: "tarefa_quadro", entidadeId: id, resumo: `Quadro "${q.nome}" excluído` });
  return ok();
}
