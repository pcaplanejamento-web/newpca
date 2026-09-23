import { exigirEditor, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { coerceFiltros, resumoVisao } from "@/lib/orcamento-visao";
import { atualizarVisaoOrcamento, excluirVisaoOrcamento, getVisaoOrcamento } from "@/lib/pca-espaco";
import { visaoOrcamentoSchema } from "@/lib/pca-espaco-validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getVisaoOrcamento(id);
  if (!antes) return erro("Visão não encontrada.", 404);
  const p = await parseCorpo(visaoOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  const filtros = coerceFiltros(p.data.filtros);
  await atualizarVisaoOrcamento(id, p.data.nome, filtros);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "orcamento_visao",
    entidadeId: id,
    resumo: `Visão "${antes.nome}" atualizada (${resumoVisao(antes.filtros)} → ${resumoVisao(filtros)})`,
  });
  return ok();
}

/** Excluir a visão — os PCAs que a usavam ficam sem visão (orçamento inteiro; FK set null). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirEditor();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getVisaoOrcamento(id);
  if (!antes) return erro("Visão não encontrada.", 404);
  await excluirVisaoOrcamento(id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "orcamento_visao", entidadeId: id, resumo: `Visão "${antes.nome}" excluída` });
  return ok();
}
