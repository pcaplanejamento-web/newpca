import { and, eq, isNull } from "drizzle-orm";
import { itens } from "@/db/schema";
import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { planoEdicaoItemPlanilha, resumoEdicaoItemPlanilha } from "@/lib/item-planilha-core";
import { comandoTotaisUnidades } from "@/lib/pca-upload-sql";
import { reclassificarTudo } from "@/lib/reclassificacao";
import { depoisDaResposta } from "@/lib/segundo-plano";
import { editarItemPlanilhaSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * EDITA UM item importado por planilha (aba Importação do PCA) — a MESMA régua da importação (`item-planilha-core`). O
 * sequencial, a unidade e a classificação/domínio do Catálogo não se editam. Item + totais da planilha num lote atômico.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const a = await exigirAcesso("pca", "importar");
  if ("erro" in a) return a.erro;
  const prm = await ctx.params;
  const pcaId = intId(prm.id);
  const itemId = intId(prm.itemId);
  if (!pcaId || !itemId) return erro("ID inválido.");
  const semPca = await recusaPca(pcaId);
  if (semPca) return semPca;
  const corpo = await parseCorpo(editarItemPlanilhaSchema, req);
  if ("resp" in corpo) return corpo.resp;

  const db = getDb();
  const [atual] = await db
    .select({
      sequencial: itens.sequencial,
      idProduto: itens.idProduto,
      nomeProduto: itens.nomeProduto,
      unidadeMedida: itens.unidadeMedida,
      quantidade: itens.quantidade,
      valorReferencia: itens.valorReferencia,
      valorTotal: itens.valorTotal,
      dataDesejada: itens.dataDesejada,
      previsaoGenerica: itens.previsaoGenerica,
      prioridade: itens.prioridade,
      canceladoEm: itens.canceladoEm,
    })
    .from(itens)
    .where(and(eq(itens.id, itemId), eq(itens.pcaId, pcaId)))
    .limit(1);
  if (!atual) return erro("Item não encontrado nas planilhas deste PCA.", 404);
  // O CANCELADO não se edita: reative-o antes (a edição voltaria a mexer em números que ele não compõe).
  if (atual.canceladoEm) return erro("Item cancelado no PCA — reative-o antes de editar.", 409);

  const plano = planoEdicaoItemPlanilha(atual, corpo.data);
  if (plano.erro) return erro(plano.erro, 422);
  if (Object.keys(plano.set).length === 0) return ok({ alterado: false });

  await db.batch([db.update(itens).set(plano.set).where(and(eq(itens.id, itemId), eq(itens.pcaId, pcaId), isNull(itens.canceladoEm))), comandoTotaisUnidades(db, pcaId)]);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "planilha",
    entidadeId: itemId,
    resumo: resumoEdicaoItemPlanilha(atual.sequencial, plano),
    antes: plano.antes,
    depois: plano.depois,
  });
  if (plano.reclassificar) depoisDaResposta(reclassificarTudo(), "reclassificar itens");
  return ok({ alterado: true });
}
