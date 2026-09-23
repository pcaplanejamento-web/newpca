/**
 * RASTRO do DFD sobrescrito entre protocolos — o SQL PURO (sem getDb; testado em `node:sqlite`). Os comandos
 * recebem a TAG do template (o `sql` do Drizzle no servidor; nos testes, uma que monta texto + parâmetros),
 * então o MESMO texto roda nos dois.
 *
 * - `retratoRastro`: o DFD de nº `numero` está VIVO em OUTRO protocolo e vai para `destinoId` ⇒ o de origem
 *   guarda o retrato leve da versão que tinha (lido do PRÓPRIO banco, no mesmo lote do cabeçalho — sem corrida
 *   entre duas protocolações): um por protocolo + nº (a última passagem vale). Não faz nada se o DFD não
 *   existe, não tem protocolo ou já está no destino. Tem de rodar ANTES do upsert do cabeçalho.
 * - `limparRastroDestino`: o DFD volta a estar vivo no `destinoId` ⇒ sai o rastro antigo dele ali.
 */
export type TagSql<T> = (partes: TemplateStringsArray, ...valores: unknown[]) => T;

export function retratoRastro<T>(q: TagSql<T>, numero: string, destinoId: number, usuarioId: number | null): T {
  return q`INSERT INTO dfd_passagens (protocolo_id, dfd_numero, planejamento, tipo, sigla, total_itens, valor_total, usuario_id, criado_em)
    SELECT d.protocolo_id, d.numero, d.planejamento, d.tipo, r.codigo, d.total_itens, d.valor_total, ${usuarioId}, CURRENT_TIMESTAMP
    FROM dfds d LEFT JOIN reparticoes r ON r.id = d.reparticao_id
    WHERE d.numero = ${numero} AND d.protocolo_id IS NOT NULL AND d.protocolo_id <> ${destinoId}
    ON CONFLICT (protocolo_id, dfd_numero) DO UPDATE SET planejamento = excluded.planejamento, tipo = excluded.tipo,
      sigla = excluded.sigla, total_itens = excluded.total_itens, valor_total = excluded.valor_total,
      usuario_id = excluded.usuario_id, criado_em = excluded.criado_em`;
}

export function limparRastroDestino<T>(q: TagSql<T>, numero: string, destinoId: number): T {
  return q`DELETE FROM dfd_passagens WHERE protocolo_id = ${destinoId} AND dfd_numero = ${numero}`;
}
