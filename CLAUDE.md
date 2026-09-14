# CLAUDE.md — Regras de engenharia (Plataforma PCA)

Guia para IA e pessoas que editam este repositório. Contexto de **produto** fica em
[`docs/`](./docs) (ROADMAP, PROTOCOLOS, DESIGN, FASE1-AUTENTICACAO, AUDITORIA). Este
arquivo cobre **como** mexer no código sem quebrar nada.

## O que é
Plataforma interna do PCA (Plano de Contratações Anual) da Prefeitura de Rio Verde.
**Next.js 16** (App Router, React 19, `force-dynamic`) + **Tailwind v4** + **Cloudflare
Workers** via **OpenNext** + **D1** (SQLite) com **Drizzle** + **Zod**. Em produção:
`governarv.com.br`.

## Comandos
```bash
npm run dev          # desenvolvimento (Next)
npm run typecheck    # tsc --noEmit  (precisa de cloudflare-env.d.ts — rode cf-typegen antes)
npm run lint         # Biome (lint)
npm run lint:fix     # Biome: aplica correções seguras
npm test             # node:test (type stripping nativo) — lógica pura + migrações
npm run cf-typegen   # gera cloudflare-env.d.ts a partir do wrangler.jsonc (offline)
npm run db:generate  # drizzle-kit: gera SQL a partir do schema
```
Node **>= 20** (CI usa 22; veja `.nvmrc`). pt-BR em código, comentários e UI.

## Deploy — SÓ via GitHub Actions
- `git push origin main` dispara `.github/workflows/deploy.yml` → `scripts/publish.sh`
  (migrações `--remote` + `cf-typegen` + build OpenNext + deploy).
- **Nunca** rode `wrangler`/`next build`/`opennextjs-cloudflare` no sandbox de ferramentas
  (travam). `git`, `gh`, `npm`, `node` funcionam.
- **Portão de qualidade** (em `deploy.yml` e no `ci.yml` de PRs): `lint` e `test`
  **bloqueiam**; `typecheck` é **informativo** (`continue-on-error`) porque o build usa
  `ignoreBuildErrors` (divergências de tipos workerd×DOM). Tornar o typecheck bloqueante
  quando o baseline de tipos estiver 100% limpo.

## Banco de dados (D1 + Drizzle)
- **`getDb()` (`src/lib/db.ts`) só em escopo de request** (Server Components
  `force-dynamic`, Route Handlers, Server Actions) — usa `getCloudflareContext()`.
- **Migrações = SQL curado** em `drizzle/` (é o `out` do drizzle **e** o `migrations_dir`
  do `wrangler.jsonc`). Ao gerar com `db:generate`, confira o SQL.
  - **≤ 100 parâmetros vinculados por statement** (limite do D1). Ver `src/app/api/upload`
    (lotes de 7×14=98).
  - **Evite `UNION ALL` longo** em migração (o D1 rejeita "compound SELECT"); use
    `INSERT ... VALUES`.
- Schema em `src/db/schema.ts`. Teste da cadeia de migrações: `tests/migrations.test.ts`
  (aplica `drizzle/*.sql` em `node:sqlite`).

## Autenticação e autorização
- Criptografia pura em **`src/lib/password.ts`** (Web Crypto; sem deps de request/DB —
  por isso é testável): PBKDF2-SHA256, **100.000 iterações = TETO do Cloudflare Workers**
  (não aumente; `deriveBits` falha acima disso).
- Sessão/cookie em `src/lib/auth.ts` (D1 guarda só o hash do token; cookie `pca_session`
  httpOnly+Secure). `getUsuarioAtual()` retorna o usuário ativo ou `null`.
- **Guardas** em `src/lib/api-auth.ts`: `exigirUsuario`, `exigirEditor` (admin/gestor),
  `exigirAdmin`. Uso: `const g = await exigirX(); if ("erro" in g) return g.erro;`.
- **REGRA FIRME:** o **admin sempre vê TODAS as abas/telas** — nunca bloqueável por
  nível de acesso (bypass na navegação e nas guardas). Preserve isso em qualquer RBAC futuro.

