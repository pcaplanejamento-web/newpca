import { desc, eq } from "drizzle-orm";
import { automacaoFluxos } from "@/db/schema";
import { getDb } from "./db";
import { cicloDeSubfluxos, type Frequencia, type Grafo, lerFrequencia, lerGrafo, proximaExecucao, subfluxosDoGrafo } from "./fluxo-core";
import { comandoLimparProgresso, comandosGravarProgresso, consultaProgresso } from "./fluxos-sql";

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

export async function criarFluxo(
  d: { nome: string; descricao?: string; grafo?: unknown; frequencia?: unknown; ativo?: boolean },
  usuarioId: number,
): Promise<FluxoAutomacao> {
  const frequencia = lerFrequencia(d.frequencia ?? {});
  const ativo = d.ativo === true;
  const [l] = await getDb()
    .insert(automacaoFluxos)
    .values({
      nome: d.nome,
      descricao: d.descricao || null,
      grafo: JSON.stringify(lerGrafo(d.grafo ?? {})),
      frequencia: JSON.stringify(frequencia),
      ativo,
      proximaEm: ativo ? proximaExecucao(frequencia, new Date()) : null,
      criadoPor: usuarioId,
    })
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

// ———————————————————————————————————————————————— subfluxos

/** Os fluxos que USAM o fluxo `id` dentro deles (a exclusão é recusada enquanto houver). */
export async function fluxosQueUsam(id: number): Promise<{ id: number; nome: string }[]> {
  return (await listarFluxos()).filter((f) => f.id !== id && subfluxosDoGrafo(f.grafo).includes(id)).map((f) => ({ id: f.id, nome: f.nome }));
}

/** O ciclo (A usa B que usa A) que o grafo novo de `id` criaria — os nomes, ou null. `id` null = fluxo novo. */
export async function cicloAoGravar(id: number | null, grafo: unknown): Promise<string | null> {
  const novo = lerGrafo(grafo);
  const usados = subfluxosDoGrafo(novo);
  if (!usados.length) return null;
  const todos = await listarFluxos();
  const proprio = id ?? -1;
  if (usados.includes(proprio)) return "Um fluxo não pode usar a si mesmo.";
  const usa = new Map<number, number[]>(todos.map((f) => [f.id, subfluxosDoGrafo(f.grafo)]));
  usa.set(proprio, usados);
  const ciclo = cicloDeSubfluxos(proprio, usa);
  if (!ciclo) return null;
  const nome = (x: number) => (x === proprio ? "este fluxo" : (todos.find((f) => f.id === x)?.nome ?? `fluxo ${x}`));
  return `Os fluxos se usariam em círculo: ${ciclo.map(nome).join(" → ")}.`;
}

export async function lerProgresso(fluxoId: number, no: string): Promise<string[]> {
  return (await consultaProgresso(getDb(), fluxoId, no)).map((l) => l.chave);
}

export async function gravarProgresso(fluxoId: number, no: string, itens: { chave: string; estado: "ok" | "falha" }[]): Promise<void> {
  const cmds = comandosGravarProgresso(getDb(), fluxoId, no, itens);
  if (cmds.length) await getDb().batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

export async function limparProgresso(fluxoId: number, no: string): Promise<void> {
  await comandoLimparProgresso(getDb(), fluxoId, no);
}
