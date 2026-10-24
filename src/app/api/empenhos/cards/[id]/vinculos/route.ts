import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { motivoVinculosInvalidos } from "@/lib/empenho-cards-core";
import { cadastroDaRegra, getCard, vinculosDoCard } from "@/lib/empenho-cards";
import { comandosGravarVinculos } from "@/lib/empenho-cards-sql";
import { loteEmAndamento } from "@/lib/empenhos";
import { vinculosCardSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GRAVA os VÍNCULOS do card (Configurar) — a lista INTEIRA, conferida pela regra única (`motivoVinculosInvalidos`), num
 * lote atômico: o empenho que fica sem vínculo SAI do banco e os demais acompanham o órgão/unidade.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("empenhos", "configurar");
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const card = await getCard(id);
  if (!card) return erro("Card não encontrado.", 404);
  const p = await parseCorpo(vinculosCardSchema, req);
  if ("resp" in p) return p.resp;
  const motivo = motivoVinculosInvalidos(p.data.vinculos, await cadastroDaRegra());
  if (motivo) return erro(motivo, 422);
  // Uma importação lendo filtra as páginas pelos vínculos de agora: mudar no meio deixaria a leitura pela metade.
  const lendo = await loteEmAndamento(id);
  if (lendo && lendo.modo !== "unidades") return erro(`Uma importação de ${lendo.ano} está lendo este card — espere terminar (ou cancele na aba Importação) para mudar os vínculos.`, 409);
  const antes = await vinculosDoCard(id);
  const db = getDb();
  await db.batch(comandosGravarVinculos(db, id, p.data.vinculos) as never);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "empenho_card",
    entidadeId: id,
    resumo: `Card "${card.nome}": vínculos ${antes.length} → ${p.data.vinculos.length}`,
  });
  return ok({ vinculos: await vinculosDoCard(id) });
}
