import { z } from "zod";

// FROTAS — a validação das rotas (só schema; testável).

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (AAAA-MM-DD).");
const codigo = z.string().regex(/^\d{12}$/, "Código de contrato inválido (12 dígitos).");

/** A configuração da Vólus: o segredo chega em texto puro (vazio = mantém o atual) e é cifrado. */
export const configFrotaSchema = z.object({
  clientId: z.string().trim().max(200),
  clientSecret: z.string().trim().max(500).default(""),
  ativa: z.boolean(),
  frequenciaMin: z.number().int().min(30).max(10_080),
  diasUteis: z.boolean(),
  horaInicio: z.number().int().min(0).max(23),
  horaFim: z.number().int().min(1).max(24),
  diasRecentes: z.number().int().min(7).max(366),
  alertas: z.object({
    consumoPct: z.number().int().min(5).max(200),
    precoPct: z.number().int().min(5).max(200),
    horasEntre: z.number().int().min(0).max(48),
    tanquePct: z.number().int().min(0).max(100),
    kmMaximo: z.number().int().min(100).max(100_000),
  }),
});

export const contratosFrotaSchema = z.object({
  contratos: z
    .array(
      z.object({
        codigo,
        nome: z.string().trim().max(200),
        sigla: z.string().trim().max(20),
        produto: z.enum(["combustivel", "manutencao", "ambos"]),
        orgaoId: z.number().int().positive().nullable(),
        ativo: z.boolean(),
      }),
    )
    .max(100),
});

export const unidadesFrotaSchema = z.object({
  unidades: z.array(z.object({ chave: z.string().min(1).max(200), reparticaoId: z.number().int().positive().nullable() })).max(2000),
});

export const importarFrotaSchema = z
  .object({ contrato: codigo, tipo: z.enum(["abastecimento", "manutencao"]), inicio: dia, fim: dia })
  .refine((p) => p.inicio <= p.fim, "O início vem antes do fim.")
  .refine((p) => Date.parse(p.fim) - Date.parse(p.inicio) <= 366 * 86_400_000, "No máximo um ano por pedido.");

/** A edição dos VEÍCULOS: só o que mudou de cada placa (ausente = fica; null = limpa). */
export const veiculosEdicaoSchema = z.object({
  alteracoes: z
    .array(
      z.object({
        placa: z.string().regex(/^[A-Z0-9]{1,16}$/, "Placa inválida."),
        tipo: z.enum(["veiculo", "maquina"]).optional(),
        classificacaoId: z.number().int().positive().nullable().optional(),
        ano: z.number().int().min(1950).max(2100).nullable().optional(),
        situacao: z.enum(["ativo", "inativo"]).optional(),
        origem: z.enum(["proprio", "contrato"]).nullable().optional(),
        fipe: z.number().min(0).max(100_000_000).nullable().optional(),
        locacao: z.number().min(0).max(100_000_000).nullable().optional(),
        contrato: z.string().trim().max(120).nullable().optional(),
        capacidadeTanque: z.number().min(0).max(100_000).nullable().optional(),
        reparticaoId: z.number().int().positive().nullable().optional(),
        observacao: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
});

export const classificacoesFrotaSchema = z.object({
  classificacoes: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        nome: z.string().trim().min(1, "Informe o nome.").max(60),
        cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
      }),
    )
    .max(100),
});
