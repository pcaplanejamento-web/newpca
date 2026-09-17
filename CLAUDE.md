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
- **Auditoria / histórico de alterações (de ponta a ponta, migração `0026`):** tabela **`auditoria`** APPEND-ONLY —
  **quem** (`usuario_id` + snapshot `usuario_nome`/`usuario_email`, sobrevive à exclusão via FK `set null`), **o quê**
  (`acao` criar/editar/excluir/importar/protocolar/login/…; `entidade` + `entidade_id`; diff `antes`/`depois` JSON +
  `resumo` legível) e **quando** (`criado_em`). Núcleo puro/testável **`auditoria-core.ts`** (`diffCampos`, rótulos
  `ROTULO_ACAO`/`ROTULO_ENTIDADE`); acesso ao D1 em **`auditoria.ts`** (`registrarAuditoria` **BEST-EFFORT — nunca lança**;
  `historicoDe`/`listarAuditoria`). **Instrumentado em TODOS os pontos de escrita**, no nível da ROTA (onde o ator
  `exigirX().u` é conhecido): DFD (import/edição de campos/**itens**/exclusão/vínculo), protocolo, catálogo (+itens/tipos),
  PCA, planilha (`/api/upload`), protocolos legado, admin RBAC (grupos/permissões/órgãos/unidades + reordenar) e
  **usuários** (papel/status = alto valor), config (aparência/avaliação/integrações — só o FATO, **nunca** segredos/senha)
  e auth (login/logout/cadastro/perfil/senha). Nas edições, o "antes" vem dos `get*` já usados na rota (diff por campo).
  **Consulta:** componente **`Historico`** (timeline por ação/ator/data + diff expandível) usado por entidade (botão
  **"Histórico"** no banner do DFD → `GET /api/dfd/[id]/historico`, escopo por unidade) e na tela ADM global
  **`/painel/auditoria`** (`AuditoriaAdmin` + `GET /api/admin/auditoria`, filtros entidade/ação + paginação). Nav
  "Auditoria" (`IconClock`, admin). A tabela aparece no `/painel/armazenamento`.

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
  autorizados). Sentinela `getReparticaoFiltro()` (`codigo==='GERAL'` ⇒ `null` = sem filtro) inalterada.
- **Matchers (ponto ÚNICO puro `src/lib/reparticao-match.ts`) — IGNORAM entidades OCULTAS:** `casarUnidade` (Setor
  Requisitante → unidade: `setor_requisitante` → sigla → nome → órgão-texto; `casarReparticao` é alias),
  **`casarPorInteressado`** (Interessado do protocolo → **órgão OU unidade** pelo número cadastrado → nome; devolve
  `{tipo,id}`), **`preverUnidade`** (assinatura → setor) e **`preverUnidadeDoDfd`** (identifica o órgão, ESCOPA as
  unidades a ele e prevê — usado pelos forms), `casarOrgao` (Órgão/Entidade → órgão), `orgaoDivergeDaUnidade`/
  `divergenciaOrgaoUnidade`. Campos novos vazios ⇒ resultado **idêntico ao de hoje** (invariante testado). Threadados ao
  cliente (`painel/dfds/page.tsx` enriquece as unidades + `listarOrgaos()` → `DfdsView` → forms).
