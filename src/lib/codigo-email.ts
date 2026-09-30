import { and, eq, sql } from "drizzle-orm";
import { codigosEmail } from "@/db/schema";
import {
  conferirCodigoRegistro,
  esperaReenvio,
  type FinalidadeCodigo,
  gerarCodigo,
  hashCodigo,
  type ResultadoCodigo,
  VALIDADE_CODIGO_MIN,
} from "./codigo-email-core";
import { getDb } from "./db";

/**
 * Os CÓDIGOS de confirmação no D1 (escopo de request). UM por e-mail + finalidade: emitir substitui o anterior (e zera as
 * tentativas); conferir conta a tentativa errada e CONSOME o código certo (não vale duas vezes).
 */

const onde = (email: string, finalidade: FinalidadeCodigo) => and(eq(codigosEmail.email, email), eq(codigosEmail.finalidade, finalidade));

/** Emite um código novo — ou diz quantos segundos faltam para poder reenviar. */
export async function emitirCodigo(email: string, finalidade: FinalidadeCodigo): Promise<{ codigo: string } | { esperarS: number }> {
  const db = getDb();
  const agora = Date.now();
  const [atual] = await db.select({ enviadoEm: codigosEmail.enviadoEm }).from(codigosEmail).where(onde(email, finalidade)).limit(1);
  const esperar = atual ? esperaReenvio(atual.enviadoEm, agora) : 0;
  if (esperar > 0) return { esperarS: esperar };
  const codigo = gerarCodigo();
  const valores = {
    codigoHash: await hashCodigo(email, finalidade, codigo),
    tentativas: 0,
    expiraEm: new Date(agora + VALIDADE_CODIGO_MIN * 60_000).toISOString(),
    enviadoEm: new Date(agora).toISOString(),
  };
  await db
    .insert(codigosEmail)
    .values({ email, finalidade, ...valores })
    .onConflictDoUpdate({ target: [codigosEmail.email, codigosEmail.finalidade], set: valores });
  return { codigo };
}

/** O envio do e-mail FALHOU: descarta o código (a pessoa pode pedir de novo na hora). */
export async function descartarCodigo(email: string, finalidade: FinalidadeCodigo): Promise<void> {
  await getDb().delete(codigosEmail).where(onde(email, finalidade));
}

/** Confere o código: errado = conta a tentativa; certo = CONSOME (apaga) e devolve "ok". */
export async function consumirCodigo(email: string, finalidade: FinalidadeCodigo, codigo: string): Promise<ResultadoCodigo> {
  const db = getDb();
  const [reg] = await db
    .select({ codigoHash: codigosEmail.codigoHash, tentativas: codigosEmail.tentativas, expiraEm: codigosEmail.expiraEm })
    .from(codigosEmail)
    .where(onde(email, finalidade))
    .limit(1);
  const r = await conferirCodigoRegistro(reg, email, finalidade, codigo, Date.now());
  if (r === "incorreto") await db.update(codigosEmail).set({ tentativas: sql`${codigosEmail.tentativas} + 1` }).where(onde(email, finalidade));
  // Consome só se ainda for o MESMO código (dois envios simultâneos do mesmo código não passam os dois).
  if (r === "ok") {
    const apagados = await db
      .delete(codigosEmail)
      .where(and(onde(email, finalidade), eq(codigosEmail.codigoHash, reg?.codigoHash ?? "")))
      .returning({ id: codigosEmail.id });
    if (!apagados.length) return "inexistente";
  }
  return r;
}
