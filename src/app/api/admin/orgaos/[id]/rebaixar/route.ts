import { eq, sql } from "drizzle-orm";
import { dfdProtocolos, dfds, orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarUnidadesDoOrgao } from "@/lib/orgaos";
import { ehCodigoGeral } from "@/lib/escopo-unidades-core";
import { podeRebaixarOrgao, propriaRebaixada, unidadeDeOrgao, vinculosNoRebaixar } from "@/lib/orgao-unidade-ops";
import { comandoApagarVinculos, comandoMoverVinculos, consultaContaVinculos } from "@/lib/responsaveis-sql";
import { rebaixarOrgaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/**
 * REBAIXAR um órgão a UNIDADE de outro órgão (requisito 2), com ou sem DFD/protocolo/itens
 * vinculados (batch atômico). A unidade resultante sob o `orgaoDestino` é: a UNIDADE PRÓPRIA do
 * órgão, se ele era dual (desce preservando o id — os vínculos seguem nela), ou uma unidade NOVA
 * com a identidade do órgão. Os vínculos diretos do órgão (`orgao_id` em DFDs/protocolos) são
 * realinhados para essa unidade/destino ANTES de excluir o órgão — nada fica órfão. Barrado só se o
 * órgão tiver unidades-FILHAS comuns (elas precisariam de outro órgão).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(rebaixarOrgaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const destino = corpo.data.orgaoDestino;
  if (destino === id) return erro("Escolha um órgão de destino diferente.", 400);

  const db = getDb();
  const [o] = await db
    .select({
      sigla: orgaos.sigla,
      nome: orgaos.nome,
      numeroInteressado: orgaos.numeroInteressado,
      assinaturaUnica: orgaos.assinaturaUnica,
      oculto: orgaos.oculto,
    })
    .from(orgaos)
    .where(eq(orgaos.id, id))
    .limit(1);
  if (!o) return erro("Órgão não encontrado.", 404);
  // A sigla vira o CÓDIGO da unidade — "GERAL" é o da unidade virtual (todas as unidades).
  if (ehCodigoGeral(o.sigla)) return erro("A sigla 'GERAL' é reservada à unidade virtual — altere a sigla do órgão antes.", 400);
  const [dest] = await db.select({ id: orgaos.id }).from(orgaos).where(eq(orgaos.id, destino)).limit(1);
  if (!dest) return erro("Órgão de destino não encontrado.", 404);
  // O destino não pode ser um órgão que funciona como unidade (ele não recebe unidades-filhas).
  if ((await contarUnidadesDoOrgao(destino)).propriaId != null)
    return erro("O órgão de destino funciona como unidade (unidade própria) e não recebe unidades-filhas.", 409);

  const { filhas, propriaId } = await contarUnidadesDoOrgao(id);
  const perm = podeRebaixarOrgao({ temUnidadesFilhas: filhas > 0 });
  if (!perm.ok) return erro(perm.motivo, 409);

  // A unidade que representa o órgão rebaixado: a PRÓPRIA (dual — desce como unidade comum,
  // mesmo id, vínculos junto) ou uma NOVA com a identidade do órgão sob o destino (no batch do D1 —
  // UMA transação sequencial — ela é o MAX(id) logo após o insert).
  const [propria] =
    propriaId != null
      ? await db
          .select({ numeroInteressado: reparticoes.numeroInteressado, oculto: reparticoes.oculto })
          .from(reparticoes)
          .where(eq(reparticoes.id, propriaId))
          .limit(1)
      : [];
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${reparticoes.ordem}), -1)` }).from(reparticoes);
  const unidade = propria && propriaId != null ? sql`${propriaId}` : sql`(SELECT MAX(id) FROM reparticoes)`;
  const stmtUnidade =
    propria && propriaId != null
      ? db
          .update(reparticoes)
          .set({ ...propriaRebaixada(o, propria, destino), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
          .where(eq(reparticoes.id, propriaId))
          .returning({ id: reparticoes.id })
      : db
          .insert(reparticoes)
          .values({ ...unidadeDeOrgao(o, destino), ordem: Number(max) + 1 })
          .returning({ id: reparticoes.id });
  // Os RESPONSÁVEIS do órgão nunca ficam para trás (o órgão é excluído — os vínculos dele iriam em cascata).
  const [[{ n: doOrgao }], [{ n: daPropria }]] = await Promise.all([
    consultaContaVinculos(db, { orgaoId: id }),
    propriaId != null ? consultaContaVinculos(db, { reparticaoId: propriaId }) : Promise.resolve([{ n: 0 }]),
  ]);
  const responsaveis = vinculosNoRebaixar({
    propria: !!propria,
    orgaoUnica: o.assinaturaUnica,
    orgaoTemVinculos: Number(doOrgao) > 0,
    propriaTemVinculos: Number(daPropria) > 0,
  });
  const stmtsResp =
    responsaveis === "manter"
      ? []
      : [
          ...(responsaveis === "substituirPelosDoOrgao" ? [comandoApagarVinculos(db, { reparticaoId: unidade })] : []),
          comandoMoverVinculos(db, { orgaoId: id }, { reparticaoId: unidade }),
        ];
  // Realinha os vínculos (antes de excluir o órgão): DFD sem unidade ou já na unidade → unidade + órgão
  // destino; DFD em outra unidade → o órgão DELA. Protocolo em nome do órgão → passa a ser da unidade.
  const stmts = [
    stmtUnidade,
    db
      .update(dfds)
      .set({
        orgaoId: sql`CASE WHEN ${dfds.reparticaoId} IS NULL OR ${dfds.reparticaoId} = ${unidade} THEN ${destino}
          ELSE (SELECT r.orgao_id FROM reparticoes r WHERE r.id = ${dfds.reparticaoId}) END`,
        reparticaoId: sql`COALESCE(${dfds.reparticaoId}, ${unidade})`,
      })
      .where(sql`${dfds.orgaoId} = ${id} OR ${dfds.reparticaoId} = ${unidade}`),
    db
      .update(dfdProtocolos)
      .set({ orgaoId: null, reparticaoId: sql`COALESCE(${dfdProtocolos.reparticaoId}, ${unidade})` })
      .where(eq(dfdProtocolos.orgaoId, id)),
    ...stmtsResp,
    db.delete(orgaos).where(eq(orgaos.id, id)),
  ];
  const [ins] = await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
  const novoId = (ins as { id: number }[])[0]?.id ?? null;
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "reparticao",
    entidadeId: novoId,
    resumo:
      propria
        ? `Órgão "${o.nome}" (${o.sigla}) rebaixado a unidade — a unidade própria desceu com os vínculos`
        : `Órgão "${o.nome}" (${o.sigla}) rebaixado a unidade`,
    depois: { nome: o.nome, codigo: o.sigla, orgaoId: destino },
  });
  return ok({ id: novoId });
}
