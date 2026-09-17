import { eq, sql } from "drizzle-orm";
import { orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarUnidadesDoOrgao } from "@/lib/orgaos";
import { podeRemoverUnidadePropria, podeTornarUnidade, unidadePropriaDeOrgao } from "@/lib/orgao-unidade-ops";
import { unidadePropriaSchema } from "@/lib/rbac-validation";
import { unidadeTemVinculo } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/**
 * ÓRGÃO QUE TAMBÉM É UNIDADE (requisito 3). `ativar` cria a UNIDADE PRÓPRIA que representa o
 * órgão (só se ele não tiver unidades-filhas e não for dual); `!ativar` remove a unidade própria
 * (barrado se ela tiver vínculo). Assim o órgão passa a ter os DOIS status, com todas as funções.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(unidadePropriaSchema, req);
  if ("resp" in corpo) return corpo.resp;

  const db = getDb();
  const [o] = await db
    .select({ sigla: orgaos.sigla, nome: orgaos.nome, oculto: orgaos.oculto })
    .from(orgaos)
    .where(eq(orgaos.id, id))
    .limit(1);
  if (!o) return erro("Órgão não encontrado.", 404);
  const contagem = await contarUnidadesDoOrgao(id);

  if (corpo.data.ativar) {
    const perm = podeTornarUnidade({ temUnidadesFilhas: contagem.filhas > 0, jaEhDual: contagem.propriaId != null });
    if (!perm.ok) return erro(perm.motivo, 409);
    const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${reparticoes.ordem}), -1)` }).from(reparticoes);
    await db.insert(reparticoes).values({ ...unidadePropriaDeOrgao(o, id), ordem: Number(max) + 1 });
    await registrarAuditoria({ usuario: guard.u, acao: "editar", entidade: "orgao", entidadeId: id, resumo: `Órgão "${o.nome}" passou a funcionar também como unidade`, depois: { tambemUnidade: true } });
    return ok();
  }

  // Desligar: remover a unidade própria.
  if (contagem.propriaId == null) return erro("Este órgão não funciona como unidade.", 409);
  const perm = podeRemoverUnidadePropria({ temVinculo: await unidadeTemVinculo(contagem.propriaId) });
  if (!perm.ok) return erro(perm.motivo, 409);
  await db.delete(reparticoes).where(eq(reparticoes.id, contagem.propriaId));
  await registrarAuditoria({ usuario: guard.u, acao: "editar", entidade: "orgao", entidadeId: id, resumo: `Órgão "${o.nome}" deixou de funcionar como unidade`, depois: { tambemUnidade: false } });
  return ok();
}
