import { z } from "zod";
import { MAX_MEMBROS_CONVERSA, MAX_NOME_CONVERSA, MAX_TEXTO_CHAT, MAX_TRECHO_RESPOSTA } from "./chat-core.ts";
import { LIMITES_INATIVO, MAX_RECADO, STATUS_PRESENCA } from "./presenca-core.ts";

/** Configurações → Presença (ADM). */
export const configPresencaSchema = z.strictObject({
  ativo: z.boolean(),
  ausente: z.boolean(),
  invisivel: z.boolean(),
  inativoMin: z.number().int().min(LIMITES_INATIVO[0]).max(LIMITES_INATIVO[1]),
  atividade: z.boolean().optional().default(true),
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
export const chatEnviarSchema = z.strictObject({
  /** `p<id>` (privada) ou `c<id>` (conversa em grupo escolhida). */
  conversa: z.string().regex(/^(p\d{1,9}|c[a-z0-9]{6,20})$/),
  /** Os destinatários (sem você): 1 na privada, 1 a 19 na conversa em grupo. */
  para: z.array(z.number().int().positive()).min(1).max(MAX_MEMBROS_CONVERSA - 1),
  nome: z.string().max(MAX_NOME_CONVERSA * 2).optional(),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  texto: z.string().min(1).max(MAX_TEXTO_CHAT * 2),
  resp: z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/), de: z.number().int().positive(), trecho: z.string().max(MAX_TRECHO_RESPOSTA * 2) }).nullable().optional(),
});

/** O SINAL do chat ("lida" até a mensagem X, "digitando") na privada/conversa em grupo — pelas caixas pessoais, que valem
 * em qualquer grupo ativo. */
export const chatSinalSchema = z.strictObject({
  conversa: z.string().regex(/^(p\d{1,9}|c[a-z0-9]{6,20})$/),
  para: z.array(z.number().int().positive()).min(1).max(MAX_MEMBROS_CONVERSA - 1),
  t: z.enum(["lida", "digitando"]),
  ate: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,40}$/)
    .optional(),
});
