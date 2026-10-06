import { z } from "zod";
import { MAX_CONEXOES, MAX_NOS } from "./fluxo-core";

/** O grafo chega como objeto e é normalizado por `lerGrafo` (a forma); aqui só os tetos de tamanho. */
const grafoSchema = z
  .object({ nos: z.array(z.unknown()).max(MAX_NOS), conexoes: z.array(z.unknown()).max(MAX_CONEXOES) })
  .passthrough()
  .refine((g) => JSON.stringify(g).length <= 200_000, "Fluxo grande demais.");

export const criarFluxoSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  descricao: z.string().trim().max(400).optional(),
  grafo: grafoSchema.optional(),
});

export const editarFluxoSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80).optional(),
  descricao: z.string().trim().max(400).nullable().optional(),
  grafo: grafoSchema.optional(),
  frequencia: z.record(z.string(), z.unknown()).optional(),
  ativo: z.boolean().optional(),
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
});
