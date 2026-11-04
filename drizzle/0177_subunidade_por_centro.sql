-- 0177 (v1.270.0): a SUBUNIDADE passa a ser definida SÓ pelo CENTRO DE CUSTO — saem os vínculos Próprio e Marcado.
-- `reparticoes.vinculo_subunidade` passa a guardar o MODO: 'unico' (um centro de custo para toda a unidade — a subunidade
-- do DFD é a própria unidade) | 'subunidades' (um por subunidade). O centro de custo é obrigatório: as subunidades sem
-- centro saem; a escolha manual do DFD (`dfds.subunidade_id`) é zerada e a coluna fica DORMENTE. Idempotente.
DELETE FROM subunidades
  WHERE CASE WHEN json_valid(centros_custo) THEN json_array_length(centros_custo) ELSE 0 END = 0;
--> statement-breakpoint
UPDATE reparticoes
  SET vinculo_subunidade = CASE
    WHEN (SELECT COUNT(*) FROM subunidades s WHERE s.reparticao_id = reparticoes.id) >= 2 THEN 'subunidades'
    ELSE 'unico'
  END;
--> statement-breakpoint
UPDATE subunidades
  SET nome = (SELECT r.codigo FROM reparticoes r WHERE r.id = subunidades.reparticao_id)
  WHERE (SELECT r.vinculo_subunidade FROM reparticoes r WHERE r.id = subunidades.reparticao_id) = 'unico';
--> statement-breakpoint
UPDATE dfds SET subunidade_id = NULL WHERE subunidade_id IS NOT NULL;
