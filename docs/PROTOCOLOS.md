# Protocolos

A página **Protocolos** (`/painel/protocolos`) é uma **tabela única** (módulo
**curado**: campos fixos + opções gerenciáveis) que digitaliza a planilha
"Distribuição de Protocolos", no padrão dos prints: **tabela no desktop** e
**cards no mobile**.

> O **construtor de tabelas dinâmicas** genérico (listas com colunas livres)
> fica em **Ferramentas → Tabelas dinâmicas** (`/painel/ferramentas/tabelas`),
> separado de Protocolos. Ver [DESIGN.md](./DESIGN.md).

## Modelo de dados (migração `0006`)
- **`protocolos`** — `numero` (obrigatório), `data`, `orgao`, `orgao_sigla`,
  `natureza`, `responsavel`, `situacao` (enum fixo), `distribuicao`, `criado_por`,
  timestamps. Índices por situação/natureza/responsável/data.
- **`protocolo_opcoes`** — opções gerenciáveis por `campo`
  (`orgao` | `natureza` | `responsavel` | `distribuicao`), `UNIQUE(campo,valor)`.
  Semeada: naturezas (INCLUSÃO 2027/2026, EXCLUSÃO, CORREÇÃO, COMUNICAÇÃO INTERNA)
  e responsáveis (NATY, CRIS, MARIA).
- **Situação** é um enum fixo com cores próprias na UI (`<Badge>`):
  `em_analise` (âmbar), `em_andamento` (azul), `finalizado` (esmeralda),
  `devolvido` (laranja), `cancelado` (cinza).

## Funcionalidades
- **StatCards** por situação (Total, Em análise, Em andamento, Finalizados,
  Devolvidos) — clicáveis para filtrar.
- **Filtros:** busca (número/órgão) + chips de situação + avançado (natureza,
  responsável). **Paginação.**
- **Tabela** (desktop) ↔ **cards** (mobile) da mesma fonte de dados.
- **Novo/editar** em modal (bottom-sheet no mobile). Data já vem com **hoje**.
- **Cadastrar opção inline** nos selects (`CampoSelecao`).
- **FAB "Novo"** no mobile; botão no cabeçalho no desktop.

## Permissões
Todos os usuários ativos **visualizam**; **admin/gestor** criam, editam e excluem
(protocolos e opções). Guardas via `src/lib/api-auth.ts`.

## Lib e API
- `src/lib/protocolos.ts` — `SITUACOES`, `listarProtocolos`, `getResumoProtocolos`,
  `protocolosRecentes`, `criar/atualizar/excluirProtocolo`, `listar/adicionar/removerOpcao`,
  schemas zod.
- `GET/POST /api/protocolos` (lista+resumo+opções / criar) ·
  `PATCH/DELETE /api/protocolos/[id]` · `POST/DELETE /api/protocolos/opcoes`.

## Componentes
`ProtocolosView` (orquestra o módulo curado), `ProtocoloCard` (mobile),
`NovoProtocoloModal` (+ `CampoSelecao`), reutilizando `StatCard`, `Badge`,
`Avatar`, `Fab`. O construtor genérico (`TabelasIndex`/`TabelaEditor`) fica em
Ferramentas.
