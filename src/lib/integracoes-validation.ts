import { z } from "zod";

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
});
