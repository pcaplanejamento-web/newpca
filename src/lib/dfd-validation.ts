import { z } from "zod";
import type { RegrasAvaliacao } from "./avaliacao-core.ts";
import { avaliarDfd, type CtxConformidade } from "./dfd-tratamento.ts";

// Schemas de entrada do módulo DFD/PCA. Módulo SÓ-schema (sem getDb) → testável
// isoladamente no Node, como `validation.ts`.

// Itens por request (lote). Igual ao /api/upload — mantém cada db.batch dentro
// dos limites do Worker/D1; DFDs com milhares de itens vão em vários lotes.
const MAX_ROWS_POR_LOTE = 1000;
// Teto generoso de itens declarados por DFD (anti-abuso; um DFD real tem dezenas).
const MAX_ITENS_DFD = 100_000;

// Requisitos obrigatórios de um DFD — a regra agora é CONFIGURÁVEL pelo ADM
// (`avaliarDfd` em `dfd-tratamento`, com níveis do catálogo). `tipo`/refs opcionais
// habilitam as exceções por tipo de DFD.
export type DfdConferencia = {
  reparticaoId?: number | null;
  itens: { valorUnitario?: number | null; quantidade?: number | null; codigo?: string | null; item?: number | null }[];
  secoes: { titulo: string; texto: string }[];
  tipo?: string | null;
  numeroContrato?: string | null;
  numeroAta?: string | null;
  numeroLicitacao?: string | null;
};

/**
 * Faltas que BLOQUEIAM importar/protocolar um DFD (vazio = pode importar). Fonte única
 * cliente+servidor. Delega para `avaliarDfd` (níveis do ADM); com `regras` no padrão do
 * catálogo devolve exatamente a lista de hoje (valor unitário, repartição, §3/§5/§6/§7).
 * `regras`/`ctx` opcionais aplicam os níveis e as exceções por tipo/categoria. O **ano do
 * PCA** e a **assinatura** são portões à parte, conferidos no envio.
 */
export function faltasObrigatorias(
  d: DfdConferencia,
  regras?: RegrasAvaliacao,
  ctx?: { categoria?: string | null; orgaoUnidadeDivergente?: boolean } & CtxConformidade,
): string[] {
  return avaliarDfd(d, regras, ctx).bloqueantes;
}

const textoOpc = z.string().trim().max(4000).optional().nullable();
const textoCurtoOpc = z.string().trim().max(255).optional().nullable();

const dfdItemSchema = z.object({
  item: z.number().int().optional().nullable(),
  codigo: textoCurtoOpc,
  descricao: textoOpc,
  unidade: z.string().trim().max(100).optional().nullable(),
  quantidade: z.number().optional().nullable(),
  valorUnitario: z.number().optional().nullable(),
  valorTotal: z.number().optional().nullable(),
});

const dfdSecaoSchema = z.object({
  numero: z.number().int().nonnegative(),
  titulo: z.string().trim().max(300),
  texto: z.string().max(10000),
});

/** Uma assinatura digital lida do PDF (ver `Assinatura` em parse-dfd-comum). */
const assinaturaSchema = z.object({
  nome: z.string().trim().max(300).default(""),
  eCpf: z.string().trim().max(60).default(""),
  usuario: z.string().trim().max(120).default(""),
  local: z.string().trim().max(120).default(""),
  data: z.string().trim().max(40).default(""),
  ip: z.string().trim().max(60).default(""),
  codigo: z.string().trim().max(120).default(""),
  url: z.string().trim().max(500).default(""),
  fonte: z.enum(["certificado", "sistema", "dropsigner", "adobe", "foxit"]).default("certificado"),
  /** Lida por OCR da aparência ACHATADA (sem camada de texto) — conferência não bloqueante. */
  ocr: z.boolean().optional(),
});

/**
 * Cabeçalho do DFD (SEM os itens — que vão em lotes `start-dfd`/`append-dfd-itens`
 * para escalar a milhares de itens). `totalItens` = total declarado pelo cliente.
 */
