/**
 * COLUNAS DA MESA criadas pelas automações — núcleo PURO (testado em `tests/mesa-colunas.test.ts`). Uma coluna é de UMA
 * entidade (protocolo, DFD ou item) e tem um valor (texto) por registro. O nome é único por entidade, sem caixa/acento.
 */
export const ENTIDADES_COLUNA = ["protocolo", "dfd", "item"] as const;
export type EntidadeColuna = (typeof ENTIDADES_COLUNA)[number];
export const ROTULO_ENTIDADE_COLUNA: Record<EntidadeColuna, string> = { protocolo: "Protocolos", dfd: "DFDs", item: "Itens" };
export const MAX_NOME_COLUNA = 60;
export const MAX_VALOR_COLUNA = 500;
export const MAX_COLUNAS_POR_ENTIDADE = 30;

/** O nome comparável (sem caixa/acento/espaços repetidos). */
export const chaveColuna = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
/** O nome exibido (limpo, ≤ 60). */
export const nomeColuna = (nome: string) => nome.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NOME_COLUNA);

export type ColunaMesa = { id: number; entidade: EntidadeColuna; nome: string };
/** As colunas + os valores (`valores[colunaId][alvoId]`) que a Mesa recebe. */
export type ColunasMesa = { colunas: ColunaMesa[]; valores: Record<number, Record<number, string>> };
export const COLUNAS_MESA_VAZIAS: ColunasMesa = { colunas: [], valores: {} };

/** O valor a gravar: texto limpo ≤ 500; vazio = `null` (apaga). Objeto/lista viram JSON. */
export function valorParaColuna(v: unknown): string | null {
  if (v == null) return null;
  const t = (typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, MAX_VALOR_COLUNA) : null;
}

/** As colunas de uma entidade (na ordem de criação). */
export const colunasDe = (c: ColunasMesa | undefined, e: EntidadeColuna) => (c?.colunas ?? []).filter((x) => x.entidade === e);
