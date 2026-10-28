-- v1.240.0: a atualização automática e as regras da conferência das importações da Centi passam a ser UMA configuração
-- central (Configurações → Importações; blob `configuracoes`, chave `importacoes`). Semeia a chave a partir do card que já
-- as tinha (o ligado primeiro, depois o configurado, depois o mais antigo) — só se ainda não existir. As colunas
-- ativa/frequencia_min/dias_uteis/hora_inicio/hora_fim/queda_soma/queda_registros/removidos de `empenho_cards` ficam
-- DORMENTES (sem código; nada é apagado).
INSERT INTO configuracoes (id, dados) SELECT 1, '{}' WHERE NOT EXISTS (SELECT 1 FROM configuracoes WHERE id = 1);
UPDATE configuracoes
SET dados = json_set(
  CASE WHEN json_valid(dados) THEN dados ELSE '{}' END,
  '$.importacoes',
  json_object(
    'ativa', json(CASE WHEN c.ativa = 1 THEN 'true' ELSE 'false' END),
    'frequenciaMin', c.frequencia_min,
    'diasUteis', json(CASE WHEN c.dias_uteis = 1 THEN 'true' ELSE 'false' END),
    'horaInicio', c.hora_inicio,
    'horaFim', c.hora_fim,
    'quedaSoma', c.queda_soma,
    'quedaRegistros', c.queda_registros,
    'removidos', c.removidos
  )
)
FROM (
  SELECT ativa, frequencia_min, dias_uteis, hora_inicio, hora_fim, queda_soma, queda_registros, removidos
  FROM empenho_cards
  ORDER BY ativa DESC, configurado_em IS NULL, id
  LIMIT 1
) AS c
WHERE configuracoes.id = 1
  AND (NOT json_valid(configuracoes.dados) OR json_extract(configuracoes.dados, '$.importacoes') IS NULL);
