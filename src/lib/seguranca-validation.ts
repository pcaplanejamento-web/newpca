import { z } from "zod";
import { OPCOES_INATIVIDADE } from "./seguranca-core";

/** Configurações → Segurança (ADM). */
export const configSegurancaSchema = z.strictObject({
  inatividadeMin: z.number().int().refine((v) => (OPCOES_INATIVIDADE as readonly number[]).includes(v), "Tempo de inatividade inválido."),
  alertaAparelho: z.boolean(),
  alertaFalhas: z.boolean(),
});
