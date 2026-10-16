-- Os MÓDULOS (Configurações → Módulos) agrupam as telas; o grupo passa a liberar MÓDULOS (`modulos` = JSON de ids;
-- NULL = o grupo antigo, que segue pelas telas avulsas de `abas` até o ADM escolher os módulos) e define se o CHAT é
-- liberado nele (`chat`, 1 = liberado — o comportamento de antes). Aditiva.
ALTER TABLE `grupos` ADD `modulos` text;
--> statement-breakpoint
ALTER TABLE `grupos` ADD `chat` integer DEFAULT 1 NOT NULL;
