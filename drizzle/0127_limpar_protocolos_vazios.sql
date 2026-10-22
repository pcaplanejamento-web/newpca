-- LIMPEZA ÚNICA: os protocolos que ficaram SEM DFDs antes da regra "nada fica vazio" (v1.166.1) vão à lixeira da Mesa
-- (motivo "esvaziado", com o retrato da capa) e são excluídos — também os que só guardavam o rastro de DFDs levados
-- por outro protocolo (o rastro sai em cascata).
INSERT INTO mesa_excluidos (tipo, alvo_id, numero, protocolo_id, protocolo_numero, reparticao_id, pca_id, valor, motivo, retrato, excluido_nome)
SELECT 'protocolo', p.id, p.numero, p.id, p.numero, p.reparticao_id, p.pca_id, NULL, 'esvaziado',
  json_object('numero', p.numero, 'idExterno', p.id_externo, 'data', p.data, 'interessado', p.interessado, 'assunto', p.assunto,
    'observacao', p.observacao, 'valorCapa', p.valor_capa, 'anoPca', p.ano_pca, 'reparticaoId', p.reparticao_id, 'pcaId', p.pca_id,
    'criadoEm', p.criado_em, 'atualizadoEm', p.atualizado_em, 'dfds', 0, 'itens', 0),
  'Limpeza automática'
FROM dfd_protocolos p
WHERE NOT EXISTS (SELECT 1 FROM dfds d WHERE d.protocolo_id = p.id);
--> statement-breakpoint
DELETE FROM dfd_protocolos
WHERE NOT EXISTS (SELECT 1 FROM dfds d WHERE d.protocolo_id = dfd_protocolos.id);
