import { z } from "zod";
import { LIMITES_INATIVO, MAX_RECADO, STATUS_PRESENCA } from "./presenca-core.ts";

/** Configurações → Presença (ADM). */
export const configPresencaSchema = z.strictObject({
  ativo: z.boolean(),
  ausente: z.boolean(),
  invisivel: z.boolean(),
  inativoMin: z.number().int().min(LIMITES_INATIVO[0]).max(LIMITES_INATIVO[1]),
});

/** As escolhas da pessoa: aparecer invisível e o STATUS (com recado e "até") — o que não vier fica como está. */
export const prefsPresencaSchema = z
  .strictObject({
    invisivel: z.boolean().optional(),
    status: z.enum(STATUS_PRESENCA as [string, ...string[]]).optional(),
    recado: z.string().max(MAX_RECADO * 2).optional(),
    ate: z.iso.datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para salvar.");
