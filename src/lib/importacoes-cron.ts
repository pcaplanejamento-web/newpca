import { getDb } from "./db";
import { type SituacaoCron, comandosRegistrarCron } from "./importacoes-cron-sql";
import { importacoesCron } from "@/db/schema";

/** Grava o que a execução automática fez (BEST-EFFORT — nunca derruba o cron). */
export async function registrarCron(itens: readonly SituacaoCron[], agora = new Date()): Promise<void> {
  if (!itens.length) return;
  const db = getDb();
  await db.batch(comandosRegistrarCron(db, itens, agora.toISOString()) as never).catch((e) => console.error("[importacoes-cron] registrar", e));
}

/** As situações gravadas (a tela da Atualização automática). */
export const situacoesCron = () => getDb().select().from(importacoesCron);
