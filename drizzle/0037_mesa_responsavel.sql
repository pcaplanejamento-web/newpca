-- Perfil → Mesa: com que RESPONSÁVEL a Mesa abre para o usuário — 'eu' (só os protocolos dele: o PADRÃO), 'todos'
-- (geral, como era) ou 'sem' (os sem responsável). NULL = 'eu'. Aditiva: nenhum dado muda.
ALTER TABLE `usuarios` ADD `mesa_responsavel` text;
