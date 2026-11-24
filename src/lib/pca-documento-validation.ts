import { z } from "zod";
import { AUTOMATICOS, COLUNAS_ITEM_DOC, LIMITES_DOC } from "./pca-documento-core";

const colunaItem = z.enum(Object.keys(COLUNAS_ITEM_DOC) as [keyof typeof COLUNAS_ITEM_DOC, ...(keyof typeof COLUNAS_ITEM_DOC)[]]);
const autoridade = z.strictObject({ cargo: z.string().max(LIMITES_DOC.campo), nome: z.string().max(LIMITES_DOC.campo) });

/** A configuração do documento do PCA (o ADM) — os limites do núcleo; a leitura (`lerConfigDocumento`) normaliza. */
export const configDocumentoSchema = z.strictObject({
  ativo: z.boolean(),
  titulo: z.string().trim().min(1, "Informe o título.").max(LIMITES_DOC.titulo),
  subtitulo: z.string().max(LIMITES_DOC.titulo),
  ente: z.string().max(LIMITES_DOC.campo),
  local: z.string().max(LIMITES_DOC.campo),
  capa: z.boolean(),
  timbre: z.boolean(),
  itensPaisagem: z.boolean(),
  expediente: z.array(autoridade).max(LIMITES_DOC.autoridades),
  secoes: z
    .array(z.strictObject({ id: z.string().regex(/^[a-z0-9-]{1,40}$/i), titulo: z.string().max(LIMITES_DOC.titulo), texto: z.string().max(LIMITES_DOC.texto), ativa: z.boolean() }))
    .max(LIMITES_DOC.secoes),
  automaticos: z.strictObject(Object.fromEntries(Object.keys(AUTOMATICOS).map((k) => [k, z.boolean()])) as Record<keyof typeof AUTOMATICOS, z.ZodBoolean>),
  colunas: z.array(colunaItem).min(1).max(Object.keys(COLUNAS_ITEM_DOC).length),
  titulosColunas: z.partialRecord(colunaItem, z.string().max(LIMITES_DOC.tituloColuna)).default({}),
  notas: z.string().max(LIMITES_DOC.notas),
  assinaturas: z.array(autoridade).max(LIMITES_DOC.autoridades),
});

/** A emissão pública: só o token da verificação anti-robô. */
export const emitirDocumentoSchema = z.strictObject({ token: z.string().max(4000).nullable().optional() });
