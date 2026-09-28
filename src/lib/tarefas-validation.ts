import { z } from "zod";
import { LEMBRETE_MAX_MIN } from "./calendario-core.ts";
import { dataValida, FREQUENCIAS, GATILHOS, ORDENACOES_LISTA, MAX_BLOCOS, MAX_EQUIPES_TAREFA, MAX_MEMBROS_EQUIPE, MAX_NOTA, MAX_TITULO_LINK, MAX_URL, MAX_VALOR_CAMPO, PRIORIDADES, TIPOS_BLOCO, TIPOS_CAMPO, TIPOS_VINCULO } from "./tarefas-core.ts";

/** Validação das TAREFAS (quadros, listas, cartões e etiquetas) — só schema (puro/testável). */

const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => dataValida(d), "Data inválida.");
const id = z.number().int().positive();
const nomeChecklist = z.string().trim().min(1, "Dê um nome ao checklist.").max(80, "Nome com até 80 caracteres.");
const checklistTexto = z.string().trim().min(1, "Escreva o item.").max(300, "Item com até 300 caracteres.");
const ids = (max: number) => z.array(id).max(max).transform((v) => [...new Set(v)]);

export const quadroSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao quadro.").max(80, "Nome com até 80 caracteres."),
  cor: cor.optional(),
  descricao: z.string().trim().max(500, "Descrição com até 500 caracteres.").nullable().optional(),
});
/** O PERÍODO de um quadro mensal: as listas de um dia (só os dias úteis, se pedido). */
export const periodoSchema = z.object({ ano: z.number().int().min(2000).max(2100), mes: z.number().int().min(1).max(12), diasUteis: z.boolean().default(true) });
/**
 * Criar um quadro — em branco ou a partir de um MODELO de quadro (`modeloId`); `periodo` = as listas dos dias do mês;
 * `templatesDe` = copia os TEMPLATES daquele quadro.
 */
export const criarQuadroSchema = quadroSchema.extend({ modeloId: id.nullable().optional(), periodo: periodoSchema.nullable().optional(), templatesDe: id.nullable().optional() });
/** O FORMATO do título automático (`{Campo} - {Campo}`; vazio/null = desligado). */
const formatoTitulo = z
  .string()
  .trim()
  .max(200, "Formato com até 200 caracteres.")
  .nullable()
  .transform((v) => v || null);
export const editarQuadroSchema = quadroSchema.partial().extend({ arquivado: z.boolean().optional(), formatoTitulo: formatoTitulo.optional() });

/** Um CAMPO personalizado do quadro (as opções só valem para o tipo lista). */
export const campoSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, "Dê um nome ao campo.")
      .max(40, "Nome com até 40 caracteres.")
      .refine((n) => !/[{}]/.test(n), "O nome não pode ter chaves { }."),
    tipo: z.enum(TIPOS_CAMPO),
    opcoes: z.array(z.string().trim().min(1).max(60, "Opção com até 60 caracteres.")).max(50, "Até 50 opções.").default([]),
    noCartao: z.boolean().default(false),
  })
  .refine((c) => c.tipo !== "lista" || c.opcoes.length > 0, { message: "Informe as opções da lista.", path: ["opcoes"] })
  .transform((c) => ({ ...c, opcoes: c.tipo === "lista" ? [...new Set(c.opcoes)] : [] }));
/** A ordem NOVA dos campos do quadro (todos, sem repetir). */
export const ordemCamposSchema = z.object({ ids: z.array(id).min(1).max(50) }).refine((v) => new Set(v.ids).size === v.ids.length, "Campo repetido.");
/** Os VALORES dos campos numa tarefa (`null` = tira) — conferidos contra os campos do quadro na rota. */
const valoresCampos = z
  .array(z.object({ campoId: id, valor: z.string().max(MAX_VALOR_CAMPO).nullable() }))
  .max(50)
  .refine((l) => new Set(l.map((v) => v.campoId)).size === l.length, "Campo repetido.");

export const listaSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à lista.").max(60, "Nome com até 60 caracteres."),
  limiteWip: z.number().int().min(1).max(999).nullable().optional(),
  concluida: z.boolean().optional(),
});
/** Criar uma lista — no fim do quadro, ou logo depois de outra (`aposId` — a cópia de uma lista fica ao lado dela). */
export const criarListaSchema = listaSchema.extend({ aposId: id.optional() });
/** ORDENAR os cartões de uma lista por um critério (renumera a lista). */
export const ordenarListaSchema = z.object({ por: z.enum(ORDENACOES_LISTA) });
export const editarListaSchema = listaSchema.partial().extend({ arquivada: z.boolean().optional() });
/** A ordem NOVA das listas do quadro (todas, sem repetir). */
export const ordemListasSchema = z.object({ ids: z.array(id).min(1).max(100) }).refine((v) => new Set(v.ids).size === v.ids.length, "Lista repetida.");

