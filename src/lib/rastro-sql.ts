import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import { dfdPassagens, dfds, reparticoes } from "../db/schema.ts";

/**
 * RASTRO do DFD sobrescrito entre protocolos — os comandos como BUILDERS do Drizzle (sem getDb: testados
 * pelo driver D1 sobre `node:sqlite`, DENTRO de `db.batch`). Builders, e não `db.run(sql…)`: no driver D1 do
 * Drizzle um comando cru COM parâmetros quebra dentro de `db.batch` ("reading 'bind'") — derrubava a
 * protocolação (start-dfd) e o "mover DFD de protocolo".
 *
 * - `retratoRastro`: o DFD de nº `numero` está VIVO em OUTRO protocolo e vai para `destinoId` ⇒ o de origem
 *   guarda o retrato leve da versão que tinha (lido do PRÓPRIO banco, no mesmo lote do cabeçalho — sem corrida
 *   entre duas protocolações): um por protocolo + nº (a última passagem vale). Não faz nada se o DFD não
 *   existe, não tem protocolo ou já está no destino. Tem de rodar ANTES do upsert do cabeçalho.
 * - `limparRastroDestino`: o DFD volta a estar vivo no `destinoId` ⇒ sai o rastro antigo dele ali.
 */
type Db = DrizzleD1Database<typeof schema>;

export function retratoRastro(db: Db, numero: string, destinoId: number, usuarioId: number | null) {
  // As chaves na MESMA ordem das colunas da tabela (exigência do insert…select do Drizzle).
  const retrato = db
    .select({
      id: sql<number>`NULL`.as("id"),
      protocoloId: dfds.protocoloId,
      dfdNumero: dfds.numero,
      planejamento: dfds.planejamento,
      tipo: dfds.tipo,
      sigla: reparticoes.codigo,
      totalItens: dfds.totalItens,
      valorTotal: dfds.valorTotal,
      usuarioId: sql<number | null>`${usuarioId}`.as("usuario_id"),
      criadoEm: sql<string>`CURRENT_TIMESTAMP`.as("criado_em"),
    })
    .from(dfds)
    .leftJoin(reparticoes, eq(reparticoes.id, dfds.reparticaoId))
    .where(and(eq(dfds.numero, numero), isNotNull(dfds.protocoloId), ne(dfds.protocoloId, destinoId)));
  return db
    .insert(dfdPassagens)
    .select(retrato)
    .onConflictDoUpdate({
      target: [dfdPassagens.protocoloId, dfdPassagens.dfdNumero],
      set: {
        planejamento: sql`excluded.planejamento`,
        tipo: sql`excluded.tipo`,
        sigla: sql`excluded.sigla`,
        totalItens: sql`excluded.total_itens`,
        valorTotal: sql`excluded.valor_total`,
        usuarioId: sql`excluded.usuario_id`,
        criadoEm: sql`excluded.criado_em`,
      },
    });
}

export function limparRastroDestino(db: Db, numero: string, destinoId: number) {
  return db.delete(dfdPassagens).where(and(eq(dfdPassagens.protocoloId, destinoId), eq(dfdPassagens.dfdNumero, numero)));
}
