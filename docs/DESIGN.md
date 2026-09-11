# Padrão de Design — Plataforma PCA

Padrão visual e regras de responsividade da área da equipe (`/painel/*`).
Objetivo: **100% compatível com desktop e mobile**, claro e escuro.

## Princípios
- **Cor de destaque:** esmeralda (`emerald-600` sólido; `emerald-50/500-10` para estados ativos). Superfícies neutras: `bg-white dark:bg-slate-900`, bordas `slate-200 / slate-800`, fundo `slate-100 / slate-950`.
- **Tema claro/escuro:** `@custom-variant dark` (classe `.dark` via `next-themes`). Todo componente define as duas variantes com `dark:`.
- **Um breakpoint decide a apresentação:** `lg` (1024px). Acima = desktop; abaixo = mobile. Nada de "só rolar a tabela" — cada componente tem as **duas** apresentações.
- **Toque:** alvos ≥ 40px, `active:scale`, chips/botões espaçados; nada depende de hover.
- **Fundações (padrão):** fonte **Inter** (`next/font`, self-hosted, var `--font-inter` no `<body>`); ícones da biblioteca padrão **lucide-react** (reexportados como `Icon*` em `src/components/icons.tsx`); estilo com **Tailwind CSS v4**; gráficos com **Recharts**. **Sem emoji** na interface.
- **Sem cabeçalho redundante:** não repetir o nome da tela num título + descrição; a aba ativa no menu já indica onde o usuário está. Mantêm-se apenas ações, dados úteis (contagens) e estados (acesso restrito / vazio / sucesso). Render **sem flash** (tema aplicado antes da pintura — shim de `__name` no `layout.tsx`).

## Navegação
| | Desktop (`lg+`) | Mobile (`< lg`) |
|---|---|---|
| Rápida | **Sidebar** com 2 seções: *Ferramentas* / *Administração* | **Bottom-nav** (Painel · Protocolos · Atividades · Perfil) |
| Menu completo | na própria sidebar (gated por papel) | **Menu hambúrguer** → drawer com a **mesma navegação da sidebar** (`NavLinks` + `UserMenu`), gated por papel |
| Topo | busca global + sino + tema | **hambúrguer** + marca + sino + tema + avatar (→ Perfil) |

`AppShell` (`src/components/AppShell.tsx`) monta sidebar (desktop) + topbar + drawer do hambúrguer (mobile) + `<BottomNav>`. `secoesVisiveis(role)` filtra itens por papel e alimenta a sidebar **e** o drawer. **Acesso ao Perfil:** o **card do usuário** (avatar + nome, no rodapé da sidebar/drawer, `UserMenu`) é um link para `/painel/perfil`; no mobile também há a aba *Perfil* na bottom-nav e o avatar da topbar. A tela **Perfil** (`PerfilView`) é só conta/preferências/sair (a navegação completa fica no hambúrguer/sidebar).

**Layout desktop:** aproveitar toda a largura — evitar coluna estreita centralizada (ex.: Perfil usa `grid lg:grid-cols-2`). No mobile, empilhar.

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
- `Skeleton` / `SkeletonCard` / `SkeletonLinhas` — placeholders com **shimmer** (`.animate-shimmer`, keyframe em `globals.css`). Usados no **skeleton de rota** (`src/app/painel/loading.tsx`, aparece na navegação) e nas listas enquanto carregam (Usuários, Tabelas, Itens). Padrão completo (skeleton/shimmer/otimista/offline): pendências = optimistic UI e offline/PWA.

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

## Design System por tokens (Fase 4) — componentes desta fase
Biblioteca única em `/design-system` (`Catalogo`). **Só se usa componente do DS**; nenhum
componente fixa cor **neutra** (só `var(--token)`); a única hex crua é **semântica/dados**.
- **Campos** (`src/components/Field.tsx`): `TextField`, `PasswordField` (cadeado + olho),
  `SearchField` (busca + limpar) e `Checkbox` — rótulo forte, ícone à esquerda, **anel de
  foco accent** (glow), superfície preenchida, toque ≥44px. Referência viva: tela de acesso
  (`AuthForm`, login/cadastro).
