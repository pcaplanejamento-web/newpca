/**
 * Núcleo PURO do CÓDIGO DE CONFIRMAÇÃO por e-mail (sem getDb → testável): 6 dígitos, validade curta, espera
 * cronometrada para reenviar e poucas tentativas. O banco guarda só o HASH (e-mail + finalidade + código).
 */

import { iguaisEmTempoConstante, sha256Hex } from "./password.ts";

export const FINALIDADES_CODIGO = ["cadastro", "senha"] as const;
export type FinalidadeCodigo = (typeof FINALIDADES_CODIGO)[number];

/** Validade do código (minutos). */
export const VALIDADE_CODIGO_MIN = 10;
/** Espera para REENVIAR outro código (segundos) — o cronômetro da tela. */
export const REENVIO_CODIGO_S = 60;
/** Tentativas erradas antes de o código deixar de valer (pede um novo). */
export const MAX_TENTATIVAS_CODIGO = 5;

/** Um código de 6 dígitos UNIFORME (sorteio com rejeição — sem viés do módulo). */
export function gerarCodigo(aleatorio: (n: Uint32Array) => Uint32Array = (n) => crypto.getRandomValues(n)): string {
  const LIMITE = 4_294_000_000; // múltiplo de 1.000.000 abaixo de 2^32
  const b = new Uint32Array(1);
  for (;;) {
    const v = aleatorio(b)[0];
    if (v < LIMITE) return String(v % 1_000_000).padStart(6, "0");
  }
}

/** O hash guardado: amarrado ao e-mail e à finalidade (o código de um não vale no outro). */
export function hashCodigo(email: string, finalidade: FinalidadeCodigo, codigo: string): Promise<string> {
  return sha256Hex(`${finalidade}:${email.trim().toLowerCase()}:${codigo}`);
}

/** Segundos que ainda faltam para poder reenviar (0 = já pode). */
export function esperaReenvio(enviadoEm: string, agora: number): number {
  const t = Date.parse(enviadoEm);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t + REENVIO_CODIGO_S * 1000 - agora) / 1000));
}

export type ResultadoCodigo = "ok" | "inexistente" | "expirado" | "bloqueado" | "incorreto";

/** Confere o código digitado contra o registro (sem efeitos — quem chama conta a tentativa ou consome o código). */
export async function conferirCodigoRegistro(
  reg: { codigoHash: string; tentativas: number; expiraEm: string } | null | undefined,
  email: string,
  finalidade: FinalidadeCodigo,
  codigo: string,
  agora: number,
): Promise<ResultadoCodigo> {
  if (!reg) return "inexistente";
  if (reg.tentativas >= MAX_TENTATIVAS_CODIGO) return "bloqueado";
  if (!(Date.parse(reg.expiraEm) > agora)) return "expirado";
  return iguaisEmTempoConstante(await hashCodigo(email, finalidade, codigo), reg.codigoHash) ? "ok" : "incorreto";
}

/** A mensagem da tela para cada falha. */
export const MENSAGEM_CODIGO: Record<Exclude<ResultadoCodigo, "ok">, string> = {
  inexistente: "Código incorreto ou expirado. Peça um novo código.",
  expirado: "O código expirou. Peça um novo código.",
  bloqueado: "Muitas tentativas erradas. Peça um novo código.",
  incorreto: "Código incorreto. Confira os 6 dígitos no seu e-mail.",
};
