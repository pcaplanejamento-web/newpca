import { z } from "zod";
import { TIPOS_EVENTO } from "./acessos-core";

/** Uma cópia, captura ou impressão vista no navegador (`RegistroProtecao`). O texto é cortado no servidor. */
export const eventoProtecaoSchema = z.strictObject({
  tipo: z.enum(TIPOS_EVENTO),
  rota: z.string().max(300),
  tela: z.string().max(120),
  itens: z.string().max(600).optional().default(""),
  texto: z.string().max(20_000).optional().default(""),
  origem: z.enum(["navegador", "sistema"]).optional().default("navegador"),
});
