import { desc, eq } from "drizzle-orm";
import { automacaoFluxos } from "@/db/schema";
import { getDb } from "./db";
import { type Frequencia, type Grafo, lerFrequencia, lerGrafo, proximaExecucao } from "./fluxo-core";

export type FluxoAutomacao = {
  id: number;
  nome: string;
  descricao: string | null;
  grafo: Grafo;
  frequencia: Frequencia;
  ativo: boolean;
  proximaEm: string | null;
  ultimaEm: string | null;
  ultimaExecucao: Record<string, unknown> | null;
  atualizadoEm: string | null;
};

const json = (t: string | null): unknown => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};
type Linha = typeof automacaoFluxos.$inferSelect;
const doBanco = (l: Linha): FluxoAutomacao => ({
  id: l.id,
  nome: l.nome,
  descricao: l.descricao,
  grafo: lerGrafo(json(l.grafo)),
  frequencia: lerFrequencia(json(l.frequencia)),
  ativo: l.ativo,
  proximaEm: l.proximaEm,
  ultimaEm: l.ultimaEm,
  ultimaExecucao: (json(l.ultimaExecucao) as Record<string, unknown> | null) ?? null,
  atualizadoEm: l.atualizadoEm,
});

export async function listarFluxos(): Promise<FluxoAutomacao[]> {
  return (await getDb().select().from(automacaoFluxos).orderBy(desc(automacaoFluxos.atualizadoEm)).limit(200)).map(doBanco);
}

export async function getFluxo(id: number): Promise<FluxoAutomacao | null> {
  const l = (await getDb().select().from(automacaoFluxos).where(eq(automacaoFluxos.id, id)).limit(1))[0];
  return l ? doBanco(l) : null;
}

export async function criarFluxo(d: { nome: string; descricao?: string; grafo?: unknown }, usuarioId: number): Promise<FluxoAutomacao> {
  const [l] = await getDb()
    .insert(automacaoFluxos)
    .values({ nome: d.nome, descricao: d.descricao || null, grafo: JSON.stringify(lerGrafo(d.grafo ?? {})), criadoPor: usuarioId })
    .returning();
  return doBanco(l);
}

/** Edita (só o que veio); a próxima execução segue a frequência e o ligado. */
export async function editarFluxo(
  id: number,
  d: { nome?: string; descricao?: string | null; grafo?: unknown; frequencia?: unknown; ativo?: boolean },
  agora = new Date(),
): Promise<FluxoAutomacao | null> {
  const atual = await getFluxo(id);
  if (!atual) return null;
  const frequencia = d.frequencia === undefined ? atual.frequencia : lerFrequencia(d.frequencia);
  const ativo = d.ativo ?? atual.ativo;
  const mudouAgenda = d.frequencia !== undefined || d.ativo !== undefined;
  const [l] = await getDb()
    .update(automacaoFluxos)
    .set({
      ...(d.nome === undefined ? {} : { nome: d.nome }),
      ...(d.descricao === undefined ? {} : { descricao: d.descricao || null }),
      ...(d.grafo === undefined ? {} : { grafo: JSON.stringify(lerGrafo(d.grafo)) }),
      frequencia: JSON.stringify(frequencia),
      ativo,
      ...(mudouAgenda ? { proximaEm: ativo ? proximaExecucao(frequencia, agora) : null } : {}),
      atualizadoEm: agora.toISOString(),
    })
    .where(eq(automacaoFluxos.id, id))
    .returning();
  return l ? doBanco(l) : null;
}

/** Fecha uma execução: grava o resumo e agenda a próxima pela frequência (do FIM — não acumula atraso). */
export async function registrarExecucaoFluxo(id: number, resumo: Record<string, unknown>, agora = new Date()): Promise<FluxoAutomacao | null> {
  const atual = await getFluxo(id);
  if (!atual) return null;
  const [l] = await getDb()
    .update(automacaoFluxos)
    .set({
      ultimaEm: agora.toISOString(),
      ultimaExecucao: JSON.stringify(resumo),
      proximaEm: atual.ativo ? proximaExecucao(atual.frequencia, agora) : null,
    })
    .where(eq(automacaoFluxos.id, id))
    .returning();
  return l ? doBanco(l) : null;
}

export async function excluirFluxo(id: number): Promise<boolean> {
  return (await getDb().delete(automacaoFluxos).where(eq(automacaoFluxos.id, id)).returning({ id: automacaoFluxos.id })).length > 0;
}
