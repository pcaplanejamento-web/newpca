import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { configuracoes } from "@/db/schema";
import { coerceIntegracoes, type Integracoes } from "./integracoes-core.ts";

// Leitura da config de integrações com cache por-isolate (60s, fail-safe). Compartilha
// a linha única `configuracoes` id=1 sob a chave `integracoes`. Espelha `avaliacao.ts`.
let cache: { at: number; dados: Integracoes } | null = null;
const TTL = 60_000;

/** Extrai `dados.integracoes` do blob de `configuracoes`, tolerante a JSON inválido. */
export function parseIntegracoes(dados: string | null | undefined): Integracoes {
  try {
    const obj = dados ? (JSON.parse(dados) as Record<string, unknown>) : {};
    return coerceIntegracoes(obj?.integracoes);
  } catch {
    return coerceIntegracoes(undefined);
  }
}

export async function getIntegracoes(): Promise<Integracoes> {
  if (cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const [row] = await getDb()
      .select({ dados: configuracoes.dados })
      .from(configuracoes)
      .where(eq(configuracoes.id, 1))
      .limit(1);
    const dados = parseIntegracoes(row?.dados);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? coerceIntegracoes(undefined);
  }
}

export function invalidarIntegracoes() {
  cache = null;
}
