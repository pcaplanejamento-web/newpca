import { z } from "zod";
import { chavePalavra, chaveUnidade, LIMITES_PADRONIZACAO as L } from "./padronizacao-core.ts";

/**
 * Validação (Zod) da PADRONIZAÇÃO (Catálogo → Unidades de medida | Classificações) — fonte única cliente+servidor.
 * Módulo puro (sem `getDb`) → testável. A limpeza (sem repetidos, sem os iguais à sigla/nome) e os conflitos com o
 * resto do cadastro ficam no núcleo (`padronizacao-core`), aplicados pela rota.
 */

const HEX_COR = /^#[0-9a-fA-F]{6}$/;

/** Unidade de medida: sigla + nome + sinônimos (outras grafias aceitas) + a classificação que ela indica (opcional). */
export const unidadeMedidaSchema = z.object({
  sigla: z
    .string()
    .trim()
    .min(1, "Informe a sigla.")
    .max(L.sigla, `A sigla tem no máximo ${L.sigla} caracteres.`)
    .refine((s) => chaveUnidade(s) !== "", "A sigla precisa ter letras ou números."),
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da unidade.")
    .max(L.nome, `O nome tem no máximo ${L.nome} caracteres.`)
    .refine((s) => chaveUnidade(s) !== "", "O nome precisa ter letras ou números."),
  sinonimos: z
    .array(z.string().max(L.grafia, `Cada sinônimo tem no máximo ${L.grafia} caracteres.`))
    .max(L.sinonimos, `No máximo ${L.sinonimos} sinônimos.`)
    .default([]),
  classificacaoId: z.number().int().positive().nullable().default(null),
});
export type DadosUnidadeMedida = z.infer<typeof unidadeMedidaSchema>;

/** Classificação de item: nome + cor (#RRGGBB) + palavras-chave (a classificação automática pela descrição). */
export const classificacaoItemSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da classificação.")
    .max(L.nome, `O nome tem no máximo ${L.nome} caracteres.`)
    .refine((s) => chavePalavra(s) !== "", "O nome precisa ter letras ou números."),
  cor: z.string().trim().regex(HEX_COR, "Cor inválida (use #RRGGBB)."),
  palavras: z
    .array(z.string().max(L.palavra, `Cada palavra-chave tem no máximo ${L.palavra} caracteres.`))
    .max(L.palavras, `No máximo ${L.palavras} palavras-chave.`)
    .default([]),
});
export type DadosClassificacaoItem = z.infer<typeof classificacaoItemSchema>;

/** Grafias dos itens viram SINÔNIMOS de unidades cadastradas (a comparação: "Adicionar" na linha e "Adicionar N
 * sugestões"). */
export const sinonimosUnidadesSchema = z.object({
  itens: z
    .array(
      z.object({
        unidadeId: z.number().int().positive(),
        texto: z.string().trim().min(1, "Grafia vazia.").max(L.grafia, `A grafia tem no máximo ${L.grafia} caracteres.`),
      }),
    )
    .min(1, "Nada a adicionar.")
    .max(L.lote, `No máximo ${L.lote} por vez.`),
});

/** Nova ordem de um cadastro da padronização (índice = posição) — a lista INTEIRA (vira um lote de UPDATEs), até o
 * limite de entradas do cadastro (a criação não passa dele). */
export const ordemPadronizacaoSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "Lista vazia.")
    .max(L.ordem, `No máximo ${L.ordem} por vez.`)
    .refine((ids) => new Set(ids).size === ids.length, "Ids repetidos."),
});
