import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";
import { type ConfigResolvida, compactarNotificacoes, lerRetencao, type Retencao, resolverNotificacoes } from "./notificacoes-config-core";

// A CONFIGURAÇÃO das notificações do ADM (blob `configuracoes` id=1, chave `notificacoes`) — cache por isolate de 60 s,
// fail-safe (falhou = os padrões do catálogo: o e-mail mínimo).
let cache: { at: number; dados: ConfigResolvida } | null = null;
const TTL = 60_000;

export async function getConfigNotificacoes(opcoes: { fresco?: boolean } = {}): Promise<ConfigResolvida> {
  if (!opcoes.fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const [row] = await getDb().select({ dados: configuracoes.dados }).from(configuracoes).where(eq(configuracoes.id, 1)).limit(1);
    let blob: Record<string, unknown> = {};
    try {
      blob = row?.dados ? (JSON.parse(row.dados) as Record<string, unknown>) : {};
    } catch {
      /* JSON inválido = padrões */
    }
    const dados = resolverNotificacoes(blob.notificacoes);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? resolverNotificacoes(undefined);
  }
}

/** Grava a config (só o que difere do padrão; as chaves irmãs do blob ficam) e invalida o cache. */
export async function gravarConfigNotificacoes(cfg: ConfigResolvida, usuarioId: number): Promise<ConfigResolvida> {
  const blob = await lerBlobConfiguracoes();
  const compacta = compactarNotificacoes(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, notificacoes: compacta }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return resolverNotificacoes(compacta);
}

/** A RETENÇÃO (quanto tempo os avisos ficam e se o sistema limpa sozinho) — lida fresca (o cron e a tela do ADM). */
export async function getRetencao(): Promise<Retencao> {
  try {
    return lerRetencao((await lerBlobConfiguracoes()).notificacoesRetencao);
  } catch {
    return lerRetencao(undefined);
  }
}

export async function gravarRetencao(r: Retencao, usuarioId: number): Promise<Retencao> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerRetencao(r);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, notificacoesRetencao: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  return valor;
}
