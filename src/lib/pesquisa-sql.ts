import { and, type Column, like, or, type SQL } from "drizzle-orm";

/** Cada padrão (um por termo — `padroesLike`) tem de casar em ALGUMA das colunas. */
export function casaTermos(colunas: Column[], padroes: string[]): SQL | undefined {
  return and(...padroes.map((p) => or(...colunas.map((c) => like(c, p)))));
}
