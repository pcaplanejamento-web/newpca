-- A tela de DFD virou uma ABA própria ("dfd") — antes ficava dentro da aba "pca".
-- Para não tirar acesso de ninguém, todo grupo/permissão que já via DFD (tinha
-- "pca") passa a enxergar a nova aba "dfd" automaticamente. Idempotente.
UPDATE `permissoes` SET `abas` = json_insert(`abas`, '$[#]', 'dfd')
	WHERE `abas` LIKE '%"pca"%' AND `abas` NOT LIKE '%"dfd"%';
