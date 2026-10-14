import { z } from "zod";
import { ABA_KEYS } from "./abas.ts";
import { MAX_MODULOS, MAX_NOME_MODULO } from "./modulos-core.ts";

/** Configurações → Módulos (ADM): a lista inteira, na ordem (o núcleo `lerModulos` ainda normaliza). */
export const modulosSchema = z.strictObject({
  modulos: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Id de módulo inválido."),
        nome: z.string().trim().min(1, "Informe o nome do módulo.").max(MAX_NOME_MODULO, `Use até ${MAX_NOME_MODULO} caracteres.`),
        telas: z.array(z.enum(ABA_KEYS)).max(ABA_KEYS.length),
      }),
    )
    .min(1, "Crie ao menos um módulo.")
    .max(MAX_MODULOS, `No máximo ${MAX_MODULOS} módulos.`)
    .refine((l) => new Set(l.map((m) => m.id)).size === l.length, "Módulos repetidos.")
    .refine((l) => new Set(l.flatMap((m) => m.telas)).size === l.flatMap((m) => m.telas).length, "Uma tela fica em um módulo só."),
});
