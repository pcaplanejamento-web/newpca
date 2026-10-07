import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { escopoDoVinculo, getVinculoOrcamento, gravarVinculosOrcamento, vinculosGravados } from "@/lib/orcamento";
import { editarVinculoOrcamentoSchema, excluirVinculoOrcamentoSchema } from "@/lib/orcamento-validation";
import { textoEscopo } from "@/lib/orcamento-vinculo";

export const dynamic = "force-dynamic";

/**
 * ALTERA um vínculo do orçamento: a unidade cadastrada e/ou as ações (Configurar no Orçamento; a regra no servidor). O
 * `escopo` diz onde: o padrão e/ou as visões (ausente = onde o vínculo está).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(editarVinculoOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  const atual = await getVinculoOrcamento(id);
  if (!atual) return erro("Vínculo não encontrado.", 404);
  const { escopo: pedido, ...para } = p.data;
  const escopo = pedido ?? escopoDoVinculo(atual);
  const falha = await gravarVinculosOrcamento([{ texto: atual.texto, de: atual.alvoId, para }], escopo);
  if (falha) return erro(falha, 422);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "orcamento",
    entidadeId: null,
    resumo: `Vínculo da unidade do orçamento "${atual.texto}" alterado (${textoEscopo(escopo)})`,
    antes: { alvoId: atual.alvoId, acoes: atual.acoes, acoesFora: atual.acoesFora },
    depois: { ...para, escopo },
  });
  return ok(await vinculosGravados());
}

/** EXCLUI um vínculo (confirmado) no `escopo` — as ações dele ficam sem vínculo, ou vão ao vínculo das demais. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(excluirVinculoOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  const atual = await getVinculoOrcamento(id);
  if (!atual) return erro("Vínculo não encontrado.", 404);
  const escopo = p.data.escopo ?? escopoDoVinculo(atual);
  const falha = await gravarVinculosOrcamento([{ texto: atual.texto, de: atual.alvoId, para: null }], escopo);
  if (falha) return erro(falha, 409);
  await registrarAuditoria({
    usuario: a.u,
    acao: "excluir",
    entidade: "orcamento",
    entidadeId: null,
    resumo: `Vínculo da unidade do orçamento "${atual.texto}" excluído (${textoEscopo(escopo)})`,
    antes: { alvoId: atual.alvoId, acoes: atual.acoes, acoesFora: atual.acoesFora },
  });
  return ok(await vinculosGravados());
}
