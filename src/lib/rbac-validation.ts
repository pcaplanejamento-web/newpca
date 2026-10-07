import { z } from "zod";
import { ABA_KEYS } from "./abas.ts";
import { ehCodigoGeral } from "./escopo-unidades-core.ts";

// Validação das telas de Grupos e Permissões (RBAC). As abas são o conjunto
// fechado de `ABA_KEYS` (lib/abas.ts).

/** Limite do nome de um grupo/permissão (o campo da tela usa o mesmo `maxLength`). */
export const MAX_NOME_RBAC = 60;

const nomePermissao = z.string().trim().min(1, "Informe o nome da permissão.").max(MAX_NOME_RBAC, `Use até ${MAX_NOME_RBAC} caracteres.`);
const nomeGrupo = z.string().trim().min(1, "Informe o nome do grupo.").max(MAX_NOME_RBAC, `Use até ${MAX_NOME_RBAC} caracteres.`);
const abasSchema = z.array(z.enum(ABA_KEYS)).max(ABA_KEYS.length * 2);
/** Ids de pessoas/unidades: sem repetir (um id repetido derrubaria o lote pela chave primária). */
const idsSchema = z
  .array(z.number().int().positive())
  .max(5000)
  .transform((ids) => [...new Set(ids)]);

export const permissaoSchema = z.object({
  nome: nomePermissao,
  abas: abasSchema.default([]),
});

// PATCH explícito, SEM defaults: um campo ausente fica como está (o `.partial()` do schema de criação mantinha o
// `.default([])` — um PATCH só com o nome APAGAVA as abas).
export const permissaoPatchSchema = z.object({
  nome: nomePermissao.optional(),
  abas: abasSchema.optional(),
});

export const grupoCreateSchema = z.object({
  nome: nomeGrupo,
  permissaoId: z.number().int().positive().nullable().optional(),
  membros: idsSchema.default([]),
  reparticoes: idsSchema.default([]),
});

// PATCH explícito, SEM defaults: um campo ausente fica como está (o `.partial()` mantinha o `.default([])` — um PATCH só
// com o nome APAGAVA os membros e as unidades do grupo).
export const grupoPatchSchema = z.object({
  nome: nomeGrupo.optional(),
  permissaoId: z.number().int().positive().nullable().optional(),
  membros: idsSchema.optional(),
  reparticoes: idsSchema.optional(),
});

/** Grupo ativo do cabeçalho (cookie). */
export const grupoAtivoSchema = z.object({ grupoId: z.number().int().positive("Grupo inválido.") });
/** Unidade ativa do cabeçalho (cookie). */
export const reparticaoAtivaSchema = z.object({ reparticaoId: z.number().int().positive("Unidade inválida.") });

// RESPONSÁVEIS POR DFDs — a PLANILHA ÚNICA (migração 0099): a PESSOA (nome + matrícula) e o VÍNCULO dela com uma
// unidade OU um órgão (padrão | temporário + nomeação + período; o temporário com o cargo do período). As regras do vínculo moram no núcleo puro
// (`motivoVinculoInvalido`, `responsaveis-planilha-core.ts`) — a MESMA na tela e na rota.
// A PESSOA guarda também o CARGO/FUNÇÃO (o nome de um cargo cadastrado — conferido na rota) e o USUÁRIO ligado (opcional).
const nomePessoa = z.string().trim().min(1, "Informe o nome.").max(160);
const matriculaPessoa = z.string().trim().max(60);
const cargoPessoa = z.string().trim().max(80);
const usuarioPessoa = z.number().int().positive().nullable();
export const pessoaResponsavelSchema = z.object({
  nome: nomePessoa,
  matricula: matriculaPessoa.default(""),
  cargo: cargoPessoa.default(""),
  usuarioId: usuarioPessoa.default(null),
});
// PATCH sem os padrões da criação (o que não vier fica como está).
export const pessoaResponsavelPatchSchema = z.object({
  nome: nomePessoa.optional(),
  matricula: matriculaPessoa.optional(),
  cargo: cargoPessoa.optional(),
  usuarioId: usuarioPessoa.optional(),
  // A EXONERAÇÃO: data "AAAA-MM-DD" válida ou null (desfazer).
  exoneradoEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d), "Data inválida.")
    .nullable()
    .optional(),
});

