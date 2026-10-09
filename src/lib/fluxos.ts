import { and, desc, eq, getTableColumns, inArray, isNull, ne, or } from "drizzle-orm";
import { automacaoFluxos, usuarios } from "@/db/schema";
import { getDb } from "./db";
import { idsAutomacoesMesa, PREF_AUTOMACOES_MESA } from "./automacao-mesa";
import { listarPreferenciasTabela } from "./preferencias-tabela";
import { type AjudaFluxo, cicloDeSubfluxos, fluxoVisivel, lerAjudaFluxo, type Frequencia, type Grafo, lerFrequencia, lerGrafo, proximaExecucao, subfluxosDoGrafo } from "./fluxo-core";
import { comandoLimparProgresso, comandosGravarProgresso, consultaProgresso } from "./fluxos-sql";

export type FluxoAutomacao = {
  id: number;
  nome: string;
  descricao: string | null;
  ajuda: AjudaFluxo;
  grafo: Grafo;
  frequencia: Frequencia;
  ativo: boolean;
  proximaEm: string | null;
  ultimaEm: string | null;
  ultimaExecucao: Record<string, unknown> | null;
  atualizadoEm: string | null;
  /** Público = os outros ADMs o veem no painel lateral; privado = só no painel do dono. */
  publico: boolean;
  /** O dono (null = a pessoa foi excluída — o fluxo fica para qualquer ADM). */
  criadoPor: number | null;
  /** O nome do dono (o lateral mostra de quem é). */
  autor: string | null;
};

const json = (t: string | null): unknown => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};
type Linha = typeof automacaoFluxos.$inferSelect & { autor?: string | null };
const doBanco = (l: Linha): FluxoAutomacao => ({
  id: l.id,
  nome: l.nome,
  descricao: l.descricao,
  ajuda: lerAjudaFluxo(json(l.ajuda)),
  grafo: lerGrafo(json(l.grafo)),
  frequencia: lerFrequencia(json(l.frequencia)),
  ativo: l.ativo,
  proximaEm: l.proximaEm,
  ultimaEm: l.ultimaEm,
  ultimaExecucao: (json(l.ultimaExecucao) as Record<string, unknown> | null) ?? null,
  atualizadoEm: l.atualizadoEm,
  publico: l.publico,
  criadoPor: l.criadoPor,
  autor: l.autor ?? null,
});

/** As colunas do fluxo + o nome do dono. */
const comAutor = () =>
  getDb()
    .select({ ...getTableColumns(automacaoFluxos), autor: usuarios.nome })
    .from(automacaoFluxos)
    .leftJoin(usuarios, eq(usuarios.id, automacaoFluxos.criadoPor));

/** TODOS os fluxos (as conferências de subfluxo e de ciclo olham o sistema inteiro). */
export async function listarFluxos(): Promise<FluxoAutomacao[]> {
  return (await comAutor().orderBy(desc(automacaoFluxos.atualizadoEm)).limit(500)).map(doBanco);
}

/** O PAINEL da pessoa: os fluxos dela (e os que ficaram sem dono). */
export async function listarFluxosDe(usuarioId: number): Promise<FluxoAutomacao[]> {
  return (
    await comAutor()
      .where(or(eq(automacaoFluxos.criadoPor, usuarioId), isNull(automacaoFluxos.criadoPor)))
      .orderBy(desc(automacaoFluxos.atualizadoEm))
      .limit(200)
  ).map(doBanco);
}

/** O painel LATERAL: os fluxos PÚBLICOS de outras pessoas. */
export async function listarPublicos(usuarioId: number): Promise<FluxoAutomacao[]> {
  return (
    await comAutor()
      .where(and(eq(automacaoFluxos.publico, true), ne(automacaoFluxos.criadoPor, usuarioId)))
      .orderBy(desc(automacaoFluxos.atualizadoEm))
      .limit(200)
  ).map(doBanco);
}

