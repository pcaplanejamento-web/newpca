# Padrão de Design — Plataforma PCA

Padrão visual e regras de responsividade da área da equipe (`/painel/*`).
Objetivo: **100% compatível com desktop e mobile**, claro e escuro.

## Princípios
- **Cor de destaque:** esmeralda (`emerald-600` sólido; `emerald-50/500-10` para estados ativos). Superfícies neutras: `bg-white dark:bg-slate-900`, bordas `slate-200 / slate-800`, fundo `slate-100 / slate-950`.
- **Tema claro/escuro:** `@custom-variant dark` (classe `.dark` via `next-themes`). Todo componente define as duas variantes com `dark:`.
- **Um breakpoint decide a apresentação:** `lg` (1024px). Acima = desktop; abaixo = mobile. Nada de "só rolar a tabela" — cada componente tem as **duas** apresentações.
- **Toque:** alvos ≥ 40px, `active:scale`, chips/botões espaçados; nada depende de hover.

## Navegação
| | Desktop (`lg+`) | Mobile (`< lg`) |
|---|---|---|
| Primária | **Sidebar** com 2 seções: *Ferramentas* / *Administração* | **Bottom-nav** (Painel · Protocolos · Atividades · Perfil) |
| Secundária/admin | na própria sidebar (gated por papel) | tela **Perfil** lista tudo (gated por papel) |
| Topo | busca global + sino + tema | marca + sino + tema + avatar (→ Perfil) |

`AppShell` (`src/components/AppShell.tsx`) monta sidebar + topbar + `<BottomNav>`. `secoesVisiveis(role)` filtra itens por papel e é reutilizada na tela **Perfil** (`PerfilView`).

## Listas (tabela ↔ cards)
- **Desktop:** `<table>` dentro de container `rounded-2xl` (`hidden lg:block`).
- **Mobile:** grade de **cards** (`lg:hidden`). Ex.: `ProtocoloCard` — número (emerald) + badge de situação; órgão + `sigla · data`; divisor; badge de natureza + responsável (nome + `Avatar`).
- Fonte de dados única; só a renderização muda por breakpoint.

## Componentes compartilhados
- `StatCard` — tile de estatística plano (chip colorido + rótulo + valor); clicável (filtro) ou `<Link>`.
- `Badge` — status/categoria com tom fixo (`situacaoTone`) ou determinístico (`hashTone`); coerente claro/escuro.
- `Avatar` — iniciais + cor determinística por nome (`sm/md/lg`).
- `Fab` — ação flutuante (só mobile; acima da bottom-nav). No desktop a ação fica no cabeçalho.
- `EmConstrucao` / `AcessoRestrito` — estados padrão para abas em desenvolvimento / sem permissão.
- `KpiCard` — tile colorido em gradiente (dashboard do PCA). Distinto do `StatCard` (plano).

## Filtros
- Sempre visíveis: busca (cresce) + botão **Filtros** (abre avançado) + **chips** de situação roláveis.
- Avançado (colapsável): selects de natureza / responsável + limpar. Mesmo componente reflui em mobile e desktop.

## Modais / formulários
- **Bottom-sheet** no mobile, **modal central** no desktop: `fixed inset-0 flex items-end justify-center sm:items-center` + painel `rounded-t-2xl sm:rounded-2xl`, `max-h-[92vh]` com corpo rolável. Ex.: `NovoProtocoloModal`, `UploadForm`.
- Selects de opção permitem **cadastrar nova opção inline** (`CampoSelecao` → `POST /api/protocolos/opcoes`).

## Layout
- Conteúdo com `pb-24 lg:pb-8` para não ficar sob a bottom-nav.
- Grades responsivas: stats `grid-cols-2/3 → lg:grid-cols-5`; listas `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`.
- Conteúdo largo (tabelas) rola dentro do próprio container; o `body` nunca rola na horizontal.

## Verificação
Testar cada tela em **375px** e **≥1280px**, nos **dois temas**: sidebar↔bottom-nav, tabela↔cards, botão↔FAB, modal↔bottom-sheet.
