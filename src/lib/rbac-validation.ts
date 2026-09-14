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

// Nomeação (ato) de um responsável: portaria/decreto/lei + número + link (todos opcionais).
const nomeacaoSchema = z.object({
  tipo: z.enum(["portaria", "decreto", "lei"]).nullable().default(null),
  numero: z.string().trim().max(120).default(""),
  link: z.string().trim().max(500).default(""),
});
const responsavelSchema = z.object({
  nome: z.string().trim().max(160),
  matricula: z.string().trim().max(60).default(""),
  funcao: z.string().trim().max(120).default(""),
  nomeacao: nomeacaoSchema.default({ tipo: null, numero: "", link: "" }),
});
const responsavelTemporarioSchema = responsavelSchema.extend({
  inicio: z.string().trim().max(10).default(""), // "YYYY-MM-DD"
  fim: z.string().trim().max(10).default(""),
});

export const reparticaoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe a sigla.").max(30),
  nome: z.string().trim().min(1, "Informe o nome da repartição.").max(160),
  // Cadastro do ADM (opcionais): nº do interessado e responsáveis por DFDs (N padrões + N
  // temporários com período). Todo responsável tem matrícula/função + nomeação (ato+link).
  numeroInteressado: z.string().trim().max(60).optional().nullable(),
  responsaveis: z
    .object({
      padroes: z.array(responsavelSchema).max(30).default([]),
      temporarios: z.array(responsavelTemporarioSchema).max(30).default([]),
    })
    .optional()
    .default({ padroes: [], temporarios: [] }),
});

export const reordenarSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Lista vazia."),
});

export type PermissaoInput = z.infer<typeof permissaoSchema>;
export type GrupoInput = z.infer<typeof grupoCreateSchema>;
export type ReparticaoInput = z.infer<typeof reparticaoSchema>;
