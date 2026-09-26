import { and, asc, eq, exists, ne, or, sql } from "drizzle-orm";
import { agendaPaginas, tarefaEventoConvidados, tarefaEventos, tarefas, usuarios } from "@/db/schema";
import { type Ocupado, type PaginaAgendamento, slugValido } from "./agendamento-core";
import { feriadosNoIntervalo } from "./calendario-core";
import { getDb } from "./db";
import { listarFeriados } from "./feriados";
import { lerRecorrenciaEvento, ocorrenciasDoEvento } from "./tarefas-core";

/**
 * PÁGINAS DE AGENDAMENTO (migração `0049`) — acesso ao D1 (só escopo de request). O que conta como OCUPADO: os eventos
 * "Ocupado" (não de dia inteiro) que a pessoa criou ou em que foi convidada e não recusou — as séries expandidas.
 */

const lerDias = (v: string) => {
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? [...new Set(a.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  } catch {
    return [];
  }
};
const paraPagina = (l: typeof agendaPaginas.$inferSelect): PaginaAgendamento => ({ ...l, dias: lerDias(l.dias) });

export async function listarPaginas(usuarioId: number): Promise<(PaginaAgendamento & { tarefaTitulo: string })[]> {
  const linhas = await getDb()
    .select({ p: agendaPaginas, tarefaTitulo: tarefas.titulo })
    .from(agendaPaginas)
    .innerJoin(tarefas, eq(tarefas.id, agendaPaginas.tarefaId))
    .where(eq(agendaPaginas.usuarioId, usuarioId))
    .orderBy(asc(agendaPaginas.id));
  return linhas.map((l) => ({ ...paraPagina(l.p), tarefaTitulo: l.tarefaTitulo }));
}

export async function paginaPorId(id: number) {
  const [l] = await getDb().select().from(agendaPaginas).where(eq(agendaPaginas.id, id)).limit(1);
  return l ? paraPagina(l) : null;
}

/** A página PÚBLICA (só ativa) + o nome de quem atende. */
export async function paginaPublica(slug: string) {
  if (!slugValido(slug)) return null;
  const [l] = await getDb()
    .select({ p: agendaPaginas, nome: usuarios.nome, apelido: usuarios.apelido, ativo: usuarios.status })
    .from(agendaPaginas)
    .innerJoin(usuarios, eq(usuarios.id, agendaPaginas.usuarioId))
    .where(and(eq(agendaPaginas.slug, slug), eq(agendaPaginas.ativa, true)))
    .limit(1);
  if (l?.ativo !== "ativo") return null;
  return { pagina: paraPagina(l.p), responsavel: l.apelido || l.nome };
}

export async function slugEmUso(slug: string, excetoId?: number) {
  const [l] = await getDb()
    .select({ id: agendaPaginas.id })
    .from(agendaPaginas)
    .where(and(eq(agendaPaginas.slug, slug), excetoId ? ne(agendaPaginas.id, excetoId) : undefined))
    .limit(1);
  return !!l;
}

export type DadosPagina = Omit<PaginaAgendamento, "id" | "usuarioId">;
const colunas = (d: Partial<DadosPagina>) => ({ ...d, dias: d.dias ? JSON.stringify(d.dias) : undefined });

export async function criarPagina(usuarioId: number, d: DadosPagina): Promise<number> {
  const [r] = await getDb()
    .insert(agendaPaginas)
    .values({ usuarioId, ...d, dias: JSON.stringify(d.dias) })
    .returning({ id: agendaPaginas.id });
  return r.id;
}
export async function atualizarPagina(id: number, d: Partial<DadosPagina>) {
  await getDb().update(agendaPaginas).set(colunas(d)).where(eq(agendaPaginas.id, id));
}
export async function excluirPagina(id: number) {
  await getDb().delete(agendaPaginas).where(eq(agendaPaginas.id, id));
}
export async function contarPaginas(usuarioId: number) {
  const [r] = await getDb().select({ n: sql<number>`COUNT(*)` }).from(agendaPaginas).where(eq(agendaPaginas.usuarioId, usuarioId));
  return Number(r?.n ?? 0);
}

/** Os blocos OCUPADOS da pessoa entre `de` e `ate` + os feriados (não se agenda neles). */
export async function agendaOcupada(usuarioId: number, de: string, ate: string): Promise<{ ocupados: Ocupado[]; feriados: Set<string> }> {
  const db = getDb();
  const [linhas, cadastrados] = await Promise.all([
    db
      .select({ data: tarefaEventos.data, dataFim: tarefaEventos.dataFim, horaInicio: tarefaEventos.horaInicio, horaFim: tarefaEventos.horaFim, recorrencia: tarefaEventos.recorrencia })
      .from(tarefaEventos)
      .innerJoin(tarefas, eq(tarefas.id, tarefaEventos.tarefaId))
      .where(
        and(
          eq(tarefaEventos.ocupado, true),
          eq(tarefaEventos.diaInteiro, false),
          eq(tarefas.arquivada, false),
          sql`${tarefaEventos.data} <= ${ate}`,
          sql`(COALESCE(${tarefaEventos.dataFim}, ${tarefaEventos.data}) >= ${de} OR (${tarefaEventos.recorrencia} IS NOT NULL AND COALESCE(json_extract(${tarefaEventos.recorrencia}, '$.ate'), '9999-12-31') >= ${de}))`,
          or(
            eq(tarefaEventos.criadoPor, usuarioId),
            exists(
              db
                .select({ x: sql`1` })
                .from(tarefaEventoConvidados)
                .where(and(eq(tarefaEventoConvidados.eventoId, tarefaEventos.id), eq(tarefaEventoConvidados.usuarioId, usuarioId), ne(tarefaEventoConvidados.resposta, "nao"))),
            ),
          ),
        ),
      )
      .limit(3000),
    listarFeriados(),
  ]);
  const ocupados: Ocupado[] = [];
  for (const l of linhas) {
    if (!l.horaInicio) continue;
    for (const d of ocorrenciasDoEvento({ data: l.data, dataFim: l.dataFim, recorrencia: lerRecorrenciaEvento(l.recorrencia) }, de, ate))
      ocupados.push({ data: d, horaInicio: l.horaInicio, horaFim: l.horaFim });
  }
  return { ocupados, feriados: new Set(feriadosNoIntervalo(cadastrados, de, ate).keys()) };
}

/** O quadro da tarefa da página (o agendamento é gravado nela) — `null` = tarefa arquivada/excluída. */
export async function tarefaDaPagina(tarefaId: number) {
  const [t] = await getDb().select({ id: tarefas.id, quadroId: tarefas.quadroId, arquivada: tarefas.arquivada }).from(tarefas).where(eq(tarefas.id, tarefaId)).limit(1);
  return t && !t.arquivada ? t : null;
}

/** Quantos agendamentos FUTUROS o mesmo e-mail já tem na página (teto contra abuso). */
export async function agendamentosDoEmail(tarefaId: number, email: string, hoje: string) {
  const [r] = await getDb()
    .select({ n: sql<number>`COUNT(*)` })
    .from(tarefaEventos)
    .where(and(eq(tarefaEventos.tarefaId, tarefaId), sql`${tarefaEventos.data} >= ${hoje}`, sql`instr(${tarefaEventos.descricao}, ${`E-mail: ${email}`}) > 0`));
  return Number(r?.n ?? 0);
}
