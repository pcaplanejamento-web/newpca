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
- **Armazenamento (ADM):** tela `/painel/armazenamento` (`ArmazenamentoAdmin`, só admin; atalho em Configurações →
  Mais) — raio-x do banco **em runtime** via `src/lib/armazenamento.ts`: tamanho total pelo **binding cru**
  (`getCloudflareContext().env.DB` → `.meta.size_after` — o Drizzle não expõe `.meta`), enumeração por
  `sqlite_master` (inclui as tabelas **legadas órfãs** de `0005` e as de sistema) e, por tabela, `COUNT(*)` +
  `SUM(LENGTH(CAST(col AS BLOB)))` (**sem migração**; `dbstat` não é confiável no D1). Rota `GET/POST
  /api/admin/armazenamento` (`exigirAdmin`): GET = snapshot; POST `{acao:"expurgar_sessoes"}` = higiene (apaga
  sessões vencidas por `expira_em < agora`). `formatBytes` em `format.ts`; ícone `IconDatabase`.
- **Auditoria / histórico de alterações (de ponta a ponta, migrações `0026` + `0031`):** tabela **`auditoria`** APPEND-ONLY —
  **quem** (`usuario_id` + snapshot `usuario_nome`/`usuario_email`, sobrevive à exclusão via FK `set null`), **o quê**
  (`acao` criar/editar/excluir/importar/protocolar/login/…; `entidade` + `entidade_id`; diff `antes`/`depois` JSON +
  `resumo` legível) e **quando** (`criado_em`). Núcleo puro/testável **`auditoria-core.ts`** (`diffCampos`, rótulos
  `ROTULO_ACAO`/`ROTULO_ENTIDADE`/`ROTULO_ORIGEM`); acesso ao D1 em **`auditoria.ts`** (`registrarAuditoria` **BEST-EFFORT — nunca
  lança**; `historicoDfd`/`historicoProtocolo`/`listarAuditoria`). **Instrumentado em TODOS os pontos de escrita**, no nível da ROTA (onde o ator
  `exigirX().u` é conhecido): DFD (import/edição de campos/**itens**/exclusão/vínculo), protocolo, catálogo (+itens/tipos),
  PCA, planilha (`/api/upload`), protocolos legado, admin RBAC (grupos/permissões/órgãos/unidades + reordenar) e
  **usuários** (papel/status = alto valor), config (aparência/avaliação/integrações — só o FATO, **nunca** segredos/senha)
  e auth (login/logout/cadastro/perfil/senha). Nas edições, o "antes" vem dos `get*` já usados na rota (diff por campo).
  - **Histórico CONECTADO protocolo › DFD › item (migração `0031`, aditiva):** cada linha ganhou **`protocolo_id`** (o
    protocolo por onde a alteração PASSOU — liga DFD/itens ao histórico do protocolo, mesmo de DFD já excluído),
    **`origem`** (o CANAL: `protocolacao`/`reenvio`/`avulso`/`banner`/`massa`/`celula`/`vinculo`/`exclusao`) e **`detalhe`**
    (JSON `DetalheAuditoria`: `alvo` {nº, planejamento} + `campos`/`secoes`/`assinaturas`/`itens` antes → depois JÁ
    FORMATADOS — a MESMA régua da comparação do reenvio: `compararDfd`/`compararCapa`/`diffItem`; `detalheDe` corta textos a
    1500 e itens a 400). A sobrescrita de um DFD (protocolação/reenvio, `start-dfd`) registra as diferenças contra o
    gravado; mover um DFD de protocolo registra nos DOIS; a massa de itens registra item a item. **Leitura (pura):**
    `interpretarAlteracao` lê o formato novo E o LEGADO (`antes`/`depois` por chave; itens da massa em `antes.itens`; itens
    do "Salvar" só no `resumo`); `agruparHistorico` junta num EVENTO as linhas do mesmo usuário + canal + protocolo feitas em
    sequência (≤ 120 s); `historicoDoItem` filtra o que tocou UM item (+ a importação por onde ele entrou);
    `resumoCurtoAlteracao`/`rotuloAlvo`/`passaFiltroHistorico`. **Consultas:** `historicoDfd` (as do DFD) e
    `historicoProtocolo` (capa/gestão + TODAS as linhas com `protocolo_id` = P + as legadas dos DFDs que estão nele) — ambas
    SEM o e-mail do ator (`COLS_HIST`); rotas `GET /api/dfd/[id]/historico` e `GET /api/protocolo/[id]/historico` (escopo por
    unidade).
  - **UI — componente único `Historico`** com escopos: **`protocolo`** (botão "Histórico" no rodapé do protocolo gravado →
    modal; eventos agrupados + filtro `Segmented` Tudo/Capa/DFDs/Itens com contagens), **`dfd`** (painel da direita do DFD),
    **`item`** (seção recolhível **"Histórico do item"** no `ItemDetalhe` de DFD gravado — `HistoricoDoItem`, carrega só ao
    abrir) e **`global`** (tela ADM **`/painel/auditoria`** — `AuditoriaAdmin` + `GET /api/admin/auditoria`, filtros
    entidade/ação + paginação; nav "Auditoria" `IconClock`, admin). Cada cartão: selo do CANAL (`Badge`), "Protocolo X" por
    onde passou, autor, data/hora de Brasília (`dataHoraBR`) e O QUE mudou (resumo curto; abre o antes → depois com
    `DiffLinha`/`DiffItem` compactos — textos longos recolhidos). Hook `useHistorico(url)` (carga sob demanda). A tabela
    aparece no `/painel/armazenamento`.

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

## Grupos, Permissões, Órgãos e Unidades (RBAC por grupo)
> **Vocabulário (rename UI-only):** a antiga "Repartição" é, na interface, a **"Unidade"**; o
> identificador de código/tabela segue `reparticao*` (não renomear). Toda **Unidade** pertence a um
> **Órgão** (entidade nova, acima). NÃO confundir com a **Planilha (PCA)** (tabela `unidades`, arquivo
> importado) nem com a **Unidade de medida** do item (`itens.unidade_medida`) — três conceitos distintos.
- **Grupos** (`grupos`): um usuário pertence a vários (`usuario_grupos`); escolhe o **grupo
  ativo** no cabeçalho (cookie `pca_grupo`). Cada grupo tem **1 permissão** e acessa um conjunto
  de **repartições** (`grupo_reparticoes`). Telas admin: `/painel/grupos`, `/painel/permissoes`,
  `/painel/orgaos` (Órgãos → clique numa linha → Unidades daquele órgão). Helpers em **`src/lib/grupos.ts`** (`getGrupoAtivo/Id`, `abasPermitidas`,
  `getReparticaoContexto`, `definirGrupoAtivo/ReparticaoAtiva`); abas gerenciáveis em `src/lib/abas.ts`.
- **Permissões** (`permissoes.abas` = JSON de keys): definem quais **abas de módulo** (dashboard/
  protocolos/pca/**dfd**) o grupo vê. **Admin ignora** (vê todas — regra firme). A nav em `AppShell`
  filtra por `abasPermitidas`. Abas em `src/lib/abas.ts`.
- **Dados por grupo:** `protocolos` e `protocolo_opcoes` carregam `grupo_id`; **todas** as funções de
  `src/lib/protocolos.ts` escopam pelo grupo ativo (`getGrupoAtivoId`, sentinela `-1` = nada). Criar
  exige grupo ativo.
- **Unidades** (`reparticoes`: codigo+nome+ordem + **numero_interessado**/**setor_requisitante** (matchers) +
  **orgao_id** (FK→`orgaos`, migração `0022`) + **responsavel_dfd** — cadastro do ADM, nullable): lista global
  **reordenável por botões ↑/↓** (`DataTable` com colunas `filter:"none"`; persiste em
  `PATCH /api/admin/reparticoes/ordem`). O CRUD (`ReparticoesAdmin`, `reparticaoSchema`) vive **DENTRO de um órgão**
  (`/painel/orgaos/[id]`): a unidade herda `orgao_id` do escopo da URL (sem seletor de órgão), e o
  `GET /api/admin/reparticoes?orgaoId=` filtra por órgão. **Não há mais `/painel/reparticoes`** (removida). O
  `ReorderTable` foi **removido** (DataTable + ↑/↓ é o padrão de ordenação).
  `responsavel_dfd` guarda os **responsáveis por DFDs** como **JSON** (coluna reaproveitada, sem migração nova):
  **N padrões** + **N temporários**. Todo responsável tem **nome, matrícula, função** e uma **nomeação** (ato:
  `portaria`/`decreto`/`lei` + número + **link** do documento). O temporário tem, além disso, **período** início/fim.
  No período de um temporário, **ele é o efetivo** (os padrões ficam em cinza); fora do período, o temporário fica em
  cinza e os padrões voltam — com **estados** (Agendado/Vigente/Encerrado). Lógica pura/testável em
  `src/lib/reparticao-responsaveis.ts` (`parseResponsaveis`/`serializeResponsaveis` tolerantes a TODOS os formatos
  anteriores; `temporariosVigentes`/`responsaveisVigentes`/`padroesInativos`/`estadoTemporario`); UI no componente
  `ResponsaveisEditor` (sub-campos compartilhados entre padrão e temporário). Unidade ativa por cookie
  `pca_reparticao`, entre as do grupo ativo, na ordem definida. Rotas em `/api/admin/reparticoes*` e
  `/api/reparticoes/ativo`.
- **Órgãos** (`orgaos`: nome+sigla+**orgao_entidade** (matcher do "Órgão/Entidade" do DFD)+ordem, migração `0022`) —
  entidade organizacional **ACIMA da unidade**. Tela `/painel/orgaos` (`OrgaosAdmin`, `orgaoSchema`, ↑/↓); **clicar
  numa linha** (`onRowClick`) navega para `/painel/orgaos/[id]` = as Unidades daquele órgão (`ReparticoesAdmin`
  escopado). Nav = um item **"Órgãos e Unidades"**. Rotas
  `/api/admin/orgaos*` (CRUD + `/ordem`). Excluir um órgão **não apaga** unidades (FK `set null`). Loader
  `src/lib/orgaos.ts` (`listarOrgaos`). A migração `0022` é **aditiva** (só `ADD COLUMN`/`CREATE`) e **preserva o
  legado**: semeia a "Prefeitura Municipal de Rio Verde" e vincula as unidades atuais a ela (`orgao_id=1`).
- **Assinatura ÚNICA por órgão (migração `0023`):** o órgão define se a assinatura (responsáveis por DFDs) é
  **uma só para todas as unidades** (`orgaos.assinatura_unica=1` → responsáveis no `orgaos.responsavel_dfd`, editados
  no `OrgaosAdmin` com o **mesmo `ResponsaveisEditor`**) ou **por unidade** (padrão `=0`, cada unidade tem os seus). A
  resolução é **pura e única** (`responsaveisEfetivos`, `reparticao-responsaveis.ts`) aplicada nos DOIS chokepoints que
  carregam os responsáveis (`carregarResponsaveis` servidor + `responsaveisPorReparticao` cliente, ambos com `leftJoin`
  em `orgaos`) → toda a conferência de assinatura (`validarAssinatura`, `DfdConferir`, `POST /api/dfd`) usa os
  responsáveis certos **sem mudança**. No `ReparticoesAdmin`, quando o órgão é "única", o editor da unidade some (nota
  apontando o órgão). `orgaoSchema` ganhou `assinaturaUnica`+`responsaveis` (schema `responsaveisSchema` compartilhado
  com `reparticaoSchema`). Migração aditiva; default preserva o comportamento atual.
- **"Geral" virtual:** `codigo='GERAL'` = **todas as unidades** — **escondida do CRUD de Unidades** (GET filtra;
  PATCH/DELETE recusam), **não editável**, mas continua **concedível por grupo** em `GruposAdmin` (grupos
  autorizados). Sentinela `getReparticaoFiltro()` (`codigo==='GERAL'` ⇒ `null` = sem filtro) inalterada. Em **"Geral"**,
  `painel/dfds/page.tsx` passa `reparticaoAtivaId={rep?.id ?? null}` = **null** (Geral comporta qualquer unidade) → a
  dica "a unidade escolhida é diferente da ativa" (DfdConferir/DfdUploadForm) **não aparece** — nunca é erro (ponto 5).
- **Matchers (ponto ÚNICO puro `src/lib/reparticao-match.ts`) — IGNORAM entidades OCULTAS:**
  **`casarPorInteressado`** (Interessado do protocolo → **órgão OU unidade** pelo número cadastrado → nome; devolve
  `{tipo,id}`), **`preverUnidade`** (**SÓ pela ASSINATURA** — o assinante que bate com um responsável da unidade a
  identifica) e **`preverUnidadeDoDfd`** (identifica o órgão pelo "Órgão/Entidade", ESCOPA as unidades a ele e prevê pela
  assinatura; sem previsão, cai na **unidade própria** do órgão dual — usado pelos forms), `casarOrgao` (Órgão/Entidade →
  órgão), `orgaoDivergeDaUnidade` (órgão do campo × órgão da unidade selecionada). **O "Setor Requisitante" do DFD NÃO é
  mais usado para prever a unidade** (ponto 1 — era ruído): removidos `casarUnidade`/`casarReparticao`/
  `divergenciaOrgaoUnidade`. Campos novos vazios ⇒ resultado consistente. Threadados ao cliente
  (`painel/dfds/page.tsx` enriquece as unidades + `listarOrgaos()` → `DfdsView` → forms).
- **Nº interessado no ÓRGÃO + identificação/registro do DFD + ocultar (migração `0027`):**
  - **Nº interessado (ponto 1/2/3):** `orgaos.numero_interessado` (além do da unidade) — o protocolo pode vir em nome do
    **órgão OU da unidade** (`casarPorInteressado`); o número é **ÚNICO GLOBAL** entre órgãos e unidades
    (`numeroInteressadoEmUso`, checado nas rotas admin POST/PATCH → 409). O protocolo guarda `dfd_protocolos.orgao_id`
    quando vem em nome do órgão (`protocoloMetaSchema`/`iniciarProtocolo`).
  - **DFD identifica ÓRGÃO e escopa a UNIDADE (ponto 4/5):** o `DfdConferir` identifica o órgão pelo "Órgão/Entidade"
    (`casarOrgao`) e **escopa o seletor de unidade** às unidades daquele órgão (PREFERÊNCIA), mas SEMPRE inclui a unidade
    já selecionada e **cai para a lista inteira quando o escopo fica vazio** — senão o seletor ficava vazio (nenhuma
    unidade acessível no órgão, ou a atual em outro órgão) e travava a escolha manual. O auto-match dos forms usa
    **`preverUnidadeDoDfd`** (**só pela ASSINATURA** — ponto 1; o "Setor Requisitante" não prevê mais);
    **ÓRGÃO-QUE-É-UNIDADE** (dual, `orgao_proprio`): quando o órgão
    identificado tem a unidade própria, ela é resolvida como a requisitante (senão o DFD do órgão dual ficava sem
    unidade → erro). `orgao_proprio` é threadado ao cliente (`dadosMatchPorReparticao` → `page.tsx` → forms →
    `preverUnidadeDoDfd`/`ReparticaoMatch`). **A previsão por ASSINATURA usa TODAS as formas (certificado/sistema/
    dropsigner) — mesma lógica** (`preverUnidadePorAssinatura` → `validarAssinatura`); como o ÍNDICE do protocolo só
    traz A/B (o Dropsigner exige o texto renderizado), o `ProtocoloUploadForm` **RE-PREVÊ a unidade após o parse
    completo** de cada DFD (que inclui a Dropsigner), preenchendo só as unidades ainda não definidas (não sobrescreve
    escolha manual). Sem previsão, a **unidade fica obrigatória** (`dfd.reparticao` fundamental —
    erro até definir). O DFD **registra órgão + unidade** — o servidor deriva `dfds.orgao_id` da unidade em
    `upsertDfdCabecalho`. Ponto de avaliação CONFIGURÁVEL **`dfd.orgao`** ("Órgão identificado", padrão `intermediario`)
    avisa quando o Órgão/Entidade não casa nenhum órgão cadastrado (flag via `ctx`, avaliadores puros).
  - **Ocultar em vez de excluir (ponto 8):** `orgaos.oculto`/`reparticoes.oculto` — órgão/unidade **com DFD/protocolo
    vinculado NÃO pode ser excluído** (`DELETE` → 409 via `orgaoTemVinculo`/`unidadeTemVinculo`); o ADM **oculta**
    (`OrgaosAdmin`/`ReparticoesAdmin`: ação ocultar/reexibir + badge). Ocultos **somem do uso futuro** (matchers e
    seletores de documento novo filtram), mas o **histórico é preservado**.
- **Promover / rebaixar / órgão que TAMBÉM é unidade (migração `0029`):** a identidade transita entre as tabelas
  `reparticoes`⇄`orgaos`. **Sem vínculo** = create+delete de UMA linha. **Com vínculo (DFD/protocolo/itens) também é
  permitido:** a UNIDADE que carrega os vínculos é **PRESERVADA** (mesmo `reparticoes.id` ⇒ DFDs, itens, protocolos e
  acesso por grupo intactos) e só o `orgao_id` de DFDs/protocolos é realinhado no MESMO `db.batch` (atômico; o id
  recém-criado é o `(SELECT MAX(id) …)` — o batch do D1 é uma transação sequencial). Nada é excluído com vínculo.
  Núcleo PURO/testável **`orgao-unidade-ops.ts`** (o MAPA dos campos que "seguem" na transformação + os predicados de
  permissão sobre os fatos apurados no servidor). Travas de contagem em `orgaos.ts` (`contarUnidadesDoOrgao`,
  `estruturaPorOrgao`). Ações no **modal de edição** (aba "Estrutura"), não como ícones de linha (mobile-friendly).
  - **Promover unidade→órgão (req. 1):** `POST /api/admin/reparticoes/[id]/promover` cria o órgão com a identidade da
    unidade. Sem vínculo, a unidade é **EXCLUÍDA**; **com vínculo**, ela vira a **UNIDADE PRÓPRIA** do novo órgão (dual —
    `unidadePreservadaNoPromover`: nº do interessado sobe p/ o órgão; responsáveis ficam na unidade, herdando os do órgão
    de origem de assinatura única se ela não tinha os seus) e `dfds.orgao_id` passa ao novo órgão. Barrado só p/ a
    unidade própria de um órgão dual. Devolve `{id, preservada}`.
    (`ReparticoesAdmin` → Estrutura → "Promover a órgão"; ao concluir vai para `/painel/orgaos`.)
  - **Rebaixar órgão→unidade (req. 2):** `POST /api/admin/orgaos/[id]/rebaixar` `{orgaoDestino}` cria a unidade **sob o
    destino escolhido** e **EXCLUI** o órgão — com ou sem vínculo. Órgão **dual**: a unidade própria **desce** como unidade
    comum do destino (`propriaRebaixada`, mesmo id, vínculos junto; recebe o nº do órgão e, se assinatura única, os
    responsáveis do órgão). Órgão sem própria: cria a unidade nova (`unidadeDeOrgao`). Antes do delete, DFDs com
    `orgao_id`=órgão (sem unidade → ganham a unidade nova) e protocolos em nome do órgão (`orgao_id`→`NULL`, unidade
    preenchida se vazia) são realinhados. Barrado só se o órgão tiver unidades-**FILHAS** comuns.
    (`OrgaosAdmin` → Estrutura → seletor de destino + "Rebaixar".)
  - **Órgão que TAMBÉM é unidade (req. 3 — dual):** `reparticoes.orgao_proprio=1` = a **unidade PRÓPRIA** que representa
    o órgão. Um órgão é dual ⟺ tem a unidade própria (**só permitido p/ órgão SEM unidades-filhas**). `POST
    /api/admin/orgaos/[id]/unidade-propria` `{ativar}` cria/remove a unidade própria (remover barrado se ela tiver
    vínculo; a unidade própria também NÃO é excluível avulsa — só pelo toggle). Assim o órgão ganha os **dois status com
    todas as funções**: a unidade própria é uma `reparticoes` NORMAL, então TODO o subsistema (DFD/protocolo/assinatura/
    match/escopo por unidade/acesso por grupo) funciona **SEM mudança** (a chave continua `reparticoes.id`) — os matchers
    não mudam (a própria é uma unidade não-oculta comum). Badges "Também unidade" (`OrgaosAdmin`) / "Próprio órgão"
    (`ReparticoesAdmin`); "Nova unidade" desabilitada no órgão dual. Migração **aditiva** (`orgao_proprio` default 0 ⇒
    nenhum órgão nasce dual; legado intacto).