- **Nº interessado no ÓRGÃO + identificação/registro do DFD + ocultar (migração `0027`):**
  - **Nº interessado (ponto 1/2/3):** `orgaos.numero_interessado` (além do da unidade) — o protocolo pode vir em nome do
    **órgão OU da unidade** (`casarPorInteressado`); o número é **ÚNICO GLOBAL** entre órgãos e unidades
    (`numeroInteressadoEmUso`, checado nas rotas admin POST/PATCH → 409). O protocolo guarda `dfd_protocolos.orgao_id`
    quando vem em nome do órgão (`protocoloMetaSchema`/`iniciarProtocolo`).
  - **DFD identifica ÓRGÃO e escopa a UNIDADE (ponto 4/5):** o `DfdConferir` identifica o órgão pelo "Órgão/Entidade"
    (`casarOrgao`), **escopa o seletor de unidade** às unidades daquele órgão, e o usuário escolhe a unidade; o auto-match
    dos forms usa **`preverUnidadeDoDfd`** (assinatura→setor). Sem previsão, a **unidade fica obrigatória** (`dfd.reparticao`
    fundamental — erro até definir). O DFD **registra órgão + unidade** — o servidor deriva `dfds.orgao_id` da unidade em
    `upsertDfdCabecalho`. Ponto de avaliação CONFIGURÁVEL **`dfd.orgao`** ("Órgão identificado", padrão `intermediario`)
    avisa quando o Órgão/Entidade não casa nenhum órgão cadastrado (flag via `ctx`, avaliadores puros).
  - **Ocultar em vez de excluir (ponto 8):** `orgaos.oculto`/`reparticoes.oculto` — órgão/unidade **com DFD/protocolo
    vinculado NÃO pode ser excluído** (`DELETE` → 409 via `orgaoTemVinculo`/`unidadeTemVinculo`); o ADM **oculta**
    (`OrgaosAdmin`/`ReparticoesAdmin`: ação ocultar/reexibir + badge). Ocultos **somem do uso futuro** (matchers e
    seletores de documento novo filtram), mas o **histórico é preservado**.
- **Promover / rebaixar / órgão que TAMBÉM é unidade (migração `0029`):** a identidade transita entre as tabelas
  `reparticoes`⇄`orgaos` (create+delete de UMA linha; **nada de FK é reapontado** ⇒ valem as mesmas travas do ponto 8).
  Núcleo PURO/testável **`orgao-unidade-ops.ts`** (o MAPA dos campos que "seguem" na transformação + os predicados de
  permissão sobre os fatos apurados no servidor). Travas de contagem em `orgaos.ts` (`contarUnidadesDoOrgao`,
  `estruturaPorOrgao`). Ações no **modal de edição** (aba "Estrutura"), não como ícones de linha (mobile-friendly).
  - **Promover unidade→órgão (req. 1):** `POST /api/admin/reparticoes/[id]/promover` cria o órgão com a identidade da
    unidade e a **EXCLUI**. Barrado se a unidade tiver vínculo (seria excluída — ponto 8) ou for a unidade própria.
    (`ReparticoesAdmin` → Estrutura → "Promover a órgão"; ao concluir vai para `/painel/orgaos`.)
  - **Rebaixar órgão→unidade (req. 2):** `POST /api/admin/orgaos/[id]/rebaixar` `{orgaoDestino}` cria a unidade **sob o
    destino escolhido** e **EXCLUI** o órgão. Barrado se o órgão tiver unidades (filhas ou própria) ou vínculo direto.
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
  e total por item** + **total geral**, o **valor estimado** (nota "R$"), e o **texto das demais seções
  numeradas** (2,3,5,6,7,8,9…) num coletor genérico salvo em `dfds.secoes` (JSON). O detalhe (`/painel/pca/dfd/[id]`)
  mostra tudo ao clicar em "Ver".
