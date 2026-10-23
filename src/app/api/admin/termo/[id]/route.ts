import { exigirAdmin, intId } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { situacaoDaVersao, termoPorId } from "@/lib/termo-uso";
import { and, eq } from "drizzle-orm";
import { termosAceites } from "@/db/schema";
import { comandoExcluirTermo, comandoLimparHistoricoTermo, comandosLimparMencoesTermo } from "@/lib/termos-sql";

export const dynamic = "force-dynamic";

/** Uma versão: o texto congelado + quem aceitou e quem ainda deve. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Versão inválida.", 400);
  const t = await termoPorId(id);
  if (!t) return erro("Versão não encontrada.", 404);
  return ok({ termo: { id: t.id, versao: t.versao, estado: t.estado, texto: t.textoFinal, hash: t.hash, publicadoEm: t.publicadoEm, publicadoPor: t.publicadoPor }, ...(await situacaoDaVersao(id)) });
}

/**
 * EXCLUI uma versão do Termo de Uso: o rascunho, a publicada que ninguém aceitou ou a usada SÓ EM TESTE. Sai TUDO dela num
 * lote atômico: os aceites de teste (a cascata), as pendências de todas as pessoas e o histórico da versão. A que tem
 * aceite REAL fica para sempre — é a prova das assinaturas (409).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Versão inválida.", 400);
  const t = await termoPorId(id);
  if (!t) return erro("Versão não encontrada.", 404);
  const db = getDb();
  const codigos = (await db.select({ c: termosAceites.codigo }).from(termosAceites).where(and(eq(termosAceites.termoId, id), eq(termosAceites.teste, true)))).map((r) => r.c);
  const [feito] = await db.batch([comandoExcluirTermo(db, id), comandoLimparHistoricoTermo(db, id), ...comandosLimparMencoesTermo(db, id, t.versao, codigos)]);
  if (!feito.length) return erro("Esta versão já foi aceita fora do teste e não pode ser excluída: os aceites são a prova das assinaturas. Publique uma versão nova.", 409);
  await registrarAuditoria({
    usuario: g.u,
    acao: "excluir",
    entidade: "termo_uso",
    entidadeId: null,
    resumo: t.estado === "rascunho" ? "Rascunho do Termo de Uso descartado" : "Uma versão de teste do Termo de Uso foi excluída (sem aceites reais — os de teste e as menções a ela no histórico foram apagados)",
  });
  return ok();
}