const dadosVinculoSchema = z.object({
  tipo: z.enum(["padrao", "temporario"]),
  funcao: z.string().trim().max(80).default(""), // o cargo do temporário (conferido na rota)
  atoTipo: z.enum(["portaria", "decreto", "lei"]).nullable().default(null),
  atoNumero: z.string().trim().max(120).default(""),
  atoLink: z.string().trim().max(500).default(""),
  inicio: z.string().trim().max(10).nullable().default(null), // "YYYY-MM-DD"
  fim: z.string().trim().max(10).nullable().default(null),
});
export const vinculoResponsavelSchema = dadosVinculoSchema
  .extend({
    responsavelId: z.number().int().positive(),
    orgaoId: z.number().int().positive().nullable().default(null),
    reparticaoId: z.number().int().positive().nullable().default(null),
  })
  .refine((v) => (v.orgaoId == null) !== (v.reparticaoId == null), "Escolha UMA unidade ou UM órgão.");
// Editar: os dados, a pessoa e — opcional — o ALVO (onde responde): sem ele, fica o de antes; com ele, UM só.
export const vinculoResponsavelPatchSchema = dadosVinculoSchema
  .extend({
    responsavelId: z.number().int().positive(),
    orgaoId: z.number().int().positive().nullable().optional(),
    reparticaoId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => (v.orgaoId === undefined && v.reparticaoId === undefined) || (v.orgaoId == null) !== (v.reparticaoId == null), "Escolha UMA unidade ou UM órgão.");

export const reparticaoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, "Informe a sigla.")
    .max(30)
    .refine((c) => !ehCodigoGeral(c), "A sigla 'GERAL' é reservada à unidade virtual (todas as unidades)."),
  nome: z.string().trim().min(1, "Informe o nome da unidade.").max(160),
  // Cadastro do ADM (opcionais): nº do interessado (identifica a unidade pelo Interessado do
  // protocolo), padrão do Setor Requisitante do DFD e o órgão dono da unidade.
  numeroInteressado: z.string().trim().max(60).optional().nullable(),
  setorRequisitante: z.string().trim().max(200).optional().nullable(),
  // Toda unidade pertence a um ÓRGÃO (obrigatório).
  orgaoId: z.number({ error: "Escolha o órgão da unidade." }).int().positive(),
  oculto: z.boolean().default(false),
});

export const reordenarSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Lista vazia."),
});

// Órgão = entidade organizacional acima da unidade. `orgaoEntidade` é o padrão que casa o
// campo "Órgão/Entidade" do DFD. `assinaturaUnica` = os responsáveis VINCULADOS ao órgão valem p/ TODAS
// as unidades (senão cada unidade tem os seus). Tudo opcional (cadastro do ADM).
export const orgaoSchema = z.object({
  // A sigla do órgão vira o código da unidade ao rebaixá-lo ou ao ligar "também unidade" — "GERAL" é reservado.
  sigla: z
    .string()
    .trim()
    .min(1, "Informe a sigla.")
    .max(30)
    .refine((c) => !ehCodigoGeral(c), "A sigla 'GERAL' é reservada à unidade virtual (todas as unidades)."),
  nome: z.string().trim().min(1, "Informe o nome do órgão.").max(160),
  orgaoEntidade: z.string().trim().max(200).optional().nullable(),
  numeroInteressado: z.string().trim().max(60).optional().nullable(),
  /** O ID da entidade do órgão na Centi (só dígitos, ex.: "02"); vazio = não informado. Ausente = não muda. */
  entidadeCenti: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, "O ID da entidade na Centi é só o número (ex.: 02).")
    .optional()
    .nullable(),
  assinaturaUnica: z.boolean().default(false),
  oculto: z.boolean().default(false),
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
