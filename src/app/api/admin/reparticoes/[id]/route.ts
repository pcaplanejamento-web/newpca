import { eq, sql } from "drizzle-orm";
import { orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { vinculoCentiDaUnidade } from "@/lib/centi-unidades";
import { comandosVincularAcoes } from "@/lib/centi-unidades-sql";
import { realinharVinculos } from "@/lib/responsaveis";
import { getDb } from "@/lib/db";
import { ehCodigoGeral } from "@/lib/escopo-unidades-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { numeroInteressadoEmUso } from "@/lib/orgaos";
import { reparticaoSchema } from "@/lib/rbac-validation";
import { unidadeTemVinculo } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/** Recusa mexer na unidade VIRTUAL "Geral" (não é editável nem excluível). */
async function ehGeral(id: number): Promise<boolean> {
  const [r] = await getDb().select({ codigo: reparticoes.codigo }).from(reparticoes).where(eq(reparticoes.id, id)).limit(1);
  return ehCodigoGeral(r?.codigo);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  if (await ehGeral(id)) return erro("A unidade 'Geral' é virtual e não pode ser editada.", 400);
  const corpo = await parseCorpo(reparticaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const [org] = await getDb().select({ id: orgaos.id }).from(orgaos).where(eq(orgaos.id, corpo.data.orgaoId)).limit(1);
  if (!org) return erro("Órgão não encontrado — toda unidade pertence a um órgão.", 422);
  const numeroInteressado = corpo.data.numeroInteressado?.trim() || null;
  // Ponto 3: Nº do interessado é ÚNICO GLOBAL (órgãos + unidades).
  if (numeroInteressado && (await numeroInteressadoEmUso(numeroInteressado, { reparticaoId: id })))
    return erro("Este Nº do interessado já está em uso por outro órgão ou unidade.", 409);
  // O vínculo com a Centi DEPOIS da gravação (a unidade orçamentária e as ações DELA), conferido pela regra única.
  const centi = await vinculoCentiDaUnidade(id, corpo.data);
  if ("erro" in centi) return erro(centi.erro.msg, centi.erro.status);
  const db = getDb();
  const atualizar = db
    .update(reparticoes)
    .set({
      codigo: corpo.data.codigo,
      nome: corpo.data.nome,
      numeroInteressado,
      setorRequisitante: corpo.data.setorRequisitante ?? null,
      orgaoId: corpo.data.orgaoId,
      oculto: corpo.data.oculto,
      // O vínculo com a Centi (os gatilhos recalculam o que é gravado e tiram do banco o que ficou sem vínculo).
      ...(centi.mexeu ? { centiUnidadeId: centi.unidadeId } : {}),
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(reparticoes.id, id));
  // A unidade e as AÇÕES (a lista inteira) num lote ATÔMICO — o vínculo dos empenhos gravados é refeito no fim.
  await db.batch((centi.mexeu ? [atualizar, ...comandosVincularAcoes(db, id, centi.acoes)] : [atualizar]) as never);
  // A unidade pode ter mudado de órgão: os responsáveis dela seguem a regra de assinatura do órgão (o lugar que vale).
  await realinharVinculos();
  await registrarAuditoria({ usuario: guard.u, acao: "editar", entidade: "reparticao", entidadeId: id, resumo: `Unidade "${corpo.data.nome}" (${corpo.data.codigo}) editada`, depois: { codigo: corpo.data.codigo, nome: corpo.data.nome, centiUnidadeId: centi.mexeu ? centi.unidadeId : undefined, centiAcoes: centi.mexeu ? centi.acoes : undefined } });
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  if (await ehGeral(id)) return erro("A unidade 'Geral' é virtual e não pode ser excluída.", 400);
  // A unidade própria de um órgão dual só sai pelo toggle "Também unidade" (mantém a semântica/histórico).
  const [rp] = await getDb().select({ proprio: reparticoes.orgaoProprio }).from(reparticoes).where(eq(reparticoes.id, id)).limit(1);
  if (rp?.proprio)
    return erro("Esta é a unidade própria do órgão — use “Deixar de ser unidade” no órgão para removê-la.", 409);
  // Ponto 8: não exclui unidade com DFD/protocolo vinculado — só OCULTA (preserva o histórico).
  if (await unidadeTemVinculo(id))
    return erro("Esta unidade tem DFD/protocolo vinculado — não pode ser excluída. Oculte-a (deixa de aparecer para novos documentos, sem perder o histórico).", 409);
  // Sem vínculo: vínculos grupo↔unidade caem por FK cascade.
  await getDb().delete(reparticoes).where(eq(reparticoes.id, id));
  await registrarAuditoria({ usuario: guard.u, acao: "excluir", entidade: "reparticao", entidadeId: id, resumo: `Unidade #${id} excluída` });
  return ok();
}
