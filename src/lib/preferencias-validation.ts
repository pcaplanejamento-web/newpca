import { z } from "zod";

/** Chave de uma preferência de tabela: letras, números e `:_-` (ex.: `orcamento-comparativo:unidade:fonte`). */
const chave = z.string().regex(/^[A-Za-z0-9:_-]{1,120}$/, "Chave inválida.");
/** Teto do JSON salvo (larguras/colunas de uma tabela cabem folgado). */
export const MAX_PREFERENCIA = 32_000;

const valorLayout = z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= MAX_PREFERENCIA, "Ajustes grandes demais para salvar.");

/** Salvar uma preferência de tabela (ex.: a EDIÇÃO PADRÃO do usuário — `padrao:<chave>` → `{ id }`). */
export const salvarPreferenciaSchema = z.object({ chave, valor: valorLayout });

export const excluirPreferenciaSchema = z.object({ chave });
const nomeEdicao = z.string().trim().min(1, "Dê um nome à edição.").max(60, "Nome com até 60 caracteres.");

/** Criar uma EDIÇÃO SALVA de tabela (nome, só para mim ou pública, o layout). */
export const criarEdicaoSchema = z.object({ chave, nome: nomeEdicao, publico: z.boolean(), valor: valorLayout });

/** Atualizar uma edição (só o dono): nome, visibilidade e/ou o layout. */
export const editarEdicaoSchema = z
  .object({ nome: nomeEdicao.optional(), publico: z.boolean().optional(), valor: valorLayout.optional() })
  .refine((v) => v.nome !== undefined || v.publico !== undefined || v.valor !== undefined, "Nada para atualizar.");
