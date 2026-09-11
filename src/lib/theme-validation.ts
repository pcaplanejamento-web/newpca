import { z } from "zod";

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
});

export type AparenciaInput = z.infer<typeof aparenciaSchema>;
