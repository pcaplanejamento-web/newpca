import { and, desc, eq, sql } from "drizzle-orm";
import { centiLotes } from "@/db/schema";
import { getDb } from "./db";
import { type EstadoLote, type LoteCenti, MINUTOS_LOTE_PARADO } from "./empenhos-core";

/** Os LOTES de importação das APIs da Centi (D1). Os comandos das páginas e da promoção ficam em `empenhos-sql.ts`. */

function paraLote(l: typeof centiLotes.$inferSelect): LoteCenti {
  const { apiChave: _, estado, ...resto } = l;
  return { ...resto, estado: estado as EstadoLote };
}

export async function listarLotes(apiChave: string, limite = 20): Promise<LoteCenti[]> {
  const l = await getDb().select().from(centiLotes).where(eq(centiLotes.apiChave, apiChave)).orderBy(desc(centiLotes.id)).limit(limite);
  return l.map(paraLote);
}

export async function getLote(id: number, apiChave: string): Promise<LoteCenti | null> {
  const [l] = await getDb()
    .select()
    .from(centiLotes)
    .where(and(eq(centiLotes.id, id), eq(centiLotes.apiChave, apiChave)))
    .limit(1);
  return l ? paraLote(l) : null;
}

/** O lote ainda lendo desta API (o parado há mais de 30 min é encerrado como abandonado antes). */
export async function loteEmAndamento(apiChave: string): Promise<LoteCenti | null> {
  const db = getDb();
  await db
    .update(centiLotes)
    .set({ estado: "falhou", mensagem: `Abandonado: sem atividade por mais de ${MINUTOS_LOTE_PARADO} minutos.`, concluidoEm: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(centiLotes.apiChave, apiChave), eq(centiLotes.estado, "lendo"), sql`${centiLotes.vistoEm} < datetime('now', ${`-${MINUTOS_LOTE_PARADO} minutes`})`));
  const [l] = await db
    .select()
    .from(centiLotes)
    .where(and(eq(centiLotes.apiChave, apiChave), eq(centiLotes.estado, "lendo")))
    .orderBy(desc(centiLotes.id))
    .limit(1);
  return l ? paraLote(l) : null;
}

export async function criarLote(apiChave: string, ano: number, quem: string): Promise<LoteCenti> {
  const [l] = await getDb().insert(centiLotes).values({ apiChave, ano, iniciadoPor: quem }).returning();
  return paraLote(l);
}
