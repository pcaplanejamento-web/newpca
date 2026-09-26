import { z } from "zod";
import { TIPOS_FERIADO } from "./calendario-core.ts";

/** Validação do CALENDÁRIO profissional (migração `0047`) — só schema (puro/testável). */

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d, "Data inválida.");

/** Um FERIADO cadastrado pelo ADM (anual = repete todo ano no mesmo dia/mês). */
export const feriadoSchema = z.object({
  data,
  nome: z.string().trim().min(1, "Dê um nome ao feriado.").max(80, "Nome com até 80 caracteres."),
  tipo: z.enum(TIPOS_FERIADO),
  anual: z.boolean(),
});
export const editarFeriadoSchema = feriadoSchema.partial().refine((v) => Object.keys(v).length > 0, "Nada para atualizar.");

/** O token do link de assinatura (base64url de 32 bytes = 43 caracteres). */
export const tokenAssinaturaValido = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);