export const dfdMetaSchema = z.object({
  numero: z.coerce.string().trim().min(1, "Número do DFD ausente no arquivo.").max(50),
  planejamento: textoCurtoOpc,
  tipo: textoCurtoOpc,
  objeto: textoOpc,
  orgaoEntidade: textoCurtoOpc,
  setorRequisitante: textoOpc,
  siglaSetor: z.string().trim().max(60).optional().nullable(),
  responsavel: textoCurtoOpc,
  matricula: textoCurtoOpc,
  email: textoCurtoOpc,
  telefone: textoCurtoOpc,
  anoPca: z.number().int().gte(2000).lte(2100).optional().nullable(),
  numeroContrato: textoCurtoOpc,
  numeroAta: textoCurtoOpc,
  numeroLicitacao: textoCurtoOpc,
  reparticaoId: z.number().int().positive().optional().nullable(),
  protocoloId: z.number().int().positive().optional().nullable(),
  valorTotal: z.number().nonnegative().optional().nullable(),
  nomeArquivo: textoCurtoOpc,
  secoes: z.array(dfdSecaoSchema).max(50).optional().default([]),
  assinaturas: z.array(assinaturaSchema).max(50).optional().default([]),
  totalItens: z.number().int().nonnegative().max(MAX_ITENS_DFD).optional().nullable(),
});

/** `start-dfd`: cabeçalho + 1º lote de itens → cria/zera o DFD e devolve `dfdId`. */
export const startDfdSchema = dfdMetaSchema.extend({
  mode: z.literal("start-dfd"),
  rows: z.array(dfdItemSchema).min(1, "O DFD não tem itens.").max(MAX_ROWS_POR_LOTE),
});

/** `append-dfd-itens`: acrescenta um lote de itens a um DFD já iniciado. */
export const appendDfdItensSchema = z.object({
  mode: z.literal("append-dfd-itens"),
  dfdId: z.number().int().positive(),
  desde: z.number().int().nonnegative(), // itens já gravados (base do sequencial)
  rows: z.array(dfdItemSchema).min(1).max(MAX_ROWS_POR_LOTE),
});

/** Escrita de DFD em lotes (POST /api/dfd) — cobre DFD avulso e do protocolo. */
export const dfdOpSchema = z.discriminatedUnion("mode", [startDfdSchema, appendDfdItensSchema]);

/** Metadados da capa do protocolo (editáveis no banner antes de protocolar). */
export const protocoloMetaSchema = z.object({
  numero: z.coerce.string().trim().min(1, "Informe o número do protocolo.").max(60),
  idExterno: textoCurtoOpc,
  anoPca: z.number().int().gte(2000).lte(2100).optional().nullable(),
  data: textoCurtoOpc,
  interessado: textoOpc,
  documento: textoCurtoOpc,
  assunto: textoOpc,
  observacao: z.string().trim().max(2000).optional().nullable(),
  valorCapa: z.number().nonnegative().optional().nullable(),
  reparticaoId: z.number().int().positive().optional().nullable(),
  orgaoId: z.number().int().positive().optional().nullable(), // protocolo em nome do órgão (ponto 2)
  localReparticao: textoOpc,
  nomeArquivo: textoCurtoOpc,
});

/** `start-protocolo`: cria só o protocolo (capa) → devolve `protocoloId`. Os DFDs
 * são enviados depois, em streaming (`POST /api/dfd`). */
export const startProtocoloSchema = z.object({
  mode: z.literal("start-protocolo"),
  protocolo: protocoloMetaSchema,
});

/** Edição de um protocolo já gravado (banner destravado): a **repartição**
 * (roteamento/escopo) + os campos de **CONTEÚDO** da capa (interessado/assunto/
 * observação/CPF-CNPJ/valor/local). Os **IDENTIFICADORES** (número/Id/data/ano do PCA)
 * são IMUTÁVEIS — o schema NÃO os aceita, então nunca mudam. */
export const editarProtocoloSchema = z.object({
  reparticaoId: z.number().int().positive().optional().nullable(),
  interessado: textoOpc,
  documento: textoCurtoOpc,
  assunto: textoOpc,
  observacao: z.string().trim().max(2000).optional().nullable(),
  valorCapa: z.number().nonnegative().optional().nullable(),
  localReparticao: textoOpc,
});

/** Vincula (ou desvincula com `null`) um DFD a um protocolo — rule 4. */
export const vincularDfdSchema = z.object({
  protocoloId: z.number().int().positive().nullable(),
});

