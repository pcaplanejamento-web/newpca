import { z } from "zod";
import {
  DOMINIO_INSTITUCIONAL,
  emailInstitucional,
  LIMITES_CADASTRO,
  matriculaValida,
  nomeCompleto,
  nomeValido,
  problemaSenha,
  telefoneValido,
  temControle,
} from "./cadastro-core.ts";
import { FINALIDADES_CODIGO } from "./codigo-email-core.ts";
import { MESA_RESPONSAVEL, type MesaResponsavel } from "./mesa-filtros.ts";
import { APELIDO_MAX } from "./pessoa.ts";

const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido.").max(160);
const emailInstitucionalSchema = emailSchema.refine(emailInstitucional, `Use o seu e-mail institucional (@${DOMINIO_INSTITUCIONAL}).`);
/** A SENHA NOVA: 8 a 128 caracteres, com letras e números (`problemaSenha` — a mesma régua da tela). */
const senhaNovaSchema = z.string().superRefine((s, ctx) => {
  const p = problemaSenha(s);
  if (p) ctx.addIssue({ code: "custom", message: p });
});
/** NOME (cadastro e ADM): só letras, espaço, apóstrofo, hífen e ponto; nome e sobrenome. */
const nomeSchema = z
  .string()
  .trim()
  .max(LIMITES_CADASTRO.nome, "Nome muito longo.")
  .transform((n) => n.replace(/\s+/gu, " "))
  .refine(nomeCompleto, "Informe o nome completo (nome e sobrenome).")
  .refine(nomeValido, "O nome aceita só letras, espaços, apóstrofo e hífen.");
/** MATRÍCULA: só dígitos (1 a 15). */
const matriculaSchema = z.string().trim().min(1, "Informe a matrícula.").refine(matriculaValida, "A matrícula tem exatamente 6 números.");
/** TELEFONE de contato institucional: só os dígitos (DDD + número — a máscara da tela sai). */
const telefoneSchema = z
  .string()
  .max(40)
  .transform((t) => t.replace(/\D/g, ""))
  .refine(telefoneValido, "Informe o telefone com DDD (fixo com 10 dígitos ou celular com 11).");
/** Texto livre curto sem caracteres de controle/invisíveis. */
const textoLimpo = (max: number) => z.string().trim().max(max).refine((v) => !temControle(v), "O campo tem caracteres não permitidos.");
/** O código de confirmação enviado por e-mail: 6 dígitos. */
export const codigoSchema = z.string().trim().regex(/^\d{6}$/, "Informe os 6 dígitos do código.");

/** Pedir um CÓDIGO por e-mail (antes: o captcha). Na senha, com a sessão ativa, o e-mail é o da conta. */
export const solicitarCodigoSchema = z.object({
  email: emailSchema,
  finalidade: z.enum(FINALIDADES_CODIGO),
  // O captcha (token do Turnstile ou da verificação própria) — a rota SEMPRE confere.
  token: z.string().max(4000).optional(),
  // No cadastro: a matrícula já usada é recusada antes de enviar o código.
  matricula: matriculaSchema.optional(),
});

/** CADASTRO: nome completo, matrícula, cargo/função, unidade, e-mail institucional, senha e o código que confirma o e-mail. */
export const cadastroSchema = z.object({
  nome: nomeSchema,
  matricula: matriculaSchema,
  // O cargo/função escolhido na lista do ADM (o servidor confere; exigido quando há cargos cadastrados).
  cargo: textoLimpo(80).optional(),
  reparticaoId: z.number().int().positive("Selecione a unidade em que você trabalha."),
  // O telefone de contato institucional (a equipe do Planejamento e Custos fala com a pessoa por ele) e se tem WhatsApp.
  telefone: telefoneSchema,
  telefoneWhatsapp: z.boolean().default(false),
  email: emailInstitucionalSchema,
  senha: senhaNovaSchema,
  // Sem código só no PRIMEIRO acesso do sistema (ainda não há quem configure o envio de e-mails).
  codigo: codigoSchema.optional(),
  // O captcha — conferido aqui só no PRIMEIRO acesso (sem código); nos demais, antes de enviar o código.
  token: z.string().max(4000).optional(),
});

/** Criar/redefinir a senha pelo código enviado ao e-mail ("Esqueci a senha"). */
export const redefinirSenhaSchema = z.object({ email: emailSchema, senha: senhaNovaSchema, codigo: codigoSchema });

export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1, "Informe a senha.").max(200),
  // O captcha — SEMPRE conferido pela rota.
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
  apelido: z
    .string()
    .trim()
    .max(APELIDO_MAX, `Apelido com no máximo ${APELIDO_MAX} caracteres.`)
    .refine((v) => !temControle(v) && !/[<>]/.test(v), "O apelido tem caracteres não permitidos.")
    .optional(),
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
  nome: nomeSchema.optional(),
  email: emailSchema.optional(),
  // "" = sem matrícula. A tela manda só quando MUDOU (a antiga fora do padrão continua valendo).
  matricula: z.union([z.literal(""), matriculaSchema]).optional(),
  cargo: textoLimpo(80).optional(),
  // A unidade em que a pessoa trabalha (`null` = nenhuma).
  reparticaoId: z.number().int().positive().nullable().optional(),
  // O PAPEL (o que a pessoa faz nas telas) — um dos cadastrados em Configurações → Papéis.
  papelId: z.number().int().positive().optional(),
  // Os GRUPOS da pessoa (as telas que ela abre e as unidades que vê) — a lista inteira: troca todos de uma vez.
  grupos: z.array(z.number().int().positive()).max(200, "Até 200 grupos.").optional(),
  status: z.enum(["ativo", "pendente", "inativo"]).optional(),
  // "" = sem telefone. Como a matrícula: só vai quando MUDOU.
  telefone: z.union([z.literal(""), telefoneSchema]).optional(),
  telefoneWhatsapp: z.boolean().optional(),
  // VALIDAR os dados (true = o ADM conferiu; false = desfaz). Editar um dado já desfaz a validação.
  validar: z.boolean().optional(),
  // Exigir que a pessoa crie uma senha NOVA antes de usar o sistema (false = dispensa).
  trocarSenha: z.boolean().optional(),
  // RESTAURAR a conta arquivada (volta ativa, com tudo o que tinha) — sozinho, sem outros campos.
  restaurar: z.literal(true).optional(),
});

/** Um CARGO/FUNÇÃO cadastrado pelo ADM (Usuários → Cargos e funções). */
export const cargoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome do cargo ou função.")
    .max(80)
    .transform((n) => n.replace(/\s+/gu, " "))
    .refine((n) => /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ()/,.ºª'-]*$/u.test(n), "O nome aceita letras, números, espaços e ( ) / , . - º ª."),
});

export type CadastroInput = z.infer<typeof cadastroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
