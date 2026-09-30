import { z } from "zod";
import { LIMITES_ACESSO, MAX_DESTAQUES_ACESSO } from "./acesso-core.ts";
import { LINHAS_TABELA, type LinhasTabela } from "./theme.ts";

// Validação da aparência enviada pelo ADM (PATCH). Cores só aceitam hex; raio,
// densidade e motion são clampados/enumerados; favicon é data-URL com limite.
const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Cor inválida.");
const cores = z.record(z.string(), hex);

export const aparenciaSchema = z.object({
  cores: z.object({ light: cores.optional(), dark: cores.optional() }).optional(),
  radius: z.number().min(0).max(24).optional(),
  density: z.enum(["compact", "default", "comfortable"]).optional(),
  motion: z.enum(["off", "reduced", "default", "smooth"]).optional(),
  elevation: z.enum(["ring", "soft"]).optional(),
  kpi: z.enum(["outline", "filled"]).optional(),
  icones: z
    .object({
      stroke: z.number().min(1).max(3).optional(),
      tint: hex.optional(),
      fill: z.enum(["none", "duotone"]).optional(),
      anim: z.enum(["none", "hover"]).optional(),
    })
    .optional(),
  identidade: z
    .object({
      nome: z.string().trim().max(60).optional(),
      subtitulo: z.string().trim().max(80).optional(),
      favicon: z
        .string()
        .max(100_000, "Favicon muito grande.")
        .refine(
          (v) =>
            v === "" ||
            /^data:image\/(png|jpe?g|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/.test(v),
          "Favicon inválido.",
        )
        .optional(),
    })
    .optional(),
  // Tabelas (Configurações → Tabelas): linhas por página com que as tabelas de rolagem interna abrem.
  tabelas: z
    .object({ linhas: z.custom<LinhasTabela>((v) => LINHAS_TABELA.includes(v as LinhasTabela), "Quantidade de linhas inválida.") })
    .optional(),
  // Tela de acesso (Configurações → Tela de acesso): os textos da vitrine e o aviso; vazio = o padrão.
  acesso: z
    .object({
      rotulo: z.string().trim().max(LIMITES_ACESSO.rotulo),
      titulo: z.string().trim().max(LIMITES_ACESSO.titulo),
      descricao: z.string().trim().max(LIMITES_ACESSO.descricao),
      destaques: z
        .array(z.object({ titulo: z.string().trim().max(LIMITES_ACESSO.destaqueTitulo), texto: z.string().trim().max(LIMITES_ACESSO.destaqueTexto) }))
        .max(MAX_DESTAQUES_ACESSO),
      rodape: z.string().trim().max(LIMITES_ACESSO.rodape),
      aviso: z.string().trim().max(LIMITES_ACESSO.aviso),
    })
    .optional(),
});

export type AparenciaInput = z.infer<typeof aparenciaSchema>;
