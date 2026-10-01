import { z } from "zod";
import { TIPOS_DFD } from "./avaliacao-core.ts";
import { LIMITES_HISTORICO as L } from "./historico-compra-core.ts";

/**
 * Validação (Zod) do módulo CATÁLOGO — fonte única cliente+servidor. Módulo puro
 * (sem getDb) → testável isoladamente, como `dfd-validation.ts`. Os tipos de DFD são
 * o conjunto FIXO de `avaliacao-core` (DFD-S/R/O/E).
 */

// Conjunto de tipos de DFD de um catálogo/item (subconjunto dos TIPOS_DFD).
export const tiposDfdSchema = z.array(z.enum(TIPOS_DFD)).default([]);

/** Normaliza um conjunto de tipos: só válidos, sem duplicados, na ordem canônica. */
export function normalizarTipos(tipos: string[]): string[] {
  return TIPOS_DFD.filter((t) => tipos.includes(t));
}

// Uma linha de item vinda do parser do PDF (código já normalizado no cliente).
export const catalogoItemImportSchema = z.object({
  sequencial: z.number().int().nullable().default(null),
  codigo: z.string().trim().min(1).max(60),
  codigoRaw: z.string().trim().max(120).nullable().default(null),
  descricao: z.string().trim().min(1).max(8000),
  unidade: z.string().trim().max(60).nullable().default(null),
});
export type CatalogoItemImport = z.infer<typeof catalogoItemImportSchema>;

const MAX_ROWS = 1000; // por lote (o cliente envia 200; o servidor aceita até 1000)

// Início do envio: cria um catálogo novo OU atualiza um existente (`catalogoId`).
// `excluirItens` = ids de itens de OUTROS catálogos a remover ANTES do upsert (resolução
// dos conflitos "substituir": excluir o existente e importar o novo).
const startCatalogoSchema = z.object({
  mode: z.literal("start-catalogo"),
  catalogoId: z.number().int().positive().nullable().default(null), // alvo p/ atualizar (req 5)
  nome: z.string().trim().min(1).max(200),
  tiposPadrao: tiposDfdSchema,
  totalItens: z.number().int().min(0),
  // Sem itens novos só quando compartilha itens existentes (a rota confere — "Nada para importar").
  rows: z.array(catalogoItemImportSchema).max(MAX_ROWS),
  excluirItens: z.array(z.number().int().positive()).max(20000).default([]),
  // Itens EXISTENTES (idênticos) a COMPARTILHAR neste catálogo — o mesmo item nos dois.
  compartilharItens: z.array(z.number().int().positive()).max(20000).default([]),
  // Pasta do catálogo NOVO (a tela da pasta cria dentro dela); numa atualização, ignorada.
  pastaId: z.number().int().positive().nullable().default(null),
});

// Lotes seguintes de um envio já iniciado.
const appendCatalogoSchema = z.object({
  mode: z.literal("append-catalogo-itens"),
  catalogoId: z.number().int().positive(),
  desde: z.number().int().min(0),
  rows: z.array(catalogoItemImportSchema).min(1).max(MAX_ROWS),
});

// Criar um catálogo VAZIO (manual) — só nome + tipos padrão, sem itens.
const criarCatalogoSchema = z.object({
  mode: z.literal("criar-catalogo"),
  nome: z.string().trim().min(1).max(200),
  tiposPadrao: tiposDfdSchema,
  pastaId: z.number().int().positive().nullable().default(null),
});

// ---- HISTÓRICO DE COMPRA (migração `0075`): o catálogo tipo 'historico' = contratos + itens comprados ----
const txt = (max: number) => z.string().trim().max(max).nullable().default(null);
const numOpc = z.number().finite().nullable().default(null);
const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .default(null);

