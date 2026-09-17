-- 0029 — Promover unidade→órgão, rebaixar órgão→unidade e ÓRGÃO QUE TAMBÉM É UNIDADE.
-- Um órgão pode funcionar TAMBÉM como unidade (os dois status): para isso ele ganha uma
-- unidade "própria" que o representa — `reparticoes.orgao_proprio = 1`. Só existe UMA por
-- órgão e só é permitida quando o órgão não tem unidades-filhas comuns.
--
-- Promover/rebaixar movem a identidade entre as tabelas `reparticoes`⇄`orgaos` (create+delete
-- de UMA linha, com as mesmas travas de vínculo do ponto 8). Nada de FK é reapontado.
--
-- Aditivo; default 0 preserva o legado (nenhum órgão é dual; toda unidade é filha comum).
ALTER TABLE reparticoes ADD orgao_proprio integer DEFAULT 0 NOT NULL;
