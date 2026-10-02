import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { editarVinculoOrcamento, excluirVinculoOrcamento, getVinculoOrcamento, listarVinculosOrcamento } from "@/lib/orcamento";
import { editarVinculoOrcamentoSchema } from "@/lib/orcamento-validation";

export const dynamic = "force-dynamic";

/** ALTERA um vínculo do orçamento: a unidade cadastrada e/ou as ações (Configurar no Orçamento; a regra no servidor). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(editarVinculoOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  const atual = await getVinculoOrcamento(id);
  if (!atual) return erro("Vínculo não encontrado.", 404);
  const falha = await editarVinculoOrcamento(atual, p.data);
  if (falha) return erro(falha, 422);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "orcamento",
    entidadeId: null,
    resumo: `Vínculo da unidade do orçamento "${atual.texto}" alterado`,
    antes: { alvoId: atual.alvoId, acoes: atual.acoes, acoesFora: atual.acoesFora },
    depois: p.data,
  });
  // A lista GRAVADA volta na resposta — a tela fica igual ao banco sem esperar a recarga.
  return ok({ vinculos: await listarVinculosOrcamento() });
}

/** EXCLUI um vínculo do orçamento DO BANCO (confirmado) — as ações dele ficam sem vínculo, ou vão ao vínculo das demais. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const atual = await getVinculoOrcamento(id);
  if (!atual) return erro("Vínculo não encontrado.", 404);
  if (!(await excluirVinculoOrcamento(id))) return erro("Não foi possível excluir o vínculo — recarregue e tente de novo.", 409);
  await registrarAuditoria({
    usuario: a.u,
    acao: "excluir",
    entidade: "orcamento",
    entidadeId: null,
    resumo: `Vínculo da unidade do orçamento "${atual.texto}" excluído`,
    antes: { alvoId: atual.alvoId, acoes: atual.acoes, acoesFora: atual.acoesFora },
  });
  return ok({ vinculos: await listarVinculosOrcamento() });
}
