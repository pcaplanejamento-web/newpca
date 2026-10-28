import { z } from "zod";
import { FINALIDADES, LIMITES_DECLARACAO, limparTextoDeclaracao, MAX_ITENS_DECLARACAO } from "./declaracoes-core";

const texto = (max: number) =>
  z
    .string()
    .max(max * 2)
    .nullable()
    .optional()
    .transform((s) => limparTextoDeclaracao(s, max));

/** O pedido de emissão: finalidade (a "outra" exige o texto), o processo, a observação e os itens com a quantidade. */
export const emitirDeclaracaoSchema = z
  .strictObject({
    finalidade: z.enum(FINALIDADES.map((f) => f.id) as [string, ...string[]]),
    finalidadeTexto: texto(LIMITES_DECLARACAO.finalidadeTexto),
    processo: texto(LIMITES_DECLARACAO.processo),
    observacao: texto(LIMITES_DECLARACAO.observacao),
    itens: z
      .array(z.strictObject({ sequencial: z.number().int().positive(), quantidade: z.number().positive().max(1e12) }))
      .min(1, "Escolha ao menos um item.")
      .max(MAX_ITENS_DECLARACAO),
  })
  .refine((d) => d.finalidade !== "outra" || !!d.finalidadeTexto, { message: "Descreva a finalidade.", path: ["finalidadeTexto"] });

export const cancelarDeclaracaoSchema = z.strictObject({
  motivo: z
    .string()
    .max(LIMITES_DECLARACAO.motivo * 2)
    .transform((s) => limparTextoDeclaracao(s, LIMITES_DECLARACAO.motivo))
    .refine((s) => !!s && s.length >= 5, "Informe o motivo do cancelamento (5 caracteres ou mais)."),
});
