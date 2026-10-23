import { and, eq, ne } from "drizzle-orm";
import { centiUnidades, orgaos, reparticoes } from "@/db/schema";
import { rotuloAcaoCenti } from "./centi-unidades-core";
import { consultaAcoesCenti } from "./centi-unidades-sql";
import { getDb } from "./db";

/**
 * A conferência do VÍNCULO com a Centi escolhido no cadastro (D1): o órgão gestor e a unidade orçamentária têm de ser das
 * já lidas da Centi e cada um vale para UM órgão / UMA unidade do sistema. Devolve o motivo da recusa (409/422) ou null.
 */
export async function motivoOrgaoGestor(gestor: string | null | undefined, orgaoId: number | null): Promise<{ msg: string; status: number } | null> {
  if (!gestor) return null;
  const db = getDb();
  const [lido] = await db.select({ id: centiUnidades.id }).from(centiUnidades).where(eq(centiUnidades.orgaoGestor, gestor)).limit(1);
  if (!lido) return { msg: "Órgão gestor não encontrado na Centi — use “Buscar na Centi” na lista.", status: 422 };
  const [outro] = await db
    .select({ sigla: orgaos.sigla })
    .from(orgaos)
    .where(orgaoId == null ? eq(orgaos.centiOrgaoGestor, gestor) : and(eq(orgaos.centiOrgaoGestor, gestor), ne(orgaos.id, orgaoId)))
    .limit(1);
  return outro ? { msg: `O órgão gestor "${gestor}" já está vinculado ao órgão ${outro.sigla}.`, status: 409 } : null;
}

export async function motivoUnidadeCenti(id: number | null | undefined, reparticaoId: number | null): Promise<{ msg: string; status: number } | null> {
  if (id == null) return null;
  const db = getDb();
  const [lida] = await db.select({ id: centiUnidades.id }).from(centiUnidades).where(eq(centiUnidades.id, id)).limit(1);
  if (!lida) return { msg: "Unidade orçamentária não encontrada na Centi — use “Buscar na Centi” na lista.", status: 422 };
  const [outra] = await db
    .select({ codigo: reparticoes.codigo })
    .from(reparticoes)
    .where(reparticaoId == null ? eq(reparticoes.centiUnidadeId, id) : and(eq(reparticoes.centiUnidadeId, id), ne(reparticoes.id, reparticaoId)))
    .limit(1);
  return outra ? { msg: `Esta unidade orçamentária já está vinculada à unidade ${outra.codigo}.`, status: 409 } : null;
}

/** As AÇÕES pedidas para a unidade: todas já lidas da Centi (422) e nenhuma de OUTRA unidade (409 — uma ação em UMA). */
export async function motivoAcoesCenti(ids: number[], reparticaoId: number): Promise<{ msg: string; status: number } | null> {
  if (!ids.length) return null;
  const db = getDb();
  const lista = await consultaAcoesCenti(db);
  const porId = new Map(lista.map((a) => [a.id, a]));
  if (ids.some((i) => !porId.has(i))) return { msg: "Ação não encontrada na Centi — use “Buscar na Centi” na lista.", status: 422 };
  const outra = ids.map((i) => porId.get(i)).find((a) => a && a.reparticaoId != null && a.reparticaoId !== reparticaoId);
  if (!outra) return null;
  const [r] = await db.select({ codigo: reparticoes.codigo }).from(reparticoes).where(eq(reparticoes.id, outra.reparticaoId as number)).limit(1);
  return { msg: `A ação "${rotuloAcaoCenti(outra)}" já está vinculada à unidade ${r?.codigo ?? "outra"}.`, status: 409 };
}
