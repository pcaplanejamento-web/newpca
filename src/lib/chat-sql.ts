import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { chatConversas, chatMensagens } from "../db/schema.ts";

// O CHAT GUARDADO POR 7 DIAS no D1 — só BUILDERS do Drizzle (valem dentro de `db.batch`; testados no driver D1 real em
// `tests/chat.test.ts`). As chaves das conversas: `g<grupo>` | `p<menor>-<maior>` | `c<id>` (`chaveConversa`, chat-core).

type Db = DrizzleD1Database<Record<string, unknown>>;

/** Linhas de `chat_conversas` por INSERT (7 colunas → 70 parâmetros, abaixo dos 100 do D1). */
const LOTE_CONVERSAS = 10;

export type NovaMensagemChat = {
  id: string;
  chave: string;
  de: number;
  texto: string;
  resp: string | null;
  em: number;
  /** Quem participa (na privada e na conversa em grupo: todos, com quem mandou) — a conversa entra na lista de cada um. No
   * chat do GRUPO, só quem mandou (os membros do grupo leem pela chave do grupo). */
  participantes: number[];
  nome?: string | null;
  membros?: number[] | null;
};

/** GUARDAR uma mensagem: a mensagem (a mesma, de novo, não duplica) + a conversa na lista de cada participante (a última
 * mensagem; quem mandou já leu até ela). */
export function comandosGuardarMensagem(db: Db, m: NovaMensagemChat) {
  const linhas = m.participantes.map((u) => ({
    conversa: m.chave,
    usuarioId: u,
    nome: m.nome ?? null,
    membros: m.membros ? JSON.stringify(m.membros) : null,
    ultimaEm: m.em,
    lidaAte: u === m.de ? m.id : null,
    lidaEm: u === m.de ? m.em : null,
  }));
  const conversas = [];
  for (let i = 0; i < linhas.length; i += LOTE_CONVERSAS) {
    conversas.push(
      db
        .insert(chatConversas)
        .values(linhas.slice(i, i + LOTE_CONVERSAS))
        .onConflictDoUpdate({
          target: [chatConversas.conversa, chatConversas.usuarioId],
          set: {
            ultimaEm: sql`max(${chatConversas.ultimaEm}, excluded.ultima_em)`,
            nome: sql`coalesce(excluded.nome, ${chatConversas.nome})`,
            membros: sql`coalesce(excluded.membros, ${chatConversas.membros})`,
            lidaAte: sql`coalesce(excluded.lida_ate, ${chatConversas.lidaAte})`,
            lidaEm: sql`coalesce(excluded.lida_em, ${chatConversas.lidaEm})`,
          },
        }),
    );
  }
  return [db.insert(chatMensagens).values({ id: m.id, conversa: m.chave, de: m.de, texto: m.texto, resp: m.resp, em: m.em }).onConflictDoNothing(), ...conversas];
}

/** LEU até a mensagem `ate` (o ✓✓ dos outros e as não lidas). Nunca volta para trás. */
export function comandoMarcarLidaChat(db: Db, chave: string, usuarioId: number, ate: string, em: number) {
  return db
    .insert(chatConversas)
    .values({ conversa: chave, usuarioId, ultimaEm: em, lidaAte: ate, lidaEm: em })
    .onConflictDoUpdate({
      target: [chatConversas.conversa, chatConversas.usuarioId],
      set: { lidaAte: ate, lidaEm: sql`max(coalesce(${chatConversas.lidaEm}, 0), excluded.lida_em)` },
    });
}

/** A pessoa participa da conversa (a em grupo escolhida: só quem está nela abre o histórico). */
export function consultaParticipa(db: Db, chave: string, usuarioId: number) {
  return db
    .select({ n: sql<number>`1` })
    .from(chatConversas)
    .where(and(eq(chatConversas.conversa, chave), eq(chatConversas.usuarioId, usuarioId)))
    .limit(1);
}

