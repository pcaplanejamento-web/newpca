import { z } from "zod";

/** `GET /api/mesa/execucao?ano=` — o ano do PCA do CABEÇALHO com que a Mesa foi carregada (ausente/vazio = todos). */
export const execucaoMesaSchema = z.object({
  ano: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(2000).max(2100).optional()),
});
