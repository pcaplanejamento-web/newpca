-- Visões do orçamento: unidade, ações e órgão passam a ser decididos SÓ pelos Vínculos. Tira essas dimensões dos filtros
-- já gravados (a visão segue com o restante — função, programa, elemento, código, ficha, fonte).
UPDATE orcamento_visoes
SET filtros = json_remove(filtros, '$.orgao', '$.unidade', '$.acao', '$.orgaoSistema', '$.unidadeSistema'),
    atualizado_em = CURRENT_TIMESTAMP
WHERE json_valid(filtros)
  AND (json_type(filtros, '$.orgao') IS NOT NULL OR json_type(filtros, '$.unidade') IS NOT NULL
    OR json_type(filtros, '$.acao') IS NOT NULL OR json_type(filtros, '$.orgaoSistema') IS NOT NULL
    OR json_type(filtros, '$.unidadeSistema') IS NOT NULL);
--> statement-breakpoint
UPDATE orcamento_visoes SET filtros = '{}' WHERE NOT json_valid(filtros);
