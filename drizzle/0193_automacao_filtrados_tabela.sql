-- v1.296.4 — "Os filtrados na tabela" é o "Quais" inicial do "Ler do sistema" (DFDs). Sem filtro na tabela ele lê TODOS,
-- como o "Todos (geral)": trocar nos diagramas salvos não muda o que nenhuma automação faz, só deixa o filtro pronto para
-- usar. Idempotente.
UPDATE automacao_fluxos
SET grafo = replace(grafo, '"buscaDfds":"todos"', '"buscaDfds":"tabela"')
WHERE grafo LIKE '%"buscaDfds":"todos"%';
