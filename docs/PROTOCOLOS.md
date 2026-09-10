# Protocolos e Listas (tabelas dinâmicas)

Em **`/painel/protocolos`** (requer login). Evoluiu de uma tabela fixa para um
**construtor de tabelas**: várias listas, colunas personalizáveis e edição na linha.

## Conceito
- **Tabelas** (`tabelas`) — cada "lista de protocolos" é uma tabela. Exibidas como **cards**; "Nova tabela" cria outra.
- **Colunas** (`colunas`) — definidas pelo usuário, com **tipo**: `texto`, `selecao`, `data`, `numero`.
- **Opções** (`coluna_opcoes`) — valores das colunas de seleção (cadastráveis na tela).
- **Linhas** (`linhas`) — valores num JSON (`dados`) indexado pelo id da coluna.

A 1ª tabela já vem semeada: **"Distribuição de Protocolos"** com Data, Protocolo,
Secretaria/Órgão, Natureza, Responsável, Situação, Distribuição (migração `0005`).

## Funcionalidades
- **Cards** de tabelas; criar/renomear/excluir tabela.
- **Configurar tabela**: adicionar/excluir colunas (com tipo) e gerenciar opções das colunas de seleção.
- **Edição na própria linha**: "+ Adicionar linha" (colunas de **data** já vêm com **hoje**); "Editar" edita inline; cada célula respeita o tipo (input/date/number/select).
- **Seleção com "➕ Nova opção…"** direto na célula. Busca + paginação.
- Valores de seleção viram **badges coloridos** (cor determinística por valor).

## Permissões
Todos os usuários ativos visualizam; **admin/gestor** criam/editam tabelas, colunas, opções e linhas.

## API
- Tabelas: `GET/POST /api/tabelas`, `GET/PATCH/DELETE /api/tabelas/[id]`.
- Colunas: `POST /api/tabelas/[id]/colunas`, `PATCH/DELETE /api/colunas/[id]`.
- Opções: `POST/DELETE /api/colunas/[id]/opcoes`.
- Linhas: `GET/POST /api/tabelas/[id]/linhas`, `PATCH/DELETE /api/linhas/[id]`.

## Próximo passo
- **Importar** a aba `.xlsx` para dentro de uma tabela (mapeando as colunas e
  cadastrando as opções encontradas).
