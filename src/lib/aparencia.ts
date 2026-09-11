import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { configuracoes } from "@/db/schema";
import { type Aparencia, parseAparencia } from "./theme";

// Leitura da aparência do ADM com cache por-isolate (evita ler o D1 em todo
// request). Fail-safe: qualquer erro → usa cache/vazio (os defaults de
// globals.css valem). O PATCH invalida o cache.
let cache: { at: number; dados: Aparencia } | null = null;
const TTL = 60_000;

export async function getAparencia(): Promise<Aparencia> {
  if (cache && Date.now() - cache.at < TTL) return cache.dados;
  try {
    const [row] = await getDb()
      .select({ dados: configuracoes.dados })
      .from(configuracoes)
      .where(eq(configuracoes.id, 1))
      .limit(1);
    const dados = parseAparencia(row?.dados);
    cache = { at: Date.now(), dados };
    return dados;
  } catch {
    return cache?.dados ?? {};
  }
}

export function invalidarAparencia() {
  cache = null;
}
