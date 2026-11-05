import { getDb } from "./db";
import { eq } from "drizzle-orm";
import { CHAVE_BANCO_OCUPADO, type SituacaoCron, bancoOcupado, comandoBancoOcupado, comandosRegistrarCron } from "./importacoes-cron-sql";
import { consultaMontagemEmCurso } from "./execucao-sql";
import { importacoesCron } from "@/db/schema";

/** Grava o que a execução automática fez (BEST-EFFORT — nunca derruba o cron). */
export async function registrarCron(itens: readonly SituacaoCron[], agora = new Date()): Promise<void> {
  if (!itens.length) return;
  const db = getDb();
  await db.batch(comandosRegistrarCron(db, itens, agora.toISOString()) as never).catch((e) => console.error("[importacoes-cron] registrar", e));
}

/** As situações gravadas (a tela da Atualização automática). */
export const situacoesCron = () => getDb().select().from(importacoesCron);

/** Um sinal por minuto por isolate basta (a sobrecarga se repete em rajada — nada de escrever a cada pedido). */
let ultimoSinal = 0;

/** As TELAS viram o banco sobrecarregado: a importação automática cede a vez (BEST-EFFORT). */
export async function sinalizarBancoOcupado(agora = new Date()): Promise<void> {
  if (agora.getTime() - ultimoSinal < 60_000) return;
  ultimoSinal = agora.getTime();
  const db = getDb();
  await db.batch([comandoBancoOcupado(db, agora.toISOString())]).catch((e) => console.error("[importacoes-cron] sinal do banco", e));
}

/**
 * A importação automática deve CEDER a vez agora? Quando as telas viram o banco sobrecarregado há pouco ou quando a
 * Execução está montando o pacote — o texto da situação, ou `null` (segue). Falha ao ler = segue (nunca para por isso).
 */
export async function motivoParaCeder(agora = new Date()): Promise<string | null> {
  const db = getDb();
  try {
    const [sinal, montando] = await Promise.all([
      db.select({ em: importacoesCron.em }).from(importacoesCron).where(eq(importacoesCron.chave, CHAVE_BANCO_OCUPADO)).limit(1),
      consultaMontagemEmCurso(db, agora.toISOString()),
    ]);
    if (bancoOcupado(sinal[0]?.em, agora.getTime())) return "Pausada — banco ocupado pelas telas";
    if (montando.length) return "Pausada — a Execução está sendo atualizada";
  } catch (e) {
    console.error("[importacoes-cron] ceder", e);
  }
  return null;
}
