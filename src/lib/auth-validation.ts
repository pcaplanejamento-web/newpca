import { z } from "zod";
import { DOMINIO_INSTITUCIONAL, emailInstitucional, nomeCompleto } from "./cadastro-core.ts";
import { FINALIDADES_CODIGO } from "./codigo-email-core.ts";
import { MESA_RESPONSAVEL, type MesaResponsavel } from "./mesa-filtros.ts";
import { APELIDO_MAX } from "./pessoa.ts";

const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido.").max(160);
const emailInstitucionalSchema = emailSchema.refine(emailInstitucional, `Use o seu e-mail institucional (@${DOMINIO_INSTITUCIONAL}).`);
const senhaNovaSchema = z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(200);
/** O código de confirmação enviado por e-mail: 6 dígitos. */
export const codigoSchema = z.string().trim().regex(/^\d{6}$/, "Informe os 6 dígitos do código.");

/** Pedir um CÓDIGO por e-mail (antes: o captcha). Na senha, com a sessão ativa, o e-mail é o da conta. */
export const solicitarCodigoSchema = z.object({
  email: emailSchema,
  finalidade: z.enum(FINALIDADES_CODIGO),
  // Token do Turnstile (captcha). Opcional no schema; a rota exige quando o captcha está ativo.
  token: z.string().max(4000).optional(),
});

/** CADASTRO: nome completo, matrícula, unidade, e-mail institucional, senha e o código que confirma o e-mail. */
export const cadastroSchema = z.object({
  nome: z
    .string()
    .trim()
    .max(120)
    .transform((n) => n.replace(/\s+/gu, " "))
    .refine(nomeCompleto, "Informe o nome completo (nome e sobrenome)."),
  matricula: z.string().trim().min(1, "Informe a matrícula.").max(60),
  reparticaoId: z.number().int().positive("Selecione a unidade em que você trabalha."),
  email: emailInstitucionalSchema,
  senha: senhaNovaSchema,
  // Sem código só no PRIMEIRO acesso do sistema (ainda não há quem configure o envio de e-mails).
  codigo: codigoSchema.optional(),
});

/** Criar/redefinir a senha pelo código enviado ao e-mail ("Esqueci a senha"). */
export const redefinirSenhaSchema = z.object({ email: emailSchema, senha: senhaNovaSchema, codigo: codigoSchema });

export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1, "Informe a senha.").max(200),
  token: z.string().max(4000).optional(),
});

// Foto = data-URL base64 (avatar redimensionado no cliente). "" limpa a foto.
const fotoSchema = z
  .string()
  .max(300_000, "Imagem muito grande.")
  .refine(
    (v) => v === "" || /^data:image\/(png|jpe?g|webp);base64,/.test(v),
    "Formato de imagem inválido.",
  );

/** Edição do próprio perfil (o usuário): SÓ o apelido e a foto — nome, e-mail, matrícula e unidade só o ADM altera.
 * `foto` ausente = mantém a atual ("" remove). */
export const perfilSchema = z.object({
  // Apelido: o nome de EXIBIÇÃO no sistema (vazio = volta a valer o nome).
  apelido: z.string().trim().max(APELIDO_MAX, `Apelido com no máximo ${APELIDO_MAX} caracteres.`).optional(),
  foto: fotoSchema.optional(),
});

/** Preferências do próprio usuário (Perfil): o RESPONSÁVEL PADRÃO escolhido automaticamente ao protocolar (`null` =
 * nenhum) e/ou o responsável com que a MESA abre ("eu" · "todos" · "sem") — cada card salva o seu. */
export const preferenciasPerfilSchema = z
  .object({
    responsavelPadraoId: z.number().int().positive().nullable().optional(),
    mesaResponsavel: z.enum(MESA_RESPONSAVEL as [MesaResponsavel, ...MesaResponsavel[]]).optional(),
  })
  .refine((p) => p.responsavelPadraoId !== undefined || p.mesaResponsavel !== undefined, "Nada a salvar.");

/** Troca (ou criação) de senha do próprio usuário: a nova senha + o código enviado ao e-mail da conta. */
export const trocarSenhaSchema = z.object({ novaSenha: senhaNovaSchema, codigo: codigoSchema });

/** Edição de um usuário pelo admin (todos os campos opcionais no PATCH). */
export const adminUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto.").max(120).optional(),
  email: emailSchema.optional(),
  matricula: z.string().trim().max(60).optional(),
  // A unidade em que a pessoa trabalha (`null` = nenhuma).
  reparticaoId: z.number().int().positive().nullable().optional(),
  role: z.enum(["admin", "gestor", "membro"]).optional(),
  status: z.enum(["ativo", "pendente", "inativo"]).optional(),
});

export type CadastroInput = z.infer<typeof cadastroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
