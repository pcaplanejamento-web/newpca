import { z } from "zod";
import {
  CATALOGO_AVALIACAO,
  type ChaveAvaliacao,
  type Comportamento,
  ESTADOS_CICLO_ORDEM,
  IMPORTANCIAS_PADRAO,
  TIPOS_DFD,
} from "./avaliacao-core.ts";

// Validação da configuração de avaliação (PATCH /api/admin/avaliacao). Módulo
// só-schema (sem getDb) → testável isoladamente, como `dfd-validation.ts`.

const comportamentoSchema = z.enum(["bloqueia", "avisa", "automatico", "ignora"]);

const COMP_PERMITIDOS = new Map<string, Comportamento[]>(
  CATALOGO_AVALIACAO.map((p) => [p.chave, p.comportamentosPermitidos]),
);
const CHAVES = new Set<string>(CATALOGO_AVALIACAO.map((p) => p.chave));
const EDITAVEIS = new Set<string>(CATALOGO_AVALIACAO.filter((p) => p.suportaEdicao).map((p) => p.chave));
const AUTO = new Set<string>(CATALOGO_AVALIACAO.filter((p) => p.suportaAuto).map((p) => p.chave));
const corHex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #rrggbb).");

// ---- Importâncias (a lista gerenciável pelo ADM) ----
const importanciaSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "ID inválido (use minúsculas, números e hífen)."),
  nome: z.string().trim().min(1, "Informe o nome.").max(40),
  cor: corHex,
  comportamento: comportamentoSchema,
  ordem: z.number().int().min(0).max(9999),
  builtin: z.boolean().optional(),
});

const importanciasSchema = z
  .array(importanciaSchema)
  .max(40)
  .superRefine((arr, ctx) => {
    const ids = new Set<string>();
    arr.forEach((imp, i) => {
      if (ids.has(imp.id)) ctx.addIssue({ code: "custom", message: `Importância duplicada: ${imp.id}`, path: [i, "id"] });
      ids.add(imp.id);
      // Importâncias BASE: comportamento é FIXO (só nome/cor mudam pela tela).
      const base = IMPORTANCIAS_PADRAO.find((b) => b.id === imp.id);
      if (base && imp.comportamento !== base.comportamento)
        ctx.addIssue({ code: "custom", message: `A importância base '${imp.id}' tem comportamento fixo.`, path: [i, "comportamento"] });
    });
  });

// ---- Estados de ciclo (rótulo/cor editáveis; quantidade fixa) ----
const CICLO = new Set<string>(ESTADOS_CICLO_ORDEM);
const estadoCicloCfgSchema = z.object({ nome: z.string().trim().min(1).max(40), cor: corHex });
const estadosCicloSchema = z.record(z.string(), estadoCicloCfgSchema).superRefine((obj, ctx) => {
  for (const k of Object.keys(obj)) {
    if (!CICLO.has(k)) ctx.addIssue({ code: "custom", message: `Estado de ciclo desconhecido: ${k}`, path: [k] });
  }
});

// Mapa chave→id-de-importância: só valida que a CHAVE existe (o ID é conferido no topo,
// pois depende das importâncias do MESMO payload).
const pontosSchema = z.record(z.string(), z.string().trim().min(1).max(40)).superRefine((obj, ctx) => {
  for (const k of Object.keys(obj)) {
    if (!CHAVES.has(k)) ctx.addIssue({ code: "custom", message: `Ponto de avaliação desconhecido: ${k}`, path: [k] });
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
export const avaliacaoSchema = z
  .object({
    pontos: pontosSchema.optional().default({}),
    exProtocolo: z.record(z.string(), pontosSchema).optional().default({}),
    exDfd: exDfdSchema.optional().default({}),
    editaveis: editaveisSchema.optional().default({}),
    sinonimos: sinonimosSchema.optional().default({}),
    importancias: importanciasSchema.optional(),
    estadosCiclo: estadosCicloSchema.optional(),
  })
  .superRefine((cfg, ctx) => {
    // Comportamento efetivo por id (bases + customizadas do próprio payload).
    const comp = new Map<string, Comportamento>();
    for (const b of IMPORTANCIAS_PADRAO) comp.set(b.id, b.comportamento);
    for (const imp of cfg.importancias ?? []) comp.set(imp.id, imp.comportamento);
    const checa = (mapa: Record<string, string>, base: (string | number)[]) => {
      for (const [k, id] of Object.entries(mapa)) {
        const permitidos = COMP_PERMITIDOS.get(k);
        if (!permitidos) continue; // chave inválida já reportada pelo pontosSchema
        const c = comp.get(id);
        if (!c) {
          ctx.addIssue({ code: "custom", message: `Importância desconhecida '${id}' em '${k}'.`, path: [...base, k] });
          continue;
        }
        if (!permitidos.includes(c))
          ctx.addIssue({ code: "custom", message: `A importância '${id}' (${c}) não é permitida para '${k}'.`, path: [...base, k] });
      }
    };
    checa(cfg.pontos ?? {}, ["pontos"]);
    for (const [cat, mapa] of Object.entries(cfg.exProtocolo ?? {})) checa(mapa, ["exProtocolo", cat]);
    for (const [tipo, mapa] of Object.entries(cfg.exDfd ?? {})) checa(mapa, ["exDfd", tipo]);
  });

export type AvaliacaoInput = z.infer<typeof avaliacaoSchema>;
export type { ChaveAvaliacao };
