import { z } from "zod";
import { LIMITES_FALHA, TIPOS_FALHA } from "./erro-tela-core.ts";

// Schema do RELATÓRIO da falha de uma tela (`POST /api/erros`) — os MESMOS limites do núcleo (`relatorioDaFalha`).
// Módulo SÓ-schema (sem getDb) → testável no Node.

const campo = (max: number) => z.string().max(max).default("");

export const falhaTelaSchema = z.object({
  tipo: z.enum(TIPOS_FALHA),
  nome: campo(LIMITES_FALHA.nome),
  mensagem: campo(LIMITES_FALHA.mensagem),
  digest: campo(LIMITES_FALHA.digest),
  pilha: campo(LIMITES_FALHA.pilha),
  caminho: z.string().max(LIMITES_FALHA.caminho),
  automatica: z.boolean().default(false),
  instante: campo(LIMITES_FALHA.instante),
});

export type FalhaTela = z.infer<typeof falhaTelaSchema>;
