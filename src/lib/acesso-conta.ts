import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import { type ConfigAcessoConta, lerConfigAcessoConta } from "./acesso-conta-core";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";

// TERMO DE USO + APARELHOS — a configuração do ADM: blob `configuracoes` id=1, chave `acessoConta`. Cache por isolate de
// 60 s; falhou = o último valor lido, senão o padrão (DESLIGADO — a leitura nunca prende ninguém fora do sistema).
let cache: { at: number; dados: ConfigAcessoConta } | null = null;
const TTL = 60_000;

export async function getAcessoConta(opcoes: { fresco?: boolean } = {}): Promise<ConfigAcessoConta> {
  if (!opcoes.fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const dados = lerConfigAcessoConta((await lerBlobConfiguracoes()).acessoConta);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? lerConfigAcessoConta(undefined);
  }
}

export async function gravarAcessoConta(cfg: ConfigAcessoConta, usuarioId: number): Promise<ConfigAcessoConta> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigAcessoConta(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, acessoConta: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return valor;
}
