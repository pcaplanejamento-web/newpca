import { and, eq, sql } from "drizzle-orm";
import { configuracoes, preferenciasTabela } from "@/db/schema";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";
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
