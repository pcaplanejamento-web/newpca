/**
 * DADOS PESSOAIS — núcleo PURO (testado) da máscara de dados pessoais: a consulta PÚBLICA do PCA e os papéis que
 * mascaram os dados pessoais usam a MESMA régua.
 */

/**
 * MÁSCARA de dados pessoais em TEXTO LIVRE (seções do DFD, capa, diff do histórico): CPF/CNPJ, e-mail, telefone e o
 * número após "matrícula" viram "•••". O resto do texto fica intacto.
 */
const MASCARAS: [RegExp, string | ((m: string, ...g: string[]) => string)][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "•••"],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "•••"], // CNPJ
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{3}\.?\*{3}\.?\*{3}-?\d{2}\b|\*{3}\.\d{3}\.\d{3}-\*{2}/g, "•••"], // CPF (e mascarado)
  [/(\bcpf\b\W{0,4})\d{11}\b/gi, (_m, r) => `${r}•••`],
  [/\(?\b\d{2}\)?\s?9?\d{4}-\d{4}\b/g, "•••"], // telefone
  [/(matr[ií]cula\W{0,6}(?:n[ºo°.]?\s*)?)[\d.\-/]+/gi, (_m, r) => `${r}•••`],
];

export function mascararTexto<T extends string | null | undefined>(t: T): T {
  if (!t) return t;
  let s: string = t;
  for (const [re, sub] of MASCARAS) s = s.replace(re, sub as string);
  return s as T;
}

/** Rótulos/chaves de dado PESSOAL (nunca vão a quem não os vê — no histórico, pela chave ou pelo rótulo). */
export const SENSIVEL = /cpf|cnpj|e-?mail|telefone|matr[ií]cula|documento|assinatura|usu[aá]rio/i;
