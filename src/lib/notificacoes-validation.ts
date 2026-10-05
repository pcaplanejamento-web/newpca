import { z } from "zod";

const id = z.number().int().positive();

const ids = z.array(id).min(1).max(90);
/** ADIAR até um instante (ms) — de agora até 30 dias. */
const adiarAte = z
  .number()
  .int()
  .refine((v) => v > Date.now() && v <= Date.now() + 30 * 86_400_000, "Escolha um horário entre agora e 30 dias.");
/** ADIAR (`{ids, adiarAte}`), marcar como LIDAS (ou NÃO lidas — `lida:false`) as pedidas, ou todas como lidas. */
export const notificacoesPatchSchema = z.union([z.strictObject({ ids, adiarAte }), z.strictObject({ ids, lida: z.boolean().default(true) }), z.strictObject({ todas: z.literal(true) })]);

/** As PREFERÊNCIAS da pessoa (e-mail e sino) — normalizadas por `lerPrefsEmail`/`lerPrefsPessoa` antes de gravar. */
export const preferenciasNotificacoesSchema = z.object({
  email: z.record(z.string().max(40), z.unknown()).optional(),
  pessoa: z.record(z.string().max(40), z.unknown()).optional(),
});

/** Um COMUNICADO do ADM: título, texto, link interno opcional e a quem (todos ou os grupos). */
export const comunicadoSchema = z.object({
  titulo: z.string().trim().min(3, "Dê um título.").max(120),
  texto: z.string().trim().max(500).default(""),
  link: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || (v.startsWith("/") && !v.startsWith("//")), "O link tem de ser uma página do sistema (começa com /).")
    .default(""),
  grupos: z.array(id).max(50).default([]),
});

/** A RETENÇÃO do ADM (quanto tempo os avisos ficam; a limpeza automática). */
export const retencaoSchema = z.object({
  auto: z.boolean(),
  lidasDias: z.number().int().min(1).max(365),
  naoLidasDias: z.number().int().min(1).max(365),
  teto: z.number().int().min(20).max(1000),
});

/** EXCLUIR (do banco) as pedidas, ou LIMPAR as lidas / todas. */
export const notificacoesDeleteSchema = z.union([z.object({ ids: z.array(id).min(1).max(90) }), z.object({ limpar: z.enum(["lidas", "todas"]) })]);

/** A lista paginada: as mais recentes antes do cursor (id), só as não lidas ou todas. */
export const notificacoesListaSchema = z.object({
  antes: z.coerce.number().int().positive().optional(),
  filtro: z.enum(["nao-lidas", "todas"]).default("todas"),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

const canais = z.object({ sino: z.boolean(), email: z.boolean(), desligavel: z.boolean() });
/** A configuração do ADM (Configurações → Notificações): os canais de cada aviso do catálogo. */
/** (Chave fora do catálogo é descartada na leitura — `resolverNotificacoes`.) */
export const configNotificacoesSchema = z.object({ avisos: z.record(z.string().max(40), canais) });
