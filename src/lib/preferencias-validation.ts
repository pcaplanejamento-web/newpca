import { z } from "zod";

/** Chave de uma preferência de tabela: letras, números e `:_-` (ex.: `orcamento-comparativo:unidade:fonte`). */
const chave = z.string().regex(/^[A-Za-z0-9:_-]{1,120}$/, "Chave inválida.");
/** Teto do JSON salvo (larguras/colunas de uma tabela cabem folgado). */
export const MAX_PREFERENCIA = 32_000;

/** Salvar os ajustes de uma tabela (o layout é normalizado por quem LÊ — `coerceLayout`). */
export const salvarPreferenciaSchema = z.object({
  chave,
  valor: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= MAX_PREFERENCIA, "Ajustes grandes demais para salvar."),
});

export const excluirPreferenciaSchema = z.object({ chave });