- **Divergência Órgão × Unidade (item 6.3):** quando o "Órgão/Entidade" do DFD aponta um órgão diferente do órgão da
  unidade selecionada, mostra **atenção âmbar** (Callout no `DfdConferir` + mensagem no painel), **configurável** —
  ponto de avaliação `dfd.orgaoUnidadeDivergente` (padrão `intermediario`, não bloqueia). O servidor (`POST /api/dfd`)
  só computa/bloqueia se elevado a `fundamental` (custo zero no padrão).
- **Repartição escopa os dados (além de acesso):** a repartição ativa do head **filtra** protocolos e
  PCA. `getReparticaoFiltro()` devolve `{id,codigo}` da ativa, ou **`null` em "Geral"** (= todas, sem
  filtro). **Módulo Protocolos LEGADO (`protocolos.ts`) — "Órgão" = unidade:** ali o campo "Órgão" do
  protocolo é escolhido da lista de unidades (guarda `orgao`=nome, `orgao_sigla`=código); `escopo()` filtra
  por `orgao_sigla = código`. É **distinto** do novo Órgão-entidade (subsistema DFD acima). No **PCA**, cada
  `unidade` (planilha) recebe `reparticao_id` da unidade ativa no
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
  e total por item** + **total geral**, e o **texto das demais seções
  numeradas** (2,3,5,6,7,8,9…) num coletor genérico salvo em `dfds.secoes` (JSON). O detalhe (`/painel/pca/dfd/[id]`)
  mostra tudo ao clicar em "Ver".
  - **Valor do DFD = SÓ a soma dos itens (`valorTotal`); nunca estimado.** A antiga "estimativa da nota" (o "R$"
    solto do cabeçalho, `valorEstimado`) foi **eliminada** de ponta a ponta (parser, tipos, schema, servidor, UI e o
    ponto de avaliação `dfd.valorEstimadoVsTotal`): o valor é o `valorTotal` (Σ itens); **sem valores nos itens, fica
    ZERADO** (`valorTotal ?? 0`) — o sistema não estima nada. O total do **PCA** (`pcas.valorEstimado`, coluna mantida)
    passou a somar os `valorTotal` dos DFDs. A coluna `dfds.valor_estimado` fica **dormante** (sem código; sem migração
    de DROP).
