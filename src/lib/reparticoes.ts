import { eq, inArray } from "drizzle-orm";
import { reparticoes } from "@/db/schema";
import { getDb } from "./db";
import { parseResponsaveis, RESPONSAVEIS_VAZIO, type Responsaveis } from "./reparticao-responsaveis";

/**
 * Acesso aos RESPONSÁVEIS por DFDs das repartições (coluna `responsavel_dfd`, JSON).
 * Separado de `grupos.ts` (que só devolve `{id,codigo,nome}`) — usado para conferir
 * a assinatura no servidor (gravação) e para enriquecer os banners no cliente.
 * Só escopo de request (usa `getDb`).
 */

/** Responsáveis de UMA repartição (para conferir a assinatura no servidor); vazio se não houver. */
export async function carregarResponsaveis(reparticaoId: number | null | undefined): Promise<Responsaveis> {
  if (reparticaoId == null) return RESPONSAVEIS_VAZIO;
  const [r] = await getDb()
    .select({ responsavelDfd: reparticoes.responsavelDfd })
    .from(reparticoes)
    .where(eq(reparticoes.id, reparticaoId))
    .limit(1);
  return parseResponsaveis(r?.responsavelDfd ?? null);
}

/** Mapa `reparticaoId → Responsaveis` (enriquece a lista de repartições dos banners). */
export async function responsaveisPorReparticao(ids: number[]): Promise<Record<number, Responsaveis>> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n));
  if (uniq.length === 0) return {};
  const linhas = await getDb()
    .select({ id: reparticoes.id, responsavelDfd: reparticoes.responsavelDfd })
    .from(reparticoes)
    .where(inArray(reparticoes.id, uniq));
  const out: Record<number, Responsaveis> = {};
  for (const l of linhas) out[l.id] = parseResponsaveis(l.responsavelDfd);
  return out;
}
