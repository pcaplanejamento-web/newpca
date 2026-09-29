import { z } from "zod";
import { emailDoRemetente } from "./integracoes-core.ts";

// Validação do PATCH /api/admin/integracoes. Módulo só-schema (sem getDb) → testável.
// Segredos chegam em TEXTO PURO novo OU vazio (= manter o atual). A rota cifra antes
// de gravar e NUNCA os devolve no GET (write-only).

export const integracoesSchema = z.object({
  turnstile: z
    .object({
      ativo: z.boolean().default(false),
      siteKey: z.string().trim().max(200).default(""),
      secret: z.string().trim().max(500).default(""), // "" = manter o segredo atual
    })
    .default({ ativo: false, siteKey: "", secret: "" }),
  // Monitoramento reusa os Worker Secrets do Cloudflare (CF_ANALYTICS_TOKEN/CF_ACCOUNT_ID),
  // então aqui é só o liga/desliga.
  monitoramento: z.object({ ativo: z.boolean().default(false) }).default({ ativo: false }),
  // Trello (conta institucional): a chave é pública; token e segredo chegam em texto puro ("" = manter) e são cifrados.
  trello: z
    .object({
      ativo: z.boolean().default(false),
      apiKey: z.string().trim().max(100).regex(/^[0-9a-f]*$/i, "Chave do Trello inválida.").default(""),
      token: z.string().trim().max(300).default(""),
      segredo: z.string().trim().max(300).default(""),
    })
    .default({ ativo: false, apiKey: "", token: "", segredo: "" }),
  // Resend: a chave chega em texto puro ("" = manter) e é cifrada; o remetente é "Nome <avisos@dominio>" ou só o e-mail.
  resend: z
    .object({
      ativo: z.boolean().default(false),
      apiKey: z
        .string()
        .trim()
        .max(200)
        .regex(/^(re_[A-Za-z0-9_]+)?$/, "Chave do Resend inválida (começa com re_).")
        .default(""),
      remetente: z
        .string()
        .trim()
        .max(200)
        .refine((v) => !v || !!emailDoRemetente(v), "Remetente inválido — use Nome <avisos@seudominio> ou só o e-mail.")
        .default(""),
      urlSistema: z
        .string()
        .trim()
        .max(200)
        .refine((v) => !v || /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(v), "Endereço do sistema inválido (https://…, sem caminho).")
        .default(""),
    })
    .default({ ativo: false, apiKey: "", remetente: "", urlSistema: "" }),
});
