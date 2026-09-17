import { eq, sql } from "drizzle-orm";
import { orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarUnidadesDoOrgao, orgaoTemVinculo } from "@/lib/orgaos";
import { podeRebaixarOrgao, unidadeDeOrgao } from "@/lib/orgao-unidade-ops";
import { rebaixarOrgaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/**
 * REBAIXAR um órgão a UNIDADE de outro órgão (requisito 2). Cria a unidade sob o `orgaoDestino`
 * com a identidade do órgão e EXCLUI o órgão (batch atômico). Barrado se o órgão tiver unidades
 * (filhas ou própria) ou vínculo direto (ponto 8).
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
      responsavelDfd: orgaos.responsavelDfd,
      oculto: orgaos.oculto,
    })
    .from(orgaos)
    .where(eq(orgaos.id, id))
    .limit(1);
  if (!o) return erro("Órgão não encontrado.", 404);
  const [dest] = await db.select({ id: orgaos.id }).from(orgaos).where(eq(orgaos.id, destino)).limit(1);
  if (!dest) return erro("Órgão de destino não encontrado.", 404);
  // O destino não pode ser um órgão que funciona como unidade (ele não recebe unidades-filhas).
  if ((await contarUnidadesDoOrgao(destino)).propriaId != null)
    return erro("O órgão de destino funciona como unidade (unidade própria) e não recebe unidades-filhas.", 409);

  const { total } = await contarUnidadesDoOrgao(id);
  const perm = podeRebaixarOrgao({ temUnidades: total > 0, temVinculo: await orgaoTemVinculo(id) });
  if (!perm.ok) return erro(perm.motivo, 409);

  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${reparticoes.ordem}), -1)` }).from(reparticoes);
  const dados = unidadeDeOrgao(o, destino);
  // Atômico: cria a unidade sob o destino e apaga o órgão (a identidade "desce" de tabela).
  const stmts = [
    db
      .insert(reparticoes)
      .values({ ...dados, ordem: Number(max) + 1 })
      .returning({ id: reparticoes.id }),
    db.delete(orgaos).where(eq(orgaos.id, id)),
  ];
  const [ins] = await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  const novoId = (ins as { id: number }[])[0]?.id ?? null;
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "reparticao",
    entidadeId: novoId,
    resumo: `Órgão "${o.nome}" (${o.sigla}) rebaixado a unidade`,
    depois: { nome: o.nome, codigo: o.sigla, orgaoId: destino },
  });
  return ok({ id: novoId });
}
