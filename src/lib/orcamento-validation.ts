import { z } from "zod";

/**
 * Validação (Zod) do módulo ORÇAMENTO — fonte única cliente+servidor. Módulo puro (sem
 * getDb) → testável isoladamente, como `catalogo-validation`. Os lançamentos são SÓ
 * LEITURA (importar/visualizar): não há schema de edição de item.
 */

// Uma linha (lançamento) vinda do parser da planilha — a MESMA conferência da tela (`COLUNAS_ORCAMENTO`): todos os textos
// do CUBO preenchidos, Ficha só com dígitos, Código com número e valores numéricos finitos.
const obrigatorio = (rotulo: string, max: number) => z.string().trim().min(1, `${rotulo} vazio.`).max(max);
const valor = z.number().finite().default(0);
export const orcamentoItemImportSchema = z.object({
  orgao: obrigatorio("Órgão", 300),
  unidade: obrigatorio("Unidade", 300),
  nomeElemento: obrigatorio("Nome Elemento", 500),
  codigoElemento: obrigatorio("Código Elemento", 60).regex(/\d/, "Código Elemento sem número."),
  funcao: obrigatorio("Função", 300),
  programa: obrigatorio("Programa", 300),
  acao: obrigatorio("Ação", 300),
  ficha: obrigatorio("Ficha", 60).regex(/^\d+$/, "Ficha fora do padrão."),
  fonte: obrigatorio("Fonte", 500),
  valorEmendaImpositiva: valor,
  valorInicial: valor,
  valorSuplementacao: valor,
  valorEmpenho: valor,
  saldo: valor,
  valorAnulacao: valor,
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
// VÍNCULOS do orçamento: a unidade do CUBO (texto) → uma unidade cadastrada, com as AÇÕES (lista explícita) ou
// `acoes: null` = as DEMAIS (menos as `acoesFora`). O órgão não se vincula (é a soma das unidades).
const acoesLista = z.array(z.string().trim().min(1).max(300)).max(1000);
const vinculoCampos = {
  alvoId: z.number().int().positive(),
  acoes: acoesLista.nullable(),
  acoesFora: acoesLista.default([]),
};
// ONDE gravar (vínculos por visão): no padrão e/ou nas visões escolhidas. Ausente = o do próprio vínculo (criar = o padrão).
const escopoVinculos = z.object({ padrao: z.boolean(), visoes: z.array(z.number().int().positive()).max(200) }).optional();
export const criarVinculosOrcamentoSchema = z.object({
  vinculos: z
    .array(z.object({ texto: z.string().trim().min(1).max(300), ...vinculoCampos }))
    .min(1)
    .max(200),
  escopo: escopoVinculos,
});
export const editarVinculoOrcamentoSchema = z.object({ ...vinculoCampos, escopo: escopoVinculos });
// O corpo do DELETE é opcional (sem ele, exclui onde o vínculo está).
export const excluirVinculoOrcamentoSchema = z.union([z.null(), z.object({ escopo: escopoVinculos })]).transform((v) => v ?? {});
// A visão volta a seguir o PADRÃO numa unidade do CUBO.
export const padraoVinculoSchema = z.object({ visaoId: z.number().int().positive(), chave: z.string().trim().min(1).max(300) });

// SUBSTITUIR os lançamentos de um orçamento pelos de outro (o CUBO reenviado, gravado num orçamento temporário).
export const substituirOrcamentoSchema = z.object({ origemId: z.number().int().positive() });
