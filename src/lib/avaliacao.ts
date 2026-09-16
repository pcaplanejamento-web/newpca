import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { configuracoes } from "@/db/schema";
import { coerceRegras, type RegrasAvaliacao } from "./avaliacao-core.ts";

// Leitura das regras de avaliação do ADM com cache por-isolate (evita ler o D1 em
// todo request), fail-safe (erro → cache/padrão). Compartilha a linha única
// `configuracoes` id=1 com a aparência, sob a chave `avaliacao` do blob `dados`.
// O PATCH da rota invalida o cache. Espelha `src/lib/aparencia.ts`.
let cache: { at: number; dados: RegrasAvaliacao } | null = null;
const TTL = 60_000;

/** Extrai `dados.avaliacao` do blob de `configuracoes`, tolerante a JSON inválido. */
export function parseRegrasAvaliacao(dados: string | null | undefined): RegrasAvaliacao {
  try {
    const obj = dados ? (JSON.parse(dados) as Record<string, unknown>) : {};
    return coerceRegras(obj?.avaliacao);
  } catch {
    return coerceRegras(undefined);
  }
}

export async function getRegrasAvaliacao(): Promise<RegrasAvaliacao> {
  if (cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const [row] = await getDb()
      .select({ dados: configuracoes.dados })
      .from(configuracoes)
      .where(eq(configuracoes.id, 1))
      .limit(1);
    const dados = parseRegrasAvaliacao(row?.dados);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? coerceRegras(undefined);
  }
}

export function invalidarAvaliacao() {
  cache = null;
}
