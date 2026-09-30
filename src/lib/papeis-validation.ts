import { z } from "zod";
import { ABA_KEYS } from "./abas.ts";
import { temControle } from "./cadastro-core.ts";
import { ACOES_PAPEL, coerceCapacidades, MAX_DESCRICAO_PAPEL, MAX_NOME_PAPEL } from "./papeis-core.ts";

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

export const criarPapelSchema = z.object({
  nome,
  descricao: descricao.nullable().optional(),
  capacidades,
  /** Passa a ser o papel dos NOVOS cadastros (o anterior deixa de ser — há sempre um). */
  padraoCadastro: z.boolean().optional(),
});

// PATCH explícito, SEM defaults: o campo ausente fica como está.
export const editarPapelSchema = z
  .object({
    nome: nome.optional(),
    descricao: descricao.nullable().optional(),
    capacidades: capacidades.optional(),
    padraoCadastro: z.boolean().optional(),
  })
  .refine((v) => v.nome !== undefined || v.descricao !== undefined || v.capacidades !== undefined || v.padraoCadastro !== undefined, "Nada para atualizar.");
