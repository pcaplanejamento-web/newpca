import { z } from "zod";

/** A ligação pessoa ↔ membro do Trello: pelo id escolhido na lista OU pelo usuário digitado; nenhum dos dois = desligar. */
export const ligacoesMembrosSchema = z.object({
  ligacoes: z
    .array(
      z.object({
        usuarioId: z.number().int().positive(),
        membroId: z
          .string()
          .regex(/^[0-9a-f]{24}$/i, "Membro do Trello inválido.")
          .nullable()
          .optional(),
        usuarioTrello: z
          .string()
          .trim()
          .regex(/^@?[A-Za-z0-9_]{1,100}$/, "Usuário do Trello inválido (só letras, números e _).")
          .nullable()
          .optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type LigacoesMembros = z.infer<typeof ligacoesMembrosSchema>;
