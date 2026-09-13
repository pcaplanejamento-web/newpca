import { stripAccents } from "./normalize.ts";

/**
 * Auto-match do Setor Requisitante de um DFD com uma repartição. Lógica PURA
 * (sem getDb/JSX) → testável no Node e reaproveitada pelo import de DFD (um a um)
 * E pelo de PROTOCOLO (por DFD do bundle).
 */

export type ReparticaoMatch = { id: number; codigo: string; nome: string };

/** UPPER + sem acento (p/ casar sigla/código). */
const norm = (s: string) => stripAccents(s.trim().toUpperCase());

/** Chave de NOME p/ casar secretarias com siglas divergentes (ignora acentos,
 * conectores e "MUNICIPAL"). Ex.: "SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL"
 * e "Secretaria de Infraestrutura Rural" → "SECRETARIA INFRAESTRUTURA RURAL". */
const chaveNome = (s: string) =>
  stripAccents(s)
    .toUpperCase()
    .replace(/\b(DE|DA|DO|DAS|DOS|E|MUNICIPAL)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

/**
 * Devolve o `id` da repartição que casa com o setor do DFD (ou `null`):
 * 1) pela SIGLA (código do setor = código da repartição);
 * 2) fallback pelo NOME da secretaria (`chaveNome`, cobre sigla divergente).
 */
export function casarReparticao(
  dfd: { siglaSetor?: string | null; setorRequisitante?: string | null },
  reparticoes: ReparticaoMatch[],
): number | null {
  // 1) casa a sigla do Setor Requisitante com o código da repartição.
  if (dfd.siglaSetor) {
    const r = reparticoes.find((x) => norm(x.codigo) === dfd.siglaSetor);
    if (r) return r.id;
  }
  // 2) fallback pelo NOME da secretaria (cobre sigla divergente, ex.: SMIR × SIR).
  if (dfd.setorRequisitante) {
    const nomeSetor =
      dfd.setorRequisitante.split(/\s+[-–—]\s+/).slice(1).join(" - ") || dfd.setorRequisitante;
    const alvo = chaveNome(nomeSetor);
    const r = alvo ? reparticoes.find((x) => chaveNome(x.nome) === alvo) : undefined;
    if (r) return r.id;
  }
  return null;
}
