import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import {
  notificacoes,
  tarefaChecklist,
  tarefaEtiquetaLinks,
  tarefaEtiquetas,
  tarefaListas,
  tarefaPessoas,
  tarefaQuadros,
  tarefas,
} from "../db/schema.ts";
import type { ModeloQuadro, Prioridade, Recorrencia, TipoNotificacao, TipoVinculo } from "./tarefas-core.ts";
import type { AcaoMassaTarefas } from "./tarefas-validation.ts";

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
    observadores?: number[];
    etiquetas: number[];
    criadoPor: number;
    estimativaH?: number | null;
    vinculo?: { tipo: TipoVinculo; id: number } | null;
    recorrencia?: Recorrencia | null;
    /** A ocorrência anterior da série (ÚNICA — a 2ª tentativa de gerar a mesma próxima derruba o lote inteiro). */
    recorrenciaAnteriorId?: number | null;
    /** Itens do checklist (desmarcados), na ordem. */
    checklist?: string[];
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
      estimativaH: d.estimativaH ?? null,
      vinculoTipo: d.vinculo?.tipo ?? null,
      vinculoId: d.vinculo?.id ?? null,
      recorrencia: d.recorrencia ? JSON.stringify(d.recorrencia) : null,
      recorrenciaAnteriorId: d.recorrenciaAnteriorId ?? null,
    }),
    ...d.pessoas.map((u) => db.insert(tarefaPessoas).values({ tarefaId: idDaNova(d.quadroId), usuarioId: u })),
    // Observador que também é responsável fica só responsável (a chave é tarefa + pessoa).
    ...(d.observadores ?? [])
      .filter((u) => !d.pessoas.includes(u))
      .map((u) => db.insert(tarefaPessoas).values({ tarefaId: idDaNova(d.quadroId), usuarioId: u, papel: "observador" })),
    ...d.etiquetas.map((e) => db.insert(tarefaEtiquetaLinks).values({ tarefaId: idDaNova(d.quadroId), etiquetaId: e })),
    ...(d.checklist ?? []).map((texto, i) => db.insert(tarefaChecklist).values({ tarefaId: idDaNova(d.quadroId), texto, ordem: i + 1 })),
    db
      .select({ id: tarefas.id, ticket: tarefas.ticket })
      .from(tarefas)
      .where(and(eq(tarefas.quadroId, d.quadroId), eq(tarefas.ticket, sql`(SELECT prox_ticket - 1 FROM tarefa_quadros WHERE id = ${d.quadroId})`))),
  ] as const;
}

/**
 * TROCA os responsáveis, os observadores e/ou as etiquetas de UMA tarefa (apaga e liga de novo — `undefined` = não mexe).
 * A pessoa é responsável OU observadora (a chave é tarefa + pessoa): virar responsável tira da observação; um observador
 * que já é responsável fica responsável.
 */
