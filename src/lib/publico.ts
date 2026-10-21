import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";
import { type ConfigPublico, lerConfigPublico, PUBLICO_PADRAO } from "./publico-core";

// As abas PÚBLICAS no banco (blob `configuracoes` id=1, chave `publico` — cache 60 s; falha = o padrão: só o Dashboard).
let cache: { at: number; dados: ConfigPublico } | null = null;
const TTL = 60_000;

export async function getConfigPublico(opcoes: { fresco?: boolean } = {}): Promise<ConfigPublico> {
  if (!opcoes.fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const dados = lerConfigPublico((await lerBlobConfiguracoes()).publico);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? PUBLICO_PADRAO;
  }
}

export async function gravarConfigPublico(cfg: ConfigPublico, usuarioId: number): Promise<ConfigPublico> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigPublico(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, publico: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return valor;
}
