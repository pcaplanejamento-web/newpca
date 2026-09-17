import { eq, sql } from "drizzle-orm";
import { orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { orgaoDeUnidade, podePromoverUnidade } from "@/lib/orgao-unidade-ops";
import { unidadeTemVinculo } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/**
 * PROMOVER uma unidade a ÓRGÃO (requisito 1). Cria o órgão com a identidade da unidade e
 * EXCLUI a unidade (batch atômico). Barrado se a unidade tiver vínculo (seria excluída — ponto
 * 8) ou for a unidade própria de um órgão dual.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const db = getDb();
  const [u] = await db
    .select({
      codigo: reparticoes.codigo,
      nome: reparticoes.nome,
      numeroInteressado: reparticoes.numeroInteressado,
      responsavelDfd: reparticoes.responsavelDfd,
      oculto: reparticoes.oculto,
      orgaoProprio: reparticoes.orgaoProprio,
    })
    .from(reparticoes)
    .where(eq(reparticoes.id, id))
    .limit(1);
  if (!u) return erro("Unidade não encontrada.", 404);
  if (u.codigo.toUpperCase() === "GERAL") return erro("A unidade 'Geral' é virtual e não pode ser promovida.", 400);
  const perm = podePromoverUnidade({ orgaoProprio: u.orgaoProprio, temVinculo: await unidadeTemVinculo(id) });
  if (!perm.ok) return erro(perm.motivo, 409);

  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${orgaos.ordem}), -1)` }).from(orgaos);
  const dados = orgaoDeUnidade(u);
  // Atômico: cria o órgão e apaga a unidade de origem (a identidade "sobe" de tabela).
  const stmts = [
    db
      .insert(orgaos)
      .values({ ...dados, ordem: Number(max) + 1 })
      .returning({ id: orgaos.id }),
    db.delete(reparticoes).where(eq(reparticoes.id, id)),
  ];
  const [ins] = await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  const novoId = (ins as { id: number }[])[0]?.id ?? null;
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "orgao",
    entidadeId: novoId,
    resumo: `Unidade "${u.nome}" (${u.codigo}) promovida a órgão`,
    depois: { nome: u.nome, sigla: u.codigo },
  });
  return ok({ id: novoId });
}
