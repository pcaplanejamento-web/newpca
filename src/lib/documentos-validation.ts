import { z } from "zod";

/** Um PDF enviado (já compactado no navegador): o conteúdo em base64; o servidor confere tamanho e cabeçalho. */
export const novoDocumentoSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  nomeArquivo: z.string().trim().min(1).max(200),
  paginas: z.number().int().min(0).max(10000),
  tamanhoOriginal: z.number().int().min(1).max(1024 ** 3),
  compactado: z.boolean(),
  conteudo: z.string().min(8).max(1_400_000),
});

export const renomearDocumentoSchema = z.object({ nome: z.string().trim().min(1).max(120) });