- **Button**: variante **`accent`** (preenchida + `shadow-accent`) para CTAs; primária segue
  neutra (`--text`).
- **Dropdown** (base de todos os popovers): renderiza em **portal** (`position: fixed`) e
  **abre para cima/baixo** limitando a altura à viewport — filtros/menus **nunca cortados**.
- **Filtro de data** das tabelas = **mesmo** seletor de Período (`PeriodoCorpo`: presets +
  ano + meses + intervalo) + ordenar. `DataTable` deriva os anos por coluna.
- **Gráficos** (`charts/`): eixos/grade/cursor **lidos dos tokens** via `useChartTokens()`
  (reavalia ao trocar tema ou no preview do ADM); séries na paleta `CHART_COLORS`.
- **Ícones controlados pelo ADM** (`lucide`, renderizam já editados): **espessura** (`--icon-stroke`),
  **preenchido** (duotone via `[data-icons=filled] .lucide { fill: currentColor; fill-opacity }` — o
  lucide é só contorno), **animação** (`[data-icon-anim=hover]`) e **tom** global opcional
  (`[data-icon-tint] .lucide { color: var(--icon-tint) }`; por padrão o ícone herda a cor do contexto).
  Aba "Ícones" no painel do ADM + Theme Playground; injeção via `layout.tsx` + `aparenciaToCss` (só
  número/hex validados).
- **Controle do ADM** (`/painel/aparencia` + Theme Playground): cores (claro/escuro), raio,
  densidade, motion, **elevação dos cards** (Anel `--ring` ↔ Sombra suave `--shadow-soft`,
  via `:root[data-elevation=soft]`) e **estilo dos KPIs** (Contorno ↔ Preenchido, via
  `[data-kpi=filled] .kpi-card` com `color-mix` na cor do KPI). Injeção server-side sem flash
  (`layout.tsx`) + validação Zod (allowlist anti-XSS em `lib/theme.ts`).

## Auditoria de componentização (Fase 5) — primitivos e migrações
Passe para tornar o DS de fato a fonte única (sem cor **neutra** hardcoded; toda UI por componente).
- **Tokens de feedback** `--ok/--warn/--danger/--info` (`globals.css`) + `feedbackVar()` (`lib/semantic.ts`);
  fundos suaves por `color-mix`. **`--scrim`** (escurece o fundo de modais/drawers nos 2 temas).
- **`Callout`** (novo): banner de feedback (info/sucesso/alerta/erro) por token — fonte única de avisos/erros.
- **`Button`** ganha a variante **`danger`** (ações destrutivas). **`Pager`** (novo): paginação única
  (anterior/próxima + x/y); `DataTable` e as telas migradas usam-no (fim dos pagers digitados à mão).
- **`Modal`** tokenizado (scrim/superfície/texto por token; fechar = `Button` icon). **`Badge`**/**`StatCard`**:
  mapa de tons → um token por tom (`toneVar`), fundo/contorno por `color-mix` (sem slate/emerald/... hardcoded).
- **Telas migradas** (sem cor hardcoded, controles por componente): `UsuariosAdmin` (→`DataTable`+`Button`+
  `Badge`+`Callout`), `TabelaEditor` e `ProtocolosView` (grades editáveis inline — mantêm a tabela própria,
  mas botões→`Button`, busca→`SearchField`, paginação→`Pager`, chips→`Badge`, avisos→`Callout`, tudo por token).
- **Pendente (próxima fatia):** `ItemTable` (troca do motor por `DataTable` client-side depende de rever o
  teto de 200 linhas do `getItens` na home pública), `PerfilView`/`UploadForm` (botões/inputs), `AppShell`
  (busca→`SearchField`, notificações→`Dropdown`), app-pages (`ferramentas` card inline→`LinkCard`), glyphs
  `▲▼↑↓`→`Icon*`, remoção do `Badge` legado quando ninguém usar `Tone`.
