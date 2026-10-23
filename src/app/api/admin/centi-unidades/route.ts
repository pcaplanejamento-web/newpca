import { eq } from "drizzle-orm";
import { centiApis } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { consultaAcoesCenti, consultaUnidadesCenti } from "@/lib/centi-unidades-sql";
import { getDb } from "@/lib/db";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * As UNIDADES ORÇAMENTÁRIAS da Centi (as que as leituras já trouxeram), com o vínculo calculado e os empenhos gravados —
 * e as AÇÕES de cada uma — as opções dos dropdowns de Órgãos e Unidades. `api` = a API de empenhos (o "Buscar na Centi" lê por ela).
 */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const db = getDb();
  const [unidades, acoes, [api]] = await Promise.all([
    consultaUnidadesCenti(db),
    consultaAcoesCenti(db),
    db.select({ id: centiApis.id, parametros: centiApis.parametros }).from(centiApis).where(eq(centiApis.chave, "empenhos")).limit(1),
  ]);
  return ok({ unidades, acoes, api: api ?? null });
}
