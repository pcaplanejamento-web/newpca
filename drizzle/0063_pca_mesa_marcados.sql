-- MESA DO PCA com os MARCADOS (aditiva): por PCA, mostrar também na Mesa do PCA os protocolos marcados com o ano dele
-- (`ano_pca`) que ainda estão na Mesa do sistema — só uma VISÃO (nada é movido; nada conta no PCA até ser incorporado).
-- Default 0 = desligado: a Mesa do PCA segue exatamente como antes.
ALTER TABLE `pcas` ADD `mesa_marcados` integer DEFAULT 0 NOT NULL;