export function comandosVinculos(db: Db, tarefaId: number, v: { pessoas?: number[]; observadores?: number[]; etiquetas?: number[] }) {
  return [
    ...(v.pessoas
      ? [
          db.delete(tarefaPessoas).where(and(eq(tarefaPessoas.tarefaId, tarefaId), eq(tarefaPessoas.papel, "responsavel"))),
          ...v.pessoas.map((u) =>
            db
              .insert(tarefaPessoas)
              .values({ tarefaId, usuarioId: u })
              .onConflictDoUpdate({ target: [tarefaPessoas.tarefaId, tarefaPessoas.usuarioId], set: { papel: "responsavel" } }),
          ),
        ]
      : []),
    ...(v.observadores
      ? [
          db.delete(tarefaPessoas).where(and(eq(tarefaPessoas.tarefaId, tarefaId), eq(tarefaPessoas.papel, "observador"))),
          ...v.observadores.map((u) => db.insert(tarefaPessoas).values({ tarefaId, usuarioId: u, papel: "observador" }).onConflictDoNothing()),
        ]
      : []),
    ...(v.etiquetas
      ? [
          db.delete(tarefaEtiquetaLinks).where(eq(tarefaEtiquetaLinks.tarefaId, tarefaId)),
          ...v.etiquetas.map((e) => db.insert(tarefaEtiquetaLinks).values({ tarefaId, etiquetaId: e })),
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

/**
 * EDIÇÃO EM MASSA de VÁRIAS tarefas (ids já conferidos pelo chamador) num lote atômico. Mover de lista leva cada uma ao
 * FIM da lista de destino, na ordem dos ids (o lote é sequencial — cada uma lê o MAX da anterior), e a conclusão segue a
 * lista (`listaConcluida`).
 */
export function comandosMassa(db: Db, ids: number[], acao: AcaoMassaTarefas, listaConcluida = false) {
  const agora = sql`(CURRENT_TIMESTAMP)`;
  const tocar = db.update(tarefas).set({ atualizadoEm: agora }).where(inArray(tarefas.id, ids));
  switch (acao.campo) {
    case "lista":
      return ids.map((id) =>
        db
          .update(tarefas)
          .set({
            listaId: acao.listaId,
            ordem: sql`(SELECT COALESCE(MAX(t.ordem), 0) + 1 FROM tarefas t WHERE t.lista_id = ${acao.listaId} AND t.id <> ${id})`,
            concluidaEm: listaConcluida ? sql`COALESCE(${tarefas.concluidaEm}, CURRENT_TIMESTAMP)` : null,
            atualizadoEm: agora,
          })
          .where(and(eq(tarefas.id, id), sql`${tarefas.listaId} <> ${acao.listaId}`)),
      );
    case "responsavel":
      return acao.modo === "adicionar"
        ? [
            ...ids.map((id) =>
              db
                .insert(tarefaPessoas)
                .values({ tarefaId: id, usuarioId: acao.usuarioId })
                .onConflictDoUpdate({ target: [tarefaPessoas.tarefaId, tarefaPessoas.usuarioId], set: { papel: "responsavel" } }),
            ),
            tocar,
          ]
        : [
            db
              .delete(tarefaPessoas)
              .where(and(inArray(tarefaPessoas.tarefaId, ids), eq(tarefaPessoas.usuarioId, acao.usuarioId), eq(tarefaPessoas.papel, "responsavel"))),
            tocar,
          ];
    case "etiqueta":
      return acao.modo === "adicionar"
        ? [...ids.map((id) => db.insert(tarefaEtiquetaLinks).values({ tarefaId: id, etiquetaId: acao.etiquetaId }).onConflictDoNothing()), tocar]
        : [db.delete(tarefaEtiquetaLinks).where(and(inArray(tarefaEtiquetaLinks.tarefaId, ids), eq(tarefaEtiquetaLinks.etiquetaId, acao.etiquetaId))), tocar];
    case "prazo":
      return [db.update(tarefas).set({ prazo: acao.prazo, atualizadoEm: agora }).where(inArray(tarefas.id, ids))];
    case "prioridade":
      return [db.update(tarefas).set({ prioridade: acao.prioridade, atualizadoEm: agora }).where(inArray(tarefas.id, ids))];
    case "arquivar":
      return [db.update(tarefas).set({ arquivada: acao.arquivada, atualizadoEm: agora }).where(inArray(tarefas.id, ids))];
  }
}

/** O id do quadro recém-criado DENTRO do lote (o lote do D1 é uma transação sequencial). */
const quadroNovo = sql`(SELECT MAX(id) FROM tarefa_quadros)`;

/**
 * CRIA um quadro a partir de um MODELO num lote atômico: o quadro + as listas (na ordem) + as etiquetas. O último comando
 * devolve `[{ id }]`.
 */
export function comandosCriarQuadroDoModelo(
  db: Db,
  d: { grupoId: number; nome: string; cor: string; descricao: string | null; criadoPor: number },
  m: ModeloQuadro,
) {
  return [
    db.insert(tarefaQuadros).values({ grupoId: d.grupoId, nome: d.nome, cor: d.cor, descricao: d.descricao, criadoPor: d.criadoPor }),
    ...m.listas.map((l, i) => db.insert(tarefaListas).values({ quadroId: quadroNovo, nome: l.nome, limiteWip: l.limiteWip, concluida: l.concluida, ordem: i + 1 })),
    ...m.etiquetas.map((e, i) => db.insert(tarefaEtiquetas).values({ quadroId: quadroNovo, nome: e.nome, cor: e.cor, ordem: i + 1 })),
    db.select({ id: tarefaQuadros.id }).from(tarefaQuadros).where(eq(tarefaQuadros.id, quadroNovo)),
  ] as const;
}

export type NovaNotificacao = {
  usuarioId: number;
  tipo: TipoNotificacao;
  titulo: string;
  texto?: string | null;
  link?: string | null;
  tarefaId?: number | null;
  quadroId?: number | null;
  atorId?: number | null;
  atorNome?: string | null;
  /** Dedup (as DERIVADAS de prazo): repetida = ignorada. */
  chave?: string | null;
};
/** Linhas por INSERT (10 colunas × 9 = 90 parâmetros — abaixo do limite de 100 do D1). */
const NOTIF_POR_INSERT = 9;

/** GRAVA notificações (em lotes de 9 linhas por comando); a de `chave` repetida para a mesma pessoa é ignorada. */
export function comandosNotificacoes(db: Db, linhas: NovaNotificacao[]) {
  const cmds = [];
  for (let i = 0; i < linhas.length; i += NOTIF_POR_INSERT)
    cmds.push(
      db
        .insert(notificacoes)
        .values(
          linhas.slice(i, i + NOTIF_POR_INSERT).map((n) => ({
            usuarioId: n.usuarioId,
            tipo: n.tipo,
            titulo: n.titulo.slice(0, 200),
            texto: n.texto?.slice(0, 500) ?? null,
            link: n.link ?? null,
            tarefaId: n.tarefaId ?? null,
            quadroId: n.quadroId ?? null,
            atorId: n.atorId ?? null,
            atorNome: n.atorNome ?? null,
            chave: n.chave ?? null,
          })),
        )
        .onConflictDoNothing(),
    );
  return cmds;
}
