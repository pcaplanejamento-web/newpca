import { z } from "zod";

/** Um PDF a enviar (já compactado no navegador): o tamanho final; os bytes vão depois, em partes. */
export const novoDocumentoSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  nomeArquivo: z.string().trim().min(1).max(200),
  paginas: z.number().int().min(0).max(10000),
  tamanhoOriginal: z.number().int().min(1).max(1024 ** 3),
  compactado: z.boolean(),
  tamanho: z.number().int().min(5).max(1024 ** 3),
});

export const renomearDocumentoSchema = z.object({ nome: z.string().trim().min(1).max(120) });

/** Os PCAs do documento: "todos" ou a lista (vazia = nenhum). */
export const pcasDocumentoSchema = z.object({ pcas: z.union([z.literal("todos"), z.array(z.number().int().positive()).max(500)]) });
export const editarDocumentoSchema = z.union([renomearDocumentoSchema.strict(), pcasDocumentoSchema.strict()]);
