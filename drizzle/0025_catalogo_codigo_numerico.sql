-- Códigos do catálogo passam a ser salvos SÓ com dígitos (sem pontos/separadores).
-- Alinha os itens JÁ gravados: `codigo_raw` (exibição) recebe o `codigo` canônico
-- (que já é só números). Os parsers de PDF/XLSX passam a gravar `codigo_raw = codigo`.
UPDATE catalogo_itens SET codigo_raw = codigo;
