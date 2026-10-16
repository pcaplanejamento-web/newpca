import { z } from "zod";
import { MODOS_CATALOGO } from "./escopo-cabecalho-core.ts";

/** Configurações → Filtro da unidade (ADM). */
export const configEscopoSchema = z.strictObject({
  modulos: z.strictObject({
    pca: z.boolean(),
    orcamento: z.boolean(),
    catalogo: z.boolean(),
    tarefas: z.boolean(),
    calendario: z.boolean(),
    automacao: z.boolean(),
  }),
  catalogo: z.enum(MODOS_CATALOGO),
  orcamentoSemVinculo: z.boolean(),
  tarefasSemVinculo: z.boolean(),
});
