-- Tudo na Mesa: a tela Protocolos legada saiu — os protocolos vivem na Mesa (aba "dfd").
-- Para não tirar acesso de ninguém, toda permissão que liberava a aba "protocolos" passa a
-- liberar a Mesa (como a 0015 fez com "pca" → "dfd"). As chaves antigas ("dashboard",
-- "protocolos") ficam no JSON e são ignoradas na leitura (abasConhecidas). Idempotente.
UPDATE `permissoes` SET `abas` = json_insert(`abas`, '$[#]', 'dfd')
	WHERE `abas` LIKE '%"protocolos"%' AND `abas` NOT LIKE '%"dfd"%';