const naoLidasSql = (chave: unknown, usuarioId: number, lidaEm: unknown) =>
  sql<number>`(SELECT count(*) FROM ${chatMensagens} m WHERE m.conversa = ${chave} AND m.de <> ${usuarioId} AND m.em > coalesce(${lidaEm}, 0))`;

/** As conversas da pessoa (privadas e em grupo) desde `desde`: a mais recente primeiro, com a última mensagem e as NÃO
 * LIDAS. */
export function consultaConversasChat(db: Db, usuarioId: number, desde: number, limite = 30) {
  const ultima = (col: "texto" | "de" | "em") =>
    sql.raw(`(SELECT m.${col} FROM chat_mensagens m WHERE m.conversa = chat_conversas.conversa ORDER BY m.em DESC LIMIT 1)`);
  return db
    .select({
      conversa: chatConversas.conversa,
      nome: chatConversas.nome,
      membros: chatConversas.membros,
      ultimaEm: chatConversas.ultimaEm,
      texto: sql<string | null>`${ultima("texto")}`,
      de: sql<number | null>`${ultima("de")}`,
      em: sql<number | null>`${ultima("em")}`,
      naoLidas: naoLidasSql(chatConversas.conversa, usuarioId, chatConversas.lidaEm),
    })
    .from(chatConversas)
    .where(and(eq(chatConversas.usuarioId, usuarioId), gte(chatConversas.ultimaEm, desde), ne(sql`substr(${chatConversas.conversa}, 1, 1)`, "g")))
    .orderBy(desc(chatConversas.ultimaEm))
    .limit(limite);
}

/** O chat do GRUPO para a pessoa: a última mensagem e as não lidas (o "lida" dela pela chave do grupo). */
export function consultaResumoGrupo(db: Db, chave: string, usuarioId: number, desde: number) {
  const lidaEm = sql`(SELECT c.lida_em FROM chat_conversas c WHERE c.conversa = ${chave} AND c.usuario_id = ${usuarioId})`;
  return db
    .select({
      texto: chatMensagens.texto,
      de: chatMensagens.de,
      em: chatMensagens.em,
      naoLidas: sql<number>`(SELECT count(*) FROM chat_mensagens m WHERE m.conversa = ${chave} AND m.de <> ${usuarioId} AND m.em >= ${desde} AND m.em > coalesce(${lidaEm}, 0))`,
    })
    .from(chatMensagens)
    .where(and(eq(chatMensagens.conversa, chave), gte(chatMensagens.em, desde)))
    .orderBy(desc(chatMensagens.em))
    .limit(1);
}

/** O HISTÓRICO de uma conversa desde `desde` (as mais recentes, até `limite` — a tela mostra na ordem). */
export function consultaHistoricoChat(db: Db, chave: string, desde: number, limite: number) {
  return db
    .select({ id: chatMensagens.id, de: chatMensagens.de, texto: chatMensagens.texto, resp: chatMensagens.resp, em: chatMensagens.em })
    .from(chatMensagens)
    .where(and(eq(chatMensagens.conversa, chave), gte(chatMensagens.em, desde)))
    .orderBy(desc(chatMensagens.em))
    .limit(limite);
}

/** Até onde cada participante LEU (o ✓✓ / "lida por N"). */
export function consultaLidasChat(db: Db, chave: string) {
  return db
    .select({ usuarioId: chatConversas.usuarioId, lidaAte: chatConversas.lidaAte })
    .from(chatConversas)
    .where(and(eq(chatConversas.conversa, chave), sql`${chatConversas.lidaAte} IS NOT NULL`));
}

/** A LIMPEZA (cron): apaga as mensagens e as conversas paradas há mais que a validade. */
export function comandosLimparChat(db: Db, antesDe: number) {
  return [db.delete(chatMensagens).where(lt(chatMensagens.em, antesDe)), db.delete(chatConversas).where(lt(chatConversas.ultimaEm, antesDe))];
}
