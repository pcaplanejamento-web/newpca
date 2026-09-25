import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { tarefaEtiquetaLinks, tarefaPessoas, tarefaQuadros, tarefas } from "../db/schema.ts";
import type { Prioridade } from "./tarefas-core.ts";

type Db = DrizzleD1Database<typeof schema>;

/**
 * TAREFAS — os comandos de ESCRITA em lote como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 REAL dentro de
 * `db.batch`). Nada de `db.run(sql…)` no lote (quebra no driver do D1).
 */

/** O id da tarefa recém-criada no quadro (o último ticket emitido) — usado DENTRO do mesmo lote. */
const idDaNova = (quadroId: number) =>
  sql`(SELECT id FROM tarefas WHERE quadro_id = ${quadroId} AND ticket = (SELECT prox_ticket - 1 FROM tarefa_quadros WHERE id = ${quadroId}))`;

/**
 * CRIA a tarefa num lote ATÔMICO: reserva o próximo nº de TICKET do quadro, insere o cartão no FIM da lista e liga os
 * responsáveis e as etiquetas. O último comando devolve `{ id, ticket }`.
 */
export function comandosCriarTarefa(
  db: Db,
  d: {
    quadroId: number;
    listaId: number;
    titulo: string;
    descricao: string | null;
    prioridade: Prioridade;
    inicio: string | null;
    prazo: string | null;
    concluida: boolean;
    pessoas: number[];
    etiquetas: number[];
    criadoPor: number;
  },
) {
  return [
    db
      .update(tarefaQuadros)
      .set({ proxTicket: sql`${tarefaQuadros.proxTicket} + 1` })
      .where(eq(tarefaQuadros.id, d.quadroId)),
    db.insert(tarefas).values({
      quadroId: d.quadroId,
      listaId: d.listaId,
      ticket: sql`(SELECT prox_ticket - 1 FROM tarefa_quadros WHERE id = ${d.quadroId})`,
      titulo: d.titulo,
      descricao: d.descricao,
      prioridade: d.prioridade,
      inicio: d.inicio,
      prazo: d.prazo,
      ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefas WHERE lista_id = ${d.listaId})`,
      concluidaEm: d.concluida ? sql`(CURRENT_TIMESTAMP)` : null,
      criadoPor: d.criadoPor,
    }),
    ...d.pessoas.map((u) => db.insert(tarefaPessoas).values({ tarefaId: idDaNova(d.quadroId), usuarioId: u })),
    ...d.etiquetas.map((e) => db.insert(tarefaEtiquetaLinks).values({ tarefaId: idDaNova(d.quadroId), etiquetaId: e })),
    db
      .select({ id: tarefas.id, ticket: tarefas.ticket })
      .from(tarefas)
      .where(and(eq(tarefas.quadroId, d.quadroId), eq(tarefas.ticket, sql`(SELECT prox_ticket - 1 FROM tarefa_quadros WHERE id = ${d.quadroId})`))),
  ] as const;
}

/** TROCA os responsáveis e/ou as etiquetas de UMA tarefa (apaga e liga de novo — `undefined` = não mexe). */
export function comandosVinculos(db: Db, tarefaId: number, pessoas?: number[], etiquetas?: number[]) {
  return [
    ...(pessoas
      ? [
          db.delete(tarefaPessoas).where(and(eq(tarefaPessoas.tarefaId, tarefaId), eq(tarefaPessoas.papel, "responsavel"))),
          ...pessoas.map((u) => db.insert(tarefaPessoas).values({ tarefaId, usuarioId: u }).onConflictDoNothing()),
        ]
      : []),
    ...(etiquetas
      ? [
          db.delete(tarefaEtiquetaLinks).where(eq(tarefaEtiquetaLinks.tarefaId, tarefaId)),
          ...etiquetas.map((e) => db.insert(tarefaEtiquetaLinks).values({ tarefaId, etiquetaId: e })),
        ]
      : []),
  ];
}

/**
 * MOVE o cartão para `listaId` com a `ordem` dada (e, se a lista precisou, RENUMERA a lista inteira na ordem `ordens`).
 * Entrar numa lista de CONCLUÍDAS marca a conclusão (mantém a data se já estava concluída); sair dela desmarca.
 */
export function comandosMover(db: Db, id: number, listaId: number, ordem: number, concluida: boolean, ordens: [number, number][] = []) {
  return [
    db
      .update(tarefas)
      .set({
        listaId,
        ordem,
        concluidaEm: concluida ? sql`COALESCE(${tarefas.concluidaEm}, CURRENT_TIMESTAMP)` : null,
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(tarefas.id, id)),
    ...ordens.map(([t, o]) => db.update(tarefas).set({ ordem: o }).where(eq(tarefas.id, t))),
  ];
}
