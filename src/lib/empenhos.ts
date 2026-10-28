import { and, count, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { centiLotePassos, centiLotes, empenhos } from "@/db/schema";
import { getDb } from "./db";
import { lerOrgaosCenti } from "./liquidacoes-core";
import { registrarLeituraCard } from "./empenho-cards";
import { COLUNAS_PASSO, comandosFecharLote, type LinhaPasso, MSG_PAGINA_IGUAL } from "./empenhos-sql";
import { CONDUTOR_AUTO, type EstadoLote, type SaudeLote, type EstadoPasso, erroUnico, LEITOR_EMPENHOS, type LoteCenti, MINUTOS_LOTE_PARADO, type ModoLote, type PassoLote, QUEM_AUTO, SEGUNDOS_CONDUCAO } from "./empenhos-core";

/** Os LOTES de importação dos CARDS de empenhos (D1). Os comandos das páginas e da promoção ficam em `empenhos-sql.ts`. */

/** "AAAA-MM-DD HH:MM:SS" (UTC, o formato do `datetime()` do SQLite) de agora. */
const agoraSql = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** A linha → o lote da tela: o TOKEN de quem conduz nunca sai (só se outra aba conduz agora — `conduzido`). */
function paraLote(l: typeof centiLotes.$inferSelect): LoteCenti {
  const { cardId: _, idOrgaoCenti: __, autoAte: ___, orgaosCenti, estado, modo, condutor, conduzindoAte, ...resto } = l;
  return { ...resto, orgaosCenti: lerOrgaosCenti(orgaosCenti), estado: estado as EstadoLote, modo: modo === "unidades" || modo === "liquidacoes" || modo === "pagamentos" ? modo : "dados", conduzido: estado === "lendo" && !!condutor && !!conduzindoAte && conduzindoAte > agoraSql(), automatica: estado === "lendo" && condutor === CONDUTOR_AUTO && !!conduzindoAte && conduzindoAte > agoraSql() };
}

/** O histórico das importações do card, com a SAÚDE de cada uma (pedidos à Centi, erros, bytes baixados, tempo de espera). */
export async function listarLotes(cardId: number, limite = 20): Promise<(LoteCenti & { saude: SaudeLote })[]> {
  const db = getDb();
  const l = await db.select().from(centiLotes).where(eq(centiLotes.cardId, cardId)).orderBy(desc(centiLotes.id)).limit(limite);
  if (!l.length) return [];
  const s = await db
    .select({
      lote: centiLotePassos.loteId,
      pedidos: count(),
      // O passo de uma página que ainda recebe as partes fica como "erro" com a marca "Guardando…" — não é erro.
      erros: sql<number>`SUM(CASE WHEN ${centiLotePassos.estado} = 'erro' AND COALESCE(${centiLotePassos.mensagem}, '') NOT LIKE 'Guardando a página%' THEN 1 ELSE 0 END)`,
      bytes: sql<number>`COALESCE(SUM(${centiLotePassos.bytes}), 0)`,
      ms: sql<number>`COALESCE(SUM(${centiLotePassos.ms}), 0)`,
      semMudanca: sql<number>`SUM(CASE WHEN ${centiLotePassos.mensagem} = ${MSG_PAGINA_IGUAL} THEN 1 ELSE 0 END)`,
    })
    .from(centiLotePassos)
    .where(sql`${centiLotePassos.loteId} IN (SELECT value FROM json_each(${JSON.stringify(l.map((x) => x.id))}))`)
    .groupBy(centiLotePassos.loteId);
  const porLote = new Map(s.map((x) => [x.lote, x]));
  return l.map((x) => {
    const r = porLote.get(x.id);
    return { ...paraLote(x), saude: { pedidos: r?.pedidos ?? 0, erros: Number(r?.erros ?? 0), bytes: Number(r?.bytes ?? 0), msCenti: Number(r?.ms ?? 0), semMudanca: Number(r?.semMudanca ?? 0) } };
  });
}

export async function getLote(id: number, cardId: number): Promise<LoteCenti | null> {
  const [l] = await getDb()
    .select()
    .from(centiLotes)
    .where(and(eq(centiLotes.id, id), eq(centiLotes.cardId, cardId)))
    .limit(1);
  return l ? paraLote(l) : null;
}

/**
 * O lote ainda lendo deste card. O parado há mais de 30 min (nenhuma página, nenhuma execução) é ENCERRADO como abandonado
 * antes — com a MESMA limpeza do fechamento (staging e a leitura fragmentada) e a leitura registrada no card (a próxima
 * atualização respeita a frequência). O índice `centi_lotes(card_id, estado, id)` faz as duas leituras pararem no lote certo.
 */
export async function loteEmAndamento(cardId: number): Promise<LoteCenti | null> {
  const db = getDb();
  const lendo = await db
    .select()
    .from(centiLotes)
    .where(and(eq(centiLotes.cardId, cardId), eq(centiLotes.estado, "lendo")))
    .orderBy(desc(centiLotes.id));
  const limite = new Date(Date.now() - MINUTOS_LOTE_PARADO * 60_000).toISOString().replace("T", " ").slice(0, 19);
  const parados = lendo.filter((l) => l.vistoEm < limite);
  if (parados.length) {
    const msg = `Abandonado: sem atividade por mais de ${MINUTOS_LOTE_PARADO} minutos.`;
    await db.batch(parados.flatMap((l) => comandosFecharLote(db, l.id, "falhou", msg)) as never);
    const ultimo = parados[0];
    await registrarLeituraCard(cardId, "falhou", ultimo.unicos + ultimo.recusados, ultimo.totalInformado);
  }
  const ativo = lendo.find((l) => l.vistoEm >= limite);
  return ativo ? paraLote(ativo) : null;
}

/**
 * Cria o lote JÁ conduzido pela aba que o pediu (o token dela), com a versão atual do leitor. `modo` "unidades" = só
 * PUXA as unidades da Centi (nada é gravado nos empenhos).
 */
export async function criarLote(cardId: number, ano: number, quem: string, condutor: string, modo: ModoLote = "dados", orgaosCenti: number[] | null = null): Promise<LoteCenti> {
  try {
    const [l] = await getDb()
      .insert(centiLotes)
      .values({ cardId, ano, modo, orgaosCenti: orgaosCenti ? JSON.stringify(orgaosCenti) : null, iniciadoPor: quem, leitor: LEITOR_EMPENHOS, condutor, conduzindoAte: sql`datetime('now', ${`+${SEGUNDOS_CONDUCAO} seconds`})` })
      .returning();
    return paraLote(l);
  } catch (e) {
    // UM lote LENDO por card (índice único — a aba e a automática começando juntas): fica o que entrou primeiro; quem
    // chegou depois recebe ele (e a trava de quem conduz decide quem segue).
    const existente = erroUnico(e) ? await loteEmAndamento(cardId) : null;
    if (existente) return existente;
    throw e;
  }
}

/** Os PASSOS de um lote (na ordem em que aconteceram) — a tela ao vivo, a retomada e o detalhe do histórico. */
export async function listarPassos(loteId: number, limite = 3000): Promise<PassoLote[]> {
  const l = await getDb().select(COLUNAS_PASSO).from(centiLotePassos).where(eq(centiLotePassos.loteId, loteId)).orderBy(centiLotePassos.id).limit(limite);
  return l.map(paraPasso);
}

/** A linha do banco → o passo da tela (o estado tipado, o fim do período booleano). */
export function paraPasso({ loteId: _, estado, fimPeriodo, ...resto }: LinhaPasso): PassoLote {
  return { ...resto, estado: estado as EstadoPasso, fimPeriodo: fimPeriodo === 1 };
}

/** Os anos do card com empenhos lidos por um LEITOR ANTERIOR (o sistema pede para importar de novo — nada é apagado). */
export async function anosDesatualizados(cardId: number): Promise<{ ano: number; n: number }[]> {
  return getDb()
    .select({ ano: empenhos.ano, n: count() })
    .from(empenhos)
    .where(and(eq(empenhos.cardId, cardId), isNull(empenhos.removidoEm), lt(empenhos.leitor, LEITOR_EMPENHOS)))
    .groupBy(empenhos.ano)
    .orderBy(desc(empenhos.ano));
}

/**
 * O RODÍZIO da atualização automática, por ano do card: quando cada ano foi lido pela última vez (o início do último lote
 * encerrado DO TIPO do card) e os anos em ESPERA — a última automática do ano falhou ou ficou parcial (queda, resposta
 * inválida, grande demais) há menos de `HORAS_ESPERA_FALHA`: repetir o mesmo ano não adianta (nem enche a auditoria); a
 * importação manual ou um lote promovido depois liberam o ano.
 */
export const HORAS_ESPERA_FALHA = 12;
export async function rodizioDosAnos(cardId: number, modo: ModoLote): Promise<{ ultima: Map<number, string>; emEspera: Set<number> }> {
  const l = await getDb()
    .select({
      ano: centiLotes.ano,
      em: sql<string>`MAX(${centiLotes.iniciadoEm})`,
      promovido: sql<string | null>`MAX(CASE WHEN ${centiLotes.estado} = 'promovido' OR ${centiLotes.iniciadoPor} <> ${QUEM_AUTO} THEN ${centiLotes.iniciadoEm} END)`,
      falha: sql<string | null>`MAX(CASE WHEN ${centiLotes.estado} IN ('falhou', 'parcial') AND ${centiLotes.iniciadoPor} = ${QUEM_AUTO} AND ${centiLotes.concluidoEm} > datetime('now', ${`-${HORAS_ESPERA_FALHA} hours`}) THEN ${centiLotes.iniciadoEm} END)`,
    })
    .from(centiLotes)
    .where(and(eq(centiLotes.cardId, cardId), ne(centiLotes.estado, "lendo"), eq(centiLotes.modo, modo)))
    .groupBy(centiLotes.ano);
  return {
    ultima: new Map(l.map((x) => [x.ano, x.em])),
    emEspera: new Set(l.filter((x) => x.falha && (!x.promovido || x.promovido < x.falha)).map((x) => x.ano)),
  };
}

/** Os PASSOS mínimos do lote (sem o corpo enviado — a retomada e os erros), TODOS: a automática decide o próximo pedido. */
export async function passosDaRetomada(loteId: number) {
  return getDb()
    .select({
      inicio: centiLotePassos.inicio,
      fim: centiLotePassos.fim,
      pagina: centiLotePassos.pagina,
      estado: sql<EstadoPasso>`${centiLotePassos.estado}`,
      fimPeriodo: sql<boolean>`${centiLotePassos.fimPeriodo} = 1`,
      mensagem: sql<string | null>`substr(${centiLotePassos.mensagem}, 1, 40)`,
      em: centiLotePassos.em,
    })
    .from(centiLotePassos)
    .where(eq(centiLotePassos.loteId, loteId))
    .orderBy(centiLotePassos.id);
}
