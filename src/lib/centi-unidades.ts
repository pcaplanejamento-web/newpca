import { and, eq, ne } from "drizzle-orm";
import { centiUnidades, orgaos, reparticoes } from "@/db/schema";
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
