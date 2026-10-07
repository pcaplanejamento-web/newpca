import { z } from "zod";
import { MAX_AJUDA, MAX_CONEXOES, MAX_NOS } from "./fluxo-core";

const textoAjuda = z.string().trim().max(MAX_AJUDA).optional();
const ajudaSchema = z.strictObject({ funciona: textoAjuda, executa: textoAjuda, resultado: textoAjuda });

/** O grafo chega como objeto e é normalizado por `lerGrafo` (a forma); aqui só os tetos de tamanho. */
const grafoSchema = z
  .object({ nos: z.array(z.unknown()).max(MAX_NOS), conexoes: z.array(z.unknown()).max(MAX_CONEXOES) })
  .passthrough()
  .refine((g) => JSON.stringify(g).length <= 200_000, "Fluxo grande demais.");

export const criarFluxoSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  descricao: z.string().trim().max(400).optional(),
  ajuda: ajudaSchema.optional(),
  grafo: grafoSchema.optional(),
  frequencia: z.record(z.string(), z.unknown()).optional(),
  ativo: z.boolean().optional(),
  publico: z.boolean().optional(),
});

export const editarFluxoSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80).optional(),
  descricao: z.string().trim().max(400).nullable().optional(),
  ajuda: ajudaSchema.optional(),
  grafo: grafoSchema.optional(),
  frequencia: z.record(z.string(), z.unknown()).optional(),
  ativo: z.boolean().optional(),
  publico: z.boolean().optional(),
});

/** O fim de uma execução: o resumo (estado, contagens) — a próxima é calculada no servidor pela frequência. */
export const execucaoFluxoSchema = z.strictObject({
  estado: z.enum(["concluido", "falhou", "cancelado"]),
  erro: z.string().max(300).optional(),
  nos: z.number().int().min(0).max(1000),
  erros: z.number().int().min(0).max(1000),
  apontados: z.number().int().min(0).max(1_000_000),
  inicio: z.string().max(40),
  fim: z.string().max(40),
  /** O resultado por protocolo do nó "Importar protocolo" (o aviso no sino). */
  relatorio: z
    .array(z.strictObject({ protocolo: z.string().max(40), status: z.enum(["importado", "nao-importado"]), motivo: z.string().max(300).optional(), apontamentos: z.number().int().min(0).max(10_000) }))
    .max(500)
    .optional(),
});

/** A retomada de um nó "Executar fluxo": `no` = o caminho do nó (ids dos subfluxos + o nó). */
export const noProgressoSchema = z.string().trim().min(1).max(200);
export const progressoFluxoSchema = z.strictObject({
  itens: z.array(z.strictObject({ chave: z.string().trim().min(1).max(200), estado: z.enum(["ok", "falha"]) })).min(1).max(200),
});
