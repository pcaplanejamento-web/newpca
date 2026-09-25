import { z } from "zod";
import { PRIORIDADES } from "./tarefas-core.ts";

/** Validação das TAREFAS (quadros, listas, cartões e etiquetas) — só schema (puro/testável). */

const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Data inválida.");
const id = z.number().int().positive();
const ids = (max: number) => z.array(id).max(max).transform((v) => [...new Set(v)]);

export const quadroSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao quadro.").max(80, "Nome com até 80 caracteres."),
  cor: cor.optional(),
  descricao: z.string().trim().max(500, "Descrição com até 500 caracteres.").nullable().optional(),
});
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

const camposTarefa = {
  titulo: z.string().trim().min(1, "Dê um título à tarefa.").max(200, "Título com até 200 caracteres."),
  descricao: z.string().max(10_000, "Descrição com até 10.000 caracteres.").nullable().optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  inicio: data.nullable().optional(),
  prazo: data.nullable().optional(),
  pessoas: ids(20).optional(),
  etiquetas: ids(20).optional(),
};
const inicioAntesDoPrazo = (v: { inicio?: string | null; prazo?: string | null }) => !v.inicio || !v.prazo || v.inicio <= v.prazo;
const MSG_DATAS = { message: "O início não pode ser depois do prazo.", path: ["prazo"] };

export const criarTarefaSchema = z.object({ quadroId: id, listaId: id, ...camposTarefa }).refine(inicioAntesDoPrazo, MSG_DATAS);
export const editarTarefaSchema = z
  .object({ ...camposTarefa, titulo: camposTarefa.titulo.optional(), listaId: id.optional(), arquivada: z.boolean().optional() })
  .refine(inicioAntesDoPrazo, MSG_DATAS);

/** MOVER um cartão: a lista de destino e os VIZINHOS onde ele caiu (`null` = ponta) — o servidor calcula a ordem. */
export const moverTarefaSchema = z.object({ listaId: id, anteriorId: id.nullable(), proximoId: id.nullable() });
