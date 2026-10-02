import { z } from "zod";
import { CAPACIDADES_ESCRITA, CAPACIDADES_LEITURA, CAPACIDADES_OPERAR, ESTADOS_EXECUCAO, ESTADOS_PASSO, RECEITAS } from "./automacao-core.ts";

// AUTOMAÇÃO — os corpos das rotas (Zod; puro/testável). Tetos firmes: nada sem limite chega ao banco.
const CAPACIDADES = [...CAPACIDADES_LEITURA, ...CAPACIDADES_OPERAR, ...CAPACIDADES_ESCRITA] as const;
const idReceita = z.enum(RECEITAS.map((r) => r.id) as [string, ...string[]]);
const chave = z.string().trim().min(1).max(120);
const texto = (max: number) => z.string().trim().max(max);

export const configAutomacaoSchema = z
  .object({
    ativa: z.boolean().optional(),
    receitas: z.record(idReceita, z.object({ ativa: z.boolean() })).optional(),
    operacao: z
      .object({
        moduleKey: z.number().int().positive(),
        guid: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        assinatura: z.string().regex(/^\d{0,12}$/),
      })
      .optional(),
    /** O modelo da Tela Protocolo (normalizado por `coerceModeloTela`); null apaga. */
    telaProtocolo: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .refine((v) => v == null || JSON.stringify(v).length <= 65536, "Modelo grande demais."),
  })
  .strict();

export const criarExecucaoSchema = z.object({
  receita: idReceita,
  ensaio: z.boolean(),
  /** Os parâmetros da execução (destino, formato…) — resumidos; nunca PDFs nem segredos. */
  entrada: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).default({}),
  passos: z
    .array(z.object({ chave, capacidade: z.enum(CAPACIDADES), alvo: texto(300).nullable() }))
    .min(1)
    .max(2000)
    .refine((ps) => new Set(ps.map((p) => p.chave)).size === ps.length, "Passo repetido."),
});

export const estadoExecucaoSchema = z.object({ estado: z.enum(ESTADOS_EXECUCAO) });

export const passosSchema = z.object({
  passos: z
    .array(z.object({ chave, estado: z.enum(ESTADOS_PASSO), resultado: texto(500).nullish(), erro: texto(500).nullish() }))
    .min(1)
    .max(50),
});

/** O alvo de uma escrita "anexar": o protocolo da Centi (Id + nº + ano) e a descrição do documento. */
export const alvoAnexoSchema = z.object({
  id: z.string().regex(/^\d{1,12}$/),
  numero: z.string().regex(/^\d{1,12}$/),
  ano: z.string().regex(/^\d{4}$/).nullable(),
  descricao: z.string().trim().min(1).max(250),
});

export const autorizarSchema = z.object({ chave, capacidade: z.enum(CAPACIDADES_ESCRITA), alvo: alvoAnexoSchema });

export const consumirSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), capacidade: z.enum(CAPACIDADES_ESCRITA), alvo: alvoAnexoSchema });

export const registrarSchema = z.object({
  execucaoId: z.number().int().positive(),
  chave,
  capacidade: z.enum(CAPACIDADES_ESCRITA),
  alvo: alvoAnexoSchema,
  centiDocumento: z.string().regex(/^\d{1,15}$/).nullable(),
  protocoloId: z.number().int().positive().nullable(),
});
