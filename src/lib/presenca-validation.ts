import { z } from "zod";

/** Configurações → Presença (ADM). */
export const configPresencaSchema = z.strictObject({ ativo: z.boolean(), ausente: z.boolean(), invisivel: z.boolean() });

/** Perfil → aparecer invisível. */
export const prefsPresencaSchema = z.strictObject({ invisivel: z.boolean() });