export const etiquetaSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à etiqueta.").max(30, "Nome com até 30 caracteres."),
  cor,
});

/** Uma EQUIPE do quadro: nome, cor e as pessoas (do grupo do quadro — conferidas na rota). */
export const equipeSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à equipe.").max(60, "Nome com até 60 caracteres."),
  cor,
  membros: ids(MAX_MEMBROS_EQUIPE),
});

/** A regra de REPETIÇÃO (`Recorrencia`, `tarefas-core`). */
export const recorrenciaSchema = z.object({
  freq: z.enum(FREQUENCIAS),
  intervalo: z.number().int().min(1, "Intervalo de 1 a 365.").max(365, "Intervalo de 1 a 365."),
  dias: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  base: z.enum(["prazo", "conclusao"]),
});

const idBloco = z.string().regex(/^[A-Za-z0-9_-]{1,20}$/, "Bloco inválido.");
/** Os BLOCOS da tarefa (a ordem + o conteúdo das notas e links); sem repetir id nem bloco único. */
export const blocosSchema = z
  .array(
    z.discriminatedUnion("tipo", [
      z.object({ id: idBloco, tipo: z.literal("nota"), texto: z.string().trim().max(MAX_NOTA, `Nota com até ${MAX_NOTA} caracteres.`) }),
      z.object({
        id: idBloco,
        tipo: z.literal("link"),
        url: z
          .string()
          .trim()
          .max(MAX_URL)
          .refine((u) => /^https?:\/\/[^\s]+$/i.test(u), "Informe um endereço http(s)."),
        titulo: z.string().trim().max(MAX_TITULO_LINK),
      }),
      z.object({ id: idBloco, tipo: z.enum(TIPOS_BLOCO.filter((t) => t !== "nota" && t !== "link") as [string, ...string[]]) }),
    ]),
  )
  .max(MAX_BLOCOS, `Até ${MAX_BLOCOS} blocos.`)
  .refine((l) => new Set(l.map((b) => b.id)).size === l.length, "Bloco repetido.")
  .refine((l) => {
    const unicos = l.filter((b) => b.tipo !== "nota" && b.tipo !== "link").map((b) => b.tipo);
    return new Set(unicos).size === unicos.length;
  }, "Bloco repetido.");

/** Teto de convidados por evento. */
export const MAX_CONVIDADOS = 50;
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM).");
/** Um EVENTO da tarefa (bloco "Eventos"): dia inteiro ou com horário (o fim, se houver, depois do início). */
export const eventoSchema = z
  .object({
    titulo: z.string().trim().min(1, "Dê um título ao evento.").max(120, "Título com até 120 caracteres."),
    data,
    dataFim: data.nullable().optional(),
    diaInteiro: z.boolean(),
    horaInicio: hora.nullable(),
    horaFim: hora.nullable(),
    local: z.string().trim().max(120, "Local com até 120 caracteres.").nullable(),
    descricao: z.string().trim().max(2000, "Descrição com até 2.000 caracteres.").nullable(),
    cor: cor.nullable(),
    lembreteMin: z.number().int().min(0).max(LEMBRETE_MAX_MIN, "Lembrete de até 1 semana antes.").nullable().optional(),
    recorrencia: z
      .object({
        freq: z.enum(FREQUENCIAS),
        intervalo: z.number().int().min(1, "Intervalo de 1 a 365.").max(365, "Intervalo de 1 a 365."),
        dias: z.array(z.number().int().min(0).max(6)).max(7),
        ate: data.nullable(),
      })
      .nullable()
      .optional(),
    linkReuniao: z
      .string()
      .trim()
      .max(500, "Link com até 500 caracteres.")
      .refine((u) => !u || /^https:\/\/[^\s]+$/i.test(u), "Use um link https://.")
      .nullable()
      .optional(),
    ocupado: z.boolean().optional(),
    privado: z.boolean().optional(),
    convidados: ids(MAX_CONVIDADOS).optional(),
  })
  .refine((e) => !e.recorrencia?.ate || e.recorrencia.ate >= e.data, { message: "A repetição termina antes do evento.", path: ["recorrencia"] })
  .refine((e) => !e.dataFim || e.dataFim >= e.data, { message: "A data final tem de ser igual ou depois da data.", path: ["dataFim"] })
  .refine((e) => e.diaInteiro || e.horaInicio != null, { message: "Informe a hora de início (ou marque dia inteiro).", path: ["horaInicio"] })
  // No MESMO dia o fim vem depois do início; em vários dias (data final depois da data) qualquer hora de fim vale.
  .refine((e) => e.diaInteiro || !e.horaInicio || !e.horaFim || (e.dataFim != null && e.dataFim > e.data) || e.horaFim > e.horaInicio, {
    message: "O fim tem de ser depois do início.",
    path: ["horaFim"],
  })
  .transform((e) => ({
    ...e,
    horaInicio: e.diaInteiro ? null : e.horaInicio,
    horaFim: e.diaInteiro ? null : e.horaFim,
    dataFim: e.dataFim && e.dataFim > e.data ? e.dataFim : null,
    local: e.local || null,
    descricao: e.descricao || null,
    lembreteMin: e.lembreteMin ?? null,
    recorrencia: e.recorrencia ? { ...e.recorrencia, dias: e.recorrencia.freq === "semanal" ? [...new Set(e.recorrencia.dias)].sort() : [] } : null,
    linkReuniao: e.linkReuniao || null,
    ocupado: e.ocupado ?? true,
    privado: e.privado ?? false,
    convidados: e.convidados ?? [],
  }));
