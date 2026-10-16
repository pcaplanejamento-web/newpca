import { eq, sql } from "drizzle-orm";
import { configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";
import { type GrupoOrcamento, lerGruposOrcamento } from "./orcamento-grupos";

// Os GRUPOS ORÇAMENTÁRIOS no banco: blob `configuracoes` id=1, chave `orcamentoGrupos` (sem migração). Falhou = nenhum
// grupo (a tela segue por unidade).
export async function getGruposOrcamento(): Promise<GrupoOrcamento[]> {
  try {
    return lerGruposOrcamento((await lerBlobConfiguracoes()).orcamentoGrupos);
  } catch {
    return [];
  }
}

/** Grava a lista (as chaves irmãs do blob ficam). */
export async function gravarGruposOrcamento(grupos: GrupoOrcamento[], usuarioId: number): Promise<GrupoOrcamento[]> {
  const blob = await lerBlobConfiguracoes();
  const valor = lerGruposOrcamento(grupos);
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, orcamentoGrupos: valor }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  return valor;
}
