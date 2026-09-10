import { z } from "zod";

const celula = z
  .union([z.string(), z.number(), z.boolean()])
  .nullable()
  .optional();

export const linhaCruaSchema = z.object({
  idProduto: celula,
  sequencial: celula,
  nomeProduto: celula,
  unidadeMedida: celula,
  quantidade: celula,
  valorReferencia: celula,
  classificacao: celula,
  dataDesejada: celula,
});

// Limite de linhas POR REQUISIÇÃO (o cliente envia a planilha em lotes).
const MAX_ROWS_POR_LOTE = 1000;

/** Primeiro lote: cria/atualiza a unidade e substitui os itens. */
export const uploadStartSchema = z.object({
  mode: z.literal("start"),
  codigo: z.coerce.string().trim().min(1, "Código da unidade ausente na planilha."),
  municipio: z.coerce
    .string()
    .trim()
    .min(1, "Município ausente na planilha.")
    .default("MUNICÍPIO NÃO INFORMADO"),
  nomeArquivo: z.string().trim().max(255).optional().nullable(),
  totalItens: z.number().int().nonnegative().optional(),
  valorTotal: z.number().nonnegative().optional(),
  rows: z.array(linhaCruaSchema).min(1, "Lote vazio.").max(MAX_ROWS_POR_LOTE),
});

/** Lotes seguintes: apenas acrescenta itens à unidade já criada. */
export const uploadAppendSchema = z.object({
  mode: z.literal("append"),
  unidadeId: z.number().int().positive(),
  rows: z.array(linhaCruaSchema).min(1, "Lote vazio.").max(MAX_ROWS_POR_LOTE),
});

export const uploadSchema = z.discriminatedUnion("mode", [
  uploadStartSchema,
  uploadAppendSchema,
]);

export type UploadPayload = z.infer<typeof uploadSchema>;
