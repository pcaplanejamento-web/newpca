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
  dominio: celula,
  prioridade: celula,
  protocoloIdExterno: celula,
});

// Limite de linhas POR REQUISIÇÃO (o cliente envia a planilha em lotes).
const MAX_ROWS_POR_LOTE = 1000;

/** Primeiro lote de UMA unidade (LOCAL) do upload: cria o upload (sem `uploadId`) e a unidade. */
export const uploadStartSchema = z.object({
  mode: z.literal("start"),
  /** PCA (fonte "lista pronta") que recebe a planilha. */
  pcaId: z.number().int().positive("Escolha o PCA que recebe a planilha."),
  /** O upload já criado pela 1ª unidade do mesmo arquivo (a consolidada tem várias). */
  uploadId: z.number().int().positive().optional(),
  codigo: z.coerce.string().trim().min(1, "Código da unidade ausente na planilha."),
  municipio: z.coerce
    .string()
    .trim()
    .min(1, "Município ausente na planilha.")
    .default("MUNICÍPIO NÃO INFORMADO"),
  /** O nome do ARQUIVO enviado (o nome do upload). */
  nomeArquivo: z.string().trim().max(255).optional().nullable(),
  rows: z.array(linhaCruaSchema).min(1, "Lote vazio.").max(MAX_ROWS_POR_LOTE),
});

/** Lotes seguintes: apenas acrescenta itens à unidade já criada. */
export const uploadAppendSchema = z.object({
  mode: z.literal("append"),
  unidadeId: z.number().int().positive(),
  rows: z.array(linhaCruaSchema).min(1, "Lote vazio.").max(MAX_ROWS_POR_LOTE),
});

/** O upload terminou: avisa os administradores (uma vez por arquivo). */
export const uploadFimSchema = z.object({ mode: z.literal("fim"), uploadId: z.number().int().positive() });

export const uploadSchema = z.discriminatedUnion("mode", [uploadStartSchema, uploadAppendSchema, uploadFimSchema]);

export type UploadPayload = z.infer<typeof uploadSchema>;
