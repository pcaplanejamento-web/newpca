import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { grupos, tarefaEtiquetaLinks, tarefaEtiquetas, tarefaListas, tarefaPessoas, tarefaQuadros, tarefas } from "@/db/schema";
import type { UsuarioSessao } from "./auth";
import { getDb } from "./db";
import { gruposDoUsuario } from "./grupos";
import { listarPessoasDoGrupo } from "./usuarios";
import {
  type EtiquetaTarefa,
  type ListaTarefas,
  ordemEntre,
  type Prioridade,
  PRIORIDADES,
  type TarefaResumo,
} from "./tarefas-core";
import { comandosCriarTarefa, comandosMover, comandosVinculos } from "./tarefas-sql";

/**
 * TAREFAS (migração `0042`) — acesso ao D1 (só escopo de request). O quadro é de UM grupo: vê e edita quem é membro do
 * grupo (o ADM, todos).
 */

export type Quadro = { id: number; grupoId: number; grupoNome: string; nome: string; cor: string; descricao: string | null; arquivado: boolean };
export type QuadroCard = Quadro & { abertas: number; atrasadas: number; concluidas: number };
export type TarefaCompleta = TarefaResumo & { quadroId: number; descricao: string | null };

const COLS_QUADRO = {
  id: tarefaQuadros.id,
  grupoId: tarefaQuadros.grupoId,
  grupoNome: grupos.nome,
  nome: tarefaQuadros.nome,
  cor: tarefaQuadros.cor,
  descricao: tarefaQuadros.descricao,
  arquivado: tarefaQuadros.arquivado,
};

