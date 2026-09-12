import { z } from "zod";
import { norm } from "./parse-dfd-comum.ts";

// Schemas de entrada do módulo DFD/PCA. Módulo SÓ-schema (sem getDb) → testável
// isoladamente no Node, como `validation.ts`.

const MAX_ITENS = 500;

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
  matricula: textoCurtoOpc,
  email: textoCurtoOpc,
  telefone: textoCurtoOpc,
  reparticaoId: z.number().int().positive().optional().nullable(),
  valorEstimado: z.number().nonnegative().optional().nullable(),
  valorTotal: z.number().nonnegative().optional().nullable(),
  nomeArquivo: textoCurtoOpc,
  secoes: z.array(dfdSecaoSchema).max(50).optional().default([]),
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
