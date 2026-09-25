import { z } from "zod";

/**
 * Validação (Zod) do módulo ORÇAMENTO — fonte única cliente+servidor. Módulo puro (sem
 * getDb) → testável isoladamente, como `catalogo-validation`. Os lançamentos são SÓ
 * LEITURA (importar/visualizar): não há schema de edição de item.
 */

// Uma linha (lançamento) vinda do parser da planilha.
export const orcamentoItemImportSchema = z.object({
  orgao: z.string().trim().max(300).default(""),
  unidade: z.string().trim().max(300).default(""),
  nomeElemento: z.string().trim().max(500).default(""),
  codigoElemento: z.string().trim().max(60).default(""),
  funcao: z.string().trim().max(300).default(""),
  programa: z.string().trim().max(300).default(""),
  acao: z.string().trim().max(300).default(""),
  ficha: z.string().trim().max(60).default(""),
  fonte: z.string().trim().max(500).default(""),
  valorEmendaImpositiva: z.number().default(0),
  valorInicial: z.number().default(0),
  valorSuplementacao: z.number().default(0),
  valorEmpenho: z.number().default(0),
  saldo: z.number().default(0),
  valorAnulacao: z.number().default(0),
  sequencial: z.number().int().nullable().default(null),
});
export type OrcamentoItemImport = z.infer<typeof orcamentoItemImportSchema>;

const MAX_ROWS = 1000; // por lote (o cliente envia 200; o servidor aceita até 1000)

// Ano do orçamento (OBRIGATÓRIO no cadastro; mesmo intervalo do PCA).
const anoSchema = z.number().int().gte(2000).lte(2100);

// Início do envio: cria um orçamento novo (nome + ano) + 1º lote de lançamentos.
const startOrcamentoSchema = z.object({
  mode: z.literal("start-orcamento"),
  nome: z.string().trim().min(1).max(200),
  ano: anoSchema,
  totalItens: z.number().int().min(0),
  rows: z.array(orcamentoItemImportSchema).min(1).max(MAX_ROWS),
});

// Lotes seguintes de um envio já iniciado.
const appendOrcamentoSchema = z.object({
  mode: z.literal("append-orcamento-itens"),
  orcamentoId: z.number().int().positive(),
  desde: z.number().int().min(0),
  rows: z.array(orcamentoItemImportSchema).min(1).max(MAX_ROWS),
});

export const orcamentoOpSchema = z.discriminatedUnion("mode", [startOrcamentoSchema, appendOrcamentoSchema]);
export type OrcamentoOp = z.infer<typeof orcamentoOpSchema>;
export type StartOrcamentoPayload = z.infer<typeof startOrcamentoSchema>;

// Editar um orçamento já gravado (nome e/ou ano).
export const patchOrcamentoSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    ano: anoSchema.optional(),
  })
  .refine((v) => v.nome !== undefined || v.ano !== undefined, { message: "Nada para atualizar." });
export type PatchOrcamentoPayload = z.infer<typeof patchOrcamentoSchema>;

// VÍNCULOS do texto de Órgão/Unidade do CUBO com o cadastro (`alvoId` null = desvincular).
// Até 200 por requisição (o upsert vai em lotes de 16 linhas × 6 params = 96 < 100 do D1).
export const vinculosOrcamentoSchema = z.object({
  vinculos: z
    .array(
      z.object({
        tipo: z.enum(["orgao", "unidade"]),
        texto: z.string().trim().min(1).max(300),
        alvoId: z.number().int().positive().nullable(),
      }),
    )
    .min(1)
    .max(200),
});
export type VinculosOrcamentoPayload = z.infer<typeof vinculosOrcamentoSchema>;

// SUBSTITUIR os lançamentos de um orçamento pelos de outro (o CUBO reenviado, gravado num orçamento temporário).
export const substituirOrcamentoSchema = z.object({ origemId: z.number().int().positive() });
