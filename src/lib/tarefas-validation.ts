import { z } from "zod";
import { FREQUENCIAS, GATILHOS, PRIORIDADES, TIPOS_VINCULO } from "./tarefas-core.ts";

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
};
const inicioAntesDoPrazo = (v: { inicio?: string | null; prazo?: string | null }) => !v.inicio || !v.prazo || v.inicio <= v.prazo;
const MSG_DATAS = { message: "O início não pode ser depois do prazo.", path: ["prazo"] };

export const criarTarefaSchema = z
  .object({ quadroId: id, listaId: id, ...camposTarefa, checklist: z.array(checklistTexto).max(100).optional() })
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

/** Tamanho máximo de um ARQUIVO anexado (decodificado). */
export const ANEXO_MAX_BYTES = 1024 * 1024;
const MIME_ANEXO = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/;
/** Bytes de um base64 (sem decodificar). */
const bytesBase64 = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

/** Um ANEXO: link http(s) ou arquivo (data-URL png/jpeg/webp/pdf ≤ 1 MB). */
export const anexoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("link"),
    nome: z.string().trim().max(120).optional(),
    url: z
      .string()
      .trim()
      .max(2000)
      .refine((u) => /^https?:\/\/[^\s]+$/i.test(u), "Informe um endereço http(s)."),
  }),
  z.object({
    tipo: z.literal("arquivo"),
    nome: z.string().trim().min(1).max(120),
    conteudo: z
      .string()
      .max(1_500_000)
      .refine((c) => MIME_ANEXO.test(c), "Arquivo aceito: imagem PNG/JPEG/WEBP ou PDF.")
      .refine((c) => bytesBase64(c.slice(c.indexOf(",") + 1)) <= ANEXO_MAX_BYTES, "Arquivo com até 1 MB."),
  }),
]);

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
