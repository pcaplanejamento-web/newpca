import { and, eq, ne } from "drizzle-orm";
import { centiUnidades, orgaos, reparticoes } from "@/db/schema";
import { motivoVinculoCenti } from "./centi-unidades-core";
import { consultaAcoesCenti, consultaUnidadesCenti } from "./centi-unidades-sql";
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

/**
 * O VÍNCULO da unidade com a Centi DEPOIS da gravação (a unidade orçamentária e as ações dela) e a conferência pela regra
 * única (`motivoVinculoCenti`). Ausente no pedido = não muda; trocar a unidade orçamentária sem mandar as ações = nenhuma
 * (a nova inteira). `reparticaoId` null = unidade nova. Devolve o erro (409/422) ou o estado final.
 */
export async function vinculoCentiDaUnidade(
  reparticaoId: number | null,
  pedido: { centiUnidadeId?: number | null; centiAcoes?: number[] },
): Promise<{ erro: { msg: string; status: number } } | { unidadeId: number | null; acoes: number[]; mexeu: boolean }> {
  const db = getDb();
  const [atual] = reparticaoId == null ? [] : await db.select({ u: reparticoes.centiUnidadeId }).from(reparticoes).where(eq(reparticoes.id, reparticaoId)).limit(1);
  const unidadeAtual = atual?.u ?? null;
  const mexeu = pedido.centiUnidadeId !== undefined || pedido.centiAcoes !== undefined;
  if (!mexeu) return { unidadeId: unidadeAtual, acoes: [], mexeu };
  const [unidades, acoes] = await Promise.all([consultaUnidadesCenti(db), consultaAcoesCenti(db)]);
  const unidadeId = pedido.centiUnidadeId === undefined ? unidadeAtual : pedido.centiUnidadeId;
  const atuais = reparticaoId == null ? [] : acoes.filter((a) => a.reparticaoId === reparticaoId).map((a) => a.id);
  const escolhidas = [...new Set(pedido.centiAcoes ?? (unidadeId === unidadeAtual ? atuais : []))];
  const m = motivoVinculoCenti({ reparticaoId: reparticaoId ?? 0, unidadeId, acoes: escolhidas }, unidades, acoes);
  if (m) {
    const [o] = m.outra != null ? await db.select({ codigo: reparticoes.codigo }).from(reparticoes).where(eq(reparticoes.id, m.outra)).limit(1) : [];
    return { erro: { msg: o ? `${m.msg} (unidade ${o.codigo})` : m.msg, status: m.status } };
  }
  return { unidadeId, acoes: escolhidas, mexeu };
}