/** A RESPOSTA de um convidado. */
export const respostaConviteSchema = z.object({ resposta: z.enum(["sim", "nao", "talvez"]) });
/** Teto de eventos por tarefa. */
export const MAX_EVENTOS_TAREFA = 100;

const camposTarefa = {
  titulo: z.string().trim().min(1, "Dê um título à tarefa.").max(200, "Título com até 200 caracteres."),
  descricao: z.string().max(10_000, "Descrição com até 10.000 caracteres.").nullable().optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  inicio: data.nullable().optional(),
  prazo: data.nullable().optional(),
  /** Hora do prazo (NULL = o dia inteiro). */
  prazoHora: hora.nullable().optional(),
  /** Lembrete: minutos antes do prazo (NULL = sem lembrete). */
  lembreteMin: z.number().int().min(0).max(LEMBRETE_MAX_MIN, "Lembrete de até 1 semana antes.").nullable().optional(),
  pessoas: ids(20).optional(),
  observadores: ids(20).optional(),
  etiquetas: ids(20).optional(),
  equipes: ids(MAX_EQUIPES_TAREFA).optional(),
  estimativaH: z.number().min(0).max(9999).nullable().optional(),
  vinculo: z.object({ tipo: z.enum(TIPOS_VINCULO), id }).nullable().optional(),
  recorrencia: recorrenciaSchema.nullable().optional(),
  blocos: blocosSchema.optional(),
  campos: valoresCampos.optional(),
  /** true = o título foi escrito à mão (o automático não o troca); false = volta ao automático. */
  tituloManual: z.boolean().optional(),
};
const inicioAntesDoPrazo = (v: { inicio?: string | null; prazo?: string | null }) => !v.inicio || !v.prazo || v.inicio <= v.prazo;
const MSG_DATAS = { message: "O início não pode ser depois do prazo.", path: ["prazo"] };

export const criarTarefaSchema = z
  .object({
    quadroId: id,
    listaId: id,
    ...camposTarefa,
    /** Os checklists nomeados da tarefa nova (itens desmarcados). */
    checklists: z.array(z.object({ nome: nomeChecklist, itens: z.array(checklistTexto).max(100) })).max(20).optional(),
    eventos: z.array(eventoSchema).max(MAX_EVENTOS_TAREFA).optional(),
  })
  .refine(inicioAntesDoPrazo, MSG_DATAS);
export const editarTarefaSchema = z
  .object({
    ...camposTarefa,
    titulo: camposTarefa.titulo.optional(),
    listaId: id.optional(),
    arquivada: z.boolean().optional(),
    /** Concluir/reabrir NO LUGAR (sem mudar de lista). */
    concluida: z.boolean().optional(),
  })
  .refine(inicioAntesDoPrazo, MSG_DATAS);

/** MOVER um cartão: a lista de destino e os VIZINHOS onde ele caiu (`null` = ponta) — o servidor calcula a ordem. */
export const moverTarefaSchema = z.object({ listaId: id, anteriorId: id.nullable(), proximoId: id.nullable() });

