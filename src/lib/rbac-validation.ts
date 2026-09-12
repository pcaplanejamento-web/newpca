import { z } from "zod";
import { ABA_KEYS } from "./abas";

// Validação das telas de Grupos e Permissões (RBAC). As abas são o conjunto
// fechado de `ABA_KEYS` (lib/abas.ts).
export const permissaoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da permissão.").max(60),
  abas: z.array(z.enum(ABA_KEYS)).default([]),
});

export const grupoCreateSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do grupo.").max(60),
  permissaoId: z.number().int().positive().nullable().optional(),
  membros: z.array(z.number().int().positive()).default([]),
  reparticoes: z.array(z.number().int().positive()).default([]),
});

export const grupoPatchSchema = grupoCreateSchema.partial();

export const reparticaoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe a sigla.").max(30),
  nome: z.string().trim().min(1, "Informe o nome da repartição.").max(160),
});

export const reordenarSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Lista vazia."),
});

export type PermissaoInput = z.infer<typeof permissaoSchema>;
export type GrupoInput = z.infer<typeof grupoCreateSchema>;
export type ReparticaoInput = z.infer<typeof reparticaoSchema>;
