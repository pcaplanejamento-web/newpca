// INDÍCIO DE JANELA ANÔNIMA no aparelho nomeado — puro (testado em tests/aparelho-anonimo.test.ts).
// Os navegadores escondem o modo anônimo de propósito: é um INDÍCIO, nunca certeza, e só o ADM o vê.

export type IndicioAnonimo = "provavel" | "nao" | "desconhecido";

/** Abaixo disso de cota de armazenamento, o Chrome/Edge está quase sempre numa janela anônima (a comum dá dezenas de GB). */
export const COTA_ANONIMA = 2 * 1024 ** 3;

/** O indício pela cota do `navigator.storage.estimate()` e o navegador (só Chromium tem o sinal confiável). */
export function indicioPelaCota(quota: number | null | undefined, userAgent: string): IndicioAnonimo {
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(userAgent) && !/OPR\/|SamsungBrowser/.test(userAgent);
  if (!chromium || typeof quota !== "number" || !Number.isFinite(quota) || quota <= 0) return "desconhecido";
  return quota < COTA_ANONIMA ? "provavel" : "nao";
}

export const lerIndicio = (v: unknown): IndicioAnonimo | null => (v === "provavel" || v === "nao" || v === "desconhecido" ? v : null);

type Ap = { id: number; navegador: string; criadoEm: string; vistoEm: string | null };

/**
 * TEMPORÁRIO: o aparelho nunca voltou a ser usado depois do dia em que foi nomeado (último uso ≤ 12 h após o vínculo) e
 * um aparelho do MESMO navegador foi nomeado depois — o cookie sumiu, como ao fechar uma janela anônima.
 */
export function aparelhoTemporario(a: Ap, lista: Ap[]): boolean {
  const ini = Date.parse(a.criadoEm);
  const fim = Date.parse(a.vistoEm ?? a.criadoEm);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim - ini > 12 * 3_600_000) return false;
  return lista.some((b) => b.id !== a.id && b.navegador === a.navegador && Date.parse(b.criadoEm) > fim);
}