/** Um item do CHECKLIST (criar — no checklist dado; sem ele, no 1º da tarefa). */
export const checklistSchema = z.object({ texto: checklistTexto, checklistId: id.optional() });
export const editarChecklistSchema = z
  .object({
    texto: checklistTexto.optional(),
    feito: z.boolean().optional(),
    anteriorId: id.nullable().optional(),
    proximoId: id.nullable().optional(),
    /** Prazo e responsável próprios do item (null = tira). */
    prazo: data.nullable().optional(),
    responsavelId: id.nullable().optional(),
  })
  .refine(
    (v) => v.texto != null || v.feito != null || v.anteriorId !== undefined || v.proximoId !== undefined || v.prazo !== undefined || v.responsavelId !== undefined,
    "Nada a alterar.",
  );
/** Um CHECKLIST nomeado (criar/renomear). */
export const checklistNomeSchema = z.object({ nome: nomeChecklist });

export const comentarioSchema = z.object({
  texto: z.string().trim().min(1, "Escreva o comentário.").max(5000, "Comentário com até 5.000 caracteres."),
});

/** EDIÇÃO EM MASSA (aba Lista): até 50 tarefas por chamada. */
export const massaTarefasSchema = z.object({
  ids: z
    .array(id)
    .min(1)
    .max(50)
    .transform((v) => [...new Set(v)]),
  acao: z.discriminatedUnion("campo", [
    z.object({ campo: z.literal("lista"), listaId: id }),
    z.object({ campo: z.literal("responsavel"), modo: z.enum(["adicionar", "remover"]), usuarioId: id }),
    z.object({ campo: z.literal("etiqueta"), modo: z.enum(["adicionar", "remover"]), etiquetaId: id }),
    z.object({ campo: z.literal("equipe"), modo: z.enum(["adicionar", "remover"]), equipeId: id }),
    z.object({ campo: z.literal("prazo"), prazo: data.nullable() }),
    z.object({ campo: z.literal("prioridade"), prioridade: z.enum(PRIORIDADES) }),
    z.object({ campo: z.literal("arquivar"), arquivada: z.boolean() }),
  ]),
});
export type AcaoMassaTarefas = z.infer<typeof massaTarefasSchema>["acao"];

/** Marcar notificações como LIDAS: as pedidas ou todas. */
export const notificacoesPatchSchema = z.union([z.object({ ids: z.array(id).min(1).max(90) }), z.object({ todas: z.literal(true) })]);

const nomeModelo = z.string().trim().min(1, "Dê um nome ao modelo.").max(80, "Nome com até 80 caracteres.");
/** Salvar um MODELO de quadro (retrato das listas/etiquetas do quadro). Os de TAREFA viraram cartões-TEMPLATE (`0055`). */
export const modeloSchema = z.object({ tipo: z.literal("quadro"), nome: nomeModelo, quadroId: id });

/**
 * COPIAR uma tarefa (também "Criar template" e "Criar a partir do template"): o quadro e a lista de destino, a posição, o
 * título (vazio = o da origem) e o que vai junto.
 */
export const copiarTarefaSchema = z.object({
  quadroId: id,
  listaId: id,
  titulo: z.string().trim().max(200, "Título com até 200 caracteres.").optional(),
  noInicio: z.boolean().optional(),
  template: z.boolean().optional(),
  checklists: z.boolean().default(true),
  etiquetas: z.boolean().default(true),
  pessoas: z.boolean().default(true),
  datas: z.boolean().default(true),
});
/** MOVER uma tarefa para OUTRO quadro (a lista de destino). */
export const moverQuadroSchema = z.object({ quadroId: id, listaId: id });

/** Uma AUTOMAÇÃO do quadro ("quando X, fazer Y"). */
export const automacaoSchema = z
  .object({
    gatilho: z.enum(GATILHOS),
    listaId: id.nullable().optional(),
    acao: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("mover_lista"), listaId: id }),
      z.object({ tipo: z.literal("atribuir"), usuarioId: id }),
      z.object({ tipo: z.literal("etiquetar"), etiquetaId: id }),
      z.object({ tipo: z.literal("prioridade"), prioridade: z.enum(PRIORIDADES) }),
      z.object({ tipo: z.literal("notificar") }),
    ]),
  })
  .refine((v) => v.gatilho !== "entrar_lista" || v.listaId != null, { message: "Escolha a lista.", path: ["listaId"] });
export const editarAutomacaoSchema = z.object({ ativa: z.boolean() });

// ─── Agendas externas (migração `0049`) ─────────────────────────────────────────────────────────────────────

export const externoSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à agenda.").max(60, "Nome com até 60 caracteres."),
  url: z.string().trim().min(8, "Cole o link da agenda.").max(1000, "Link longo demais."),
  cor: cor.nullable().default(null),
});
export const editarExternoSchema = z.object({ nome: externoSchema.shape.nome.optional(), cor: cor.nullable().optional() }).refine((v) => v.nome !== undefined || v.cor !== undefined, "Nada a alterar.");
