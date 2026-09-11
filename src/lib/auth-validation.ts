import { z } from "zod";

export const cadastroSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(160),
  senha: z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(160),
  senha: z.string().min(1, "Informe a senha.").max(200),
});

// Foto = data-URL base64 (avatar redimensionado no cliente). "" limpa a foto.
const fotoSchema = z
  .string()
  .max(300_000, "Imagem muito grande.")
  .refine(
    (v) => v === "" || /^data:image\/(png|jpe?g|webp);base64,/.test(v),
    "Formato de imagem inválido.",
  );

/** Edição do próprio perfil (o usuário). */
export const perfilSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(160),
  matricula: z.string().trim().max(60).optional(),
  foto: fotoSchema.optional(),
});

/** Troca de senha do próprio usuário. */
export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual."),
  novaSenha: z.string().min(8, "A nova senha deve ter ao menos 8 caracteres.").max(200),
});

/** Edição de um usuário pelo admin (todos os campos opcionais no PATCH). */
export const adminUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto.").max(120).optional(),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(160).optional(),
  matricula: z.string().trim().max(60).optional(),
  role: z.enum(["admin", "gestor", "membro"]).optional(),
  status: z.enum(["ativo", "pendente", "inativo"]).optional(),
});

export type CadastroInput = z.infer<typeof cadastroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
