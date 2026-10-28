-- Declarações do PCA (v1.246.0): quem emite declarações neste PCA — 'todos' (padrão: quem tem o papel), 'adm' (só os
-- Administradores) ou 'desligado' (ninguém emite; o ADM ainda consulta, baixa e cancela as já emitidas). Aditiva.
ALTER TABLE `pcas` ADD `declaracoes` text DEFAULT 'todos' NOT NULL;
