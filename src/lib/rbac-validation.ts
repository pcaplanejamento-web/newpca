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

// Responsáveis por DFDs (N padrões + N temporários) — mesmo shape na unidade E no órgão
// (assinatura única). Fonte única do schema.
const responsaveisSchema = z
  .object({
    padroes: z.array(responsavelSchema).max(30).default([]),
    temporarios: z.array(responsavelTemporarioSchema).max(30).default([]),
  })
  .optional()
  .default({ padroes: [], temporarios: [] });

export const reparticaoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe a sigla.").max(30),
  nome: z.string().trim().min(1, "Informe o nome da unidade.").max(160),
  // Cadastro do ADM (opcionais): nº do interessado (identifica a unidade pelo Interessado do
  // protocolo), padrão do Setor Requisitante do DFD e o órgão dono da unidade.
  numeroInteressado: z.string().trim().max(60).optional().nullable(),
  setorRequisitante: z.string().trim().max(200).optional().nullable(),
  orgaoId: z.number().int().positive().optional().nullable(),
  oculto: z.boolean().default(false),
  responsaveis: responsaveisSchema,
});

export const reordenarSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Lista vazia."),
});

// Órgão = entidade organizacional acima da unidade. `orgaoEntidade` é o padrão que casa o
// campo "Órgão/Entidade" do DFD. `assinaturaUnica` = os `responsaveis` do órgão valem p/ TODAS
// as unidades (senão cada unidade tem os seus). Tudo opcional (cadastro do ADM).
export const orgaoSchema = z.object({
  sigla: z.string().trim().min(1, "Informe a sigla.").max(30),
  nome: z.string().trim().min(1, "Informe o nome do órgão.").max(160),
  orgaoEntidade: z.string().trim().max(200).optional().nullable(),
  numeroInteressado: z.string().trim().max(60).optional().nullable(),
  assinaturaUnica: z.boolean().default(false),
  oculto: z.boolean().default(false),
  responsaveis: responsaveisSchema,
});

// Rebaixar um órgão a unidade de OUTRO órgão (destino obrigatório).
export const rebaixarOrgaoSchema = z.object({
  orgaoDestino: z.number().int().positive(),
});

// Ligar/desligar "o órgão também funciona como unidade" (cria/remove a unidade própria).
export const unidadePropriaSchema = z.object({
  ativar: z.boolean(),
});

export type PermissaoInput = z.infer<typeof permissaoSchema>;
export type GrupoInput = z.infer<typeof grupoCreateSchema>;
export type ReparticaoInput = z.infer<typeof reparticaoSchema>;
export type OrgaoInput = z.infer<typeof orgaoSchema>;
