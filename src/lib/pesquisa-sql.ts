import { and, type Column, like, or, type SQL } from "drizzle-orm";
import { ehTermoNumero } from "./pesquisa-core";

/**
 * Cada padrão (um por termo — `padroesLike`) tem de casar em ALGUMA das colunas. Com `numeros`, o termo que é um número
 * casa SÓ nessas colunas (nº, Id, planejamento, código) — "65" não traz o protocolo com 65 no nome do interessado.
 */
export function casaTermos(colunas: Column[], padroes: string[], numeros?: Column[]): SQL | undefined {
  return and(...padroes.map((p) => or(...(numeros && ehTermoNumero(p) ? numeros : colunas).map((c) => like(c, p)))));
}
