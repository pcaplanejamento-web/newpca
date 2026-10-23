import { z } from "zod";
import { LIMITES_API } from "./centi-apis-core.ts";

/** A edição de uma API da Centi (Integrações → "APIs da Centi"). A régua completa é `motivoApiInvalida` (core). */
export const centiApiSchema = z.strictObject({
  nome: z.string().trim().min(1).max(LIMITES_API.nome),
  descricao: z.string().trim().max(LIMITES_API.descricao),
  urlBase: z.string().trim().max(200),
  endpoint: z.string().trim().min(1).max(LIMITES_API.endpoint),
  uf: z.string().trim().min(1).max(LIMITES_API.uf),
  tenant: z.string().trim().min(1).max(LIMITES_API.tenant),
  divisao: z.enum(["ano", "orgao", "fonte"]),
  paginado: z.boolean(),
  parametros: z.string().trim().min(2).max(LIMITES_API.parametros),
  lista: z.array(z.number().int().positive().max(1_000_000)).max(LIMITES_API.lista),
  ativa: z.boolean(),
  frequenciaMin: z.number().int(),
  diasUteis: z.boolean(),
  horaInicio: z.string().trim(),
  horaFim: z.string().trim(),
  anos: z.number().int(),
});
