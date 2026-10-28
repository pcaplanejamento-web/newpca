import { z } from "zod";
import { LIMITES_CARD } from "./empenho-cards-core.ts";
import { MAX_LINHAS_PARTE, MAX_PARES_PARTE } from "./importacao-partes-core.ts";

/** A configuração de um CARD de empenhos. A régua completa é `motivoCardInvalido` (core). */
export const cardEmpenhoSchema = z.strictObject({
  nome: z.string().trim().min(1).max(LIMITES_CARD.nome),
  descricao: z.string().trim().max(LIMITES_CARD.descricao),
  cor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  urlBase: z.string().trim().max(200),
  endpoint: z.string().trim().min(1).max(LIMITES_CARD.endpoint),
  uf: z.string().trim().min(1).max(LIMITES_CARD.uf),
  tenant: z.string().trim().min(1).max(LIMITES_CARD.tenant),
  parametros: z.string().trim().min(2).max(LIMITES_CARD.parametros),
  anos: z.array(z.number().int()).min(1).max(LIMITES_CARD.anos),
  porOrgao: z.boolean().default(false),
});

/** A CONFIGURAÇÃO CENTRAL das importações (Configurações → Importações). A régua completa é `motivoConfigImportacoes` (core). */
export const configImportacoesSchema = z.strictObject({
  ativa: z.boolean(),
  frequenciaMin: z.number().int(),
  diasUteis: z.boolean(),
  horaInicio: z.string().trim(),
  horaFim: z.string().trim(),
  quedaSoma: z.number().int(),
  quedaRegistros: z.number().int(),
  removidos: z.enum(["marcar", "apagar"]),
  /** Quais importações atualizam sozinhas (id do card → anos); ausente = mantém a gravada; null = todas (o legado). */
  automaticas: z.record(z.string().regex(/^[1-9]\d{0,9}$/), z.array(z.number().int()).max(10)).nullable().optional(),
});

/** O card NOVO: o tipo (empenhos | liquidações | pagamentos), o nome e, opcional, o card do MESMO tipo de onde copiar os vínculos
 * (empenhos) ou os órgãos (liquidações). O resto começa no padrão. */
export const criarCardSchema = z.strictObject({
  tipo: z.enum(["empenhos", "liquidacoes", "pagamentos"]).optional(),
  nome: z.string().trim().min(1).max(LIMITES_CARD.nome),
  copiarDe: z.number().int().positive().nullable().optional(),
});

/** Os VÍNCULOS do card — a lista INTEIRA (a régua completa é `motivoVinculosInvalidos`, core). */
export const vinculosCardSchema = z.strictObject({
  vinculos: z
    .array(
      z.strictObject({
        orgaoGestor: z.string().trim().min(1).max(200),
        unidade: z.string().max(300).nullable(),
        acao: z.string().max(400).nullable(),
        orgaoId: z.number().int().positive(),
        reparticaoId: z.number().int().positive().nullable(),
      }),
    )
    .max(LIMITES_CARD.vinculos),
});

/** O TESTE do card (a configuração em curso, ainda não salva) num ano. */
export const testarCardSchema = z.strictObject({
  edicao: cardEmpenhoSchema,
  ano: z.number().int().min(2000).max(2100),
});

/** O token da ABA que conduz o lote (uma aba por vez — `comandoConduzir`). */
const condutor = z.string().regex(/^[A-Za-z0-9-]{16,64}$/);

/** A IMPORTAÇÃO MANUAL de um card (passo a passo, conduzida pela tela): iniciar um lote (`modo` "unidades" = só o
 * catálogo da Centi), ler UMA página, concluir (conferir e promover), PAUSAR (a leitura parou numa falha: o lote fica aberto
 * e solto para qualquer aba continuar) ou cancelar. */
const pedidoPagina = {
  lote: z.number().int().positive(),
  condutor,
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pagina: z.number().int().min(1).max(500),
};

export const importarCardSchema = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("iniciar"), ano: z.number().int().min(2000).max(2100), condutor, modo: z.enum(["dados", "unidades", "liquidacoes", "pagamentos"]).optional(), porOrgao: z.boolean().optional() }),
  // A página pela TELA, em três ações (nenhuma lê o JSON inteiro no servidor — o limite de CPU do plano gratuito): `baixar`
  // devolve a resposta da Centi crua · `falha` registra a leitura que falhou no navegador · `parte` guarda as linhas já
  // lidas, em partes de tamanho fixo (conferidas no servidor — `linhasDaParte`).
  z.strictObject({ acao: z.literal("baixar"), ...pedidoPagina }),
  z.strictObject({
    acao: z.literal("falha"),
    ...pedidoPagina,
    mensagem: z.string().trim().min(1).max(500),
    status: z.number().int().min(0).max(999).nullable(),
    bytes: z.number().int().min(0).nullable(),
    ms: z.number().int().min(0).nullable(),
  }),
  z.strictObject({
    acao: z.literal("parte"),
    ...pedidoPagina,
    parte: z.number().int().min(0).max(10_000),
    partes: z.number().int().min(1).max(10_000),
    passo: z.number().int().positive().nullable(),
    // As tuplas (uma por linha) — o tipo de cada campo é conferido depois, sem o custo do Zod por campo.
    linhas: z.array(z.unknown()).max(MAX_LINHAS_PARTE),
    // Os IGUAIS ao gravado: só a chave e a assinatura (conferidos no banco — `paresDaParte`/`comandoParesIguais`).
    iguais: z.array(z.unknown()).max(MAX_PARES_PARTE).optional(),
    resumo: z
      .strictObject({
        status: z.number().int().min(0).max(999).nullable(),
        bytes: z.number().int().min(0).nullable(),
        ms: z.number().int().min(0).nullable(),
        recebidos: z.number().int().min(0),
        recusados: z.number().int().min(0),
        repetidos: z.number().int().min(0),
        total: z.number().int().min(0).nullable(),
        reparado: z.boolean(),
      })
      .nullable(),
  }),
  z.strictObject({ acao: z.literal("concluir"), lote: z.number().int().positive(), condutor, aceitarQueda: z.boolean().optional() }),
  z.strictObject({ acao: z.literal("pausar"), lote: z.number().int().positive(), condutor }),
  z.strictObject({ acao: z.literal("cancelar"), lote: z.number().int().positive(), condutor: condutor.optional(), motivo: z.string().trim().max(300).optional(), falhou: z.boolean().optional() }),
]);

/** Excluir do banco: PASSOS de uma importação ou IMPORTAÇÕES inteiras (vários de uma vez). */
export const excluirImportacaoSchema = z.union([
  z.strictObject({ lote: z.number().int().positive(), passos: z.array(z.number().int().positive()).min(1).max(5000) }),
  z.strictObject({ lotes: z.array(z.number().int().positive()).min(1).max(200) }),
]);
