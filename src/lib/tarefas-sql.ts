import { and, eq, inArray, notInArray, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import {
  notificacoes,
  tarefaChecklist,
  tarefaChecklists,
  tarefaEquipeMembros,
  tarefaEquipes,
  tarefaEquipesLinks,
  tarefaEtiquetaLinks,
  tarefaEtiquetas,
  tarefaEventoConvidados,
  tarefaEventos,
  tarefaListas,
  tarefaPessoas,
  tarefaQuadros,
  tarefas,
} from "../db/schema.ts";
import { type BlocoTarefa, blocosParaGravar, type DadosEvento, type ModeloQuadro, type Prioridade, type Recorrencia, type TipoNotificacao, type TipoVinculo } from "./tarefas-core.ts";
import type { AcaoMassaTarefas } from "./tarefas-validation.ts";

type Db = DrizzleD1Database<typeof schema>;

/** Os campos de um evento como a tabela grava (dia inteiro não guarda hora). */
export const colunasEvento = (e: DadosEvento) => ({
  titulo: e.titulo,
  data: e.data,
  dataFim: e.dataFim && e.dataFim > e.data ? e.dataFim : null,
  diaInteiro: e.diaInteiro,
  horaInicio: e.diaInteiro ? null : e.horaInicio,
  horaFim: e.diaInteiro ? null : e.horaFim,
  local: e.local,
  descricao: e.descricao,
  cor: e.cor,
  lembreteMin: e.lembreteMin,
  recorrencia: e.recorrencia ? JSON.stringify(e.recorrencia) : null,
  linkReuniao: e.linkReuniao,
  ocupado: e.ocupado,
  privado: e.privado,
});

/** Convidados por INSERT: cada linha liga 3 parâmetros (evento, pessoa, resposta padrão) — 30 × 3 = 90 < 100 do D1. */
export const LOTE_CONVIDADOS = 30;
/** O evento recém-inserido NO MESMO lote (o `db.batch` do D1 é uma transação sequencial). */
const ultimoEvento = sql`(SELECT MAX(id) FROM tarefa_eventos)`;

/** Liga os CONVIDADOS ao evento em INSERTs de até `LOTE_CONVIDADOS` (quem já está mantém a resposta). */
export function comandosConvidados(db: Db, eventoId: number | SQL, ids: number[]) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE_CONVIDADOS)
    out.push(
      db
        .insert(tarefaEventoConvidados)
        .values(ids.slice(i, i + LOTE_CONVIDADOS).map((usuarioId) => ({ eventoId, usuarioId })))
        .onConflictDoNothing(),
    );
  return out;
}

/** CRIA o evento e os convidados num lote ATÔMICO (nada fica pela metade); o último comando devolve `{ id }`. */
export function comandosCriarEvento(db: Db, tarefaId: number, d: DadosEvento, criadoPor: number) {
  return [
    db.insert(tarefaEventos).values({ tarefaId, ...colunasEvento(d), criadoPor }),
    ...comandosConvidados(db, ultimoEvento, d.convidados),
    db.select({ id: tarefaEventos.id }).from(tarefaEventos).where(eq(tarefaEventos.id, ultimoEvento)),
  ] as const;
}

/** GRAVA o evento e os convidados num lote: os que saíram são tirados; os que ficam mantêm a resposta; os novos entram
 * "pendente". */
