import { z } from "zod";
import { CLAUSULAS_AUTO, LIMITE_MAX, LIMITE_MIN, MAX_EXIGIDOS,
  MAX_TESTADORES, MODOS_IMPLANTACAO, NOME_APARELHO_MAX, OPCOES_FECHAR_ACEITE, OPCOES_TROCA_DIAS } from "./acesso-conta-core";
import { MAX_TEXTO_ADM } from "./termo-uso-core";

// TERMO DE USO + APARELHOS — as entradas das rotas.

const id = z.number().int().positive();

export const nomearAparelhoSchema = z.strictObject({
  nome: z.string().max(NOME_APARELHO_MAX * 2),
  removerIds: z.array(id).max(10).optional(),
  /** A cota do `navigator.storage.estimate()` (o indício de janela anônima). */
  cota: z.number().nonnegative().max(1e15).nullable().optional(),
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
  alcance: z.enum(["todos", "escolhidos"]).optional(),
  exigidos: z.array(id).max(MAX_EXIGIDOS).optional(),
  repetirAoEntrar: z.boolean(),
  limite: z.number().int().min(LIMITE_MIN).max(LIMITE_MAX),
  porPapel: z.record(z.string().regex(/^\d+$/), z.number().int().min(LIMITE_MIN).max(LIMITE_MAX)),
  trocaDias: z.number().int().refine((v) => (OPCOES_TROCA_DIAS as readonly number[]).includes(v), "Prazo da troca inválido."),
  isentarAdm: z.boolean(),
  fecharAceiteS: z.number().int().refine((v) => (OPCOES_FECHAR_ACEITE as readonly number[]).includes(v), "Tempo de fechamento inválido.").optional(),
  encarregado: z.strictObject({ nome: z.string().max(120), email: z.string().max(160), telefone: z.string().max(40) }),
  telaAceito: z.boolean().optional(),
  baixarComprovante: z.boolean().optional(),
  clausulasOff: z.array(z.enum(CLAUSULAS_AUTO.map((c) => c.id) as [string, ...string[]])).max(CLAUSULAS_AUTO.length).optional(),
});

const publicoSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("todos") }),
  z.strictObject({ tipo: z.literal("papeis"), ids: z.array(id).min(1).max(200) }),
  z.strictObject({ tipo: z.literal("grupos"), ids: z.array(id).min(1).max(200) }),
  z.strictObject({ tipo: z.literal("pessoas"), ids: z.array(id).min(1).max(5000) }),
]);

export const termoAdminSchema = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("salvar"), textoAdm: z.string().min(1).max(MAX_TEXTO_ADM) }),
  z.strictObject({ acao: z.literal("previa"), textoAdm: z.string().max(MAX_TEXTO_ADM) }),
  z.strictObject({ acao: z.literal("publicar"), publico: publicoSchema }),
  z.strictObject({ acao: z.literal("exigir"), termoId: id, publico: publicoSchema }),
  z.strictObject({ acao: z.literal("revogar"), termoId: id, aceiteIds: z.array(id).min(1).max(5000) }),
  z.strictObject({ acao: z.literal("lembrar") }),
  z.strictObject({ acao: z.literal("refazerAparelhos"), usuarioIds: z.array(id).min(1).max(5000).nullable() }),
  z.strictObject({ acao: z.literal("config"), config: configAcessoContaSchema, confirmarAtivo: z.boolean().optional() }),
]);

export const contaAparelhosSchema = z
  .strictObject({ limite: z.number().int().min(LIMITE_MIN).max(LIMITE_MAX).nullable().optional(), liberarTroca: z.literal(true).optional() })
  .refine((d) => d.limite !== undefined || d.liberarTroca, "Nada a alterar.");
