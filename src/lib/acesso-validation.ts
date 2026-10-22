import { z } from "zod";
import { LIMITE_MAX, LIMITE_MIN, MAX_TESTADORES, MODOS_IMPLANTACAO, NOME_APARELHO_MAX, OPCOES_TROCA_DIAS } from "./acesso-conta-core";
import { MAX_CARENCIA_DIAS, MAX_TEXTO_ADM } from "./termo-uso-core";

// TERMO DE USO + APARELHOS — as entradas das rotas.

const id = z.number().int().positive();

export const nomearAparelhoSchema = z.strictObject({
  nome: z.string().max(NOME_APARELHO_MAX * 2),
  removerIds: z.array(id).max(10).optional(),
});

export const renomearAparelhoSchema = z.strictObject({ nome: z.string().max(NOME_APARELHO_MAX * 2) });

export const aceitarTermoSchema = z.strictObject({
  termoId: id,
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  metodo: z.enum(["senha", "codigo", "sessao"]),
  senha: z.string().max(200).optional(),
  codigo: z.string().regex(/^\d{6}$/).optional(),
  frase: z.string().max(60).optional(),
});

export const configAcessoContaSchema = z.strictObject({
  modo: z.enum(MODOS_IMPLANTACAO),
  testadores: z.array(id).max(MAX_TESTADORES),
  repetirAoEntrar: z.boolean(),
  limite: z.number().int().min(LIMITE_MIN).max(LIMITE_MAX),
  porPapel: z.record(z.string().regex(/^\d+$/), z.number().int().min(LIMITE_MIN).max(LIMITE_MAX)),
  trocaDias: z.number().int().refine((v) => (OPCOES_TROCA_DIAS as readonly number[]).includes(v), "Prazo da troca inválido."),
  isentarAdm: z.boolean(),
  encarregado: z.strictObject({ nome: z.string().max(120), email: z.string().max(160), telefone: z.string().max(40) }),
});

const publicoSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("todos") }),
  z.strictObject({ tipo: z.literal("papeis"), ids: z.array(id).min(1).max(200) }),
  z.strictObject({ tipo: z.literal("grupos"), ids: z.array(id).min(1).max(200) }),
  z.strictObject({ tipo: z.literal("pessoas"), ids: z.array(id).min(1).max(5000) }),
]);

export const termoAdminSchema = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("salvar"), titulo: z.string().trim().min(3).max(120), textoAdm: z.string().min(1).max(MAX_TEXTO_ADM) }),
  z.strictObject({ acao: z.literal("previa"), titulo: z.string().trim().min(1).max(120), textoAdm: z.string().max(MAX_TEXTO_ADM) }),
  z.strictObject({ acao: z.literal("publicar"), publico: publicoSchema, carenciaDias: z.number().int().min(0).max(MAX_CARENCIA_DIAS) }),
  z.strictObject({ acao: z.literal("exigir"), termoId: id, publico: publicoSchema, carenciaDias: z.number().int().min(0).max(MAX_CARENCIA_DIAS) }),
  z.strictObject({ acao: z.literal("config"), config: configAcessoContaSchema, confirmarAtivo: z.boolean().optional() }),
]);

export const contaAparelhosSchema = z
  .strictObject({ limite: z.number().int().min(LIMITE_MIN).max(LIMITE_MAX).nullable().optional(), liberarTroca: z.literal(true).optional() })
  .refine((d) => d.limite !== undefined || d.liberarTroca, "Nada a alterar.");
