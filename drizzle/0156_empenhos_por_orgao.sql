-- EMPENHOS POR ÓRGÃO: a Centi filtra os empenhos pelo ID do órgão (`idOrgao`) — o card que liga a leitura por órgão
-- (`por_orgao`) lê só os órgãos dos vínculos dele, um pedido por órgão, em vez do ano inteiro de todos.
ALTER TABLE `empenho_cards` ADD `por_orgao` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- O MAPA ID na Centi ↔ órgão gestor (o texto que a Centi devolve nos empenhos): aprendido das leituras por órgão — cada
-- resposta pedida com um ID traz os empenhos de UM órgão gestor. A importação por órgão só vale quando TODO órgão gestor dos
-- vínculos do card tem o ID conhecido (senão lê o ano inteiro de todos, como antes).
CREATE TABLE `centi_orgaos_gestores` (
  `id_centi` integer NOT NULL,
  `orgao_gestor` text NOT NULL,
  `visto_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  PRIMARY KEY(`id_centi`, `orgao_gestor`)
);
--> statement-breakpoint
CREATE INDEX `centi_orgaos_gestores_texto_idx` ON `centi_orgaos_gestores` (`orgao_gestor`);
