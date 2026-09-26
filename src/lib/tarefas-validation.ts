import { z } from "zod";
import { LEMBRETE_MAX_MIN } from "./calendario-core.ts";
import { FREQUENCIAS, GATILHOS, MAX_BLOCOS, MAX_NOTA, MAX_TITULO_LINK, MAX_URL, PRIORIDADES, TIPOS_BLOCO, TIPOS_VINCULO } from "./tarefas-core.ts";

/** Validação das TAREFAS (quadros, listas, cartões e etiquetas) — só schema (puro/testável). */

const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Data inválida.");
const id = z.number().int().positive();
const checklistTexto = z.string().trim().min(1, "Escreva o item.").max(300, "Item com até 300 caracteres.");
const ids = (max: number) => z.array(id).max(max).transform((v) => [...new Set(v)]);

export const quadroSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao quadro.").max(80, "Nome com até 80 caracteres."),
  cor: cor.optional(),
  descricao: z.string().trim().max(500, "Descrição com até 500 caracteres.").nullable().optional(),
});
/** Criar um quadro — em branco ou a partir de um MODELO de quadro (`modeloId`). */
export const criarQuadroSchema = quadroSchema.extend({ modeloId: id.nullable().optional() });
export const editarQuadroSchema = quadroSchema.partial().extend({ arquivado: z.boolean().optional() });

export const listaSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à lista.").max(60, "Nome com até 60 caracteres."),
  limiteWip: z.number().int().min(1).max(999).nullable().optional(),
  concluida: z.boolean().optional(),
});
export const editarListaSchema = listaSchema.partial().extend({ arquivada: z.boolean().optional() });
/** A ordem NOVA das listas do quadro (todas, sem repetir). */
export const ordemListasSchema = z.object({ ids: z.array(id).min(1).max(100) }).refine((v) => new Set(v.ids).size === v.ids.length, "Lista repetida.");

export const etiquetaSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à etiqueta.").max(30, "Nome com até 30 caracteres."),
  cor,
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
  .refine((e) => e.diaInteiro || !e.horaInicio || !e.horaFim || e.horaFim > e.horaInicio, { message: "O fim tem de ser depois do início.", path: ["horaFim"] })
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
  pessoas: ids(20).optional(),
  observadores: ids(20).optional(),
  etiquetas: ids(20).optional(),
  estimativaH: z.number().min(0).max(9999).nullable().optional(),
  vinculo: z.object({ tipo: z.enum(TIPOS_VINCULO), id }).nullable().optional(),
  recorrencia: recorrenciaSchema.nullable().optional(),
  blocos: blocosSchema.optional(),
};
const inicioAntesDoPrazo = (v: { inicio?: string | null; prazo?: string | null }) => !v.inicio || !v.prazo || v.inicio <= v.prazo;
const MSG_DATAS = { message: "O início não pode ser depois do prazo.", path: ["prazo"] };

export const criarTarefaSchema = z
  .object({
    quadroId: id,
    listaId: id,
    ...camposTarefa,
    checklist: z.array(checklistTexto).max(100).optional(),
    eventos: z.array(eventoSchema).max(MAX_EVENTOS_TAREFA).optional(),
  })
  .refine(inicioAntesDoPrazo, MSG_DATAS);
export const editarTarefaSchema = z
  .object({ ...camposTarefa, titulo: camposTarefa.titulo.optional(), listaId: id.optional(), arquivada: z.boolean().optional() })
  .refine(inicioAntesDoPrazo, MSG_DATAS);

/** MOVER um cartão: a lista de destino e os VIZINHOS onde ele caiu (`null` = ponta) — o servidor calcula a ordem. */
export const moverTarefaSchema = z.object({ listaId: id, anteriorId: id.nullable(), proximoId: id.nullable() });

/** Um item do CHECKLIST (criar/editar). */
export const checklistSchema = z.object({ texto: checklistTexto });
export const editarChecklistSchema = z
  .object({ texto: checklistSchema.shape.texto.optional(), feito: z.boolean().optional(), anteriorId: id.nullable().optional(), proximoId: id.nullable().optional() })
  .refine((v) => v.texto != null || v.feito != null || v.anteriorId !== undefined || v.proximoId !== undefined, "Nada a alterar.");

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
    z.object({ campo: z.literal("prazo"), prazo: data.nullable() }),
    z.object({ campo: z.literal("prioridade"), prioridade: z.enum(PRIORIDADES) }),
    z.object({ campo: z.literal("arquivar"), arquivada: z.boolean() }),
  ]),
});
export type AcaoMassaTarefas = z.infer<typeof massaTarefasSchema>["acao"];

/** Marcar notificações como LIDAS: as pedidas ou todas. */
export const notificacoesPatchSchema = z.union([z.object({ ids: z.array(id).min(1).max(90) }), z.object({ todas: z.literal(true) })]);

const nomeModelo = z.string().trim().min(1, "Dê um nome ao modelo.").max(80, "Nome com até 80 caracteres.");
/** Salvar um MODELO: de quadro (retrato das listas/etiquetas do quadro) ou de tarefa (os campos da tarefa). */
export const modeloSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("quadro"), nome: nomeModelo, quadroId: id }),
  z.object({ tipo: z.literal("tarefa"), nome: nomeModelo, tarefaId: id, prazoDias: z.number().int().min(0).max(3650).nullable().optional() }),
]);

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

// ─── Agendas externas e páginas de agendamento (migração `0049`) ────────────────────────────────────────────────

export const externoSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à agenda.").max(60, "Nome com até 60 caracteres."),
  url: z.string().trim().min(8, "Cole o link da agenda.").max(1000, "Link longo demais."),
  cor: cor.nullable().default(null),
});
export const editarExternoSchema = z.object({ nome: externoSchema.shape.nome.optional(), cor: cor.nullable().optional() }).refine((v) => v.nome !== undefined || v.cor !== undefined, "Nada a alterar.");

export const paginaAgendamentoSchema = z
  .object({
    tarefaId: id,
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "Endereço: 3 a 40 letras minúsculas, números ou hífen (sem hífen nas pontas)."),
    titulo: z.string().trim().min(1, "Dê um título à página.").max(80, "Título com até 80 caracteres."),
    descricao: z.string().trim().max(1000, "Descrição com até 1000 caracteres.").nullable().default(null),
    duracaoMin: z.number().int().refine((v) => [15, 30, 45, 60, 90, 120].includes(v), "Duração inválida."),
    dias: z.array(z.number().int().min(0).max(6)).min(1, "Escolha ao menos um dia da semana.").max(7).transform((v) => [...new Set(v)].sort()),
    horaInicio: hora,
    horaFim: hora,
    antecedenciaH: z.number().int().min(0).max(168),
    janelaDias: z.number().int().min(1).max(90),
    ativa: z.boolean().default(true),
  })
  .refine((v) => v.horaFim > v.horaInicio, { message: "O fim precisa ser depois do início.", path: ["horaFim"] });
export const editarPaginaSchema = z.object({ ativa: z.boolean() }).or(paginaAgendamentoSchema);

export const agendarSchema = z.object({
  data,
  hora,
  nome: z.string().trim().min(2, "Informe seu nome.").max(80, "Nome com até 80 caracteres."),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(120),
  observacao: z.string().trim().max(500, "Observação com até 500 caracteres.").default(""),
  captchaToken: z.string().max(4096).optional(),
});
