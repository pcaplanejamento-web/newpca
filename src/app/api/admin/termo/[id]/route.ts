import { exigirAdmin, intId } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { situacaoDaVersao, termoPorId } from "@/lib/termo-uso";
import { comandoExcluirTermo } from "@/lib/termos-sql";

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
 * EXCLUI uma versão do Termo de Uso: o rascunho ou a publicada que ninguém aceitou (as pendências dela saem junto). A que
 * já tem aceite fica para sempre — é a prova das assinaturas (409).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("Versão inválida.", 400);
  const t = await termoPorId(id);
  if (!t) return erro("Versão não encontrada.", 404);
  const db = getDb();
  const [feito] = await db.batch([comandoExcluirTermo(db, id)]);
  if (!feito.length) return erro("Esta versão já foi aceita e não pode ser excluída: os aceites são a prova das assinaturas. Publique uma versão nova.", 409);
  await registrarAuditoria({
    usuario: g.u,
    acao: "excluir",
    entidade: "termo_uso",
    entidadeId: id,
    resumo: t.estado === "rascunho" ? `Rascunho da versão ${t.versao} do Termo de Uso descartado` : `Versão ${t.versao} do Termo de Uso excluída (sem aceites)`,
  });
  return ok();
}
