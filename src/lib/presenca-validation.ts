import { z } from "zod";
import { MAX_TEXTO_CHAT, MAX_TRECHO_RESPOSTA } from "./chat-core.ts";
import { LIMITES_INATIVO, MAX_RECADO, STATUS_PRESENCA } from "./presenca-core.ts";

/** Configurações → Presença (ADM). */
export const configPresencaSchema = z.strictObject({
  ativo: z.boolean(),
  ausente: z.boolean(),
  invisivel: z.boolean(),
  inativoMin: z.number().int().min(LIMITES_INATIVO[0]).max(LIMITES_INATIVO[1]),
});

/** As escolhas da pessoa: aparecer invisível e o STATUS (com recado e "até") — o que não vier fica como está. */
export const prefsPresencaSchema = z
  .strictObject({
    invisivel: z.boolean().optional(),
    status: z.enum(STATUS_PRESENCA as [string, ...string[]]).optional(),
    recado: z.string().max(MAX_RECADO * 2).optional(),
    ate: z.iso.datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para salvar.");

/** Configurações → Chat (ADM). */
export const configChatSchema = z.strictObject({ grupo: z.boolean(), privado: z.boolean() });

/** Uma mensagem PRIVADA do chat ao vivo (nada é gravado). */
export const chatPrivadoSchema = z.strictObject({
  para: z.number().int().positive(),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  texto: z.string().min(1).max(MAX_TEXTO_CHAT * 2),
  resp: z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/), de: z.number().int().positive(), trecho: z.string().max(MAX_TRECHO_RESPOSTA * 2) }).nullable().optional(),
});
