import { eq, sql } from "drizzle-orm";
import { dfds, orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { orgaoDeUnidade, podePromoverUnidade, unidadePreservadaNoPromover } from "@/lib/orgao-unidade-ops";
import { unidadeTemVinculo } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/**
 * PROMOVER uma unidade a ÓRGÃO (requisito 1). Cria o órgão com a identidade da unidade (batch
 * atômico). SEM vínculo, a unidade é EXCLUÍDA (a identidade "sobe" de tabela). COM vínculo
 * (DFD/protocolo/itens), a unidade é PRESERVADA como a UNIDADE PRÓPRIA do novo órgão (dual — mesmo
 * id: nada é reapontado nem perdido) e o `orgao_id` dos seus DFDs passa ao novo órgão. Barrado só
 * para a unidade própria de um órgão dual.
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
      orgaoId: reparticoes.orgaoId,
    })
    .from(reparticoes)
    .where(eq(reparticoes.id, id))
    .limit(1);
  if (!u) return erro("Unidade não encontrada.", 404);
  if (u.codigo.toUpperCase() === "GERAL") return erro("A unidade 'Geral' é virtual e não pode ser promovida.", 400);
  const perm = podePromoverUnidade({ orgaoProprio: u.orgaoProprio });
  if (!perm.ok) return erro(perm.motivo, 409);
  const preservar = await unidadeTemVinculo(id);

  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${orgaos.ordem}), -1)` }).from(orgaos);
  const dados = orgaoDeUnidade(u);
  const insOrgao = db
    .insert(orgaos)
    // Com vínculo os responsáveis ficam na unidade preservada (é ela que confere a assinatura).
    .values({ ...dados, responsavelDfd: preservar ? null : dados.responsavelDfd, ordem: Number(max) + 1 })
    .returning({ id: orgaos.id });
  const stmts: unknown[] = [insOrgao];
  if (preservar) {
    const [origem] =
      u.orgaoId != null
        ? await db
            .select({ assinaturaUnica: orgaos.assinaturaUnica, responsavelDfd: orgaos.responsavelDfd })
            .from(orgaos)
            .where(eq(orgaos.id, u.orgaoId))
            .limit(1)
        : [];
    // O batch do D1 é UMA transação sequencial → o órgão recém-criado é o MAX(id) logo após o insert.
    const novoOrgao = sql`(SELECT MAX(id) FROM orgaos)`;
    stmts.push(
      db
        .update(reparticoes)
        .set({ ...unidadePreservadaNoPromover(u, origem ?? null), orgaoId: novoOrgao, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
        .where(eq(reparticoes.id, id)),
      db.update(dfds).set({ orgaoId: novoOrgao }).where(eq(dfds.reparticaoId, id)),
    );
  } else {
    // Sem vínculo: cria o órgão e apaga a unidade de origem (a identidade "sobe" de tabela).
    stmts.push(db.delete(reparticoes).where(eq(reparticoes.id, id)));
  }
  const [ins] = await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
  const novoId = (ins as { id: number }[])[0]?.id ?? null;
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "orgao",
    entidadeId: novoId,
    resumo: preservar
      ? `Unidade "${u.nome}" (${u.codigo}) promovida a órgão — preservada como unidade própria (tinha vínculos)`
      : `Unidade "${u.nome}" (${u.codigo}) promovida a órgão`,
    depois: { nome: u.nome, sigla: u.codigo, unidadePreservada: preservar ? id : null },
  });
  return ok({ id: novoId, preservada: preservar });
}
