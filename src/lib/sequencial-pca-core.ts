/**
 * O SEQUENCIAL SAGRADO do PCA (puro — `tests/sequencial-pca.test.ts`): um nº por item, nunca repetido no PCA (planilha e
 * protocolos no MESMO espaço — o banco garante pelos gatilhos da migração `0117`).
 *
 * - Linha COM sequencial: o nº fica; o item da planilha que já o tinha é SOBRESCRITO (sai antes de entrar o novo).
 * - Linha SEM sequencial: segue a sequência — o próximo nº depois do maior do PCA (e do maior deste lote), na ordem.
 * - O mesmo nº duas vezes no arquivo nunca entra (`repetidos`).
 */

/** Os nºs que aparecem mais de uma vez (em ordem crescente). */
export function repetidos(seqs: readonly (number | null)[]): number[] {
  const vistos = new Set<number>();
  const rep = new Set<number>();
  for (const s of seqs) {
    if (s == null) continue;
    if (vistos.has(s)) rep.add(s);
    vistos.add(s);
  }
  return [...rep].sort((a, b) => a - b);
}

/** Dá o nº de cada linha: o dela, ou o próximo da sequência (depois de `maximo` e do maior nº informado no lote). */
export function atribuirSequenciais(seqs: readonly (number | null)[], maximo: number): number[] {
  let proximo = Math.max(maximo, ...seqs.map((s) => s ?? 0));
  return seqs.map((s) => s ?? ++proximo);
}

/** Texto curto de uma lista de nºs ("1, 2, 3 e mais 4"). */
export function textoNumeros(ns: readonly number[], max = 8): string {
  return ns.length <= max ? ns.join(", ") : `${ns.slice(0, max).join(", ")} e mais ${ns.length - max}`;
}
