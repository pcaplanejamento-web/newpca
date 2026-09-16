import { z } from "zod";
import { TIPOS_DFD } from "./avaliacao-core.ts";

/**
 * Validação (Zod) do módulo CATÁLOGO — fonte única cliente+servidor. Módulo puro
 * (sem getDb) → testável isoladamente, como `dfd-validation.ts`. Os tipos de DFD são
 * o conjunto FIXO de `avaliacao-core` (DFD-S/R/O/E).
 */

// Conjunto de tipos de DFD de um catálogo/item (subconjunto dos TIPOS_DFD).
export const tiposDfdSchema = z.array(z.enum(TIPOS_DFD)).default([]);

/** Normaliza um conjunto de tipos: só válidos, sem duplicados, na ordem canônica. */
export function normalizarTipos(tipos: string[]): string[] {
  return TIPOS_DFD.filter((t) => tipos.includes(t));
}

// Uma linha de item vinda do parser do PDF (código já normalizado no cliente).
export const catalogoItemImportSchema = z.object({
  sequencial: z.number().int().nullable().default(null),
  codigo: z.string().trim().min(1).max(60),
  codigoRaw: z.string().trim().max(120).nullable().default(null),
  descricao: z.string().trim().min(1).max(8000),
  unidade: z.string().trim().max(60).nullable().default(null),
});
export type CatalogoItemImport = z.infer<typeof catalogoItemImportSchema>;

const MAX_ROWS = 1000; // por lote (o cliente envia 200; o servidor aceita até 1000)

// Início do envio: cria um catálogo novo OU atualiza um existente (`catalogoId`).
const startCatalogoSchema = z.object({
  mode: z.literal("start-catalogo"),
  catalogoId: z.number().int().positive().nullable().default(null), // alvo p/ atualizar (req 5)
  nome: z.string().trim().min(1).max(200),
  tiposPadrao: tiposDfdSchema,
  totalItens: z.number().int().min(0),
  rows: z.array(catalogoItemImportSchema).min(1).max(MAX_ROWS),
});

// Lotes seguintes de um envio já iniciado.
const appendCatalogoSchema = z.object({
  mode: z.literal("append-catalogo-itens"),
  catalogoId: z.number().int().positive(),
  desde: z.number().int().min(0),
  rows: z.array(catalogoItemImportSchema).min(1).max(MAX_ROWS),
});

export const catalogoOpSchema = z.discriminatedUnion("mode", [startCatalogoSchema, appendCatalogoSchema]);
export type CatalogoOp = z.infer<typeof catalogoOpSchema>;
export type StartCatalogoPayload = z.infer<typeof startCatalogoSchema>;

// Pré-checagem de conflito de código (unicidade global) antes de importar.
export const verificarCatalogoSchema = z.object({
  catalogoId: z.number().int().positive().nullable().default(null), // catálogo-alvo (excluído da checagem)
  codigos: z.array(z.string().trim().min(1)).min(1).max(20000),
});
export type VerificarCatalogoPayload = z.infer<typeof verificarCatalogoSchema>;

// Editar um catálogo já gravado (nome e/ou tipos padrão).
export const patchCatalogoSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    tiposPadrao: z.array(z.enum(TIPOS_DFD)).optional(),
  })
  .refine((v) => v.nome !== undefined || v.tiposPadrao !== undefined, {
    message: "Nada para atualizar.",
  });
export type PatchCatalogoPayload = z.infer<typeof patchCatalogoSchema>;

// Definir os tipos de DFD de um conjunto de itens (por item ou em massa).
export const patchItensTiposSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(20000),
  tipos: z.array(z.enum(TIPOS_DFD)),
});
export type PatchItensTiposPayload = z.infer<typeof patchItensTiposSchema>;

// Editar UM item de catálogo (descrição/unidade/tipos); o código é imutável.
export const patchItemSchema = z
  .object({
    descricao: z.string().trim().min(1).max(8000).optional(),
    unidade: z.string().trim().max(60).nullable().optional(),
    tipos: z.array(z.enum(TIPOS_DFD)).optional(),
  })
  .refine((v) => v.descricao !== undefined || v.unidade !== undefined || v.tipos !== undefined, {
    message: "Nada para atualizar.",
  });
export type PatchItemPayload = z.infer<typeof patchItemSchema>;