## Grupos, Permissões e Repartições (RBAC por grupo)
- **Grupos** (`grupos`): um usuário pertence a vários (`usuario_grupos`); escolhe o **grupo
  ativo** no cabeçalho (cookie `pca_grupo`). Cada grupo tem **1 permissão** e acessa um conjunto
  de **repartições** (`grupo_reparticoes`). Telas admin: `/painel/grupos`, `/painel/permissoes`,
  `/painel/reparticoes`. Helpers em **`src/lib/grupos.ts`** (`getGrupoAtivo/Id`, `abasPermitidas`,
  `getReparticaoContexto`, `definirGrupoAtivo/ReparticaoAtiva`); abas gerenciáveis em `src/lib/abas.ts`.
- **Permissões** (`permissoes.abas` = JSON de keys): definem quais **abas de módulo** (dashboard/
  protocolos/pca/**dfd**) o grupo vê. **Admin ignora** (vê todas — regra firme). A nav em `AppShell`
  filtra por `abasPermitidas`. Abas em `src/lib/abas.ts`.
- **Dados por grupo:** `protocolos` e `protocolo_opcoes` carregam `grupo_id`; **todas** as funções de
  `src/lib/protocolos.ts` escopam pelo grupo ativo (`getGrupoAtivoId`, sentinela `-1` = nada). Criar
  exige grupo ativo.
- **Repartições** (`reparticoes`: codigo+nome+ordem + **numero_interessado** e **responsavel_dfd** — cadastro do ADM,
  nullable, migração `0017`): lista global **reordenável** (tabela com arrasto,
  componente `ReorderTable` — Pointer Events, mouse+toque). CRUD em `ReparticoesAdmin` (`reparticaoSchema`).
  `responsavel_dfd` guarda os **responsáveis por DFDs** como **JSON** (coluna reaproveitada, sem migração nova):
  **N padrões** + **N temporários**. Todo responsável tem **nome, matrícula, função** e uma **nomeação** (ato:
  `portaria`/`decreto`/`lei` + número + **link** do documento). O temporário tem, além disso, **período** início/fim.
  No período de um temporário, **ele é o efetivo** (os padrões ficam em cinza); fora do período, o temporário fica em
  cinza e os padrões voltam — com **estados** (Agendado/Vigente/Encerrado). Lógica pura/testável em
  `src/lib/reparticao-responsaveis.ts` (`parseResponsaveis`/`serializeResponsaveis` tolerantes a TODOS os formatos
  anteriores; `temporariosVigentes`/`responsaveisVigentes`/`padroesInativos`/`estadoTemporario`); UI no componente
  `ResponsaveisEditor` (sub-campos compartilhados entre padrão e temporário). Repartição ativa por cookie
  `pca_reparticao`, entre as do grupo ativo, na ordem definida. Rotas em `/api/admin/reparticoes*` e
  `/api/reparticoes/ativo`.
- **Repartição escopa os dados (além de acesso):** a repartição ativa do head **filtra** protocolos e
  PCA. `getReparticaoFiltro()` devolve `{id,codigo}` da ativa, ou **`null` em "Geral"** (= todas, sem
  filtro). **Órgão = repartição:** o campo "Órgão" do protocolo é escolhido da lista de repartições
  (guarda `orgao`=nome, `orgao_sigla`=código); as listagens de `protocolos.ts` (`escopo()`) filtram por
  `orgao_sigla = código`. No **PCA**, cada `unidade` recebe `reparticao_id` da repartição ativa no
  import (`/api/upload`; Geral → NULL, e re-import em Geral preserva a atual); `/painel/pca` lista via
  `getUnidades(rep?.id)`. O dashboard público (`/`) **não** é escopado.
- Migrações `0009` (grupos/permissões), `0010` (repartições) e `0011` (`unidades.reparticao_id`) semeiam
  o grupo/repartição **"Geral"** e migram os dados/usuários existentes para lá — por isso o uso atual não muda.

## PCA por DFD (importar e compilar) — migrações `0012`/`0013`/`0016`
- **DFD** = um formulário (`.xlsx`) lido **no navegador** (`src/lib/parse-dfd.ts`, com `raw:false` p/ o texto
  formatado — preserva o código longo — e o núcleo puro/testável `parse-dfd-core.ts`); vira `dfds`/`dfd_itens`
  e é vinculado a uma **repartição** por **auto-match da sigla do Setor Requisitante** (com fallback pelo NOME
  da secretaria, p/ siglas divergentes; confirmável no import).
- **Captura completa (migração `0013`):** o parser extrai TODO o formulário — cabeçalho (nº/planejamento/
  tipo/objeto/órgão/setor/responsável/**matrícula/e-mail/telefone**), a tabela da Seção 4 com **valor unitário
  e total por item** + **total geral**, o **valor estimado** (nota "R$"), e o **texto das demais seções
  numeradas** (2,3,5,6,7,8,9…) num coletor genérico salvo em `dfds.secoes` (JSON). O detalhe (`/painel/pca/dfd/[id]`)
  mostra tudo ao clicar em "Ver".
- **Importa `.xlsx` E `.pdf`:** o cabeçalho + seções são **compartilhados** em `src/lib/parse-dfd-comum.ts`
  (`extrairCabecalho`/`coletarSecoes`, agnósticos de formato). `.xlsx` → `parse-dfd`/`parse-dfd-core` (SheetJS,
  tabela por coluna da matriz). `.pdf` → `parse-dfd-pdf`/`parse-dfd-pdf-core` (**pdf.js `pdfjs-dist`**, importado
  DINAMICAMENTE no navegador — fora do bundle do Worker; `next.config` transpila e faz `alias canvas:false`; o
  build roda com `next build --webpack`): a tabela é remontada **por posição de coluna**, atribuindo cada trecho
  ao item de `y` mais próximo e **rejuntando o código quebrado em 2 linhas**. Ambos → mesmo `DfdParseado`.
- **Tela própria de DFD** (`/painel/dfds` = `DfdsView`, aba **`dfd`**) — separada do PCA. `PcaModuleView` ficou só com
  **Planilha (PCA)** + **PCA** (o seletor de "Gerar PCA" recebe TODOS os DFDs). A tabela de DFDs (`DfdsView`) tem
  **filtro/ordenação em todas as colunas** (cada uma com `value`) e **somatório de itens e valores** no rodapé,
  reativo aos filtros (`DataTable` `resumo={(linhas)=>…}`). Migração `0015` concede a aba `dfd` a quem já tinha `pca`.
- **Conferência/edição única (`DfdConferir`) + banner (`Modal`):** o CORPO de conferência/edição do DFD é UM
  componente **controlado** — `DfdConferir` (select "Setor / Repartição" + bloco **Tratamento** + lista de faltas
  ao vivo + `DfdView` read-only refletindo as edições). É o MESMO no **import avulso** (`DfdUploadForm`) e **por DFD
  do protocolo** (aparece como um **banner AO LADO**, não dentro — `Modal` mestre-detalhe). A **visualização** do DFD gravado (`DfdsView`, **clique na linha** →
  `GET /api/dfd/[id]`) usa `DfdView` puro. Um único mapeador `DfdParseado`→`DfdVisual` (`toVisual`, em `DfdConferir`).
  **Só grava ao confirmar**. O `Modal` renderiza via **portal em `document.body`** (escapa do `transform`/`overflow`
  do `Tabs`) com **cabeçalho fixo** + corpo rolável + **rodapé fixo** (`rodape`); larguras `md/lg/xl/full` e
  **`bloqueado`** (sem X/Esc/backdrop) durante a gravação.
- **Regras obrigatórias (`faltasObrigatorias`, `src/lib/dfd-validation.ts`) — fonte única cliente+servidor:** não
  importa sem **valor unitário em todos os itens**, **repartição**, **justificativa** (§3), **previsão de entrega**
  (§5), **prioridade** (§6) e **fundamentação legal** (§7). O banner **mostra o DFD e lista o que falta**, mas
  **bloqueia o botão** "Importar"; o `POST /api/dfd` rejeita (422) por garantia.
- **Tratamento + normalização das seções (`src/lib/normalize.ts` + `src/lib/dfd-tratamento.ts`, puros/testáveis):**
  ao conferir, `normalizarSecoesDfd` **padroniza automaticamente** PRIORIDADE (só `ALTA`/`MÉDIA`/`BAIXA` —
  `normPrioridade`) e PREVISÃO DE ENTREGA (`MÊS/AAAA` ou `ANUAL/AAAA` p/ recorrente — `normPrevisao`); o que não dá
  para padronizar fica para **tratar** à mão. O bloco **Tratamento** do `DfdConferir` edita PRIORIDADE (`Segmented`),
  PREVISÃO (mês + ano + toggle ANUAL) e FUNDAMENTAÇÃO LEGAL (`TextField`, padrão "Lei 14.133/2021") — só componentes
  do DS; o texto canônico volta para `secoes[i].texto` e flui pelo envio normal (sem migração). Cada DFD ganha um
  **estado** (`estadoDfd`: com erro › editado › regularizado › regular › pendente; cor por token `--danger/--info/
  --warn/--ok/--muted`). Setor **é** repartição (rótulo unificado; a "regularização" é gravar `reparticaoId`).
- **Edição de PCA** (`pcas`/`pca_dfds`) une DFDs selecionados **por referência** (DFDs novos não mudam uma
  edição já gerada) — plano consolidado da Prefeitura, **escopo por repartição** (sem `grupo_id`, como as
  `unidades`; listagem via `getReparticaoFiltro`). Lógica em **`src/lib/dfd.ts`** (upsert por `numero`; batch
  de `dfd_itens` a **11×9=99** params; `excluirDfd` bloqueia se o DFD está em alguma edição). Validação
  só-schema em `src/lib/dfd-validation.ts`.
- **Escrita de DFD em LOTES (escala a milhares de itens):** `dfd.ts` decompõe em `upsertDfdCabecalho` (cabeçalho +
  apaga itens antigos + 1º lote) e `appendDfdItens` (lotes seguintes, **11×9=99** params). `POST /api/dfd` é uma
  **discriminated union em `mode`** (`start-dfd` | `append-dfd-itens`, `dfdOpSchema`) — o cliente
  (`src/lib/importar-dfd.ts`, `enviarDfdEmLotes`) envia em lotes de 200 com **barra de progresso** (`Progress`).
  `start-dfd` re-valida `faltasObrigatorias` (defeituoso nunca grava, 422); idempotente por `numero` (retomável).
- **Gravação garantida (all-or-nothing por DFD):** `enviarDfdEmLotes` faz **retry** de falha transitória (rede/5xx;
  4xx não) e, se um lote falhar de vez, **apaga o DFD parcial** (`DELETE`) — não fica DFD pela metade. `appendDfdItens`
  é **idempotente** (apaga `sequencial > desde` antes de gravar → retry não duplica). O banner de importação fica
  **`bloqueado`** (Modal sem X/Esc/backdrop, sem Cancelar) + `beforeunload` enquanto grava — não dá pra interromper.
- **Segurança (escopo por repartição em TODA escrita):** `POST /api/dfd` (`start-dfd`/`append`), `PATCH`/`DELETE
  /api/dfd/[id]`, `PATCH`/`DELETE /api/protocolo/[id]` e os `GET/[id]` checam `reparticaoId == null || lista.some(...)`
  com a `lista` de `getReparticaoContexto` (**admin = todas**) — 403 fora do escopo. `start-dfd` tem **anti-sequestro**
  por `numero` (não sobrescreve DFD de repartição inacessível). O `PATCH /api/dfd/[id]` (`editarDfdSchema`) vincula a
  protocolo E/OU edita **repartição/seções** (não move p/ repartição inacessível); o `PATCH /api/protocolo/[id]`
  (`editarProtocoloSchema`) edita a **capa** (sem `numero`). Teto de `totalItens` (100k) e `rows` (1000/lote) no Zod;
  Drizzle parametriza (sem SQL injection).
- Rotas: `POST /api/dfd` (lotes), `GET`/`DELETE`/`PATCH /api/dfd/[id]`, `POST /api/pca`, `DELETE /api/pca/[id]`
  (envelope+guardas). UI em `/painel/pca` = `PcaModuleView` (3 abas); detalhes em `/painel/pca/dfd|edicao/[id]`.
- **Protocolo → DFDs (migração `0016`) — importação em STREAMING:** um **protocolo** (o "processo") empacota
  **vários DFDs** (escala a **milhares**); todo DFD vem de um protocolo. Entidade `dfd_protocolos` (escopo por
  **repartição**, `numero`=Número Processo único; sem `grupo_id`) + `dfds.protocoloId` nullable (FK `set null`).
  O **PDF do protocolo** é lido no navegador em 2 passos, sem OOM: (1) **índice leve** — `abrirPdf` (documento pdf.js
  streamável, `pageItems` sob demanda) + `indexarProtocolo` (só o texto por página → capa + DFDs por "Número DFD"
  com o cabeçalho; a geometria é descartada por página); (2) ao **Protocolar**, DFD a DFD: `parseDfdDoProtocolo`
  (parse completo — matcher **O(n log n)**) → `faltasObrigatorias` → `enviarDfdEmLotes` (start-dfd/append) → descarta.
  Barra de **progresso** + **relatório final** (importados / bloqueados com motivo); **defeituoso nunca é
  protocolado**. `casarReparticao` (`reparticao-match.ts`) casa por **sigla → nome → órgão**. Acesso em
  `protocolo.ts` (`iniciarProtocolo` = `POST /api/protocolo` `start-protocolo`; totais **ao vivo**), `GET`/`DELETE
  /api/protocolo/[id]`, `PATCH /api/dfd/[id]` (vincular/desvincular). UI na **aba Protocolos** de `DfdsView`
  (`ProtocoloUploadForm` → banner: metadados + **repartição do protocolo pelo Interessado** + tabela dos DFDs (sempre
  cheia) + **seleção/edição em massa** [repartição/prioridade/previsão/fundamentação nos N selecionados] + **estado
  por DFD**. **Clicar numa linha abre o DFD (`DfdConferir`) como um banner AO LADO** — o `Modal` **mestre-detalhe**
  (`lateral`) põe os dois banners lado a lado no desktop [o principal desliza p/ a esquerda; `grid-template-columns`
  + `max-width` animados por token de motion] e um por vez no mobile; trocar de DFD atualiza o lateral
  (`animate-fade-in-up`). Analisa/normaliza
  em background até `CAP_ANALISE=300`, **cacheando o parse por índice** (`Map<idx, DfdParseado>`) para as **edições
  sobreviverem** ao envio; `protocolar` usa a cópia do cache e só re-parseia o que faltou. `ProtocoloView` read-only,
  catalogado). **Separa as vias** (`classificarPdf`, em `parse-protocolo-pdf-core.ts`): protocolo (capa OU ≥2
  "Número DFD") não entra pela aba DFDs e o DFD avulso não entra pela aba Protocolos; documento estranho é recusado.
  Sem nova aba.
- **Importação por botão único + lançador (`Dropzone`):** cada tela de importação (Protocolos, DFD, Planilha PCA) tem
  **um botão "Importar" à direita** que abre um **banner lançador**; no protocolo ele é **dividido ao meio** (soltar/
  escolher o PDF **|** criar protocolo manualmente). Isso libera espaço para as tabelas: as de **DFDs/Protocolos**
  (telas DFD e PCA) usam `DataTable fillHeight` (linhas por página automáticas p/ preencher a altura do display no
  desktop, sem scroll do navegador); as demais tabelas ficam em **≤20 linhas/página**.
- **Protocolação bloqueada com DFD defeituoso:** o botão "Protocolar" fica **desabilitado** enquanto algum DFD estiver
  com **erro** (ou ainda analisando) — não se protocola um processo com DFDs defeituosos (o `POST` segue validando por
  garantia). Com o **banner do DFD aberto ao lado**, a tabela do protocolo **se ajusta** (colunas sem `minWidth` e sem
  a coluna "Situação") p/ caber sem scroll lateral. Estado **"regularizado automaticamente" = verde** (`estadoCor`).
  A tabela do protocolo **agrupa por estado** (erros no topo p/ tratar; o DFD muda de grupo ao mudar de estado); a
  **barra de edição em massa** fica FIXA no rodapé do banner (tamanho constante: controle do valor em cima; seletor
  do campo + Aplicar + Limpar embaixo).
- **Editar DFD/protocolo JÁ GRAVADO (mesmo banner da importação, com cadeado):** clicar num DFD/protocolo da lista
  abre o **MESMO componente** da importação (`DfdConferir` p/ DFD; `ProtocoloView` editável p/ protocolo), começando
  **TRAVADO** (read-only). Um **cadeado** (`Modal.acoesCabecalho`) ao lado do X destrava (com **confirmação**) → os
  campos ficam editáveis e um **"Salvar alterações"** grava **direto no D1** (`PATCH /api/dfd/[id]` edita repartição/
  seções via `atualizarDfdCampos`; `PATCH /api/protocolo/[id]` edita a capa via `atualizarProtocolo`) e o
  `router.refresh()` reflete em todas as telas. Só **editor** (admin/gestor) vê o cadeado; escopo por repartição em
  toda escrita. `DfdConferir` e `Segmented` ganham `readOnly`/`disabled` para o estado travado.
- **DFD ao lado do protocolo gravado (mesma animação da importação):** o banner do protocolo gravado é
  **mestre-detalhe** igual ao da importação — clicar num DFD abre `DfdConferir` como **LATERAL à direita** (mesmo
  componente, animação e comportamento; a única diferença é o **cadeado**). O `Modal.lateral` ganhou
  `acoesCabecalho` (cadeado próprio do lateral); em `DfdsView` o estado de edição do DFD é **reusado** — o modal
  avulso do DFD só aparece **fora** de um protocolo (`open={!!dfdView && !protoView}`), senão vira o lateral do
  protocolo; `fecharProto` fecha também o DFD do lateral.

## Rotas de API (`src/app/api/**`)
- Envelope padrão **`{ ok: true, ... }`** / **`{ ok: false, error }`**.
- Helpers em **`src/lib/http.ts`**: `ok(data?)`, `erro(msg, status)`, `parseCorpo(schema, req)`
  (valida Zod e devolve 422 pronto). **Rotas novas/editadas devem usá-los** + as guardas
  `exigir*` e `intId` de `api-auth`.
- Validação de entrada sempre com **Zod** (`src/lib/*-validation` / schemas em `protocolos`/`tabelas`).

## UI — Design System por tokens (`/design-system` é a FONTE ÚNICA)
- **REGRA FIRME:** todo componente vive na biblioteca **`/design-system`** (rota pública,
  `src/components/designsystem/Catalogo.tsx`). Ao criar QUALQUER componente (inclui botões e
  ícones), **adicione-o ao catálogo**; as telas só podem **usar componentes do design-system**
  — nada de UI ad-hoc/inline. Ícones = **lucide-react** reexportados como `Icon*` em `icons.tsx`.
- **Nenhuma cor NEUTRA hardcoded** — só `var(--token)` via utilitários (`bg-surface`, `text-text`,
  `text-muted`, `border-border`, `rounded-card`, `shadow-ring`/`shadow-soft`, `bg-accent`…),
  gerados por `@theme inline` em `globals.css`. A **única hex** é a **cor semântica** (natureza/
  situação/avatar), via `src/lib/semantic.ts` (`naturezaVar`/`situacaoVar`/`avatarVar`); tintas
  saem por CSS `color-mix` com `--tint-target`/`--glow-target`.
- **Tema por atributo `data-theme`** (`light`/`dark`) — next-themes `attribute="data-theme"`;
  `@custom-variant dark ([data-theme="dark"] &)`. Fonte **Geist + Geist Mono** (pacote `geist`,
  `--font-sans`/`--font-mono`). Sem `.dark` de classe, sem Inter.
- **Componentes** (`src/components/`): `Button` (§6.8, primário=`bg-text` neutro), `StatusTag`
  (`NaturezaTag`+`SituacaoDot`), `KpiStat` (§6.4), `Segmented`, `FilterChip`, `Avatar`, `Dropdown`,
  `ColorField` (conta-gotas+swatches; `src/lib/color.ts`), `PeriodoPicker`, `MultiSelectHeader`,
  `Tabs` (swipe), `Toast`/`Toaster`, `DataTable` (seleção+filtro no cabeçalho+clique na linha; `pageSize` **máx 20**;
  `fillHeight` = linhas por página automáticas p/ preencher a altura do display no desktop, sem scroll do navegador),
  `Dropzone` (importação: soltar OU clicar p/ escolher), `ResponsaveisEditor` (N padrões + N temporários; cada um com
  matrícula/função + nomeação portaria/decreto/lei + link; período/estado), `Modal` (trava o scroll da página; `acoesCabecalho` = slot
  de botões à esquerda do X, ex.: cadeado; + painel `lateral` mestre-detalhe: 2º banner ao lado, com **fechar
  animado** simétrico ao abrir), `Segmented` (com `disabled`), `formStyles`,
  `Field` (TextField/PasswordField/SearchField/Checkbox — ícone + foco accent), `Callout` (feedback
  por token), `Pager`, `LinkCard`, `StatCard`, `ReorderTable` (tabela com arrasto entre linhas,
  Pointer Events mouse+toque). `Button` tem variante `danger`; tokens de feedback
  `--ok/--warn/--danger/--info` + `--scrim` em `globals.css`.
  `Badge.tsx` legado só permanece pelo `Tone`/tons do `StatCard`.
- **Personalização do ADM (§39):** `/painel/aparencia` (`AparenciaAdmin`, admin) edita tokens com
  preview ao vivo e persiste em `configuracoes` (D1) via `/api/admin/aparencia`; `RootLayout`
  (async, `force-dynamic`) injeta o `<style>` sem flash (`src/lib/aparencia.ts` cacheado +
  `theme.ts` `aparenciaToCss` **anti-XSS por allowlist**). Migração `0008`.
- **Responsivo/touch mobile-first**: **tabela↔cards**, **botão↔FAB**, **modal↔bottom-sheet**,
  sidebar↔bottom-nav; sem overflow horizontal (conteúdo largo rola no próprio container); alvos
  ≥44px; foco visível. **Use toda a largura do desktop.** **Sem emoji.** A **sidebar do `AppShell`** é
  **fixa** (`lg:sticky lg:top-0 lg:h-dvh`) com **scroll interno** na navegação (a lista rola se houver muitas abas).
- **Render correto desde o início** (sem flash/CLS): shim `__name` + `<style>` de tokens antes do
  `ThemeProvider` em `layout.tsx`. Skeleton/shimmer (`Skeleton.tsx`) só onde há espera real.
- Erros: `src/app/error.tsx` (boundary, export `ErrorBoundary`) e `not-found.tsx`.
- **Verificação (sandbox):** dev server local é lentíssimo → verificar no **site publicado** via
  Browser pane, claro/escuro + mobile (360/390/768); `/design-system` é a superfície de validação.

## Testes e qualidade
- **`node:test` + type stripping nativo** (`--experimental-strip-types`), sem dependências
  extras. Os testes ficam em `tests/*.test.ts`, importam o código por **caminho relativo com
  extensão** (`../src/lib/x.ts`) e cobrem **lógica pura** (format, normalize, validações Zod,
  cripto de senha) + a cadeia de migrações (`node:sqlite`, requer `--experimental-sqlite`).
  - Não importe nos testes módulos que puxam `getDb`/`@opennextjs/cloudflare` nem arquivos
    `.tsx` (JSX não passa pelo stripping). Para testar lógica presa a esses módulos, **extraia**
    a parte pura para um `.ts` próprio (padrão de `password.ts`).
- **Biome** (`biome.json`): regras recomendadas. CSS fica fora (Tailwind v4). Algumas regras
  de a11y (`noLabelWithoutControl`, interações em `div`) estão **off** como dívida técnica a
  endereçar num passe de acessibilidade; `noNonNullAssertion`/`useExhaustiveDependencies` são
  avisos (não alterar deps de hooks automaticamente).

## Ao finalizar qualquer mudança
1. `npm run lint` e `npm test` verdes; `npm run typecheck` sem novos erros.
2. **Commit + deploy** (push na main) e **verifique o site no ar** sem regressão.
3. **Atualize os `.md`** relevantes (este arquivo, `docs/ROADMAP.md`, README) e a documentação
   do que mudou. Mudanças limpas, cirúrgicas, sem código morto.
