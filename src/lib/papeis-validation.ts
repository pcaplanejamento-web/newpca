import { z } from "zod";
import { ABA_KEYS } from "./abas.ts";
import { temControle } from "./cadastro-core.ts";
import { ACOES_PAPEL, coerceCapacidades, MAX_DESCRICAO_PAPEL, MAX_NOME_PAPEL } from "./papeis-core.ts";
import { coerceDetalhes, LINHAS_MESA, NIVEIS_RESPONSAVEL } from "./papeis-detalhes-core.ts";

// Validação da tela Configurações → Papéis (só o ADM). As capacidades são o conjunto fechado do catálogo: telas de
// `ABA_KEYS` × ações de `ACOES_PAPEL`, normalizadas pelo núcleo (qualquer ação ⇒ Visualizar; o que não se aplica sai).

const nome = z
  .string()
  .trim()
  .min(2, "Informe o nome do papel (2 caracteres ou mais).")
  .max(MAX_NOME_PAPEL, `Use até ${MAX_NOME_PAPEL} caracteres.`)
  .refine((v) => !temControle(v), "O nome tem caractere inválido.");
const descricao = z
  .string()
  .trim()
  .max(MAX_DESCRICAO_PAPEL, `Use até ${MAX_DESCRICAO_PAPEL} caracteres.`)
  .refine((v) => !temControle(v), "A descrição tem caractere inválido.");
/** Por tela, as ações — uma tela ou ação fora do catálogo é recusada; o resto é normalizado pelo núcleo. */
const capacidades = z.partialRecord(z.enum(ABA_KEYS), z.array(z.enum(ACOES_PAPEL)).max(ACOES_PAPEL.length * 2)).transform(coerceCapacidades);

/**
 * Os DETALHES do papel (as restrições dentro das telas) — só os que o sistema JÁ APLICA (um detalhe gravado nunca é "de
 * enfeite"): o Responsável (ver e alterar), a Distribuição, as linhas da Mesa e o desempenho por pessoa. Chaves que ainda
 * não valem são descartadas; o conjunto é normalizado pelo núcleo (as implicações — `coerceDetalhes`).
 */
export const detalhesPapelSchema = z
  .object({
    mesa: z
      .object({
        responsavel: z.object({ ver: z.boolean().optional(), alterar: z.enum(NIVEIS_RESPONSAVEL).optional() }).optional(),
        distribuicao: z.boolean().optional(),
        linhas: z.enum(LINHAS_MESA).optional(),
        desempenho: z.boolean().optional(),
      })
      .optional(),
  })
  .transform(coerceDetalhes);

export const criarPapelSchema = z.object({
  nome,
  descricao: descricao.nullable().optional(),
  capacidades,
  /** Ausente = sem restrições. */
  detalhes: detalhesPapelSchema.optional(),
  /** Passa a ser o papel dos NOVOS cadastros (o anterior deixa de ser — há sempre um). */
  padraoCadastro: z.boolean().optional(),
});

// PATCH explícito, SEM defaults: o campo ausente fica como está.
export const editarPapelSchema = z
  .object({
    nome: nome.optional(),
    descricao: descricao.nullable().optional(),
    capacidades: capacidades.optional(),
    /** O conjunto INTEIRO (substitui o gravado). */
    detalhes: detalhesPapelSchema.optional(),
    padraoCadastro: z.boolean().optional(),
  })
  .refine(
    (v) => v.nome !== undefined || v.descricao !== undefined || v.capacidades !== undefined || v.detalhes !== undefined || v.padraoCadastro !== undefined,
    "Nada para atualizar.",
  );
