import { and, eq, inArray, sql } from "drizzle-orm";
import { configuracoes, preferenciasTabela, usuarios } from "@/db/schema";
import { getDb } from "./db";
import { lotesDeIds } from "./reparticoes";
import { lerBlobConfiguracoes } from "./integracoes";
import { type ConfigChat, lerConfigChat } from "./chat-core";
import { CHAVE_PREF_PRESENCA, type ConfigPresenca, lerConfigPresenca, lerPrefsPresenca, type PrefsPresenca } from "./presenca-core";

// A PRESENÇA AO VIVO no banco: a config do ADM (blob `configuracoes` id=1, chave `presenca` — cache por isolate de 60 s,
// fail-safe = desligada) e a preferência de invisível da pessoa (`preferencias_tabela`).
let cache: { at: number; dados: ConfigPresenca } | null = null;
const TTL = 60_000;

export async function getConfigPresenca(opcoes: { fresco?: boolean } = {}): Promise<ConfigPresenca> {
  if (!opcoes.fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const dados = lerConfigPresenca((await lerBlobConfiguracoes()).presenca);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? lerConfigPresenca(undefined);
  }
}

/** Grava a config (as chaves irmãs do blob ficam) e invalida o cache. */
export async function gravarConfigPresenca(cfg: ConfigPresenca, usuarioId: number): Promise<ConfigPresenca> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigPresenca(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, presenca: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return valor;
}

/** A preferência da pessoa (aparecer invisível). Falhou = visível. */
export async function prefsPresencaDe(usuarioId: number): Promise<PrefsPresenca> {
  try {
    const [r] = await getDb()
      .select({ valor: preferenciasTabela.valor })
      .from(preferenciasTabela)
      .where(and(eq(preferenciasTabela.usuarioId, usuarioId), eq(preferenciasTabela.chave, CHAVE_PREF_PRESENCA)))
      .limit(1);
    return lerPrefsPresenca(r?.valor ?? null);
  } catch {
    return lerPrefsPresenca(null);
  }
}

/** O WhatsApp de quem MARCOU o contato institucional como WhatsApp (id → só dígitos) — a ação "WhatsApp" da presença. */
export async function whatsappDe(ids: number[]): Promise<Record<number, string>> {
  if (ids.length === 0) return {};
  try {
    const db = getDb();
    const lotes = await Promise.all(
      lotesDeIds(ids).map((l) =>
        db
          .select({ id: usuarios.id, telefone: usuarios.telefone })
          .from(usuarios)
          .where(and(inArray(usuarios.id, l), eq(usuarios.telefoneWhatsapp, true))),
      ),
    );
    return Object.fromEntries(lotes.flat().filter((r) => r.telefone).map((r) => [r.id, r.telefone as string]));
  } catch {
    return {};
  }
}

/** A config do CHAT ao vivo (blob `configuracoes`, chave `chat`) — cache 60 s, fail-safe = desligado. */
let cacheChat: { at: number; dados: ConfigChat } | null = null;
export async function getConfigChat(opcoes: { fresco?: boolean } = {}): Promise<ConfigChat> {
  if (!opcoes.fresco && cacheChat && Date.now() - cacheChat.at < TTL) return cacheChat.dados;
  try {
    const dados = lerConfigChat((await lerBlobConfiguracoes()).chat);
    cacheChat = { at: Date.now(), dados };
    return dados;
  } catch {
    return cacheChat?.dados ?? lerConfigChat(undefined);
  }
}

export async function gravarConfigChat(cfg: ConfigChat, usuarioId: number): Promise<ConfigChat> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigChat(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, chat: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cacheChat = null;
  return valor;
}

/** As duas pessoas compartilham ALGUM grupo e o destinatário está ATIVO (o chat privado só entre elas). */
export async function compartilhamGrupo(a: number, b: number): Promise<boolean> {
  const [r] = await getDb().all<{ ok: number }>(
    sql`SELECT 1 AS ok FROM usuario_grupos x JOIN usuario_grupos y ON y.grupo_id = x.grupo_id JOIN usuarios u ON u.id = y.usuario_id AND u.status = 'ativo' WHERE x.usuario_id = ${a} AND y.usuario_id = ${b} LIMIT 1`,
  );
  return !!r;
}
