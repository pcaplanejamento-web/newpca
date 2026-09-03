import { z } from "zod";

const celula = z.union([z.string(), z.number(), z.boolean()]).nullable().optional();

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

export const uploadSchema = z.object({
  codigo: z.coerce.string().trim().min(1, "Código da unidade ausente na planilha."),
  municipio: z.coerce
    .string()
    .trim()
    .min(1, "Município ausente na planilha.")
    .default("MUNICÍPIO NÃO INFORMADO"),
  nomeArquivo: z.string().trim().max(255).optional().nullable(),
  rows: z
    .array(linhaCruaSchema)
    .min(1, "Nenhum item encontrado na planilha.")
    .max(50000, "Planilha excede o limite de 50.000 itens."),
});

export type UploadPayload = z.infer<typeof uploadSchema>;
