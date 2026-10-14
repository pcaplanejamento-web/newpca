import { eq, sql } from "drizzle-orm";
import { cache as porRequisicao } from "react";
import { configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";
import { lerModulos, MODULOS_PADRAO, type Modulo } from "./modulos-core";

// Os MÓDULOS do ADM no banco: blob `configuracoes` id=1, chave `modulos` (sem migração) — cache por isolate de 60 s e por
// requisição; falha = o último lido (senão o padrão — a navegação de antes).
let cache: { at: number; dados: Modulo[] } | null = null;
const TTL = 60_000;

async function ler(fresco: boolean): Promise<Modulo[]> {
  if (!fresco && cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const dados = lerModulos((await lerBlobConfiguracoes()).modulos);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? MODULOS_PADRAO;
  }
}

/** Os módulos (memorizado por requisição: o acesso, o layout e a página leem o mesmo). */
export const getModulos = porRequisicao(() => ler(false));
export const getModulosFresco = () => ler(true);

/** Grava os módulos (as chaves irmãs do blob ficam) e invalida o cache. */
export async function gravarModulos(lista: Modulo[], usuarioId: number): Promise<Modulo[]> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerModulos(lista);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, modulos: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cache = null;
  return valor;
}