export const contratoHistoricoSchema = z.object({
  idContrato: z.string().trim().min(1).max(L.idContrato),
  numeroContrato: txt(L.numeroContrato),
  idLicitacao: txt(L.idLicitacao),
  numeroLicitacao: txt(L.numeroLicitacao),
  orgao: txt(L.orgao),
  unidadeGestora: txt(L.unidadeGestora),
  credor: txt(L.credor),
  valorContrato: numOpc,
  dataAssinatura: dataIso,
  dataPublicacao: dataIso,
  modalidade: txt(L.modalidade),
  protocolo: txt(L.protocolo),
  objeto: txt(L.objeto),
  natureza: txt(L.natureza),
  detalhamento: txt(L.detalhamento),
});

export const compraHistoricoSchema = z.object({
  ordem: z.number().int().min(0),
  idContrato: z.string().trim().min(1).max(L.idContrato),
  processo: txt(L.processo),
  codigo: z.string().trim().regex(/^\d{1,60}$/, "Código do produto inválido."),
  sequencial: z.number().int().nullable().default(null),
  descricao: z.string().trim().min(1).max(L.descricao),
  qtdContratada: numOpc,
  qtdAditada: numOpc,
  qtdEmpenhada: numOpc,
  qtdOfEmpenhar: numOpc,
  saldoEmpenhar: numOpc,
  valorUnitario: numOpc,
  valorContratado: numOpc,
  valorEmpenhado: numOpc,
  saldoValorEmpenhar: numOpc,
  qtdLiquidada: numOpc,
  qtdLiquidadaAnulada: numOpc,
  qtdEmpenhadaAnulada: numOpc,
  saldoLiquidar: numOpc,
});
export type ContratoHistoricoImport = z.infer<typeof contratoHistoricoSchema>;
export type CompraHistoricoImport = z.infer<typeof compraHistoricoSchema>;

/** Por requisição (o limite de consultas por invocação do D1): contratos 6 por INSERT, itens 4 por INSERT. */
export const MAX_CONTRATOS_LOTE = 100;
export const MAX_COMPRAS_LOTE = 150;

// Cria o catálogo de HISTÓRICO (vazio) e grava o 1º lote de contratos.
const startHistoricoSchema = z.object({
  mode: z.literal("start-historico"),
  nome: z.string().trim().min(1).max(200),
  pastaId: z.number().int().positive().nullable().default(null),
  totalItens: z.number().int().min(1).max(200000),
  contratos: z.array(contratoHistoricoSchema).max(MAX_CONTRATOS_LOTE),
});

// Lotes seguintes: contratos e/ou itens (idempotente — repetir um lote não duplica; a rota recusa o lote vazio).
const appendHistoricoSchema = z.object({
  mode: z.literal("append-historico"),
  catalogoId: z.number().int().positive(),
  contratos: z.array(contratoHistoricoSchema).max(MAX_CONTRATOS_LOTE).default([]),
  rows: z.array(compraHistoricoSchema).max(MAX_COMPRAS_LOTE).default([]),
});

export const catalogoOpSchema = z.discriminatedUnion("mode", [
  startCatalogoSchema,
  appendCatalogoSchema,
  criarCatalogoSchema,
  startHistoricoSchema,
  appendHistoricoSchema,
]);
export type CatalogoOp = z.infer<typeof catalogoOpSchema>;
export type StartCatalogoPayload = z.infer<typeof startCatalogoSchema>;

// Criar UM item manualmente num catálogo (o código é a chave única global).
export const criarItemSchema = z.object({
  catalogoId: z.number().int().positive(),
  codigo: z.string().trim().min(1).max(60),
  descricao: z.string().trim().min(1).max(8000),
  unidade: z.string().trim().max(60).nullable().default(null),
  tipos: tiposDfdSchema,
});
export type CriarItemPayload = z.infer<typeof criarItemSchema>;

// Pré-checagem de conflito de código (unicidade global) antes de importar.
export const verificarCatalogoSchema = z.object({
  catalogoId: z.number().int().positive().nullable().default(null), // catálogo-alvo (excluído da checagem)
  codigos: z.array(z.string().trim().min(1)).min(1).max(20000),
});
export type VerificarCatalogoPayload = z.infer<typeof verificarCatalogoSchema>;

