import { z } from "zod";
import { DIMENSOES_ORCAMENTO } from "./orcamento-visao.ts";

// Schemas de entrada do PCA como ESPAÇO e das visões do orçamento. Módulo SÓ-schema (sem getDb) →
// testável no Node.

const ano = z.number().int().min(2000, "Ano inválido.").max(2100, "Ano inválido.");
const nome = z.string().trim().min(1, "Informe o nome.").max(120);

/** Capa do card: data-URL de imagem (WebP/JPEG/PNG) até ~700 KB (o recorte gera ~100–300 KB). */
export const capaSchema = z
  .string()
  .max(1_000_000, "Imagem grande demais — use o recorte (WebP 800×1000).")
  .regex(/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/, "Imagem inválida.");

export const criarPcaEspacoSchema = z.object({
  nome,
  ano,
  fonte: z.enum(["lista", "protocolo"]),
});

export const editarPcaEspacoSchema = z
  .object({
    nome: nome.optional(),
    ano: ano.optional(),
    fonte: z.enum(["lista", "protocolo"]).optional(),
    status: z.enum(["preview", "publicado"]).optional(),
    capa: capaSchema.nullable().optional(),
    orcamentoVisaoId: z.number().int().positive().nullable().optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), "Nada para alterar.");

const acaoDfd = z.enum(["incorporar", "substituir", "excluir"]);
const idsProtocolos = z.array(z.number().int().positive()).min(1, "Escolha ao menos um protocolo.").max(50);

/**
 * Ações da Mesa do PCA sobre PROTOCOLOS: ENVIAR (da Mesa principal para a do PCA), DEVOLVER (à Mesa principal) e
 * INCORPORAR (PERMANENTE — os DFDs entram no PCA; `acoes` = a ação por protocolo; sem ela, a sugerida pelo assunto).
 */
export const acaoProtocolosPcaSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("enviar"), ids: idsProtocolos }),
  z.object({ acao: z.literal("devolver"), ids: idsProtocolos }),
  z.object({ acao: z.literal("incorporar"), ids: idsProtocolos, acoes: z.record(z.string().regex(/^\d+$/), acaoDfd).optional() }),
]);
export type AcaoProtocolosPca = z.infer<typeof acaoProtocolosPcaSchema>;

/** Ações sobre ITENS numerados do PCA: RETIRAR (o número fica inativo — nunca reaproveitado). */
export const acaoItensPcaSchema = z.object({
  acao: z.literal("retirar"),
  ids: z.array(z.number().int().positive()).min(1, "Escolha ao menos um item.").max(100),
});

const filtros = z
  .object(
    Object.fromEntries(DIMENSOES_ORCAMENTO.map((d) => [d.key, z.array(z.string().trim().min(1).max(300)).max(5000).optional()])) as Record<
      (typeof DIMENSOES_ORCAMENTO)[number]["key"],
      z.ZodOptional<z.ZodArray<z.ZodString>>
    >,
  )
  .strip();

export const visaoOrcamentoSchema = z.object({ nome: z.string().trim().min(1, "Informe o nome da visão.").max(80), filtros });
