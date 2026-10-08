import { z } from "zod";

/** Configurações → Proteção de dados (ADM). */
export const configProtecaoSchema = z.strictObject({
  selecao: z.boolean(),
  print: z.boolean(),
  foco: z.boolean(),
  papeis: z.array(z.number().int().positive()).max(200),
  publica: z.boolean(),
});