- **Assinatura digital (captura + conferência, migração `0018`):** o PDF traz, DEPOIS de cada DFD, uma página
  "Assinaturas Digitais (Certificado Digital)" com 1+ linhas `Assinatura digital - Nome: … e-CPF: … Usuário: …
  Data: dd/mm/aaaa hh:mm:ss … e-Assinatura: <código> - <url>`. **`extrairAssinaturas`** (`parse-dfd-comum.ts`,
  puro) lê nome/e-CPF/usuário/data/**código verificador** (o `ehRuido` descarta essas linhas das seções). Há
  **TRÊS formatos** (campo `fonte`): **certificado** (acima) e **sistema** ("Assinaturas Eletrônicas (Sistema)":
  `Assinado digitalmente por NOME, portador do CPF: … utilizando o código: <código>`); e o **Formato C — `dropsigner`**
  (Dropsigner/Lacuna Software): bloco **INLINE na Seção 10 (AUTORIZAÇÃO DEMANDA)** do próprio DFD, em layout de
  **2 COLUNAS** (`Assinado digitalmente por:` → NOME → `CPF: <mascarado>` → `Data: … -03:00` na COLUNA DIREITA; a URL
  `dropsigner.com/validate/<código>` vem na marca d'água da margem, repetida por página). Como o `agruparLinhas` junta
  as 2 colunas de mesma `y`, o Dropsigner é extraído por **`assinaturasDropsigner(items)`** (`parse-dfd-pdf-core.ts`,
  CIENTE DA COLUNA `x` — só páginas com a marca d'água; dedupe por nome+data), somado a `extrairAssinaturas` em
  `parseDfdFromPdfItems` (cobre avulso E protocolo). Validado no Protocolo 4.pdf real (nome/CPF/data/código corretos).
  O código pode ter caractere
  não-ASCII e o rótulo `e-Assinatura:` pode quebrar em 2 linhas ("IP: e-" + "Assinatura: …") — as regex toleram. As
  assinaturas de um DFD podem vir em **VÁRIAS páginas** (formatos e páginas diferentes), sempre depois do DFD. No
  **protocolo** as páginas de assinatura são vistas só no ÍNDICE (o parse completo só lê `dfd.pages`) →
  `indexarProtocolo` mantém um ponteiro `ultimoDfd` e **acumula (APPEND)** todas as assinaturas que seguem o DFD até
  o próximo DFD; uma **CAPA/DESPACHO** é fronteira (assinatura de despacho não gruda no último DFD). No avulso PDF
  vêm de `parseDfdFromPdfItems`; `.xlsx` = `[]`. Guardadas em `dfds.assinaturas` (JSON `Assinatura[]`). **Conferência (`validarAssinatura`,
  `reparticao-responsaveis.ts`, puro/testável):** o assinante tem de bater (nome normalizado por `norm`) com um
  **responsável padrão** OU um **temporário** cujo período cobre a **data da assinatura** (reusa `Responsaveis` de
  `reparticao-responsaveis.ts`; o cadastro fica em `ReparticoesAdmin`/`ResponsaveisEditor`). Regras (fonte única
  cliente+servidor): **PDF sem assinatura → bloqueia** (protocolar trava com qualquer DFD sem assinatura); `.xlsx`
  sem assinatura → permitido (informativo); **repartição sem responsável cadastrado → bloqueia**; assinante não
  autorizado → bloqueia. **Dropsigner é RECONHECIDA como válida** (decisão do produto): o match por nome vale só p/
  A/B; se NÃO houver match A/B mas houver ≥1 `fonte:"dropsigner"`, o resultado é o status **`"dropsigner"`** — NÃO
  bloqueia e não exige responsável (o assinante é o secretário/ordenador, CPF mascarado). Docs A/B seguem IDÊNTICOS
  (só entra quando não casou A/B). O servidor reconfere no `POST /api/dfd` (`start-dfd`) e no `PATCH /api/dfd/[id]` (ao trocar
  a repartição), carregando os responsáveis por `carregarResponsaveis` (`src/lib/reparticoes.ts`). O `DfdView`
  exibe uma seção "Assinaturas Digitais" (assinante, CPF, usuário, data, código) — o card da **Dropsigner** vem em
  **TONS DE AZUL** (`--info`) + `Badge` "Dropsigner" e o "Verificar autenticidade" aponta para o **link Dropsigner**
  (`a.url = dropsigner.com/validate/<código>`), não a URL fixa — + o **solicitante** — o
  responsável que **pediu a consolidação** no PCA (não quem autoriza), `Solicitante`, com período e ato
  (Portaria/Decreto/Lei) se temporário — com **dois botões `LinkExterno`**: "Verificar autenticidade" (site
  oficial) e "Ver <ato>" (link do ato de nomeação cadastrado).
- **Importa `.xlsx` E `.pdf`:** o cabeçalho + seções são **compartilhados** em `src/lib/parse-dfd-comum.ts`
  (`extrairCabecalho`/`coletarSecoes`, agnósticos de formato). `.xlsx` → `parse-dfd`/`parse-dfd-core` (SheetJS,
  tabela por coluna da matriz). `.pdf` → `parse-dfd-pdf`/`parse-dfd-pdf-core` (**pdf.js `pdfjs-dist`**, importado
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
  senão o nome do órgão grudaria na descrição de um item; (b) só uma seção `N - …` **à margem esquerda** encerra a
  tabela (um "2-52" no meio de uma descrição NÃO é seção); (c) uma descrição **acima de todos os itens da página** é
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
  **bloqueia o botão** "Importar"; o `POST /api/dfd` rejeita (422) por garantia. **A regra agora é CONFIGURÁVEL pelo
  ADM** (ver "Avaliação configurável"): `faltasObrigatorias(d, regras?, ctx?)` delega para `avaliarDfd`
  (`dfd-tratamento`), que resolve o **nível** de cada ponto; com `regras` no padrão do catálogo devolve exatamente a
  lista de hoje (**invariante coberto por teste**). O **ano do PCA** e a **assinatura** seguem como portões à parte,
  também com nível próprio.
- **Avaliação CONFIGURÁVEL pelo ADM (`avaliacao-core.ts` puro + `avaliacao.ts` loader):** cada dado de
  **Protocolo/DFD/Item** tem um **nível** — `fundamental` (bloqueia), `intermediario` (só avisa/ATENÇÃO âmbar),
  `automatico` (corrige sozinho onde há corretor), `ignorar`. O **catálogo** `CATALOGO_AVALIACAO` (fonte única: UI +
  defaults + validação) traz `niveisPermitidos`/`nivelPadrao` (os defaults reproduzem o comportamento atual — config
  vazia ⇒ igual a hoje) + as flags `suportaEdicao`/`suportaAuto`. `nivelDe(regras, chave, ctx)` resolve com **exceções
  por tipo de DFD** (`DFD-S/R/O/E`, **fixos**) e por **categoria de Protocolo** (`INCLUSÃO/EXCLUSÃO/ALTERAÇÃO NÃO
  ONEROSA`, **fixas** em `CATEGORIAS`; `classificarAssunto(assunto)` casa a palavra da capa). Além do nível, o ADM
  controla, **por campo**: **`editaveis`** (`editavelDe` — se o usuário pode editar o campo na análise; travado ⇒
  `disabled` no `DfdConferir`) e **`sinonimos`** (`aplicarSinonimos` — palavras-chave que, no nível `automatico`,
  trocam o texto TODO da seção pelo valor canônico, dentro de `normalizarSecoesDfd`). Armazenado na linha
  `configuracoes` id=1 (chave `avaliacao`, **sem migração**), lido por `getRegrasAvaliacao()` (cache 60s, fail-safe) e
  gravado em `/api/admin/avaliacao` (`exigirAdmin`, preserva as chaves irmãs da aparência). UI = aba **"Avaliação"** de
  `/painel/configuracoes` (`AvaliacaoAdmin`: sub-abas Protocolo/DFD/Item, seletor de contexto p/ as exceções de nível,
  Checkbox de editável e editor de palavras-chave; `<select>` usa `selectCls`). As `regras` são threadadas
  server→cliente igual a `pcas` (`painel/dfds/page.tsx` → `DfdsView` → `DfdUploadForm`/`ProtocoloUploadForm`/
  `DfdConferir`/`ProtocoloView`/`DfdView`); o servidor reconfere em `/api/dfd`, `/api/protocolo`, `/api/dfd/[id]`
  (global + por-tipo; a categoria é aplicada no cliente e no `POST /api/protocolo`). **Não configurável**
  (estrutural/técnico, permanece travado): integridade de parse, tetos do Zod, acesso/anti-sequestro por repartição,
  **identificadores da capa/DFD imutáveis** (protocolo número/Id/data/ano do PCA; DFD número/planejamento/tipo). **Gates
  só-cliente** (como hoje): conciliação do valor da capa e "sem DFD com erro".
- **Tratamento + normalização das seções (`src/lib/normalize.ts` + `src/lib/dfd-tratamento.ts`, puros/testáveis):**
  ao conferir, `normalizarSecoesDfd` **padroniza automaticamente** PRIORIDADE (só `ALTA`/`MÉDIA`/`BAIXA` —
  `normPrioridade`) e PREVISÃO DE ENTREGA (é **um OU outro**: uma DATA `MÊS/AAAA` **ou** recorrente `ANUAL`
  — `ANUAL` vale **sem ano**, com ano vira `ANUAL/AAAA`; reconhece `MENSAL(MENTE)`/`ANUAL(MENTE)`/`AO LONGO DO ANO`…
  — `normPrevisao`); o que não dá
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
  4xx não) e, se um lote falhar de vez, **apaga o DFD parcial** (`DELETE`) — não fica DFD pela metade. `appendDfdItens`
  é **idempotente** (apaga `sequencial > desde` antes de gravar → retry não duplica). O banner de importação fica
  **`bloqueado`** (Modal sem X/Esc/backdrop, sem Cancelar) + `beforeunload` enquanto grava — não dá pra interromper.
- **Segurança (escopo por repartição em TODA escrita):** `POST /api/dfd` (`start-dfd`/`append`), `PATCH`/`DELETE
  /api/dfd/[id]`, `PATCH`/`DELETE /api/protocolo/[id]` e os `GET/[id]` checam `reparticaoId == null || lista.some(...)`
  com a `lista` de `getReparticaoContexto` (**admin = todas**) — 403 fora do escopo. `start-dfd` tem **anti-sequestro**
  por `numero` (não sobrescreve DFD de repartição inacessível). O `PATCH /api/dfd/[id]` (`editarDfdSchema`) vincula a
  protocolo E/OU edita **repartição/seções/itens/refs + o CONTEÚDO do cabeçalho** (objeto/órgão/setor/responsável/
  matrícula/e-mail/telefone — identificadores número/planejamento/tipo imutáveis; não move p/ repartição inacessível);
  o `PATCH /api/protocolo/[id]`
  (`editarProtocoloSchema`) edita a **repartição + os campos de CONTEÚDO da capa** (interessado/assunto/observação/
  CPF-CNPJ/valor/local) — os **IDENTIFICADORES** (número/Id/data/ano do PCA) são IMUTÁVEIS (o schema **não** os aceita).
  Teto de `totalItens` (100k) e `rows` (1000/lote) no Zod;
  Drizzle parametriza (sem SQL injection).
- Rotas: `POST /api/dfd` (lotes), `GET`/`DELETE`/`PATCH /api/dfd/[id]`, `POST /api/pca`, `DELETE /api/pca/[id]`
  (envelope+guardas). UI em `/painel/pca` = `PcaModuleView` (3 abas); detalhes em `/painel/pca/dfd|edicao/[id]`.
- **Protocolo → DFDs (migração `0016`) — importação em STREAMING:** um **protocolo** (o "processo") empacota
  **vários DFDs** (escala a **milhares**); todo DFD vem de um protocolo. Entidade `dfd_protocolos` (escopo por
  **repartição**, `numero`=Número Processo único; **`idExterno`** = "Id:" da capa, migração `0019`; sem `grupo_id`) +
  `dfds.protocoloId` nullable (FK `set null`). **Dedup/sobrescrita por Id:** não coexistem dois protocolos com o
  MESMO `idExterno` — protocolar **sobrescreve** o de mesmo Id (`iniciarProtocolo` apaga o de mesmo Id e número
  diferente antes do upsert por `numero`; o `POST /api/protocolo` faz o **anti-sequestro por Id** — 403 se o Id já
  existe em unidade inacessível). O **DFD** já dedupa/sobrescreve por `numero` (`upsertDfdCabecalho` onConflict em
  `dfds.numero`; `planejamento` é DADO, atualizado no overwrite).
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
  sobreviverem** ao envio; `protocolar` usa a cópia do cache e só re-parseia o que faltou. `ProtocoloView` read-only,
  catalogado). **Capa: identificadores IMUTÁVEIS, conteúdo editável (cadeado por campo) + conferência do valor:** os
  **IDENTIFICADORES** da capa (número/Id/data/ano do PCA) **não são editáveis em nenhum tempo**; os campos de
  **CONTEÚDO** (interessado/assunto/observação/CPF-CNPJ/valor/local) têm **cadeado POR CAMPO** (a mesma lógica dos itens,
  primitivos em `CampoCadeado`) — destraváveis tanto no **preview do PDF** (`modo="cadeado"` do `CapaCampos`) quanto no
  **gravado destravado**; a criação manual usa inputs simples (`modo="criar"`). A **repartição** (roteamento) segue
  editável (seletor obrigatório no import, cadeado no gravado). O **Valor da capa** é editável e **conciliado** uma vez
  na importação (o botão "Substituir pela somatória" continua). O
  preview mostra TODOS os dados da capa igual ao gravado (Id, CPF/CNPJ, **Valor da capa**, Local) + **mini banners**
  (`StatMini`) de total de DFDs + **somatória dos valores dos DFDs** (valor do DFD = soma dos itens, `valorTotal`).
  **NÃO protocola** com o Valor da capa **zerado/nulo** OU **diferente** da somatória (`valoresBatem`, tolerância 1
  centavo) — divergência **trava** e o usuário **substitui** a capa pela somatória (um clique) para liberar.
  `ProtocoloView` só **aponta** a divergência (não substitui sozinho; o usuário destrava o Valor e ajusta). **Separa as vias** (`classificarPdf`, em `parse-protocolo-pdf-core.ts`): protocolo (capa OU ≥2
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
  DFD · Nº Plan. · Sigla · Tipo (`tipoCurtoDfd`) · [Protocolo] · Itens · Valor total · [ações]** (as opcionais só
  aparecem quando há dado), **todas filtráveis/ordenáveis**; os **DFDs com erro numa tabela SEPARADA** acima da de
  regulares; **rodapé = só os agregados** (nº · itens · somatória). A repartição é a coluna **Sigla** (atribuição pela
  edição em massa ou abrindo o DFD ao lado). **Capa em `CapaCampos`** (exportado de `ProtocoloView`) — a MESMA grade de
  campos da capa na importação e no gravado; **identificadores** (número/Id/data) sempre só-leitura, **conteúdo** com
  cadeado por campo (`modo` `leitura`/`criar`/`cadeado`).
  O **head** mostra **Id + Assunto** ao lado do nº. Quando há erro, um botão **"Relatório de erro"** no rodapé abre o
  `RelatorioErros`. A **barra de edição em massa** fica FIXA no rodapé do banner (controle do valor em cima; seletor do
  campo + Aplicar + Limpar embaixo). **Banner do protocolo gravado = mesmos blocos do de importação** (CapaCampos +
  StatMini + conciliação + PlanilhaDfds), + o **cadeado**.
- **Item/DFD com ESTADO + relatório de erro (DfdView/DfdConferir):** a **tabela de itens** (Seção 4) tem uma coluna
  **Estado** por item (`estadoItem`: `Com erro` quando falta valor unitário/quantidade — `faltasDoItem`), **filtro em
  todas as colunas** e os **itens com pendência numa tabela SEPARADA** (acima da de regulares). O nº/tipo/planejamento
  do DFD (e nº/Id/Assunto do protocolo) ficam no **cabeçalho FIXO do banner** (`Modal.cabecalho` = `DfdCabecalho`/
  `ProtocoloCabecalho`) — NÃO se repetem no corpo. **Rodapé de TODA tabela = só os agregados das linhas** (`resumo`):
  nº de itens/DFDs + somatória dos valores (nunca texto de ajuda). **Mensagens/relatórios CIRÚRGICOS:** `faltasCirurgicasDfd`
  aponta EXATAMENTE o erro (quais itens, qual seção) e O QUE fazer; o relatório do protocolo sai em **formato de
  DESPACHO de devolução** (`linhasRelatorioProtocolo`) pronto p/ devolver o processo. Quando há erro, o botão
  **"Relatório de erro"** (rodapé, alinhado à direita) abre o `RelatorioErros`. Helpers puros em `dfd-tratamento.ts`
  (`itemComErro`/`estadoItem`/`faltasCirurgicasDfd`/`linhasRelatorioDfd`/`linhasRelatorioProtocolo`/`SECOES_OBRIGATORIAS`
  [fonte única, reusada por `faltasObrigatorias`] + `estadoProtocolo`/`situacaoProtocolo`).
- **Painel LATERAL de MENSAGENS do DFD (`MensagensDfd`) — todas as conferências, navegáveis:** as mensagens NÃO
  aparecem mais soltas no corpo do banner do DFD. `mensagensDfd` (puro, `dfd-tratamento`) monta a lista COMPLETA
  (erro/atenção/**acerto**, sem exceção — só omite pontos "ignorar" do ADM), cada uma com uma **âncora** (id do
  componente: `reparticao`/`anoPca`/`justificativa`/`previsao`/`prioridade`/`fundamentacao`/`referenciaRenovacao`/
  `itens`/`valor`/`assinatura`, marcadas com `data-ancora` no `DfdConferir`/`DfdView`). `mensagensDoDfd` (exportado de
  `DfdConferir`) já confere a assinatura e é a **fonte única** (contador do botão + painel). O botão **`BotaoVerMensagens`**
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
  DFD** (Σ) via `editarItemDfd`. No **gravado** (`DfdsView`), o `ItemDetalhe` avisa quando **algum campo está aberto**
  (`onEditandoChange`) e mostra **"Salvar alterações"** no rodapé → `PATCH /api/dfd/[id]` `{itens}` → `reescreverDfdItens`
  (apaga+reinsere + recomputa total); ao salvar, o painel remonta (nonce) e re-trava. Só **editor**; escopo por unidade e
  `valorUnitario>0` no servidor.
- **Editar DFD/protocolo JÁ GRAVADO (mesmo banner da importação, com cadeado):** clicar num DFD/protocolo da lista
  abre o **MESMO componente** da importação (`DfdConferir` p/ DFD; `ProtocoloView` editável p/ protocolo), começando
  **TRAVADO** (read-only). Um **cadeado** (`Modal.acoesCabecalho`) ao lado do X destrava (com **confirmação**) → os
  campos ficam editáveis (incl. o **cabeçalho do DFD com cadeado por campo** — bloco "Cabeçalho — conteúdo" no
  `DfdConferir`, primitivos `CampoCadeado`, `onCamposChange`) e um **"Salvar alterações"** grava **direto no D1**
  (`PATCH /api/dfd/[id]` edita repartição/seções/itens/refs + conteúdo do cabeçalho via `atualizarDfdCampos`;
  `PATCH /api/protocolo/[id]` edita **repartição + conteúdo da capa** via
  `atualizarProtocolo` — os identificadores de DFD/capa seguem imutáveis) e o
  `router.refresh()` reflete em todas as telas. Só **editor** (admin/gestor) vê o cadeado; escopo por repartição em
  toda escrita. `DfdConferir` e `Segmented` ganham `readOnly`/`disabled` para o estado travado.
- **DFD ao lado do protocolo gravado (mesma animação da importação):** o banner do protocolo gravado é
  **mestre-detalhe** igual ao da importação — clicar num DFD abre `DfdConferir` como **LATERAL à direita** (mesmo
  componente, animação e comportamento; a única diferença é o **cadeado**). O `Modal.lateral` ganhou
  `acoesCabecalho` (cadeado próprio do lateral); em `DfdsView` o estado de edição do DFD é **reusado** — o modal
  avulso do DFD só aparece **fora** de um protocolo (`open={!!dfdView && !protoView}`), senão vira o lateral do
  protocolo; `fecharProto` fecha também o DFD do lateral.
- **Ano do PCA + referências de renovação (migração `0021`) — `ano_pca` no protocolo e no DFD; `numero_contrato`/
  `numero_ata`/`numero_licitacao` no DFD (tudo nullable):** ao ler o PDF, `anoPcaDoTexto` (`parse-dfd-comum.ts`, puro)
  **adivinha o ano do PCA** da descrição ("PCA 2027", "PLANO DE CONTRATAÇÕES ANUAL … 2027"). O usuário **confirma ou
  escolhe** o PCA no **`PcaPicker`** (componente do DS, `select` dos PCAs **cadastrados em Configurações** — guarda o
  **ano** integer, não o id; pré-selecionado só se o ano adivinhado existir cadastrado). **Obrigatório:** não se
  protocola nem se importa DFD avulso sem PCA definido (portão à parte de `faltasObrigatorias` — no cliente
  desabilita o botão, e o servidor rejeita 422: `POST /api/protocolo` e `POST /api/dfd` `start-dfd`). **Todos os DFDs
  do protocolo herdam o ano do PCA do protocolo** no envio (`ProtocoloUploadForm.protocolar` põe `anoPca` em cada
  `enviarDfdEmLotes`). Nos **DFD-R** (renovação), `referenciasRenovacao`/`extrairRefsDfd` separam nº de **contrato**,
  **ata** (registro de preços) e **licitação** da descrição para campos próprios; o `DfdConferir` mostra um bloco
  **Referências da renovação** (editável) e, se o DFD-R não tiver **nenhuma**, um **aviso não-bloqueante** (aponta,
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
  (`item.naoCatalogado`/`item.divergenteCatalogo`/`item.tipoIncompativel`, **`nivelPadrao: intermediario`** = ATENÇÃO, não
  bloqueia; o ADM eleva a `fundamental` ou baixa a `ignorar` — aparecem sozinhos na aba **Item** de `AvaliacaoAdmin`). **Config
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
  **`activeKey`** = linha ATIVA destacada, mestre-detalhe; `fillHeight` = linhas por página automáticas p/ preencher a altura do display no desktop, sem scroll do navegador),
  `Dropzone` (importação: soltar OU clicar p/ escolher), `ResponsaveisEditor` (N padrões + N temporários; cada um com
  matrícula/função + nomeação portaria/decreto/lei + link; período/estado), `Modal` (trava o scroll da página; `acoesCabecalho` = slot
  de botões à esquerda do X, ex.: cadeado; **`cabecalho`** = cabeçalho FIXO rico (ReactNode) que substitui o `titulo`
  textual — ex.: `DfdCabecalho`/`ProtocoloCabecalho` com nº + badges (tipo/Id) + planejamento/assunto; + painel `lateral`
  mestre-detalhe: 2º banner ao lado, com **fechar animado** simétrico ao abrir + **`lateral2`** = 3º banner à direita
  do `lateral` (ex.: mensagens ao lado do DFD no protocolo; grid de colunas proporcionais animadas, 1 por vez no mobile)),
  `Segmented` (com `disabled`), `formStyles`,
  `Field` (TextField/PasswordField/SearchField/**TextArea**/Checkbox — ícone + foco accent), `Callout` (feedback
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
  catálogo: envio/massa/item), `CatalogoItemDetalhe` (painel lateral do item do catálogo — infos + tipos editáveis).
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
  de DFD e categoria de protocolo; ver "Avaliação configurável") e **Mais** (`LinkCard` →
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
