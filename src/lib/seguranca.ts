import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";
import { type ConfigSeguranca, lerConfigSeguranca } from "./seguranca-core";

// A SEGURANÇA DO ACESSO no banco: blob `configuracoes` id=1, chave `seguranca` — cache por isolate de 60 s; falhou = o
// último valor lido, senão o padrão (a leitura nunca derruba uma tela nem o login).
let cache: { at: number; dados: ConfigSeguranca } | null = null;
const TTL = 60_000;

export async function getConfigSeguranca(opcoes: { fresco?: boolean } = {}): Promise<ConfigSeguranca> {
  if (!opcoes.fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const dados = lerConfigSeguranca((await lerBlobConfiguracoes()).seguranca);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? lerConfigSeguranca(undefined);
  }
}

/** Grava a config (as chaves irmãs do blob ficam) e invalida o cache. */
export async function gravarConfigSeguranca(cfg: ConfigSeguranca, usuarioId: number): Promise<ConfigSeguranca> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigSeguranca(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, seguranca: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return valor;
}