export function comandosAtualizarEvento(db: Db, id: number, d: DadosEvento) {
  return [
    db
      .update(tarefaEventos)
      .set({ ...colunasEvento(d), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(tarefaEventos.id, id)),
    db
      .delete(tarefaEventoConvidados)
      .where(and(eq(tarefaEventoConvidados.eventoId, id), d.convidados.length ? notInArray(tarefaEventoConvidados.usuarioId, d.convidados) : undefined)),
    ...comandosConvidados(db, id, d.convidados),
  ];
}

/**
 * TAREFAS — os comandos de ESCRITA em lote como BUILDERS do Drizzle (sem getDb: testados pelo driver D1 REAL dentro de
 * `db.batch`). Nada de `db.run(sql…)` no lote (quebra no driver do D1).
 */

/** O id da tarefa recém-criada no quadro (o último ticket emitido) — usado DENTRO do mesmo lote. */
const idDaNova = (quadroId: number): SQL<number> =>
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
    prazoHora?: string | null;
    lembreteMin?: number | null;
    concluida: boolean;
    pessoas: number[];
    observadores?: number[];
    etiquetas: number[];
    /** As EQUIPES do quadro atribuídas (migração `0052`). */
    equipes?: number[];
    criadoPor: number;
    estimativaH?: number | null;
    vinculo?: { tipo: TipoVinculo; id: number } | null;
    recorrencia?: Recorrencia | null;
    /** A ocorrência anterior da série (ÚNICA — a 2ª tentativa de gerar a mesma próxima derruba o lote inteiro). */
    recorrenciaAnteriorId?: number | null;
    /** Os CHECKLISTS nomeados, com os itens (desmarcados), na ordem. */
    checklists?: ChecklistNovo[];
    /** Os blocos da tarefa (a ordem + notas e links). */
    blocos?: BlocoTarefa[] | null;
    /** Os EVENTOS da tarefa (bloco "Eventos"). */
    eventos?: DadosEvento[];
    /** Etiquetas a CRIAR no quadro e ligar à tarefa (a cópia para outro quadro — `mapearEtiquetas`). */
    novasEtiquetas?: { nome: string; cor: string }[];
    /** O cartão nasce TEMPLATE (migração `0055`). */
    template?: boolean;
    /** A tarefa de origem (cópia). */
    copiadaDe?: number | null;
    /** No TOPO da lista (senão no fim). */
    noInicio?: boolean;
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
      prazoHora: d.prazo ? (d.prazoHora ?? null) : null,
      lembreteMin: d.prazo ? (d.lembreteMin ?? null) : null,
      ordem: d.noInicio
        ? sql`(SELECT COALESCE(MIN(ordem), 1) - 1 FROM tarefas WHERE lista_id = ${d.listaId})`
        : sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefas WHERE lista_id = ${d.listaId})`,
      concluidaEm: d.concluida && !d.template ? sql`(CURRENT_TIMESTAMP)` : null,
      template: d.template ?? false,
      copiadaDe: d.copiadaDe ?? null,
      criadoPor: d.criadoPor,
      estimativaH: d.estimativaH ?? null,
      vinculoTipo: d.vinculo?.tipo ?? null,
      vinculoId: d.vinculo?.id ?? null,
      recorrencia: d.recorrencia ? JSON.stringify(d.recorrencia) : null,
      recorrenciaAnteriorId: d.recorrenciaAnteriorId ?? null,
      blocos: d.blocos ? JSON.stringify(blocosParaGravar(d.blocos)) : null,
    }),
    ...d.pessoas.map((u) => db.insert(tarefaPessoas).values({ tarefaId: idDaNova(d.quadroId), usuarioId: u })),
    // Observador que também é responsável fica só responsável (a chave é tarefa + pessoa).
    ...(d.observadores ?? [])
      .filter((u) => !d.pessoas.includes(u))
      .map((u) => db.insert(tarefaPessoas).values({ tarefaId: idDaNova(d.quadroId), usuarioId: u, papel: "observador" })),
    ...d.etiquetas.map((e) => db.insert(tarefaEtiquetaLinks).values({ tarefaId: idDaNova(d.quadroId), etiquetaId: e })),
    ...(d.equipes ?? []).map((e) => db.insert(tarefaEquipesLinks).values({ tarefaId: idDaNova(d.quadroId), equipeId: e })),
    ...comandosNovasEtiquetas(db, d.quadroId, idDaNova(d.quadroId), d.novasEtiquetas ?? []),
    ...(d.checklists ?? []).flatMap((c, k) => comandosChecklistNovo(db, idDaNova(d.quadroId), c, k + 1)),
    ...(d.eventos ?? []).flatMap((e) => [
      db.insert(tarefaEventos).values({ tarefaId: idDaNova(d.quadroId), ...colunasEvento(e), criadoPor: d.criadoPor }),
      ...comandosConvidados(db, ultimoEvento, e.convidados ?? []),
    ]),
    db
      .select({ id: tarefas.id, ticket: tarefas.ticket })
      .from(tarefas)
      .where(and(eq(tarefas.quadroId, d.quadroId), eq(tarefas.ticket, sql`(SELECT prox_ticket - 1 FROM tarefa_quadros WHERE id = ${d.quadroId})`))),
  ] as const;
}

/** CRIA etiquetas no quadro (no fim da ordem) e liga cada uma à tarefa (a recém-criada — `MAX(id)`, lote sequencial). */
function comandosNovasEtiquetas(db: Db, quadroId: number, tarefaId: number | SQL<number>, novas: { nome: string; cor: string }[]) {
  return novas.flatMap((e) => [
    db.insert(tarefaEtiquetas).values({
      quadroId,
      nome: e.nome,
      cor: e.cor,
      ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_etiquetas WHERE quadro_id = ${quadroId})`,
    }),
    db.insert(tarefaEtiquetaLinks).values({ tarefaId, etiquetaId: sql`(SELECT MAX(id) FROM tarefa_etiquetas WHERE quadro_id = ${quadroId})` }),
  ]);
}