// Conferência dos itens de UM DFD contra o catálogo (referência). Usada no preview de
// import/protocolação; o servidor consulta só os códigos do DFD (escalável). `codigo`
// pode vir vazio (item sem código → sem veredito). O `tipo` é o texto do DFD (o núcleo
// deriva o curto DFD-S/R/O/E) e habilita a checagem de tipo incompatível.
const MAX_ITENS_CONFERIR = 20000;
export const conferirCatalogoSchema = z.object({
  tipo: z.string().trim().max(120).nullable().default(null),
  itens: z
    .array(
      z.object({
        codigo: z.string().trim().max(60).nullable().default(null),
        descricao: z.string().trim().max(8000).nullable().default(null),
        unidade: z.string().trim().max(60).nullable().default(null),
      }),
    )
    .max(MAX_ITENS_CONFERIR),
});
export type ConferirCatalogoPayload = z.infer<typeof conferirCatalogoSchema>;

const corHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");

// Editar um catálogo já gravado (nome, tipos padrão, cor da capa e/ou a pasta — `null` tira da pasta).
export const patchCatalogoSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    tiposPadrao: z.array(z.enum(TIPOS_DFD)).optional(),
    cor: corHex.nullable().optional(),
    pastaId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => v.nome !== undefined || v.tiposPadrao !== undefined || v.cor !== undefined || v.pastaId !== undefined, {
    message: "Nada para atualizar.",
  });

// PASTA de catálogos: nome + cor + os catálogos dela (a lista inteira — quem sai dela volta à grade).
export const pastaCatalogoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da pasta.").max(120),
  cor: corHex,
  catalogos: z.array(z.number().int().positive()).max(2000).optional(),
});
export const patchPastaCatalogoSchema = pastaCatalogoSchema.partial().refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar." });
export type PastaCatalogoPayload = z.infer<typeof pastaCatalogoSchema>;
export type PatchCatalogoPayload = z.infer<typeof patchCatalogoSchema>;

// Definir (SET) ou MESCLAR (união) os tipos de DFD de um conjunto de itens (por item ou em
// massa). `mesclar` é usado quando um item idêntico é importado com um tipo novo: o item
// existente GANHA o tipo, sem perder os que já tinha.
export const patchItensTiposSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(20000),
  tipos: z.array(z.enum(TIPOS_DFD)),
  modo: z.enum(["definir", "mesclar"]).default("definir"),
});
export type PatchItensTiposPayload = z.infer<typeof patchItensTiposSchema>;

// Editar UM item de catálogo (descrição/unidade/tipos); o código é imutável.
export const patchItemSchema = z
  .object({
    descricao: z.string().trim().min(1).max(8000).optional(),
    unidade: z.string().trim().max(60).nullable().optional(),
    tipos: z.array(z.enum(TIPOS_DFD)).optional(),
  })
  .refine((v) => v.descricao !== undefined || v.unidade !== undefined || v.tipos !== undefined, {
    message: "Nada para atualizar.",
  });
export type PatchItemPayload = z.infer<typeof patchItemSchema>;

// Remover um item de UM catálogo (desfaz o compartilhamento) — corpo do DELETE do item.
export const removerDoCatalogoSchema = z.object({ catalogoId: z.number().int().positive() });
export type RemoverDoCatalogoPayload = z.infer<typeof removerDoCatalogoSchema>;

// Compartilhar itens EXISTENTES (idênticos) num catálogo — o mesmo item nos dois, sem duplicar.
export const compartilharItensSchema = z.object({
  catalogoId: z.number().int().positive(),
  itemIds: z.array(z.number().int().positive()).min(1).max(20000),
});
export type CompartilharItensPayload = z.infer<typeof compartilharItensSchema>;
