import { z } from "zod";
import { LIMITES_API } from "./centi-apis-core.ts";

/** A edição de uma API da Centi (Integrações → "APIs da Centi"). A régua completa é `motivoApiInvalida` (core). */
export const centiApiSchema = z.strictObject({
  nome: z.string().trim().min(1).max(LIMITES_API.nome),
  descricao: z.string().trim().max(LIMITES_API.descricao),
  urlBase: z.string().trim().max(200),
  endpoint: z.string().trim().min(1).max(LIMITES_API.endpoint),
  uf: z.string().trim().min(1).max(LIMITES_API.uf),
  tenant: z.string().trim().min(1).max(LIMITES_API.tenant),
  divisao: z.enum(["ano", "orgao", "fonte"]),
  paginado: z.boolean(),
  parametros: z.string().trim().min(2).max(LIMITES_API.parametros),
  lista: z.array(z.number().int().positive().max(1_000_000)).max(LIMITES_API.lista),
  orgaos: z.array(z.number().int().positive()).max(LIMITES_API.escopo),
  unidades: z.array(z.number().int().positive()).max(LIMITES_API.escopo),
  ativa: z.boolean(),
  frequenciaMin: z.number().int(),
  diasUteis: z.boolean(),
  horaInicio: z.string().trim(),
  horaFim: z.string().trim(),
  anos: z.number().int(),
});

/** O TESTE de uma API (a edição em curso, ainda não salva): o ano e qual dos pedidos do ano (o 1º, por padrão). */
export const testarCentiApiSchema = z.strictObject({
  edicao: centiApiSchema,
  ano: z.number().int().min(2000).max(2100),
  pedido: z.number().int().min(0).max(LIMITES_API.lista).default(0),
});

/** A IMPORTAÇÃO MANUAL de uma API (passo a passo, conduzida pela tela): iniciar um lote, ler UMA página, concluir
 * (conferir e promover) ou cancelar. */
export const importarCentiApiSchema = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("iniciar"), ano: z.number().int().min(2000).max(2100) }),
  z.strictObject({ acao: z.literal("pagina"), lote: z.number().int().positive(), pagina: z.number().int().min(1).max(500) }),
  z.strictObject({ acao: z.literal("concluir"), lote: z.number().int().positive() }),
  z.strictObject({ acao: z.literal("cancelar"), lote: z.number().int().positive(), motivo: z.string().trim().max(300).optional(), falhou: z.boolean().optional() }),
]);
