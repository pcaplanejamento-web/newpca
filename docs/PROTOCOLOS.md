# Protocolos

A página **Protocolos** (`/painel/protocolos`) é uma **tabela única** com
**edição inline** (como na planilha): clicar em **Novo protocolo** adiciona uma
linha e os dados são preenchidos **na própria célula** (dropdowns coloridos para
Natureza/Responsável/Situação/Distribuição, data e texto para os demais). Módulo
**curado** (campos fixos + opções gerenciáveis), no padrão dos prints:
**tabela no desktop** e **cards editáveis no mobile**. Sem modal.

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
- **Cabeçalho** com contagem: "{total} protocolos · {em análise} em análise".
- **Colunas** (padrão da planilha): DATA, PROTOCOLO, ÓRGÃO (+ sigla), NATUREZA,
  RESPONSÁVEL (+ avatar), SITUAÇÃO, DISTRIBUIÇÃO.
- **Edição inline**: "Novo protocolo" adiciona uma linha editável; "Editar" (na
  linha) edita no lugar; célula por tipo (data, texto, seleção). **Data = hoje**.
- **Cadastrar opção inline** nos selects ("+ Nova opção…"), salva em `protocolo_opcoes`.
- **Filtros** (dropdowns): Natureza · Situação · Responsável · Período (ano).
  Busca por número/órgão vem da barra superior (`?q=`). **Paginação.**
- **Tabela** (desktop) ↔ **cards editáveis** (mobile) da mesma fonte de dados.
- **FAB "Novo"** no mobile; botão no cabeçalho no desktop.

## Permissões
Todos os usuários ativos **visualizam**; **admin/gestor** criam, editam e excluem
(protocolos e opções). Guardas via `src/lib/api-auth.ts`.

## Lib e API
- `src/lib/protocolos.ts` — `SITUACOES`, `listarProtocolos` (filtros natureza/
  situacao/responsavel/ano/q), `listarAnos`, `getResumoProtocolos`,
  `protocolosRecentes`, `criar/atualizar/excluirProtocolo`, `listar/adicionar/removerOpcao`,
  schemas zod.
- `GET/POST /api/protocolos` (lista+resumo+opções / criar) ·
  `PATCH/DELETE /api/protocolos/[id]` (usados na edição inline) ·
  `POST/DELETE /api/protocolos/opcoes`.

## Componentes
`ProtocolosView` (orquestra a tabela; edição inline via `LinhaEdicaoDesktop` e
`CardEdicaoMobile`, ambos em nível de módulo para preservar o foco ao digitar;
`CampoSelecao` para os selects com "+ Nova opção…"). `ProtocoloCard` (exibição
mobile), reutilizando `Badge` (+`naturezaTone`/`situacaoTone`), `Avatar`, `Fab`.
O construtor genérico (`TabelasIndex`/`TabelaEditor`) fica em Ferramentas.
