import { z } from "zod";
import { norm } from "./parse-dfd-comum.ts";

// Schemas de entrada do módulo DFD/PCA. Módulo SÓ-schema (sem getDb) → testável
// isoladamente no Node, como `validation.ts`.

// Itens por request (lote). Igual ao /api/upload — mantém cada db.batch dentro
// dos limites do Worker/D1; DFDs com milhares de itens vão em vários lotes.
const MAX_ROWS_POR_LOTE = 1000;
// Teto generoso de itens declarados por DFD (anti-abuso; um DFD real tem dezenas).
const MAX_ITENS_DFD = 100_000;

// Seções obrigatórias para importar um DFD (casadas pelo TÍTULO, tolerante ao número).
const SECOES_OBRIGATORIAS: { kw: string; rotulo: string }[] = [
  { kw: "JUSTIFICATIVA", rotulo: "justificativa da necessidade (Seção 3)" },
  { kw: "PREVISAO DE ENTREGA", rotulo: "previsão de entrega/execução (Seção 5)" },
  { kw: "PRIORIDADE", rotulo: "prioridade da compra/contratação (Seção 6)" },
  { kw: "FUNDAMENTACAO LEGAL", rotulo: "fundamentação legal (Seção 7)" },
];

export type DfdConferencia = {
  reparticaoId?: number | null;
  itens: { valorUnitario?: number | null }[];
  secoes: { titulo: string; texto: string }[];
};

/**
 * Requisitos OBRIGATÓRIOS para importar um DFD. Retorna a lista de faltas
 * (vazio = pode importar). É a fonte única da regra — usada no cliente (trava o
 * botão "Importar") E no servidor (rejeita a gravação). Não permite importar
 * sem: valor unitário em todos os itens, repartição, justificativa, previsão de
 * entrega, prioridade e fundamentação legal.
 */
export function faltasObrigatorias(d: DfdConferencia): string[] {
  const faltas: string[] = [];
  if (d.itens.length === 0 || !d.itens.every((i) => i.valorUnitario != null && i.valorUnitario > 0))
    faltas.push("valor unitário em todos os itens");
  if (d.reparticaoId == null) faltas.push("repartição vinculada");
  const tem = (kw: string) =>
    d.secoes.some((s) => norm(s.titulo).includes(kw) && s.texto.trim().length > 0);
  for (const s of SECOES_OBRIGATORIAS) if (!tem(s.kw)) faltas.push(s.rotulo);
  return faltas;
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
  fonte: z.enum(["certificado", "sistema"]).default("certificado"),
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
  reparticaoId: z.number().int().positive().optional().nullable(),
  protocoloId: z.number().int().positive().optional().nullable(),
  valorEstimado: z.number().nonnegative().optional().nullable(),
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
  data: textoCurtoOpc,
  interessado: textoOpc,
  documento: textoCurtoOpc,
  assunto: textoOpc,
  observacao: z.string().trim().max(2000).optional().nullable(),
  valorCapa: z.number().nonnegative().optional().nullable(),
  reparticaoId: z.number().int().positive().optional().nullable(),
  localReparticao: textoOpc,
  nomeArquivo: textoCurtoOpc,
});

/** `start-protocolo`: cria só o protocolo (capa) → devolve `protocoloId`. Os DFDs
 * são enviados depois, em streaming (`POST /api/dfd`). */
export const startProtocoloSchema = z.object({
  mode: z.literal("start-protocolo"),
  protocolo: protocoloMetaSchema,
});

/** Edição de um protocolo já gravado (banner destravado): **SÓ a repartição**
 * (roteamento/escopo). Os DADOS DA CAPA são IMUTÁVEIS — nunca editáveis (regra do
 * produto), então o servidor não aceita alterá-los. */
export const editarProtocoloSchema = z.object({
  reparticaoId: z.number().int().positive().optional().nullable(),
});

/** Vincula (ou desvincula com `null`) um DFD a um protocolo — rule 4. */
export const vincularDfdSchema = z.object({
  protocoloId: z.number().int().positive().nullable(),
});

/**
 * Edição de um DFD JÁ GRAVADO (banner destravado): `protocoloId` (vincular),
 * `reparticaoId` e/ou `secoes` (tratamento). Cada campo é opcional; `undefined` = não
 * mexe. Exige ao menos um campo presente.
 */
export const editarDfdSchema = z
  .object({
    protocoloId: z.number().int().positive().nullable().optional(),
    reparticaoId: z.number().int().positive().nullable().optional(),
    secoes: z.array(dfdSecaoSchema).max(50).optional(),
  })
  .refine(
    (d) => d.protocoloId !== undefined || d.reparticaoId !== undefined || d.secoes !== undefined,
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

export type DfdMetaPayload = z.infer<typeof dfdMetaSchema>;
export type DfdItemPayload = z.infer<typeof dfdItemSchema>;
export type ProtocoloMetaPayload = z.infer<typeof protocoloMetaSchema>;
export type StartDfdPayload = z.infer<typeof startDfdSchema>;
export type AppendDfdItensPayload = z.infer<typeof appendDfdItensSchema>;
export type GerarPcaPayload = z.infer<typeof gerarPcaSchema>;
