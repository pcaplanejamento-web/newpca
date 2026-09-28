import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { resolverImagemFundo } from "@/lib/imagem-fundo";
import { atualizarQuadro, excluirQuadro, quadroAcessivel, tornarQuadroPrivado } from "@/lib/tarefas";
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
  const { fundoAjuste, fundoGradiente, ...resto } = p.data;
  // PRIVADO: só quem criou decide (o ADM, no privado cujo dono não existe mais).
  if (resto.privado !== undefined && resto.privado !== q.privado && q.criadoPor !== a.u.id && !(q.criadoPor == null && a.u.role === "admin"))
    return erro("Só quem criou o quadro pode torná-lo privado ou público.", 403);
  const d: Parameters<typeof atualizarQuadro>[1] = {
    ...resto,
    ...(fundoAjuste !== undefined ? { fundoAjuste: fundoAjuste ? JSON.stringify(fundoAjuste) : null } : {}),
    // Uma imagem NOVA começa centralizada (o enquadramento da anterior não vale para ela).
    ...(resto.fundoUrl !== undefined && fundoAjuste === undefined ? { fundoAjuste: null } : {}),
    ...(fundoGradiente !== undefined ? { fundoGradiente: fundoGradiente ? JSON.stringify(fundoGradiente) : null } : {}),
  };
  // Imagem e degradê se EXCLUEM: escolher um tira o outro.
  if (d.fundoUrl) d.fundoGradiente = null;
  if (fundoGradiente) {
    d.fundoUrl = null;
    d.fundoAjuste = null;
  }
  if (d.fundoUrl) {
    try {
      d.fundoUrl = await resolverImagemFundo(d.fundoUrl);
    } catch (e) {
      return erro((e as Error).message, 422);
    }
  }
  // Virar PRIVADO (com dono): só ele fica dentro — as outras pessoas saem das tarefas, equipes, convites e checklists.
  const privatizar = d.privado === true && !q.privado && q.criadoPor != null;
  if (privatizar) {
    await tornarQuadroPrivado(id, q.criadoPor as number);
    delete d.privado;
  }
  await atualizarQuadro(id, d);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "tarefa_quadro",
    entidadeId: id,
    resumo: privatizar ? `Quadro "${q.nome}" tornado privado — as outras pessoas saíram das tarefas, equipes, eventos e checklists` : `Quadro "${q.nome}" editado`,
    antes: q,
    depois: privatizar ? { ...d, privado: true } : d,
  });
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
