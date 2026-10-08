import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";
import { type ConfigProtecao, lerConfigProtecao } from "./protecao-core";

// A PROTEÇÃO DE DADOS no banco: blob `configuracoes` id=1, chave `protecao` — cache por isolate de 60 s; falhou = o último
// valor lido, senão desligada (a leitura nunca derruba uma tela).
let cache: { at: number; dados: ConfigProtecao } | null = null;
const TTL = 60_000;

export async function getConfigProtecao(opcoes: { fresco?: boolean } = {}): Promise<ConfigProtecao> {
  if (!opcoes.fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const dados = lerConfigProtecao((await lerBlobConfiguracoes()).protecao);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? lerConfigProtecao(undefined);
  }
}

/** Grava a config (as chaves irmãs do blob ficam) e invalida o cache. */
export async function gravarConfigProtecao(cfg: ConfigProtecao, usuarioId: number): Promise<ConfigProtecao> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigProtecao(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, protecao: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return valor;
}
