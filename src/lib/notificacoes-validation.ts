import { z } from "zod";

const id = z.number().int().positive();

/** Marcar como LIDAS (ou NÃO lidas — `lida:false`) as pedidas, ou todas como lidas. */
export const notificacoesPatchSchema = z.union([z.object({ ids: z.array(id).min(1).max(90), lida: z.boolean().default(true) }), z.object({ todas: z.literal(true) })]);

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
