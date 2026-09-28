/**
 * Núcleo PURO da SINCRONIZAÇÃO com o Trello (sem `getDb`/env — testável): a correspondência adaptativa PCA ↔ Trello, o
 * retrato da última sincronização, as diferenças e o conflito. As chamadas à API ficam em `trello-api.ts`; o banco, em
 * `trello-sync.ts`.
 */
import { casarMembro } from "./trello-import.ts";

// ─── MEMBROS (pessoa do sistema ↔ membro do Trello) ────────────────────────────────────────────────────────

export type MembroTrelloLeve = { id: string; username: string; fullName: string };
export type LigacaoMembro = { usuarioId: number; membroId: string; usuarioTrello: string | null; nome: string | null };

/**
 * A SUGESTÃO de ligação de cada pessoa AINDA sem membro: o membro do Trello cujo nome (ou usuário = apelido) casa com UMA só
 * pessoa (`casarMembro`, a régua da importação) — e só quando esse membro casa com uma pessoa só e ainda não está ligado.
 */
export function sugerirMembros(
  pessoas: { id: number; nome: string; apelido?: string | null }[],
  membros: MembroTrelloLeve[],
  ligacoes: Pick<LigacaoMembro, "usuarioId" | "membroId">[],
): Record<number, string> {
  const ligadas = new Set(ligacoes.map((l) => l.usuarioId));
  const usados = new Set(ligacoes.map((l) => l.membroId));
  const livres = pessoas.filter((p) => !ligadas.has(p.id));
  const porPessoa = new Map<number, string[]>();
  for (const m of membros) {
    if (usados.has(m.id)) continue;
    const id = casarMembro({ nome: m.fullName, usuario: m.username }, livres);
    if (id != null) porPessoa.set(id, [...(porPessoa.get(id) ?? []), m.id]);
  }
  const saida: Record<number, string> = {};
  for (const [id, ms] of porPessoa) if (ms.length === 1) saida[id] = ms[0];
  return saida;
}
