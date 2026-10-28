import { z } from "zod";
import { MAX_CAMPOS_PEDIDO, MAX_IDS_CAMPOS } from "./mesa-campos-core.ts";

/** `POST /api/mesa/campos`: os campos EXTRAS (colunas sob demanda) de protocolos ou DFDs. */
export const camposMesaSchema = z.strictObject({
  entidade: z.enum(["protocolo", "dfd"]),
  ids: z.array(z.number().int().positive()).min(1).max(MAX_IDS_CAMPOS),
  campos: z.array(z.string().min(1).max(60)).min(1).max(MAX_CAMPOS_PEDIDO),
});