/**
 * Edição de um DFD JÁ GRAVADO (banner destravado): `protocoloId` (vincular),
 * `reparticaoId`, `secoes` (tratamento), itens, refs de renovação e os campos de
 * **CONTEÚDO do cabeçalho** (objeto/órgão/setor/responsável/matrícula/e-mail/telefone).
 * Os **IDENTIFICADORES** (número/planejamento/tipo) NÃO estão aqui → imutáveis. Cada
 * campo é opcional; `undefined` = não mexe. Exige ao menos um campo presente.
 */
export const editarDfdSchema = z
  .object({
    protocoloId: z.number().int().positive().nullable().optional(),
    reparticaoId: z.number().int().positive().nullable().optional(),
    secoes: z.array(dfdSecaoSchema).max(50).optional(),
    // Itens editados (código/descrição/unidade/quantidade/valores) — reescreve `dfd_itens`.
    itens: z.array(dfdItemSchema).max(100_000).optional(),
    // Referências de renovação (DFD-R): preenchíveis à mão quando o parser não achou.
    numeroContrato: textoCurtoOpc,
    numeroAta: textoCurtoOpc,
    numeroLicitacao: textoCurtoOpc,
    // Conteúdo do cabeçalho (cadeado por campo). Identificadores ficam de fora (imutáveis).
    objeto: textoOpc,
    orgaoEntidade: textoOpc,
    setorRequisitante: textoOpc,
    responsavel: textoOpc,
    matricula: textoCurtoOpc,
    email: textoCurtoOpc,
    telefone: textoCurtoOpc,
  })
  .refine(
    (d) =>
      d.protocoloId !== undefined ||
      d.reparticaoId !== undefined ||
      d.secoes !== undefined ||
      d.itens !== undefined ||
      d.numeroContrato !== undefined ||
      d.numeroAta !== undefined ||
      d.numeroLicitacao !== undefined ||
      d.objeto !== undefined ||
      d.orgaoEntidade !== undefined ||
      d.setorRequisitante !== undefined ||
      d.responsavel !== undefined ||
      d.matricula !== undefined ||
      d.email !== undefined ||
      d.telefone !== undefined,
    { message: "Nada para editar." },
  );

/** Gera uma edição de PCA unindo os DFDs selecionados. */
export const gerarPcaSchema = z.object({
  nome: z.coerce.string().trim().min(1, "Informe um nome para a edição do PCA.").max(120),
  ano: z.number().int().gte(2000).lte(2100).optional().nullable(),
  observacao: z.string().trim().max(1000).optional().nullable(),
  dfdIds: z
    .array(z.number().int().positive())
    .min(1, "Selecione ao menos um DFD.")
    .max(1000),
});

/** Registro leve de PCA (Configurações do ADM): só nome + ano, sem unir DFDs. */
export const cadastrarPcaSchema = z.object({
  nome: z.coerce.string().trim().min(1, "Informe o nome do PCA.").max(120),
  ano: z.number().int().gte(2000).lte(2100).optional().nullable(),
});

/** Edição de um PCA já cadastrado (nome e/ou ano). Exige ao menos um campo. */
export const editarPcaSchema = z
  .object({
    nome: z.coerce.string().trim().min(1, "Informe o nome do PCA.").max(120).optional(),
    ano: z.number().int().gte(2000).lte(2100).nullable().optional(),
  })
  .refine((d) => d.nome !== undefined || d.ano !== undefined, { message: "Nada para editar." });

/** `PATCH /api/admin/pcas/[id]`: marcar como ativo (`{ativo:true}`) OU editar nome/ano. */
export const patchPcaSchema = z.union([z.object({ ativo: z.literal(true) }), editarPcaSchema]);

export type DfdMetaPayload = z.infer<typeof dfdMetaSchema>;
export type DfdItemPayload = z.infer<typeof dfdItemSchema>;
export type ProtocoloMetaPayload = z.infer<typeof protocoloMetaSchema>;
export type StartDfdPayload = z.infer<typeof startDfdSchema>;
export type AppendDfdItensPayload = z.infer<typeof appendDfdItensSchema>;
export type GerarPcaPayload = z.infer<typeof gerarPcaSchema>;
export type CadastrarPcaPayload = z.infer<typeof cadastrarPcaSchema>;
export type EditarPcaPayload = z.infer<typeof editarPcaSchema>;
export type PatchPcaPayload = z.infer<typeof patchPcaSchema>;