- **Assinatura digital (captura + conferência, migração `0018`):** o PDF traz, DEPOIS de cada DFD, uma página
  "Assinaturas Digitais (Certificado Digital)" com 1+ linhas `Assinatura digital - Nome: … e-CPF: … Usuário: …
  Data: dd/mm/aaaa hh:mm:ss … e-Assinatura: <código> - <url>`. **`extrairAssinaturas`** (`parse-dfd-comum.ts`,
  puro) lê nome/e-CPF/usuário/data/**código verificador** (o `ehRuido` descarta essas linhas das seções). Há
  **CINCO formatos** (campo `fonte`; **A** certificado, **B** sistema, **C** dropsigner, **D** adobe, **E** foxit —
  o Formato E e qualquer assinatura ACHATADA são lidos por OCR, descrito no fim desta seção): **certificado** (acima) e **sistema** ("Assinaturas Eletrônicas (Sistema)":
  `Assinado digitalmente por NOME, portador do CPF: … utilizando o código: <código>`); e o **Formato C — `dropsigner`**
  (Dropsigner/Lacuna Software): o bloco visível é, na maioria dos DFDs, a **APARÊNCIA de uma ANOTAÇÃO de assinatura**
  (widget `Sig`) — que o **`getTextContent` NÃO extrai** (só o render/aparência traz). Por isso o Dropsigner é lido do
  **TEXTO RENDERIZADO POR PÁGINA** (`getOperatorList`, via `PdfDoc.pageRenderText`) por
  **`assinaturasDropsignerDeTexto(textos: string|string[])`** (`parse-dfd-pdf-core.ts`, puro). Reconhece o bloco em
  **QUALQUER IDIOMA E VARIANTE** da aparência (ponto 4): PT "Assinado **digitalmente|eletronicamente** por: NOME [CPF: …]
  Data: dd/mm/aaaa …" **e** EN "Digitally signed by: NAME [CPF: …] Date: M/D/AAAA h:mm:ss PM …" — o **`:` após "por"/"by"**
  distingue do Formato B (que é "por NOME, portador…", SEM dois-pontos), e o **CPF é OPCIONAL** (alguns blocos trazem só
  NOME + Data, ex.: "Ricardo Rocha Batista Data: …"); a data
  EN (M/D + AM/PM) é **normalizada** para `DD/MM/AAAA` 24h (`normalizarDataDropsigner`). O **código** vem da marca d'água
  `dropsigner.com/validate/<código>`. **Ponto 2 — só a assinatura DIRETAMENTE no DFD:** cada bloco é pareado com o código
  da PRÓPRIA página e mantém-se só o **documento PRIMÁRIO** (o 1º código, da 1ª página do DFD); um ANEXO (decreto etc.) é
  outro documento Dropsigner, com outro código → **descartado**. Sem bloco no primário → 1 carimbo (nome vazio, verificável
  pela URL). `parseDfdFromPdfItems(items, nome, textosRender)` soma `extrairAssinaturas` (A/B) + Dropsigner por página.
  **No PROTOCOLO** as A/B ficam em páginas separadas (índice `dfd.assinaturas`) e as INLINE (Dropsigner **e Adobe**) nas
  páginas do DFD → **`parseDfdDoProtocolo` COMBINA os dois** = índice (A/B) + **tudo que NÃO é A/B** de `parsed` (pega
  Dropsigner, Adobe e formatos inline futuros; não descarta nenhum). Validado no Protocolo 4.pdf real (86 DFDs; ex.: DFD 1243 →
  PEDRO … pelo bloco EN; DFD 1206 → EVERALDO Dropsigner, e a assinatura de sistema ESDRAS do anexo NÃO é atribuída).
  **Formato D — `adobe` (Adobe/ICP-Brasil, PAdES):** aparência INLINE do widget de assinatura no TEXTO RENDERIZADO
  ("Assinado de forma digital por NOME:CPF  Dados: AAAA.MM.DD HH:MM:SS -03'00'"), lida por
  **`assinaturasAdobeDeTexto(textos)`**. **Identificação CIRÚRGICA por DOIS selos ao mesmo tempo** (evita falso positivo e
  falso negativo): o marcador EXCLUSIVO "Assinado de forma digital por" (o Dropsigner usa "digitalmente por:"; A/B usam
  "Assinatura digital - Nome:") **e** a data no formato ISO do Adobe **`AAAA.MM.DD`** (o Dropsigner/A/B usam `dd/mm/aaaa`)
  — prosa nunca casa os dois juntos. Extrai o NOME separando o **CPF (11 díg.) colado no CN** e o **mascara**
  (`***.XXX.XXX-**`), e normaliza a data para `dd/mm/aaaa … -03:00`. NÃO tem código/URL público e **o sistema só lê a
  APARÊNCIA (não o certificado)** — o pdf.js **não** expõe o certificado nos metadados (`getFieldObjects`=null; a aparência
  Adobe às vezes vem "flatten", sem widget `/Sig`). Por isso a UI **NÃO afirma ICP-Brasil/gov nem redireciona a validador
  oficial**: o card diz que a assinatura está embutida no PDF e a autenticidade se confere no **PDF assinado original**.
  Validado no DFD 1483 real (RHAFAEL PEREIRA BARROS).
  - **Assinatura ACHATADA (sem camada de texto) — OCR multi-formato em QUALQUER página (`ocr:true`):** Foxit e-CPF/
    ICP-Brasil (**Formato E**, `fonte:"foxit"`), **Dropsigner** e Adobe podem vir **achatados como imagem/vetor** — SEM
    texto e SEM `/Sig` (no `pd101820` real, **13 de 15 DFDs**: 12 Dropsigner + 1 Foxit; antes ficavam "sem assinatura" e
    bloqueados). São lidos por **OCR** (só no navegador, **lazy**). Arquitetura: núcleo PURO **`ocr-assinatura-core.ts`**
    (sem DOM/tesseract; o render/OCR entra por um **`MotorOcr` INJETADO** → a MESMA orquestração roda em produção e no
    harness contra o PDF real) + adaptador de navegador **`ocr-assinatura.ts`** (pdf.js + `<canvas>` + **tesseract.js**
    importado DINAMICAMENTE, fora do bundle do Worker). Estratégia: (1) **qualquer página** do DFD, em ordem de prioridade
    (`prioridadePaginasOcr`: imagem fora do cabeçalho → rótulo de assinatura → última); (2) atalho pelas **imagens** da
    página (`caixasImagensDaOpList` rastreia a CTM do operator list, incl. Form XObject → `regioesDeImagens`), página
    inteira como fallback; (3) **localiza** o bloco pelas palavras-âncora (`localizarBlocosAssinatura`), recorta ampliado e
    **binarizado** (some a régua cinza e o nome grande claro) e lê em 2 modos; (4) parse **por LINHAS** multi-formato
    (`assinaturasDeOcr`: `dropsignerDeOcr` + `assinaturasFoxitDeTexto` + `assinaturasAdobeDeTexto`), **nome corrigido pela
    camada de texto** (`corrigirNomePelaCamada` — o signatário costuma estar impresso no DFD), leituras AGRUPADAS com
    data/CPF por maioria, e o **código Dropsigner** lido da marca d'água vertical em 4 variantes por **CONSENSO**
    (`votarCodigoDropsigner`, alfabeto sem O/0/I/1 — sem consenso ⇒ sem link, **nunca um link errado**). Gatilho
    `precisaOcr` (nenhuma assinatura NOMEADA de texto — vazio ou só o carimbo); `mesclarAssinaturasOcr` troca o carimbo de
    texto pela nomeada do OCR herdando o **código EXATO** do texto. **Assets self-hosted** em `/public/tesseract` (worker +
    core WASM **SIMD-LSTM** base64 + `por.traineddata.gz`, ~11MB — sem CDN externa). **No protocolo o OCR roda na ANÁLISE, antes de
    apontar erros:** 2ª passada do `analisarTodos` (após o texto) lê em fila os DFDs com `precisaOcr` — cada um fica
    **"pendente"** (`ocrPendente`, rodapé "Lendo assinaturas por OCR (n/N)") até a leitura; a assinatura é mesclada no cache
    (sem perder edições) e a **UNIDADE é prevista pelo assinante** (`refinarUnidade` → `preverUnidadeDoDfd`, só preenche se
    vazia). A protocolação espera a análise. Abrir um DFD adianta a leitura dele (`mesclarOcrSePreciso`); `ocrTentadoRef`
    evita repetir; `lerAssinaturasOcr` é **serializado** (fila — o worker do tesseract é único). No avulso, `parseDfdPdf` roda
    inline. **Sem duplicar:** leituras da MESMA assinatura (mesma data/hora ao segundo + CPF compatível) viram UMA, e o nome
    repetido na linha do OCR ("NOME NOME" — o nome impresso ao lado + o do carimbo) é colapsado (DFD 142 real). Worker liberado por `encerrarOcr`. **Best-effort:** qualquer erro → sem assinatura (= antes).
    **Conferência (`validarAssinatura`):** uma assinatura lida por OCR (`ocr:true` ou `foxit`) que **não casa** um
    responsável é reconhecida **SEM bloquear** (status `"ocr"`) — exceto se houver uma de leitura LIMPA (texto) com nome
    que também falhou (essa bloqueia). Casou → `ok`. `ocr` é persistido (`assinaturaSchema`/`parseAssinaturas`). UI: Foxit
    em **ÂMBAR** (`Badge` "Foxit"); as demais mantêm a cor do formato + `Badge` "OCR" e a nota "confirme no PDF original"
    (Dropsigner sem código legível ⇒ sem link). **Validado por harness** (`pd101820`): 13/13 nomes, datas e CPFs corretos;
    códigos 8 corretos / 5 sem consenso / **0 errados**. Setup em `docs/OCR-ASSINATURA.md`.
  - **A assinatura NÃO se confunde com o texto (em QUALQUER lugar do DFD):** `limparAssinaturasDoTexto(items)`
    (`parse-dfd-pdf-core.ts`, puro) tira da camada de texto SÓ o que é assinatura, ANTES de reconstruir as linhas
    (seções/itens/cabeçalho), e **por trecho/segmento — nunca a linha inteira** (o antigo corte por linha apagava o texto
    legítimo que dividia a linha com a assinatura): (1) texto **ROTACIONADO** (marca d'água vertical; `PdfItem.rot`, só se
    for minoria na página); (2) a aparência **Adobe FLATTEN** por geometria — **`removerAparenciaAssinatura`**: acha as
    âncoras, o CORTE `x` entre a coluna do TEXTO (margem) e a da APARÊNCIA e remove só o **CLUSTER CONTÍGUO em `y`** das
    âncoras (vãos ≤ 11pt; a legenda "ORDENADOR" abaixo é PRESERVADA); **assinada SOBRE o texto** (sem os 60pt de
    separação) usa só âncoras ESTRITAS (o trecho COMEÇA com o marcador — prosa não começa), corta rente à âncora e tira
    também o "NOME:CPF"/cauda do CPF e o **nome grande** (fonte ≥1,3× o corpo, `PdfItem.h`); (3) por **SEGMENTO** da linha
    (`ehSegmentoAssinatura`: Adobe/Dropsigner PT-EN/Foxit/ICP-Brasil/data ISO/CN "NOME:CPF"/marca Dropsigner — **ancorados
    no início do segmento**) + as linhas nome/CPF/Data do bloco Dropsigner alinhadas logo abaixo. **Não usa o NOME** (nunca
    apaga um nome DIGITADO). As A/B são extraídas das linhas BRUTAS; as demais, do render/OCR — nada se perde. O `ehRuido`
    de linha só casa "Assinado de forma digital" no **início** (prosa que cita a expressão fica). `pageItems` passa `rot`/
    `w`/`h`. Validado: `pd101820` = 0 diferenças × versão anterior e 0 vazamentos; DFD 1483 real: §9 = "Autorizo o início
    da formalização da demanda. ORDENADOR".
  - **Validação da assinatura AUTO × EQUIPE:** `validarAssinatura` devolve `ok` com **`origem`**: `"auto"` = o SISTEMA casou
    o assinante com o responsável; `"equipe"` = validada à mão. A assinatura **reconhecida mas não conferida** (lida por OCR
    que não casa, ou só o carimbo Dropsigner — `assinaturaPendenteValidacao`) fica em **ATENÇÃO** ("Validar assinatura") até
    a equipe validar. No `DfdConferir`, o bloco **"Validação da assinatura"** mostra "Validada automaticamente (auto)" /
    "Validada pela equipe" ou, se não conferida, o seletor do **responsável da unidade** + "Validar assinatura (equipe)"
    (`validarAssinaturaPelaEquipe`: marca a assinatura com `validacao:{por:"equipe",responsavel}`; sem assinatura lida cria
    uma `fonte:"manual"`) e "Desfazer validação" (`desfazerValidacaoEquipe`). Vale enquanto o responsável for da unidade
    (trocar de unidade desfaz o efeito). **Quem/quando** são carimbados pelo SERVIDOR (`carimbarValidacao`, sessão — nunca o
    cliente) no `POST /api/dfd` e no `PATCH /api/dfd/[id]` (`assinaturas`), com auditoria. Selos "Validada (auto)/(equipe)"
    nos cards do `DfdView` e "(auto)/(equipe)" na coluna Assinatura da lista do protocolo; grupo "Equipe" p/ a `manual`.
  O código pode ter caractere
  não-ASCII e o rótulo `e-Assinatura:` pode quebrar em 2 linhas ("IP: e-" + "Assinatura: …") — as regex toleram. As
  assinaturas A/B de um DFD podem vir em **VÁRIAS páginas contíguas** (um formato por página), sempre **logo depois** do
  DFD. No **protocolo** as páginas de assinatura são vistas só no ÍNDICE (o parse completo só lê `dfd.pages`) →
  `indexarProtocolo` mantém um ponteiro `ultimoDfd` e **acumula (APPEND)** as assinaturas das páginas de assinatura
  **imediatamente após** o DFD; **ponto 3 — qualquer página separadora SEM assinatura (capa, despacho, DECRETO, anexo, em
  branco) ENCERRA a janela** (`ultimoDfd=null`): uma assinatura que venha depois de um anexo já **não** gruda no DFD. No avulso PDF
  vêm de `parseDfdFromPdfItems`; `.xlsx` = `[]`. Guardadas em `dfds.assinaturas` (JSON `Assinatura[]`). **Conferência (`validarAssinatura`,
  `reparticao-responsaveis.ts`, puro/testável):** o assinante tem de bater (nome normalizado por `norm`) com um
  **responsável padrão** OU um **temporário** cujo período cobre a **data da assinatura** (reusa `Responsaveis` de
  `reparticao-responsaveis.ts`; o cadastro fica em `ReparticoesAdmin`/`ResponsaveisEditor`). Regras (fonte única
  cliente+servidor): **PDF sem assinatura → bloqueia** (protocolar trava com qualquer DFD sem assinatura); `.xlsx`
  sem assinatura → permitido (informativo); **repartição sem responsável cadastrado → bloqueia**; assinante não
  autorizado → bloqueia. **Dropsigner e Adobe seguem a MESMA lógica dos demais formatos** — muda só a cor/rótulo (visual):
  o match por nome vale para TODOS (certificado/sistema/dropsigner/adobe); uma assinatura cujo assinante casa um responsável
  → `ok` (com `solicitante`); não casa → `erro` (bloqueia como A/B). **Exceção estreita:** a Dropsigner "só carimbo"
  (marca d'água sem bloco visível → `nome` vazio) é reconhecida SEM match → status **`"dropsigner"`** (não bloqueia;
  verificável pela URL). O servidor reconfere no `POST /api/dfd` (`start-dfd`) e no `PATCH /api/dfd/[id]` (ao trocar
  a repartição, com a exceção por tipo `dfd.assinatura`), carregando os responsáveis por `carregarResponsaveis`
  (`src/lib/reparticoes.ts`; assinatura única → responsáveis do ÓRGÃO). O `DfdView` exibe a seção "Assinaturas Digitais"
  (assinante, CPF, usuário, data, código): o card da assinatura **PADRÃO** (certificado/sistema) vem em **VERDE**
  (`--ok`, `Badge` "Certificado"), o da **Dropsigner** em **AZUL** (`--info`, `Badge` "Dropsigner", "Verificar
  autenticidade" → `a.url = dropsigner.com/validate/<código>`) e o da **Adobe** em **VERMELHO-E-BRANCO** (marca Adobe:
  `--danger` no contorno + fundo quase branco, `Badge tone="red" solid` com "Adobe" em branco; **sem link a validador gov
  e sem afirmar ICP-Brasil** — só lemos a aparência, não o certificado; a nota diz para validar o **PDF assinado original**;
  sem código) — + o **solicitante** — o
  responsável que **pediu a consolidação** no PCA (não quem autoriza), `Solicitante`, com período e ato
  (Portaria/Decreto/Lei) se temporário — com **dois botões `LinkExterno`**: "Verificar autenticidade" (site
  oficial) e "Ver <ato>" (link do ato de nomeação cadastrado).
- **Importa `.xlsx` E `.pdf`:** o cabeçalho + seções são **compartilhados** em `src/lib/parse-dfd-comum.ts`
  (`extrairCabecalho`/`coletarSecoes`, agnósticos de formato). **Seções = TÍTULOS PADRONIZADOS** (`SECOES_PADRAO` em
  `parse-dfd-comum`: ÁREA REQUISITANTE · IDENTIFICAÇÃO · JUSTIFICATIVA · QUANTIDADE · PREVISÃO · PRIORIDADE · FUNDAMENTAÇÃO ·
  INDICAÇÃO DA EQUIPE · SECRETÁRIO DEMANDANTE · AUTORIZAÇÃO), casados pelo INÍCIO do título (o NÚMERO varia entre modelos —
  ex.: DFD 136 numera "6 - FUNDAMENTAÇÃO"); qualquer outra linha "N - …" é texto da seção corrente — nunca cria seções
  indeterminadamente. `.xlsx` → `parse-dfd`/`parse-dfd-core` (SheetJS,
  tabela por coluna da matriz). `.pdf` → `parse-dfd-pdf`/`parse-dfd-pdf-core` (**pdf.js `pdfjs-dist`, build LEGACY** — `pdfjs-dist/legacy/build/pdf.mjs`
  + o worker legacy: o build moderno do v6 exige `Math.sumPrecise` e, num navegador sem ele, falhava ao carregar as fontes →
  NENHUM DFD lido ("Leitura incompleta"); importado
  DINAMICAMENTE no navegador — fora do bundle do Worker; `next.config` transpila e faz `alias canvas:false`; o
  build roda com `next build --webpack`): a tabela é remontada **por posição de coluna**. Número/código/unidade/
  valores ficam na **âncora** (1 faixa) → casados pelo `y` mais próximo (`nearestByY`) e **rejuntando o código quebrado
  em 2 linhas**. Ambos → mesmo `DfdParseado`.
- **Descrição ILIMITADA por item (crítico) — casada pela BORDA da célula, nunca truncada (inclui QUEBRA DE
  PÁGINA):** a âncora (nº/código/valores) fica no **MEIO da célula**, então a descrição tem linhas ACIMA e ABAIXO do
  número. Casar por `nearestByY` truncava (as últimas linhas vazavam para o próximo item). Agora a descrição é casada
  pela **borda REAL da célula** = o **maior vão** entre linhas de descrição que **excede um limiar ADAPTATIVO** `LIM`.
  `LIM = max(mediana*1.3, mediana+2)`, onde a mediana dos vãos de descrição do DFD ≈ entrelinha (nos PDFs reais ~8–9;
  bordas ~11+, separação limpa — nunca ocorre vão 10). **Same-page:** `cutsPorPagina`+`itemPorCuts` (o corte fica no
  vão-borda entre duas âncoras, senão ponto médio). **QUEBRA DE PÁGINA (`topCutPorPagina`):** acima do 1º número de uma
  página de continuação há DUAS coisas — a **cauda** (continuação) do último item da página anterior E a **cabeça** do
  1º item desta página (número no meio → cabeça acima). Andando do 1º número para cima, a cabeça é a parte contígua
  (vão ≤ LIM); o 1º vão > LIM é a borda: acima dela = item anterior, abaixo = cabeça do 1º item. Sem borda ⇒ o item
  anterior terminou antes ⇒ tudo é cabeça do 1º item (não rouba). Uma **página SEM número** (descrição ocupa a página
  inteira) é continuação integral do último item anterior. Só código/unidade/valores seguem em `nearestByY` (na
  âncora). Validado contra o **Protocolo FMC.pdf real (79 págs, 18 DFDs, 329 itens): 0 truncadas, 0 vazamentos**.
  Testes: fixture de descrição alta same-page e fixture CROSS-PAGE (cabeça do 1º item da página não vaza).
- **Tabelas MULTIPÁGINA (crítico) + reconhecimento CIRÚRGICO dos componentes:** uma tabela de itens pode ocupar
  **dezenas de páginas** e um único item pode ter uma **descrição enorme que atravessa páginas**. O `parse-dfd-pdf-core`
  é **100% ciente de página**: (a) em cada página, tudo ACIMA do cabeçalho de coluna repetido é o **cabeçalho do
  documento** (ESTADO DE GOIÁS / órgão / DOCUMENTO… / Número DFD / Tipo DFD) e é **pulado** (`viuColuna` por página) —
  senão o nome do órgão grudaria na descrição de um item; (b) só um **TÍTULO PADRONIZADO** de seção (`tituloSecaoPadrao`)
  **à margem esquerda** e **sem nada nas colunas de unidade/quantidade/valores** encerra a tabela (um "2-52" no meio de uma
  descrição, ou a LINHA DE ITEM cuja descrição começa com "- " — "29 - SEC. DE ASSISTÊNCIA…", DFD 142 real: 32 itens eram
  lidos como 2 — NÃO é seção); (c) uma descrição **acima de todos os itens da página** é
  continuação do **último item da página anterior** (item que "virou a página"). O **`coletarSecoes` recebe só as
  linhas FORA da tabela** (`[hi, tableEndIdx)` removido) — senão "…IEC 60601-**2-52**, SISTEMA DE GESTÃO…" viraria uma
  falsa "seção 2 - 52". `y` reinicia por página → itens/valores casados **por (página,y)**; ordem `(página, y desc)`. O texto de
  **apoio** abaixo da tabela (parágrafo antes da Seção 5) é capturado e vira uma **seção 4** (exibida abaixo da
  tabela no `DfdView`). **A numeração da coluna ITEM PODE ter buracos** (itens removidos/fracassados pulam o número
  — ex.: 8, 10, 11… — com os CÓDIGOS ainda sequenciais): isso é **NORMAL, não bloqueia nem é erro**. `buracosSequencia`
  (puro) só **aponta** os números pulados e o `DfdView` mostra uma nota informativa (muted) abaixo da tabela. Um
  dígito à DIREITA do início do texto da descrição (`descStartX` = menor `x` de texto na zona) é conteúdo da
  descrição (ex.: nº de peça "40300050630"), **não código** — senão poluiria o código. Validado contra um protocolo
  real de **581 páginas / 104 DFDs** (harness pdf.js): **104/104 importam** todos os itens. Testes: fixture
  multipágina real, buraco no sequencial (importa + aponta), sequência completa (sem nota).
- **Tela "Mesa"** (ex-"DFD"; `/painel/mesa` = `MesaPage` → `DfdsView`, aba **`dfd`** intacta — `/painel/dfds` **redireciona** p/ bookmarks; nav/label "Mesa" em `AppShell`/`BottomNav`/`abas.ts`) — separada do PCA. `PcaModuleView` ficou só com
  **Planilha (PCA)** + **PCA** (o seletor de "Gerar PCA" recebe TODOS os DFDs). A tabela de DFDs (`DfdsView`) tem
  **filtro/ordenação em todas as colunas** (cada uma com `value`) e **somatório de itens e valores** no rodapé,
  reativo aos filtros (`DataTable` `resumo={(linhas)=>…}`). Migração `0015` concede a aba `dfd` a quem já tinha `pca`.
  - **Visão ÚNICA com `Segmented` (Protocolos · DFDs · Itens) + morph:** no lugar do antigo `Tabs`, um `Segmented`
    (`vista`) na **mesma linha do lançador de importação** (contextual: `ProtocoloUploadForm` na visão Protocolos,
    `DfdUploadForm` na de DFDs, nada em Itens) alterna as três visões no **MESMO espaço**, com transição
    `animate-cat-morph` (`<div key={vista}>` remonta e replaya). Cada visão tem **altura de linha própria** (prop
    `density` do `DataTable`): Protocolos **comfortable** (alta) · DFDs **default** (média, `PlanilhaDfds`) · Itens
    **compact** (fina). Sem os cabeçalhos redundantes "Protocolos (N)"/"DFDs importados (N)" (a contagem fica no rodapé
    `resumo`). Tabela de **Protocolos**: **Estado** (AGREGADO — abaixo) · **Situação** (dropdown na célula) · **Responsável**
    (dropdown na célula) · **Distribuição** (quem protocolou) · **Data** (data/hora da PROTOCOLAÇÃO — `criado_em` em Brasília,
    `dataHoraBR`/`dataIsoBrasilia`) · Nº processo · Id · Assunto · Unidade · DFDs · Itens · Valor. No celular, o
    lançador de importação desce para a linha de baixo (o `Segmented` não encolhe — a aba "Itens" nunca fica cortada).
  - **Gestão do protocolo (migração `0031`, aditiva):** **Situação** = SÓ as cadastradas pelo ADM em **Configurações →
    Situações** (`SituacoesAdmin`: nome + cor + ordem ↑/↓; excluir deixa os protocolos dela SEM situação, avisando quantos;
    tabela `protocolo_situacoes`, `src/lib/situacoes.ts`, rotas `/api/admin/situacoes*` com `exigirAdmin` + auditoria
    `situacao_protocolo`) — a antiga situação derivada (Vazio/Com DFDs) foi EXCLUÍDA. **Responsável** = a pessoa designada
    (`dfd_protocolos.responsavel_id`; usuários ativos — `src/lib/usuarios.ts`); ao protocolar, entra o **responsável
    PADRÃO** que quem protocola escolheu no **Perfil → Protocolação** (`usuarios.responsavel_padrao_id`, `PATCH
    /api/perfil/preferencias`) — só num protocolo ainda sem responsável (`COALESCE` no upsert; o reenvio mantém).
    **Distribuição** = `criado_por` (quem protocolou). As duas células são o **`SeletorCelula`** (`<select>` nativo
    transparente — leve com milhares de linhas, seletor do próprio celular, o clique não abre a linha), gravam na hora
    (`PATCH /api/protocolo/[id]` com `origem:"celula"`, otimista com reversão) e também vão pela edição em massa
    (`BarraEdicaoMassaProtocolos` → ações `responsavel`/`situacao` do `POST /api/protocolo/massa`). Não-editores veem só o texto.
  - **Estado AGREGADO do protocolo:** a célula ACUMULA todos os problemas do processo — a conciliação da capa
    (`conciliacaoCapa`), "Sem DFDs" e os erros/atenções de CADA DFD e dos seus itens (a MESMA conferência por linha,
    `avaliarLinhaDfd`), agrupados por problema com a quantidade de DFDs (`avaliarProtocolo`, `conferencia-dfd.ts`, puro):
    erro › atenção › regular, rótulo do principal com a contagem ("Sem prioridade (3)"), `+N` e tooltip com a lista (DFDs
    por nº + planejamento). Calculado no servidor (`POST /api/protocolo/conferencia`, fatias de ≤ 50 protocolos / ~150
    DFDs, com os DFDs COMPLETOS e as unidades reais), lazy com "Conferindo…" e CACHE pela chave `chaveProto` (gravar a capa
    ou qualquer DFD muda a chave). A coluna é multi-valor (o filtro acha QUALQUER problema do protocolo).
  - **Filtros de HIERARQUIA da Mesa (acima de Protocolos · DFDs · Itens):** dois **`SeletorFiltro`** — **Responsável**
    (todos / sem responsável / uma pessoa) e **Assunto** (assuntos distintos dos protocolos) — filtram as TRÊS visões (o
    DFD e o item herdam os do protocolo de origem; `DfdResumo.protocoloResponsavelId`), núcleo puro **`mesa-filtros.ts`**
    (`passaFiltroMesa`/`opcoesAssuntoMesa`). Enquanto ativos, **travam** as colunas Responsável/Assunto da tabela de
    protocolos (`Column.travado` do `DataTable`: cadeado + o motivo; o filtro da coluna sai de uso) — a hierarquia manda.
  - **Visão "Itens"** = lista PLANA de TODOS os itens dos DFDs em escopo (Protocolo · Nº DFD · Sigla · Item · Código ·
    Descrição · Unidade · Qtd · Vlr. unit. · Vlr. total), carregada **SOB DEMANDA** (lazy) na 1ª abertura via
    `GET /api/dfd/itens` → `listarItensDfds(reparticaoId?)` (escopo por unidade, como `listarDfds`); o cache é
    invalidado quando os DFDs recarregam (após import/edição).
  - **PILHA DE BANNERS da Mesa (`BannersMesa`) — ORDEM FIXA Protocolo (esquerda) | DFD (centro) | Item (direita), qualquer
    que seja o banner de entrada:** linha de **Itens** abre **SÓ o banner do ITEM** (`ItemDetalhe` sobre o rascunho do DFD,
    com "Salvar alterações") — a coluna da direita; **"Ver DFD"** faz o DFD surgir À ESQUERDA dele; **"Ver protocolo"** traz
    o DFD e, EM SEGUIDA (após `duracaoMotionMs()`), o protocolo à esquerda do DFD. Linha de **DFDs**: [DFD]; "Ver protocolo"
    surge à esquerda; item/mensagens/histórico à direita. Com o protocolo JÁ na pilha, "Ver protocolo" some (no celular seria
    um clique sem efeito). Cada banner surge NO SEU LUGAR com a animação padrão (a trilha do grid cresce e os vizinhos
    deslizam); no celular aparece só o ABERTO POR ÚLTIMO; X fecha aquele banner e Esc fecha o último aberto. Arquitetura: os
    banners gravados são **hooks que devolvem painéis** — `useDfdGravado` (`DfdGravado.tsx`; `modoItem` = o item é a raiz e as
    mensagens/histórico do DFD ocupam o lugar dele) e `useProtocoloGravado` (`ProtocoloGravado.tsx`; `empilhado` = sem o
    DFD/mensagens ao lado) → `ConteudoBanner`/`ModalPainel` — e o `BannersMesa` compõe UM `Modal` com `larguraPrincipal` +
    **`esquerda`** (painéis à esquerda do principal) + **`paineis`** (à direita); larguras proporcionais: item 34 · DFD 52 ·
    protocolo 50. Raiz = protocolo | DFD | item (`AberturaMesa`).
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
  **bloqueia o botão** "Importar"; o `POST /api/dfd` rejeita (422) por garantia. **A regra agora é CONFIGURÁVEL pelo
  ADM** (ver "Avaliação configurável"): `faltasObrigatorias(d, regras?, ctx?)` delega para `avaliarDfd`
  (`dfd-tratamento`), que resolve o **nível** de cada ponto; com `regras` no padrão do catálogo devolve exatamente a
  lista de hoje (**invariante coberto por teste**). O **ano do PCA** e a **assinatura** seguem como portões à parte,
  também com nível próprio.
  - **Mesma régua do Tratamento (`situacaoSecao`):** uma seção obrigatória PREENCHIDA mas **fora do padrão** também é
    pendência — prioridade que não é ALTA/MÉDIA/BAIXA, previsão que não é MÊS/AAAA nem ANUAL (`normPrevisao`; "12 MESES"
    = ANUAL), fundamentação que não cita norma ("BAIXA" não é fundamentação). Antes o Tratamento mostrava "tratar" e as
    mensagens "preenchida". **Seção trocada** (DFD 136 real: "6 - FUNDAMENTAÇÃO LEGAL: BAIXA", sem a seção de prioridade)
    → `normalizarSecoesDfd` move para a PRIORIDADE (auto) e a fundamentação fica a tratar.
  - **TODAS as seções editáveis NA PRÓPRIA SEÇÃO (cadeado por seção):** o `DfdView` (`onSecoesChange` + `secaoEditavel`)
    mostra cada seção num `SecaoCard` com **cadeado** (`CadeadoBotao`): destravar = `AutoTextarea` com o texto inteiro.
    Vale para TODAS (2, 3, 5, 6, 7, 8, 9… e o texto de apoio da §4); as **obrigatórias AUSENTES** (§3/§5/§6/§7,
    `SECOES_OBRIGATORIAS` com título/nº canônicos) aparecem como **"não preenchida"** (na cor da importância do ADM) e,
    ao preencher, são criadas (`setTextoSecao`) — a chave do card é ESTÁVEL (`obr:<kw>`), então o foco não se perde. A
    **Justificativa saiu do bloco Tratamento** (edita-se direto na §3); o Tratamento ficou com os controles estruturados
    de prioridade/previsão/fundamentação. O "editável" do ADM (`editavelDe`) vale por seção obrigatória.
  - **Tipo do DFD obrigatório (`dfd.tipo`, configurável, padrão `bloqueia`, editável):** muitos formulários NÃO trazem o
    "Tipo DFD" (todos os 15 do `pd101820`). Tratamento por **seleção** (`DfdConferir`, select DFD-S/R/O/E → `TIPO_DFD_ROTULO`)
    e **em massa** no protocolo (barra de edição em massa → "Tipo"); no gravado vai pelo `PATCH /api/dfd/[id]` (`tipo`).
  - **Item duplicado (`item.duplicado`, antes só no catálogo — nunca avaliado):** mesmo código **E** mesma descrição
    (`itensDuplicados`; o mesmo código com descrição diferente — outro local — é legítimo, DFD 136 real). Tratamento:
    **"Remover item"** no `ItemDetalhe` (`removerItemDfd`, recomputa o total; no gravado grava os itens no D1).
  - **Conferência por LINHA única (`avaliarLinhaDfd`, `src/lib/conferencia-dfd.ts`, puro):** o ESTADO de cada DFD nas
    tabelas é DERIVADO das MESMAS mensagens do painel (`mensagensDoDfd`, agora no lib): algum erro ⇒ `erro`; senão alguma
    atenção ⇒ `atencao`; senão o ciclo (editado › regularizado › regular). Fora da linha só o **ano do PCA** (portão do
    protocolo) e o **catálogo** (lazy, ao abrir). Usada na ANÁLISE (`ProtocoloUploadForm`, com cache por objeto de DFD),
    no PROTOCOLO GRAVADO (`useProtocoloGravado`), no DFD gravado (`useDfdGravado`) e na LISTA da Mesa — calculada no servidor
    (`POST /api/dfd/conferencia`, em fatias de 150 ids, DFD completo + a unidade REAL com os responsáveis). O
    `protocolar()` também usa a mesma função por DFD (não protocola DFD em erro) e o "Importar DFD" avulso bloqueia se as
    mensagens têm erro — célula, painel e botões nunca se contradizem. (O antigo `apontamentosGravado` foi removido.)
  - **Protocolo:** assunto por **seleção** (`opcoesAssunto` = atual + categorias fixas + assuntos cadastrados; primitivo
    `CampoSelecao` com cadeado) e, se a capa do PDF veio **sem número**, o número pode ser informado (`numeroEditavel`).
- **Avaliação CONFIGURÁVEL pelo ADM — IMPORTÂNCIAS gerenciáveis (`avaliacao-core.ts` puro + `avaliacao.ts` loader):**
  o rigor de cada dado de **Protocolo/DFD/Item** é uma **importância** — uma LISTA que o ADM cria/edita/exclui, cada
  uma com **nome**, **cor** (hex livre) e um **comportamento** (o enum REAL da engine): `bloqueia` (trava import/
  protocolação), `avisa` (só ATENÇÃO âmbar), `automatico` (corrige sozinho onde há corretor, nunca bloqueia) ou
  `ignora` (não avalia). As **4 base** (`IMPORTANCIAS_PADRAO`: Fundamental/Intermediário/Automático/Ignorar — **ids ==
  as strings de nível históricas**, p/ a config já gravada seguir valendo sem migração) têm **nome/cor editáveis,
  comportamento FIXO e não são excluíveis**; as customizadas têm CRUD total. O **catálogo** `CATALOGO_AVALIACAO` (fonte
  única: UI + defaults + validação) traz, por ponto, `comportamentosPermitidos`/`comportamentoPadrao` (os defaults
  reproduzem o comportamento atual — config vazia ⇒ igual a hoje) + as flags `suportaEdicao`/`suportaAuto`.
  **Falta que é SEMPRE erro (`faltaEhErro`, hoje só `dfd.prioridade`):** no Automático o ajuste corrige o que dá, mas a
  FALTA (vazia ou fora de ALTA/MÉDIA/BAIXA) continua ERRO pela lógica padrão — `nivelDaFalta`/`comportamentoDaFalta`
  (usados por `avaliarDfd`/`mensagensDfd`/Tratamento/`DfdView`); nos demais níveis vale o do ADM.
  `nivelDe(regras, chave, ctx)` devolve o **id da importância** efetiva (guard valida o comportamento ∈
  `comportamentosPermitidos`; id órfão/desconhecido cai no padrão — deletar/renomear NUNCA corrompe) e
  `comportamentoNo(regras, chave, ctx)` = `comportamentoDe(regras, nivelDe(...))` é o atalho que a engine usa em TODO
  ramo (`=== "bloqueia"`/`!== "ignora"`/…). Resolve com **exceções por tipo de DFD** (`DFD-S/R/O/E`, **fixos**) e por
  **categoria de Protocolo** (`INCLUSÃO/EXCLUSÃO/ALTERAÇÃO NÃO ONEROSA`, **fixas** em `CATEGORIAS`;
  `classificarAssunto(assunto)` casa a palavra da capa). **Cores/estados que SEGUEM a importância:** `mensagensDfd`/
  `mensagensItem` marcam cada mensagem com a `cor` da importância do ponto (`corImportancia`) → `resumoEstado` usa
  `message.cor` → a célula "Estado" e o painel `MensagensDfd` mostram a cor EXATA da importância; `estadoCor`/
  `estadoItemCor`/`estadoProtocoloCor`/`estadoRotulo` recebem `regras` (opcional; sem elas = tokens de hoje) e puxam a
  cor da importância base do comportamento (severidade) ou dos **estados de ciclo** editáveis (`estadosCiclo`:
  Editado/Regularizado/Regular/Pendente — só rótulo/cor, quantidade fixa). Além da importância, o ADM controla, **por
  campo**: **`editaveis`** (`editavelDe` — se o usuário pode editar o campo na análise; travado ⇒ `disabled` no
  `DfdConferir`) e **`sinonimos`** (`aplicarSinonimos` — palavras-chave que, quando a importância é `automatico`,
  trocam o texto TODO da seção pelo valor canônico, dentro de `normalizarSecoesDfd`). Armazenado na linha
  `configuracoes` id=1 (chave `avaliacao`, **sem migração** — `importancias`/`estadosCiclo` são chaves novas do blob,
  declaradas em `avaliacaoSchema` senão o Zod as descarta), lido por `getRegrasAvaliacao()` (cache 60s, fail-safe) e
  gravado em `/api/admin/avaliacao` (`exigirAdmin`, preserva as chaves irmãs da aparência). UI = aba **"Avaliação"** de
  `/painel/configuracoes` (`AvaliacaoAdmin`: sub-aba **"Importâncias"** [CRUD — lista com ↑/↓ ordem + `Modal` editor =
  `TextField` nome + `ColorField` cor + **`Switch`** "Bloqueia importação/protocolação" + `Segmented` Avisa/Automático/
  Ignora; + bloco "Estados de ciclo" nome/cor] + sub-abas Protocolo/DFD/Item [seletor de contexto p/ as exceções, o
  `<select>` de cada ponto lista as importâncias cujo comportamento ∈ `comportamentosPermitidos`, **`Switch`** de
  editável e editor de palavras-chave]; `<select>` usa `selectCls`). O **`Switch`** (`src/components/Switch.tsx`,
  catalogado) é a chave por token (`role="switch"`, alvo ≥44px). As `regras` são threadadas
  server→cliente igual a `pcas` (`painel/dfds/page.tsx` → `DfdsView` → `DfdUploadForm`/`ProtocoloUploadForm`/
  `DfdConferir`/`ProtocoloView`/`DfdView`); o servidor reconfere em `/api/dfd`, `/api/protocolo`, `/api/dfd/[id]`
  (global + por-tipo; a categoria é aplicada no cliente e no `POST /api/protocolo`). **Não configurável**
  (estrutural/técnico, permanece travado): integridade de parse, tetos do Zod, acesso/anti-sequestro por repartição,
  **identificadores da capa/DFD imutáveis** (protocolo número/Id/data/ano do PCA; DFD número/planejamento — o TIPO é escolhido por seleção, ver abaixo). **Gates
  só-cliente** (como hoje): conciliação do valor da capa e "sem DFD com erro".
- **Trava de PROTOCOLAÇÃO — assuntos + tipos permitidos + liga/desliga dos botões (allow-list, sem migração):** aba
  **"Protocolação"** de `AvaliacaoAdmin` (Configurações → Avaliação). O ADM cadastra **assuntos permitidos**
  (`RegrasAvaliacao.assuntos` = `{id,termo}`; casa por `norm`-contains, como `classificarAssunto`), marca os **tipos de
  DFD permitidos** (`tiposProtocolo` ⊆ `TIPOS_DFD`; vazio = todos) e define o `gate`: `exigirAssunto`/`exigirTipo`
  (travas) + `protocolarHabilitado`/`importarDfdHabilitado` (botões). Núcleo PURO/testável em `avaliacao-core`
  (`assuntoCadastrado`, `tipoPermitido`, `gateProtocolo` = trava do protocolo INTEIRO com os motivos,
  `protocolarHabilitado`/`importarDfdHabilitado`; `coerceRegras` estende; `avaliacaoSchema` valida as chaves). **Config
  vazia ⇒ igual a hoje** (invariante por teste). **Enforcement:** o cliente barra o **Protocolar** (`ProtocoloUploadForm`:
  assunto não cadastrado / DFD com tipo não permitido / botão desligado → `bloqueadoPorRegra` + motivo no rodapé) e o
  **Importar DFD** avulso (`DfdUploadForm`); o servidor reconfere — `POST /api/protocolo` (botão + assunto → barra o
  protocolo inteiro) e `POST /api/dfd` (tipo por DFD + avulso com importação desligada). Gravado no MESMO blob `avaliacao`
  (o `AvaliacaoAdmin` inclui as chaves novas no PATCH → sem clobber das irmãs).
- **Tratamento + normalização das seções (`src/lib/normalize.ts` + `src/lib/dfd-tratamento.ts`, puros/testáveis):**
  ao conferir, `normalizarSecoesDfd` **padroniza automaticamente** PRIORIDADE (só `ALTA`/`MÉDIA`/`BAIXA` —
  `normPrioridade`) e PREVISÃO DE ENTREGA (é **um OU outro**: uma DATA `MÊS/AAAA` **ou** recorrente `ANUAL`
  — `ANUAL` vale **sem ano**, com ano vira `ANUAL/AAAA`; reconhece `MENSAL(MENTE)`/`ANUAL(MENTE)`/`AO LONGO DO ANO`…
  — `normPrevisao(texto, anoPca?)`). **O ANO da previsão segue o PCA do processo** (pontos 7/8): `normPrevisao`
  reconhece **só o MÊS por extenso** ("FEVEREIRO") e completa o ano com o `anoPca`; um ano explícito no texto tem
  precedência (permite a edição do usuário). `normalizarSecoesDfd(dfd, regras, anoPca?)` recebe o ano do PCA (do
  protocolo, ou do próprio DFD no avulso). O que não dá
  para padronizar fica para **tratar** à mão. O bloco **Tratamento** do `DfdConferir` edita PRIORIDADE (`Segmented`),
  PREVISÃO (mês + ano [padrão = ano do PCA] + toggle ANUAL; `buildPrevisao`, puro) e FUNDAMENTAÇÃO LEGAL (`TextField`,
  padrão "Lei 14.133/2021") — só componentes do DS; o texto canônico volta para `secoes[i].texto` e flui pelo envio
  normal (sem migração). A JUSTIFICATIVA e as demais seções editam-se direto na seção (cadeado por seção, ver acima). Cada DFD ganha um
  **estado** (`estadoDfd`: com erro › editado › regularizado › regular › pendente; cor por token `--danger/--info/
  --warn/--ok/--muted`). Setor **é** repartição (rótulo unificado; a "regularização" é gravar `reparticaoId`).
- **Edição de PCA** (`pcas`/`pca_dfds`) une DFDs selecionados **por referência** (DFDs novos não mudam uma
  edição já gerada) — plano consolidado da Prefeitura, **escopo por repartição** (sem `grupo_id`, como as
  `unidades`; listagem via `getReparticaoFiltro`). Lógica em **`src/lib/dfd.ts`** (upsert por `numero`; batch
  de `dfd_itens` a **11×9=99** params; `excluirDfd` bloqueia se o DFD está em alguma edição). Validação
  só-schema em `src/lib/dfd-validation.ts`.
- **PCA — registro leve + ativo (Configurações do ADM, migração `0020`):** além da edição (unir DFDs), um `pcas`
  pode ser um **registro leve** (só nome+ano, totais 0) e **um** é marcado **`ativo`** (o vigente). Funções puras em
  `dfd.ts`: `cadastrarPca({nome,ano})`, `atualizarPca(id,{nome?,ano?})`, `definirPcaAtivo(id)` (`db.batch`: zera todos
  → liga 1). Schemas `cadastrarPcaSchema`/`editarPcaSchema`/`patchPcaSchema` (**`gerarPcaSchema` intacto**). API admin
  `POST /api/admin/pcas` + `PATCH`/`DELETE /api/admin/pcas/[id]` (**`exigirAdmin`**; PATCH = `{ativo:true}` OU nome/ano).
  Badge **"Ativo"** (`Badge`) no `PcaModuleView` e na tabela do Configurações. `listarPcas` ordena o ativo primeiro.
- **Escrita de DFD em LOTES (escala a milhares de itens):** `dfd.ts` decompõe em `upsertDfdCabecalho` (cabeçalho +
  apaga itens antigos + 1º lote) e `appendDfdItens` (lotes seguintes, **11×9=99** params). `POST /api/dfd` é uma
  **discriminated union em `mode`** (`start-dfd` | `append-dfd-itens`, `dfdOpSchema`) — o cliente
  (`src/lib/importar-dfd.ts`, `enviarDfdEmLotes`) envia em lotes de 200 com **barra de progresso** (`Progress`).
  `start-dfd` re-valida `faltasObrigatorias` (defeituoso nunca grava, 422); idempotente por `numero` (retomável).
- **Gravação garantida (all-or-nothing por DFD):** `enviarDfdEmLotes` faz **retry** de falha transitória (rede/5xx;
  4xx não) e, se um lote falhar de vez, **apaga o DFD parcial** (`DELETE`) — não fica DFD pela metade. **Exceção: DFD que
  JÁ EXISTIA** (sobrescrita/reenvio, `opcoes.existia`) **não é apagado** (perderia também a versão anterior) — a falha diz
  "gravação INCOMPLETA (n de N itens): reenvie para completar". `appendDfdItens`
  é **idempotente** (apaga `sequencial > desde` antes de gravar → retry não duplica). O banner de importação fica
  **`bloqueado`** (Modal sem X/Esc/backdrop, sem Cancelar) + `beforeunload` enquanto grava — não dá pra interromper.
- **Segurança (escopo por repartição em TODA escrita):** `POST /api/dfd` (`start-dfd`/`append`), `PATCH`/`DELETE
  /api/dfd/[id]`, `PATCH`/`DELETE /api/protocolo/[id]` e os `GET/[id]` checam `reparticaoId == null || lista.some(...)`
  com a `lista` de `getReparticaoContexto` (**admin = todas**) — 403 fora do escopo. `start-dfd` tem **anti-sequestro**
  por `numero` (não sobrescreve DFD de repartição inacessível). O `PATCH /api/dfd/[id]` (`editarDfdSchema`) vincula a
  protocolo E/OU edita **repartição/seções/itens/refs + o CONTEÚDO do cabeçalho** (objeto/órgão/setor/responsável/
  matrícula/e-mail/telefone + **tipo** (seleção) + **assinaturas** (validação pela equipe) — identificadores número/planejamento imutáveis; não move p/ repartição inacessível);
  o `PATCH /api/protocolo/[id]`
  (`editarProtocoloSchema`) edita a **repartição + os campos de CONTEÚDO da capa** (interessado/assunto/observação/
  CPF-CNPJ/valor/local) — os **IDENTIFICADORES** (número/Id/data/ano do PCA) são IMUTÁVEIS (o schema **não** os aceita).
  Teto de `totalItens` (100k) e `rows` (1000/lote) no Zod;
  Drizzle parametriza (sem SQL injection).
- Rotas: `POST /api/dfd` (lotes), `GET`/`DELETE`/`PATCH /api/dfd/[id]`, `POST /api/pca`, `PATCH`/`DELETE /api/pca/[id]`
  (envelope+guardas). UI em `/painel/pca` = `PcaModuleView` (cards 4:5 → espaço do PCA, ver "PCA como ESPAÇO");
  a edição legada segue em `/painel/pca/edicao/[id]`.
- **Protocolo → DFDs (migração `0016`) — importação em STREAMING:** um **protocolo** (o "processo") empacota
  **vários DFDs** (escala a **milhares**); todo DFD vem de um protocolo. Entidade `dfd_protocolos` (escopo por
  **repartição**, `numero`=Número Processo único; **`idExterno`** = "Id:" da capa, migração `0019`; sem `grupo_id`) +
  `dfds.protocoloId` nullable (FK `set null`). **Dedup/sobrescrita por Id:** não coexistem dois protocolos com o
  MESMO `idExterno` — protocolar **sobrescreve** o de mesmo Id (`iniciarProtocolo` apaga o de mesmo Id e número
  diferente antes do upsert por `numero`; o `POST /api/protocolo` faz o **anti-sequestro por Id E por Nº** — 403 se o Id
  ou o número já existe em unidade inacessível: `getProtocoloPorIdExterno`/`getProtocoloPorNumero`). O **DFD** já dedupa/sobrescreve por `numero` (`upsertDfdCabecalho` onConflict em
  `dfds.numero`; `planejamento` é DADO, atualizado no overwrite).
  **Excluir em CASCATA (regra do usuário):** `excluirProtocolo` (`protocolo.ts`) apaga os **DFDs vinculados**
  (`delete dfds where protocoloId`) ANTES do protocolo, no MESMO `db.batch` — os **itens** caem por `dfd_itens.dfdId`
  cascade e o vínculo de edição por `pca_dfds.dfdId` cascade; não deixa DFD órfão (antes o `set null` orfanava).
  **Conflito de DFD na importação — escolher qual PREVALECE (regra do usuário):** quando um DFD do protocolo já existe
  no banco, o banner mostra **Substitui/Move** (`classificar` sobre `dfdsExistentes`, threado de `DfdsView`) e o botão
  **"Manter o existente"** (no banner do DFD) descarta o incoming (`descartarDfd` → `descartados`; `protocolar` já pula
  descartados) → o **já cadastrado prevalece** (não é sobrescrito); sem descartar, o **novo prevalece** (sobrescreve por
  `numero` + reatribui `protocoloId`). Antes só havia a escolha p/ duplicatas do próprio arquivo (`manterDfd`).
  O **PDF do protocolo** é lido no navegador em 2 passos, sem OOM: (1) **índice leve** — `abrirPdf` (documento pdf.js
  streamável, `pageItems` sob demanda) + `indexarProtocolo` (só o texto por página → capa + DFDs por "Número DFD"
  com o cabeçalho; a geometria é descartada por página, **EXCETO a da CAPA** — guardada p/ a extração coluna-aware).
  **Capa multi-linha (crítico):** os campos da capa (Interessado, Observação, Assunto) podem **quebrar em várias
  linhas**, e a capa é um formulário de **2 COLUNAS** (o rótulo `CPF/CNPJ:` da direita pode cair numa linha própria
  ENTRE o rótulo `Interessado:` e sua continuação). O `buscar` de 1 linha deixava o Interessado **VAZIO**. Agora
  `extrairCapa` usa o helper puro **`camposCapa(items)`** (geometria da capa): agrupa por linha, uma linha da coluna
  ESQUERDA que começa com rótulo conhecido (`norm`, sem acento) abre um campo, uma linha esquerda sem rótulo é
  **continuação (wrap)**, e uma linha só da coluna DIREITA é **pulada** — capturando o valor INTEIRO. Sem geometria
  (Node/testes) cai no regex de 1 linha. Validado no `Protocolo 4.pdf` real (Interessado/Observação completos). (2) ao **Protocolar**, DFD a DFD: `parseDfdDoProtocolo`
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
  sobreviverem** ao envio (a análise NÃO re-parseia/sobrescreve um DFD que o usuário já abriu ou editou em massa —
  `parsedRef` —, mas ainda prevê a unidade e põe na fila do OCR a partir da cópia do cache);
  `protocolar` usa a cópia do cache e só re-parseia o que faltou. **Progresso REAL da análise:** `analise =
  {fase:"texto"|"ocr", feito, total, atual}` → barra `Progress` no rodapé ("Analisando DFD 1234 (3 de 15)…" /
  "Lendo assinatura por OCR — DFD …") e, por linha, `LinhaDfd.processando` ("Lendo o DFD…"/"Lendo assinatura
  (OCR)…"/"Na fila", com spinner na célula Estado); a leitura do PDF (índice) mostra "Página p de N"
  (`indexarProtocoloPdf(file, onProgresso)`). Corpo do banner = `ProtocoloView` (corpo ÚNICO, ver abaixo). **Capa: identificadores IMUTÁVEIS, conteúdo editável (cadeado por campo) + conferência do valor:** os
  **IDENTIFICADORES** da capa (número/Id/data/ano do PCA) **não são editáveis em nenhum tempo**; os campos de
  **CONTEÚDO** (interessado/assunto/observação/CPF-CNPJ/valor/local) têm **cadeado POR CAMPO** (a mesma lógica dos itens,
  primitivos em `CampoCadeado`) — destraváveis tanto no **preview do PDF** (`modo="cadeado"` do `CapaCampos`) quanto no
  **gravado destravado**; a criação manual usa inputs simples (`modo="criar"`). A **repartição** (roteamento) segue
  editável (seletor obrigatório na análise e no gravado). O **Valor da capa** é editável e **conciliado** — na análise E
  no gravado — pela fonte única **`conciliacaoCapa`** (`dfd-tratamento`, pura): capa **nula/zerada** OU **diferente** da
  somatória (arredondada ao centavo; `valoresBatem`) ⇒ divergente; só confere com a somatória COMPLETA (análise
  terminada e TODOS os DFDs lidos — um DFD ilegível somaria 0; descartados fora, mas o DFD EXISTENTE mantido por
  "Manter o existente" deste MESMO protocolo continua no processo e entra na somatória/contagem) e **NÃO depende de os
  DFDs estarem sem erro** (antes a divergência sumia enquanto houvesse
  DFD com erro — e o relatório perdia a linha da capa). O botão **"Substituir pela somatória"** (um clique) aparece na
  análise e no gravado; `protocolo.valorCapa` do ADM decide se trava (padrão) ou só avisa. O Estado AGREGADO da lista de
  protocolos (`avaliarProtocolo`) usa a MESMA régua para a capa; o `motivo` vai ao despacho. O preview mostra TODOS os dados da capa igual ao gravado
  (Id, CPF/CNPJ, **Valor da capa**, Local) + **mini banners** (`StatMini`) de total de DFDs + **somatória**. **Separa as vias** (`classificarPdf`, em `parse-protocolo-pdf-core.ts`): protocolo (capa OU ≥2
  "Número DFD") não entra pela aba DFDs e o DFD avulso não entra pela aba Protocolos; documento estranho é recusado.
  Sem nova aba.
- **Importação por botão único + lançador (`Dropzone`):** cada tela de importação (Protocolos, DFD, Planilha PCA) tem
  **um botão "Importar" à direita** que abre um **banner lançador**; no protocolo ele é **dividido ao meio** (soltar/
  escolher o PDF **|** criar protocolo manualmente). Isso libera espaço para as tabelas: as de **DFDs/Protocolos**
  (telas DFD e PCA) usam `DataTable fillHeight` (linhas por página automáticas p/ preencher a altura do display no
  desktop, sem scroll do navegador); as demais tabelas ficam em **≤20 linhas/página**.
- **Protocolação bloqueada com DFD defeituoso:** o botão "Protocolar" fica **desabilitado** enquanto algum DFD estiver
  com **erro** (ou ainda analisando) — não se protocola um processo com DFDs defeituosos (o `POST` segue validando por
  garantia). Estado **"regularizado automaticamente" = verde** (`estadoCor`).
  **Tabela ÚNICA de DFDs — `PlanilhaDfds` (`src/components/PlanilhaDfds.tsx`):** o MESMO componente lista DFDs em
  TODO lugar — banner de importação, banner do protocolo GRAVADO (`ProtocoloView`) e a **aba DFDs** (`DfdsView`). Cada
  tela mapeia seus dados (parse do PDF / D1) para o modelo `LinhaDfd`. Colunas: **[seleção] · Estado · [Situação] · Nº
  Plan. · Nº DFD · Sigla · Tipo (`tipoCurtoDfd`) · Assinatura · [Protocolo] · Itens · Valor total · [ações]** (o
  planejamento vem ANTES do DFD; a seleção usa a **`BarraSelecaoDfds`** — chips + Σ + **"Copiar planejamentos"**, que copia
  os nºs de planejamento dos selecionados separados por ":" SEM espaço, ex.: `1525:1549:1554` — `textoPlanejamentos`) (as
  opcionais só aparecem quando há dado), **todas filtráveis/ordenáveis** e **sem quebra de linha** (`Column.nowrap` do
  `DataTable`: a coluna ganha a largura do CONTEÚDO — ex.: os badges da Assinatura + "(auto)" numa linha só; a tabela
  rola no eixo x do próprio container). Na **ANÁLISE** os **DFDs com erro/atenção ficam em tabelas SEPARADAS** acima das
  regulares; **depois de protocolado** (`unica`) é **UMA tabela só** (o filtro da coluna Estado separa) — a única
  diferença entre análise e gravado. `LinhaDfd.processando` mostra spinner + o que está acontecendo ("Lendo o DFD…",
  "Lendo assinatura (OCR)…", "Na fila", "Conferindo…"). A célula Estado é o componente `EstadoCelula`
  (`EstadoResumo`/`EstadoPonto`, o MESMO nas tabelas de DFDs, itens e protocolos); **rodapé = só os agregados** (nº · itens · somatória). A repartição é a coluna **Sigla** (atribuição
  pela edição em massa ou abrindo o DFD ao lado) — a sigla vem em **AZUL (accent) quando detectada automaticamente**
  (a própria cor denota o auto; **sem** o antigo rótulo "auto"), e na cor normal quando definida à mão.
  - **Filtro da coluna Estado = TODOS os problemas** (inclusive os escondidos no `+N`): `resumoEstado` devolve também
    `rotulos` (curtos, sem repetição; `MensagemDfd.rotulo` p/ seção fora do padrão — "Prioridade/Previsão/Fundamentação
    inválida", `ROTULO_CURTO_INVALIDA`) → a coluna é MULTI-VALOR (`Column.valores`) e filtrar "Sem prioridade" acha também o
    DFD cujo principal é outro erro.
  - **Célula "Estado" APONTA o erro (≤ 3 palavras) em vez de "Com erro"/"Atenção"** (`resumoEstado`/`ROTULO_CURTO`, puros):
    mostra o problema PRINCIPAL (1º erro; sem erros, 1ª atenção) na cor da severidade + contadores **`+N`** dos demais
    (`+N` **vermelho** = erros além do principal; `+N` **âmbar** = atenções — ex.: "Assinatura não conferida +2 +1"). O atributo
    `title` traz a **lista completa** (erros + atenções) no tooltip nativo, sem abrir o DFD. **Regular não muda.** A
    tabela de itens do `DfdView` usa o mesmo resumo por `mensagensItem` (valor unitário/quantidade).
  - **Coluna "Assinatura"** identifica o tipo por `Badge`: **Centi** (verde) = certificado/sistema, **Dropsigner** (azul),
    **Adobe** (vermelho) — `grupoAssinatura`/`gruposAssinatura` (puros); o servidor deriva `assinaturaGrupos` (`dfd.ts`
    `comGrupos`) **sem** trazer o JSON pesado das assinaturas para as listas. **Capa em `CapaCampos`** (exportado de `ProtocoloView`) — a MESMA grade de
  campos da capa na importação e no gravado; **identificadores** (número/Id/data) sempre só-leitura, **conteúdo** com
  cadeado por campo (`modo` `leitura`/`criar`/`cadeado`).
  O **head** mostra **Id + Assunto** ao lado do nº. Quando há erro, um botão **"Relatório de erro"** no rodapé abre o
  `RelatorioErros`. A **barra de edição em massa** fica FIXA no rodapé do banner (controle do valor em cima; seletor do
  campo + Aplicar + Limpar embaixo) — é o componente **`BarraEdicaoMassa`** (emite uma `AcaoMassa`; conteúdo aplicado por
  `aplicarMassaDfd`, puro; só oferece os campos que o ADM deixou editáveis). **Corpo do banner do protocolo = UM
  componente (`ProtocoloView`)** na análise E no gravado: mini banners + conciliação da capa (+ "Substituir pela
  somatória") + `CapaCampos` + unidade/PCA + `PlanilhaDfds` (com seleção).
- **Item/DFD com ESTADO + relatório de erro (DfdView/DfdConferir):** a **tabela de itens** (Seção 4) tem uma coluna
  **Estado** por item que **aponta a falta ESPECÍFICA** (`resumoEstado(mensagensItem(it))`: "Item sem valor"/"Item sem
  quantidade" + `+N` + tooltip `title`; `estadoItem`/`faltasDoItem` seguem como base), **filtro em todas as colunas** e,
  na ANÁLISE, os **itens com pendência numa tabela SEPARADA** (acima da de regulares); no DFD gravado (`unica` /
  `DfdConferir.tabelaUnica`) é UMA tabela só. O nº/tipo/planejamento
  do DFD (e nº/Id/Assunto do protocolo) ficam no **cabeçalho FIXO do banner** (`Modal.cabecalho` = `DfdCabecalho`/
  `ProtocoloCabecalho`) — NÃO se repetem no corpo. **Rodapé de TODA tabela = só os agregados das linhas** (`resumo`):
  nº de itens/DFDs + somatória dos valores (nunca texto de ajuda). **Mensagens/relatórios CIRÚRGICOS:** `faltasCirurgicasDfd`
  aponta EXATAMENTE o erro (quais itens, qual seção) e O QUE fazer; o relatório do protocolo sai em **formato de
  DESPACHO de devolução** (`linhasRelatorioProtocolo`) pronto p/ devolver o processo — os **DFDs com a MESMA pendência
  são agrupados numa única mensagem** e cada DFD é referenciado por **número + nº de planejamento** (ex.: "DFDs 531
  (Planej. 640), 702 (Planej. 811):"). Quando há erro, o botão
  **"Relatório de erro"** (rodapé, alinhado à direita) abre o `RelatorioErros`. Helpers puros em `dfd-tratamento.ts`
  (`itemComErro`/`estadoItem`/`faltasCirurgicasDfd`/`linhasRelatorioDfd`/`linhasRelatorioProtocolo`/`SECOES_OBRIGATORIAS`
  [fonte única, reusada por `faltasObrigatorias`] + `ESTADO_PROTOCOLO_ROTULO`/`estadoProtocoloCor`; o estado agregado do
  protocolo vem de `avaliarProtocolo`).
- **Painel LATERAL de MENSAGENS do DFD (`MensagensDfd`) — todas as conferências, navegáveis:** as mensagens NÃO
  aparecem mais soltas no corpo do banner do DFD. `mensagensDfd` (puro, `dfd-tratamento`) monta a lista COMPLETA
  (erro/atenção/**acerto**, sem exceção — só omite pontos "ignorar" do ADM), cada uma com uma **âncora** (id do
  componente: `reparticao`/`anoPca`/`justificativa`/`previsao`/`prioridade`/`fundamentacao`/`referenciaRenovacao`/
  `itens`/`valor`/`assinatura`, marcadas com `data-ancora` no `DfdConferir`/`DfdView`). `mensagensDoDfd` (`src/lib/
  conferencia-dfd.ts`) já confere a assinatura e é a **fonte única** (contador do botão + painel + célula Estado via
  `avaliarLinhaDfd`). O rodapé do banner do DFD é o componente **`DfdRodape`** (estado + ações + mensagens + Fechar +
  ação principal) e o painel da direita é **`DfdPainelDireito`** (mensagens / item / histórico) — os MESMOS na análise
  (avulso e protocolo) e no gravado (DFD solto e DFD ao lado do protocolo gravado). O botão **`BotaoVerMensagens`**
  (Ver/Ocultar mensagens + a numeração por status) fica no **RODAPÉ FIXO do banner do DFD, à esquerda do Fechar** (não
  no corpo). Ao abrir, um **novo banner** de mensagens surge **AO LADO DIREITO** do DFD (mesma animação de lateral),
  ficando **ambos manipuláveis** (o DFD NÃO é substituído): **DFD avulso / gravado solto** → o DFD é o principal e as
  mensagens são o `Modal.lateral` (2 painéis); **dentro de um protocolo** → o `Modal` ganhou um **`lateral2`** (3º painel)
  e ficam **três banners proporcionais**: protocolo | DFD | mensagens (as colunas do grid animam por fração; no mobile,
  um por vez — o mais à direita aberto; Esc fecha da direita p/ a esquerda). **Clicar numa mensagem** rola o banner do
  DFD (que segue ao lado) até a âncora e a **destaca na cor do status** (`ancoraAlvo` = {ancora, cor, nonce}; `box-shadow`
  que pulsa e some). `contarMensagens` alimenta a numeração; "Copiar pendências" no painel reusa `linhasRelatorioDfd`.
- **Detalhe do ITEM no MESMO painel da direita + seleção MARCADA (mestre-detalhe):** clicar numa **linha de item**
  da Seção 4 abre o **`ItemDetalhe`** (todas as infos do item + estado) no **mesmo lugar** do painel de mensagens
  (o painel da direita mostra mensagens OU o item — estado único `PainelDfd` = `{tipo:"mensagens"}` | `{tipo:"item",idx}`,
  exportado de `DfdConferir`). A seleção da esquerda fica **destacada** (`DataTable` ganhou `activeKey`; `PlanilhaDfds`,
  `ativa`): no protocolo, o **DFD aberto** fica marcado na tabela de DFDs; no DFD, o **item aberto** fica marcado na
  tabela da Seção 4 — os dados da direita SEMPRE representam a seleção marcada à esquerda. Trocar de DFD/fechar zera o
  painel. `DfdView`/`DfdConferir` propagam `onItemClick(idx)` + `itemAtivo`.
- **Item EDITÁVEL com cadeado POR CAMPO + bloqueio "igual ao catálogo":** o `ItemDetalhe` (`editavel`+`onChange(patch)`)
  tem **um cadeado por campo** (`IconLock`/`IconLockOpen`, estado `abertos: Set<CampoK>` interno; reinicia por `key`).
  Cada campo começa só-leitura; destravar vira input do DS (`cellCls`; numéricos com rascunho local + `parseNumberBR`; a
  **Descrição** usa `AutoTextarea` — altura = `scrollHeight`, mostra o texto INTEIRO, sem cortar). **Um campo IGUAL ao
  catálogo NÃO pode ser alterado** (`toast.error`): Código (chave do match), Descrição (`!conf.divergDescricao`), Unidade
  (`!conf.divergUnidade`); Quantidade/Valores não têm equivalente → sempre livres; item não catalogado → tudo livre.
  Vale na **importação E no gravado** (os hosts passam `editavel`+`conformidade`). A edição recomputa o **valorTotal do
  DFD** (Σ) via `editarItemDfd`. No **gravado**, a edição do item entra no RASCUNHO do DFD e vai ao banco no "Salvar
  alterações" do banner (`PATCH /api/dfd/[id]` `{itens}` → `reescreverDfdItens`, apaga+reinsere + recomputa total). Só
  **editor**; escopo por unidade e `valorUnitario>0` no servidor.
- **GRAVADO = ANÁLISE (mesmos componentes, conferência, seleção e ajustes — a ÚNICA diferença é a tabela única):**
  - **`useProtocoloGravado`** (`ProtocoloGravado.tsx` — hook que devolve os PAINÉIS do banner do protocolo já protocolado,
    composto pelo `BannersMesa`): carrega o protocolo COMPLETO (`GET /api/protocolo/[id]
    ?completo=1` → capa + DFDs com seções/assinaturas/itens + as UNIDADES deles com os responsáveis, via
    `listarDfdsCompletosDoProtocolo`/`unidadesConferencia`) e usa o MESMO corpo (`ProtocoloView`), a MESMA conferência por
    linha (`avaliarLinhaDfd`), a MESMA barra de massa (`BarraEdicaoMassa`), o MESMO DFD ao lado (`DfdConferir` +
    `DfdRodape`), o MESMO painel da direita (`DfdPainelDireito`: mensagens/item/**histórico**) e o MESMO relatório
    (despacho). As edições ficam num **RASCUNHO** (capa + DFDs + itens) até **"Salvar alterações"**, que envia **só o que
    mudou** (`diffCapaGravada`/`diffDfdGravado`, `src/lib/dfd-edicao.ts`, puros e testados): `PATCH /api/protocolo/[id]` +
    um `PATCH /api/dfd/[id]` por DFD alterado, com barra de progresso; falhas mantêm o rascunho daquele DFD (o resto
    recarrega do banco). Fechar/Atualizar com alterações pendentes pede confirmação (+ `beforeunload`). DFD de unidade
    sem acesso fica só-leitura (conferido com a unidade REAL). **Sem o antigo cadeado global** — vale o cadeado POR
    CAMPO/SEÇÃO, igual à análise; os não-editores veem tudo só-leitura. Robustez: só a carga MAIS RECENTE é aplicada
    (resposta atrasada de outro protocolo é ignorada), fechar zera o rascunho (o aviso de saída não fica ligado),
    durante a gravação tudo fica só-leitura (e sem "Atualizar"), e cada PATCH é resiliente a rede/5xx (vira falha
    daquele alvo; os demais seguem). No gravado o **ano do PCA** é identificador → fora das mensagens do banner; DFD
    antigo sem ano herda o do protocolo (`protocoloAnoPca`). O rodapé do DFD usa a MESMA régua do painel
    (`estadoDeMensagens`, em `conferencia-dfd.ts`).
  - **`useDfdGravado`** (`DfdGravado.tsx` — hook; DFD solto, aberto pelas listas DFDs/Itens da Mesa): o MESMO `DfdConferir` (tabela de itens única),
    `DfdRodape` (estado + Histórico + Ver protocolo + "Salvar alterações") e `DfdPainelDireito`; rascunho + diff igual.
    `GET /api/dfd/[id]` devolve também a `unidade` (responsáveis) p/ conferir com a unidade real. "Ver protocolo" abre
    o protocolo à direita (pilha do `BannersMesa`).
  - **Mesa → DFDs:** `PlanilhaDfds` **única** + `scrollInterno`, com a conferência REAL por linha (`POST
    /api/dfd/conferencia`, lazy em fatias de 150 — "Conferindo…" até chegar; resultados em CACHE pela chave do DFD
    `id|atualizadoEm|unidade|assunto do protocolo` → após `router.refresh()` só os DFDs que mudaram são reconferidos;
    regras/órgãos/unidades novos zeram o cache), **seleção** + `BarraEdicaoMassa` → `POST /api/dfd/massa` enviado em
    FATIAS de 20 (≤ 50 por requisição no `massaDfdsSchema` — cabe no limite de consultas por invocação do D1), com
    barra de progresso; por DFD: escopo por unidade, campo travado pelo ADM recusado, troca de unidade reconfere a
    assinatura contra o destino, falha de um DFD vira `falhas` (não derruba o lote); auditoria por DFD.
    **Mesa → Itens:** coluna **Estado** do item (mesma célula `EstadoCelula`). **Mesa → Protocolos:** Estado AGREGADO
    (`avaliarProtocolo` — capa + DFDs + itens, ver acima). Excluir protocolo avisa que os DFDs vinculados (e itens) são
    excluídos junto (cascata).
  - **Seleção + edição em massa nas TRÊS visões da Mesa — `BarraSelecao` FIXA no rodapé do DISPLAY:** DFDs, Protocolos e
    Itens têm seleção (só editores). A barra fica **`position: fixed`** rente ao rodapé do display (acima da navegação
    inferior no celular) **mesmo com a tabela curta**, alinhada à coluna de conteúdo (medida pelo LUGAR que reserva no
    fluxo; `RESPIRO_MAIN` = o `pb` do `<main>` que ela cobre) e informa esse lugar (`onAltura`) → a tabela `scrollInterno`
    desconta (`reservaInferior`). Em cima, o **registro das seleções** (chips removíveis; "Limpar seleção"); no meio, a
    contagem + **somatório (R$)** (`ResumoSelecao`); embaixo, o editor: `BarraEdicaoMassa` (DFDs → `POST /api/dfd/massa`),
    **`BarraEdicaoMassaProtocolos`** (unidade [se editável pelo ADM] / assunto (`opcoesAssunto`) / valor da capa = somatória
    dos DFDs → **`POST /api/protocolo/massa`**, ≤ 20 por requisição) e **`BarraEdicaoMassaItens`** (padronizar pelo
    catálogo / unidade / quantidade / valor unitário / remover → **`POST /api/dfd/itens/massa`**, ≤ 100 itens de ≤ 5 DFDs
    por requisição — `fatiarItensPorDfd`; o servidor lê SÓ os itens pedidos (`itensParaMassa`) + quantos itens cada DFD
    tem (`dfdsParaMassa`) e grava num LOTE ATÔMICO `aplicarPlanoItens` (UPDATE … CASE por coluna, ≤ 98 params) com os
    **totais RECALCULADOS NO BANCO** (subconsulta Σ/COUNT no mesmo lote — edição concorrente não desalinha o total) e o
    DELETE só roda se sobrar ≥ 1 item; núcleo puro **`massa-itens.ts`** (`planejarMassaItens`: unidade igual ao catálogo
    travada, remover nunca zera o DFD)). Confirmação antes de gravar, progresso por fatia, falhas por alvo sem derrubar o
    lote, auditoria por protocolo/DFD (itens: **antes/depois** por item). No celular a barra pode ser **recolhida** (fica
    o resumo). Enquanto um banner da pilha GRAVA, nada troca/fecha/empilha, e a recarga pós-gravação só vale se o banner
    ainda mostra o mesmo DFD/protocolo (no modo item, reencontra o item EXIBIDO).
  - **Botão ATUALIZAR** (`IconRefresh`, ao lado do X) nos banners gravados: recarrega do banco (confirma se há rascunho).
  - **REENVIAR PROTOCOLO (sobrescrever com comparação)** — botão **"Reenviar protocolo"** no rodapé do protocolo gravado (`useProtocoloGravado`)
    (desabilitado com rascunho pendente) → o **MESMO `ProtocoloUploadForm`** em modo `reenvio` (`BaseReenvio` = protocolo +
    DFDs completos já carregados), com lançador próprio. Núcleo PURO **`comparar-protocolo.ts`** (testado):
    `identidadeReenvio` (só o MESMO nº **e** Id — outro protocolo é recusado no lançador E no servidor, 422),
    `compararCapa`, `compararDfd` (cabeçalho, **seções casadas pelo TÍTULO sem numeração**, assinaturas, **itens pareados**
    por nº → código+descrição → código: novo/removido/alterado campo a campo; situação novo/igual/alterado),
    `linhasRelatorioReenvio` (relatório copiável) e **`herdarTratamentos`** (o que o PDF NÃO traz e o gravado já tratou —
    tipo, seções obrigatórias ausentes/fora do padrão, referências de renovação, validação da assinatura pela equipe — é
    herdado, nunca sobrescrevendo valor válido do PDF; listado como "Herdado do gravado"). UI (`ComparacaoReenvio.tsx`):
    **`ComparacaoProtocolo`** no topo do banner (`ProtocoloView.topo`: contagens Novos/Alterados/Sem diferença/Fora do PDF,
    diferenças da CAPA, DFDs gravados que não vieram no PDF com **Excluir/Manter** um a um ou todos, "Relatório de
    diferenças"), coluna Situação "Novo/Igual/Alterado (N)" e, por DFD, o botão **"Diferenças (N)"** → painel da direita
    (`DfdPainelDireito` `{tipo:"diferencas"}` → **`ComparacaoDfdView`** + `DiffLinha` gravado × novo) e **"Manter o gravado"**
    (descarta o novo). O usuário **edita antes** (mesma conferência/edição em massa da análise). **Sobrescrever** confirma
    com o resumo, envia `start-protocolo` com `reenvio {protocoloId, resumo}` (o servidor confere escopo + identidade e
    audita "REENVIADO (sobrescrito)"), **regrava só os DFDs que mudaram** (os "igual" ficam como estão), exclui os fora do
    PDF marcados "Excluir" (padrão) e recarrega o gravado. Garantias: o servidor grava no MESMO registro (**nº exatamente
    como gravado** e **Id gravado** quando o PDF não traz — nunca apaga o Id); a comparação de assinaturas inclui formato,
    código e a **validação da equipe** (validar/desfazer é diferença); DFD **editado** na análise nunca é pulado como
    "igual"; a validação da assinatura é herdada **depois do OCR** (`herdarTratamentos(…, {assinaturas})` em partes — a
    assinatura achatada só existe após a leitura) e o servidor mantém **quem/quando** da validação já gravada
    (`carimbarValidacao` com as assinaturas do DFD existente); itens pareados por código+descrição → nº → código (remoção
    com renumeração = 1 "removido"); o relatório lista os DFDs **ainda não comparados**; o lançador só abre num clique NOVO.
  - **"1 · Área requisitante da demanda" editável (cadeado por campo):** para editores, o `DfdConferir` mostra o bloco
    editável (âncora `anoPca`) no lugar da Seção 1 só-leitura (`ocultarSecao1`); identificadores (Nº DFD/Planejamento/Ano
    do PCA) seguem travados; o conteúdo flui por `onCamposChange` → `atualizarDfdCampos` (que agora também sincroniza o
    `orgao_id` quando a unidade muda).
  - **PATCH /api/dfd/[id]** reconfere a assinatura **só quando a unidade ou as assinaturas MUDAM de fato** (comparação
    canônica) — salvar uma seção de um DFD cuja assinatura já não confere não fica travado — e valida os ITENS (≥ 1,
    todos com valor unitário) ANTES de qualquer escrita (campos + itens vão juntos; nada é gravado pela metade).
- **Ano do PCA + referências de renovação (migração `0021`) — `ano_pca` no protocolo e no DFD; `numero_contrato`/
  `numero_ata`/`numero_licitacao` no DFD (tudo nullable):** ao ler o PDF, `anoPcaDoTexto` (`parse-dfd-comum.ts`, puro)
  **identifica o ano do PCA pela descrição** — ponto 6: "PCA 2027", "PCA/2027", "PCA DE 2027", **"PCA DO ANO DE 2027"**
  (o ano pode até **quebrar de linha** na observação da capa — o vão entre "PCA" e o ano tolera "DO ANO DE" + a quebra,
  sem casar dígitos no meio). É a **única** lógica de identificação do PCA do protocolo (o `anoPca` próprio de cada DFD
  não concorre — no protocolo, todos seguem o do protocolo). O usuário **confirma ou
  escolhe** o PCA no **`PcaPicker`** (componente do DS, `select` dos PCAs **cadastrados em Configurações** — guarda o
  **ano** integer, não o id; pré-selecionado só se o ano adivinhado existir cadastrado). **Obrigatório:** não se
  protocola nem se importa DFD avulso sem PCA definido (portão à parte de `faltasObrigatorias` — no cliente
  desabilita o botão, e o servidor rejeita 422: `POST /api/protocolo` e `POST /api/dfd` `start-dfd`). **Todos os DFDs
  do protocolo herdam o ano do PCA do protocolo** no envio (`ProtocoloUploadForm.protocolar` põe `anoPca` em cada
  `enviarDfdEmLotes`) — inclusive o **ano da PREVISÃO de entrega** segue o PCA (ponto 7: `normalizarSecoesDfd`/`normPrevisao`
  recebem o `anoPca`). Nos **DFD-R** (renovação), `referenciasRenovacao`/`extrairRefsDfd` separam nº de **contrato**,
  **ARP** (ata de registro de preços; a coluna segue `numero_ata`, o rótulo na UI é **"Nº da ARP"**) e **licitação** da
  descrição para campos próprios — **VÁRIAS por DFD** (um DFD-R pode citar vários contratos/ARPs/licitações):
  `extrairRefs` coleta TODAS as menções (plural e listas "Contratos nº 045/2025, 112/2025 e 7/2024" — itens da lista só com
  a mesma forma "/"), guardadas nas MESMAS colunas unidas por "; " (`SEPARADOR_REFS`, `juntarRefs`/`listaRefs` — sem
  migração; `refsOpc` até 1000 caracteres) e comparadas por CONJUNTO no reenvio (a ordem não importa); o `DfdConferir`
  mostra um bloco **Referências da renovação** (editável, um **`CampoLista`** por tipo — um valor por chip; Enter/","/";"
  acrescenta, Backspace remove) e, se o DFD-R não tiver **nenhuma**, um **aviso não-bloqueante** (aponta,
  não trava) — o usuário pode preencher à mão. O `DfdView` exibe **Ano do PCA** (Seção 1) e as referências (só DFD-R);
  o `ProtocoloView` mostra o **PCA (ano)** na capa. Editar refs num DFD gravado vai pelo `PATCH /api/dfd/[id]`
  (`editarDfdSchema` + `atualizarDfdCampos`). `anoPca` é threadado da página (`listarPcas`) → `DfdsView` → forms.
  - **Estado de ATENÇÃO (DFD-R sem referência):** `EstadoDfd` ganhou **`atencao`** (âmbar `--warn`, precedência
    **erro > atenção > editado > regularizado > regular**) — `dfdRSemReferencia` (puro) o define para o DFD-R sem
    contrato/ata/licitação. Não bloqueia. O `PlanilhaDfds` **separa os DFDs em atenção numa tabela própria** (entre
    erro e regulares), em TODA lista (import, protocolo gravado, aba DFDs — por isso `DfdResumo`/`colunasDfd` e
    `ProtocoloVisualDfd` carregam as refs). No import, o usuário **escolhe incluir** os DFD-R em atenção no
    **relatório** (despacho): o `RelatorioErros` ganhou um `toggle` opcional (Checkbox) e o botão "Relatório" aparece
    também quando só há atenção (`FALTA_REFERENCIA_RENOVACAO` é a linha do despacho).

## Catálogo de produtos (referência p/ padronização) — migração `0024`
- **O que é:** base de REFERÊNCIA **isolada** (não toca PCA/DFD/itens) para, no futuro, comparar os itens dos DFDs contra
  um catálogo e **padronizar**. Agora entrega: subir catálogos de PDF, consultar/excluir/atualizar e marcar cada item com
  os **tipos de DFD** a que se aplica. Importa **PDF ou planilha .xlsx**, **exporta** (XLSX/PDF), **edita** (nome/tipos do
  catálogo e descrição/unidade/tipos de cada item) e alterna **duas visões** (Catálogo em cards / Lista de Itens numa
  tabela única, com transição suave). Aba de módulo **`catalogo`** (`/painel/catalogo` = `CatalogoView`); **admin vê tudo**,
  **editores** (admin/gestor) sobem/editam/excluem, demais com a aba **só consultam**. A migração `0024` concede a aba a
  quem já tem `dfd`.
- **Modelo (`catalogos` + `catalogo_itens`, sem FK p/ PCA/DFD):** `catalogos` (nome, `tipos_padrao` JSON, `total_itens`);
  `catalogo_itens` (`codigo` normalizado só-dígitos + **índice ÚNICO GLOBAL**, `codigo_raw` p/ exibição — **também só-dígitos** (= `codigo`, sem pontos; migração `0025`), `descricao`,
  `unidade`, `sequencial`, `tipos` JSON de DFD-S/R/O/E). Excluir o catálogo apaga os itens (cascade + delete explícito).
  Acesso em `src/lib/catalogo.ts` (`listarCatalogos`/`getCatalogoItens`/`criarCatalogo`/`atualizarCatalogo`/
  `upsertCatalogoItens`/`excluirCatalogo`/`codigosEmConflito`/`definirTiposItens`/`atualizarCatalogoItem`); schemas Zod em
  `catalogo-validation.ts` (puro/testável).
- **Parsers DEDICADOS (PDF e XLSX):** os catálogos variam MUITO (3–7 colunas, ordem diferente, Und
  antes/depois/2x da descrição, com/sem Nº de item, colunas Qtd/Valor vazias, título/logo acima da tabela) — por isso a
  detecção de colunas é **pelo CABEÇALHO, ordenada por posição** (data-driven), ao contrário do parser de DFD (colunas
  fixas). Reaproveita a camada pdf.js (`abrirPdf`/`extractPdfItems`/`PdfItem`) e `agruparLinhas`/`nearestByY`/`normalizar`
  (agora **exportados** de `parse-dfd-pdf-core`). Cada LINHA é ancorada no **CÓDIGO** (todo item tem um; nem todo tem Nº);
  descrição/unidade/Nº casam por `y` mais próximo, com **continuação entre páginas**; pula continuação de cabeçalho (ex.:
  "DE MEDIDA"), junta unidade quebrada em 2 linhas, extrai o **título** ("CATÁLOGO"/"CATÁLAGO") como nome e aponta
  **duplicados no arquivo**. O **XLSX** (`parse-catalogo-xlsx(-core)`) usa SheetJS e a MESMA detecção por cabeçalho sobre a
  matriz de células. As peças puras compartilhadas (rótulo de coluna, normalização do código, título, duplicados) ficam em
  **`parse-catalogo-comum.ts`** (espelha `parse-dfd-comum`). Fixtures reais em `tests/parse-catalogo-pdf.test.ts` +
  `tests/parse-catalogo-xlsx.test.ts`.
- **Import em LOTES (`importar-catalogo.ts` → `POST /api/catalogo`):** discriminada `start-catalogo`|`append-catalogo-itens`
  (espelha `importar-dfd`: retry de transitório, all-or-nothing; só apaga o catálogo no rollback quando foi CRIADO agora).
  **Código é ÚNICO GLOBAL:** todo lote confere `codigosEmConflito` — um código já presente em OUTRO catálogo → 422 (guarda;
  o gate **ignora** os conflitos que o usuário resolveu por "substituir", via `start-catalogo.excluirItens`). O preview
  pré-checa em `POST /api/catalogo/verificar` (que devolve o item EXISTENTE de cada conflito) e **RESOLVE** os conflitos em
  vez de travar (ver "Novo catálogo + CRUD + conflitos"); mostra também duplicados do arquivo.
- **Atualizar (re-subir) = MESCLAR preservando (`upsertCatalogoItens`, `INSERT … ON CONFLICT(codigo) DO UPDATE`):** item
  novo entra com o `tipos_padrao`; item que já existe tem só descrição/unidade/sequencial atualizados — os **`tipos`
  configurados são PRESERVADOS**; ausentes NÃO são apagados. Recalcula `total_itens`.
- **Exportar / editar (`exportar-catalogo.ts`, cliente):** baixa o catálogo em **`.xlsx`** (SheetJS) ou abre uma
  **impressão em PDF** (janela formatada → salvar como PDF), sem dependência nova. Um botão **"Exportar modelo"** (no
  cabeçalho) baixa um **modelo `.xlsx`** (`exportarModeloCatalogoXlsx` — cabeçalho Item/Código/Descrição/Unidade + linha de
  exemplo) para o usuário preencher e importar. **Editar** o catálogo (nome/tipos padrão) via `PATCH /api/catalogo/[id]`;
  **adicionar/editar/excluir um item à mão** (descrição/unidade/tipos — o CÓDIGO é imutável na edição; definido na criação e
  revalidado como único global) via `POST /api/catalogo/item`, `PATCH`/`DELETE /api/catalogo/item/[id]`
  (`criarCatalogoItem`/`atualizarCatalogoItem`/`excluirCatalogoItem`).
- **Tipos de DFD por item (`TIPOS_DFD` de `avaliacao-core`):** definíveis no **envio** (padrão do catálogo), em **massa**
  (seleção na tabela → barra no rodapé) e por **item** (`Modal.lateral` = `CatalogoItemDetalhe`, mestre-detalhe com
  `activeKey`) via `PATCH /api/catalogo/itens` `{ids,tipos,modo}` — `modo` **`definir`** (SET, padrão) ou **`mesclar`**
  (UNIÃO, p/ o item existente ganhar um tipo novo sem perder os que tinha). Seletor **`TipoDfdPicker`** (chips de alternância).
- **UI (`CatalogoView`):** um **`Segmented`** alterna **Catálogo** (cards por catálogo; abrir → `Modal` full com a tabela
  de itens — busca + filtro por tipo, seleção/edição em massa, exportar XLSX/PDF, editar, detalhe no `lateral`) e **Lista
  de Itens** (todos os itens numa tabela única, com coluna Catálogo; clique abre o detalhe num banner). A troca de visão
  anima por **`animate-cat-morph`** (fade+escala — "as linhas viram cards"). `Dropzone` aceita `.pdf,.xlsx`; novo
  `TextArea` no DS (descrição multi-linha). Rotas: `POST /api/catalogo` (+ `/verificar`, `/item`), `PATCH`/`DELETE /api/catalogo/[id]`,
  `PATCH /api/catalogo/itens`, `PATCH`/`DELETE /api/catalogo/item/[id]` — todas `exigirEditor`.
- **Novo catálogo por card "+" + CRUD manual de item + resolução de conflitos (sem migração):** no lugar do botão
  "Importar", um **card "+"** (tracejado, no formato do card de catálogo) fecha a grade; clicá-lo abre **"Novo catálogo"**
  (`Segmented` **Criar manualmente** [nome+tipos → catálogo VAZIO via modo `criar-catalogo` do `catalogoOpSchema`, que abre p/
  adicionar itens] | **Importar arquivo** [`Dropzone` → preview]). Dentro do catálogo aberto, **"+ Adicionar item"** e o
  `CatalogoItemDetalhe` (**reusado em 3 modos**: consultar/editar/**criar**) fazem o CRUD manual (excluir com `confirm`).
  **Conflitos (código já em OUTRO catálogo) NÃO travam mais** — o preview classifica cada um com **`itensIguais`**
  (`catalogo-conferencia`, puro; descrição+unidade normalizadas, reusa `norm`/`normUnidadeMedida`): **idêntico** ⇒ **não
  importa** o novo e, se o tiposPadrão acrescenta algo, **mescla os tipos no item EXISTENTE** (união — um item tem vários
  tipos O/S/R/E); **divergente** (descrição/unidade diferem) ⇒ o usuário **compara** (novo × existente) e escolhe **manter**
  (não importa) OU **substituir** (exclui o existente e importa este). Os "substituir" vão em `start-catalogo.excluirItens` e
  são removidos ATOMICAMENTE no MESMO `db.batch` do upsert (recalcula os totais do alvo E dos catálogos de origem); o gate de
  unicidade global os ignora. `podeImportar` não trava por conflito (só exige nome + algo a fazer).
- **Item COMPARTILHADO entre catálogos (o MESMO item em vários, sem duplicar — migração `0028`):** a relação item↔catálogos
  vira muitos-para-muitos de forma MÍNIMA — `catalogo_itens.catalogo_id` é a **ORIGEM** (home; código único e conferência
  DFD inalterados) e a coluna nova **`catalogos_extra`** (JSON `number[]`, migração aditiva) guarda os catálogos ADICIONAIS.
  **Pertencimento = `[catalogo_id, ...catalogos_extra]`** — a contagem por catálogo é feita no CLIENTE (o `CatalogoView` já
  carrega tudo e agrupa por `membrosDoItem`), sem `json_each`; `total_itens` fica como contagem por origem. **Núcleo puro**
  `catalogo-membros.ts` (`membrosDoItem`/`comCatalogo`/`resolverRemocao`, testável). Na **importação**, um conflito
  **IDÊNTICO** ganha a opção **Compartilhar** (`Segmented` Manter | Compartilhar; "compartilhar/manter todos"); um
  **DIVERGENTE** pode ser **editado dos dois lados** (novo × existente, `TextArea`/`TextField`, check ao vivo `itensIguais`)
  para igualar e **liberar Compartilhar** (senão Manter | Substituir). Os "compartilhar" vão em
  `start-catalogo.compartilharItens` → `compartilharItensNoCatalogo` (add ao `catalogos_extra` + **UNIÃO dos tipos** do
  destino), ou pela rota `POST /api/catalogo/compartilhar` quando não há itens novos. O `CatalogoItemDetalhe` mostra o bloco
  **"Catálogos deste item"** (chips com origem marcada) e permite **remover de um catálogo** (`DELETE /api/catalogo/item/[id]`
  com corpo `{catalogoId}` → `removerItemDoCatalogo`: reatribui a origem se preciso; se era o único, exclui). **Excluir um
  catálogo PRESERVA os itens compartilhados** (`excluirCatalogo` reatribui a origem dos compartilhados e só apaga os
  só-home). Auditoria registra compartilhar/remover. Testes: `catalogo-membros` + schemas.
- **Conformidade dos ITENS do DFD com o catálogo (o catálogo VALIDA os itens; configurável pelo ADM):** cada item do DFD é
  conferido contra o catálogo (a **referência**) casando pelo **código** (único global). Núcleo PURO/testável em
  **`src/lib/catalogo-conferencia.ts`** (sem `getDb`/JSX, como `reparticao-match`): `conferirItem(item, entry|null, dfdTipoCurto,
  candidatos)` → `ConferenciaItem { faltas, divergDescricao, divergUnidade, sugestao }`, com 3 faltas — **`naoCatalogado`**
  (código ausente → tenta **sugestão por semelhança**, `similaridade` = Jaccard de tokens, limiar `LIMIAR_SEMELHANCA`),
  **`divergenteCatalogo`** (código existe, mas descrição e/ou unidade diferem — comparadas com **`normComparacao`**
  (`parse-dfd-comum.ts`) que IGNORA **pontuação, espaços e tabs** dos dois lados (item do DFD e do catálogo); a unidade
  envolve a saída de `normUnidadeMedida`; `norm` global NÃO muda) e **`tipoIncompativel`** (o `item.tipos` do catálogo
  RESTRINGE e não inclui o tipo do DFD; `tipos` vazio = sem restrição). `rotulosDivergencia(c)` dá os rótulos ESPECÍFICOS
  ("Descrição diferente do catálogo"/"Unidade de medida diferente do catálogo"/"Tipo…"/"Fora do catálogo") — usados no
  painel do item e no tooltip da coluna.
  Reusa `normalizarCodigo`/`norm`/`normUnidadeMedida`/`tipoCurtoDfd`. **3 pontos CONFIGURÁVEIS** em `avaliacao-core`
  (`item.naoCatalogado`/`item.divergenteCatalogo`/`item.tipoIncompativel`, **`comportamentoPadrao: avisa`** = ATENÇÃO, não
  bloqueia; o ADM põe numa importância que `bloqueia` ou baixa a `ignora` — aparecem sozinhos na aba **Item** de `AvaliacaoAdmin`). **Config
  vazia ⇒ igual a hoje** (invariante por teste). **Escalável (consulta o catálogo VIVO por DFD):** `conferirItensNoCatalogo(itens,
  dfdTipo)` (`catalogo.ts`) busca só as entradas dos **códigos daquele DFD** (chunked `inArray`, guard "catálogo vazio ⇒ nada") e,
  p/ não catalogados, propõe semelhante via `LIKE` por token distintivo — NÃO baixa o catálogo. Rota **`POST /api/catalogo/conferir`**
  (`exigirUsuario`) devolve o veredito por código (Map serializado em entries); cliente único **`catalogo-conferir-cliente.ts`**
  (`conferirItensCliente`, silencioso em erro — conferência é auxiliar). **Threading via `ctx`** (mesmo padrão de
  `orgaoUnidadeDivergente`, avaliadores seguem PUROS): `avaliarDfd`/`mensagensDfd`/`faltasObrigatorias` recebem
  `ctx.conformidade` (pré-computada pelo chamador) — `veredictoLinhaCatalogo`/`bloqueantesCatalogo`/`algumCatalogoFundamental`
  resolvem pelos níveis do ADM. **Onde renderiza (ponto único = `DfdConferir`, cobre import avulso/protocolo/gravado):** o
  `DfdView` ganha a coluna **"Catálogo"** por item (Conforme/Fora do catálogo/Divergente/Tipo incompatível, cor pelo nível
  efetivo; **tooltip** com os rótulos específicos) e o `ItemDetalhe` um bloco **"Conformidade com o catálogo"**: os rótulos
  ESPECÍFICOS do que diverge + a **referência do catálogo SEMPRE que o código casa** (mesmo conforme/tipo-incompatível) com
  **todos os dados** do item do catálogo — código, unidade, **descrição (mesmo tamanho de fonte do item importado**, p/
  comparar lado a lado) e os **tipos de DFD** (chips `Badge`) — **display-only** (os itens do DFD são só-leitura; NÃO altera o
  DFD oficial). `sugestao` passou a ser construída sempre que há entrada casada (score 1); só é `null` sem código/sem semelhante. As mensagens de catálogo entram
  no painel `MensagensDfd` + `faltasCirurgicasDfd` (despacho). O import avulso (`DfdUploadForm`) e o DFD gravado (`DfdsView`)
  conferem TODO o DFD (useEffect por `itens`); o protocolo confere **por DFD ao abrir** (lazy — a LISTA fica leve/escalável).
  **Portão do servidor (defesa em profundidade, só bloqueia se o ADM elevou a `fundamental`):** `POST /api/dfd` (`start-dfd` **e**
  `append-dfd-itens`, por causa dos lotes) roda `algumCatalogoFundamental` → se sim, `conferirItensNoCatalogo` + `bloqueantesCatalogo`
  → 422. Os DFDs do protocolo passam por `/api/dfd` (o `POST /api/protocolo` só cria a capa) → cobertos. Testes:
  `catalogo-conferencia.test.ts` + os pontos de catálogo em `dfd-tratamento.test.ts` (veredito por linha, portão, invariante).

## PCA como ESPAÇO (card 4:5 → Dashboard · Orçamento · Mesa/Importação · Configuração) — migração `0032`
- **O que é:** o PCA virou um espaço próprio. `/painel/pca` (`PcaModuleView`) mostra os planos em **cards 4:5** (`PcaCard`/
  `PcaCapa`: capa escolhida OU capa padrão = degradê accent + o **ano gigante**; `Badge` Publicado/Preview + a FONTE; nome, Σ e
  contagens sobre o véu `--veu-capa`) + o card **"+" Novo PCA** (`PcaNovoCard`: nome, ano, fonte). Clicar entra em
  **`/painel/pca/[id]`** (`PcaEspacoView`: cabeçalho + `Segmented` de abas com `animate-cat-morph`; `?aba=`/`?camada=`).
- **Modelo (aditivo):** `pcas` ganhou **`fonte`** (`lista` = planilhas | `protocolo` = DFDs via protocolos), **`status`**
  (`preview`/`publicado`), **`capa`** (data-URL WebP 800×1000, `capaSchema` — só `data:image/(webp|jpeg|png)`), `publicado_em` e
  **`orcamento_visao_id`**. `unidades.pca_id` (FK cascade) — a planilha pertence a um PCA e a unicidade do código virou **por PCA**
  (`unidades_pca_codigo_uq`; `/api/upload` `start` exige `pcaId`, só PCA de lista). **O que se vincula ao PCA é o DFD**
  (`pca_dfds` + `acao` incorporar/substituir/excluir, `substitui_dfd_id`, `vinculado_por/em`); o protocolo é o veículo.
  `protocolo_situacoes` ganhou **`permite_mover_pca`** + **`camada_pca`** (preview/publicado). **Legado:** as planilhas atuais
  viraram um PCA "lista pronta" **publicado** (a tela inicial não muda) e as edições que já uniam DFDs viraram fonte `protocolo`.
- **Núcleo PURO `pca-core.ts`** (testado): `motivosNaoMover` (travas: fonte protocolo · situação que permite · `ano_pca` do
  protocolo = ano do PCA · ter DFD · um DFD em UM PCA), `acaoSugerida(assunto)` (EXCLUSÃO→excluir, ALTERAÇÃO→substituir, resto→
  incorporar), **`consolidarPca(linhas, camada)`** (cronológico; 1 DFD vigente por nº de planejamento; substituir/excluir sem par
  ⇒ aviso), `previsaoDoDfd` (seção PREVISÃO → mês/ano; ANUAL espalha nos 12 meses) e **`agregarDashboard`** (as MESMAS formas de
  `queries.ts`). **Camada:** Preview = todos os DFDs vinculados; Publicado (e o público) = só os de protocolos em situação de
  camada Publicado — mudar a situação move a camada AO VIVO. Acesso em **`pca-espaco.ts`** (`listarPcasCards`,
  `listarPcasPublicados`, `dashboardDoPca` [lista = SQL de `queries.ts` com `pcaId`; protocolo = itens consolidados em JS],
  `orcamentoDoPca`, `vincularDfds`/`desvincularDfds`/`definirAcaoDfds`, visões). Schemas em `pca-espaco-validation.ts`.
- **Abas:** **Dashboard** = `PainelPca` (os MESMOS KPIs/gráficos/`ItemTable` do público; `Callout` âmbar no Preview com quantos
  protocolos ainda estão em camada Preview). **Orçamento** = `OrcamentoPca`: KPIs Dotação <ano> (filtrada pela visão) · Planejado ·
  Saldo · Comprometido % e o **comparativo por unidade** (`orcamento-comparativo.ts` puro: faixas < 90% verde · 90–100% âmbar ·
  > 100% vermelho; lançamento sem vínculo → "Sem vínculo"; Todas/Acima/Dentro + Exportar .xlsx) — o CUBO do MESMO ano chega à
  unidade pelos **Vínculos** (`orcamento_vinculos`). **Mesa** (fonte protocolo) = `MesaPca` → a MESMA `DfdsView` com
  **`modoPca`** (sem importação; `Segmented` **Todos | Neste PCA**; coluna "PCA" Neste PCA/Elegível/Bloqueado com os motivos;
  ações da seleção **Mover para o PCA** [ação por protocolo] e **Retirar do PCA**) — dados pelo MESMO `carregarMesa`
  (`mesa-dados.ts`, também da `/painel/mesa`). **Importação** (fonte lista) = `PlanilhasPca` (`Dropzone` com `onFiles` — várias
  planilhas em fila — + cards "Planilhas deste PCA" com excluir). **Configuração** = `PcaConfiguracao` (identificação; fonte em
  cartões — travada com dados, 409 no servidor; `Switch` Publicar; travas com link p/ Configurações → Situações [`?aba=`]; visão
  do orçamento; capa com **`RecorteImagem`** — recorte 4:5 próprio, zoom + arrasto/toque, `recorte-imagem.ts` puro).
- **Situações (Configurações → Situações):** `Switch` "pode ser movido para o PCA" + `Segmented` da camada; coluna "PCA".
- **Visões salvas do orçamento** (`orcamento_visoes`, aba **Visões** da `OrcamentoView` → `OrcamentoVisoes`): nome + por
  dimensão (`DIMENSOES_ORCAMENTO`: Órgão, Unidade, Elemento, Código) os valores escolhidos (`SeletorMultiplo`: "Todos" | "N
  selecionados", busca, marcar/limpar; facetas CONECTADAS) — OU dentro, E entre dimensões (`orcamento-visao.ts` puro). Uma coluna
  nova do CUBO entra acrescentando a dimensão ao catálogo (e ao parser). Rotas `GET/POST /api/orcamento/visoes` + `PATCH/DELETE
  /api/orcamento/visoes/[id]` (auditoria `orcamento_visao`).
- **Tela inicial `/`:** `PcaSeletor` (dropdown) com os PCAs **publicados** (`?pca=`; padrão = ativo, senão o mais recente) +
  `UnitFilter` (planilha na lista; unidade requisitante no protocolo); só a camada Publicada.
- **Rotas:** `POST /api/pca` (com `fonte` = espaço; com `dfdIds` = edição legada), `PATCH /api/pca/[id]` (nome/ano/fonte/status/
  capa/visão), `POST`/`DELETE`/`PATCH /api/pca/[id]/dfds` (mover protocolos · retirar · trocar ação), `DELETE
  /api/pca/[id]/planilhas/[unidadeId]` — todas `exigirEditor` + auditoria `pca`.

## Orçamento municipal (relatório CUBO) — migração `0028`
- **O que é:** módulo para subir e consultar o **orçamento** da Prefeitura (dotação por Órgão/Unidade/**Elemento de
  despesa**), a partir do relatório oficial **CUBO.XLSX**. **SOMENTE LEITURA**: importar `.xlsx` (informando o **ano**),
  visualizar e excluir/reenviar — os lançamentos vêm do sistema oficial e NÃO são editados na tela. Aba de módulo
  **`orcamento`** (`/painel/orcamento` = `OrcamentoView`); **admin vê tudo**, **editores** (admin/gestor) importam/
  excluem, demais com a aba só consultam. A migração `0028` concede a aba a quem já vê o `catalogo`.
- **Modelo (`orcamentos` + `orcamento_itens`, ISOLADO — sem FK p/ PCA/DFD):** `orcamentos` (nome, **ano** integer
  obrigatório, `total_itens`, `valor_inicial` = Σ dotação p/ o card sem varrer itens); `orcamento_itens` (orgao/unidade/
  nome_elemento/codigo_elemento + **6 valores `real`** [emenda impositiva/inicial/suplementação/empenho/saldo/anulação] +
  sequencial; **SEM chave única** — muitas linhas compartilham o mesmo `codigo_elemento`; excluir o orçamento apaga os
  lançamentos, cascade). Acesso em `src/lib/orcamento.ts` (`listarOrcamentos`/`getOrcamentoItens`/`criarOrcamento`/
  `atualizarOrcamento`/`excluirOrcamento`/`inserirOrcamentoItens`); schemas Zod em `orcamento-validation.ts` (puro).
- **Parser DEDICADO (`.xlsx`):** `parse-orcamento-xlsx(-core/-comum).ts` — detecção de colunas **pelo CABEÇALHO, por
  posição** (Órgão/Unidade/Nome Elemento/Código + valores, em qualquer ordem; `rotuloColunaOrcamento`), com a leitura
  SheetJS no navegador (`raw:false`, fora do bundle do Worker). Pula o título e o **rodapé** ("Qtd. total N"), convertendo
  os valores com **`parseValorPlanilha`** (tolerante a en-US `"5,000,000.00"` E pt-BR `"5.000.000,00"`, inteiros com
  milhar e negativos). Validado contra o CUBO real: **1.345 lançamentos, 18 órgãos, 39 unidades** (bate com o "Qtd. total"
  do arquivo). Fixtures em `tests/parse-orcamento-xlsx.test.ts`.
- **Import em LOTES (`importar-orcamento.ts` → `POST /api/orcamento`):** discriminada `start-orcamento`|`append-orcamento-itens`
  (espelha `importar-catalogo`: retry de transitório, all-or-nothing — cada import cria um orçamento NOVO; falha apaga o
  parcial). Insert PURO em lotes de **8×12=96** params (< 100 do D1); recomputa `total_itens` + `valor_inicial`. `append`
  é IDEMPOTENTE (apaga `sequencial >= desde` antes de reinserir). Rotas `POST /api/orcamento` + `PATCH`/`DELETE
  /api/orcamento/[id]` (renomear/ano, excluir) — `exigirEditor`, envelope `http.ts`, **auditoria** (`registrarAuditoria`,
  entidade `orcamento`).
- **UI (`OrcamentoView`):** um **`Segmented`** alterna **Orçamentos** (cards retangulares por arquivo importado — nome +
  **ano** (`Badge`) + Σ dotação (`brl`) + nº lançamentos; abrir → `Modal` full com a planilha daquele orçamento) e
  **Lançamentos** (todos numa **tabela única filtrável** — filtro por Órgão/Unidade/Elemento/Código e **somatório no
  rodapé** reativo aos filtros). A troca anima por `animate-cat-morph`. Clicar numa linha abre o **`OrcamentoItemDetalhe`**
  (`Modal.lateral`, SÓ-leitura). Importa via `Dropzone` (`.xlsx`) → prévia com **Nome + Ano** (obrigatório) → grava.
  Exporta XLSX/PDF (`exportar-orcamento.ts`). Só componentes do DS; ícone `IconWallet`. Aba em `abas.ts` (`orcamento`) +
  nav em `AppShell`.
- **Vínculos Órgão/Unidade do CUBO → cadastro do sistema (migração `0030`):** o CUBO traz Órgão/Unidade como TEXTO
  próprio ("FUNDO MUNICIPAL DE EDUCACAO DE RIO V…", "2 - SECRETARIA MUNICIPAL DE EDUCAÇ…", "26 - FMACL"). Tabela
  **`orcamento_vinculos`** (`tipo` `orgao`|`unidade` + `chave` = texto normalizado, **único** por tipo+chave; `orgao_id`/
  `reparticao_id` FK **set null**) — **GLOBAL** (não por orçamento): o vínculo vale para todos os orçamentos, inclusive os
  próximos anos; alvo NULL = sem vínculo. Núcleo PURO **`orcamento-vinculo.ts`** (`chaveVinculo`, `nomeSemCodigo` tira o
  "N - " do CUBO, **`sugerirAlvo`** = nome/sigla iguais ⇒ certeza, senão Jaccard ≥ `LIMIAR_SUGESTAO` 0,6 — empate ⇒ nada,
  ignora ocultos; `linhasVinculo` agrupa os textos distintos com nº de lançamentos + Σ dotação + contexto do órgão;
  `mapaVinculos`/`alvoDoTexto`). Acesso em `orcamento.ts` (`listarVinculosOrcamento`, `alvosVinculoOrcamento` — órgãos +
  unidades sem a "Geral", `definirVinculosOrcamento` = UPSERT `ON CONFLICT(tipo,chave)` em lotes de 16 linhas (80 params),
  conferindo o alvo no tipo certo). Rota **`PUT /api/orcamento/vinculos`** (`exigirEditor`, `vinculosOrcamentoSchema` ≤ 200,
  auditoria). UI: 3ª visão **"Vínculos"** no `Segmented` da `OrcamentoView` → componente **`OrcamentoVinculos`** (DS,
  catalogado): tabela filtrável Estado (Vinculado/Sugestão/Sem vínculo) · Tipo · No orçamento · **No sistema** (`select`,
  unidades por `optgroup` de órgão, ocultos só se já vinculados; alvo ≥44px no mobile) · Lançamentos · Dotação, com
  **"Aceitar SIGLA"** por linha e **"Vincular N sugestões"** em massa; gravação otimista (pendentes valem só sobre a base de
  vínculos em que foram feitas). O vínculo aparece na coluna **"No sistema"** dos lançamentos e no bloco "No sistema" do
  `OrcamentoItemDetalhe` (prop `vinculo`). Ícone `IconLink`. `lotesDeIds` agora é exportado por `reparticoes.ts`.

## Rotas de API (`src/app/api/**`)
- Envelope padrão **`{ ok: true, ... }`** / **`{ ok: false, error }`**.
- Helpers em **`src/lib/http.ts`**: `ok(data?)`, `erro(msg, status)`, `parseCorpo(schema, req)`
  (valida Zod e devolve 422 pronto). **Rotas novas/editadas devem usá-los** + as guardas
  `exigir*` e `intId` de `api-auth`.
- Validação de entrada sempre com **Zod** (`src/lib/*-validation` / schemas em `protocolos`/`tabelas`).
- DFD/protocolo (além das já citadas): `GET /api/protocolo/[id]?completo=1` (protocolo + DFDs COMPLETOS + unidades com
  responsáveis — banner gravado), `GET /api/dfd/[id]` (DFD + `unidade`), `POST /api/dfd/conferencia` (`{ids ≤ 200}` →
  estado/resumo/validação por DFD, `exigirUsuario`), `POST /api/dfd/massa` (`{ids ≤ 500, acao}` → edição em massa,
  `exigirEditor`), `POST /api/protocolo/massa` (`massaProtocolosSchema`: `{ids ≤ 20, acao reparticao|assunto|valorCapa}`,
  `exigirEditor`, escopo por protocolo, `{alterados, falhas}`), `POST /api/dfd/itens/massa` (`massaItensSchema`: `{ids ≤ 100
  de ≤ 5 DFDs, acao catalogo|unidade|quantidade|valorUnitario|remover}`, lote atômico por DFD) e `POST /api/protocolo`
  `start-protocolo` com **`reenvio {protocoloId, resumo}`** (sobrescrita do MESMO protocolo — 422 se nº/Id não conferem).
  IN (...) sempre em lotes de ≤ 90 ids (`LOTE_IDS`/`lotesDeIds`) — limite de 100 parâmetros do D1.
- Gestão/histórico (migração `0031`): `POST /api/protocolo/conferencia` (`{ids ≤ 50}` → estado AGREGADO por protocolo,
  `exigirUsuario`), `PATCH /api/protocolo/[id]` também com `responsavelId`/`situacaoId` (+ `origem` banner|celula),
  `POST /api/protocolo/massa` com as ações `responsavel`/`situacao`, `GET /api/protocolo/[id]/historico` e
  `GET /api/dfd/[id]/historico` (histórico conectado, escopo por unidade), `GET`/`POST /api/admin/situacoes` +
  `PATCH`/`DELETE /api/admin/situacoes/[id]` + `PATCH /api/admin/situacoes/ordem` (`exigirAdmin`) e `PATCH
  /api/perfil/preferencias` (`{responsavelPadraoId}` — pessoa ATIVA ou `null`).

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
  `Tabs` (swipe), **`AvisoFlutuante`** (o aviso PADRÃO de feedback transitório — erro de importação, leitura em andamento,
  resultado, falha de ação: PEQUENO no canto inferior do display, sem deformar nada ao redor; portal numa região única
  `#avisos-flutuantes` — `.avisos-flutuantes` em `globals.css`, acima da navegação inferior do celular e da `BarraSelecao`
  fixa via `--reserva-rodape`; cor/ícone pelo token de feedback, `carregando` = spinner, `onClose` + `duracao` = fecha
  sozinho) + `Toast`/`Toaster` (renderiza o MESMO `AvisoFlutuante`), `DataTable` (seleção+filtro no cabeçalho+clique na
  linha; **"selecionar todos" marca TODAS as linhas FILTRADAS, não só a página** (estado indeterminado quando parcial);
  **`Column.travado`** = filtro da coluna TRAVADO por um filtro de hierarquia acima da tabela (cadeado + o motivo no
  `title`); `pageSize` **máx 20**;
  **filtros CONECTADOS (facetas)** — núcleo puro **`tabela-filtros.ts`** (`aplicarFiltros`: as opções/domínio de cada coluna
  vêm das linhas que passam nos DEMAIS filtros; seleção vazia ou com todas as opções = sem filtro; `normalizarFaixa`: o lado
  da faixa no extremo da faceta NÃO vira limite; `contarNaFaixa` = a contagem do painel; `ordenarIndices` numérico × texto
  natural pt-BR com UM `Intl.Collator` reutilizado (performático com milhares), vazios e o traço "—" no fim); **`Column.valores`** = coluna MULTI-VALOR (a linha casa se QUALQUER valor casa — ex.:
  Estado); **`filter:"range"` + `Column.numero`** = colunas R$ com o **`RangeFilterHeader`**; coluna filtrada fica
  **MARCADA** (gatilho `GatilhoFiltro` em chip accent + sublinhado; `aria-sort`) e o rodapé mostra **"Limpar filtros (N)"**;
  **`reservaInferior`** = altura reservada no fim do display p/ algo fixo abaixo (a `BarraSelecao` da Mesa);
  **`activeKey`** = linha ATIVA destacada, mestre-detalhe; `fillHeight` = linhas por página automáticas p/ preencher a altura do display no desktop, sem scroll do navegador;
  **`scrollInterno`** = a tabela preenche a altura até o rodapé e o CORPO rola por dentro (`thead` fixo `sticky`),
  sem scroll do navegador, com um **seletor de linhas por página (30/50/100/200)** no rodapé (`linhasPadrao` = default do
  ADM; limita as linhas em DOM — performático com milhares); só desktop, opt-in, exclui `fillHeight` — usado na **Mesa**;
  **alinhamento das células = CENTRO por padrão** (horizontal + vertical `align-middle`), `align:"right"` **só p/ valores monetários (R$)** e `align:"left"` em exceções — o `Column.align` é `"left"|"center"|"right"`;
  **`density`** (`compact`/`default`/`comfortable`) ajusta a altura da linha SÓ daquela tabela (via `--cell-py` LOCAL) — usada p/ diferenciar visões que dividem o mesmo espaço;
  **`Column.nowrap`** = sem quebra de linha, a coluna ganha a LARGURA DO CONTEÚDO (dados curtos: nº, sigla, badges,
  valores) — usado em todas as tabelas de protocolo/DFD/itens/PCA; textos longos seguem com `minWidth` + `line-clamp`),
  `Dropzone` (importação: soltar OU clicar p/ escolher), `ResponsaveisEditor` (N padrões + N temporários; cada um com
  matrícula/função + nomeação portaria/decreto/lei + link; período/estado), `Modal` (trava o scroll da página; `acoesCabecalho` = slot
  de botões à esquerda do X, ex.: cadeado; **`cabecalho`** = cabeçalho FIXO rico (ReactNode) que substitui o `titulo`
  textual — ex.: `DfdCabecalho`/`ProtocoloCabecalho` com nº + badges (tipo/Id) + planejamento/assunto; + painel `lateral`
  mestre-detalhe: 2º banner ao lado, com **fechar animado** simétrico ao abrir + **`lateral2`** = 3º banner à direita
  do `lateral` (ex.: mensagens ao lado do DFD no protocolo; grid de colunas proporcionais animadas, 1 por vez no mobile);
  **`paineis`** = PILHA GENÉRICA de banners à direita (`ModalPainel` = lateral + `id` + `largura`; `lateral`/`lateral2`
  viram entradas dela) + **`esquerda`** = painéis À ESQUERDA do principal (ORDEM FIXA das colunas — ex.: Protocolo | DFD |
  Item, qualquer que seja o banner de entrada) com **`larguraPrincipal`** — trilhas `minmax(0,Nfr)` animadas, **máx. 3
  visíveis no desktop / 1 no celular** (os ABERTOS POR ÚLTIMO — `ordemRef`), painel fechado fica montado até o
  `transitionend` (fechar animado), colunas ocultas `inert`, Esc fecha o último aberto e só o Modal do TOPO responde ao Esc
  (pilha `modaisAbertos`); `duracaoMotionMs()` = duração do motion p/ sequenciar entradas),
  **`GatilhoFiltro`** (o gatilho de TODO filtro de cabeçalho: rótulo + seta de ordenação, ou chip accent + funil quando
  filtrado), **`RangeFilterHeader`** (filtro de FAIXA p/ colunas R$: Crescente/Decrescente, **"Valor cheio"** [marcar limpa a
  barra; arrastar desmarca], **barra de arrasto DUPLA** mín.–máx. sobre os valores VISÍVEIS (`.faixa-dupla` em `globals.css`,
  alças de 24px p/ toque, teclado ←/→) + campos Mín./Máx.), **`BarraSelecao`** (+ `ResumoSelecao`; registro das seleções em
  chips removíveis + somatório R$ + editor + `acoes` na linha do resumo; `fixa` = rodapé do display, publica
  `--reserva-rodape`) + **`BarraSelecaoDfds`** (a da PLANILHA DE DFDs — chips "DFD nº" + Σ + itens + **`BotaoCopiar`**
  "Copiar planejamentos") com os editores **`BarraEdicaoMassa`** (DFDs) /
  **`BarraEdicaoMassaProtocolos`** / **`BarraEdicaoMassaItens`** (`BarraEdicaoMassa.tsx`), **`ComparacaoReenvio`**
  (`DiffLinha` antes × depois — `rotulos` Gravado/Novo ou Antes/Depois, `compacto` = valor curto numa linha e texto longo
  recolhido —, `DiffItem`, `BlocoDiff`, `ComparacaoDfdView`, `ComparacaoProtocolo` — o reenvio do protocolo; `DiffLinha`/
  `DiffItem`/`BlocoDiff` também servem o `Historico`), **`Historico`** (timeline por evento — escopos global/protocolo/dfd/
  item; `HistoricoDoItem` recolhível; hook `useHistorico`), **`SeletorCelula`** (dropdown DENTRO da célula — `<select>`
  nativo transparente, ponto de cor, spinner ao salvar, só texto sem permissão), **`SeletorFiltro`** (filtro de
  HIERARQUIA acima das tabelas — chip com ícone/rótulo/valor, accent quando ativo, largura total no celular),
  **`BotaoCopiar`** (copia um texto pronto; fallback `execCommand`; "Copiado!"),
  `Segmented` (com `disabled`), **`Switch`** (chave/toggle controlada — `role="switch"`, trilho `--accent`, alvo ≥44px;
  ex.: "Bloqueia importação/protocolação" e "Editável" na aba Avaliação), `formStyles`,
  `Field` (TextField/PasswordField/SearchField/**TextArea**/Checkbox/**`CampoLista`** [lista em chips — várias referências da
  renovação] — ícone + foco accent), `Callout` (feedback
  por token), `Pager`, `LinkCard`, `LinkExterno` (ÚNICA âncora externa do app — `target=_blank rel=noopener`;
  ex.: verificar assinatura digital), `StatCard`, `StatMini` (mini banner de cabeçalho — 1 por informação, no head do
  DFD/Protocolo: total de itens/valor total/total de DFDs/somatória; `tone` destaca divergência),
  `RelatorioErros` (banner/`Modal` com todos os erros de um DFD/Protocolo listados p/ **copiar** — `navigator.clipboard`
  + fallback de seleção; alimentado por `linhasRelatorioDfd`/`linhasRelatorioProtocolo`, puros),
  `PcaPicker` (define o **PCA do processo** — `select` dos PCAs cadastrados; adivinha o ano pela descrição e avisa;
  obrigatório), `MensagensDfd` (painel lateral com TODAS as conferências do DFD — erro/atenção/acerto agrupadas;
  clicar rola/destaca a âncora no banner do DFD; alimentado por `mensagensDfd` puro) + `BotaoVerMensagens` (botão +
  numeração no rodapé), `ItemDetalhe` (painel lateral com todas as infos de UM item da Seção 4 — abre ao clicar na
  linha; mesmo lugar do painel de mensagens), `TipoDfdPicker` (conjunto de tipos de DFD — chips de alternância; no
  catálogo: envio/massa/item), `CatalogoItemDetalhe` (painel lateral do item do catálogo — infos + tipos editáveis),
  **`PlanilhaDfds`** (planilha de DFDs; `unica` = tabela única do gravado; `LinhaDfd.processando` = spinner + o que está
  acontecendo), **`EstadoCelula`** (`EstadoResumo`/`EstadoPonto`/`EstadoProcessando` — a célula "Estado" de TODA tabela),
  **`BarraEdicaoMassa`** (edição em massa — análise/protocolo gravado/Mesa), **`DfdRodape`** (rodapé fixo do banner do
  DFD: estado + ações + mensagens + Fechar + principal), **`DfdPainelDireito`** (painel da direita do DFD: mensagens /
  item / histórico), **`ProtocoloView`** (CORPO ÚNICO do banner do protocolo — análise e gravado), `CampoCadeado`
  (+ **`CadeadoBotao`**, o cadeado reusado por campos, itens e SEÇÕES do DFD). Hook `useConformidade` (conformidade do
  DFD aberto com o catálogo, lazy). Contêineres com dados (fora do catálogo, como o `DfdsView`): `ProtocoloUploadForm`,
  `DfdUploadForm`, **`BannersMesa`** (pilha de banners gravados da Mesa, com os hooks `useProtocoloGravado`/`useDfdGravado`),
  `SituacoesAdmin` (Configurações → Situações).
  Ordenação de listas admin (Órgãos/Unidades) = `DataTable` +
  botões **↑/↓** (o antigo `ReorderTable` de arrasto foi removido). `Button` tem variante `danger`; tokens de
  feedback `--ok/--warn/--danger/--info` + `--scrim` em `globals.css`.
  `Badge.tsx` fornece o `Tone`/tons do `StatCard` **e** o badge de status/tag (ex.: **"Ativo"** do PCA).
- **Personalização do ADM (§39):** `/painel/aparencia` (`AparenciaAdmin`, admin) edita tokens com
  preview ao vivo e persiste em `configuracoes` (D1) via `/api/admin/aparencia`; `RootLayout`
  (async, `force-dynamic`) injeta o `<style>` sem flash (`src/lib/aparencia.ts` cacheado +
  `theme.ts` `aparenciaToCss` **anti-XSS por allowlist**). Migração `0008`.
- **Configurações do ADM (tela única):** `/painel/configuracoes` (`ConfiguracoesAdmin`, admin) reúne o **novo**
  + atalhos. Abas: **Identidade** (nome/subtítulo/favicon → mesmo slot `identidade` do `aparenciaSchema`, salvo via
  `PATCH /api/admin/aparencia`; favicon rasterizado p/ PNG ≤64px no cliente), **PCAs** (cadastrar/editar/ativar/excluir
  via `/api/admin/pcas`), **Avaliação** (`AvaliacaoAdmin` — níveis por ponto de Protocolo/DFD/Item + exceções por tipo
  de DFD e categoria de protocolo; ver "Avaliação configurável"), **Situações** (`SituacoesAdmin` — as situações do
  protocolo: nome + cor + ordem; ver "Gestão do protocolo") e **Mais** (`LinkCard` →
  aparência/repartições/grupos/permissões/usuários). A **identidade
  renderiza** de fato: `generateMetadata` (título/descrição/favicon), `Brand` do `AppShell` (logo+nome+subtítulo) e o
  cabeçalho público (`/`), todos com `getAparencia()` (cache 60s) e **fallback** aos textos padrão. Nav item
  "Configurações" (`IconSettings`) no topo de Administração. Sem migração nova (o slot `identidade` já existia).
- **Integrações externas (ADM):** tela `/painel/integracoes` (`IntegracoesAdmin`, admin; nav "Integrações" `IconPlug`
  + atalho em Configurações → Mais). Config no blob `configuracoes` id=1, chave `integracoes` (**sem migração**;
  loader `integracoes.ts` cache 60s; core puro `integracoes-core.ts`; schema `integracoes-validation.ts`; rota
  `/api/admin/integracoes` GET/PATCH/DELETE preservando as chaves irmãs). **Escopo: Cloudflare.** Tudo começa
  **desligado** (defaults off → login/cadastro idênticos a hoje). **Segredos write-only** (nunca voltam no GET): o
  segredo do **Turnstile** é **cifrado** (AES-GCM, `cripto.ts` puro/testável + wrapper `integracoes-segredos.ts`)
  com a chave mestra **Worker Secret `INTEGRACOES_CHAVE`** (definida 1x fora do repo; sem ela degrada — não quebra).
  **Captcha Turnstile:** componente DS `Turnstile` carrega o script **só quando ativo+configurado** (`turnstileConfigurado`);
  `AuthForm` recebe `{enabled,siteKey}` das páginas login/cadastro; o servidor confere em `verificarTurnstile`
  (`turnstile.ts`, **fail-open** em erro de infra — não trava login) nas rotas `/api/auth/login|cadastro` (token
  opcional no schema, exigido só quando ativo). **Monitoramento:** **reusa** os Worker Secrets já existentes
  `CF_ANALYTICS_TOKEN`/`CF_ACCOUNT_ID` (mesmos do Armazenamento) — `getMetricasWorker` em `cf-analytics.ts` +
  query/parse puros em `cloudflare-core.ts`; painel `recharts` (`MetricasChart`) com cache 60s. Google login e Resend
  = cards **"em breve"** (sem lógica). Setup no `docs/INTEGRACOES.md`. Só componentes do DS (catalogado).
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
