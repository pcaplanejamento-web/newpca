-- 0178 (v1.271.0): no modo "Um centro de custo para toda a unidade" ('unico') o centro é da UNIDADE e a subunidade é
-- ESCOLHIDA no DFD. Os centros passam a `reparticoes.centro_custo` (JSON string[]; a coluna da 0172 é reaproveitada) e a
-- linha que a 0177 deixou com o nome da unidade sai. Idempotente: só move a linha que ainda tem centros.
UPDATE reparticoes
  SET centro_custo = (SELECT s.centros_custo FROM subunidades s WHERE s.reparticao_id = reparticoes.id
                       AND json_valid(s.centros_custo) AND json_array_length(s.centros_custo) > 0 LIMIT 1)
  WHERE vinculo_subunidade = 'unico'
    AND EXISTS (SELECT 1 FROM subunidades s WHERE s.reparticao_id = reparticoes.id
                AND json_valid(s.centros_custo) AND json_array_length(s.centros_custo) > 0);
--> statement-breakpoint
UPDATE reparticoes SET centro_custo = '[]'
  WHERE vinculo_subunidade <> 'unico' OR centro_custo IS NULL OR NOT json_valid(centro_custo);
--> statement-breakpoint
DELETE FROM subunidades
  WHERE reparticao_id IN (SELECT id FROM reparticoes WHERE vinculo_subunidade = 'unico')
    AND json_valid(centros_custo) AND json_array_length(centros_custo) > 0;
