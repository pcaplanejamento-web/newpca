import { z } from "zod";
import { CATALOGO_AVALIACAO, type ChaveAvaliacao, type Nivel, TIPOS_DFD } from "./avaliacao-core.ts";

// Validação da configuração de avaliação (PATCH /api/admin/avaliacao). Módulo
// só-schema (sem getDb) → testável isoladamente, como `dfd-validation.ts`.

const nivelSchema = z.enum(["fundamental", "intermediario", "automatico", "ignorar"]);

const NIVEIS_POR_CHAVE = new Map<string, Nivel[]>(
  CATALOGO_AVALIACAO.map((p) => [p.chave, p.niveisPermitidos]),
);

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

const categoriaSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen."),
  label: z.string().trim().min(1, "Informe o nome da categoria.").max(60),
  termos: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  ordem: z.number().int().min(0).max(999),
});

const exDfdSchema = z.record(z.string(), pontosSchema).superRefine((obj, ctx) => {
  for (const k of Object.keys(obj)) {
    if (!(TIPOS_DFD as readonly string[]).includes(k)) {
      ctx.addIssue({ code: "custom", message: `Tipo de DFD desconhecido: ${k}`, path: [k] });
    }
  }
});

/** Config completa de avaliação (corpo do PATCH). Todos os blocos são opcionais. */
export const avaliacaoSchema = z.object({
  pontos: pontosSchema.optional().default({}),
  exProtocolo: z.record(z.string(), pontosSchema).optional().default({}),
  exDfd: exDfdSchema.optional().default({}),
  categorias: z.array(categoriaSchema).max(50).optional().default([]),
});

export type AvaliacaoInput = z.infer<typeof avaliacaoSchema>;
export type { ChaveAvaliacao };