/** Os quadros dos GRUPOS dados (`null` = todos — o ADM sem grupo), com as contagens do card. `hoje` = "AAAA-MM-DD". */
export async function listarQuadros(grupoIds: number[] | null, hoje: string): Promise<QuadroCard[]> {
  if (grupoIds && grupoIds.length === 0) return [];
  const aberta = sql`t.arquivada = 0 AND t.concluida_em IS NULL`;
  return getDb()
    .select({
      ...COLS_QUADRO,
      abertas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND ${aberta})`,
      atrasadas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND ${aberta} AND t.prazo < ${hoje})`,
      concluidas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND t.arquivada = 0 AND t.concluida_em IS NOT NULL)`,
    })
    .from(tarefaQuadros)
    .innerJoin(grupos, eq(grupos.id, tarefaQuadros.grupoId))
    .where(grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds) : undefined)
    .orderBy(tarefaQuadros.arquivado, asc(tarefaQuadros.nome));
}

export async function getQuadro(id: number): Promise<Quadro | null> {
  const [q] = await getDb().select(COLS_QUADRO).from(tarefaQuadros).innerJoin(grupos, eq(grupos.id, tarefaQuadros.grupoId)).where(eq(tarefaQuadros.id, id));
  return q ?? null;
}

/** O quadro, se o usuário pode vê-lo (membro do grupo do quadro — o ADM, qualquer um); senão `null`. */
export async function quadroAcessivel(u: UsuarioSessao, id: number): Promise<Quadro | null> {
  const q = await getQuadro(id);
  if (!q || u.role === "admin") return q;
  return (await gruposDoUsuario(u.id)).some((g) => g.id === q.grupoId) ? q : null;
}

/** A tarefa e o quadro dela, se o usuário pode vê-la; senão `null`. */
export async function tarefaAcessivel(u: UsuarioSessao, id: number): Promise<{ tarefa: TarefaCompleta; quadro: Quadro } | null> {
  const tarefa = await getTarefa(id);
  const quadro = tarefa ? await quadroAcessivel(u, tarefa.quadroId) : null;
  return tarefa && quadro ? { tarefa, quadro } : null;
}

/** Os responsáveis pedidos são PESSOAS DO GRUPO do quadro (as já designadas antes seguem valendo, mesmo fora dele)? */
export async function pessoasValidas(grupoId: number, ids: number[], atuais: number[] = []): Promise<boolean> {
  if (ids.every((i) => atuais.includes(i))) return true;
  const membros = new Set((await listarPessoasDoGrupo(grupoId)).map((p) => p.id));
  return ids.every((i) => membros.has(i) || atuais.includes(i));
}

/** Listas + cartões (resumo, sem descrição) + etiquetas do quadro — três consultas, cada uma com UM parâmetro. */
export async function dadosQuadro(quadroId: number): Promise<{ listas: ListaTarefas[]; tarefas: TarefaResumo[]; etiquetas: EtiquetaTarefa[] }> {
  const db = getDb();
  const [listas, cartoes, pessoas, links, etiquetas] = await Promise.all([
    db
      .select({
        id: tarefaListas.id,
        nome: tarefaListas.nome,
        ordem: tarefaListas.ordem,
        limiteWip: tarefaListas.limiteWip,
        concluida: tarefaListas.concluida,
        arquivada: tarefaListas.arquivada,
      })
      .from(tarefaListas)
      .where(eq(tarefaListas.quadroId, quadroId))
      .orderBy(asc(tarefaListas.ordem), asc(tarefaListas.id)),
    db
      .select({
        id: tarefas.id,
        listaId: tarefas.listaId,
        ticket: tarefas.ticket,
        titulo: tarefas.titulo,
        prioridade: tarefas.prioridade,
        inicio: tarefas.inicio,
        prazo: tarefas.prazo,
        ordem: tarefas.ordem,
        concluidaEm: tarefas.concluidaEm,
        arquivada: tarefas.arquivada,
        criadoEm: tarefas.criadoEm,
        atualizadoEm: tarefas.atualizadoEm,
      })
      .from(tarefas)
      .where(eq(tarefas.quadroId, quadroId)),
    db
      .select({ tarefaId: tarefaPessoas.tarefaId, usuarioId: tarefaPessoas.usuarioId })
      .from(tarefaPessoas)
      .innerJoin(tarefas, eq(tarefas.id, tarefaPessoas.tarefaId))
      .where(and(eq(tarefas.quadroId, quadroId), eq(tarefaPessoas.papel, "responsavel"))),
    db
      .select({ tarefaId: tarefaEtiquetaLinks.tarefaId, etiquetaId: tarefaEtiquetaLinks.etiquetaId })
      .from(tarefaEtiquetaLinks)
      .innerJoin(tarefas, eq(tarefas.id, tarefaEtiquetaLinks.tarefaId))
      .where(eq(tarefas.quadroId, quadroId)),
    db
      .select({ id: tarefaEtiquetas.id, nome: tarefaEtiquetas.nome, cor: tarefaEtiquetas.cor })
      .from(tarefaEtiquetas)
      .where(eq(tarefaEtiquetas.quadroId, quadroId))
      .orderBy(asc(tarefaEtiquetas.ordem), asc(tarefaEtiquetas.id)),
  ]);
  const agrupar = (pares: { tarefaId: number; v: number }[]) => {
    const m = new Map<number, number[]>();
    for (const p of pares) m.set(p.tarefaId, [...(m.get(p.tarefaId) ?? []), p.v]);
    return m;
  };
  const porPessoa = agrupar(pessoas.map((p) => ({ tarefaId: p.tarefaId, v: p.usuarioId })));
  const porEtiqueta = agrupar(links.map((l) => ({ tarefaId: l.tarefaId, v: l.etiquetaId })));
  return {
    listas,
    etiquetas,
    tarefas: cartoes.map((t) => ({
      ...t,
      prioridade: prioridadeValida(t.prioridade),
      pessoas: porPessoa.get(t.id) ?? [],
      etiquetas: porEtiqueta.get(t.id) ?? [],
    })),
  };
}

const prioridadeValida = (p: string): Prioridade => ((PRIORIDADES as readonly string[]).includes(p) ? (p as Prioridade) : "media");

export async function getTarefa(id: number): Promise<TarefaCompleta | null> {
  const db = getDb();
  const [t] = await db.select().from(tarefas).where(eq(tarefas.id, id));
  if (!t) return null;
  const [pessoas, links] = await Promise.all([
    db.select({ u: tarefaPessoas.usuarioId }).from(tarefaPessoas).where(and(eq(tarefaPessoas.tarefaId, id), eq(tarefaPessoas.papel, "responsavel"))),
    db.select({ e: tarefaEtiquetaLinks.etiquetaId }).from(tarefaEtiquetaLinks).where(eq(tarefaEtiquetaLinks.tarefaId, id)),
  ]);
  return {
    id: t.id,
    quadroId: t.quadroId,
    listaId: t.listaId,
    ticket: t.ticket,
    titulo: t.titulo,
    descricao: t.descricao,
    prioridade: prioridadeValida(t.prioridade),
    inicio: t.inicio,
    prazo: t.prazo,
    ordem: t.ordem,
    concluidaEm: t.concluidaEm,
    arquivada: t.arquivada,
    pessoas: pessoas.map((p) => p.u),
    etiquetas: links.map((l) => l.e),
    criadoEm: t.criadoEm,
    atualizadoEm: t.atualizadoEm,
  };
}

/** As listas com que todo quadro NASCE (a última é a de concluídas). */
const LISTAS_INICIAIS = [
  { nome: "A fazer", concluida: false },
  { nome: "Em andamento", concluida: false },
  { nome: "Concluído", concluida: true },
];

export async function criarQuadro(grupoId: number, d: { nome: string; cor?: string; descricao?: string | null }, usuarioId: number): Promise<number> {
  const db = getDb();
  const [q] = await db
    .insert(tarefaQuadros)
    .values({ grupoId, nome: d.nome, cor: d.cor ?? "#6366f1", descricao: d.descricao ?? null, criadoPor: usuarioId })
    .returning({ id: tarefaQuadros.id });
  await db.insert(tarefaListas).values(LISTAS_INICIAIS.map((l, i) => ({ quadroId: q.id, nome: l.nome, concluida: l.concluida, ordem: i + 1 })));
  return q.id;
}

export async function atualizarQuadro(id: number, d: { nome?: string; cor?: string; descricao?: string | null; arquivado?: boolean }) {
  await getDb()
    .update(tarefaQuadros)
    .set({ ...d, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(tarefaQuadros.id, id));
}

export async function excluirQuadro(id: number) {
  await getDb().delete(tarefaQuadros).where(eq(tarefaQuadros.id, id));
}

export async function getLista(id: number) {
  const [l] = await getDb().select().from(tarefaListas).where(eq(tarefaListas.id, id));
  return l ?? null;
}

export async function criarLista(quadroId: number, d: { nome: string; limiteWip?: number | null; concluida?: boolean }): Promise<number> {
  const [l] = await getDb()
    .insert(tarefaListas)
    .values({
      quadroId,
      nome: d.nome,
      limiteWip: d.limiteWip ?? null,
      concluida: d.concluida ?? false,
      ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_listas WHERE quadro_id = ${quadroId})`,
    })
    .returning({ id: tarefaListas.id });
  return l.id;
}