/** As automações que a pessoa pôs na MESA DO SISTEMA (a preferência dela), só as que ela ainda pode ver — na ordem escolhida. */
export async function automacoesDaMesa(usuarioId: number): Promise<{ id: number; nome: string }[]> {
  const ids = idsAutomacoesMesa((await listarPreferenciasTabela(usuarioId, PREF_AUTOMACOES_MESA))[PREF_AUTOMACOES_MESA]);
  if (!ids.length) return [];
  const rows = await getDb()
    .select({ id: automacaoFluxos.id, nome: automacaoFluxos.nome, publico: automacaoFluxos.publico, criadoPor: automacaoFluxos.criadoPor })
    .from(automacaoFluxos)
    .where(inArray(automacaoFluxos.id, ids.slice(0, 50)));
  const por = new Map(rows.filter((r) => fluxoVisivel(r, usuarioId)).map((r) => [r.id, { id: r.id, nome: r.nome }]));
  return ids.flatMap((id) => por.get(id) ?? []);
}

export async function getFluxo(id: number): Promise<FluxoAutomacao | null> {
  const l = (await comAutor().where(eq(automacaoFluxos.id, id)).limit(1))[0];
  return l ? doBanco(l) : null;
}

export async function criarFluxo(
  d: { nome: string; descricao?: string; ajuda?: unknown; grafo?: unknown; frequencia?: unknown; ativo?: boolean; publico?: boolean },
  usuarioId: number,
): Promise<FluxoAutomacao> {
  const frequencia = lerFrequencia(d.frequencia ?? {});
  const ativo = d.ativo === true;
  const [l] = await getDb()
    .insert(automacaoFluxos)
    .values({
      nome: d.nome,
      descricao: d.descricao || null,
      ajuda: d.ajuda === undefined ? null : JSON.stringify(lerAjudaFluxo(d.ajuda)),
      grafo: JSON.stringify(lerGrafo(d.grafo ?? {})),
      frequencia: JSON.stringify(frequencia),
      ativo,
      proximaEm: ativo ? proximaExecucao(frequencia, new Date()) : null,
      publico: d.publico === true,
      criadoPor: usuarioId,
    })
    .returning();
  return (await getFluxo(l.id)) ?? doBanco(l);
}

/** Edita (só o que veio); a próxima execução segue a frequência e o ligado. */
export async function editarFluxo(
  id: number,
  d: { nome?: string; descricao?: string | null; ajuda?: unknown; grafo?: unknown; frequencia?: unknown; ativo?: boolean; publico?: boolean },
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
      ...(d.ajuda === undefined ? {} : { ajuda: JSON.stringify(lerAjudaFluxo(d.ajuda)) }),
      ...(d.grafo === undefined ? {} : { grafo: JSON.stringify(lerGrafo(d.grafo)) }),
      ...(d.publico === undefined ? {} : { publico: d.publico }),
      frequencia: JSON.stringify(frequencia),
      ativo,
      ...(mudouAgenda ? { proximaEm: ativo ? proximaExecucao(frequencia, agora) : null } : {}),
      atualizadoEm: agora.toISOString(),
    })
    .where(eq(automacaoFluxos.id, id))
    .returning();
  return l ? getFluxo(l.id) : null;
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
  return l ? getFluxo(l.id) : null;
}

export async function excluirFluxo(id: number): Promise<boolean> {
  return (await getDb().delete(automacaoFluxos).where(eq(automacaoFluxos.id, id)).returning({ id: automacaoFluxos.id })).length > 0;
}

// ———————————————————————————————————————————————— subfluxos

/** Os fluxos que USAM o fluxo `id` dentro deles (a exclusão é recusada enquanto houver). */
export async function fluxosQueUsam(id: number): Promise<{ id: number; nome: string; criadoPor: number | null; autor: string | null }[]> {
  return (await listarFluxos())
    .filter((f) => f.id !== id && subfluxosDoGrafo(f.grafo).includes(id))
    .map((f) => ({ id: f.id, nome: f.nome, criadoPor: f.criadoPor, autor: f.autor }));
}

/** Os subfluxos do grafo que a pessoa NÃO pode usar (de outra pessoa e privados, ou inexistentes) — os ids. */
export async function subfluxosProibidos(grafo: unknown, usuarioId: number): Promise<number[]> {
  const usados = subfluxosDoGrafo(lerGrafo(grafo));
  if (!usados.length) return [];
  const todos = new Map((await listarFluxos()).map((f) => [f.id, f]));
  return usados.filter((x) => {
    const f = todos.get(x);
    return !f || !fluxoVisivel(f, usuarioId);
  });
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
