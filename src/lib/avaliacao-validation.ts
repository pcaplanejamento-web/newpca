import { z } from "zod";
import { CATALOGO_AVALIACAO, type ChaveAvaliacao, type Nivel, TIPOS_DFD } from "./avaliacao-core.ts";

// Validação da configuração de avaliação (PATCH /api/admin/avaliacao). Módulo
// só-schema (sem getDb) → testável isoladamente, como `dfd-validation.ts`.

const nivelSchema = z.enum(["fundamental", "intermediario", "automatico", "ignorar"]);

const NIVEIS_POR_CHAVE = new Map<string, Nivel[]>(
  CATALOGO_AVALIACAO.map((p) => [p.chave, p.niveisPermitidos]),
);
const EDITAVEIS = new Set<string>(CATALOGO_AVALIACAO.filter((p) => p.suportaEdicao).map((p) => p.chave));
const AUTO = new Set<string>(CATALOGO_AVALIACAO.filter((p) => p.suportaAuto).map((p) => p.chave));

// Mapa chave→nível: só chaves do catálogo e níveis permitidos para aquela chave.
const pontosSchema = z.record(z.string(), nivelSchema).superRefine((obj, ctx) => {
  for (const [k, v] of Object.entries(obj)) {
    const permitidos = NIVEIS_POR_CHAVE.get(k);
    if (!permitidos) {
      ctx.addIssue({ code: "custom", message: `Ponto de avaliação desconhecido: ${k}`, path: [k] });
      continue;
    }
    if (!permitidos.includes(v)) {
      ctx.addIssue({ code: "custom", message: `Nível '${v}' não é permitido para '${k}'.`, path: [k] });
    }
  }
});

const exDfdSchema = z.record(z.string(), pontosSchema).superRefine((obj, ctx) => {
  for (const k of Object.keys(obj)) {
    if (!(TIPOS_DFD as readonly string[]).includes(k)) {
      ctx.addIssue({ code: "custom", message: `Tipo de DFD desconhecido: ${k}`, path: [k] });
    }
  }
});

// Editável por campo (só pontos com suporte a edição).
const editaveisSchema = z.record(z.string(), z.boolean()).superRefine((obj, ctx) => {
  for (const k of Object.keys(obj)) {
    if (!EDITAVEIS.has(k)) ctx.addIssue({ code: "custom", message: `Campo não editável: ${k}`, path: [k] });
  }
});

// Ajuste automático por palavras-chave (só pontos com suporte a automático).
const sinonimoSchema = z.object({
  termos: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  valor: z.string().trim().min(1, "Informe o texto canônico.").max(300),
});
const sinonimosSchema = z.record(z.string(), z.array(sinonimoSchema).max(50)).superRefine((obj, ctx) => {
  for (const k of Object.keys(obj)) {
    if (!AUTO.has(k)) ctx.addIssue({ code: "custom", message: `Ponto sem ajuste automático: ${k}`, path: [k] });
  }
});

/** Config completa de avaliação (corpo do PATCH). Todos os blocos são opcionais. */
export const avaliacaoSchema = z.object({
  pontos: pontosSchema.optional().default({}),
  exProtocolo: z.record(z.string(), pontosSchema).optional().default({}),
  exDfd: exDfdSchema.optional().default({}),
  editaveis: editaveisSchema.optional().default({}),
  sinonimos: sinonimosSchema.optional().default({}),
});

export type AvaliacaoInput = z.infer<typeof avaliacaoSchema>;
export type { ChaveAvaliacao };
