import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { type ConfigImportacoes, lerConfigImportacoes } from "./empenho-cards-core";
import { lerBlobConfiguracoes } from "./integracoes";

// A CONFIGURAÇÃO CENTRAL das importações da Centi no banco (blob `configuracoes` id=1, chave `importacoes`). Lida SEM cache:
// desligar a atualização automática ou mudar uma regra vale na próxima execução. Falha ao ler = o padrão (desligada).
export async function getConfigImportacoes(): Promise<ConfigImportacoes> {
  try {
    return lerConfigImportacoes((await lerBlobConfiguracoes()).importacoes);
  } catch {
    return lerConfigImportacoes(undefined);
  }
}

export async function gravarConfigImportacoes(cfg: ConfigImportacoes, usuarioId: number): Promise<ConfigImportacoes> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerConfigImportacoes(cfg);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, importacoes: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  return valor;
}
