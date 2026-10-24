import { exigirSessao, recusa } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { cardDaRota } from "@/lib/empenho-card-rota";
import { telaDoCard } from "@/lib/empenho-cards-core";
import { cadastroDosOrgaos, orgaosDoCard } from "@/lib/empenho-cards";
import { comandosGravarOrgaosLiq } from "@/lib/empenho-cards-sql";
import { orgaosLiqSchema } from "@/lib/empenho-cards-validation";
import { loteEmAndamento } from "@/lib/empenhos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { motivoOrgaosInvalidos } from "@/lib/liquidacoes-core";

export const dynamic = "force-dynamic";

/**
 * GRAVA os ÓRGÃOS de um card de LIQUIDAÇÕES (Configurar) — a lista INTEIRA, conferida pela regra única
 * (`motivoOrgaosInvalidos`), num lote atômico: as liquidações do órgão que sai do card saem do banco; as dos que ficam
 * acompanham o órgão e a unidade de destino.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const { card } = a;
  const negado = recusa(g.acesso, telaDoCard(card), "configurar");
  if (negado) return negado;
  if (card.tipo !== "liquidacoes") return erro("Só o card de liquidações tem órgãos — o de empenhos usa os vínculos.", 422);
  const p = await parseCorpo(orgaosLiqSchema, req);
  if ("resp" in p) return p.resp;
  const motivo = motivoOrgaosInvalidos(p.data.orgaos, await cadastroDosOrgaos());
  if (motivo) return erro(motivo, 422);
  // Uma importação lendo grava para o destino do órgão dela: mudar no meio deixaria a leitura sem destino.
  const lendo = await loteEmAndamento(card.id);
  if (lendo) return erro(`Uma importação de ${lendo.ano} está lendo este card — espere terminar (ou cancele na aba Importação) para mudar os órgãos.`, 409);
  const antes = await orgaosDoCard(card.id);
  const db = getDb();
  await db.batch(comandosGravarOrgaosLiq(db, card.id, p.data.orgaos) as never);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "empenho_card", entidadeId: card.id, resumo: `Card "${card.nome}": órgãos ${antes.length} → ${p.data.orgaos.length}` });
  return ok({ orgaos: await orgaosDoCard(card.id) });
}
