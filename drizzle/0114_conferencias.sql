-- CONFERÊNCIA GUARDADA: o Estado de cada DFD/protocolo da Mesa calculado UMA vez, com a ASSINATURA de entrada (só vale com a
-- mesma assinatura). Aditiva; começa vazia — nada muda até a primeira conferência.
CREATE TABLE `conferencias` (
  `tipo` text NOT NULL,
  `alvo_id` integer NOT NULL,
  `assinatura` text NOT NULL,
  `resultado` text NOT NULL,
  `em` text DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (`tipo`, `alvo_id`)
);