export async function atualizarLista(id: number, d: { nome?: string; limiteWip?: number | null; concluida?: boolean; arquivada?: boolean }) {
  await getDb().update(tarefaListas).set(d).where(eq(tarefaListas.id, id));
}

/** Quantos cartões (inclusive arquivados) a lista tem — só a vazia é excluída. */
export async function cartoesNaLista(id: number): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`COUNT(*)` }).from(tarefas).where(eq(tarefas.listaId, id));
  return Number(r?.n ?? 0);
}

export async function excluirLista(id: number) {
  await getDb().delete(tarefaListas).where(eq(tarefaListas.id, id));
}

/** Grava a ORDEM das listas (as de fora do quadro são ignoradas). */
export async function ordenarListas(quadroId: number, ids: number[]) {
  const db = getDb();
  const cmds = ids.map((id, i) => db.update(tarefaListas).set({ ordem: i + 1 }).where(and(eq(tarefaListas.id, id), eq(tarefaListas.quadroId, quadroId))));
  if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

export async function criarEtiqueta(quadroId: number, d: { nome: string; cor: string }): Promise<number> {
  const [e] = await getDb()
    .insert(tarefaEtiquetas)
    .values({ quadroId, ...d, ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_etiquetas WHERE quadro_id = ${quadroId})` })
    .returning({ id: tarefaEtiquetas.id });
  return e.id;
}

export async function getEtiqueta(id: number) {
  const [e] = await getDb().select().from(tarefaEtiquetas).where(eq(tarefaEtiquetas.id, id));
  return e ?? null;
}

export async function atualizarEtiqueta(id: number, d: { nome: string; cor: string }) {
  await getDb().update(tarefaEtiquetas).set(d).where(eq(tarefaEtiquetas.id, id));
}

export async function excluirEtiqueta(id: number) {
  await getDb().delete(tarefaEtiquetas).where(eq(tarefaEtiquetas.id, id));
}

/** As etiquetas pedidas que são DO quadro (as de outro quadro saem). */
export async function etiquetasDoQuadro(quadroId: number, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const r = await getDb()
    .select({ id: tarefaEtiquetas.id })
    .from(tarefaEtiquetas)
    .where(and(eq(tarefaEtiquetas.quadroId, quadroId), inArray(tarefaEtiquetas.id, ids)));
  return r.map((x) => x.id);
}

/** CRIA a tarefa (ticket + fim da lista + responsáveis + etiquetas, num lote atômico). */
export async function criarTarefa(d: Parameters<typeof comandosCriarTarefa>[1]): Promise<{ id: number; ticket: number }> {
  const db = getDb();
  const r = await db.batch(comandosCriarTarefa(db, d));
  const [nova] = r[r.length - 1] as { id: number; ticket: number }[];
  return nova;
}

/** Atualiza os campos + (opcional) responsáveis/etiquetas num lote só. */
export async function atualizarTarefa(
  id: number,
  campos: { titulo?: string; descricao?: string | null; prioridade?: Prioridade; inicio?: string | null; prazo?: string | null; arquivada?: boolean },
  vinculos: { pessoas?: number[]; etiquetas?: number[] },
) {
  const db = getDb();
  await db.batch([
    db
      .update(tarefas)
      .set({ ...campos, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(tarefas.id, id)),
    ...comandosVinculos(db, id, vinculos.pessoas, vinculos.etiquetas),
  ]);
}

/**
 * MOVE o cartão para `listaId` entre os vizinhos dados (ids da MESMA lista; `null` = ponta). A ordem vem de
 * `ordemEntre`; sem vão, RENUMERA a lista (1, 2, 3…) com o cartão já no lugar. Devolve as ordens gravadas.
 */
export async function moverTarefa(id: number, listaId: number, anteriorId: number | null, proximoId: number | null, concluida: boolean) {
  const db = getDb();
  const lista = await db
    .select({ id: tarefas.id, ordem: tarefas.ordem })
    .from(tarefas)
    .where(and(eq(tarefas.listaId, listaId), eq(tarefas.arquivada, false)))
    .orderBy(asc(tarefas.ordem), asc(tarefas.ticket));
  const outros = lista.filter((t) => t.id !== id);
  const ordemDe = (x: number | null) => (x == null ? null : (outros.find((t) => t.id === x)?.ordem ?? null));
  // Um vizinho que não está (mais) na lista conta como ponta.
  const r = ordemEntre(ordemDe(anteriorId), ordemDe(proximoId));
  let ordens: [number, number][] = [];
  let ordem = r.ordem;
  if (r.renumerar) {
    const pos = anteriorId == null ? 0 : outros.findIndex((t) => t.id === anteriorId) + 1;
    const nova = [...outros.slice(0, pos).map((t) => t.id), id, ...outros.slice(pos).map((t) => t.id)];
    ordens = nova.map((t, i) => [t, i + 1] as [number, number]).filter(([t]) => t !== id);
    ordem = pos + 1;
  }
  await db.batch(comandosMover(db, id, listaId, ordem, concluida, ordens) as [ReturnType<typeof comandosMover>[number], ...ReturnType<typeof comandosMover>]);
  return { ordem, ordens };
}

/** O último cartão (não arquivado) da lista, sem contar `exceto` — mover "para o fim". */
export async function ultimoDaLista(listaId: number, exceto: number): Promise<number | null> {
  const [t] = await getDb()
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.listaId, listaId), eq(tarefas.arquivada, false), sql`${tarefas.id} <> ${exceto}`))
    .orderBy(sql`${tarefas.ordem} DESC`, sql`${tarefas.ticket} DESC`)
    .limit(1);
  return t?.id ?? null;
}

export async function excluirTarefa(id: number) {
  await getDb().delete(tarefas).where(eq(tarefas.id, id));
}
