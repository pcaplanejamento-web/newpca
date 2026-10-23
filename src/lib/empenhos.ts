import { and, count, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { centiLotePassos, centiLotes, empenhos } from "@/db/schema";
import { getDb } from "./db";
import { type EstadoLote, type EstadoPasso, LEITOR_EMPENHOS, type LoteCenti, MINUTOS_LOTE_PARADO, type PassoLote, SEGUNDOS_CONDUCAO } from "./empenhos-core";

/** Os LOTES de importação das APIs da Centi (D1). Os comandos das páginas e da promoção ficam em `empenhos-sql.ts`. */

/** "AAAA-MM-DD HH:MM:SS" (UTC, o formato do `datetime()` do SQLite) de agora. */
const agoraSql = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** A linha → o lote da tela: o TOKEN de quem conduz nunca sai (só se outra aba conduz agora — `conduzido`). */
function paraLote(l: typeof centiLotes.$inferSelect): LoteCenti {
  const { apiChave: _, estado, condutor, conduzindoAte, ...resto } = l;
  return { ...resto, estado: estado as EstadoLote, conduzido: estado === "lendo" && !!condutor && !!conduzindoAte && conduzindoAte > agoraSql() };
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

/** Cria o lote JÁ conduzido pela aba que o pediu (o token dela), com a versão atual do leitor. */
export async function criarLote(apiChave: string, ano: number, quem: string, condutor: string): Promise<LoteCenti> {
  const [l] = await getDb()
    .insert(centiLotes)
    .values({ apiChave, ano, iniciadoPor: quem, leitor: LEITOR_EMPENHOS, condutor, conduzindoAte: sql`datetime('now', ${`+${SEGUNDOS_CONDUCAO} seconds`})` })
    .returning();
  return paraLote(l);
}

/** Os PASSOS de um lote (na ordem em que aconteceram) — a tela ao vivo, a retomada e o detalhe do histórico. */
export async function listarPassos(loteId: number, limite = 3000): Promise<PassoLote[]> {
  const l = await getDb().select().from(centiLotePassos).where(eq(centiLotePassos.loteId, loteId)).orderBy(centiLotePassos.id).limit(limite);
  return l.map(paraPasso);
}

/** A linha do banco → o passo da tela (o estado tipado, o fim do período booleano). */
export function paraPasso({ loteId: _, estado, fimPeriodo, ...resto }: typeof centiLotePassos.$inferSelect): PassoLote {
  return { ...resto, estado: estado as EstadoPasso, fimPeriodo: fimPeriodo === 1 };
}

/** Os anos com empenhos lidos por um LEITOR ANTERIOR (o sistema pede para importar de novo — nada é apagado). */
export async function anosDesatualizados(): Promise<{ ano: number; n: number }[]> {
  return getDb()
    .select({ ano: empenhos.ano, n: count() })
    .from(empenhos)
    .where(and(isNull(empenhos.removidoEm), lt(empenhos.leitor, LEITOR_EMPENHOS)))
    .groupBy(empenhos.ano)
    .orderBy(desc(empenhos.ano));
}

/** Quando cada ano foi lido pela última vez (o início do último lote encerrado) — o rodízio da atualização automática. */
export async function ultimaLeituraPorAno(apiChave: string): Promise<Map<number, string>> {
  const l = await getDb()
    .select({ ano: centiLotes.ano, em: sql<string>`MAX(${centiLotes.iniciadoEm})` })
    .from(centiLotes)
    .where(and(eq(centiLotes.apiChave, apiChave), ne(centiLotes.estado, "lendo")))
    .groupBy(centiLotes.ano);
  return new Map(l.map((x) => [x.ano, x.em]));
}
