import { eq, sql } from "drizzle-orm";
import { reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { numeroInteressadoEmUso } from "@/lib/orgaos";
import { reparticaoSchema } from "@/lib/rbac-validation";
import { serializeResponsaveis } from "@/lib/reparticao-responsaveis";
import { unidadeTemVinculo } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

const CODIGO_GERAL = "GERAL";

/** Recusa mexer na unidade VIRTUAL "Geral" (não é editável nem excluível). */
async function ehGeral(id: number): Promise<boolean> {
  const [r] = await getDb().select({ codigo: reparticoes.codigo }).from(reparticoes).where(eq(reparticoes.id, id)).limit(1);
  return (r?.codigo ?? "").toUpperCase() === CODIGO_GERAL;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  if (await ehGeral(id)) return erro("A unidade 'Geral' é virtual e não pode ser editada.", 400);
  const corpo = await parseCorpo(reparticaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const numeroInteressado = corpo.data.numeroInteressado?.trim() || null;
  // Ponto 3: Nº do interessado é ÚNICO GLOBAL (órgãos + unidades).
  if (numeroInteressado && (await numeroInteressadoEmUso(numeroInteressado, { reparticaoId: id })))
    return erro("Este Nº do interessado já está em uso por outro órgão ou unidade.", 409);
  await getDb()
    .update(reparticoes)
    .set({
      codigo: corpo.data.codigo,
      nome: corpo.data.nome,
      numeroInteressado,
      setorRequisitante: corpo.data.setorRequisitante ?? null,
      orgaoId: corpo.data.orgaoId ?? null,
      oculto: corpo.data.oculto,
      responsavelDfd: serializeResponsaveis(corpo.data.responsaveis),
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(reparticoes.id, id));
  await registrarAuditoria({ usuario: guard.u, acao: "editar", entidade: "reparticao", entidadeId: id, resumo: `Unidade "${corpo.data.nome}" (${corpo.data.codigo}) editada`, depois: { codigo: corpo.data.codigo, nome: corpo.data.nome } });
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
