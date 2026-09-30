// ESCOPO POR UNIDADE — núcleo puro (sem banco): o que a lista de unidades de uma pessoa significa para os dados.

/** O código da unidade VIRTUAL "Geral" — concedida a um grupo, vale TODAS as unidades. Reservado: nenhuma unidade real
 * (nem a sigla de um órgão, que vira código ao rebaixá-lo ou ao ligar "também unidade") pode usá-lo. */
export const CODIGO_GERAL = "GERAL";

/** O código é o da "Geral" (sem caixa nem espaços nas pontas). */
export function ehCodigoGeral(codigo: string | null | undefined): boolean {
  return (codigo ?? "").trim().toUpperCase() === CODIGO_GERAL;
}
