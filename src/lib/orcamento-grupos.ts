import type { OrgaoRef, UnidadeRef } from "./orcamento-comparativo.ts";

/**
 * GRUPOS ORÇAMENTÁRIOS — unidades cadastradas que COMPARTILHAM o orçamento (ex.: a Secretaria e o Fundo da Cultura).
 * Núcleo PURO (testado). O grupo vira uma linha do comparativo PCA × Orçamento ("Ver por Grupo") pela MESMA agregação do
 * órgão: as unidades recebem o grupo no lugar do órgão (`refsDosGrupos`) e `comparativoPorOrgao`/`origemDoOrgao` somam.
 * A unidade fora de grupo fica sozinha. Uma unidade em UM grupo.
 */
export type GrupoOrcamento = { id: number; nome: string; unidades: number[] };

export const MAX_GRUPOS_ORCAMENTO = 100;

/** Qualquer JSON → grupos válidos (nome, ≥ 2 unidades distintas, uma unidade em um só grupo — o 1º vence). */
export function lerGruposOrcamento(v: unknown): GrupoOrcamento[] {
  if (!Array.isArray(v)) return [];
  const usadas = new Set<number>();
  const out: GrupoOrcamento[] = [];
  for (const g of v.slice(0, MAX_GRUPOS_ORCAMENTO)) {
    if (!g || typeof g !== "object") continue;
    const { id, nome, unidades } = g as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || typeof nome !== "string" || !nome.trim() || !Array.isArray(unidades)) continue;
    const us = [...new Set(unidades.filter((u): u is number => Number.isInteger(u) && (u as number) > 0 && !usadas.has(u as number)))];
    if (us.length < 2) continue;
    for (const u of us) usadas.add(u);
    out.push({ id, nome: nome.trim().slice(0, 80), unidades: us });
  }
  return out;
}

/** O motivo de recusar uma lista de grupos (a tela e o servidor), ou `null`. */
export function motivoGruposInvalidos(grupos: GrupoOrcamento[], idsUnidades: ReadonlySet<number>): string | null {
  const vistas = new Map<number, string>();
  const nomes = new Set<string>();
  for (const g of grupos) {
    const n = g.nome.trim().toLowerCase();
    if (!n) return "Dê um nome a cada grupo.";
    if (nomes.has(n)) return `Já existe um grupo chamado "${g.nome}".`;
    nomes.add(n);
    if (new Set(g.unidades).size < 2) return `O grupo "${g.nome}" precisa de ao menos duas unidades.`;
    for (const u of g.unidades) {
      if (!idsUnidades.has(u)) return `O grupo "${g.nome}" tem uma unidade que não existe mais.`;
      const outro = vistas.get(u);
      if (outro) return `Uma unidade está em "${outro}" e em "${g.nome}" — cada unidade fica em um grupo só.`;
      vistas.set(u, g.nome);
    }
  }
  return null;
}

/**
 * As unidades e os "órgãos" da visão POR GRUPO: a unidade de um grupo recebe o grupo (id −g); a sozinha, ela mesma
 * (id −1e6−u). Com isso, a agregação/origem do órgão vale para o grupo sem código novo.
 */
export function refsDosGrupos(unidades: readonly UnidadeRef[], grupos: readonly GrupoOrcamento[]): { unidades: UnidadeRef[]; orgaos: OrgaoRef[] } {
  const grupoDe = new Map<number, GrupoOrcamento>();
  for (const g of grupos) for (const u of g.unidades) grupoDe.set(u, g);
  const orgaos: OrgaoRef[] = grupos.map((g) => ({ id: -g.id, sigla: g.nome, nome: `${g.unidades.length} unidades` }));
  const nomes = new Map(unidades.map((u) => [u.id, u.sigla]));
  for (const g of orgaos) {
    const grupo = grupos.find((x) => -x.id === g.id);
    if (grupo) g.nome = grupo.unidades.map((u) => nomes.get(u) ?? `#${u}`).join(" + ");
  }
  const refs = unidades.map((u) => {
    const g = grupoDe.get(u.id);
    if (g) return { ...u, orgaoId: -g.id, orgaoSigla: g.nome };
    const id = -1_000_000 - u.id;
    orgaos.push({ id, sigla: u.sigla, nome: u.nome });
    return { ...u, orgaoId: id, orgaoSigla: u.sigla };
  });
  return { unidades: refs, orgaos };
}

/** SUGESTÕES de grupo: as unidades cadastradas que recebem ações da MESMA unidade do orçamento (pelos vínculos). */
export function sugerirGrupos(vinculos: readonly { chave: string; alvoId: number }[], grupos: readonly GrupoOrcamento[]): number[][] {
  const jaEm = new Set(grupos.flatMap((g) => g.unidades));
  const porChave = new Map<string, Set<number>>();
  for (const v of vinculos) porChave.set(v.chave, (porChave.get(v.chave) ?? new Set()).add(v.alvoId));
  const vistos = new Set<string>();
  const out: number[][] = [];
  for (const s of porChave.values()) {
    const us = [...s].filter((u) => !jaEm.has(u)).sort((a, b) => a - b);
    const k = us.join(",");
    if (us.length >= 2 && !vistos.has(k)) {
      vistos.add(k);
      out.push(us);
    }
  }
  return out;
}
