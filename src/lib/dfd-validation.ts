import { z } from "zod";

// Schemas de entrada do módulo DFD/PCA. Módulo SÓ-schema (sem getDb) → testável
// isoladamente no Node, como `validation.ts`.

const MAX_ITENS = 500;

const textoOpc = z.string().trim().max(4000).optional().nullable();
const textoCurtoOpc = z.string().trim().max(255).optional().nullable();

const dfdItemSchema = z.object({
  item: z.number().int().optional().nullable(),
  codigo: textoCurtoOpc,
  descricao: textoOpc,
  unidade: z.string().trim().max(100).optional().nullable(),
  quantidade: z.number().optional().nullable(),
});

/** Importa (ou substitui, por `numero`) um DFD parseado no navegador. */
export const dfdImportSchema = z.object({
  numero: z.coerce.string().trim().min(1, "Número do DFD ausente no arquivo.").max(50),
  planejamento: textoCurtoOpc,
  tipo: textoCurtoOpc,
  objeto: textoOpc,
  orgaoEntidade: textoCurtoOpc,
  setorRequisitante: textoOpc,
  siglaSetor: z.string().trim().max(60).optional().nullable(),
  responsavel: textoCurtoOpc,
  reparticaoId: z.number().int().positive().optional().nullable(),
  valorEstimado: z.number().nonnegative().optional().nullable(),
  nomeArquivo: textoCurtoOpc,
  itens: z.array(dfdItemSchema).min(1, "O DFD não tem itens.").max(MAX_ITENS),
});

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

export type DfdImportPayload = z.infer<typeof dfdImportSchema>;
export type GerarPcaPayload = z.infer<typeof gerarPcaSchema>;