/**
 * MOVE a tarefa para OUTRO quadro num lote atômico: ganha o próximo TICKET do destino, vai ao FIM da lista escolhida (a
 * conclusão segue a lista, como no movimento), troca as etiquetas pelas do destino (`etiquetas` + `novasEtiquetas` — o
 * mapeamento por nome), fica só com as PESSOAS que ficam (`pessoas` — as do grupo do destino) e as EQUIPES de mesmo nome.
 * Checklists, comentários, eventos e o histórico vão junto (são da tarefa).
 */
export function comandosMoverQuadro(
  db: Db,
  d: { id: number; quadroId: number; listaId: number; concluida: boolean; etiquetas: number[]; novasEtiquetas: { nome: string; cor: string }[]; pessoas: number[]; equipes: number[] },
) {
  return [
    db
      .update(tarefaQuadros)
      .set({ proxTicket: sql`${tarefaQuadros.proxTicket} + 1` })
      .where(eq(tarefaQuadros.id, d.quadroId)),
    db
      .update(tarefas)
      .set({
        quadroId: d.quadroId,
        listaId: d.listaId,
        ticket: sql`(SELECT prox_ticket - 1 FROM tarefa_quadros WHERE id = ${d.quadroId})`,
        ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefas WHERE lista_id = ${d.listaId})`,
        concluidaEm: conclusaoAoMoverSql(d.concluida),
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(tarefas.id, d.id)),
    db.delete(tarefaEtiquetaLinks).where(eq(tarefaEtiquetaLinks.tarefaId, d.id)),
    ...d.etiquetas.map((e) => db.insert(tarefaEtiquetaLinks).values({ tarefaId: d.id, etiquetaId: e })),
    ...comandosNovasEtiquetas(db, d.quadroId, d.id, d.novasEtiquetas),
    db
      .delete(tarefaPessoas)
      .where(d.pessoas.length ? and(eq(tarefaPessoas.tarefaId, d.id), notInArray(tarefaPessoas.usuarioId, d.pessoas)) : eq(tarefaPessoas.tarefaId, d.id)),
    db.delete(tarefaEquipesLinks).where(eq(tarefaEquipesLinks.tarefaId, d.id)),
    ...d.equipes.map((e) => db.insert(tarefaEquipesLinks).values({ tarefaId: d.id, equipeId: e })),
    db.select({ id: tarefas.id, ticket: tarefas.ticket }).from(tarefas).where(eq(tarefas.id, d.id)),
  ] as const;
}

/**
 * TROCA os responsáveis, os observadores e/ou as etiquetas de UMA tarefa (apaga e liga de novo — `undefined` = não mexe).
 * A pessoa é responsável OU observadora (a chave é tarefa + pessoa): virar responsável tira da observação; um observador
 * que já é responsável fica responsável.
 */
export function comandosVinculos(db: Db, tarefaId: number, v: { pessoas?: number[]; observadores?: number[]; etiquetas?: number[]; equipes?: number[] }) {
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
    ...(v.equipes
      ? [
          db.delete(tarefaEquipesLinks).where(eq(tarefaEquipesLinks.tarefaId, tarefaId)),
          ...v.equipes.map((e) => db.insert(tarefaEquipesLinks).values({ tarefaId, equipeId: e })),
        ]
      : []),
  ];
}

/**
 * "A pessoa é da tarefa" em SQL (sobre `tarefas`): responsável (ou observador, com `observador`) OU membro de uma equipe
 * da tarefa — a MESMA régua de `envolvidos`.
 */
export const pessoaNaTarefa = (usuarioId: number, observador = false) =>
  sql`(EXISTS (SELECT 1 FROM tarefa_pessoas tp WHERE tp.tarefa_id = ${tarefas.id} AND tp.usuario_id = ${usuarioId}${observador ? sql`` : sql` AND tp.papel = 'responsavel'`})
    OR EXISTS (SELECT 1 FROM tarefa_equipes_links el JOIN tarefa_equipe_membros em ON em.equipe_id = el.equipe_id WHERE el.tarefa_id = ${tarefas.id} AND em.usuario_id = ${usuarioId}))`;

/** Um checklist a CRIAR: o nome e os itens (desmarcados), na ordem. */
export type ChecklistNovo = { nome: string; itens: string[] };

/** O id do checklist recém-criado DENTRO do lote (o lote do D1 é sequencial). */
const ultimoChecklist = sql<number>`(SELECT MAX(id) FROM tarefa_checklists)`;
/** Itens por INSERT: até 4 parâmetros por linha (a tarefa nova é uma subconsulta com 2, texto, ordem) — 20 × 4 = 80 < 100 do D1. */
const LOTE_ITENS = 20;

/** CRIA um checklist nomeado na tarefa (`tarefaId` pode ser a subconsulta da tarefa nova) com os itens, em lotes. */
export function comandosChecklistNovo(db: Db, tarefaId: number | SQL<number>, c: ChecklistNovo, ordem: number) {
  const lotes: string[][] = [];
  for (let i = 0; i < c.itens.length; i += LOTE_ITENS) lotes.push(c.itens.slice(i, i + LOTE_ITENS));
  return [
    db.insert(tarefaChecklists).values({ tarefaId, nome: c.nome, ordem }),
    ...lotes.map((l, k) =>
      db.insert(tarefaChecklist).values(l.map((texto, i) => ({ tarefaId, checklistId: ultimoChecklist, texto, ordem: k * LOTE_ITENS + i + 1 }))),
    ),
  ];
}

/** Linhas por INSERT de membros (2 parâmetros cada — muito abaixo dos 100 do D1). */
const LOTE_MEMBROS = 30;

/**
 * Cria (sem `id`) ou atualiza uma EQUIPE do quadro e TROCA os membros dela (apaga e insere em lotes de 30) — num lote
 * atômico. Na criação, os membros ligam pela equipe recém-criada (`MAX(id)` — o lote do D1 é sequencial).
 */
export function comandosEquipe(db: Db, d: { id?: number; quadroId: number; nome: string; cor: string; membros: number[] }) {
  const alvo = d.id ?? sql<number>`(SELECT MAX(id) FROM tarefa_equipes WHERE quadro_id = ${d.quadroId})`;
  const membros = [...new Set(d.membros)];
  const lotes: number[][] = [];
  for (let i = 0; i < membros.length; i += LOTE_MEMBROS) lotes.push(membros.slice(i, i + LOTE_MEMBROS));
  return [
    d.id == null
      ? db.insert(tarefaEquipes).values({
          quadroId: d.quadroId,
          nome: d.nome,
          cor: d.cor,
          ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_equipes WHERE quadro_id = ${d.quadroId})`,
        })
      : db.update(tarefaEquipes).set({ nome: d.nome, cor: d.cor }).where(eq(tarefaEquipes.id, d.id)),
    db.delete(tarefaEquipeMembros).where(eq(tarefaEquipeMembros.equipeId, alvo)),
    ...lotes.map((l) => db.insert(tarefaEquipeMembros).values(l.map((u) => ({ equipeId: alvo, usuarioId: u })))),
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
        concluidaEm: conclusaoAoMoverSql(concluida),
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(tarefas.id, id)),
    ...ordens.map(([t, o]) => db.update(tarefas).set({ ordem: o }).where(eq(tarefas.id, t))),
  ];
}

/**
 * A CONCLUSÃO ao mudar de lista, em SQL (a régua de `conclusaoAoMover`): entrar numa lista de concluídas conclui; sair
 * DELA reabre; entre listas comuns, fica (o SET lê a lista de ANTES da mudança).
 */
const conclusaoAoMoverSql = (paraConcluidas: boolean) =>
  paraConcluidas
    ? sql`COALESCE(${tarefas.concluidaEm}, CURRENT_TIMESTAMP)`
    : sql`CASE WHEN (SELECT l.concluida FROM tarefa_listas l WHERE l.id = ${tarefas.listaId}) = 1 THEN NULL ELSE ${tarefas.concluidaEm} END`;

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
            concluidaEm: conclusaoAoMoverSql(listaConcluida),
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
    case "equipe":
      return acao.modo === "adicionar"
        ? [...ids.map((id) => db.insert(tarefaEquipesLinks).values({ tarefaId: id, equipeId: acao.equipeId }).onConflictDoNothing()), tocar]
        : [db.delete(tarefaEquipesLinks).where(and(inArray(tarefaEquipesLinks.tarefaId, ids), eq(tarefaEquipesLinks.equipeId, acao.equipeId))), tocar];
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
