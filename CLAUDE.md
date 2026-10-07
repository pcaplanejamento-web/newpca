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
- **Portão de qualidade** (em `deploy.yml` e no `ci.yml` de PRs): `typecheck`, `lint` e `test`
  **bloqueiam** (baseline de tipos 100% limpo — um erro de tipos novo não chega ao ar). O `cf-typegen`
  roda antes (o typecheck depende do `cloudflare-env.d.ts`); o build segue com `ignoreBuildErrors`
  porque o type-check já foi feito no portão.
- **Deploy em FILA** (`concurrency.cancel-in-progress: false`): um push novo ESPERA o deploy em andamento — nunca o
  interrompe entre as migrações e a publicação do Worker.
- **Dependências:** `npm audit` sem alerta crítico/alto (os 4 moderados restantes são do `drizzle-kit`, só de
  desenvolvimento, sem correção sem quebra). No sandbox o `xlsx` vem do CDN da SheetJS, que a política de rede bloqueia:
  atualize só o lock (`npm install <pacote>@<versão> --package-lock-only` + `npm audit fix --package-lock-only`) — o CI
  instala tudo. O `next` fica com a versão EXATA.

## Banco de dados (D1 + Drizzle)
- **`getDb()` (`src/lib/db.ts`) só em escopo de request** (Server Components
  `force-dynamic`, Route Handlers, Server Actions) — usa `getCloudflareContext()`.
- **Migrações = SQL curado** em `drizzle/` (é o `out` do drizzle **e** o `migrations_dir`
  do `wrangler.jsonc`). Ao gerar com `db:generate`, confira o SQL.
  - **Número ÚNICO por migração** (`tests/migrations.test.ts` barra a repetição — sessões em paralelo): antes do push,
    `git fetch` + merge da `main` e use o próximo número livre. As repetições antigas `0028`/`0064` ficam (o D1 registra
    pelo NOME inteiro — renomear aplicaria de novo).
  - **≤ 100 parâmetros vinculados por statement** (limite do D1). Ver `src/app/api/upload`
    (lotes de 7×14=98).
  - **Evite `UNION ALL` longo** em migração (o D1 rejeita "compound SELECT"); use
    `INSERT ... VALUES`.
  - **Nunca `db.run/all/get/values(sql`…${param}`)` DENTRO de `db.batch`:** no driver D1 do Drizzle o comando CRU com
    parâmetros quebra no lote ("Cannot read properties of undefined (reading 'bind')" → 500). Em lote, só BUILDERS
    (`insert`/`update`/`delete`/`select`, inclusive `insert().select()` + `onConflictDoUpdate` — ver `rastro-sql.ts`).
    O teste roda os builders pelo driver `drizzle-orm/d1` REAL sobre `node:sqlite` (`tests/fixtures/d1-sqlite.ts`).
- **DADOS PRONTOS — carregar uma vez, recarregar só com dado novo (padrão do sistema inteiro):**
  - **Versão dos dados** (`versao-dados.ts` → `versaoDados()`): `MAX(auditoria.id)` (toda escrita passa por
    `registrarAuditoria`) + `MAX(dfd_itens.id)` + `MAX(orcamento_itens.id)` (lotes gravados depois do registro), memorizada
    por requisição; rota `GET /api/dados/versao` (`no-store`).
  - **Navegador:** `next.config` `experimental.staleTimes {dynamic:300}` — telas/abas já vistas voltam do cache na hora;
    toda gravação já dá `router.refresh()` (limpa o cache) e o **`SincronizarDados`** (no `AppShell`, sem UI; a versão vem do
    layout do painel) consulta a versão ao voltar à janela e a cada navegação (≥ 10 s) e só dá `router.refresh()` quando
    ela MUDOU (gravação de outra pessoa).
  - **Servidor:** **`memoPorVersao(chave, carregar)`** — o resultado de uma CARGA PESADA fica na memória do Worker enquanto
    a versão for a mesma (validade de segurança 5 min, até 60 entradas, a promessa compartilhada; falha não fica; núcleo
    puro testado `memo-versao-core.ts`). A chave leva os ARGUMENTOS, nunca o usuário (o que depende da sessão segue lido a
    cada requisição) e o valor é COMPARTILHADO (quem usa só lê). Hoje: `listarDfds`, `listarItensDfds`, `listarProtocolos`,
    `listarProtocolosDoPca`, `listarPcasCards`, `dashboardDoPca` e `orcamentoDoPca`. **Loader pesado novo = `memoPorVersao`**;
    escrita nova = `registrarAuditoria` (senão a versão não muda e só a validade recarrega).
- **LIMITES DO WORKER (plano gratuito: ~10 ms de CPU e 50 consultas ao D1 por requisição)** — passar deles CORTA a
  resposta no meio ("Connection closed." no navegador, sem "ref:") ou derruba a requisição. A Mesa de um PCA grande
  (milhares de linhas) chegou ao limite quando a "Geral" passou a valer todas as unidades. Regras da tela pesada:
  - **Listas grandes = UM texto JSON** (`mesa-listas.ts`: `listasParaTexto(listas, carga)`/`listasDoTexto`): protocolos e
    DFDs da Mesa vão ao cliente como `listas` (o React não serializa milhares de linhas valor a valor — no servidor, de
    novo para o HTML e no navegador); `carga` = a hora da carga (cada carga = listas novas no cliente, como antes). Lidas
    por `useListasMesa` (`MesaSistema.tsx` — o invólucro da `DfdsView` na Mesa do sistema; a `MesaPca` lê igual).
    `montarMesa` (interno) guarda as listas em objeto; `carregarMesa`/`carregarMesaDoPca` montam o texto por ÚLTIMO.
  - **Projeção enxuta da lista** (`DfdNaLista`, `listarDfds`): sem objeto/setor/responsável do formulário (o banner busca o
    DFD completo) e com os **grupos de assinatura calculados no banco** (`gruposAssinaturaSql`, `dfd-sql.ts` →
    `gruposDoTexto`) — sem trazer o JSON das assinaturas; equivalência com `gruposAssinatura(parseAssinaturas())` testada
    no driver D1 real (`tests/assinatura-grupos-sql.test.ts`).
  - **Ids em UM parâmetro JSON** em vez de lotes de 90 (`IN (SELECT value FROM json_each(?))`): `consultaDfdsEmOutroPca`
    (`pca-dfds-sql.ts`) e `consultaEntradasCatalogo`. O acesso da página (`getAcesso`, memorizado) dá o grupo ativo aos
    banners da Mesa (`contextoBanners` não relê os grupos); `listarReparticoes` é memorizada por requisição (`cache`).
  - Medido num PCA sintético (500 protocolos, 2.500 DFDs, Gestor com a "Geral"): consultas 48 → 25, serialização ~55 → ~6
    ms (memória quente), 2,3 → 1,7 MB, leitura no cliente 33 → 21 ms. O plano PAGO do Workers (30 s de CPU, 1.000
    consultas) resolve a causa de vez.
- Schema em `src/db/schema.ts`. Teste da cadeia de migrações: `tests/migrations.test.ts`
  (aplica `drizzle/*.sql` em `node:sqlite`).
- **Armazenamento (ADM):** tela `/painel/armazenamento` (`ArmazenamentoAdmin`, só admin; atalho em Configurações →
  Mais) — com o **monitoramento do Worker** (`MonitoramentoWorker`, quando ligado em Integrações — ver Integrações) — raio-x do banco **em runtime** via `src/lib/armazenamento.ts`: tamanho total pelo **binding cru**
  (`getCloudflareContext().env.DB` → `.meta.size_after` — o Drizzle não expõe `.meta`), enumeração por
  `sqlite_master` (inclui as tabelas **legadas órfãs** — as de `0005`, `tarefa_anexos` (`0045`) e `protocolos`/`protocolo_opcoes` do antigo módulo
  Protocolos, sinalizadas "legado" — e as de sistema) e, por tabela, `COUNT(*)` +
  `SUM(LENGTH(CAST(col AS BLOB)))` (**sem migração**; `dbstat` não é confiável no D1). Rota `GET/POST
  /api/admin/armazenamento` (`exigirAdmin`): GET = snapshot; POST `{acao:"expurgar_sessoes"}` = higiene (apaga
  sessões vencidas por `expira_em < agora`). `formatBytes` em `format.ts`; ícone `IconDatabase`.
  - **SAÚDE DOS DADOS** (seção da mesma tela — `SaudeDados`, DS; `GET /api/admin/saude-dados`, `exigirAdmin`; carregada à
    parte, "Verificar" = `?fresco=1`): as 5 consultas SÓ DE LEITURA de **`saude-dados-sql.ts`** (binding cru, sem
    parâmetros; listas até 200, contagens exatas — as da verificação em produção de 05/10) + a classificação PURA
    **`saude-dados-core.ts`** (`avaliarSaude`) — **Integridade** (deve ser zero, vermelho: DFD × itens, protocolo × DFDs ×
    itens [o centavo das abas], numeração/vínculos do PCA, rastro em dobro + Id repetido) e **Dados a tratar** (âmbar:
    gravação incompleta, capa × somatória pela MESMA régua da Mesa — `somatorioProcesso` + `conciliacaoCapa` com as regras
    do ADM —, itens sem valor unitário, DFD sem planejamento); cada linha leva o link da Mesa em que o protocolo está
    (`linkProtocolo`) ou o do DFD avulso. `saudeDosDados` (`saude-dados.ts`) em `memoPorVersao`. Testes:
    `tests/saude-dados.test.ts` (cenário a cenário no D1 sobre `node:sqlite`).
- **Auditoria / histórico de alterações (de ponta a ponta, migrações `0026` + `0031`):** tabela **`auditoria`** APPEND-ONLY —
  **quem** (`usuario_id` + snapshot `usuario_nome`/`usuario_email`, sobrevive à exclusão via FK `set null`), **o quê**
  (`acao` criar/editar/excluir/importar/protocolar/login/…; `entidade` + `entidade_id`; diff `antes`/`depois` JSON +
  `resumo` legível) e **quando** (`criado_em`). Núcleo puro/testável **`auditoria-core.ts`** (`diffCampos`, rótulos
  `ROTULO_ACAO`/`ROTULO_ENTIDADE`/`ROTULO_ORIGEM`); acesso ao D1 em **`auditoria.ts`** (`registrarAuditoria` **BEST-EFFORT — nunca
  lança**; `historicoDfd`/`historicoProtocolo`/`listarAuditoria`). **Instrumentado em TODOS os pontos de escrita**, no nível da ROTA (onde o ator
  `exigirX().u` é conhecido): DFD (import/edição de campos/**itens**/exclusão/vínculo), protocolo, catálogo (+itens/tipos),
  padronização (unidades de medida/classificações + sinônimos + ordem), PCA, planilha (`/api/upload`), admin RBAC (grupos/permissões/órgãos/unidades + reordenar) e
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
  - **UI — componente único `Historico`** com escopos: **`protocolo`** (botão "Histórico" (ícone) no CABEÇALHO do protocolo gravado →
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
- **Guardas** em `src/lib/api-auth.ts` — TODA rota confere o PAPEL na TELA: **`exigirAcesso(telas, acao)`** (a ação numa
  das telas, no grupo ATIVO do cabeçalho — várias telas = basta uma); **`exigirSessao()`** + a recusa pela tela do RECURSO —
  **`recusa(acesso, tela, acao, grupoId?)`** (Mesa: protocolo num PCA → `pca`, senão `dfd` — `telaDoRecurso`/`podeNoRecurso`),
  **`recusaNoQuadro(acesso, quadro, acao, pelaAgenda?)`** (Tarefas: o papel no GRUPO DO QUADRO; `pelaAgenda` = a tela
  Calendário também vale para ver/mexer/excluir a tarefa e os eventos), `motivoRecusa`/`motivoNoQuadro` (o texto — a massa
  o põe na falha de cada alvo) —; `exigirUsuario` (o que é da própria pessoa) e `exigirAdmin` (a Administração). Uso:
  `const g = await exigirX(); if ("erro" in g) return g.erro;`. O MAPA **`rotas-acesso.ts`** (rota → método → tela + ação,
  puro) é conferido pelo teste estático **`tests/rotas-acesso.test.ts`**: todo método de `src/app/api/**` está no mapa e
  chama a guarda descrita (a do auxiliar do arquivo vale; a ação calculada por regra pura — `acaoDe` — também). **Rota nova
  = entrada no mapa.** O `role` antigo não decide mais nada: o Administrador vem do PAPEL (`u.admin` — `exigirAdmin`, as
  páginas da Administração) e o teste estático PROÍBE `exigirEditor(`, o `role` da sessão e comparações com gestor/membro.
- **SEGURANÇA DO ACESSO (migração `0071`, aditiva — tabelas `limites_acesso` + `desafios_acesso` e os gatilhos de matrícula
  única):**
  - **Sem login, nada:** o layout do `/painel` redireciona ao `/login`; TODA rota de API exige a sessão (as guardas acima) —
    as únicas públicas são as de acesso (`/api/auth/*`), o feed `.ics` por token, o webhook do Trello (token + HMAC), os
    crons (`cronAutorizado`) e a consulta pública do PCA publicado.
  - **CAPTCHA SEMPRE** no login, no cadastro (no pedido do código; o 1º acesso sem código, no próprio cadastro), no "Esqueci a
    senha" e na troca de senha: o **Turnstile** quando o ADM o configurou, senão a **verificação anti-robô própria**
    (`VerificacaoRobo` — "Não sou um robô": prova de trabalho, núcleo puro **`desafio-core.ts`** com o SHA-256 próprio,
    `BITS_DESAFIO`=17 ≈ 1 s; o desafio vem de `POST /api/auth/desafio`, vale UMA vez por 10 min — `comandoConsumirDesafio`
    = DELETE … RETURNING). `useCaptcha` devolve sempre um widget; renovar (o token vale uma vez) já volta verificando.
    Conferência única: **`verificarCaptcha`** (`seguranca-acesso.ts`).
  - **LIMITE DE TENTATIVAS** (`limite-acesso-core.ts` — `LIMITES_ACESSO`; contagem num upsert atômico por janela,
    `limite-acesso-sql.ts`, testado no driver D1 real): login 30/15 min por IP e **8 senhas erradas/15 min por CONTA**
    (zera ao entrar), código 10/h por IP e 6/h por e-mail, cadastro 10/h por IP, senha 20/15 min por IP, desafio 60/10 min
    por IP → **429** `{esperarS}` + `Retry-After`. Higiene no cron dos e-mails (`limparSegurancaVencida`).
  - **Só dados permitidos** (a MESMA régua na tela — filtro ao digitar — e no Zod — `cadastro-core.ts`): nome só letras/
    espaço/apóstrofo/hífen (nome e sobrenome), **matrícula = EXATAMENTE 6 dígitos** (`DIGITOS_MATRICULA`; não só zeros — a antiga fora do padrão segue valendo até o ADM trocar), **telefone** só dígitos (DDD + 8 fixo / 9 celular começando com 9 — `telefoneValido`), usuário do e-mail `[a-z0-9._-]` sem "..",
    senha nova 8–128 com **letras e números**, nenhum caractere de controle/invisível (cargo, apelido), nome de cargo com
    letras/números e `( ) / , . - º ª`.
  - **Sem duplicidade:** e-mail (índice único) e **MATRÍCULA** — conferida antes de enviar o código e antes de gastar o
    código (`matriculaEmUso`, sem os zeros à esquerda: "0123" = "123") e garantida no BANCO por gatilhos (`matricula_duplicada`
    no INSERT e no UPDATE da matrícula; as repetidas antigas ficam) → 409. O ADM também não troca para uma matrícula em uso;
    a tela do ADM manda só o que MUDOU (dado antigo fora do padrão segue valendo).
  - **Cabeçalhos** (`next.config` `headers`): `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'; base-uri 'self';
    object-src 'none'; form-action 'self'`, `nosniff`, HSTS (1 ano), `Referrer-Policy`, `Permissions-Policy`. **CSRF:** além do
    cookie `SameSite=Lax`, o `parseCorpo` recusa (403) a requisição com `Origin` de OUTRO site (`origemPermitida`, `origem.ts`).
- **REGRA FIRME:** o **admin sempre vê TODAS as abas/telas** — nunca bloqueável por
  nível de acesso (bypass na navegação e nas guardas). Preserve isso em qualquer RBAC futuro.
- **PAPÉIS (migrações `0069`/`0072`, aditivas):** o GRUPO (permissão) decide QUAIS telas; o
  **PAPEL** decide o que a pessoa FAZ em cada uma — **Visualizar · Manipular · Importar · Exportar · Excluir · Configurar**.
  Tabela `papeis` (nome, descrição, `chave` admin|gestor|membro nos do SISTEMA, `capacidades` JSON {tela: ações[]},
  `padrao_cadastro`) + `usuarios.papel_id` (set null); **`usuarios.role` segue gravado só como ESPELHO** (a sessão não o lê
  mais; o aviso de cadastro aos ADMs acha o Administrador pelo papel). Núcleo
  PURO **`papeis-core.ts`** (`CATALOGO_PAPEIS` = o que cada ação cobre por tela — Manipular no Orçamento e Configurar no
  Calendário "não se aplicam"; `coerceCapacidades` com as implicações — qualquer ação ⇒ Visualizar; **`podeNaTela`** = o
  grupo libera **E** o papel visualiza, o Administrador tudo; `PAPEIS_SISTEMA` — Gestor = tudo, Membro = consulta + exporta
  e trabalha em Tarefas/Calendário, iguais às guardas de hoje) + **`escopo-unidades-core.ts`** (acesso em 3 estados:
  todas · unidades · nenhuma). Comandos com a TRAVA NO PRÓPRIO SQL em **`papeis-sql.ts`** (testados no driver D1 real):
  cadastro atômico (o 1º vira Administrador SÓ com a tabela vazia — `INSERT … SELECT … WHERE NOT EXISTS`; os demais, o
  papel PADRÃO, pendentes), troca de papel/status e exclusão NUNCA tiram o último Administrador ATIVO (409), desativar
  encerra as sessões no mesmo lote. **Acesso EFETIVO** (`acesso.ts`): `getAcesso()` (UMA consulta grupos ⨝ permissões + o
  grupo ativo, memorizada por requisição) → `telas` (as que ABREM: o grupo libera **e** o papel visualiza — o menu, a porta
  de entrada e o Perfil usam elas) e **`podeTela(acesso, tela, grupoId?)`** (as 6 ações; `grupoId` = o grupo do RECURSO).
  **Páginas:** toda página de módulo chama **`acessoPagina(tela)`** (`acesso-pagina.tsx`: sem sessão → `/login`; tela
  fechada → o card **`AcessoRestrito`** com o caminho de volta) e passa às telas as capacidades (`pode: PodeTela`; a Mesa,
  `PodeMesa` {sistema, pca}) — o que o papel não permite SOME da tela (importar, seleção/massa, excluir, exportar) ou vira
  SÓ-LEITURA (o detalhe da tarefa — `TarefaDetalhe.somenteLeitura` —, o quadro — `QuadroKanban.somenteLeitura` —, o
  comentário). **Escopo de unidades** em 3 estados (`escopo-unidades-core.ts`): todas (ADM ou grupo com a "Geral" — também
  no detalhe e na escrita) · as do grupo · **nenhuma** (sem grupo não vê dado). **Regras por módulo:** a Mesa segue a tela
  do RECURSO (LER = uma das duas Mesas + o escopo; ESCREVER = a ação na Mesa em que o protocolo está); Tarefas seguem o
  GRUPO DO QUADRO (o link de um aviso de outro grupo vale), a tarefa e os eventos também pelo Calendário, e as PASTAS por
  grupo (`atorPasta`: a pública = Configurar no grupo; a privada = o dono com Manipular); o Calendário pelo grupo ativo (o
  feed .ics exige Exportar e só traz os grupos que abrem o Calendário; o evento PRIVADO só para quem participa — também para
  o ADM); os VÍNCULOS de tarefa exigem ver a tela do alvo (`vinculoAcessivel`); as **EDIÇÕES SALVAS de tabela** seguem a
  tela da tabela da chave (`telasDaChave`: `mesa:` → Mesa · `mesa-pca:` → PCA · `orcamento-comparativo:` → Orçamento ou
  PCA · `tarefas:<quadro>:` → o grupo do quadro; outra chave = 422) — salvar a sua = Visualizar, **publicar ou moderar a
  pública de outra pessoa = Configurar** (`acaoParaGravar`, puro; o dono sempre despublica/exclui a sua; auditoria
  `edicao_tabela`); a tela: `SalvarEdicao.podePublicar`/`SeletorEdicoes.podeModerar` (`EdicoesDaTabela.podePublicar`).
  **Configurações → Papéis** (`PapeisAdmin`, contêiner; rotas `GET/POST /api/admin/papeis` e `PATCH/DELETE
  /api/admin/papeis/[id]`, `exigirAdmin`, Zod `papeis-validation.ts` — capacidades normalizadas por `coerceCapacidades`,
  tela/ação fora do catálogo = 422; D1 `papeis.ts` + os comandos com trava em `papeis-sql.ts`): lista (nome + selos
  Fixo/Sistema/Padrão dos cadastros, `ResumoPapel`, quantas pessoas), criar/editar/duplicar/excluir (só o criado pelo ADM, que
  ninguém tem e que não é o padrão — 409 com o motivo), o editor com **`MatrizCapacidades`** (DS — Telas × Ações, marcar
  linha/coluna com a caixa PARCIAL, "—" onde não se aplica, células alteradas destacadas; no celular, um cartão por tela com
  chaves), "Começar de" (`MODELOS_PAPEL`) e o `Switch` "Padrão para novos cadastros" (há sempre um — marcar um desmarca o
  outro NO MESMO comando); nome único sem caixa (409, também pelo índice); o Administrador é só consulta (403); retirar
  capacidades de um papel EM USO confirma (vale na hora); auditoria `papel` com o diff por tela (`textoDiffCapacidades`).
  **Usuários** (`UsuariosAdmin`): o papel vem do banco (`opcoesPapel`; `PATCH /api/admin/usuarios/[id]` `{papelId}` →
  `comandoTrocarPapel` com a trava do último ADM; confirmação — dar/tirar o Administrador em destaque), a coluna **Grupos**
  (`CelulaLista`; "Sem grupo" em âmbar) e os grupos editados num LOTE só (`{grupos}` → `comandosGruposDoUsuario`,
  `rbac-sql.ts`, INSERTs ≤ 40, ids conferidos antes — 422), **Aprovar** num modal com o papel (o padrão vem escolhido) e os
  grupos (**`GruposDaPessoa`**, DS; avisa sem grupo; auditoria `aprovar` + o e-mail de acesso liberado), **Recusar** o
  cadastro pendente (exclui; o histórico diz "recusado") e **"Ver acesso"** (**`AcessoDaPessoa`**, DS — por grupo, a
  `MatrizCapacidades` só-leitura das telas que ABREM, `capacidadesEfetivas`, e as fechadas pelo papel —
  `telasFechadasPeloPapel`). **Permissões** explica grupo × papel e lista as telas na ordem do menu. **Exportar:**
  TODA tabela tem **XLSX** e **PDF** no rodapé (ver `DataTable.exportar`); nas telas de módulo só para quem tem a ação
  Exportar ali — a página envolve o conteúdo em **`PermissaoExportar`** (`ExportarTabelas.tsx`; a Mesa, pela Mesa em que
  está), o contexto vale também nos banners por portal. **Desfazer de importação** (a gravação que falhou no meio sai só com Importar): o
  orçamento e o catálogo que a PRÓPRIA pessoa CRIOU por importação na última hora (`?origem=desfazer` →
  `criadoPorImportacaoRecente`: o 1º registro do histórico é o "importar" dela — o reenvio/atualização de um cadastro que já
  existia nunca; builder `auditoria-sql.ts`, testado no driver D1 real) e o DFD pela metade (`gravacaoParcial`); fora disso,
  Excluir. Sair de uma Mesa: reimportar um DFD que está em OUTRA Mesa (ex.: num protocolo enviado a um PCA) exige Importar
  também nela (e a análise já o marca "Não sobrescrevível").
- **DETALHES DO PAPEL — o controle FINO dentro das telas (migração `0074`, aditiva — `papeis.detalhes` JSON COMPACTO, só o
  que difere do padrão; `'{}'` = sem restrições = o comportamento de antes; + índices `criado_por` em `dfd_protocolos` e
  `dfds`):** os detalhes só RETIRAM (o efetivo = a ação do papel **e** o detalhe; o Administrador os ignora — regra firme) e
  valem em qualquer grupo. Núcleo PURO **`papeis-detalhes-core.ts`** (vocabulário, `CATALOGO_COLUNAS_MESA` — as colunas das 4
  tabelas em 3 classes fixa/coluna/dado —, `coerceDetalhes` com as IMPLICAÇÕES: sem ver o Responsável não altera; sem
  Responsável e sem Distribuição não há desempenho; Situação oculta não se altera; Valores ocultos não alteram itens/capa; sem
  personalizar não publica nem modera —, `compactarDetalhes`, `diffDetalhes`/`textoDiffDetalhes`/`restringeAlgo`,
  `resumoDetalhes`, `MODELOS_DETALHES`) + **`mesa-visao-core.ts`** (`VisaoMesa` = os detalhes resolvidos, levada ao cliente
  em **`PodeMesa.vis`** — as telas perguntam a ela, nunca deduzem da ausência de um campo; `motivoResponsavel`,
  `pessoasDesignaveis`, `padraoAoProtocolar`, `motivoResponsavelPadrao`, `metricasPermitidas`, `podeSubAcao`). A sessão lê o
  papel com os detalhes (`PapelSessao.detalhes`, `visaoDoAcesso`). **ENTREGA 1 (no ar) — Pessoas e linhas, na Mesa do sistema
  e na de cada PCA:** ver o **Responsável** (coluna, filtro do topo, célula, massa, Dashboard, histórico da troca), alterá-lo
  em 3 níveis (**não altera · só assume para si** = assumir o SEM responsável ou soltar o seu — tomar o de outra pessoa exige
  **qualquer pessoa do grupo**), ver a **Distribuição**, as **LINHAS** ("**só os meus**" = sou o Responsável OU protocolei;
  o DFD avulso, quem criou) e o **desempenho por pessoa** (sem ele, `/api/mesa/execucao` devolve só as correções, sem
  pessoas, e o Dashboard some com os Dados de pessoa, a medida Ações e a tabela). **O que o papel não vê NÃO SAI DO
  SERVIDOR:** a REDAÇÃO (`mesa-redacao.ts`, puro, testado — roda por requisição DEPOIS dos `memoPorVersao`, copy-on-write,
  nunca muda o cache compartilhado; campo oculto = chave AUSENTE) nas listas (`carregarMesa`), nos banners (`GET
  /api/protocolo/[id]`, `GET /api/dfd/[id]`), nos itens e na execução; tipos **`ProtocoloNaMesa`/`DfdNaMesa`** (o TypeScript
  obriga cada tela a tratar o campo ausente). **Escopo da Mesa por requisição:** **`escopoMesa()`** (`acesso-mesa.ts`, `cache`
  do React) = as unidades + a visão + as LINHAS (`meus` = os ids pelos builders **`linhas-sql.ts`** — subconsulta, sem lista
  de IN; testados no driver D1 real); `protocoloLegivel`/`dfdsLegiveisNaMesa`/`protocoloNasLinhas`/`dfdNasLinhas` em TODA
  rota da Mesa (listas, detalhes, DELETE, históricos, conferências, itens, execução, massa, `pca/[id]/protocolos|itens`,
  vincular, anti-sequestro do `POST /api/protocolo` e do `start-dfd`, `existentes` → `acessivel:false`) e na busca/conferência
  dos VÍNCULOS de tarefa (`buscarVinculos`/`vinculoAcessivel`); fora das linhas responde como a unidade sem acesso (403, não
  revela). O mapa **`rotas-acesso.ts`** marca essas rotas com **`naMesa(`** (`visao`) e o teste estático confere que chamam
  `escopoMesa(` e que nenhuma rota da Mesa usa o escopo de unidades por fora dele. **Responsável** no servidor:
  `motivoResponsavel` no `PATCH /api/protocolo/[id]` (403), na massa (falha por alvo), no padrão ao protocolar e no `PATCH
  /api/perfil/preferencias`. **Histórico** (`historico-redacao.ts`, `redigirHistorico(linhas, regra)`): some a troca de um
  campo que o papel não vê (pela CHAVE; a linha que ficou vazia sai) — `regraHistoricoMesa`; a **consulta PÚBLICA do PCA**
  (`historicoPublico`) usa a `REGRA_PUBLICA` (sem autor, sem dados pessoais E sem Responsável/Situação — antes os nomes
  vazavam no diff). `mascararTexto` mora em `dados-pessoais-core.ts`. **Telas:** a Mesa (`DfdsView`: colunas Responsável/
  Distribuição, filtro do topo, célula — `podeTrocarResponsavel` —, massa, aviso "sai da sua Mesa" com "só os meus"; abre em
  "todos" sem ver o Responsável), o Dashboard (`DashboardMesa.permitido` + `BarraMetricas` `dados`/`medidas`/`periodo`), o
  **Perfil** (cards Mesa e Protocolação pelo nível; "Seu acesso" com as restrições) e **Configurações → Papéis** — o editor
  em duas partes (`Segmented` **Telas e ações | Detalhes (N)**): **`DetalhesPapelEditor`** (DS — seção "Pessoas e linhas",
  "Começar de" `MODELOS_DETALHES`, linhas alteradas marcadas; sem `onChange` = só leitura), a coluna **Detalhes**
  (**`ResumoDetalhesPapel`** compacto — "N restrições") e a confirmação ao RETIRAR acesso de um papel em uso (capacidades OU
  detalhes); "Ver acesso" e o banner do usuário mostram as restrições. Zod **`detalhesPapelSchema`** aceita SÓ os detalhes já
  aplicados (os demais são descartados — nunca gravados "de enfeite"); auditoria `papel` com `textoDiffDetalhes`. **Próximas
  entregas** (no mesmo modelo): E2 — colunas das Mesas por papel (`DataTable.ocultas`, edições sem as colunas ocultas),
  histórico em 3 níveis (não vê · sem autores · completo) e edições salvas (personalizar · publicar · moderar); E3 — o
  Manipular da Mesa dividido (sub-ações), dados pessoais mascarados e valores ocultos.
- **CADASTRO INSTITUCIONAL + SENHA CONFIRMADA POR CÓDIGO (migração `0067`, aditiva — `usuarios.reparticao_id` FK set null
  = a UNIDADE em que trabalha, `usuarios.email_verificado_em`, tabela `codigos_email`: só o HASH, UM por e-mail + finalidade):**
  - **TELA ÚNICA DE ACESSO (`/login` = `TelaAcesso`):** Entrar · Criar conta · Esqueci a senha no MESMO lugar (`?modo=`
    `entrar`|`cadastro`|`senha` — `lerModoAcesso`, puro em **`modo-acesso.ts`**; trocar de modo só faz `replaceState`, sem
    recarregar; `/cadastro` e `/recuperar-senha` redirecionam para o modo). Esquerda = o formulário: o `Segmented` Entrar | Criar
    conta FIXO no alto da coluna — no desktop na MESMA LINHA da logo da vitrine (`lg:pt-12 xl:pt-16` + caixa de 44px = o
    `p-12 xl:p-16` e a logo `lg` dela; medido: centros iguais de 1024 a 1920px) — (mesma posição nos três modos — no "Esqueci a senha" nenhum fica marcado; não é centralizado
    na vertical, então nunca pula), o formulário LOGO ABAIXO (transição `animate-fade-in-up`; `CadastroForm`/
    `RecuperarSenhaForm` por `next/dynamic` — só baixados ao abrir o modo) e o AVISO do ADM fechando a coluna na MESMA largura
    (440px); no desktop só essa coluna rola (`lg:h-dvh`). Direita (≥ `lg`) = **`VitrineAcesso`** imersiva (fundo escuro pelos
    tokens `--vitrine-*`) com a **`ConstelacaoAnimada`** — um `<canvas>` no estilo "plexo" do Dattago: pontos em
    profundidades diferentes (os de perto maiores, mais rápidos, com halo) que vagam ao acaso, SURGEM e SOMEM (ciclo de vida) e
    se ligam aos `VIZINHOS`=3 mais próximos (alcance pela profundidade) — as ligações fecham TRIÂNGULOS, preenchidos com um véu
    leve (triangulação viva); densidade pela área (40–120; ~60 fps em 1920×1080), DPR ≤ 2, só roda com tamanho (no celular a vitrine não aparece → 0×0, nada
    roda) e fica num quadro parado sem movimento (sistema ou `data-motion` do ADM). Os TEXTOS (rótulo, manchete, descrição, até
    3 destaques, rodapé e o aviso) são do ADM: **Configurações → Tela de acesso** (`TextosAcessoAdmin`, com a PRÉVIA ao vivo =
    a própria `VitrineAcesso previa`), gravados no blob da aparência (`acesso`, sem migração — `aparenciaSchema.acesso`,
    `soAparencia`), lidos por **`textosAcesso`** (núcleo puro **`acesso-core.ts`**: vazio = o padrão `TEXTOS_ACESSO_PADRAO`;
    destaque sem título some). Sem números inventados. A logo é a
    **`MarcaSistema`** (o favicon da Identidade do ADM, senão o monograma "RV" + nome/subtítulo) — a MESMA do menu do
    `AppShell` (`Brand` a usa); no celular fica no topo do formulário, no desktop na vitrine.
  - **Cadastro CABE NA TELA sem rolar (desktop, medido de 1280×650 a 1920×1080):** campos no modo **`denso`** do DS
    (`TextField`/`SelectField`/`PasswordField denso` = caixa de 44px e rótulo próximo; 40px em telas com altura ≤ 720px),
    `CartaoAuth denso` (etapa na linha do título; o subtítulo some em tela baixa), sem dicas soltas e respiros menores em
    telas baixas (`[@media(max-height:820px)]` no topo da coluna E na vitrine — o seletor segue alinhado à logo). O botão
    "Enviar código de confirmação" ocupa a largura e o CAPTCHA vem LOGO ABAIXO, CENTRALIZADO (até 300px — o Turnstile ou a
    `VerificacaoRobo`); para caber com ele, em tela baixa (desktop ≤ 820px de altura) o aviso do ADM sai no modo cadastro.
    **Nada se mexe com erro:** no `denso` o erro do campo vai na LINHA DO RÓTULO (à direita, cortado, o texto inteiro na dica;
    `aria-invalid` + `aria-describedby`) e o **`ErroAuth`** é FLUTUANTE (o `AvisoFlutuante`, `onFechar` limpa o erro no dono,
    some em 9 s) em Entrar, Criar conta e Esqueci a senha — o erro do envio diz o 1º campo a corrigir.
  - **E-mail institucional = só a parte antes do "@"**: o domínio `@rioverde.go.gov.br` fica FIXO no fim do campo
    (`TextField trailing`); colar o e-mail inteiro vale (`parteLocalEmail`/`emailDaParteLocal`, `cadastro-core.ts`).
  - **CARGOS E FUNÇÕES do ADM (migração `0070`, tabela `cargos`: nome único sem caixa + ordem; semeada com os cargos já
    informados):** Usuários → botão **"Cargos e funções"** → `Modal` com **`CargosAdmin`** (cadastrar/renomear no campo do
    topo, ↑/↓ = a ordem da lista do cadastro — `AcoesCadastro` —, excluir com `useConfirmacao`; quantas pessoas usam cada um).
    A pessoa guarda o NOME (`usuarios.cargo`): **renomear** renomeia o das pessoas no MESMO lote (`renomearCargo`);
    **excluir** só tira da lista (as pessoas mantêm até o ADM trocar). D1 em **`cargos.ts`** (`listarCargos`,
    `cargoCadastrado` — sem caixa, devolve o nome canônico); rotas `GET/POST /api/admin/cargos`, `PATCH/DELETE
    /api/admin/cargos/[id]`, `PATCH /api/admin/cargos/ordem` (`exigirAdmin`, `cargoSchema`, auditoria `cargo`). O **cadastro**
    escolhe o cargo numa **seleção** da lista (exigido quando há cargos; sem nenhum, o campo não aparece) — a rota confere a
    unidade e o cargo ANTES de consumir o código; o ADM troca o de qualquer usuário no "Editar usuário" (`SelectField` da lista
    + o atual "(fora da lista)"; o `PATCH` só aceita um cadastrado, manter o atual ou nenhum).
  - **Cadastro** (`CadastroForm`, 2 etapas): **nome completo** (nome + sobrenome — `nomeCompleto`),
    **matrícula**, **cargo ou função** (`usuarios.cargo`, migração **`0068`**, aditiva — escolhido na lista acima), **unidade** (`SelectField` + **`OpcoesUnidades`** por órgão — `listarUnidadesTrabalho`: sem ocultas nem a
    "Geral"; o servidor confere com `unidadeDeTrabalhoValida`), **e-mail INSTITUCIONAL** `@rioverde.go.gov.br`
    (`DOMINIO_INSTITUCIONAL`/`emailInstitucional`, núcleo puro **`cadastro-core.ts`** — sem zod, leve no navegador), senha +
    confirmação → "Enviar código" → o **código de 6 dígitos** confirma o e-mail e cria a conta **pendente** (os ADMs recebem o
    e-mail). Só o PRIMEIRO usuário do sistema (vira ADM) entra sem código (`semCodigo` — ainda não há envio configurado).
  - **Código** (núcleo puro **`codigo-email-core.ts`**, testado: `gerarCodigo` uniforme por rejeição, `hashCodigo` amarrado ao
    e-mail + finalidade, validade `VALIDADE_CODIGO_MIN`=10, reenvio `REENVIO_CODIGO_S`=60, `MAX_TENTATIVAS_CODIGO`=5,
    `conferirCodigoRegistro`, `MENSAGEM_CODIGO`; D1 em **`codigo-email.ts`**: `emitirCodigo` (upsert — reenviar substitui),
    `consumirCodigo` (errado conta a tentativa; certo APAGA — não vale duas vezes), `descartarCodigo`). Rota **`POST
    /api/auth/codigo`** (`solicitarCodigoSchema {email, finalidade cadastro|senha, token}`): **captcha ANTES de cada envio**
    (Turnstile, quando o ADM ativou), exige o **Resend** (503 sem ele), `cadastro` = institucional e ainda não cadastrado;
    `senha` = com sessão, SEMPRE o e-mail da conta; sem sessão, a resposta é a MESMA exista ou não a conta (não enumera);
    reenvio antes do cronômetro = 429 `{esperarS}`; falha no envio descarta o código. E-mail `emailCodigo` (o código em
    `layoutEmail.destaque`).
  - **Senha é obrigatória e sempre confirmada por código:** `POST /api/auth/senha` ("Esqueci a senha" — `/recuperar-senha` =
    `RecuperarSenhaForm`; também CRIA a senha de quem só entrava pelo Google) e `POST /api/perfil/senha` (`{novaSenha,
    codigo}` — sem a senha atual: o código prova a posse do e-mail; `sessaoAtualId` mantém a sessão atual e encerra as
    OUTRAS). Conta SEM senha (`SENHA_INUTILIZAVEL`) vê no Perfil "Criar senha" com o aviso de que é obrigatória.
  - **Peças de tela** (catalogadas): **`CartaoAuth`** (o passo do formulário — `etapa`, título, subtítulo; form
    `noValidate`: as mensagens são as nossas, em pt-BR) + `ErroAuth` + `ConcluidoAuth` (`onVoltar` → Entrar); **`CodigoEmail.tsx`** —
    `useCaptcha` (o widget + `renovar`: o token vale uma vez), `useCodigoEmail` (envio + cronômetro), `CampoCodigo`
    (numérico, `one-time-code`) e `EtapaCodigo` (destino, campo, "Reenviar código em 0:45" → captcha + Reenviar, "Corrigir os
    dados"). `SelectField` ganhou `error`. O `AuthForm` é o modo ENTRAR (`onEsqueci`; saiu o "Manter-me conectado", que não
    fazia nada).
  - **Só o ADM altera nome, e-mail, matrícula, cargo e unidade:** o `perfilSchema` aceita SÓ apelido + foto (o resto é
    descartado). **Perfil (`PerfilView`) reorganizado:** o CABEÇALHO (foto com o botão de câmera — trocar/remover grava na
    hora —, nome, apelido · cargo, selos Papel + Unidade e "Sair") e duas colunas de **`SecaoPerfil`** (ícone + título +
    descrição + a ação no rodapé, `Button size="sm"`): Conta = Identificação (apelido editável + os dados em `CampoCongelado`,
    selo "Confirmado" no e-mail), Senha, Conta Google; Preferências = Avisos por e-mail, Mesa, Protocolação (o cartão
    Aparência saiu — o tema está no cabeçalho); `UsuariosAdmin` ganhou a coluna
    **Unidade** e o cargo/unidade no ADM (`adminUsuarioSchema.cargo/reparticaoId`; a unidade atual oculta continua valendo — só
    a que MUDOU é validada).
  - **CONTATO + CONTROLE DO ADM (migração `0073`, aditiva — `usuarios.telefone` [só dígitos], `telefone_whatsapp`,
    `dados_validados_em`/`dados_validados_por` [o NOME de quem validou], `trocar_senha`):**
    - **Cadastro:** **Matrícula** no **`CampoMatricula`** (as 6 posições desenhadas no FUNDO do campo — "0" apagado sobre um
      traço, preenchidas ao digitar; `TextField.fundo` + `classeEntrada` monoespaçada) e o **Contato institucional** no
      **`CampoTelefone`** (= o WhatsApp da pessoa: só o ÍCONE do WhatsApp à esquerda, máscara "(64) 99999-0000"; o cadastro
      grava `telefone_whatsapp`=1); os dois com o "(?)" ao lado do rótulo (**`Ajuda compacta`** via `TextField.rotuloExtra`).
      Grade: Nome · Matrícula|Contato · Cargo (inteira) · Unidade (inteira) · E-mail · Senha|Confirmar. **NENHUM TEXTO
      CORTADO:** o `SelectField textoEscolhido` mostra a opção escolhida em até 2 linhas DENTRO da caixa (unidades de nome
      longo — `rotuloUnidade`, `OpcoesUnidades.tsx`), placeholders curtos ("Mínimo 8"), fontes internas ajustadas (contato
      14px tabular; domínio do e-mail 13,5px no celular). Cabe sem rolar no desktop: compacta em ≤ 960px de altura (sem o
      aviso), ≤ 820px (caixas de 40px, sem subtítulo), ≤ 720px (título só para leitor de tela — o seletor Entrar | Criar conta
      diz onde se está) e ≤ 680px (caixas de 38px, respiros menores). Medido de 360×740 a 1920×1080 (harness: cada
      placeholder/valor/opção cabe na caixa). Núcleo puro em
      `cadastro-core.ts`: `filtrarTelefone` (tira o 55 colado), `telefoneValido`, `formatarTelefone`, `linkWhatsapp`.
    - **Usuários (`UsuariosAdmin`) = a TABELA PADRÃO** (`DataTable scrollInterno density="compact"`, filtros por coluna,
      `onRowClick` + `activeKey`): Usuário (foto + nome) · Unidade · Papel · Grupos · Status (+ ícone "senha nova exigida") · Dados
      (Validados/A validar) · **WhatsApp** (**`BotaoWhatsapp`** — link `wa.me/55…` no tamanho de ação de linha, `LinkExterno
      size="xs"`; o toque não abre a linha; sem WhatsApp, o número em cinza). "Cargos e funções" e a Ajuda no rodapé da tabela.
    - **Tocar na linha = o BANNER do usuário (`UsuarioDetalhe`, `Modal` xl, rodapé fixo):** todos os dados; cada um com o
      CADEADO (`useCadeados` + `LinhaCampo`) para editar; "Salvar alterações" manda SÓ o que mudou (fechar com alteração
      confirma); WhatsApp no cabeçalho. **Validar dados** carimba quem/quando ("Salvar e validar" com edição pendente;
      "Desfazer validação") — o SERVIDOR desfaz a validação quando um dado MUDA de fato. **Exigir nova senha**
      (`trocarSenha`; recusado sem o Resend — 409 — e para o próprio ADM; "Dispensar"). Seção **Acesso**: o papel do banco
      (com a confirmação), os **grupos** por cadeado (`GruposDaPessoa`), **Aprovar** (o modal com papel + grupos) / **Recusar**
      (pendente), Desativar/Reativar e **"Ver acesso"** (`AcessoDaPessoa`); Excluir no rodapé. Auditoria registra os fatos ("dados validados", "senha nova exigida").
    - **Troca de senha OBRIGATÓRIA:** `UsuarioSessao.trocarSenha` → o layout do `/painel` redireciona a **`/nova-senha`**
      (fora do painel: `NovaSenhaObrigatoria` = senha nova + captcha → código no e-mail → `POST /api/perfil/senha`; "Sair");
      `/api/perfil/senha` e `/api/auth/senha` zeram a exigência.
  - **Google:** a conta NOVA nunca nasce pelo Google — o callback leva a `/login?modo=cadastro&erro=google-sem-cadastro`; o Google se
    vincula depois, no Perfil. **Avisos por e-mail:** Perfil → E-mail escolhe **onde** chegam — "E-mail institucional" | "Conta
    Google" (`PrefsEmail.destino`, só com o Google vinculado; `enderecoDosAvisos` no envio dos pendentes). O código de
    confirmação vai SEMPRE ao institucional.

## Presença ao vivo
- **PRESENÇA AO VIVO — quem do grupo está online (v1.6.0 + 2.0 na v1.10.0; sem migração D1; Durable Object `PresencaGrupo`):**
  Configurações → aba **"Presença"** (`PresencaAdmin`: mostrar quem está online [DESLIGADO por padrão — nada é carregado nem
  conectado], mostrar ausentes, permitir aparecer invisível e **"ficar ausente após N min parado"** (`inativoMin`, 0–120, 0 = só a
  aba em segundo plano); blob `configuracoes.presenca` — `getConfigPresenca` (cache 60 s, fail-safe = desligada)/
  `gravarConfigPresenca` em `presenca.ts`; `GET/PATCH /api/admin/presenca`, `exigirAdmin`, auditoria).
  - **Núcleo PURO `presenca-core.ts`** (sem zod — o `worker.ts` e o DO também o usam; `tests/presenca.test.ts`):
    `lerConfigPresenca`, `lerPrefsPresenca` (`presenca:pessoa` em `preferencias_tabela` = invisível + **STATUS** Disponível ·
    Ocupado · Em reunião · Não perturbe + recado ≤ 80 [`limparRecado`] + `ate` ISO), `statusVigente` (passou do "até" =
    Disponível), `ficaInvisivel`, `listaPresenca` (UM item por pessoa — `[id, "o"|"a", status?, recado?]`, o melhor estado
    entre as abas, sem invisíveis), `vistosRecentes`/`vistoHa` (o "visto por último", 24 h), `lerMensagemAba` (`{t:"estado"}` —
    também o formato antigo `{estado}` — e `{t:"status"}`), `lerListaMensagem` (`{estados, vistos}`), `ordenarPresenca`,
    `opcoesAte` (30 min · 1 h · 2 h · até as 18h de Brasília).
  - **DO `PresencaGrupo`** (`presenca-grupo-do.ts`, UM por grupo — `idFromName("g<id>")`; binding `PRESENCA_GRUPO` + migração
    `v2-presenca` no `wrangler.jsonc`): WebSocket com HIBERNAÇÃO + auto-resposta do "ping"; tag `u<id>` e o anexo
    `{id, estado, invisivel, ausente, status, recado, ate}` (o status inicial vem do cabeçalho `x-presenca-status`; o `{t:"status"}`
    vale para TODAS as abas da pessoa); 1 mudança/s por aba; retransmite `{t:"presenca", p, v}` só quando MUDOU (a aba nova
    sempre recebe); o **"visto por último" fica só na MEMÓRIA** do objeto (nada gravado; hibernou = recomeça); `/estado` = a
    lista (só leitura, o ADM); até 10 abas por pessoa e 500 conexões por grupo. O `worker.ts` atende
    **`/api/presenca/ao-vivo?grupo=`** antes do Next (mapa `CANAIS`): só do próprio site, UMA consulta D1 (sessão de pessoa
    ATIVA + MEMBRO do grupo + a preferência + `json_extract` da config) — desligada ou fora do grupo = 403.
  - **Cliente — `CanalGrupo`** (`CanalGrupo.tsx`, PROVEDOR no `AppShell`; o layout passa `presenca = {pessoas, whatsapp,
    invisivel, inativoMin, status}` SÓ com a presença ligada e um grupo ativo — `whatsappDe` = só quem marcou o contato como
    WhatsApp): o socket (ping 45 s, `esperaReconexao`, 4000 não reconecta), **ausente por INATIVIDADE** (pointer/teclado/roda/
    toque passivos + um relógio de 30 s; só manda quando muda), `definirStatus` (otimista: socket + `PUT /api/perfil/presenca`,
    volta se falhar), `enviar`/`ouvir(tipo)` (o MESMO socket servirá o chat e o "vendo agora") e um ARMAZÉM com assinatura:
    **`usePresencaDe(id)`** (`useSyncExternalStore` — cada foto só re-renderiza quando o estado DAQUELA pessoa muda) e
    **`useNaoPerturbe()`** (o sino não toca som nem alerta do sistema). `CanalGrupoDemo` = o canal sem servidor (catálogo).
  - **Tela:** **`PresencaGrupo`** (DS) no cabeçalho — as fotos com o ponto que PULSA (`ponto-vivo`), em LEQUE ao passar o mouse,
    "+N" que desliza (`animate-contador`), quem entra cresce (`animate-entrar-pessoa`) e brilha 3 s (`animate-brilho-novo`); no
    celular o ícone com o número verde (pop + pulso) → `Modal`. Painel **"Online agora"**: **`SeloAoVivo`** (DS — radar /
    "Reconectando…"), o SEU STATUS (chips + recado + até; "Não perturbe" avisa que silencia o sino), busca (> 8 pessoas), seções
    **Online · Ausente · Visto recentemente** e, ao tocar numa pessoa, as ações **WhatsApp** (`BotaoWhatsapp`) e **Ver na Mesa**
    (`/painel/mesa?responsavel=<id>` — a Mesa abre filtrada pela pessoa, só para quem vê o Responsável: `verResponsavel` de
    `carregarMesa`; a `key` remonta a Mesa). `aria-live` anuncia quem entrou/saiu. O **ponto de presença** aparece nas fotos do
    sistema pelo **`AvatarPessoa`** (`PessoaTag.tsx`): `PessoaTag` (também no `title`), `SeletorPessoa`, `SeletorPessoas`,
    `MembrosQuadro`, convidados/participantes do `EventoBanner` — parado (o pulso só no cabeçalho e no painel —
    `Avatar.pulsar`). Com a presença, a marca compacta do cabeçalho sai abaixo de 400px.
  - **Armazenamento → "Online agora"** (`OnlineAgoraAdmin`, só com a presença ligada): "Ver quem está online" → `GET
    /api/admin/presenca/online` (`exigirAdmin`; pergunta ao `/estado` de até 40 grupos; os invisíveis não aparecem).
  - **Perfil → "Presença"** (`PresencaPerfil`, só com o invisível permitido): "Aparecer como invisível" → `PUT
    /api/perfil/presenca` (`prefsPresencaSchema` parcial — o que não vier fica; 409 se o ADM não permite).
  - **Animações** em `globals.css` (`ponto-vivo`, `entrar-pessoa`, `brilho-novo`, `contador-desliza`, e já prontas para o chat
    `digitando`/`balao-entrar`) — todas desligadas com "reduzir movimento" (sistema e `data-motion` do ADM). Custo (plano
    gratuito: 100 mil requisições de DO/dia; mensagens que chegam em 20:1; as que saem e a auto-resposta não contam): ~4–5
    mil/dia para 50 pessoas × 2 abas × 8 h.

## Chat ao vivo (v1.11.0; GUARDADO POR 7 DIAS desde a v1.15.0 — ver a seção própria)
- **Regra do usuário (v1.15.0): as conversas ficam GUARDADAS por 7 DIAS** (antes eram só ao vivo) — sem auditoria do conteúdo;
  a limpeza do cron apaga o que passou disso. Configurações → **"Presença e chat"** (`PresencaAdmin`
  → cartão "Chat ao vivo": **Chat do grupo** e **Chat privado**, DESLIGADOS por padrão; blob `configuracoes.chat` —
  `getConfigChat`/`gravarConfigChat` em `presenca.ts`, cache 60 s; `GET/PATCH /api/admin/chat`, `exigirAdmin`, auditoria do
  fato). O chat vive no canal da PRESENÇA: sem ela ligada, não aparece (`AppShell.chat` só com `presenca`).
- **Núcleo PURO `chat-core.ts`** (`tests/chat.test.ts`): `lerConfigChat`, conversas `"grupo" | p<id>` (`idDaConversa`,
  `conversaPrivada`), `limparTextoChat` (sem controles/invisíveis, ≤ 2 quebras seguidas, ≤ 2000), `lerResposta` (a citada),
  `lerMensagemChatAba` (`{t:"msg"|"digitando"|"lida"}`), `contarNaJanela` (30/min), `lerMensagemRecebida` (o `autor` do
  privado só com foto interna), `juntarMensagem` (a mesma pelo id atualiza no lugar — confirmação/eco; teto 300),
  `quantosLeram` ("lida por N"), `cartoesDoTexto` (links do sistema — protocolo/DFD/tarefa/PCA — viram cartões, sem
  consulta; nunca o caminho dentro de link de outro site), `mencaoEmCurso`, `novoIdMensagem`, `rotuloDiaChat`/`horaChat`
  (Brasília).
- **Caminho:** **grupo** pelo socket do grupo — o `PresencaGrupo` valida (texto, 30/min por aba, o autor = o anexo — nunca o
  que a aba diz, `x-chat-grupo`) e retransmite `{t:"msg", conversa:"grupo", id, de, em, texto, resp}` a TODAS as abas (a
  própria = a confirmação; recusa = `{t:"msg-recusada", id, motivo}`); **"digitando"** (1 a cada 3 s por aba) e **"lida"** ao
  grupo (menos a própria pessoa) ou, no privado, às abas da outra pessoa NESTE grupo. **Privado** pela rota **`POST
  /api/chat/enviar`** (v1.14.0 — ver "Chat estilo Messenger"; `exigirUsuario`; chat privado ligado; destinatário ATIVO
  num grupo em comum; limite `chatPrivado` 30/min por pessoa em `LIMITES_ACESSO`) → a **`CaixaNotificacoes`** do destinatário
  (`POST /chat` — repassa às abas e devolve quantas receberam) e a de quem mandou (as outras abas dele); 0 abas =
  `entregue:false` ("não está com o sistema aberto — não foi entregue"). Nada é gravado. No cliente o `useCaixa` do sino
  repassa `{"t":"chat"…}` ao evento `EVENTO_CHAT_PRIVADO` (não é aviso do sino).
- **Tela — `ChatAoVivo`** (DS; no cabeçalho, ao lado da presença): o ícone `IconChat` com as não lidas (pop) abre a LISTA
  por **portal no body** (o cabeçalho com desfoque prenderia o fixo) — desktop ancorada à direita (360px), celular em tela
  cheia; Esc fecha; a conversa abre numa BOLHA + janela (v1.14.0). **Lista:** "Grupo · <grupo>" + as privadas desta sessão (prévia, hora, não lidas,
  "digitando…") + **Nova conversa** (as pessoas do grupo com o ponto de presença, online primeiro; busca acima de 8) + o aviso
  "As conversas não são salvas". **Conversa:** balões (**`Balao`** — meus à direita na cor do sistema; dos outros com foto e
  nome no grupo, agrupados por autor em 5 min), separador de dia, responder (citação), **@menção** com sugestão (Enter insere),
  `TextoFormatado` (negrito, código, links), cartões dos links do sistema, ✓ enviada / ✓✓ lida ("lida por N" no grupo),
  "enviando…", "Tentar de novo" (falha ou sem confirmação em 8 s) e "não entregue" (privado), **`Digitando`** (três pontos —
  `ponto-digitando`), "↓ Novas mensagens" rolado para cima; Enter envia, Shift+Enter quebra. Mensagem com o painel fechado =
  som (menos com **Não perturbe**) + `toast.acao` com **"Responder"** (o `Toast` ganhou `acao`). Abrir a conversa à vista
  zera as não lidas e manda a "lida". Trocar de grupo apaga a conversa do grupo anterior.

## Chat guardado por 7 dias + arrastar minimiza (v1.15.0)
- **Banco (migração `0088`, aditiva):** `chat_mensagens` (id da aba = idempotente; `conversa` = a CHAVE do servidor —
  **`chaveConversa`**: `g<grupo>` | `p<menor>-<maior>` | `c<id>`; `conversaDaChave` volta à conversa da tela de cada um) e
  `chat_conversas` (por pessoa: a última mensagem, nome/membros da conversa em grupo e até onde LEU). Builders em
  **`chat-sql.ts`** (testados no driver D1 real — `tests/chat-sql.test.ts`): `comandosGuardarMensagem` (a conversa na
  lista de cada participante em INSERTs de 10 — ≤ 100 parâmetros; quem manda já leu), `comandoMarcarLidaChat` (nunca
  volta), `consultaConversasChat`/`consultaResumoGrupo` (a última e as NÃO LIDAS), `consultaHistoricoChat` (as 200 mais
  recentes — `MAX_HISTORICO`), `consultaLidasChat`, `consultaParticipa` e **`comandosLimparChat`** (no cron dos e-mails, a
  cada 5 min: o que passou de `VALIDADE_CHAT_MS` = 7 dias — `DIAS_CHAT`).
- **Tudo pela ROTA (guarda e entrega):** `POST /api/chat/enviar` agora também o chat do GRUPO (`{conversa:"grupo", grupo}` —
  membro do grupo, `ehMembroDoGrupo`) → guarda e repassa ao objeto do grupo (`repassarNoGrupo` → `POST /repasse` do
  `PresencaGrupo`, só alcançável pelo binding); a privada/em grupo pelas caixas (`entregarNaCaixa`, **`chat-servidor.ts`**).
  Quem não está online vê ao entrar ("Fulano não está online agora — vai ver ao entrar"). `POST /api/chat/sinal`: a "lida"
  é GUARDADA (o ✓✓ e as não lidas valem depois de recarregar — a hora lida = o `em` da PRÓPRIA mensagem lida, nunca volta;
  v1.17.3) e chega TAMBÉM às outras abas/aparelhos de quem leu (a caixa dele; no grupo, o `/repasse` a todas as abas) — lá
  as não lidas viram só as posteriores (`naoLidasDe`); a lista guardada traz `agora` e soma só as ao vivo depois dele
  (`naoLidasAoCarregar`); a do grupo pelo `/repasse` (a todos menos quem leu); o
  "digitando" do grupo segue pelo socket. **`GET /api/chat/conversas?grupo=`** (a lista com a última e as não lidas, ao abrir
  o sistema e ao trocar de grupo) e **`GET /api/chat/historico?conversa=&grupo=`** (ao abrir cada conversa, uma vez —
  `carregar`; só de quem participa). As bolhas abertas ficam no aparelho (`chat:bolhas`); a lixeira só FECHA a bolha (a
  conversa segue na lista); saiu o "Sair" e o aviso de saída da página.
- **Bolhas:** arrastar MINIMIZA a conversa aberta; ao soltar, o POUSO é FLIP (`estiloDaBolha`): cada bolha parte de onde está
  (a arrastada, do ponto em que foi solta) e voa com mola até o lugar novo, em cadeia (35 ms entre elas) — sem o "pulo" de
  volta; erguer/ímã/sumir na lixeira na própria bolha (escala com mola).
- **Fechamento RÁPIDO (v1.15.1 → 1.16.0):** a janela sai em 60 ms FIXOS (`animate-janela-sai`: escala 0,85, sem desfoque,
  `ease-in`) e desmonta em 70 ms; a bolha na lixeira some em 0,6× e a lixeira sai em 0,55×.
- **Bolhas INDEPENDENTES (v1.17.0; substitui a pilha/cadeia da v1.16.0):** cada bolha tem a PRÓPRIA posição
  (`PosicoesBolhas` = conversa | "+" → `{lado, y fração, t}`; `chat:posicoes` no aparelho, migrada do antigo `chat:posicao`
  por `migrarPosicoes`; as das conversas fechadas são podadas ao gravar). Arrastar leva SÓ a bolha presa (inclinada pela
  velocidade, ±14°); soltar ARREMESSA (`velocidadeArrasto` → `projetarArremesso`) e encosta na borda mais perto naquela
  altura (`pousarBolha`); **`arrumarBolhas`** (puro, testado) dá o lugar de cada uma — a mexida por ÚLTIMO fica e as outras
  do MESMO lado vão ao lugar livre mais perto (nunca uma sobre a outra, dentro da área livre); a sem posição nasce à
  direita, embaixo, e é fixada no lugar em que apareceu. Pouso FLIP só da solta e das que abriram espaço. A janela abre ao
  lado da bolha ativa. Teclado: Alt + ↑/↓ sobe/desce a bolha, Alt + ←/→ troca de lado. A bolha "+N" também se arrasta (não
  vai à lixeira).
  **Abrir espaço AO VIVO + ÍMÃ (v1.17.1):** durante o arrasto, **`previaArrasto`** (puro, testado — a MESMA conta da prévia,
  do soltar e do Alt + setas) dá o lugar da presa e o das outras, que DESLIZAM para abrir espaço (`translate` com mola); uma
  SOMBRA tracejada mostra onde ela pousa. **`imaBolha`**: a até `RAIO_IMA` (0,6 × passo) do ponto colado acima/abaixo de
  outra bolha do mesmo lado, encaixa juntinho (vão de 10px); longe, fica onde foi solta. Ao soltar, **`posicoesAposSoltar`**
  grava a presa e as que abriram espaço (com o `t` de antes — nada volta pulando). O `pointermove` é desenhado UMA vez por
  quadro (rAF; a prévia só refaz quando muda o lado ou o topo); pegar uma bolha ainda pousando cancela o pouso; mudar o
  tamanho da janela encerra o arrasto; "reduzir movimento" = sem inclinação nem voo.

## Chat estável + "Ao vivo" único + lixeira (v1.14.2)
- **Nunca desmonta:** o layout devolve `undefined` quando a leitura da presença/config do chat FALHA (`presencaDoGrupo`,
  `getConfigChat` → `null` sem cache) e o `AppShell` mantém o último valor válido (`useUltimoValido`); o `CanalGrupo` monta
  SEMPRE a mesma árvore (`CanalAtivo` com `ativo` — ligar/desligar troca só o contexto, nada remonta).
- **Entrega real:** a `CaixaNotificacoes` só conta como "entregue" a aba com ping há ≤ 2 min (`SINAL_ENTREGA_MS`); o canal do
  sino conecta UMA vez (a função por ref), reconecta sem o "pong" em 10 s e no `online`.
- **Sinais pelas caixas:** "lida"/"digitando" da privada e da conversa em grupo vão por **`POST /api/chat/sinal`**
  (`chatSinalSchema`; `{t:"chat-sinal", tipo, conversa, de, ate}` às caixas — valem em qualquer grupo ativo); o do grupo
  ativo segue pelo socket do grupo.
- **Um painel só — "Ao vivo":** o `ChatAoVivo` virou o PROVEDOR (`useChatAoVivo`: a lista, as não lidas, `pedidoLista`) em
  volta do `PresencaGrupo`, cujo gatilho mostra a pilha + o ícone das conversas (não lidas) e o painel tem as abas
  **Online | Conversas** (`PainelAoVivo` → `PainelOnline embutido` / `ConversasDoChat`). O `Dropdown` ganhou o modo
  CONTROLADO (`aberto`/`onAberto`) — o "+N" das bolhas abre na aba Conversas.
- **Bolhas:** tocar abre/minimiza; QUALQUER toque fora (ou Esc) minimiza, menos com o **alfinete** "Manter aberta"
  (`chat:fixada` no aparelho); EXCLUIR = arrastar a bolha até a **LIXEIRA** no centro inferior (surge no arrasto —
  `animate-lixeira-entra`; ímã que puxa a bolha, ela encolhe e some dentro). A janela cresce A PARTIR da bolha
  (`animate-janela-cresce` com origem no centro dela) e sai encolhendo (`animate-janela-sai`, o mesmo elemento). Sombra
  `shadow-flutuante`/`shadow-erguida` (tokens `--sombra-flutuante`/`--sombra-erguida`, claro e escuro). Fotos sempre
  redondas: todo invólucro com anel em volta de um `Avatar` é `flex`/`inline-flex` (num bloco, a altura da linha esticava o anel).
- **Arrasto sem o nativo (v1.14.3):** a foto do `Avatar` é `draggable={false}`; a pilha bloqueia `dragstart`, a seleção, o
  `-webkit-user-drag` e o menu do toque longo nas imagens, e o `pointerdown` do mouse já faz `preventDefault` (antes do
  limiar de 6px o navegador começava a arrastar a imagem).

## Presença no nível profissional (v1.14.1)
- **Cabeçalho:** a pilha é a **`PilhaFotos`** (a mesma dos membros do quadro de Tarefas) — até `MAX_FOTOS`=5 fotos (a primeira por cima — o ponto no canto não é coberto) e o círculo **"+N"** do mesmo
  tamanho (os nomes na dica). O ponto da foto é `absolute` no `Avatar`: a regra `.ponto-vivo` do `globals.css` NÃO fixa
  `position` (fora das camadas do Tailwind ela venceria o `absolute` e o ponto saía do canto); o mesmo cuidado com
  `.animate-contador` (`display: inline-block` — vai no texto, não na caixa centrada).
- **Ausente há X min:** a aba diz há quanto tempo está parada ao virar ausente (`{t:"estado", estado:"ausente", ha}` ≤ 24 h);
  o objeto guarda `ausenteDesde` e a lista leva `d` = **`ausentesDesde`** (todas as abas ausentes → a mais recente);
  `InfoPresenca.desde` → **`rotuloAusente`** no painel (relógio de 30 s) e na dica da foto.
- **Carência de saída (`CARENCIA_SAIDA_MS`=12 s):** fechada a última aba, a pessoa fica na lista (memória `saindo` do
  `PresencaGrupo`) até o ALARME do objeto; voltando antes (F5), nada muda para os outros. Depois, "visto por último".
- **Conexão morta:** o alarme (a cada `VARREDURA_MS`=90 s só com abas conectadas) fecha a aba sem sinal há `SEM_SINAL_MS`=3
  min (o último ping pela `getWebSocketAutoResponseTimestamp`, a conexão, a última mensagem) — marcada `morto`, fora da
  lista. Na tela, o `CanalGrupo` fecha e reconecta quando o "pong" não chega em 10 s, fecha no `offline` ("Reconectando…") e
  reconecta na hora no `online`.

## Chat estilo Messenger + conversas em grupo (v1.14.0 — nada é salvo)
- **Bolhas:** o ícone do cabeçalho abre a LISTA (grupo ativo, privadas, conversas em grupo, "Nova conversa", **"Nova conversa
  em grupo"** — `NovaConversaGrupo`: 2 a 19 pessoas do grupo + nome opcional); cada conversa aberta vira uma bolha do
  **`BolhasChat`** (DS, portal no body: foto + ponto ao vivo / mosaico da conversa em grupo — `FotoBolha` — / o ícone do
  grupo; não lidas; até `MAX_BOLHAS`=4 + "+N"; a que chega QUICA — `animate-cabeca-entra` — no lugar do aviso flutuante).
  ARRASTA a pilha inteira (mouse e toque, limiar 6px, ouvintes na janela, `segurar`) e ao soltar ENCOSTA na borda mais perto
  (`encostarBolhas`/`topoDasBolhas`, mola `bolha-encosta`; posição `chat:posicao` no aparelho — `lerPosicaoBolhas`); soltar no
  "×" (aparece embaixo, `animate-alvo-fechar`) fecha todas; o × de cada uma (mouse) fecha só ela. Tocar abre a JANELA
  (340×480 ao lado da pilha, `animate-janela-cresce`; tela cheia abaixo de 640px; Esc minimiza) com a `ConversaChat`
  (Minimizar · Sair da conversa em grupo · Fechar). `EVENTO_ABRIR_CHAT` aceita `{pessoa}` | `{conversa}` (+ `texto`); o
  "Conversar" de cada pessoa do Online agora (`CanalGrupo.chatPrivado`).
- **Conversas em grupo escolhidas (`c<id>`, `ehConversaEmGrupo`/`novaConversaEmGrupo`, `chat-core.ts`):** criadas na aba;
  existem enquanto alguém dela está com o sistema aberto. Envio pela rota ÚNICA **`POST /api/chat/enviar`**
  (`chatEnviarSchema` `{conversa p<id>|c<id>, para 1..19, nome?, id, texto, resp}` — substitui o `/api/chat/privado`;
  `exigirUsuario`, chat privado ligado, limite `chatPrivado`, cada destinatário ATIVO num grupo em comum —
  **`quemCompartilhaGrupo`** numa consulta `json_each`) → as caixas pessoais (a mensagem leva `membros` + `nome`) e as outras
  abas de quem mandou; `{entregues, naoEntregues}` → "Não entregue a Ana". "Digitando"/"lida" pelo socket do grupo com
  `para` (o `PresencaGrupo` entrega só às abas desses membros). `rotuloConversa` (o nome ou "Ana, Bruno e mais 2").

## Vendo e editando agora (v1.12.0 — nada é salvo)
- **`VendoAgora`** (DS; no cabeçalho dos banners — `useProtocoloGravado` [protocolo; o DFD ao lado], `useDfdGravado` e
  `TarefaDetalhe`): registra no `CanalGrupo` o que ESTA tela está com aberto (`registrarVendo(alvo, editando)` — um registro
  por banner; a aba manda `{t:"vendo", alvos ≤ 5, editando ⊆ alvos}` com 250 ms de espera e de novo a cada reconexão) e mostra
  quem MAIS do grupo está com o MESMO item aberto (as fotos com o pulso, "também aqui"/"+N aqui") e, em âmbar, quem tem
  **alteração não salva** ("Ana editando" — combine antes de salvar: o último "Salvar" vale) — `editando` = o rascunho do banner
  (`capaSuja`/`editados`/`itensEditados`/`sujo`). Com o chat do grupo ligado (`CanalGrupo.chatGrupo`), **"Conversar sobre
  este …"** dispara `EVENTO_ABRIR_CHAT` → o `ChatAoVivo` abre a conversa do grupo com o link do item no campo (vira o cartão).
  O painel do chat fica ACIMA dos banners (`z-[60]`).
- **Servidor (só na memória):** o `PresencaGrupo` guarda `vendo`/`editando` no anexo da aba (60 mudanças/min por aba) e
  retransmite `{t:"vendo", m: [[alvo, [[id, 1 = editando | 0]]]]}` (`listaVendo` — sem invisíveis, estável; só quando muda;
  a aba nova recebe). Núcleo puro em `presenca-core.ts`: `alvoVendoValido` (`protocolo|dfd|tarefa:<id>`), `MAX_VENDO`,
  `lerMensagemAba` (`t:"vendo"`), `listaVendo`, `lerVendoMensagem` (testados em `tests/presenca.test.ts`).

## Onde cada pessoa está (v1.13.0 — nada é salvo)
- **ONDE:** o `CanalGrupo` manda `{t:"onde", tela, rotulo}` quando a tela muda (300 ms; de novo na reconexão) — núcleo puro
  **`ondeDaRota(pathname, busca, detalhe)`** (`presenca-core.ts`: `TELAS_ONDE` = as abas + perfil/admin/outra, `ROTULO_TELA`,
  "Tarefas · <quadro> · Quadro", "PCA · <pca> · Orçamento", ≤ 80); o NOME vem da página por **`useOndeDetalhe(texto)`**
  (`QuadroTarefas`, `PcaEspacoView`, `OrcamentoEspacoView`, `MesaPca`). O `VendoAgora` ganhou **`rotulo`** ("Protocolo
  144756/2026", "DFD 1234 (Planej. 1509)", "Tarefa #12 …") → `rotulos` na mensagem `vendo` (`lerMensagemAba`; faltando,
  `rotuloDoAlvo`).
- **Servidor (`PresencaGrupo`, só memória):** o anexo guarda `onde`/`rotulos`/`mexeu` (vendo + onde ≤ 60/min por aba) e, com
  **`ConfigPresenca.atividade`** (ADM, padrão ligado — `x-presenca-atividade`; desligada não guarda nem manda), a mensagem
  `vendo` leva **`a`** = **`listaAtividade`** ([id, tela, rótulo, [o que vê], editando] — a aba que mexeu por último, sem
  invisíveis); o `/estado` também (ADM "Online agora" — `textoAtividade`). Cliente: `lerAtividade`.
- **Tela:** armazém com assinatura **`criarArmazemVendo`** (valor que não mudou = mesma referência) + o contexto ESTÁVEL
  **`useCanalEstavel`** → **`useVendoDe(alvo)`**/**`useAtividadeDe(id)`** (só a linha do item re-renderiza). **`PresencaNoItem`**
  (DS, `PresencaNoItem.tsx`): as fotos de quem está com o item aberto (lápis âmbar = editando) no nº do protocolo da Mesa
  (`DfdsView`), no nº do DFD da `PlanilhaDfds` (só `unica` — a chave é o id) e no rodapé do `CartaoTarefa`.
  **`AtividadePessoa`** (o ícone da tela + "Mesa › Protocolo … · editando") na linha de cada pessoa do "Online agora", que
  ganhou a seção **"Nesta tela"** (mesma tela + rótulo que você); a dica de cada foto do cabeçalho diz onde a pessoa está.

## Grupos, Permissões, Órgãos e Unidades (RBAC por grupo)
> **Vocabulário (rename UI-only):** a antiga "Repartição" é, na interface, a **"Unidade"**; o
> identificador de código/tabela segue `reparticao*` (não renomear). Toda **Unidade** pertence a um
> **Órgão** (entidade nova, acima). NÃO confundir com a **Planilha (PCA)** (tabela `unidades`, arquivo
> importado) nem com a **Unidade de medida** do item (`itens.unidade_medida`) — três conceitos distintos.
- **Administração (Grupos/Permissões/Usuários):** PATCH com schemas PRÓPRIOS, sem os padrões da criação
  (`grupoPatchSchema`/`permissaoPatchSchema` — o `.partial()` apagava pessoas/unidades/telas num PATCH só com o nome);
  gravar o grupo = UM lote (**`rbac-sql.ts`**: `comandosMembros`/`comandosUnidades` em INSERTs de ≤ 40, ids conferidos antes
  — `motivoIdsInvalidos` → 422; inexistente = 404); **excluir grupo** mostra o IMPACTO (`GET /api/admin/grupos/[id]` →
  `impactoDoGrupo`: quadros de tarefas, pastas e modelos que somem em CASCATA) e exige `?confirmar=1` (409 sem ele); a sigla
  **GERAL** é reservada também na edição e ao rebaixar/ligar "também unidade" (`ehCodigoGeral`). Telas com a confirmação do
  sistema (`useConfirmacao`), erro dentro do modal, avisos flutuantes; trocar papel/desativar/excluir usuário confirmam.
  Mensagens padrão do Zod em pt-BR (`zod-config.ts`, importado pelo `http.ts`).
- **Grupos** (`grupos`): um usuário pertence a vários (`usuario_grupos`); escolhe o **grupo
  ativo** no cabeçalho (cookie `pca_grupo`). Cada grupo tem **1 permissão** e acessa um conjunto
  de **repartições** (`grupo_reparticoes`). Telas admin: `/painel/grupos`, `/painel/permissoes`,
  `/painel/orgaos` (Órgãos → clique numa linha → Unidades daquele órgão). Helpers em **`src/lib/grupos.ts`** (`getGrupoAtivo/Id`, `abasPermitidas`,
  `getReparticaoContexto`, `definirGrupoAtivo/ReparticaoAtiva`); abas gerenciáveis em `src/lib/abas.ts`.
- **Permissões** (`permissoes.abas` = JSON de keys): definem quais **abas de módulo** o grupo vê — `ABA_KEYS` =
  **`dfd` (Mesa) · `pca` · `catalogo` · `orcamento` · `tarefas` · `calendario`**, na ORDEM da navegação (`ABAS`, `src/lib/abas.ts`, puro). **Admin
  ignora** (vê todas — regra firme). A navegação dos módulos sai de UMA fonte — **`NAV_MODULOS`** (`navModulos.ts`: rota +
  rótulo + ícone por aba) — na sidebar do `AppShell` e na `BottomNav` do celular, filtrada por `abasPermitidas` (o **Calendário** é um módulo como os outros, com permissão PRÓPRIA — migração `0046`).
  **Tudo na Mesa:** o antigo **Dashboard** (`/painel`) e a tela **Protocolos** legada (`/painel/protocolos`,
  `/api/protocolos*`, `lib/protocolos.ts`) foram REMOVIDOS — `/painel` é só a PORTA DE ENTRADA (redirect no servidor
  para `rotaInicial`: a 1ª aba liberada — a Mesa; sem nenhuma, o Perfil, que AVISA — `PerfilView.semModulos`) e o link
  antigo `/painel/protocolos` redireciona à Mesa (como `/painel/dfds`). Ninguém perde acesso: a migração **`0036`**
  (aditiva, idempotente — espelho da `0015`) dá a Mesa (`dfd`) a toda permissão que tinha `protocolos`; as chaves antigas
  (`dashboard`/`protocolos`) ficam no JSON e **`abasConhecidas`** as descarta na LEITURA (`abasPermitidas` e `GET
  /api/admin/permissoes`) — o ADM salva a permissão sem erro (o Zod `rbac-validation` só aceita `ABA_KEYS`). A permissão é
  PORTÃO REAL: as páginas (`acessoPagina`) e as rotas (`exigirAcesso`/`recusa*` — ver "Guardas") conferem a tela aberta pelo
  grupo **e** o que o PAPEL permite nela; pela URL, a tela fechada mostra o `AcessoRestrito`. As tabelas
  `protocolos`/`protocolo_opcoes` ficam no banco **DORMENTES** (dados preservados, sem código, fora do `schema.ts`; sem
  migração de DROP).
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
  `/api/admin/orgaos*` (CRUD + `/ordem`). **Toda unidade pertence a um órgão** (migração `0078` apagou as sem órgão, menos a "Geral"; `reparticaoSchema.orgaoId` obrigatório e conferido nas rotas — 422) e **excluir um órgão exclui as unidades dele** no mesmo lote (o órgão com DFD/protocolo, direto ou pelas unidades, segue só ocultável — 409). Loader
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
- **Repartição escopa os dados (além de acesso):** a repartição ativa do head **filtra** os protocolos/DFDs da Mesa e
  o PCA. `getReparticaoFiltro()` devolve `{id,codigo}` da ativa, ou **`null` em "Geral"** (= todas, sem
  filtro). No **PCA**, cada
  `unidade` (planilha) recebe `reparticao_id` da unidade ativa no
  import (`/api/upload`; Geral → NULL, e re-import em Geral preserva a atual); `/painel/pca` lista via
  `getUnidades(rep?.id)`. O dashboard público (`/`) **não** é escopado.
- **PCA do CABEÇALHO — filtro GLOBAL (sem migração):** um dropdown à ESQUERDA do head (`PcaSelect`, no `AppShell`; no
  celular mostra só o ano) escolhe o PCA — cookie **`pca_filtro`** (como a unidade/grupo: `src/lib/pca-filtro.ts` —
  `pcasDoFiltro` = os PCAs cadastrados COM ano, `getPcaFiltro`, `definirPcaFiltro`; rota **`POST /api/pca/filtro`**
  `{pcaId|null}` com `filtroPcaSchema`, `exigirUsuario`, 404 p/ PCA inexistente). "Todos os PCAs" (sem cookie) = sem filtro.
  Casa pelo ANO (o protocolo/DFD guarda `ano_pca`) com UMA régua — o PCA do DFD = o do protocolo de origem, senão o do
  próprio DFD (`anoPcaDfdSql`, `dfd-sql.ts`): a **Mesa principal** (DFDs e a lista lazy de itens por `filtroAnoPcaDfd`; os
  protocolos por `filtroAnoPcaProtocolo` = o ano do protocolo, e o ANTIGO sem ano entra pelo ano de um DFD dele — protocolos,
  DFDs e itens nunca se contradizem; os itens recebem o ano EXPLÍCITO da página — `/api/dfd/itens?ano=` —, nunca o cookie
  relido depois; o Dashboard segue as listas), os **cards do módulo PCA** (só o card do escolhido; o subtítulo avisa) e o
  **Orçamento** (os orçamentos/lançamentos do ano — `listarOrcamentos(ano)`/`getOrcamentoItens(_, ano)`). NÃO filtra a Mesa do
  PCA (já é de um PCA), o espaço de um PCA (dentro dele, escolher outro PCA leva ao espaço do escolhido, na mesma aba), o
  Catálogo, a Administração nem a tela pública. A Mesa vazia diz qual PCA está filtrando. O seletor guarda a escolha em
  estado LOCAL (o layout é compartilhado — ir de um espaço de PCA a outro não o renderiza de novo; vale o do servidor quando
  ele muda), só aparece para quem vê Mesa/PCA/Orçamento, e criar/excluir um PCA faz `router.refresh()` depois da navegação
  (a lista do cabeçalho acompanha). `listarPcas` é memorizado POR REQUISIÇÃO (`cache` do React): layout + página = uma
  consulta.
- Migrações `0009` (grupos/permissões), `0010` (repartições) e `0011` (`unidades.reparticao_id`) semeiam
  o grupo/repartição **"Geral"** e migram os dados/usuários existentes para lá — por isso o uso atual não muda.

## PCA por DFD (importar e compilar) — migrações `0012`/`0013`/`0016`
- **DFD** = um formulário (`.xlsx`) lido **no navegador** (`src/lib/parse-dfd.ts`, com `raw:false` p/ o texto
  formatado — preserva o código longo e os zeros à esquerda — **e `raw:true`** p/ os números exatos; núcleo
  puro/testável `parse-dfd-core.ts`); vira `dfds`/`dfd_itens`
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
  - **REGRA ÚNICA, de ponta a ponta (auditoria dos totais, migrações `0085`/`0087`):** valor do DFD = Σ dos totais dos itens
    com **4 casas** — a precisão da Centi, cujo preço unitário tem até 4 casas (36 × 80.204,5466 = 2.887.363,6776);
    `arredondarValor`, `ROUND(…, 4)` no banco — (NULL quando ≤ 0) e nº de itens = quantos existem; a tela mostra ao centavo
    (`brl` fixa as 4 casas antes: duas somas do mesmo valor em ordens diferentes mostram o MESMO centavo) — na LEITURA (`fecharValoresItens`, `parse-dfd-comum.ts`: o
    item sem total com quantidade e valor unitário recebe q × vu; o "TOTAL GERAL" do documento só FECHA a tabela, não define
    o valor), na EDIÇÃO (`editarItemDfd`: trocar quantidade/valor unitário recalcula o total do item — `totalDoItem`, a régua
    da massa; total digitado à mão vale; `valorDosItens`), na SOBRESCRITA (`comTotal` = a soma) e no BANCO
    (**`comandoTotaisDfd`**, `dfd-sql.ts`, no MESMO `db.batch` de toda escrita de itens — `start-dfd`/`append` com
    `soCompleto`: a importação pela metade mantém o total DECLARADO, que o `gravacaoParcial` usa; "Salvar" e a massa sempre).
    A `0085` acertou os gravados (item sem total → q × vu; DFDs completos → os itens) e a `0087` os passou a 4 casas (somar
    DFDs já arredondados ao centavo dava R$ 0,01 de diferença entre as abas DFDs e Itens e contra a capa — 3 de 68 protocolos,
    medido em produção). Assim protocolo (Σ DFDs) = DFDs = itens em TODA tela — lista e capa do protocolo, cards/Dashboard/
    Orçamento do PCA, calendário, consulta pública.
- **Assinatura digital (captura + conferência, migração `0018`):** o PDF traz, DEPOIS de cada DFD, uma página
  "Assinaturas Digitais (Certificado Digital)" com 1+ linhas `Assinatura digital - Nome: … e-CPF: … Usuário: …
  Data: dd/mm/aaaa hh:mm:ss … e-Assinatura: <código> - <url>`. **`extrairAssinaturas`** (`parse-dfd-comum.ts`,
  puro) lê nome/e-CPF/usuário/data/**código verificador** (o `ehRuido` descarta essas linhas das seções). Há
  **CINCO formatos** (campo `fonte`; **A** certificado, **B** sistema, **C** dropsigner, **D** adobe, **E** foxit —
  o Formato E e qualquer assinatura ACHATADA são lidos por OCR, descrito no fim desta seção): **certificado** (acima) e **sistema** ("Assinaturas Eletrônicas (Sistema)":
  `Assinado digitalmente por NOME, portador do CPF: … utilizando o código: <código>`); e o **Formato C — `dropsigner`**
  (Dropsigner/Lacuna Software): o bloco visível é, na maioria dos DFDs, a **APARÊNCIA de uma ANOTAÇÃO de assinatura**
  (widget `Sig`) — que o **`getTextContent` NÃO extrai** (só o render/aparência traz). Por isso o Dropsigner é lido do
  **TEXTO RENDERIZADO POR PÁGINA** (`getOperatorList`, via `PdfDoc.pageRender`) por
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
    repetido na linha do OCR ("NOME NOME" — o nome impresso ao lado + o do carimbo) é colapsado (DFD 142 real). Worker liberado por `encerrarOcr`, que
    ENTRA NA MESMA FILA das leituras (`filaSerial`, `ocr-assinatura-core`): o `terminate` do tesseract.js 7 não rejeita o job em curso — encerrar
    no meio de uma leitura (fechar a análise, a outra importação terminar) travava a fila até recarregar a página. **Best-effort:** qualquer erro → sem assinatura (= antes).
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
    uma `fonte:"manual"`) e "Desfazer validação" (`desfazerValidacaoEquipe`). **DATA da assinatura (sem migração):** ao
    ADICIONAR (nenhuma lida) a equipe informa a data (obrigatória, campo de data → "dd/mm/aaaa"); ao validar uma lida, vem a
    data lida (corrigível — `definirDataAssinaturaEquipe`, que nunca APAGA a data; o MESMO dia mantém a hora/fuso do
    certificado; o campo `CampoDataAssinatura` tem rascunho local — digitar o ano não "volta" o campo). A assinatura
    ADICIONADA (`fonte:"manual"`) é SEMPRE validação da **equipe** (nunca "auto" — os laços automáticos só olham as LIDAS), e
    nela um TEMPORÁRIO só vale se o período dele cobre a data informada; na assinatura LIDA validada pela equipe, o período
    não é reexigido (a equipe conferiu o PDF — como sempre foi; DFDs já validados não mudam de estado).
    `dataAssinaturaValida`/`dataAssinaturaDeIso` (puros) recusam data inválida/futura — e o `assinaturaSchema` (refine)
    recusa no servidor a `manual` com data inválida/futura (vazia é aceita: as legadas não tinham data). Vale enquanto o responsável for da unidade
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
- **TEXTO CORRIDO (parágrafos) em TODA importação — núcleo puro `texto-corrido.ts`:** o PDF entrega uma linha por linha
  VISUAL e o texto das seções era gravado com uma quebra em cada uma ("…MONITORAMENTO REMOTO NO⏎DEPARTAMENTO…").
  `coletarSecoes(linhas, {direita})` junta as linhas pelo `textoCorrido`: a quebra FICA quando é real — fim de frase
  (`terminaFrase`, fora de abreviação "SEC."/"LTDA."/inicial), marcador/enumeração/rótulo "Nome:" na seguinte (`lista`: o
  "- item" seguinte a um parágrafo que abriu com marcador), BLOCO novo pela geometria (vão > 1,4× o corpo da fonte), linha
  curta — e SOME (espaço; palavra hifenizada junta sem espaço) quando é da LARGURA: palavra de LIGAÇÃO no fim
  (`terminaEmLigacao`: E/DE/DA/NO/COM/PARA/A/À…, vírgula, " -" — com acento: "É" verbo não é "E"), a seguinte CONTINUA (minúscula,
  "E"/"DE"/"DA"…) ou a linha vai até ~75% da margem direita (`GeoLinha` do PDF: `x0`/`x1`/`y`/`h` — `geoDaLinha`). Na dúvida,
  FICA. No PDF (`parse-dfd-pdf-core`) as linhas levam a geometria e o **cabeçalho de página** (as linhas do topo até o
  "Número DFD", `cabecalhosDePagina` — o ÓRGÃO emissor não é ruído fixo e vazava para a seção que atravessa a página) sai
  das seções; na planilha (strings) só as pistas do texto decidem. **Cabeçalho:** `juntarContinuacoesCabecalho` (PDF e
  índice do protocolo) devolve INTEIRO o "Órgão/Entidade"/"Setor Requisitante" quebrado em 2 linhas — até 2 linhas sem
  rótulo ENTRE o campo e o próximo rótulo do cabeçalho (nunca cola a tabela) —; a `siglaSetor` só vale com ≤ 60 (o servidor
  recusa acima); **Matrícula/e-mail/telefone** = o valor do 1º rótulo (`buscarPrimeiro` — vazio no PDF ⇒ `null`, nunca o ":"
  nem os da equipe do §8). Texto gravado (sem geometria): `refluirTexto(texto, larguraVisual(textos))` — a largura visual sai
  das linhas que terminam em ligação (quebra certamente da largura); sem elas, só as pistas do texto: IDEMPOTENTE (revisar de
  novo não muda). Validado no `pd101820` real: o texto gravado pela versão anterior, revisado, fica IGUAL à importação nova
  nos 15 DFDs (129 seções). Testes: `tests/texto-corrido.test.ts` (casos reais medidos no PDF).
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
  build roda com `next build --webpack`): a tabela é lida pela **GRADE DESENHADA** (as bordas das células — ver
  "Captura dos ITENS" abaixo) e, sem grade, remontada **por posição de coluna** (número/código/unidade/valores na
  **âncora**, `nearestByY`; o código quebrado em 2 linhas é rejuntado). Ambos → mesmo `DfdParseado`.
- **Descrição ILIMITADA por item (crítico) — casada pela BORDA da célula, nunca truncada (inclui QUEBRA DE
  PÁGINA):** a âncora (nº/código/valores) fica no **MEIO da célula**, então a descrição tem linhas ACIMA e ABAIXO do
  número. Casar por `nearestByY` truncava (as últimas linhas vazavam para o próximo item). Agora a descrição é casada
  pela **borda REAL da célula** = um vão entre linhas de descrição que **excede um limiar ADAPTATIVO** `LIM`.
  `LIM = max(entrelinha*1.3, entrelinha+2)`, com a **entrelinha = o MENOR vão RECORRENTE** (≥ 2 ocorrências e ≥ 5% dos
  vãos, acima de 0,9× o corpo da fonte; vãos por LINHA VISUAL) — a antiga mediana errava num DFD com muitos itens de 1
  linha e um item enorme (a borda sumia e a descrição vazava). Nos PDFs reais a entrelinha é ~8,1 e as bordas ≥ 11,7.
  **Same-page:** `cutsPorPagina`+`itemPorCuts`; com VÁRIAS bordas possíveis (linha em branco na descrição) vale a que
  deixa o item **SIMÉTRICO em volta do nº** (célula centralizada — o padrão; só vira "nº no topo" com evidência), sem
  nenhuma, a posição simétrica. **QUEBRA DE PÁGINA (`topCutPorPagina`):** acima do 1º número de uma
  página de continuação há DUAS coisas — a **cauda** (continuação) do último item da página anterior E a **cabeça** do
  1º item desta página (número no meio → cabeça acima). Andando do 1º número para cima, a cabeça é a parte contígua
  (vão ≤ LIM); o 1º vão > LIM é a borda: acima dela = item anterior, abaixo = cabeça do 1º item. Sem borda ⇒ o item
  anterior terminou antes ⇒ tudo é cabeça do 1º item (não rouba). Uma **página SEM número** (descrição ocupa a página
  inteira) é continuação integral do último item anterior — valendo para TODAS as colunas (o "0" de um código que
  virou a página fica no item de cima, nunca vira zero à esquerda do próximo). Na mesma página, código/unidade/valores
  seguem em `nearestByY` (na âncora). Validado contra o **Protocolo FMC.pdf real (79 págs, 18 DFDs, 329 itens): 0
  truncadas, 0 vazamentos**.
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
- **Captura dos ITENS — o PADRÃO DEFINITIVO do DFD (crítico; "é proibido errar a captura"):**
  - **GRADE DESENHADA (`src/lib/grade-pdf.ts`, puro):** o PDF do Centi desenha **cada célula** da tabela como um
    retângulo (borda + zebra). `PdfDoc.pageRender(p)` (o MESMO `getOperatorList` do texto renderizado) devolve os
    **traços retos** da página (`tracosDaOpList`, rastreando a CTM/Form XObject; clip, curvas e o desenho das
    ANOTAÇÕES — aparência de assinatura/carimbo — fora); `montarGrade` tira as **COLUNAS** das bordas verticais em volta
    de cada RÓTULO do cabeçalho (só as que COBREM a faixa dos rótulos — um risquinho de carimbo achatado não vira borda)
    e, por página, as **LINHAS** da tabela
    (bordas horizontais que cobrem ITEM e DESCRIÇÃO, fechadas pelas divisórias — exclui cabeçalho do documento, rodapé,
    total mesclado e quadros das seções). `itensPelaGrade` põe cada trecho na **célula exata** (linha × coluna): uma
    linha = um item; célula que ATRAVESSA a página junta as partes (sem nº no topo da página = cauda do anterior; sem
    nº no fim = cabeça do item cujo nº está na página seguinte); linha sem nº/código/descrição (subtotal) não é item;
    linha só com unidade/valores no TOPO da página = cauda (valor que virou a página);
    linha sem nº no meio da página vira item próprio (`item: null`, nunca mistura). **Validações** → se a grade não
    explica o corpo (trecho fora das linhas ou DENTRO da tabela sem coluna, nº em 2 linhas = borda faltando, nº de
    itens ≠ do texto), cai na
    **geometria do texto** (acima). `parseDfdFromPdfItems(items, nome, render, tracos)` — `lerTabelaItens` expõe `viaGrade`.
    Validado no `pd101820` real: **15/15 DFDs pela grade, 72 itens idênticos**.
  - **Varredura precisa (`lerTabelaItens`):** cabeçalho de coluna = trecho EXATO "ITEM" + QUANTIDADE/QTD (uma descrição
    que cita "item … quantidade" não some); **TOTAL GERAL** = rótulo próprio na ÁREA DOS VALORES ("…o valor total…" na
    descrição fica) — o VALOR do total ≥ R$ 10 mi QUEBRA em 2 linhas na célula mesclada (uma parte acima e outra abaixo
    do rótulo, ±½ entrelinha): linha só com números na coluna VALOR TOTAL a até 6pt do rótulo = PARTE DO TOTAL (juntas
    antes de converter; antes o pedaço caía no corpo, a grade era descartada e o total perdia as casas); **rodapé** na
    forma COMPLETA do Centi em QUALQUER posição (`ehRodapeCentiNorm`: "Centi … e-Assinatura", "Emitido em dd/…",
    "Emitido por usuario.nome", "Página N de M") e as formas curtas ("Página 2", "Página 1/2", "Emitido por admin" —
    `ehRodapeNorm`/`ehRuido`) só à MARGEM, sempre sem nº — uma linha de descrição "PÁGINA 12", "CENTÍMETROS…",
    "PÁGINA 3 DO…", "EMITIDO EM DUAS VIAS" ficam; **apoio** só à MARGEM;
    cabeçalho de coluna repetido DEPOIS de um "apoio" = a tabela continua (era rodapé não reconhecido — não perde
    itens); **nº do item** CENTRADO sob o rótulo "ITEM" (o "12" de "12 MESES." à margem não vira item; pedaços "1"+"2" =
    12; "1."/"01" valem; sem nenhum nº assim — ou quando só a varredura LIVRE deixa a GRADE explicar o corpo (nº
    alinhado à esquerda: "1" falhava e "12" passava), ou, sem grade, quando ela acha MAIS nº em ordem crescente e não só
    um nº solto depois do último — qualquer nº da coluna ITEM, de outro emissor).
  - **Montagem (`montarItem`):** **CÓDIGO = só os dígitos, na ordem** (`codigoDoItem`: "524194727" ⏎ "0" =
    "5241947270", TAB/espaço/pontuação no meio somem, **zero à esquerda preservado**, NFKC); **DESCRIÇÃO limpa**
    (`limparDescricaoItem`: sem marcadores de lista •/‣/▪/➢/✓/◆… nem o do Word em fonte Symbol, sem TAB/NBSP/largura
    zero; ficam ², °, ®, §, →); **UNIDADE** com as linhas juntas ("SERVIÇO MENSAL"); **VALORES** com os pedaços juntos
    ANTES de converter ("1.234.567," ⏎ "8912" = 1.234.567,8912 — antes perdia as casas) por **`numeroDfd`** (pt-BR;
    "1.000" só com ponto = MIL; a célula tem de trazer UM número — "100 M3" = 100, mas "100 200"/"10-20" = ambíguo ⇒
    `null`, pendência visível, nunca valor inventado). No fallback (sem grade): número alinhado à direita vai p/ a coluna
    do rótulo cuja borda DIREITA está mais perto; a UNIDADE só vale CENTRADA sob o rótulo (trecho da descrição depois
    de um TAB não vira unidade); código/unidade/valores = TODAS as linhas na ÂNCORA do nº (raio ≈ 1,2 entrelinha — as
    duas partes de um valor quebrado, qualquer que seja a mais perto; um nº solto longe não entra); "nº no topo da
    célula" só com 3+ votos; o topo da página de continuação escolhe a borda que deixa o 1º item SIMÉTRICO (linha em
    branco na cabeça não vira borda).
  - **Texto limpo em TODA captura (`limparTexto`, `normalize.ts`):** `normalizar` (PDF) e as células do `.xlsx` —
    tira controles/Cf (largura zero, hífen suave, BOM, bidi)/U+FFFD; TAB/NBSP/NEL/quebras/espaços Unicode = 1 espaço;
    NFC (acento composto); Windows-1252 lido como Latin-1 volta só à PONTUAÇÃO (– — “ ” ‘ ’ • … € ™ — letras
    estrangeiras Š/Œ/Ÿ/ƒ do 1252 somem: lixo, não conteúdo); caractere de USO PRIVADO (fonte Symbol/Wingdings sem mapa
    Unicode, que a tela mostrava como quadrado): o MESMO código é símbolo na Symbol e marcador na Wingdings — volta ao real
    só o que não colide com marcador (± ≥ ≤ ° × ÷ ≠ ≈ √ ′ ″ Δ Ω α β δ ε φ γ e setas; "µ" só antes de unidade: µm, µF);
    o resto (⧫ ● ■ ❖ ➢ ✓ ▪…) e os desconhecidos = "•" (sai da descrição). Atalho p/ texto Latin-1 comum (desempenho).
  - **`.xlsx`:** números pelo **valor CRU** da célula (o texto de "#,##0" sai "1,000" em en-US — era lido como 1);
    código pelo texto formatado (zeros à esquerda) ou pelo inteiro cru quando o texto veio em notação científica
    ("5.24195E+11" virava "52419511"; sem o cru ⇒ `null`, nunca inventa); linha SEM nº no MEIO da tabela não a encerra
    (só descrição = continuação do item anterior; com código/valores = item próprio); nº "1.0"/"01" vale.
  - **Testes:** `tests/fixtures/dfd-centi.ts` (gerador no LEIAUTE EXATO do Centi — texto + grade), `parse-dfd-captura`
    (o PRINT: código 524194727/0 + descrição enorme com marcadores/TAB/Symbol entre 30+ itens curtos, linhas que citam
    rodapé/total, linha em branco, valor/unidade quebrados, 100 itens multipágina, célula que atravessa a página, código
    que vira a página, grade inválida → texto, nº não centrado, rodapé desconhecido, TOTAL ≥ R$ 10 mi quebrado, risquinho
    vertical no cabeçalho, rodapé fora da margem, trecho após TAB, linha em branco no topo da página — **cada cenário
    nas DUAS vias**),
    `grade-pdf`, `parse-dfd-comum`, `normalize`, `parse-dfd` (planilha com valores crus). Escala: 5.000 itens em ~0,3 s.
- **Tela "Mesa"** (ex-"DFD"; `/painel/mesa` = `MesaPage` → `DfdsView`, aba **`dfd`** intacta — `/painel/dfds` **redireciona** p/ bookmarks; nav/label "Mesa" em `abas.ts` → `NAV_MODULOS`, a MESMA fonte da sidebar e da `BottomNav`; `/painel` leva à Mesa) — separada do PCA. `PcaModuleView` ficou só com
  **Planilha (PCA)** + **PCA** (o seletor de "Gerar PCA" recebe TODOS os DFDs). A tabela de DFDs (`DfdsView`) tem
  **filtro/ordenação em todas as colunas** (cada uma com `value`) e **somatório de itens e valores** no rodapé,
  reativo aos filtros (`DataTable` `resumo={(linhas)=>…}`). Migração `0015` concede a aba `dfd` a quem já tinha `pca`.
  - **BARRA DA MESA (uma linha) + visão ÚNICA com `Segmented` + morph:** à esquerda, UM `Segmented` (`vista`) com o
    **Dashboard** primeiro — item SÓ-ÍCONE (`soIcone`, `IconDashboard`; nome acessível "Dashboard de governança") — e
    **Protocolos · DFDs · Itens** (na Mesa do PCA, sem o Dashboard e com a `ferramenta` Todos | Enviados | Incorporados
    logo depois); à DIREITA, o **REVERIFICAR TUDO** (o `BotaoAtualizar` com andamento — o ícone gira dentro de um ANEL que enche com o andamento: zera os caches das conferências, os itens e o histórico do Dashboard, recarrega a lista e reconfere TODOS os protocolos, DFDs e itens em qualquer visão; termina com o aviso do total; não grava nada), o botão **DADOS COMPLETOS** (`BotaoDadosCompletos`, só o ícone `IconTextoCompleto`, accent quando
    ligado; fora do Dashboard) e os **filtros de hierarquia** (abaixo). **Dados completos:** o provedor `DadosCompletos` (em volta
    das visões — os banners e o Dashboard ficam de fora) faz as células mostrarem TUDO dentro da própria tabela: `CelulaTexto`
    (descrição e assunto sem o corte de uma linha; na Consolidada as descrições diferentes numeradas D1, D2…), `CelulaLista`
    (todos os valores, sem o "+N") e `EstadoResumo` (todos os problemas); a linha cresce. A escolha é PREFERÊNCIA do usuário
    (`preferencias_tabela`, chave `PREF_DADOS_COMPLETOS` = `mesa:dados-completos` → `{ligado:true}`; desligar apaga a linha),
    carregada no servidor por `carregarMesa` (`dadosCompletos` — a Mesa já ABRE assim, sem piscar; a principal e a do PCA);
    gravada na hora pelo `PUT`/`DELETE /api/preferencias/tabela` (sem rede, vale na sessão). Alternam as visões no **MESMO espaço**, com transição
    `animate-cat-morph` (`<div key={vista}>` remonta e replaya). **Importação NA TABELA:** o botão **"Importar protocolo"**
    (visão Protocolos) / **"Importar DFD"** (visão DFDs) fica no **RODAPÉ da tabela, à esquerda do seletor de linhas**
    (`DataTable.acoesRodape`, `Button size="sm"`; no celular o rótulo encolhe para "Importar" — o nome acessível segue
    inteiro); os DOIS formulários (`ProtocoloUploadForm`/`DfdUploadForm`) ficam montados FORA da tabela, em QUALQUER visão
    (Mesa principal, editores) — cada botão só incrementa o SEU contador `iniciar` (`abrirProto`/`abrirDfd`; o MESMO mecanismo
    do reenvio/sobrescrita: cada valor novo abre o lançador) — então recarregar/filtrar a lista, trocar de visão ou abrir o
    Dashboard nunca perde uma importação em curso (e o `ProtocoloUploadForm` que DESMONTA no meio da leitura PARA na página
    seguinte — `indexarProtocoloPdf(…, cancelado)` —, descarta o PDF e libera o OCR — `vivoRef`); FECHAR a análise (ou
    concluir a protocolação) libera o índice, os DFDs lidos e as cópias dos arquivos (`fechar` → `resetCache` +
    `setIndex(null)` — o form segue montado, nada fica na memória); as duas importações podem correr JUNTAS (o worker do OCR
    é único e o `encerrarOcr` ENTRA NA FILA — ver OCR); os forms não renderizam nada no fluxo (lançador/análise/avisos são
    modais e avisos flutuantes). A tabela aparece SEMPRE (sem linhas, `DataTable.vazio` diz por quê: "Nenhum protocolo… use “Importar” no
    rodapé da tabela" / o filtro de hierarquia / "Carregando itens…") — o botão nunca some; no CELULAR o rodapé das tabelas
    da Mesa GRUDA acima da navegação inferior (e da barra de seleção) — o "Importar" e a paginação ficam sempre ao alcance
    (e os avisos flutuantes sobem acima desse rodapé — `--rodape-tabela` — no celular e no desktop).
    **ALTURAS PADRONIZADAS (mais informação na tela):** a barra inteira — o `Segmented` das visões e os filtros — mede
    `--h-control-sm` no desktop (segue a densidade do ADM; 44px no celular) e as TRÊS visões usam a MESMA densidade
    **compacta** (`DataTable density="compact"`: TODA linha na altura dos controles, com ou sem controle na célula —
    `SeletorCelula` e as ações de linha `Button size="xs"` cabem nela no desktop e têm 44px no celular — e o cabeçalho
    ("tópicos") baixo; a descrição do item em UMA linha, o texto inteiro na dica — ou na própria célula com os DADOS COMPLETOS ligados). Sem os cabeçalhos redundantes
    "Protocolos (N)"/"DFDs importados (N)" (a contagem fica no rodapé `resumo`). Tabela de **Protocolos**: **Estado**
    (AGREGADO — abaixo) · **Situação** (dropdown na célula — `SeletorCelula`) · **Responsável** (na célula, o `SeletorPessoa`
    variante `celula`: foto + apelido, a lista com foto e busca) · **Distribuição** (quem
    protocolou) · **Data** (data/hora da PROTOCOLAÇÃO — `criado_em` em Brasília, `dataHoraBR`/`dataIsoBrasilia`) · Nº processo
    · Id · Assunto · Unidade · **PCA** · DFDs · Itens · Valor; **DFDs** (`PlanilhaDfds`) ganham **Prioridade** e **PCA**; **Itens**,
    **PCA** (depois do Protocolo) e **Prioridade** (depois da Sigla). **PCA** = o ANO do PCA (o nome do PCA cadastrado na dica —
    `CelulaPca`), o do PROTOCOLO de origem (sem ele, o do próprio DFD; o item segue o DFD) — só na Mesa principal (a do PCA é de
    um PCA só). **Prioridade** = a seção PRIORIDADE normalizada (ALTA/MÉDIA/BAIXA — `CelulaPrioridade`; "—" = ausente ou fora do
    padrão), lida NO BANCO só a seção (`prioridadeTextoSql`, `dfd-sql.ts`: `json_each` sobre `secoes` com `json_valid` — JSON
    inválido não derruba a lista) → `DfdResumo.prioridade`; o item herda a do DFD (junção no cliente por `dfdId`); os banners
    do protocolo (análise e gravado) mostram a MESMA coluna (`prioridadeDoDfd(secoes)`). No celular os filtros (só ícone)
    cabem na linha das visões (descem juntos quando não cabem); todos os alvos da barra têm ≥ 44px.
  - **Gestão do protocolo (migração `0031`, aditiva):** **Situação** = SÓ as cadastradas pelo ADM em **Configurações →
    Situações** (`SituacoesAdmin`: nome + cor + ordem ↑/↓; excluir deixa os protocolos dela SEM situação, avisando quantos;
    tabela `protocolo_situacoes`, `src/lib/situacoes.ts`, rotas `/api/admin/situacoes*` com `exigirAdmin` + auditoria
    `situacao_protocolo`) — a antiga situação derivada (Vazio/Com DFDs) foi EXCLUÍDA. **Responsável** = a pessoa designada
    (`dfd_protocolos.responsavel_id`) — **SÓ entre as PESSOAS DO GRUPO ativo** (usuários ativos membros do grupo;
    sem grupo, ex.: admin sem grupo ⇒ todos os ativos — `listarPessoasDoGrupo`/`pessoaDoGrupo`, `src/lib/usuarios.ts`): na
    célula, na massa e no Perfil; o servidor recusa outra pessoa (`PATCH /api/protocolo/[id]`, massa, preferências) e o
    padrão só entra na protocolação se ainda for do grupo (`responsavelPadraoDe`). Quem já está gravado e hoje é de outro
    grupo continua visível (diretório `pessoasPorIds` → `SeletorPessoa.atual`, sem re-escolha); salvar de novo o MESMO padrão
    no Perfil (hoje fora do grupo) não é recusado. O filtro/ordem das colunas usa "apelido — nome" (dois "Ana" não se fundem). Ao protocolar, entra o
    **responsável PADRÃO** que quem protocola escolheu no **Perfil → Protocolação** (`usuarios.responsavel_padrao_id`, `PATCH
    /api/perfil/preferencias`) — só num protocolo ainda sem responsável (`COALESCE` no upsert; o reenvio mantém).
    **Distribuição** = `criado_por` (quem protocolou). **Foto + APELIDO nas colunas (migração `0032`):** `usuarios.apelido`
    (Perfil, ≤ 40, `normalizarApelido`) é o NOME DE EXIBIÇÃO no sistema (`nomeExibicao`, `src/lib/pessoa.ts` puro: cabeçalho,
    colunas, seletores; o valor de filtro/ordem das colunas é "apelido — nome", `rotuloOpcaoPessoa`; as opções dos seletores,
    `opcoesPessoa`); as células mostram o
    **`PessoaTag`** (avatar com a FOTO + apelido; nome completo no `title`) e TODO seletor de uma pessoa da Mesa e do Perfil é o
    **`SeletorPessoa`** (a lista com a FOTO + o APELIDO de cada um — o nome completo embaixo quando difere —, o próprio usuário
    primeiro com "(eu)", busca por apelido ou nome, teclado ↑/↓/Enter/Esc, 44px no toque; gravando, o gatilho fica travado
    com o spinner e o foco nele). A foto é servida por **`GET
    /api/usuarios/[id]/foto`** (`decodificarFoto`; cache `immutable` pela versão `?v=` = `atualizado_em` — `urlFoto`): a
    sessão, a Mesa e a lista de usuários carregam só a URL (nunca o data-URL — a sessão é lida em toda requisição). As duas
    células — Situação = **`SeletorCelula`** (`<select>` nativo transparente — leve com milhares de linhas, seletor do próprio
    celular) e Responsável = **`SeletorPessoa`** (`celula`: o painel só existe aberto — a lista e as fotos não pesam nas
    linhas) — não abrem a linha ao serem tocadas, gravam na hora
    (`PATCH /api/protocolo/[id]` com `origem:"celula"`, otimista com reversão) e também vão pela edição em massa
    (`BarraEdicaoMassaProtocolos` → ações `responsavel`/`situacao` do `POST /api/protocolo/massa`). Não-editores veem só o texto.
  - **Estado AGREGADO do protocolo:** a célula ACUMULA todos os problemas do processo — a conciliação da capa
    (`conciliacaoCapa`), "Sem DFDs" e os erros/atenções de CADA DFD e dos seus itens (a MESMA conferência por linha,
    `avaliarLinhaDfd`), agrupados por problema com a quantidade de DFDs (`avaliarProtocolo`, `conferencia-dfd.ts`, puro):
    erro › atenção › regular, rótulo do principal com a contagem ("Sem prioridade (3)"), `+N` e tooltip com a lista (DFDs
    por nº + planejamento). Calculado no servidor (`POST /api/protocolo/conferencia`, fatias de ≤ 50 protocolos / ~150
    DFDs, com os DFDs COMPLETOS e as unidades reais), lazy com "Conferindo…" e CACHE pela chave `chaveProto` (gravar a capa
    ou qualquer DFD muda a chave). A coluna é multi-valor (o filtro acha QUALQUER problema do protocolo).
  - **Filtros de HIERARQUIA da Mesa (na MESMA linha de Protocolos · DFDs · Itens, à direita):** dois filtros SÓ COM O ÍCONE
    (quadrado na altura da barra; ativo = accent; o valor na dica e no nome acessível) — **Responsável** = o **`SeletorPessoa`**
    (variante `filtro`: escolhida uma PESSOA, o quadrado mostra a FOTO da pessoa; "Todos" = `IconUsers`, "sem responsável" =
    `IconUserX`; a LISTA mostra a FOTO + o APELIDO de cada um, o próprio usuário primeiro com "(eu)", busca por apelido ou nome)
    e **Assunto** = o `SeletorFiltro` (assuntos distintos dos protocolos) —
    **Responsável** (todos / sem responsável / uma pessoa) e **Assunto** — filtram as
    TRÊS visões e o Dashboard (o DFD e o item herdam os do protocolo de origem; `DfdResumo.protocoloResponsavelId`). A Mesa
    ABRE com o responsável escolhido no **Perfil → Mesa** (`usuarios.mesa_responsavel`, migração **`0037`**, aditiva: `eu` =
    só os protocolos do usuário — o PADRÃO, NULL —, `todos` = geral, `sem` = os sem responsável; `filtroInicialMesa`/
    `coerceMesaResponsavel`; o usuário entra sempre no diretório de fotos da Mesa; na Mesa do PCA abre com todos), núcleo
    puro **`mesa-filtros.ts`**
    (`passaFiltroMesa`/`opcoesAssuntoMesa`). Enquanto ativos, **travam** as colunas Responsável/Assunto da tabela de
    protocolos (`Column.travado` do `DataTable`: cadeado + o motivo; o filtro da coluna sai de uso) — a hierarquia manda.
  - **EDIÇÕES DA TABELA na Mesa (e na Mesa do PCA):** as QUATRO tabelas — Protocolos, DFDs (`PlanilhaDfds.edicoes`), Itens e
    Consolidada — têm a MESMA edição do Comparativo do orçamento (`DataTable.edicoes`): o LÁPIS no rodapé liga a edição NO
    CABEÇALHO (arrastar a coluna com a sombra do destino, congelar — `sticky` pela largura REAL, até ~60% da largura visível —,
    ocultar, ordenar ▲/▼, largura pela borda) e **Salvar** guarda colunas + a ORDENAÇÃO + os FILTROS das colunas (os filtros
    externos da Consolidada ficam de fora) — só para o usuário ou PÚBLICA (todos usam, até como a sua padrão); a estrela marca
    a PADRÃO (a tabela ABRE nela, com os filtros e a ordem). Chaves `mesa:<tabela>` e `mesa-pca:<tabela>` (as colunas diferem);
    carregadas no servidor por `carregarMesa` (`carregarEdicoes`) e guardadas no `DfdsView` (trocar de visão remonta a tabela,
    que volta com as edições novas — `EdicoesDaTabela.onMudar`). Sem migração (a `edicoes_tabela` da `0041`).
  - **DASHBOARD DE GOVERNANÇA da Mesa (o ícone à esquerda das visões; só na Mesa principal) — MINIMALISTA:** `DashboardMesa` =
    5 KPIs (a Mesa AGORA: Protocolos na Mesa [+ a linha das 7 últimas semanas, domingo a sábado] · Valor na Mesa [Σ DFDs] ·
    **Conformidade** [% regular dos conferidos] · **Com responsável** · **Tempo médio na Mesa** [+ quantos há mais de
    `DIAS_ALERTA`=30 dias]) + a **BARRA DE MÉTRICAS** (`BarraMetricas`; SÓ a execução da Mesa — nada de PCA, orçamento, tarefas ou
    calendário): **Período** = o seletor de período do sistema (`PeriodoPicker`: o MESMO `PeriodoCorpo` do filtro de datas das
    tabelas, SEM a ordenação — Todo o período | Hoje | Esta semana [domingo a sábado] | Este mês, o ano, os meses e o intervalo
    DE/ATÉ + Limpar; os anos = os com protocolação + o atual, `anosComDados`) · **Dado** · **Medida** (`SelectField compacto`) +
    Ajuda (?); no celular, o período + a ajuda numa linha e Dado e Medida em linhas próprias — lado a lado a partir de 400px (os
    rótulos inteiros). Embaixo, a linha do recorte (a janela — "Este
    mês (01/09 a 30/09/2026)" — · protocolos · DFDs · itens · valor · correções · ações) e o aviso do FOCO. Abaixo, **UM gráfico**
    (`ChartCard` "{Medida} por {dado}", o total à direita; trocar o Dado replaya o morph): o **Dado** escolhe as barras —
    Responsável · Quem protocolou · Natureza (a categoria do assunto + o ano do PCA: "INCLUSÃO 2027") · Tipo de DFD · Situação (as
    do ADM, na ordem e na cor dele) · Estado (o AGREGADO da conferência, nas cores das importâncias do ADM) · Unidade (requisitante
    dos DFDs, pelo ID — a sigla pode repetir entre órgãos) · Tempo na Mesa (0–7/8–15/16–30/31–60/61–90/90+ dias + "Sem data") ·
    Data (`Colunas`: até 31 dias = dias, até 98 dias = semanas de domingo a sábado, até 36 meses = meses, acima = anos — num
    período de mais de 36 meses, só do 1º ao último dia com dado, nunca colunas vazias sem fim; o balde de hoje em destaque; o
    valor em cada coluna só quando cabe; o sem data fica FORA, com nota) —; a **Medida**, o tamanho: Protocolos · DFDs · Itens · Valor ·
    **Correções** (os REENVIOS, pela data do reenvio) · **Ações** (a execução, pela data; nos Dados de pessoa, por QUEM FEZ —
    "Ações por quem executou"). Pessoas e unidades pelo valor (10 maiores + "Outras N" — contada UMA vez; "Sem …" por último);
    domínios fechados (tipo, situação, estado, tempo) com as barras fixas, zeradas também (esmaecidas, não abrem nada); sem nada na
    medida, o quadro diz o quê ("Nenhum DFD no período", "Sem valor na Mesa"…); Tipo de DFD e Unidade vêm
    dos DFDs do protocolo — DFDs/itens/valor se dividem, protocolos/correções/ações contam em cada barra e UMA vez no total (nota
    no gráfico). Abaixo, o **DESEMPENHO POR PESSOA** (`DataTable` compacta, GOVERNANÇA PRIMEIRO: protocolos, regulares %, com
    erro, em atenção, **correções** — os reenvios dos protocolos da pessoa —, **ações** — a execução feita pela pessoa; "—" na
    linha sem pessoa —, tempo médio, +30 dias e, no fim, DFDs, DFDs com erro, itens e valor). A **pessoa** (o papel) segue o Dado:
    "Quem protocolou" → a Distribuição; os demais → o Responsável (o desempenho, o foco e o aviso seguem o mesmo papel). **FOCO =
    o Responsável do topo** (regra de ouro, coberta por teste: **filtrar pela pessoa = a linha da pessoa na visão da equipe, no
    papel**): as KPIs seguem as listas filtradas (a Mesa agora), mas as métricas usam o **UNIVERSO** — a Mesa só com o Assunto do
    topo (`DfdsView.dash` mapeia UMA vez; sem foco, os mesmos arrays) — com o foco no papel: numa pessoa pelo Responsável, os
    protocolos pelos quais responde; por Quem protocolou, os que PROTOCOLOU; "sem" = os sem responsável. As **ações** de cada
    pessoa contam em toda a Mesa (nunca dependem desse filtro); quem SÓ executou ganha barra/linha apenas na visão da equipe; no
    foco "sem", só as de quem já tem linha (`atoresContados`) — pelo Responsável, ninguém ("as ações são de quem as fez"). Datas:
    protocolos pela PROTOCOLAÇÃO (dia de Brasília), correções/ações pela data do EVENTO; DFD sem protocolo e protocolo enviado a
    um PCA ficam fora das métricas. Toda barra/linha abre a **ORIGEM** (`OrigemDados`: os protocolos com o valor na medida, ou os
    reenvios/ações com quem e quando; Σ = o número tocado; a linha do desempenho lista os protocolos da pessoa com o R$). Núcleo
    PURO/testado **`mesa-metricas.ts`**: `recorteMetricas(…, {intervalo, papel, hoje, foco})` = a fonte única (trocar a Medida,
    ou o Dado dentro do mesmo papel, só refaz o gráfico; um protocolo por id): base [o foco — `noFoco`], coorte [+ o período — `noIntervalo`], o dia de
    Brasília de cada protocolo, os reenvios e as ações do período; `graficoMetricas(rec, dado, medida, situacoes)` monta as barras
    e a `origem(chaves)` de UMA lista de lançamentos (Σ = a barra — testado em TODO Dado × Medida × período × foco; o total é o
    mesmo em todo Dado e bate com o resumo); `baldesData`, `tituloGrafico`, `desempenhoPorPessoa`/`protocolosDaPessoa`,
    `resumoMetricas`, `anosComDados` + **`periodo.ts`** (`intervaloDoPeriodo` com o hoje de Brasília, `noIntervalo`,
    `rotuloPeriodo`, `textoIntervalo`) + **`mesa-dashboard.ts`** (`painelMesa` = só os KPIs, `agora` injetado; dias de CALENDÁRIO
    de Brasília via `dataIsoBrasilia`, que guarda o dia de cada timestamp — recalcular não refaz a conversão de fuso), sobre as listas JÁ carregadas (`protocolosF`/`dfdsF` nas KPIs, o universo nas métricas + a
    gestão otimista + `dfdsComErro`/`dfdsEmAtencao` da conferência agregada, que cobre TODOS os protocolos) e o
    **HISTÓRICO DE EXECUÇÃO** — `GET /api/mesa/execucao?ano=` (`execucaoDaMesa`; builder **`mesa-execucao-sql.ts`**, testado pelo
    driver D1 real): a `auditoria` SÓ dos protocolos da Mesa (o MESMO escopo das listas: fora de um PCA, unidade ativa, PCA do
    cabeçalho), agregada por protocolo, pessoa, dia (Brasília) e tipo — `reenvio` (`origem='reenvio'`; nas linhas antigas, o
    "REENVIADO" do resumo) e `acao` (editar/excluir no banner, em massa, na tabela, vínculo, exclusão e as antigas sem origem +
    a sobrescrita de DFD; a protocolação e as gravações dela não contam); o protocolo das linhas antigas pelo `entidade_id`/DFD
    atual, como no `historicoProtocolo`. Pedido SÓ com o Dashboard aberto e guardado no `DfdsView` até a lista recarregar;
    falhar não derruba nada (o gráfico e a linha do recorte oferecem "Tentar de novo"). O filtro das métricas também mora no
    `DfdsView` (sobrevive às trocas de visão); o efeito da conferência agregada roda também com o Dashboard aberto (mesmo
    cache). Gráficos em HTML por token (`charts/Barras`: `BarrasH`, `Colunas` — marcas finas, texto em tokens de texto, dica no
    hover/foco/toque; o eixo das colunas rotula no máximo ~8 e a margem cabe o rótulo em R$; a coluna zerada só mostra a dica). O código do Dashboard é carregado SOB DEMANDA (`next/dynamic`,
    `ssr:false`, `DashboardMesaEsqueleto metricas` — a mesma grade) — a Mesa não baixa gráficos à toa. A conferência agregada
    roda com Protocolos OU Dashboard abertos (`precisaConfProto` — alternar entre os dois não reinicia as requisições) e uma nova
    tentativa dos que falharam volta a "Conferindo…" na hora; na KPI de conformidade, "conferindo" (em curso) e "não conferido"
    (falhou — recarregue) aparecem separados, e o progresso conta só os PRONTOS ("conferindo 5 de 10… · 2 não conferidos").
  - **Visão "Itens"** = lista PLANA de TODOS os itens dos DFDs em escopo (Estado · Protocolo · [PCA] · **Nº Plan.** · Nº
    DFD · Sigla · **Tipo** · Prioridade · Item · Código · **Catálogo** · Descrição · Unidade · Qtd · Vlr. unit. · Vlr. total — o nº
    de planejamento e o tipo são os do DFD de origem, na MESMA ordem da planilha de DFDs: `ItemDfdRow.dfdPlanejamento`, lido
    na mesma consulta, e `dfdTipo` — as MESMAS colunas `colunaPlanejamento`/`colunaTipoDfd` de `PlanilhaDfds.tsx`, vazio ou
    fora do padrão = "—" filtrável, via `planejamentoDfd`/`tipoCurtoDfd`; o banner do ITEM mostra no cabeçalho o
    **`ItemCabecalho`** = "Item N" + `DfdCabecalho` com tipo e planejamento, o MESMO da consulta pública), carregada
    **SOB DEMANDA** (lazy) na 1ª abertura via
    `GET /api/dfd/itens` → `listarItensDfds(reparticaoId?)` (escopo por unidade, como `listarDfds`); o cache é
    invalidado quando os DFDs recarregam (após import/edição). A coluna **Catálogo** vem do SERVIDOR na mesma resposta:
    `conformidadeDosItens` (`catalogo.ts`) confere cada item com o tipo do DFD de origem (`ItemDfdRow.dfdTipo`) e devolve
    o veredito COMPACTO (`ConferenciaCompacta` — sem a descrição do catálogo; catálogo vazio/sem código ⇒ `null`); a
    célula é a **`CelulaCatalogo`** (`EstadoCelula.tsx`, a MESMA da tabela de itens do `DfdView`), na cor do nível do ADM.
    Com o cadastro da **PADRONIZAÇÃO** (Catálogo → Unidades de medida | Classificações — ver a seção própria; vem na MESMA
    resposta dos itens, `padronizacao`), mais duas colunas, só quando o cadastro correspondente existe: **Classificação**
    (depois de Catálogo — a automática) e **Unid. cadastrada** (depois de Unidade — a unidade cadastrada que a do item
    representa, ou "Não cadastrada"). Com o **HISTÓRICO DE COMPRA** (Catálogo, tipo Histórico — mesma resposta, `historico`),
    a coluna **Histórico** (depois de Vlr. unit.): o desvio do valor do item em relação ao valor atual do histórico (ver
    "COMPARAÇÃO COM OS ITENS DAS MESAS").
  - **Itens NORMAL | CONSOLIDADA (sem consulta nova ao banco):** só na visão Itens, um 2º `Segmented` (`modoItens`,
    ariaLabel "Visão dos itens") ao lado do das visões — na Mesa principal E na do PCA — alterna **Normal** (um item por
    linha, a tabela acima) e **Consolidada** (a `key` do morph inclui o modo — troca com a MESMA transição). A Consolidada
    é UMA linha por **CÓDIGO** (só os dígitos — `normalizarCodigo`; item SEM código não consolida, fica numa linha
    própria), calculada no cliente SÓ com ela aberta, pelo núcleo PURO **`itens-consolidados.ts`** (testado, linear — 20
    mil itens; um código com 300 mil preços sem estourar a pilha): `consolidarItens` (quantidade SOMADA; **valor unitário
    MÉDIO PONDERADO** pela quantidade = Σ qtd×vu ÷ Σ qtd dos itens com quantidade E preço > 0 — entre eles, qtd × médio = o
    valor deles; quantidade vazia, ZERADA ou negativa e preço vazio/zero ficam FORA da média e são contados —
    `semQuantidade`/`semValor`/`foraDaMedia`, nunca NaN; menor/maior preço; **variação** = coeficiente de variação
    amostral, faixas `FAIXAS_VARIACAO` ≤ 25% ok · ≤ 50% atenção · acima alerta; **por UNIDADE** (`porUnidade`, UN = UNIDADE
    por `normUnidadeMedida`): com unidades diferentes (`unidadesMistas`) a variação da linha é a MAIOR dentro de uma mesma
    unidade — preço de caixa não se compara com o de unidade; **curva ABC** pela participação acumulada ANTES da linha
    sobre a soma dos totais POSITIVOS — `LIMITES_ABC` 80%/95%; ordem pelo valor, empate pelo código, sem código no fim;
    descrições/unidades distintas sem caixa/acento/espaço, a mais frequente primeiro), `mediaDeReferencia` (a média com
    que o preço de um item se compara — a da unidade dele quando mistas), `estadoConsolidado` (os problemas dos itens
    AGRUPADOS com a contagem — "Item sem valor (2)" —, erros primeiro), `distintos`, `varianteDescricao` (D1, D2…),
    `desvioDaMedia`/`desvioTexto`, `participacaoTexto` ("< 0,1%") e `textoResumoConsolidado` ("Copiar resumo", com a linha
    "Por unidade" quando mistas; o detalhe passa cada DFD pelo nº + planejamento — **`refDfd`**, `parse-dfd-comum.ts`, a
    MESMA referência dos despachos e relatórios: "1209 (Planej. 1509)"). **Filtros:** os de ATRIBUTO (Estado, Código, Catálogo, Descrição, Unidade, Nº Plan., Nº
    DFD, Protocolo, Sigla, Tipo, PCA, Prioridade, Seq. PCA) valem no nível do **ITEM, ANTES de consolidar** — `aplicarFiltros` sobre os
    itens com as MESMAS funções de valor da visão Normal (`atributoItem`, fonte única das duas visões; o código
    normalizado) —, então a linha soma só os itens que passam e **o total bate com o da Normal com os mesmos filtros**; as
    opções de cada um vêm dos itens que passam nos DEMAIS (conectados, sem ciclo) e chegam à tabela por
    **`Column.filtroExterno`**; os NUMÉRICOS (Qtd. total, médio, variação, total, itens) ficam na tabela e valem para a
    linha. Zeram ao sair da visão. Colunas (as da Normal, agregadas): [Seq. PCA] · Estado · Código · Catálogo (o veredito
    MAIS grave dos itens) · Descrição (+N — `MaisN`) · Unidade (mistas = ÂMBAR + ícone) · Qtd. total · Vlr. unit. médio
    (mistas = âmbar + ícone) · **Variação** (`CelulaVariacao`) · Vlr. total · **ABC** (`SeloAbc`) · Itens · Nº Plan. · Nº
    DFD · Protocolo · Sigla · Tipo (os 4 à vista) · [PCA] · Prioridade — as listas pela **`CelulaLista`** (primeiros + "+N"; dica até 30 por
    `dicaLista`; Seq. PCA inativo riscado) com os MESMOS valores das opções dos filtros (`atributoItem`) — "—" (esmaecido) =
    algum item sem o dado, ex.: um DFD sem planejamento, que é erro, não some atrás dos que têm). O que as células mostram é calculado UMA vez por lista (`infoConsolidados`,
    inclusive o rótulo do catálogo usado na ordenação). Rodapé = N códigos · M sem código · itens · total. SÓ leitura (sem
    seleção/massa — a edição é item a item; a seleção da Normal fica guardada). Tocar numa linha abre o
    **`ComposicaoItem`** (`Modal` full): 6 `StatMini` (quantidade, médio, menor e maior preço, variação, total + ABC),
    `Callout`s (unidades diferentes; itens fora da média), a quebra **"Por unidade de medida"** (qtd., médio, faixa e
    variação de cada uma), as descrições diferentes numeradas (D1…) e a TABELA das ocorrências com TUDO o que a linha
    resume — as colunas da Normal vindas da Mesa (`colunasAntes`: Seq. PCA, Estado; `colunasDepois`: Catálogo, PCA,
    Prioridade) + Protocolo · Nº Plan. · Nº DFD · Sigla · Tipo · Item · Unidade · Qtd. · "Vlr. unit. · Δ média" (o valor + o desvio dele da
    média — a da MESMA unidade quando mistas —, na cor da faixa; uma coluna só) · Vlr. total · [Descrição D1/D2 — só com
    descrições diferentes]; tocar numa ocorrência abre o banner do ITEM por cima (`setAberto` — a pilha da Mesa; Esc fecha o
    do topo primeiro). Recarregando os itens (após salvar), o detalhe segue a MESMA linha (pelo código) com os dados novos;
    se ela sumiu (o código mudou; a linha SEM código é o próprio item, que regravado ganha outro id), fecha — nunca por
    baixo de um banner aberto: só ao voltar à Mesa.
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
  - **Nº de planejamento obrigatório (`dfd.planejamento`, configurável, padrão `bloqueia`, NÃO editável — identificador
    do Centi):** DFD sem nº de planejamento (vazio/só espaços) fica com ERRO — célula Estado "Sem planejamento",
    mensagem no painel (âncora do bloco de identificação) e linha do despacho ("Informar o NÚMERO DE PLANEJAMENTO…
    corrigir no Centi e reenviar"); o servidor recusa no `start-dfd` (422) pela mesma `avaliarDfd`. O campo é
    OBRIGATÓRIO nos tipos de entrada (`EntradaAvaliacaoDfd`/`DfdConferencia`/`DfdConferivel`/`faltasCirurgicasDfd`) — o
    TypeScript obriga todo chamador a informá-lo (nunca falso positivo por campo omitido).
  - **Item REPETIDO (`item.duplicado`) — NUNCA bloqueia (regra do usuário):** mesmo código, mesma descrição **E** mesma
    unidade (`itensDuplicados`, chave código só-dígitos + `norm` da descrição + `normUnidadeMedida`; o mesmo código com
    descrição diferente — outro local, DFD 136 real — ou em outra unidade — UN × CX — é legítimo). O ponto só aceita
    `avisa`/`ignora` (padrão `avisa` = ATENÇÃO); um nível antigo "fundamental" gravado sai na leitura (`coerceRegras`
    descarta níveis cujo comportamento o ponto não aceita — o ADM salva sem erro). **Verificar:** a mensagem aponta os
    pares ("Itens repetidos: 7 = 114; 12 = 151"); a tabela de itens do DFD marca CADA repetido ("Item duplicado", âmbar,
    tooltip "mesmo código, descrição e unidade do item N" — `mensagensItem(it, repetido)`) e o põe na tabela de
    pendências junto do par; a visão **Itens da Mesa** marca igual (`repetidosPorDfd`, por DFD) — o filtro da coluna
    Estado junta todos. **Tratar:** o `ItemDetalhe` ganha o bloco **"Item repetido"** (os iguais lado a lado — qtd./
    unidade/valores —, "Ver item" e **"Unificar neste item"**: `unificarItensDfd` soma quantidades e totais no item e
    tira os outros; só com a quantidade e o MESMO valor unitário em todos — `motivoNaoUnificar`, senão diz por quê) +
    **"Remover item"** (`removerItemDfd`). O índice do item depois de remover outros: `indiceAposRemover`. Hosts: o
    `DfdPainelDireito` (análise avulso/protocolo, DFD gravado, protocolo gravado — `onUnificarItens` + `onPainel`) e o
    banner só do item (`useDfdGravado`, `useRepetidosDoItem` → `{lista, cor}` — a cor da importância do ADM). **Linear
    com milhares de iguais:** `mapaItensDuplicados` dá a cada índice o GRUPO compartilhado; as listas mostram até
    `MAX_IGUAIS` (10) + "+N" (`outrosDoGrupo`; `repetidosDoDfd`/`repetidosPorDfd` → `RepeticaoItem {iguais, total}`). Após
    "Unificar", o campo numérico destravado acompanha o valor novo (`NumInput` ressincroniza quando o valor muda de fora).
  - **Valor unitário AUSENTE = `semValorUnitario`** (vazio, zero, negativo ou NÃO numérico — NaN viraria `null` no JSON):
    a MESMA régua no cliente e no servidor.
  - **Conferência por LINHA única (`avaliarLinhaDfd`, `src/lib/conferencia-dfd.ts`, puro):** o ESTADO de cada DFD nas
    tabelas é DERIVADO das MESMAS mensagens do painel (`mensagensDoDfd`, agora no lib): algum erro ⇒ `erro`; senão alguma
    atenção ⇒ `atencao`; senão o ciclo (editado › regularizado › regular). Fora da linha só o **ano do PCA** (portão do
    protocolo) e o **catálogo** (lazy, ao abrir). Usada na ANÁLISE (`ProtocoloUploadForm`, com cache por objeto de DFD),
    no PROTOCOLO GRAVADO (`useProtocoloGravado`), no DFD gravado (`useDfdGravado`) e na LISTA da Mesa — calculada no servidor
    (`POST /api/dfd/conferencia`, em fatias de 150 ids, DFD completo + a unidade REAL com os responsáveis). O
    `protocolar()` também usa a mesma função por DFD (não protocola DFD em erro) e o "Importar DFD" avulso bloqueia se as
    mensagens têm erro — célula, painel e botões nunca se contradizem. (O antigo `apontamentosGravado` foi removido.)
  - **Análise = gravação (nada é barrado só no fim):** o SERVIDOR usa a MESMA régua da análise — tipo do DFD **e a
    CATEGORIA do protocolo** (`categoriaDoProtocolo`, `protocolo.ts`: o de destino no `start-dfd`; sem ele, o do DFD
    existente; nos lotes seguintes e no `PATCH`, o do DFD) em `faltasObrigatorias`, ano do PCA, órgão, catálogo e
    assinatura; o **valor unitário nos lotes seguintes** (`append-dfd-itens`) e no `PATCH` de itens segue o nível do ADM
    (antes era fixo e derrubava na protocolação um DFD de 200+ itens que a análise liberara — "Todos os itens precisam de
    valor unitário"). O avulso usa a categoria do protocolo do DFD sobrescrito (`base.protocoloAssunto`). **Catálogo
    BLOQUEANTE** (o ADM pôs um ponto de catálogo em "bloqueia"): a análise do protocolo confere os itens de TODO DFD no
    catálogo (fila, um DFD por vez; linha "Conferindo…", o Protocolar espera) e a linha/despacho usam o veredito
    (`avaliarLinhaDfd(..., { conformidade })`); a fila usa `conferirItensClienteResultado` (distingue FALHA de rede de "nada
    a conferir"), tenta de novo com espera crescente até `MAX_FALHAS_CATALOGO` (3) e então TRAVA a protocolação (o servidor
    recusaria o DFD ao gravar — ficaria para trás) até **"Conferir de novo"** no rodapé (`reconferirCatalogo`); a MESMA
    régua (`catPendenteDe`) na fila, na linha e no botão Protocolar. No padrão (avisa) segue lazy, só no DFD aberto.
    **Leitura do DFD única:** uma por vez (`parseEmCursoRef`), nunca sobrescreve o DFD já no cache (edições) e uma leitura
    que dá certo limpa a falha anterior.
    **NADA FICA PARA TRÁS (regra FIXA — `protocolo.semDfdEmErro` só aceita "bloqueia"):** com QUALQUER DFD do envio em
    erro — o erro é o que a importância de cada ponto de DFD e de ITEM manda bloquear (valor unitário, quantidade, catálogo…
    agregados no DFD por `avaliarLinhaDfd`) —, o **Protocolar** trava (rodapé "N DFD(s) com erro — corrija ou exclua do
    protocolo"); a protocolação nunca pula um DFD: só fica fora o que o USUÁRIO tirou do envio (Excluir do protocolo /
    Manter o existente / escolha do duplicado). DFDs além do teto da análise são analisados ANTES de gravar (ver
    `CAP_ANALISE`); falha de GRAVAÇÃO (rede/servidor) deixa a protocolação **INCOMPLETA** — o resultado lista os DFDs não
    gravados e manda completar pelo "Reenviar protocolo".
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
  `message.cor` → a célula "Estado" e o painel `PainelPendencias` mostram a cor EXATA da importância; `estadoCor`/
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
  só-cliente** (como hoje): conciliação do valor da capa e "sem DFD com erro" (este FIXO — só "bloqueia").
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
  `normPrioridade`) e PREVISÃO DE ENTREGA (é **um OU outro**: um MÊS DEFINIDO `MÊS/AAAA` **ou** uma definição GENÉRICA —
  a periodicidade `ANUAL`/`SEMESTRAL`/`QUADRIMESTRAL`/`TRIMESTRAL` (`PERIODOS_PREVISAO`; sem ano vale, com ano vira
  `SEMESTRAL/AAAA`); o recorrente `MENSAL(MENTE)`/`ANUAL(MENTE)`/`AO LONGO DO ANO`… = `ANUAL` — `normPrevisao(texto,
  anoPca?)` → `{valor, anual (= genérica), periodo, auto}`). **O ANO É SEMPRE O DO PCA** (v1.18.0 — regra do usuário): com
  o `anoPca`, o ano escrito no texto (de um contrato, de uma data antiga) NUNCA vale ("MARÇO/2025" num PCA 2027 =
  `MARÇO/2027`, `auto`) e o mês numérico só vale fora de uma REFERÊNCIA (`ANTES_REFERENCIA`: CONTRATO/ATA/ARP/PREGÃO/
  LICITAÇÃO/PROCESSO/Nº — "Contrato 12/2025" nunca vira dezembro) e com o ano do PCA; sem o PCA (avulso antes de
  escolher), o ano do texto fica provisório. `normalizarSecoesDfd(dfd, regras, anoPca?)` recebe o ano do PCA (do
  protocolo, ou do próprio DFD no avulso); o "Atualizar" (`revisarDfd`) corrige os gravados. O que não dá
  para padronizar fica para **tratar** à mão. O bloco **Tratamento** do `DfdConferir` edita PRIORIDADE (`Segmented`),
  PREVISÃO (seletor **Definição** Mês definido · Anual · Semestral · Quadrimestral · Trimestral — `DEFINICOES_PREVISAO` —
  + o mês + o ano TRAVADO no do PCA; `buildPrevisao(mes, ano, periodo)`, puro; a massa igual) e FUNDAMENTAÇÃO LEGAL (`TextField`,
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
  "gravação INCOMPLETA (n de N itens): reenvie para completar"; o mesmo aviso quando o desfazer não passa (sem rede, ou
  recusado — `apagarDfd` confere a resposta). `appendDfdItens`
  é **idempotente** e regrava só a FAIXA do próprio lote (`comandoApagarFaixaItens`: `desde < sequencial ≤ desde + n` — o
  retry não duplica e um retry ATRASADO nunca apaga um lote posterior). O **desfazer** (`?origem=desfazer`) NUNCA vira um
  "Excluir" comum: fora do `gravacaoParcial` → 409 (nada é apagado — ex.: outra pessoa criou o DFD entre a consulta e a
  gravação). O DFD GRAVADO pela metade (a sobrescrita que falhou num lote) é **ERRO "Gravação incompleta: N de M itens"**
  (`gravacaoIncompleta`/`DfdConferivel.gravacaoIncompleta`, `conferencia-dfd.ts` — lido do GRAVADO, nunca do rascunho) na
  célula, no painel e no protocolo agregado até reenviar. O banner de importação fica
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
  MESMO `idExterno` — o de mesmo Id e nº DIFERENTE é o MESMO processo RENUMERADO: `iniciarProtocolo` o **renumera** (o mesmo
  registro — DFDs, gestão, histórico e rastro seguem) ou, com outro protocolo já no nº novo, passa os DFDs dele a esse e o
  exclui — tudo no MESMO lote do upsert (`comandosMesmoId`, **`protocolo-sql.ts`**, builders testados pelo driver D1 real):
  nenhum DFD fica órfão (antes a FK `set null` orfanava os que não vinham no PDF e os mantidos). Na análise, o DFD
  cadastrado num protocolo de MESMO Id é "deste processo" (`/api/dfd/existentes` devolve `protocoloIdExterno`: Substitui,
  não Move; "Manter o existente" o mantém na capa). O `POST /api/protocolo` faz o **anti-sequestro por Id E por Nº** — 403
  se o Id ou o número já existe em unidade inacessível — TODOS os de mesmo Id (`protocolosDeMesmoId`, a MESMA lista que o
  `iniciarProtocolo` funde) e o de mesmo nº (`getProtocoloPorNumero`); a FUSÃO (nº novo já em outro protocolo) é recusada
  (409) se QUALQUER um dos envolvidos — inclusive o que fica — está em um PCA, e o rastro do que fica sai para os DFDs que
  entram nele (`comandosMesmoId` — não contam duas vezes). O **DFD** já dedupa/sobrescreve por `numero` (`upsertDfdCabecalho` onConflict em
  `dfds.numero`; `planejamento` é DADO, atualizado no overwrite).
  **Excluir em CASCATA (regra do usuário):** `excluirProtocolo` (`protocolo.ts`) apaga os **DFDs vinculados**
  (`delete dfds where protocoloId`) ANTES do protocolo, no MESMO `db.batch` — os **itens** caem por `dfd_itens.dfdId`
  cascade e o vínculo de edição por `pca_dfds.dfdId` cascade; não deixa DFD órfão (antes o `set null` orfanava).
  **Conflito de DFD na importação — escolher qual PREVALECE (regra do usuário):** quando um DFD do protocolo já existe
  no banco, o banner mostra **Substitui/Move/Outra unidade (sem acesso)** — `classificar` sobre a consulta do SERVIDOR
  **`POST /api/dfd/existentes`** (`buscarExistentes`/`dfdsPorNumeros`, lotes de ≤ 90 no `IN`: em QUALQUER unidade — a lista
  da Mesa é filtrada pela unidade do cabeçalho e classificava errado; o de unidade sem acesso volta só como
  `{numero, acessivel:false}` e vira ERRO da linha, `MSG_SEM_ACESSO`, resolvido por "Manter o existente"; sem a consulta
  a protocolação não segue às cegas) — e o botão **"Manter o existente"** (no banner do DFD) descarta o incoming
  (`descartarDfd` → `descartados`; `protocolar` já pula descartados) → o **já cadastrado prevalece** (não é
  sobrescrito); sem descartar, o **novo prevalece** (sobrescreve por `numero` + reatribui `protocoloId`), com a
  **escolha POR DADO** ao abrir o DFD (ver "Sobrescrita de DFD" abaixo).
  **DFDs DUPLICADOS no PRÓPRIO PDF (`protocolo.dfdDuplicado`, padrão bloqueia) — COMPARAR e ESCOLHER:** mesmo nº de DFD
  **ou** de planejamento, em relação DIRETA (`duplicadosDfds`: cada DFD conhece os que conflitam com ELE — "manter este"
  descarta SÓ esses; A~B pelo nº e B~C pelo planejamento: manter A tira B e C continua — a antiga união transitiva
  descartava C à toa). No banner do DFD: botão **"Duplicados (N)"** (e a mensagem do painel) abre, à direita, o
  **`ComparacaoDuplicados`** — o aberto × CADA duplicado campo a campo (`compararDuplicados` = a régua do reenvio + o Nº
  DFD quando difere; itens "Só neste"/"Só no outro"/"Diferente"; "Idênticos" quando não há diferença), com onde está no
  PDF (págs.), itens e valor, **"Manter este"** em cada um (troca a escolha a qualquer momento) e "Abrir". Escolher
  descarta os conflitantes (cinza, fora da somatória e da protocolação; "Restaurar" volta) e o ERRO SOME antes de
  protocolar. Um nº mantido por "Manter o existente" que um DFD ATIVO ainda grava não conta duas vezes na somatória.
  **O MESMO nº SEMPRE liga e, sem escolha, é SEMPRE ERRO** (só um por nº é gravado — o outro ficaria para trás;
  `dupNivel`), qualquer que seja o nível do ADM: com o ponto em "ignorar", a comparação e o "Manter este" seguem para o
  mesmo nº (só o mesmo planejamento deixa de ligar); "Manter o existente" descarta também as cópias de mesmo nº; o mesmo
  PLANEJAMENTO (nº diferentes) segue o ponto — em "avisa", vão todos, com a confirmação listando-os antes. Selo por DFD na comparação: **Descartado / Sem escolha / Segue**; "Abrir" não reabre a
  comparação por cima (celular).
  **EXCLUIR DFDs do protocolo NA ANÁLISE (antes de protocolar):** botão **"Excluir do protocolo"** no rodapé do banner do DFD
  (`DfdRodape.acoes`) e EM MASSA na seleção (`BarraSelecaoDfds.acoes`). O DFD excluído fica FORA DO ENVIO — estado
  **`excluido`** ("Excluído", cinza; `foraDoEnvio` em `dfd-tratamento`, junto do `descartado`): não é gravado, sai da
  somatória/contagem da capa, dos erros e do despacho, e deixa de bloquear (erro, tipo não permitido, duplicado — excluir um
  dos duplicados resolve o par). Estado `excluidosDoProtocolo` = subconjunto de `descartados` (a MESMA régua de
  `protocolar()`/somatória); **na importação nada é apagado do banco**: o DFD já cadastrado de mesmo nº (se houver) continua
  como está — e segue na somatória quando é deste processo (`existentesMantidos`: o cadastrado DESTE processo cujo nº nenhum
  DFD ativo grava — seja qual for o botão que tirou o do PDF do envio ou a ordem dos cliques; calculado a cada render, vale
  também quando a consulta dos já cadastrados chega depois). **No REENVIO**, excluir tira o DFD do processo: o
  GRAVADO de mesmo nº entra na lista "fora do envio" do topo (Excluir — padrão — ou Manter, como o que não veio no PDF; a
  confirmação avisa quantos gravados serão EXCLUÍDOS) — sem a ação Excluir, só "Mantido" (`ComparacaoProtocolo.excluirBloqueado`; em um PCA o
  excluído sai do PCA, com os nºs dos itens baixados). Um DFD já fora do envio por outro motivo não muda; quando outra ação o tira
  do envio depois (Manter o existente, a escolha do duplicado, o rastro do reenvio), ele deixa de ser "Excluído" e vira
  "Descartado" — o "Restaurar excluídos" não o traz. O DFD fora do envio não entra na fila do OCR nem segura a protocolação
  (`ocrPendenteNoEnvio`); ao voltar ("Restaurar"/"Manter este"), a assinatura achatada é lida (`lerOcrAoVoltar` →
  `mesclarOcrSePreciso`, que deixa o DFD "pendente" enquanto lê — também ao abrir o DFD: a protocolação espera). Desfazer: **"Restaurar"** no rodapé do DFD ou **"Restaurar excluídos (N)"** no título da
  tabela cinza "DFDs fora do envio" (`PlanilhaDfds.acaoDescartados`, via `ProtocoloView`). Aviso flutuante confirma; o rodapé
  conta "N excluído(s)" e o resultado da protocolação informa os excluídos na análise. Validado ponta a ponta com o PDF real
  (`pd101820`, 15 DFDs): excluir 2 → 13 DFDs e a somatória menos os dois; protocolar com 1 excluído → 14 gravados.
  **Sobrescrita de DFD com ESCOLHA POR DADO (não existem dois DFDs com o mesmo nº):** um DFD importado de novo SOBRESCREVE
  o cadastrado, e cada DIFERENÇA gravado × arquivo novo é uma escolha **"Manter gravado | Usar novo"** (+ "todos" por
  bloco). Núcleo PURO **`sobrescrita-dfd.ts`** (testado): `comparacaoEscolha` (a MESMA régua do reenvio — `compararDfd`;
  unidade/ano/valor total fora: não são do arquivo), `entradasEscolha` (campo do cabeçalho `CAMPOS_ESCOLHA`, seção pela
  chave do título, assinaturas, item novo/alterado/removido pela chave ESTÁVEL do pareamento `parearItens`: `a:g:n`/`n:n`/
  `r:g`), `aplicarEscolha`/`aplicarTodas` (copiam o lado escolhido para o DFD de TRABALHO; itens reencontrados pela marca
  de origem `ref` — `marcarItensNovos`, `n:<j>`/`g:<i>`, só na tela, `semMarcas` antes de enviar; total = Σ itens),
  `estadoEscolha` (lido do próprio DFD de trabalho PELO VALOR — campo, seção e item: igual ao gravado / igual ao novo /
  **editado** à mão), `resumoEscolhas` (mantidos/editados → histórico) e `outrasDiferencas` ("Outras alterações": unidade, total e edições). Hook **`useSobrescrita`**
  (gravado + novo [o arquivo, estável] + trabalho → props `EscolhaSobrescritaProps` do `ComparacaoDfdView`, via o painel
  "Diferenças (N)" do `DfdPainelDireito`; N = o que muda DE FATO). Onde: **botão "Sobrescrever DFD"** no banner do DFD
  gravado (`useDfdGravado` e o DFD ao lado no `useProtocoloGravado` — desabilitado com rascunho) → o MESMO
  **`DfdUploadForm`** em modo `sobrescrever` (só o MESMO nº; lançador próprio; o DFD **continua no protocolo dele** — sem
  `protocoloId` o `upsertDfdCabecalho` mantém o atual); o **"Importar DFD"** da Mesa quando o nº já existe (acessível) vira a
  mesma sobrescrita; e a **protocolação** (`ProtocoloUploadForm`: os gravados que os DFDs da análise substituem/movem vêm
  em SEGUNDO PLANO logo após a consulta dos já cadastrados — **`carregarGravados`**, 4 por vez, até o teto da análise; a
  protocolação espera, "Conferindo os DFDs já cadastrados…" — e, na chegada, **herdam** o que o arquivo não traz, como no
  reenvio e no avulso — `herdarDoGravado`: tipo, seções obrigatórias, referências da renovação [só DFD-R] e a validação da
  assinatura pela equipe [depois do OCR]; no reenvio o gravado já veio). **EM MASSA — "Gravado × novo" na seleção:** na análise do protocolo (reenvio OU importação
  com DFDs já gravados), a barra da seleção ganha o campo **"Gravado × novo"** (o 1º do `BarraEdicaoMassa`, prop `versao` —
  só quando algum selecionado SOBRESCREVE um DFD gravado acessível: `sobrescreve` = Substitui/Move): **Manter os gravados |
  Usar os novos** aplica o "todos" do painel Diferenças em CADA selecionado de uma vez (marcar todos + Aplicar —
  `escolherTudo`, puro/testado; o gravado que falta é lido por **`carregarGravado`** — UMA leitura por nº, compartilhada
  com a carga em segundo plano e o DFD aberto, 4 por vez; a leitura por OCR EM CURSO do DFD termina antes — `emCursoOcr`);
  não marca "editado" (escolher não é editar: no reenvio, o que ficou IGUAL ao
  gravado não é regravado — "sem diferença"); o selecionado sem gravado (novo) fica como está; a nota diz quantos
  selecionados têm DFD gravado; o Aplicar ESPERA a análise e a leitura por OCR dos selecionados (`avisoVersao` — a
  assinatura achatada é do ARQUIVO: escolher antes misturaria as duas versões). O avulso/banner herdam do gravado o que o arquivo não traz (`herdarTratamentos`, como o
  reenvio). **Histórico:** `origem:"sobrescrita"` ("Sobrescrita do DFD", `ROTULO_ORIGEM`) + o diff gravado × novo + obs
  "Mantido como no gravado: …"/"Editado antes de gravar: …" (`dfdMetaSchema.escolhas` = os 12 primeiros rótulos + as
  quantidades — `escolhasParaHistorico`, o envio nunca é recusado por um DFD com milhares de diferenças); na protocolação a
  origem segue o canal e as escolhas vão nas obs. Selo **"Sobrescrita"** no `DfdCabecalho`. Robustez: a ordem dos itens
  segue o Nº do item depois de qualquer escolha (`ordenarPorItem`, estável — nada de `sequencial` embaralhado), "todos"
  aplica os itens numa passada só e o estado de cada escolha usa um índice por marca (linear, mesmo com milhares); a SEÇÃO
  é identificada pela seção PADRÃO do título (`chaveSecao` → `SECOES_PADRAO`: "PRIORIDADE" e "PRIORIDADE DA COMPRA OU DA
  CONTRATAÇÃO" são UMA escolha — manter a gravada tira a do arquivo) e as de mesmo tipo voltam num bloco só; com os itens
  dos dois lados o valor do DFD é a SOMA dos itens (a regra única — "Manter todos os gravados" volta a ser IGUAL ao
  gravado); o banner do DFD fica **só-leitura** enquanto a sobrescrita está em andamento
  (`sobrescrever.onOcupado`: lançador → leitura → escolha → gravação — sem rascunho concorrente nem base velha); só a
  leitura mais recente de arquivo vale; fechar a conferência com escolhas/edições feitas pede confirmação; na
  protocolação, a escolha só destrava depois da leitura da assinatura por OCR daquele DFD e o DFD que substitui/move um
  cadastrado fica na **unidade dele** (salvo escolha do usuário no DFD ou em massa — `repEscolhidaRef`; a prevista pela
  assinatura cede, qualquer que seja a ordem das leituras — como no reenvio/banner). Na análise, o DFD aberto fica
  **só-leitura** gravando, fora do envio (excluído/descartado/mantido o existente) ou de unidade sem acesso. No **reenvio**, o DFD gravado
  de unidade SEM ACESSO é conferido com a unidade REAL (`BaseReenvio.unidades`, as mesmas do banner gravado) e fica
  só-leitura: sem diferença, é pulado (não é erro); com diferença, é erro "Unidade sem acesso" (o servidor recusaria) —
  "Manter o gravado" o mantém NO processo (entra na capa). "Manter o existente" só soma na capa o
  DFD que é DESTE processo (`existenteNoProcesso`), sem contar duas vezes.
  **RASTRO do DFD sobrescrito por OUTRO protocolo (migração `0032`, tabela `dfd_passagens`):** quando um protocolo traz um
  DFD que estava em outro, o de ORIGEM guarda um RETRATO leve (planejamento/tipo/sigla/itens/valor DA ÉPOCA; único por
  protocolo + nº) — o `start-dfd` é TUDO num lote atômico (retrato + cabeçalho + apaga itens + 1º lote; os itens pelo id
  `(SELECT id FROM dfds WHERE numero = ?)`): os BUILDERS de **`rastro-sql.ts`** (`retratoRastro` = `insert().select()` lido do
  PRÓPRIO banco, antes do upsert — sem corrida entre protocolações; `limparRastroDestino`), testados pelo driver D1 REAL
  dentro de `db.batch` (`tests/rastro-sql.test.ts` + `tests/fixtures/d1-sqlite.ts`, cadeia A → B → C → A + mover por vínculo;
  a versão com `db.run(sql…)` quebrava o lote — derrubava a protocolação e o "mover DFD de protocolo"); o `start-dfd` nunca desvincula (`protocoloId` ausente/nulo = mantém
  o protocolo). O DFD que volta a um protocolo (start-dfd/`vincularDfd`) tira o rastro dele ali; excluir o protocolo apaga o
  rastro (cascade); **mover um DFD à mão (vínculo) não deixa rastro** — o rastro é da SOBRESCRITA por outro protocolo. O protocolo ATUAL é DERIVADO do DFD vivo de mesmo nº (`listarSobrescritos`,
  join) ⇒ numa cadeia A → B → C, A e B apontam **sempre C** ("DFD excluído depois"/"Hoje sem protocolo" quando for o caso).
  UI: **`TabelaSobrescritos`** (`PlanilhaDfds.tsx`) — cinza, separada, abaixo da planilha no `ProtocoloView`; "Sobrescrito
  pelo" = link (≥ 44px) que troca a pilha para o protocolo atual (`BannersMesa.onAbrir`, confirma rascunho; sem acesso =
  texto; as linhas não são clicáveis — sem destino quando sem acesso/excluído). Os valores do rastro ENTRAM na conciliação
  da capa (`colunasSobrescritos` → `ProtocoloResumo.sobrescritos`/`valorSobrescritos` → `somatorioProcesso` [fonte única,
  `conferencia-dfd.ts`] → `avaliarProtocolo`, a massa "valor da capa = somatória", o gravado e o reenvio) e evitam o
  falso "Sem DFDs"; a coluna DFDs da Mesa mostra `+N`.
  No **reenvio**, os DFDs do PDF que um protocolo POSTERIOR sobrescreveu ficam **mantidos lá** (pré-descartados,
  "Sobrescrito — está no protocolo X"; "Restaurar" traz de volta).
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
  Barra de **progresso** + **relatório final** (importados; falha de gravação = INCOMPLETA, com os DFDs não gravados);
  **defeituoso nunca é protocolado** (trava o Protocolar — nada é pulado). `casarReparticao` (`reparticao-match.ts`) casa por **sigla → nome → órgão**. Acesso em
  `protocolo.ts` (`iniciarProtocolo` = `POST /api/protocolo` `start-protocolo`; totais **ao vivo**), `GET`/`DELETE
  /api/protocolo/[id]`, `PATCH /api/dfd/[id]` (vincular/desvincular — na Mesa pelo `SeletorBusca`, com pesquisa). UI na **aba Protocolos** de `DfdsView`
  (`ProtocoloUploadForm` → banner: metadados + **repartição do protocolo pelo Interessado** + tabela dos DFDs (sempre
  cheia) + **seleção/edição em massa** [repartição/prioridade/previsão/fundamentação nos N selecionados] + **estado
  por DFD**. **Clicar numa linha abre o DFD (`DfdConferir`) como um banner AO LADO** — o `Modal` **mestre-detalhe**
  (`lateral`) põe os dois banners lado a lado no desktop [o principal desliza p/ a esquerda; `grid-template-columns`
  + `max-width` animados por token de motion] e um por vez no mobile; trocar de DFD atualiza o lateral
  (`animate-fade-in-up`). Analisa/normaliza
  em background até `CAP_ANALISE=300`, **cacheando o parse por índice** (`Map<idx, DfdParseado>`) para as **edições
  sobreviverem** ao envio (a análise NÃO re-parseia/sobrescreve um DFD que o usuário já abriu ou editou em massa —
  `parsedRef` —, mas ainda prevê a unidade e põe na fila do OCR a partir da cópia do cache);
  `protocolar` grava a cópia do cache — com DFDs do envio ainda SEM análise (além do teto), analisa os restantes ANTES
  (`analisarTodos(…, de)`: a MESMA leitura, OCR, herança e catálogo; os gravados deles em `carregarGravados`) e, ao
  terminar, protocola sozinho se nada estiver com erro (`protocolarAposAnalise`; o rodapé avisa "a protocolação segue ao
  terminar"). **Progresso REAL da análise:** `analise = {fase:"texto"|"ocr", feito, total, atual, ate}` → barra `Progress` no rodapé ("Analisando DFD 1234 (3 de 15)…" /
  "Lendo assinatura por OCR — DFD …") e, por linha, `LinhaDfd.processando` ("Lendo o DFD…"/"Lendo assinatura
  (OCR)…"/"Na fila", com spinner na célula Estado); a leitura do PDF (índice) mostra "Página p de N"
  (`indexarProtocoloPdf(file, onProgresso)`). Corpo do banner = `ProtocoloView` (corpo ÚNICO, ver abaixo). **Capa: identificadores IMUTÁVEIS, conteúdo editável (cadeado por campo) + conferência do valor:** os
  **IDENTIFICADORES** da capa (número/Id/data/ano do PCA) **não são editáveis em nenhum tempo**; os campos de
  **CONTEÚDO** (interessado/assunto/observação/CPF-CNPJ/valor/local) têm **cadeado POR CAMPO** (a mesma lógica dos itens,
  primitivos em `CampoCadeado`) — destraváveis tanto no **preview do PDF** (`modo="cadeado"` do `CapaCampos`) quanto no
  **gravado destravado**; a criação manual usa inputs simples (`modo="criar"`). A **repartição** (roteamento) segue
  editável (seletor obrigatório na análise e no gravado). O **Valor da capa** é editável e **conciliado** — na análise E
  no gravado — pela fonte única **`conciliacaoCapa`** (`dfd-tratamento`, pura): capa **nula/zerada** OU **diferente** da
  somatória EXATA (`valoresBatem`: bate quando a diferença é MENOR que 1 centavo, decidida em décimos de milésimo INTEIROS — a
  Centi trunca a fração do centavo, e 1 centavo inteiro diverge sempre, sem depender do ponto flutuante; a somatória mostrada
  e a que substitui a capa vão ao centavo — `somatorioProcesso` dá `exato` e `somatorio`) ⇒ divergente; só confere com a somatória COMPLETA (análise
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
  **um botão "Importar"** que abre um **banner lançador** (na Mesa, no RODAPÉ da tabela, à esquerda do seletor de linhas —
  ver "BARRA DA MESA"); no protocolo ele é **dividido ao meio** (soltar/escolher o PDF **|** criar protocolo manualmente). Isso libera espaço para as tabelas: as de **DFDs/Protocolos**
  (telas DFD e PCA) usam `DataTable fillHeight` (linhas por página automáticas p/ preencher a altura do display no
  desktop, sem scroll do navegador); as demais tabelas ficam em **≤20 linhas/página**.
- **Protocolação bloqueada com DFD defeituoso (SEMPRE — nada fica para trás):** o botão "Protocolar" fica **desabilitado**
  enquanto algum DFD do envio estiver com **erro** (por um ponto de DFD ou de ITEM cuja importância bloqueia), ainda em
  análise, com a assinatura em leitura ou com o catálogo sem conferir — não se protocola um processo com DFDs defeituosos
  nem se deixa DFD/item para trás (o `POST` segue validando por garantia). Estado **"regularizado automaticamente" = verde** (`estadoCor`).
  **Tabela ÚNICA de DFDs — `PlanilhaDfds` (`src/components/PlanilhaDfds.tsx`):** o MESMO componente lista DFDs em
  TODO lugar — banner de importação, banner do protocolo GRAVADO (`ProtocoloView`) e a **aba DFDs** (`DfdsView`). Cada
  tela mapeia seus dados (parse do PDF / D1) para o modelo `LinhaDfd`. Colunas: **[seleção] · Estado · [Situação] · Nº
  Plan. · Nº DFD · Sigla · Tipo (`tipoCurtoDfd`) · Assinatura · [Protocolo] · Itens · Valor total · [ações]** (o
  planejamento vem ANTES do DFD; a seleção usa a **`BarraSelecaoDfds`** — chips + Σ + **"Copiar planejamentos"**, que copia
  os nºs de planejamento dos selecionados separados por ":" SEM espaço, ex.: `1525:1549:1554` — `textoPlanejamentos`) (as
  opcionais só aparecem quando há dado), **todas filtráveis/ordenáveis** e **sem quebra de linha** (`Column.nowrap` do
  `DataTable`: a coluna ganha a largura do CONTEÚDO — ex.: os badges da Assinatura + "(auto)" numa linha só; a tabela
  rola no eixo x do próprio container). Na **ANÁLISE** os **DFDs com erro/atenção ficam em tabelas SEPARADAS** acima das
  regulares e os FORA DO ENVIO (Excluído/Descartado — `foraDoEnvio`) numa tabela CINZA abaixo, "DFDs fora do envio (N)", com
  a ação opcional `acaoDescartados` no título (ex.: "Restaurar excluídos"); **depois de protocolado** (`unica`) é **UMA tabela só** (o filtro da coluna Estado separa) — a única
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
  O **head** mostra **Id + Assunto** ao lado do nº. O `IndicadorPendencias` do rodapé abre o painel **`PainelPendencias`** (ver "PENDÊNCIAS
  PADRONIZADAS"). A **barra de edição em massa** fica FIXA no rodapé do banner (controle do valor em cima; seletor do
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
  (Planej. 640), 702 (Planej. 811):"). O despacho sai pelo "Copiar → Despacho" do
  **`PainelPendencias`**. Helpers puros em `dfd-tratamento.ts`
  (`itemComErro`/`estadoItem`/`faltasCirurgicasDfd`/`linhasRelatorioDfd`/`linhasRelatorioProtocolo`/`SECOES_OBRIGATORIAS`
  [fonte única, reusada por `faltasObrigatorias`] + `ESTADO_PROTOCOLO_ROTULO`/`estadoProtocoloCor`; o estado agregado do
  protocolo vem de `avaliarProtocolo`).
- **PENDÊNCIAS PADRONIZADAS — Protocolo · DFD · Item, UM banner (`PainelPendencias`, núcleo puro `pendencias-core.ts`):**
  a árvore ÚNICA sai das MESMAS mensagens da célula Estado (`mensagensDfd`/`mensagensItem` + `conciliacaoCapa`, níveis e cores
  do ADM): **o DFD soma os itens** (`pendenciasDoDfd`: as mensagens agregadas de item — "Falta valor unitário em 3 de 10" —
  viram a lista de CADA item com o problema, no status/cor da mensagem; as seções levam o TEXTO ATUAL como contexto) e **o
  protocolo soma a capa + os DFDs** (`pendenciaDaCapa`, `contarProtocolo` = Σ `contarDfd` + a capa — testado); o item sozinho
  = `pendenciasDoItemSolo`. **Tocar LEVA ao lugar** (`AlvoPendencia` {dfd, item, ancora} + o hook **`useDestaqueAncora`**,
  `DestaqueAncora.ts` — rola e pulsa na cor; o MESMO no `DfdConferir`, no `ItemDetalhe` [`data-ancora` em valor unitário,
  quantidade, `repetidos`, `catalogo`] e na capa do `ProtocoloView` [`capa`]): no protocolo abre o DFD ao lado com a âncora
  (ou o item com o campo — `PainelDfd.item.destaque`); no DFD rola até a seção ou abre o item; no item, o campo. **Copiar**
  (`Dropdown`): **Despacho** (o de sempre — `linhasRelatorioProtocolo`/`linhasRelatorioDfd` + "Respeitosamente"), **WhatsApp**
  (`*negrito*` + marcadores) e **Lista simples** (hierárquica, com o lugar) — `textoPendencias`; **PDF** (`blocosPendenciasPdf`
  → o gerador `documento-pdf`, A4: resumo, capa valor × somatória, por DFD a tabela "Onde · Pendência · Conteúdo atual" e a
  tabela dos ITENS como estão no DFD com a célula que falta na cor; só com a ação Exportar — `usePodeExportar`). **MONTAR O
  DOCUMENTO** (o botão "Copiar / PDF" do painel → `MontarPendencias`, `Modal` xl): ESCOLHER o que entra — Situação (erros/
  atenções), **Problemas** (os TIPOS, `tiposDePendencia` — um por ponto, com as ocorrências: cada item conta; rótulo
  `rotuloTipoPendencia`) e DFDs (no protocolo) — com "Todos | Nenhum" (`ListaEscolha`), e a **PRÉVIA AO VIVO** no formato
  escolhido (`Segmented` Despacho · WhatsApp · Lista · PDF — o texto exato que vai ser copiado, ou o PDF pelo
  **`PreviaDocumento`**, DS: os MESMOS blocos do gerador em HTML, sem gerar o PDF); `filtrarPendencias` (puro, testado: o
  completo não muda nada; o DFD/item sem nada escolhido sai; o DFD de que algo foi tirado usa os textos escolhidos no
  despacho, não o cirúrgico pronto). Rodapé: o que vai no documento + "Copiar texto" | "Baixar PDF" (desabilitado sem nada
  escolhido). No celular, "Escolher | Prévia" alternam; no desktop, lado a lado. Onde: o painel da direita do DFD (`DfdPainelDireito {tipo:"mensagens"}` — análise avulso/protocolo,
  gravado, DFD ao lado do protocolo), o painel À DIREITA do protocolo (`ModalPainel` `proto-pendencias` no gravado e na
  análise — o `IndicadorPendencias` alterna; empilhado, um `Modal`) e o TOPO do `ItemDetalhe` (o indicador no cabeçalho do
  item alterna). A contagem do indicador do protocolo = a soma das pendências (não mais a de DFDs). O `RelatorioErros` ficou
  só para as diferenças do reenvio; o `MensagensDfd` saiu. Testes: `tests/pendencias-core.test.ts`.
- **Painel LATERAL de MENSAGENS do DFD (hoje o `PainelPendencias`) — todas as conferências, navegáveis:** as mensagens NÃO
  aparecem mais soltas no corpo do banner do DFD. `mensagensDfd` (puro, `dfd-tratamento`) monta a lista COMPLETA
  (erro/atenção/**acerto**, sem exceção — só omite pontos "ignorar" do ADM), cada uma com uma **âncora** (id do
  componente: `reparticao`/`anoPca`/`justificativa`/`previsao`/`prioridade`/`fundamentacao`/`referenciaRenovacao`/
  `itens`/`valor`/`assinatura`, marcadas com `data-ancora` no `DfdConferir`/`DfdView`). `mensagensDoDfd` (`src/lib/
  conferencia-dfd.ts`) já confere a assinatura e é a **fonte única** (contador do botão + painel + célula Estado via
  `avaliarLinhaDfd`). O rodapé do banner do DFD é o componente **`DfdRodape`** (UMA linha: `IndicadorPendencias` + ações só ícone + ação
  principal; Fechar = o X do cabeçalho) e o painel da direita é **`DfdPainelDireito`** (mensagens / item / histórico) — os MESMOS na análise
  (avulso e protocolo) e no gravado (DFD solto e DFD ao lado do protocolo gravado). O **`IndicadorPendencias`** (o estado na cor do ADM + os chips de erro/atenção) fica no **RODAPÉ FIXO do banner do DFD**, à esquerda (não
  no corpo) — o toque alterna o painel. Ao abrir, um **novo banner** de mensagens surge **AO LADO DIREITO** do DFD (mesma animação de lateral),
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
  DFD** (Σ) via `editarItemDfd` — e trocar a QUANTIDADE ou o VALOR UNITÁRIO recalcula o total do ITEM (q × vu, `totalDoItem`). No **gravado**, a edição do item entra no RASCUNHO do DFD e vai ao banco no "Salvar
  alterações" do banner (`PATCH /api/dfd/[id]` `{itens}` → `reescreverDfdItens`, apaga+reinsere + recomputa total). Só
  **editor**; escopo por unidade e `valorUnitario>0` no servidor.
- **GRAVADO = ANÁLISE (mesmos componentes, conferência, seleção e ajustes — a ÚNICA diferença é a tabela única):**
  - **RODAPÉS EM UMA LINHA, SÓ ÍCONES (Protocolo · DFD · Item — Mesa, análise e consulta pública):** à esquerda o
    **`IndicadorPendencias`** (o MESMO nos banners: protocolo = a soma das pendências da capa e dos DFDs → o painel de
    pendências à direita; DFD = o estado + as mensagens → o painel; item = no cabeçalho do `ItemDetalhe`) ou a barra de progresso; à direita as ações em **`BotaoAcao`**
    (só o ícone; Duplicados/Diferenças/Tarefas com a contagem) e a ação PRINCIPAL (Salvar alterações, Protocolar, Importar/
    Sobrescrever DFD — ícone + texto de 640px para cima). **Reenviar protocolo** e **Sobrescrever DFD** = botões PRETOS
    (`variant="primary"`). Nada repete o cabeçalho: sem Fechar/Cancelar (o X fecha) e sem a contagem de DFDs (está nos mini
    banners); **Histórico e Tarefas ficam no CABEÇALHO** (ao lado do Atualizar) do protocolo e do DFD (também do DFD ao
    lado do protocolo); o item mantém Ver DFD/Ver protocolo. **TRAVAR = DESABILITAR, NUNCA SUMIR:** gravando (`salvando`) ou
    com a sobrescrita de um DFD em andamento (`onOcupado` do `DfdUploadForm`), as ações dos banners (Reenviar, Sobrescrever,
    Atualizar, Tarefas) ficam À VISTA desabilitadas com o motivo na dica (`motivoTrava`; `BotaoAtualizar`/`TarefasDoVinculo`
    `disabled`); Histórico e o relatório de pendências (só leitura) seguem ativos. Os hooks devolvem `bloqueado` (a pilha não
    troca/fecha — gravando OU sobrescrevendo; trocar/fechar o DFD-base da sobrescrita é recusado) e `salvando` (só ele some
    com o X/Esc do `Modal` — na sobrescrita o modal dela fica por cima).
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
    (`avaliarProtocolo` — capa + DFDs + itens, ver acima). Excluir protocolo (lixeira da linha — SÓ na Mesa principal;
    protocolo em um PCA não é excluído, ver "Mesa do PCA") avisa que os DFDs vinculados (e itens) são excluídos junto
    (cascata).
  - **Seleção + edição em massa nas TRÊS visões da Mesa — `BarraSelecao` FIXA no rodapé do DISPLAY:** DFDs, Protocolos e
    Itens têm seleção (só editores). A barra fica **`position: fixed`** rente ao rodapé do display (acima da navegação
    inferior no celular) **mesmo com a tabela curta**, alinhada à coluna de conteúdo (medida pelo LUGAR que reserva no
    fluxo; o respiro que ela cobre = o `pb` do `<main>`, o token `--pad-canvas` lido por `tokenPx`) e informa esse lugar (`onAltura`) → a tabela `scrollInterno`
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
  - **Botão ATUALIZAR = recarregar + REVISAR** (`BotaoAtualizar` — o botão CIRCULAR PADRÃO do sistema: o ícone gira dentro
    de um anel; o mesmo da barra das Mesas e do "Recarregar"/"Verificar" de Auditoria, Armazenamento, Órgãos, Unidades e
    Automação —, ao lado do X dos banners de DFD, ITEM e protocolo): o
    ícone GIRA (`useGiro` — ao menos uma volta; um 2º toque enquanto gira é ignorado) enquanto recarrega do banco (confirma se
    há rascunho) e REVISA o que chegou com os MESMOS tratamentos automáticos da importação — núcleo puro **`revisao-dfd.ts`**:
    `revisarDfd` (seções em TEXTO CORRIDO + a linha do órgão emissor que o cabeçalho de página deixava fora; campos do
    cabeçalho limpos — a "Matrícula:" vazia lida como ":" volta a vazia; a padronização do ADM `normalizarSecoesDfd`; DFD-R
    sem referência lê contrato/ARP/licitação do texto; descrição/unidade dos itens limpas — só se o servidor aceitaria regravar
    os itens: `podeRevisarItens`) e `revisarCapa` (conteúdo da capa em uma linha limpa). NUNCA mexe em identificadores,
    valores, quantidades, assinaturas nem na unidade; idempotente. O tratado entra no RASCUNHO (Salvar alterações grava só o
    que mudou, com o histórico) e o aviso flutuante diz o que foi tratado (`resumoRevisao`; no protocolo, por DFD —
    `resumoRevisaoLote`). Só-leitura (sem permissão, unidade sem acesso): só recarrega e avisa o que
    haveria a tratar. Testes: `tests/revisao-dfd.test.ts`.
  - **REENVIAR PROTOCOLO (sobrescrever com comparação)** — botão **"Reenviar protocolo"** no rodapé do protocolo gravado (`useProtocoloGravado`)
    (desabilitado com rascunho pendente) → o **MESMO `ProtocoloUploadForm`** em modo `reenvio` (`BaseReenvio` = protocolo +
    DFDs completos já carregados), com lançador próprio. Núcleo PURO **`comparar-protocolo.ts`** (testado):
    `identidadeReenvio` (só o MESMO nº **e** Id — outro protocolo é recusado no lançador E no servidor, 422),
    `compararCapa`, `compararDfd` (cabeçalho, **seções casadas pela seção PADRÃO do título** — `chaveSecao`, sem a
    numeração —, assinaturas, **itens pareados** por código+descrição → código ÚNICO dos dois lados → nº → código:
    novo/removido/alterado campo a campo; situação novo/igual/alterado),
    `linhasRelatorioReenvio` (relatório copiável) e **`herdarTratamentos`** (o que o PDF NÃO traz e o gravado já tratou —
    tipo, seções obrigatórias ausentes/fora do padrão, referências de renovação [só quando o DFD é DFD-R — nos demais
    ficariam gravadas escondidas], validação da assinatura pela equipe — é herdado, nunca sobrescrevendo valor válido do
    PDF; listado como "Herdado do gravado"). UI (`ComparacaoReenvio.tsx`):
    **`ComparacaoProtocolo`** no topo do banner (`ProtocoloView.topo`: contagens Novos/Alterados/Sem diferença/Fora do envio,
    diferenças da CAPA, DFDs gravados FORA DO ENVIO — não vieram no PDF ou o DFD do PDF foi excluído na análise — com
    **Excluir/Manter** um a um ou todos, "Relatório de
    diferenças"), coluna Situação "Novo/Igual/Alterado (N)" e, por DFD, o botão **"Diferenças (N)"** → painel da direita
    (`DfdPainelDireito` `{tipo:"diferencas"}` → **`ComparacaoDfdView`** + `DiffLinha` gravado × novo) e **"Manter o gravado"**
    (descarta o novo). O usuário **edita antes** (mesma conferência/edição em massa da análise). **Sobrescrever** confirma
    com o resumo, envia `start-protocolo` com `reenvio {protocoloId, resumo}` (o servidor confere escopo + identidade e
    audita "REENVIADO (sobrescrito)"), **regrava só os DFDs que mudaram** (os "igual" ficam como estão), exclui os fora do
    PDF marcados "Excluir" (padrão — `DELETE ?origem=reenvio&protocolo=P`: só o DFD que AINDA está no protocolo; o movido
    por outra pessoa durante a análise não é tocado, 409) e recarrega o gravado. Garantias: o servidor grava no MESMO registro (**nº exatamente
    como gravado** e **Id gravado** quando o PDF não traz — nunca apaga o Id); a comparação de assinaturas inclui formato,
    código e a **validação da equipe** (validar/desfazer é diferença); DFD **editado** na análise nunca é pulado como
    "igual"; a validação da assinatura é herdada **depois do OCR** (`herdarTratamentos(…, {assinaturas})` em partes — a
    assinatura achatada só existe após a leitura) e o servidor mantém **quem/quando** da validação já gravada
    (`carimbarValidacao` com as assinaturas do DFD existente); itens pareados por código+descrição → código único → nº →
    código (remoção com renumeração = 1 "removido", também com as descrições corrigidas); o DFD editado conta como
    alterado na confirmação (é regravado); o relatório lista os DFDs **ainda não comparados**; o lançador só abre num clique NOVO.
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
  de itens — busca + filtro por tipo, seleção/edição em massa, XLSX/PDF no rodapé da tabela, editar, detalhe no `lateral`) e **Lista
  de Itens** (todos os itens numa tabela única, com coluna Catálogo; clique abre o detalhe num banner). A troca de visão
  anima por **`animate-cat-morph`** (fade+escala — "as linhas viram cards"). `Dropzone` aceita `.pdf,.xlsx`; novo
  `TextArea` no DS (descrição multi-linha). Rotas: `POST /api/catalogo` (+ `/verificar`, `/item`), `PATCH`/`DELETE /api/catalogo/[id]`,
  `PATCH /api/catalogo/itens`, `PATCH`/`DELETE /api/catalogo/item/[id]` — pelo papel no Catálogo (criar/editar = Manipular,
  importar = Importar, excluir = Excluir — o mapa `rotas-acesso.ts`).
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
  dfdTipo)` (`catalogo.ts`) busca só as entradas dos **códigos daquele DFD** (`entradasCatalogo` → `consultaEntradasCatalogo`,
  `catalogo-sql.ts`: UMA consulta com os códigos num só parâmetro JSON — `IN (SELECT value FROM json_each(?))`, testada pelo
  driver D1 real; guard "catálogo vazio ⇒ nada") e,
  p/ não catalogados, propõe semelhante via `LIKE` por token distintivo — NÃO baixa o catálogo. Rota **`POST /api/catalogo/conferir`**
  (Visualizar numa das Mesas ou no Catálogo) devolve o veredito por código (Map serializado em entries); cliente único **`catalogo-conferir-cliente.ts`**
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
  no painel `PainelPendencias` + `faltasCirurgicasDfd` (despacho). O import avulso (`DfdUploadForm`) e o DFD gravado (`DfdsView`)
  conferem TODO o DFD (useEffect por `itens`); o protocolo confere **por DFD ao abrir** (lazy — a LISTA fica leve/escalável).
  **Portão do servidor (defesa em profundidade, só bloqueia se o ADM elevou a `fundamental`):** `POST /api/dfd` (`start-dfd` **e**
  `append-dfd-itens`, por causa dos lotes) roda `algumCatalogoFundamental` → se sim, `conferirItensNoCatalogo` + `bloqueantesCatalogo`
  → 422. Os DFDs do protocolo passam por `/api/dfd` (o `POST /api/protocolo` só cria a capa) → cobertos. Testes:
  `catalogo-conferencia.test.ts` + os pontos de catálogo em `dfd-tratamento.test.ts` (veredito por linha, portão, invariante).

### Cards no padrão de Tarefas, PASTAS e dois TIPOS de catálogo (Agenda × Histórico de compra) — migração `0075`
- **Modelo (aditivo):** `catalogos.tipo` (`agenda` = o Catálogo da Agenda de sempre — itens com código ÚNICO GLOBAL |
  `historico` = Histórico de compra), `catalogos.cor` (capa; NULL = a do tipo — `COR_PADRAO_CATALOGO`) e
  `catalogos.pasta_id` (FK set null); `catalogo_pastas` (nome + cor + ordem, GLOBAIS como o catálogo); o histórico em
  `catalogo_contratos` (um por "Id Contrato", único por catálogo) + `catalogo_compras` (uma linha por item contratado —
  o `codigo` = "Id Produto" só dígitos, o MESMO código dos itens dos DFDs, índice próprio; FORA da unicidade global dos
  itens da agenda). Os atuais viram `agenda`.
- **Cards = o desenho dos QUADROS de Tarefas:** `QuadroCard` foi generalizado em **`CartaoEspaco`** (capa 16:9 + sobretítulo
  + selo + nome em 2 linhas + 3 métricas + `canto`; `href` ou `onClick`) e `PastaQuadro` em **`PastaCartao`** (+ `ChipPasta`;
  `href` = link) — Tarefas usa os mesmos, sem mudança visual. No Catálogo (`CatalogoCards.tsx`): **`CatalogoCard`** (capa
  no degradê da cor + ícone do tipo + "Atualizado em"; Agenda = Itens · Sem tipo · Unid. medida; Histórico = Itens ·
  Contratos · Valor (R$); menu "…" com Editar · Atualizar (agenda) · Exportar .xlsx · Excluir conforme o papel), **`PastaCatalogoCard`**
  (as capas dos catálogos dela nas folhas; chips itens da agenda + R$ comprados; tocar ENTRA na pasta), `CoresPaleta` e
  `EditorPastaCatalogo` (nome, cor, os catálogos — o de outra pasta avisa que sai de lá). Grade = a de Tarefas
  (`auto-fill minmax(15rem)`): pastas · catálogos soltos · "Novo catálogo" · "Nova pasta".
- **Tela da PASTA** `/painel/catalogo/pasta/[id]` = a MESMA `CatalogoView` com `pasta` (só os catálogos dela; a Lista de
  Itens só com os itens que PERTENCEM a eles; KPIs do conjunto: catálogos/itens da agenda, históricos, contratos, valor
  comprado; editar/excluir a pasta; "Novo catálogo nesta pasta" já cria dentro; sem a padronização — é global).
- **Novo catálogo** escolhe o TIPO (`Segmented`): Agenda (criar à mão | importar PDF/XLSX, como antes) ou **Histórico de
  compra** (só por arquivo, exige Importar) → **`ImportarHistorico`** (prévia com os números + nome + pasta → lotes com
  progresso, tudo ou nada). Abrir um histórico = **`HistoricoCompraModal`** (`GET /api/catalogo/[id]/historico`, sob
  demanda): KPIs + **Produtos** (um por código: contratos, qtd., valor atual, menor/médio/maior — a base da comparação
  futura com os itens dos DFDs) · **Itens** · **Contratos**, detalhe ao lado (cada contrato com o valor atual e "base +
  aditivo"), Exportar .xlsx (papel).
  **VALOR ATUAL (regra do usuário):** no MESMO contrato (= mesma data de assinatura), os preços distintos do produto viram
  UM valor — `valorAtualNoContrato`: um preço = ele (linhas repetidas com o mesmo preço são o item dividido, não somam);
  dois ou mais = o MENOR somado ao MAIOR (o menor é o ADITIVO sobre o maior — ex.: 8,75 + 0,80 = 9,55). O valor atual do
  PRODUTO = o do contrato assinado por ÚLTIMO (`atual` = `porContrato[0]`; empate na data: o de maior ordem). Menor, maior,
  **preço médio (média simples)** e variação são calculados SÓ ENTRE CONTRATOS DIFERENTES, sobre o valor atual de cada um.
  Cada produto aponta o CONTRATO do menor e do maior valor (`contratoMenor`/`contratoMaior`; empate = o assinado por
  último): colunas "Menor valor" · "Contrato (menor)" · "Maior valor" · "Contrato (maior)" (composição base + aditivo,
  credor e assinatura na dica) e, no detalhe, os selos "Menor valor"/"Maior valor" no cartão do contrato.
  **Visão "Por contrato"** (Produtos · **Por contrato** · Itens · Contratos): UMA linha por produto × contrato
  (`porContrato` de cada produto) com o **Menor valor** e o **Maior valor** DENTRO do contrato (`PrecoContrato.menor` = o
  aditivo, ou o único preço; `base` = o maior), o **Valor atual** (maior + aditivo), Situação (**Mais recente** = o valor
  atual do produto | Anterior), Δ preço médio, Qtd. contratada (`PrecoContrato.quantidade` = só as linhas no preço BASE — a
  linha do aditivo repete a quantidade do item), Linhas, Credor e Assinatura; tudo filtrável, exportável; tocar abre o produto.
  **COMPARAÇÃO COM OS ITENS DAS MESAS (sem migração):** a referência de um código = o histórico de TODOS os catálogos
  'historico' (`consultaComprasPorCodigos`, `catalogo-historico-sql.ts` — UMA consulta, os códigos num parâmetro JSON,
  testada no driver D1 real; `historicoDasLinhas` junta o MESMO contrato importado em dois históricos — a linha repetida
  entra uma vez) → `produtosDoHistorico` → **`referenciaDoProduto`** (`ReferenciaHistorico`: valor atual + a data, médio,
  menor, maior, nº de contratos). **`compararComHistorico`** = o valor unitário do item × o VALOR ATUAL (`desvioDaMedia`;
  nível pela régua da variação sobre o desvio absoluto — até 25% dentro · até 50% atenção · acima alerta);
  `rotuloComparacaoHistorico` (Acima/Abaixo (25% a 50%)/(mais de 50%) · Dentro do histórico · Sem histórico · Item sem
  valor) e `textoDivergenciaHistorico` (o erro por extenso). **Mesa → Itens:** `GET /api/dfd/itens` devolve `historico`
  (`referenciasHistorico` — mapa código → referência, fail-safe; só com a visão Itens aberta) e a coluna **Histórico**
  (depois de Vlr. unit., só quando algum código tem compra — `CelulaHistoricoCompra`: o desvio na cor, a referência na
  dica; filtro pelo rótulo) — também na **Consolidada** (o valor unitário MÉDIO da linha × a referência do código, depois de
  Vlr. unit. médio; o MESMO bloco do detalhe abaixo no banner da linha — `ComposicaoItem`, depois dos avisos). **Detalhe do
  item** (`ItemDetalhe`, em toda Mesa e na análise): o bloco **Histórico de compra** (`ComparacaoHistoricoCompra`, `ProdutoHistorico.tsx` — carregado só com o item aberto por `GET
  /api/catalogo/historico/produto?codigo=` (Visualizar numa das Mesas ou no Catálogo), guardado 5 min por código; com
  código o bloco SEMPRE aparece e diz o estado — "Conferindo…" · "Sem histórico de compra" (nenhuma compra do código nos
  históricos importados) · falha com "Tentar de novo"; sem código, não aparece): o rótulo + o erro, Valor do item × Valor atual, o médio e a faixa entre contratos e
  **"Ver no histórico de compra"** → o banner do produto (**`ProdutoHistoricoDetalhe`** — o MESMO do histórico aberto pelo
  Catálogo, sem abrir o contrato) com o valor do item em cima. Informativo: não entra no Estado nem bloqueia.
  **VARIAÇÃO DE PREÇO (a MESMA régua da Consolidada da Mesa):** `produtosDoHistorico` dá o `variacao` (o
  `coeficienteVariacao` de `itens-consolidados.ts`, agora exportado) e a tabela de Produtos abre com os de MAIOR variação
  primeiro, coluna **Variação** logo após a Descrição (`CelulaVariacao`, filtro por faixa — `rotuloVariacao`: Alta > 50% ·
  Atenção 25–50% · Homogênea · Sem comparação); KPI **"Variação alta"** (danger). Nos **Itens**, a coluna **"Δ preço médio"**
  (`desvioDaMedia`/`desvioTexto` do valor atual do produto NO CONTRATO do item × o médio entre contratos, cor pela mesma
  faixa, filtro de faixa) mostra qual contrato puxa a variação. As três
  tabelas são a `DataTable` padrão compacta com TODAS as colunas filtráveis (descrição em `CelulaTexto`).
- **Leitura do export do sistema de compras** — núcleo PURO **`historico-compra-core.ts`** (testado): `lerCsv` (separador
  pelo cabeçalho, aspas, BOM), `parseHistoricoCompra` (colunas pelo NOME; "$$" = vírgula escapada; "10.0000"/"1.234,56";
  dd/mm/aaaa → AAAA-MM-DD; textos cortados em `LIMITES_HISTORICO` = a régua do Zod; **linhas IDÊNTICAS repetidas pelo export
  saem** — no CUBO real de 2026, 5.937 linhas → 1.130 itens, 153 contratos, 868 produtos, R$ 185,6 mi; sem isso o valor
  ficava inflado), `produtosDoHistorico`, `resumoHistorico`. Navegador: `parse-historico.ts` (CSV UTF-8/1252 ou .xlsx) +
  `importar-historico.ts` (`start-historico` cria o catálogo + 1º lote de contratos; `append-historico` = contratos ≤ 100 e
  itens ≤ 150 por pedido, idempotentes — apaga `ordem` ≥ a do lote; falha apaga o catálogo criado).
- **Builders** em **`catalogo-historico-sql.ts`** (testados no driver D1 real: contrato 6/INSERT, item 4/INSERT ≤ 100
  parâmetros, pasta — a lista inteira entra/sai —, excluir pasta, indicadores); D1 em `catalogo-historico.ts`. Rotas:
  `POST /api/catalogo` (+ `start-historico`/`append-historico`; `pastaId` no catálogo novo; agenda × histórico conferidos),
  `PATCH /api/catalogo/[id]` (+ `cor`/`pastaId`), `GET /api/catalogo/[id]/historico` (Visualizar), `POST /api/catalogo/pastas` e
  `PATCH`/`DELETE /api/catalogo/pastas/[id]` (Manipular; excluir só tira a pasta) — auditoria `catalogo`/`catalogo_pasta`.
  Excluir o catálogo apaga o histórico no mesmo lote. As confirmações saíram do `confirm()` do navegador (`useConfirmacao`)
  e as gravações conferem a resposta (erro à vista).

### Padronização: UNIDADES DE MEDIDA e CLASSIFICAÇÕES de item — migração `0038`
- **O que é:** duas visões novas no `Segmented` do Catálogo — **Catálogo · Lista de Itens · Unidades de medida ·
  Classificações** (no celular, rótulos curtos pelo `Segmented.curto`: Itens · Unid. medida · Classif.) —, carregadas SOB
  DEMANDA (`next/dynamic`, `ssr:false`, esqueleto **`SkeletonCartao`**; cada uma busca os próprios dados só quando aberta —
  a 1ª carga do Catálogo não muda). Editores (admin/gestor) gerenciam; os demais CONSULTAM (tocar numa linha do cadastro
  abre o editor em modo **`somenteLeitura`**: os dados e a prévia, só "Fechar"). "Exportar modelo" (cabeçalho, ANTES do
  `Segmented` — as abas não saem do lugar) só aparece nas visões do catálogo.
- **Modelo (aditivo — tabelas novas e vazias: nada muda até o 1º cadastro):** `item_classificacoes` (nome + cor +
  `palavras` JSON `string[]` + ordem) e `unidades_medida` (sigla + nome + `sinonimos` JSON `string[]` + ordem +
  `classificacao_id` FK **set null** — a classificação que a unidade indica). Núcleo PURO **`padronizacao-core.ts`**
  (testado); D1 em **`padronizacao.ts`**; Zod em **`padronizacao-validation.ts`**; limites únicos `LIMITES_PADRONIZACAO`
  (sigla 20, nome 60, grafia 100 — a maior unidade que um item aceita —, 100 sinônimos, palavra 60, 300 palavras-chave,
  200 grafias por chamada de sinônimos, 300 entradas por CADASTRO — a reordenação manda a lista inteira
  (`ordemPadronizacaoSchema`, sem repetir), então criar além disso é recusado com 409).
- **1) COMPARAÇÃO das unidades dos itens com o cadastro:** a grafia é comparada pela **`chaveUnidade`** (sem caixa/acento/
  pontuação/espaço; ²/³ = 2/3 — "Und." = "UND"); é **cadastrada** quando é a sigla, o nome ou um sinônimo de UMA unidade
  (`resolverUnidades`); senão, **não cadastrada** — com **SUGESTÃO** (`comparadorUnidades().sugerir`) pela UNIÃO dos
  candidatos de TODAS as escritas da linha: os canônicos da regra embutida (`normUnidadeMedida`: UN/UND/UNID = UNIDADE…) do
  texto como escrito E da chave ("U.N.D" → UND → UNIDADE) e o plural de uma grafia cadastrada ("CAIXAS" → CAIXA) — UMA
  unidade candidata é a sugestão; duas ou mais, nenhuma (nunca adivinha). **Uma grafia pertence a UMA unidade**
  (`conflitoUnidade` → 409). `compararUnidades` junta as escritas equivalentes numa linha (a mais usada à frente), com
  quantos itens de DFD e do catálogo a usam (sem unidade vai à parte); ordem: não cadastradas › sugestões › cadastradas,
  depois o mais usado. Tela (`UnidadesMedidaView` = contêiner): 4 KPIs (`StatMini`: cadastradas · % dos itens com unidade
  cadastrada · grafias não cadastradas/sugestões · itens sem unidade) + **Unidades cadastradas** (`DataTable` — lista
  ORDENADA: colunas `filter:"none"`, a posição é a da ordem gravada — + **`AcoesCadastro`** ↑/↓/editar/excluir; na
  CONSULTA tocar na linha abre os dados — quem edita usa o lápis: sem linha-botão com botões dentro) + **Comparação com os
  itens** (**`ComparacaoUnidades`**, apresentacional): as escritas da linha na
  **`CelulaLista`** (quantos itens cada uma na dica; o filtro acha a linha por QUALQUER escrita); na não cadastrada, ESCOLHER
  a unidade num `select` (a sugestão vem escolhida e marcada "(sugestão)") e CONFIRMAR em **"Adicionar"** (desabilitado sem
  escolha; escolher não grava) ou **"Cadastrar"** com a PROPOSTA pronta (`propostaUnidade`: o grupo = a linha + as demais
  NÃO cadastradas que compartilham um canônico com ela; nome = o canônico do sistema, sigla = a escrita mais curta,
  sinônimos = as demais); **"Adicionar N sugestões"** grava cada sugestão na unidade escolhida na linha (em lotes de 200).
  O botão acionado mostra o andamento e TODAS as ações travam até o fim. Editor **`EditorUnidadeMedida`**: sigla, nome,
  sinônimos (`CampoLista`), a classificação indicada (**`SelectField`**) e a PRÉVIA das grafias dos itens que a unidade
  passa a cobrir; conflito ⇒ aviso e "Salvar" travado.
- **2) CLASSIFICAÇÃO AUTOMÁTICA dos itens (`criarClassificador`):** pela descrição — vence a palavra-chave que aparece
  **PRIMEIRO** (o produto vem no início: "SERVIÇO DE MANUTENÇÃO EM CADEIRAS" = serviço); na mesma posição, a mais **LONGA**
  ("MATERIAL DE LIMPEZA" vence "MATERIAL"); depois, a **ordem** do cadastro (↑/↓). Cada palavra da palavra-chave casa o
  **INÍCIO** da palavra da descrição (CADEIRA acha CADEIRAS) — as de até **3 letras, só inteiras ou no plural** (KIT acha
  KITS, GÁS acha GASES; AR não acha ARMÁRIO; DE não acha DESCARTÁVEL — `casaPalavra`/`basesCurtas`) —, sem acento/caixa/
  pontuação dos dois lados (`palavrasDe`). Sem palavra-chave, vale a classificação
  que a **UNIDADE cadastrada** do item indica; sem nenhuma, **"Não classificado"**. Índices montados uma vez (1ª palavra:
  exata ou prefixo); cada chamada para na 1ª posição que casa (20 mil descrições no teste de escala). **Uma palavra-chave
  pertence a UMA classificação** e o nome é único (`conflitoPalavra`/`nomeEmUso` → 409). Tela (`ClassificacoesView` =
  contêiner): 4 KPIs (classificações · % dos itens classificados · não classificados · % do valor — "…" enquanto os itens
  chegam, "—" + "itens indisponíveis" se não carregarem) + **Classificações cadastradas** (lista ORDENADA, colunas
  `filter:"none"`: palavras-chave, as unidades que a indicam, itens, valor dos DFDs, ↑/↓; na consulta tocar na linha abre
  os dados) +
  **Classificação dos itens** (**`ClassificacaoDosItens`**, memorizada: cada descrição DISTINTA dos itens dos DFDs e do
  catálogo — inclusive o item SEM descrição, classificado só pela unidade — com a classificação, o motivo, a unidade, os
  itens e o valor; o filtro "Não classificado" acha as palavras que faltam; tocar na linha abre o detalhe inteiro — a
  descrição completa, sem depender da dica no celular), classificada NO NAVEGADOR sobre as descrições carregadas UMA vez por
  abertura (não mudam com o cadastro). Editor **`EditorClassificacao`**: nome, cor (`ColorField`), palavras-chave e a
  **PRÉVIA AO VIVO** (quantos itens a classificação passa a ter, quantos vêm de outra e quantos saem, com exemplos — cada um
  com a unidade) antes de gravar.
- **Gravação (as duas telas):** os editores têm o PRÓPRIO rascunho (`inicial` → `onSalvar(rascunho)`; digitar não
  re-renderiza a tela de trás; o título vem do `inicial`). Hook **`useGravacaoCadastro`** (`src/components/`): UMA gravação
  por vez (trava por ref — dois toques no mesmo quadro não passam) numa FILA única de módulo (trocar de visão no meio de uma
  gravação remonta a tela, e a próxima gravação espera a anterior — nunca correm juntas no servidor), o desfecho no aviso
  flutuante (sucesso; só EM PARTE ⇒ aviso âmbar com as duas contas — "N adicionada(s); M não — grafia: motivo"; nada entrou
  ⇒ erro com o motivo) e o cadastro RECARREGADO depois — também na falha (outra pessoa pode ter mudado algo); reordenar é
  otimista e só recarrega se falhar. Depois de gravar recarrega SÓ o cadastro (`GET /api/catalogo/unidades-medida?uso=0`; as
  descrições e o uso das grafias ficam — não mudam com o cadastro). Recarga que falha com a tela já montada ⇒ **`ErroCarga`**
  âmbar no topo ("A lista pode estar desatualizada" + "Tentar de novo", que recarrega PELA MESMA trava — nunca chega fora de
  ordem com uma gravação); a 1ª carga que falha ⇒ `ErroCarga` vermelho. Na comparação, a escolha de uma unidade que deixou
  de existir volta à sugestão.
- **Escopo:** os itens de DFD seguem a unidade ativa do cabeçalho (`getReparticaoFiltro`; "Geral" = todos — como a Mesa); os
  do catálogo são globais; o cadastro é global.
- **Mesa → Itens:** o cadastro chega JUNTO com os itens — `GET /api/dfd/itens` devolve `padronizacao` (`listarPadronizacao`,
  FAIL-SAFE: falhou ⇒ `null`, a lista segue) —, então só é buscado com a visão Itens aberta (a Mesa não carrega nada a mais)
  e acompanha a recarga dos itens (Mesa principal e Mesa do PCA). Com unidades cadastradas, a coluna **"Unid. cadastrada"**
  (**`CelulaUnidadeCadastrada`**: a sigla, ou "Não cadastrada" em âmbar; sem unidade = "—"); com classificações, a coluna
  **"Classificação"** (**`CelulaClassificacao`**: ponto na cor da classificação, o motivo na dica). As MESMAS nas visões
  Normal, **Consolidada** (listas + filtros no nível do ITEM — `atributoItem.classificacao`/`unidCad`) e no detalhe
  (`ComposicaoItem`). Sem cadastro, as colunas nem existem. A unidade é memorizada pela GRAFIA (poucas distintas entre
  milhares de itens) e a classificação por item (`WeakMap`).
- **Rotas** (envelope `http.ts`; leitura = Visualizar o Catálogo, escrita = Configurar o Catálogo + auditoria `unidade_medida`/
  `classificacao_item`): `GET`/`POST /api/catalogo/unidades-medida` (GET = cadastro + classificações + o USO das grafias;
  `?uso=0` = só o cadastro), `PATCH`/`DELETE /api/catalogo/unidades-medida/[id]`, `PATCH /api/catalogo/unidades-medida/ordem`,
  `POST /api/catalogo/unidades-medida/sinonimos` (`{itens ≤ 200}` → as grafias viram sinônimos num lote atômico e
  CONDICIONAL — compare-and-set: cada unidade só é gravada se a lista dela ainda é a lida, `gravarSinonimosSeIgual` em
  **`padronizacao-sql.ts`**, testado pelo driver D1 REAL dentro de `db.batch`; a unidade que não existe mais, a grafia sem
  letras/números, a de OUTRA unidade, a mesma grafia pedida para duas, o excesso além do teto e a unidade alterada no meio
  viram `falhas`, cada uma com a grafia e o motivo DELA; devolve SEMPRE o relatório `{adicionados, falhas}` — também quando
  nada entrou; auditoria só das unidades gravadas), `GET`/`POST
  /api/catalogo/classificacoes`, `PATCH`/`DELETE /api/catalogo/classificacoes/[id]` (excluir zera a classificação das
  unidades no mesmo lote e registra no histórico CADA unidade afetada), `PATCH /api/catalogo/classificacoes/ordem` e `GET
  /api/catalogo/classificacoes/itens` (as descrições distintas, agregadas no banco). Cliente único `padronizacao-cliente.ts`
  (`chamarPadronizacao`).

## PCA como ESPAÇO (card 4:5 → Dashboard · Orçamento · Mesa/Importação · Configuração) — migração `0033`
- **O que é:** o PCA virou um espaço próprio. `/painel/pca` (`PcaModuleView`) mostra os planos em **cards 4:5** (`PcaCard`/
  `PcaCapa`: capa escolhida OU capa padrão = degradê accent + o **ano gigante**; `Badge` Publicado/Preview + a FONTE; nome, Σ e
  contagens sobre o véu `--veu-capa`; grade fluida `auto-fill minmax(22rem)` com o card até 30rem, o texto proporcional ao card por container query e, com capa, uma faixa desfocada sob o texto) + o card **"+" Novo PCA** (`PcaNovoCard`: nome, ano, fonte). Clicar entra em
  **`/painel/pca/[id]`** (`PcaEspacoView` — ENXUTO como a tela do orçamento: UMA linha de cabeçalho — voltar · nome · ano ·
  status · fonte; a capa fica no card e na Configuração — e as abas `AbasEspaco` com as ferramentas da aba à direita; `?aba=`).
- **Modelo (aditivo):** `pcas` ganhou **`fonte`** (`lista` = planilhas | `protocolo` = DFDs via protocolos), **`status`**
  (`preview`/`publicado`), **`capa`** (data-URL WebP 800×1000, `capaSchema` — só `data:image/(webp|jpeg|png)`), `publicado_em` e
  **`orcamento_visao_id`**. `unidades.pca_id` (FK cascade) — a planilha pertence a um PCA e a unicidade do código virou **por PCA**
  (`unidades_pca_codigo_uq`; `/api/upload` `start` exige `pcaId`, só PCA de lista). **O que se vincula ao PCA é o DFD**
  (`pca_dfds` + `acao` incorporar/substituir/excluir, `substitui_dfd_id`, `vinculado_por/em`); o protocolo é o veículo.
  `protocolo_situacoes` ganhou `permite_mover_pca`/`camada_pca` — **DORMENTES desde a `0035`** (a situação não interfere
  mais no PCA; sem código). **Legado:** as planilhas atuais
  viraram um PCA "lista pronta" **publicado** (a tela inicial não muda) e as edições que já uniam DFDs viraram fonte `protocolo`.
- **Núcleo PURO `pca-core.ts`** (testado): `motivosNaoEnviar` (travas: fonte protocolo · situação que permite · `ano_pca` do
  protocolo = ano do PCA · ter DFD · não estar já em um PCA), `motivosNaoIncorporar` (na Mesa deste PCA · não incorporado · DFD
  livre — um DFD em UM PCA), `motivoNaoDevolver` (enviado ou incorporado — o incorporado segue editável, ver "Mesa do PCA" abaixo),
  `acaoSugerida(assunto)` (EXCLUSÃO→excluir, ALTERAÇÃO→substituir, resto→
  incorporar), **`consolidarPca(linhas)`** (cronológico; 1 DFD vigente por nº de planejamento; substituir/excluir sem par
  ⇒ aviso), `previsaoDoDfd` (seção PREVISÃO → mês/ano; ANUAL espalha nos 12 meses) e **`agregarDashboard`** (as MESMAS formas de
  `queries.ts`). **Dashboard ÚNICO:** o painel e a tela inicial mostram o MESMO (tudo o que foi incorporado — os itens ATIVOS
  dos DFDs vigentes); não há camada Preview/Publicado. Acesso em **`pca-espaco.ts`** (`listarPcasCards`,
  `listarPcasPublicados`, `dashboardDoPca` [lista = SQL de `queries.ts` com `pcaId`; protocolo = itens consolidados em JS],
  `orcamentoDoPca`, `enviarProtocolo`/`devolverProtocolo`/`incorporarProtocolo`, `itensNumeradosDoPca`/`retirarItensDoPca`, `capaDoPca`, visões).
  Schemas em `pca-espaco-validation.ts`. **A capa NÃO trafega nas listas:** `PcaEspaco.capa` é a URL **`GET /api/pca/[id]/capa?v=`**
  (versão = `atualizado_em` + tamanho; cache `immutable`, como a foto do usuário); `PcaCapa` dimensiona o ano por container query
  (`cqw`) — cabe no card e na miniatura do cabeçalho.
- **Abas:** **Dashboard** = `PainelPca` (os MESMOS KPIs/gráficos/`ItemTable` do público — a coluna Seq. mostra o nº do item NO PCA). **Orçamento** = `OrcamentoPca` — SEM avisos no topo (a prévia vira o hint do KPI "Planejado no PCA"; sem orçamento do ano,
  a tabela diz no vazio): a **ENGRENAGEM** (só ícone, quem Configura o PCA, no FIM da linha de controles, à direita — no
  PCA × Orçamento depois do Relatório; no Comparativo pelo slot `OrcamentoComparativo.fim`; ponto âmbar = a visão tem
  valores fora deste orçamento) + a coluna **VÍNCULOS por linha** (com Configurar no Orçamento, na visão Por unidade; a linha com ações do orçamento SEM
  vínculo mostra "N sem vínculo" em âmbar — calculado na hora sobre os vínculos gravados): com o mouse, a **`DicaFlutuante`**
  (DS — dica rica por portal, presa à tela; foco também; some ao rolar/Esc) mostra o **`ResumoSemVinculo`** (o total + a lista
  POR unidade do orçamento, cada ação com a dotação; até 12 — `listaSemVinculo` — e "e mais N") e o toque abre UM banner,
  **`VinculosDaUnidade`** (DS): o resumo em `StatMini` (Total · Vinculado · Sem vínculo), a seção **Unidades do orçamento** (as ligadas à
  unidade da linha num acordeão — cada uma abre ali o editor com a unidade CADASTRADA FIXA, `EditorVinculoOrcamento
  fixo="alvo"`, a lógica invertida da aba Vínculos — + "Adicionar"; a que tem ações sem vínculo leva o selo âmbar "N sem vínculo", com a lista na dica — abrir é vinculá-las:
  UMA lista só, nunca a mesma unidade duas vezes); na linha "Sem vínculo", a seção **Sem vínculo** (as ações que nenhum
  vínculo leva, por unidade do orçamento, em âmbar; tocar abre o editor) de todo o orçamento (`fixo="cubo"`, sugestão pré-escolhida); **PDF** no cabeçalho (`BotaoAcao`, com Exportar): KPIs Total ·
  Vinculado · Sem vínculo e só DUAS tabelas — **Ações vinculadas** e **Ações sem vínculo** (Unidade do orçamento · Ação ·
  Dotação), cada uma com a linha **TOTAL** em destaque. Núcleo puro **`vinculos-unidade.ts`** (`vinculosDaLinha`,
  `semVinculoPorAlvo`, `listaSemVinculo`, `blocosVinculosDaLinha` — testado). O editor é MINIMALISTA: o lado fixo pela
  tela vira um valor estático (`CampoFixo`) e, no banner da linha (`fixosNoContexto` — o acordeão e o título já dizem as
  duas unidades), some; a lista **Ações n/m · R$** (caixa "todas"; desmarcada = esmaecida, o destino só quando vai a outro
  vínculo), embaixo "Incluir ações futuras desta unidade" (= "as demais"; ou a nota de quem já as leva) e as de outros
  vínculos numa linha só com cadeado ("Em outros vínculos: 2 em GGIM", a lista na dica); botões no padrão (Excluir só ícone, Cancelar/Salvar `sm`). A gravação
  é a da aba Vínculos (`useGravacaoVinculos`, `OrcamentoVinculosAba.tsx`) → `router.refresh` (o orçamento do PCA recalcula)
  abre **`VisaoOrcamentoPca`** — escolher a visão do PCA (grava na hora, `PATCH /api/pca/[id]`, o mesmo da Configuração) e,
  com Configurar no Orçamento, **Editar esta visão**/**Nova visão** (a nova já vira a do PCA) no `EditorVisaoOrcamento` sobre
  os lançamentos do orçamento do ano (os do Comparativo — sem consulta nova); o Comparativo acompanha a visão do PCA quando
  ela muda (`visaoInicial` re-sincroniza) e o KPI Dotação diz QUAL orçamento do ano é usado (o importado por último); KPIs Dotação <ano> (filtrada pela visão) · Planejado ·
  Saldo · Comprometido % e o **comparativo por unidade** (`orcamento-comparativo.ts` puro: faixas < 90% verde · 90–100% âmbar ·
  > 100% vermelho; lançamento sem vínculo → "Sem vínculo"; Todas/Acima/Dentro; XLSX/PDF no rodapé; CORES na tela e no PDF: o Orçamento em azul (`--accent`), o Órgão como está e TODAS as demais no tom da Diferença — `corDaDiferenca`: negativa vermelho, senão verde) — o CUBO do MESMO ano chega à
  unidade pelos **Vínculos** (`orcamento_vinculos`). **A UNIDADE é o micro** (recebe os DFDs e o orçamento; a linha é
  pelo ID — `reparticoes.id` —, nunca pela sigla) e **o ÓRGÃO é a soma** das unidades dele: "Ver por" **Unidade | Órgão**
  (`comparativoPorOrgao`/`origemDoOrgao`, a origem soma igual à linha); na visão Unidade, a coluna Órgão + o selo "Oculta"
  (duas unidades de MESMA sigla — ex.: a própria de um órgão dual — aparecem distintas). **RELATÓRIO DA COMPOSIÇÃO (PDF A4, didático):** o botão
  "Relatório da composição (PDF)" na linha de controles do PCA × Orçamento (quem Exporta no PCA) → `GET
  /api/pca/[id]/orcamento/relatorio` (`relatorioOrcamentoDoPca`, a MESMA base do comparativo — `baseOrcamentoPca` em
  `pca-espaco.ts`) → núcleo PURO **`orcamento-relatorio.ts`** (`relatorioOrcamentoPca` + `blocosRelatorioOrcamento`, testado):
  1º o PAINEL DAS DEFINIÇÕES, separado (na VISÃO o resumo por dimensão e, de cada dimensão definida, TODOS os valores
  um por linha — os definidos [entram] e os NÃO definidos [ficam fora] com lançamentos e dotação; dimensão não definida = entram todos; `definicoes`: nos VÍNCULOS cada unidade do CUBO Vinculada / Vinculada com exclusões (o que ficou fora foi EXCLUÍDO de
  propósito no vínculo "com as demais") / Parcial (há ação por definir) / Sem vínculo — `situacaoVinculo` —, para QUAL unidade
  vai CADA ação (`porDestino`; tabela em SUB-LINHAS — `linhasDoCubo`: UMA linha por ação, agrupada por unidade de destino, as
  excluídas e as não definidas, cada uma com o valor no CUBO) e as fora
  dos vínculos separadas em excluídas (configurado) × não definidas; e as unidades com contratações com ou SEM orçamento vinculado), depois
  como se calcula + a conta que FECHA (inteiro = retirado pela visão + atribuído às unidades + sem vínculo), o resumo por
  unidade (o MESMO "Orçamento considerado" da tabela), PARTE 1 a visão (igual para todas as unidades — por dimensão o que
  entra e o que fica fora), PARTE 2 cada unidade cadastrada com os vínculos (unidade do CUBO + regra + cada ação: no CUBO,
  retirado pela visão, considerado; ações fora e o destino delas) e PARTE 3 o que NÃO foi considerado (retirado pela visão
  por unidade do CUBO, na visão sem vínculo por ação, unidades com contratações e sem orçamento). O PDF é o gerador de
  DOCUMENTO genérico **`documento-pdf-core.ts`** (layout PURO por blocos — título, seção, subseção, parágrafo, lista,
  destaques, nota, tabela com SUB-LINHAS — `LinhaDoc.continua` mescla as primeiras colunas com a linha de cima, fundo por
  grupo, repetidas com "(continuação)" na quebra de página; A4 em pé, nada cortado, cabeçalho de tabela repetido, título nunca órfão, topo + "Gerado por …
  · Página N de M") + `documento-pdf.ts` (desenha com o pdf-lib, carregado no clique). Enxuta: os KPIs em `StatMini` e, ABAIXO deles, o **COMPARATIVO** em duas
  vistas (`Segmented` no início da linha de controles — `OrcamentoComparativo.inicio`; **PCA × Orçamento** primeiro e aberto, depois
  o Comparativo): **Comparativo** = o MESMO
  `OrcamentoComparativo` da tela do orçamento, sobre o orçamento do ANO do PCA (`orcamentoDoAno` — o importado por último,
  buscado UMA vez e repassado a `orcamentoDoPca`), abrindo na visão da Configuração do PCA (`visaoInicial`, trocável; dados
  do loader único `dadosComparativo`, `comparativo-dados.ts`, as duas telas) | **PCA × Orçamento** = o comparativo por
  unidade (`DataTable scrollInterno` compacta; XLSX nas ferramentas da aba). Sem orçamento do ano, só o por unidade. **Mesa** (fonte protocolo) = `MesaPca` → a MESMA `DfdsView` com
  **`modoPca`** (ver "Mesa do PCA" abaixo). **Importação** (fonte lista) = `PlanilhasPca` (`Dropzone` com `onFiles` — várias
  planilhas em fila — + cards "Planilhas deste PCA" com excluir). **Configuração** = `PcaConfiguracao` (identificação; fonte em
  cartões — travada com dados, 409 no servidor; `Switch` Publicar; travas com link p/ Configurações → Situações [`?aba=`]; visão
  do orçamento; capa com **`RecorteImagem`** — recorte 4:5 próprio, zoom + arrasto/toque, `recorte-imagem.ts` puro).
- **Carga por ABA:** a página monta SÓ a aba ativa (`?aba=`); `PcaEspacoView` troca de aba navegando (`router.push`, sem
  scroll) com esqueleto até chegar. O Dashboard tem o `UnitFilter` (unidade requisitante/planilha) NA LINHA DAS ABAS (`FerramentasAba`, `UnitFilter compacto`).
- **Consulta do Dashboard (tabela) — SÓ DADOS, nenhum erro apontado:** o `ItemTable` (painel e tela inicial) é o MESMO
  `DataTable` das demais telas — todas as colunas filtráveis/ordenáveis (faixa em Seq./Qtd./R$, período na data), `nowrap`,
  `density="compact"`, busca por produto/código (vários com ":"); com `origem` mostra Protocolo · Nº DFD
  (`ItemRow.dfdId/dfdNumero/protocoloNumero/itemNumero`). Em PCA de fonte protocolo, o cartão recebe a `ConsultaPca`
  (ver "CONSULTA PÚBLICA" abaixo — a mesma no painel e na tela inicial).
- **Situações (Configurações → Situações):** só nome + cor + ordem — NÃO interferem no PCA (o protocolo vai à Mesa do PCA
  qualquer que seja a situação).
- **Visões salvas do orçamento** (`orcamento_visoes`, aba **Visões** da TELA DO ORÇAMENTO `/painel/orcamento/[id]` →
  `OrcamentoVisoes`; as visões são GLOBAIS — a prévia do Σ usa os lançamentos do orçamento aberto): nome + por dimensão
  (**`DIMENSOES_VISAO`**: Função, Programa, Elemento, Código, Ficha, Fonte — **unidade, ações e órgão NUNCA entram na
  visão: são dos VÍNCULOS** (`DIMENSOES_DO_VINCULO`; `coerceFiltros` e o Zod as descartam; a migração `0082` as tirou das
  visões gravadas) — visão e vínculo nunca disputam o mesmo lançamento) os valores escolhidos (`SeletorMultiplo suspenso`:
  "Todos" | "N selecionados", busca, marcar/limpar; facetas CONECTADAS) — OU dentro, E entre dimensões (`orcamento-visao.ts`
  puro); `DIMENSOES_ORCAMENTO` (todas) segue como o catálogo da tabela cruzada e dos lançamentos. Uma coluna
  nova do CUBO entra acrescentando a dimensão ao catálogo (e ao parser). Rotas `POST /api/orcamento/visoes` + `PATCH/DELETE
  /api/orcamento/visoes/[id]` (a lista vem do servidor) (auditoria `orcamento_visao`). **SINCRONIA com o QDD e os PCAs:** a visão guarda o TEXTO dos valores, então `valoresAusentes(linhas, filtros)`
  (`orcamento-visao.ts`, puro/testado; + `contarAusentes`/`semAusentes`) aponta o que o orçamento ATUAL não traz (QDD reenviado
  ou texto mudado — esses valores não contam nada): na aba Visões (coluna Filtros "· N ausente(s)" + coluna **PCAs** que a
  usam — `listarVisoesOrcamento` traz `pcas`), no editor (**`EditorVisaoOrcamento`**, DS — o MESMO na aba Visões e na
  engrenagem do PCA: as explicações — o que a visão filtra e os PCAs que a usam — na Ajuda (?) do cabeçalho; no corpo só os
  ausentes com "Remover ausentes" — a dimensão que esvaziaria confirma —, prévia do Σ), e no orçamento do PCA (`orcamentoDoPca.ausentes` → o ponto da engrenagem). **REIMPORTAR = SUBSTITUIR + VISÕES QUE SE
  ADAPTAM:** a substituição (`POST /api/orcamento/[id]/substituir`) roda **`adaptarVisao(filtros, lançamentos novos)`**
  (puro, testado) em todas as visões: o valor que o QDD novo não traz ganha o EQUIVALENTE único na mesma dimensão — o mesmo
  CÓDIGO (antes do " - ") ou o mesmo NOME (código novo) — ACRESCENTADO (nunca tira: a visão é global e o valor ausente não
  soma nada); ambíguo/sem equivalente = não mexe; auditoria "adaptada ao QDD novo". Excluir uma visão diz quais PCAs voltam ao orçamento
  inteiro (confirmação e auditoria).
- **Tela inicial `/`:** `PcaSeletor` (dropdown) com os PCAs **publicados** (`?pca=`; padrão = ativo, senão o mais recente) +
  `UnitFilter` (planilha na lista; unidade requisitante no protocolo); o MESMO Dashboard do painel. O `Switch` Publicar só decide se o PCA aparece ali.
- **CONSULTA PÚBLICA (painel e tela inicial, PCA de fonte protocolo) — `ConsultaPca`:** `Segmented` **Protocolos · DFDs ·
  Itens** (`DashboardPca.protocolosLista`/`dfdsLista`/`itens`; `PlanilhaDfds semEstado`, `ItemTable origem`) — NUNCA aponta
  erro/aviso. Os itens são TODOS (sem teto — vão ao `DashboardPcaCliente` como UM texto COMPACTO `{c: campos, l: tuplas}` — `itensParaTexto`/`itensDoTexto`, `itens-dash-texto.ts`, testado —, montado UMA vez por versão dentro do memo do `dashboardDoPca`, `DashboardPca.itensTexto`).
  No PAINEL, **"Fora da soma (N)"** (só com N > 0; `ConsultaDashboard.foraDaSoma`): os DFDs vinculados/da prévia que a
  consolidação tirou — núcleo puro `foraDaSoma(linhas, consolidacao)` (`pca-core.ts`, testado: vínculos − vigentes; motivo
  `substituido`/`excluido`/`exclusao` + o outro DFD) → `DashboardPca.foraDaSoma` (`DfdForaDaSoma`, motivo por extenso; o hint
  do KPI de itens diz "N fora da soma"); só leitura, exportável. A linha abre o **`BannersConsulta`** (contêiner leve, NÃO os hooks de edição da Mesa): a MESMA pilha/ordem/larguras
  do `BannersMesa` (`LARGURA` exportado) com `ProtocoloView modoCapa="consulta"`, `DfdView consulta` e `ItemDetalhe consulta`
  (campos **`CampoCongelado`** — a caixa do campo, SEM cadeado; seções idem; sem estado, pendências, catálogo,
  conciliação, sobrescritos, aviso de incorporado; das assinaturas só o bloco **"Responsável pela solicitação"**); o cabeçalho do
  item traz o **nº do DFD + planejamento**; o histórico é `Historico anonimo` (sem autor; `HistoricoDoItem` recebe a `url`).
  **Dados higienizados NO SERVIDOR** (núcleo puro `pca-publico-core.ts`, testado): `dfdPublico` (sem matrícula/e-mail/telefone/
  assinaturas; só itens ATIVOS no PCA, totais recomputados), `solicitantePublico` (sem matrícula/código/data da assinatura),
  `historicoPublico` (só linhas de protocolos INCORPORADOS ao PCA, sem autor, sem chaves pessoais nem assinaturas no diff) e
  `mascararTexto` (CPF/CNPJ/e-mail/telefone/matrícula em TEXTO LIVRE — seções, capa, diff). Rotas GET **públicas**
  `/api/pca/[id]/consulta/dfd/[dfdId]`, `/consulta/protocolo/[protocoloId]` (capa sem CPF/CNPJ) e `/consulta/historico?dfd=|protocolo=`
  → `consultaDfd`/`consultaProtocolo`/`consultaHistorico` (`pca-espaco.ts`): só PCA de fonte protocolo **publicado** (ou
  usuário logado — o painel vê o Preview) e só DFD/protocolo **incorporado** a ESTE PCA (senão 404). O banner do protocolo
  lista só os DFDs que CONTAM (os vigentes — `consolidarPca` com a prévia — com itens ativos; valor = gravado − inativos):
  a MESMA conta da tabela da consulta e do Dashboard (um "excluir" ou um substituído não soma). O calendário também
  desconta os itens retirados (`cronogramaPcas`).
  Os gráficos + a consulta são UM cliente, **`DashboardPcaCliente`** (os `itens` trafegam uma vez; `PainelPca` segue server
  com os KPIs e recebe `consulta` como DADOS `{pcaId, protocolos, dfds}`); a `ConsultaPca` é CONTROLADA (`aberto`/`onAbrir`) e
  há UM `BannersConsulta`, compartilhado com a origem dos gráficos.
- **ORIGEM DOS DADOS (padrão de TODO gráfico/linha de comparativo) — componente `OrigemDados`** (`Modal` xl: o recorte
  clicado em `StatMini`s + a FONTE num `Callout` + avisos + a tabela das linhas que formam o número). **Soma do detalhe =
  número clicado** (as funções de recorte usam a MESMA chave da agregação, testadas):
  - **Orçamento do PCA** (`OrcamentoPca`, `onRowClick` + `activeKey`): `Segmented` **Orçamento** (os lançamentos do CUBO da
    unidade — `DataTable` Órgão/Unidade no CUBO/Elemento/Código/Dotação) | **Contratações do PCA** (`ItemTable origem` → o item
    abre o `BannersConsulta`; na fonte lista, as planilhas). `orcamentoDoPca` devolve `linhas` com o lançamento
    (`LancamentoOrcamentoPca`) e `planejado` POR ORIGEM (`PlanejadoOrcamentoPca`: um por item — `itemRowConsolidado`, o MESMO
    mapeamento do Dashboard — ou por planilha); `origemDaLinha`/`chaveUnidadeComparativo` (`orcamento-comparativo.ts`) = a
    regra do "Sem vínculo" da agregação.
  - **Gráficos do Dashboard do PCA — FILTRO CRUZADO + EXPLORADOR (v1.7.0):** tocar numa fatia/barra/legenda FILTRA (alternar)
    os demais gráficos, os KPIs (agora no `DashboardPcaCliente`; o "Maior item" abre o item) e a Consulta (itens filtrados +
    os DFDs/protocolos com itens no filtro) — UM filtro por gráfico, E entre eles, cada gráfico desenhado SEM o filtro da
    própria dimensão (todas as categorias, a escolhida em destaque). Núcleo puro em `origem-dash.ts` (`FiltrosDash`,
    `alternarFiltro`, `filtrarItensDash`, `agregarItensDash` = a MESMA `agregarDashboard` no navegador — sem filtro valem os
    números do servidor; testado em `tests/dashboard-graficos.test.ts`). Os filtros em chips removíveis + "Ver origem" (a
    `OrigemDados` dos itens filtrados) + "Limpar". `ChartCard.onExpandir` → **`ExploradorGrafico`** (DS): ranking de TODAS as
    categorias (`ranking-grafico.ts`: participação, posição com empate, "abaixo de 2%"), o cartão do detalhe com "Filtrar o
    Dashboard", a Tabela (posição · itens · valor · %, XLSX/PDF) e o **PNG** (`exportar-grafico.ts`: layout puro + canvas,
    só com Exportar). Paleta = tokens **`--serie-1…8`** (claro/escuro; `corSerie(i)` p/ HTML, `useChartTokens().serie` p/ o
    Recharts) e a cor de cada classificação fixa pela ordem SEM filtro (`corDe`). Visual único: Cronograma em `Colunas`, Top
    e Unidades em `BarrasH` (Unidades: 10 + "Outras N", Itens | Valor); só a rosca segue no Recharts. **v1.8.0:** mais dois gráficos
    (só com dado) — **Prioridade dos DFDs** (`PrioridadeChart`: cores pela CATEGORIA — `--danger/--warn/--ok/--faint`,
    `PRIORIDADES_DASH`; `ItemRow.prioridade` = `prioridadeDoDfd` lida UMA vez por DFD em `itensConsolidados`) e **Valor por
    unidade** requisitante/planilha (`UnidadeRequisitanteChart`, pelo `ItemRow.codigo`) —, as dimensões `prioridade`/`unidade`
    no `RecorteDash` (`fatiasDash`), o **cronograma em 3 leituras** (`MensalChart` `modo`/`onModo`; desde a v1.18.0: Por
    mês = SÓ os itens com o MÊS DEFINIDO — também o `porMes` do servidor — · Acumulado · **Distribuído** = os genéricos em
    1/12 por mês; o recorte de mês só pega os de mês definido), a **PREVISÃO** separada (v1.18.0 — dimensão `previsao` do
    `RecorteDash`/filtro do topo "Previsão": `previsaoDoItem` = "Mês definido" · Anual · Semestral · Quadrimestral ·
    Trimestral · "Sem previsão", pelo `ItemRow.periodo`/`anual`, `PREVISOES_DASH` com as cores por token): o quadro
    **Definição da Previsão** (`DefinicaoPrevisaoChart`, `charts/PrevisaoChart.tsx` — `definicaoDash`: Mês definido ×
    Genérico × Sem previsão com valor, itens e %, Σ = o valor) e **Contratações Periódicas** (`PeriodicidadeChart` —
    `periodicosDash`), só no PCA de fonte protocolo; o ano da previsão de cada item = o do PCA (`previsaoDoDfd(secoes,
    pca.ano)` em `itensConsolidados` e `cronogramaPcas`) — e o **Relatório (PDF)** na barra
    dos filtros (`blocosRelatorioDashboard`, `dashboard-relatorio.ts`: KPIs, filtros e uma tabela por gráfico com % e TOTAL;
    com Exportar). O explorador aceita a cor CSS da categoria (`corDe` → número ou cor). Antes (até a 1.6): a
    prop `onSelecionar(recorte, rótulo)` abria a origem; a legenda da pizza vira botões ≥44px; `itensDoRecorte`
    (`origem-dash.ts`, puro: classificação/unidade de medida com "—" p/ vazio e a fatia "Outros" com todos os rótulos; mês
    com os ANUAIS do ano — 1/12 no gráfico; item pelo `id`, que `TopItem`/`TopDash` passaram a trazer). `ItemRow` ganhou
    `ano`/`mes`/`anual`. A lista traz TODOS os itens do KPI (sem teto). **v1.9.0 (imersivo):** os FILTROS DO TOPO
    (**`FiltrosDashboard`**, DS — um `SeletorMultiplo suspenso` por dimensão: Classificação · Mês [os anuais = a opção "Anuais
    de AAAA"] · Prioridade · Unidade · Unidade de medida; núcleo puro `opcoesDash` [opções CONECTADAS com a contagem, a
    escolhida zerada fica para desmarcar, "—" no fim] / `chavesDoFiltro` / `recorteDasChaves` [mês = cada mês SEM os anuais,
    vários pelo `extras`] / `rotuloVarios`) ligam os MESMOS `FiltrosDash` do toque nos gráficos; abaixo deles, os chips, "N
    itens · R$", Ver origem, Limpar e o Relatório. Abas **Gráficos | Consulta de itens (N)** (`Segmented` + morph; a Consulta
    saiu de baixo dos gráficos). O gráfico de itens é o **TOP 100** (calculado no navegador sobre os itens sem o filtro de
    item; `TopItensChart alturaMax` = a lista rola por dentro, com a posição; o explorador e o relatório usam os mesmos).
    Animações (todas desligam com "reduzir movimento"/`data-motion`): KPIs que correm até o valor (`useContagem`) com o
    fundo `KpiStat realce`, os cartões entrando em sequência (`.grafico-entrada` + `--atraso`), barras/colunas que crescem
    (`.grafico-barra`/`.grafico-coluna`) e a rosca com a fatia em foco ampliada e o valor dela no CENTRO. `MensalChart.ativos`
    = vários meses (`mesesDoRecorte`).
  - **Dashboard de governança da Mesa** (`DashboardMesa`, prop `onAbrir` → a pilha `BannersMesa`): o gráfico único (`BarrasH`
    com `acao` + `LinhaBarra.clicavel` p/ "Sem …"/"Outras N"; `Colunas.onEscolher` no Dado Data) e as linhas do desempenho →
    `graficoMetricas(…).origem(chaves)`/`protocolosDaPessoa` (`mesa-metricas.ts`, a MESMA lista de lançamentos das barras); a
    barra zerada não abre (não há o que listar).
  - **Métricas das Integrações** (`MetricasChart.onSelecionar`): o dia + a tabela dos 7 dias + a fonte (Cloudflare GraphQL).
- **Rotas:** `POST /api/pca` (com `fonte` = espaço; com `dfdIds` = edição legada), `PATCH /api/pca/[id]` (nome/ano/fonte/status/
  capa/visão), `POST /api/pca/[id]/protocolos` (enviar · devolver · incorporar), `POST /api/pca/[id]/itens` (retirar), `GET /api/pca/[id]/capa`
  (Visualizar o PCA), `DELETE /api/pca/[id]/planilhas/[unidadeId]` — as de escrita pelo papel no PCA (criar/Configuração =
  Configurar; excluir o PCA, a planilha e retirar itens = Excluir; importar planilhas = Importar) + auditoria `pca`.

### Mesa do PCA INDEPENDENTE + incorporação (editável — `0077`) — migração `0034`
- **Modelo (aditivo):** `dfd_protocolos` ganhou `pca_id` (FK `pcas` **set null** — o protocolo está na Mesa desse PCA),
  `pca_enviado_em`/`pca_enviado_por` e **`pca_incorporado_em`** (≠ null ⇒ INCORPORADO — editável, o PCA acompanha). Excluir o PCA devolve os
  protocolos à Mesa principal (`excluirPca` zera os campos no mesmo lote; `pca_dfds` cascade).
- **Fluxo:** Mesa principal → seleção de protocolos → **"Enviar ao PCA"** (`EnviarAoPca`, na `BarraSelecao`: escolhe um PCA de
  fonte protocolo — sugerido pelo ano —, mostra Vai/Não vai por protocolo com `motivosNaoEnviar`). O enviado **SOME da Mesa
  principal** (`listarProtocolos`/`listarDfds`/`listarItensDfds` só com `pca_id IS NULL`) e aparece **só** na Mesa daquele PCA
  (`carregarMesa(u, pcaId)` — escopo pelas unidades ACESSÍVEIS, não pela ativa do head; itens por `GET /api/dfd/itens?pca=`).
  Na Mesa do PCA (`MesaPca`): `Segmented` **Todos | Enviados | Incorporados**, coluna "PCA" (Enviado [motivos no `title`] /
  Incorporado · ação) e as ações da seleção **Incorporar** (modal com a ação por protocolo: incorporar/substituir/excluir,
  sugerida pelo assunto; grava `pca_dfds` + a NUMERAÇÃO dos itens + `pca_incorporado_em` num lote atômico) e **Devolver à
  Mesa** (o enviado e o incorporado — desincorpora) — junto do editor de massa. Só o incorporado conta no
  Dashboard/Orçamento do PCA. Rota única `POST /api/pca/[id]/protocolos` (`acaoProtocolosPcaSchema`, ≤ 50, Manipular no PCA — enviar também na Mesa,
  escopo por unidade, `{alterados, falhas}`, auditoria por protocolo com a ação REAL).
- **PROTOCOLO INCORPORADO 100% EDITÁVEL (migração `0077`, aditiva — sem a antiga TRAVA):** o incorporado faz TUDO o que o
  protocolo comum faz — editar capa/DFDs/itens/assinaturas, massa nas 3 visões (na Mesa do PCA também), reenviar, sobrescrever
  DFD, "Atualizar" tratando, mover DFD, unificar/remover itens, EXCLUIR DFD e protocolo (também o só ENVIADO) e **Devolver à
  Mesa** (desincorpora). O papel decide como sempre (Manipular/Importar/Excluir na Mesa do PCA). O PCA ACOMPANHA na hora
  (Dashboard, Orçamento, cards, consulta pública) — **`pca-sincronia.ts`** (núcleo puro **`pca-numeracao-core.ts`**, builders em
  `pca-itens-sql.ts`, testados no driver D1 real):
  - **O nº do item segue o ITEM:** toda regravação (`start-dfd`/`append`, "Salvar" — `reescreverDfdItens`) guarda o RETRATO
    do item no nº (`pca_itens.codigo/descricao/unidade/item`, `retratarNumeros`) antes de apagar; `numeracaoDaGravacao`
    pareia as linhas novas com os nºs livres (`parearNumeros`: código+descrição+unidade+nº do item → código+descrição+unidade →
    código+descrição → nº+código → nº+descrição; cada nº uma vez) e as linhas levam o nº (`religarNumeros`). Com a gravação
    COMPLETA, o item novo ganha o próximo nº do PCA (`numerarItensDoDfd`) e o nº que ficou sem item é **BAIXADO**
    (`pca_itens.baixado_em` — inativo para sempre, nunca reaproveitado; o retirado segue retirado). A massa de itens baixa o
    nº do removido no mesmo lote.
  - **O DFD está no PCA do protocolo INCORPORADO em que está** (`pca_dfds.protocolo_id` = por onde entrou; NULL = vínculo de
    edição legada, nunca tocado): `sincronizarDfdNoPca` (depois de toda gravação/vínculo — estado, idempotente) põe o DFD que
    entra (a ação dos outros DFDs do protocolo, senão a sugerida), tira o que sai (nºs baixados, o item sem nº) e troca o
    protocolo do vínculo no mesmo PCA — a AÇÃO passa a ser a do protocolo novo (`trocarProtocoloDoVinculo`, a régua do
    `vincularDfdAoPca`). O DFD com vínculo LEGADO em OUTRO PCA não entra por incorporação (um DFD em UM PCA). Excluir
    DFD/protocolo e Devolver baixam os nºs no mesmo lote; `sincronizarAtivosPca` (também a cada gravação COMPLETA e troca — o
    planejamento/ação podem ter mudado) inativa os não vigentes e REATIVA o substituído quando quem o substituía sai.
  - **Tela:** no lugar do cadeado, o aviso informativo `avisoIncorporado` nos banners do protocolo e do DFD; as confirmações de
    excluir/devolver dizem o impacto (`impactoSaidaPca`). Única recusa que fica: a re-importação por Id que FUNDIRIA (excluiria)
    um protocolo em um PCA em outro já existente no nº novo (409 — devolva-o antes; `pcaDeProtocolos`, `trava-pca.ts`).
  - **Desfazer** da importação que falhou no meio: segue a régua `gravacaoParcial` (a permissão: Importar em vez de Excluir).
- **VISÃO DOS MARCADOS (migração `0063`, aditiva — `pcas.mesa_marcados`, default desligado):** em **PCA → Configuração**
  (`PcaConfiguracao`, `Switch` "Mostrar os marcados da Mesa do sistema"; `PATCH /api/pca/[id]` `{mesaMarcados}` +
  auditoria), a Mesa do PCA lista também os protocolos MARCADOS com o ano dele (`ano_pca`, a MESMA régua do filtro de PCA do
  cabeçalho — `filtroAnoPcaProtocolo`/`filtroAnoPcaDfd`) que ainda estão na Mesa do SISTEMA (`pca_id IS NULL`; os de OUTRO
  PCA não entram; o DFD AVULSO, sem protocolo, nunca — `isNotNull(dfds.protocoloId)`). O SERVIDOR decide pela configuração (`anoMarcadosDoPca`, `pca-espaco.ts`): `carregarMesa(u, pcaId)` →
  `listarProtocolosDoPca(pcaId, anoMarcados)` e `listarDfds`/`listarItensDfds(…, anoMarcados)` (`escopoMesa(pcaId, ano)` =
  `pca_id = P OR (pca_id IS NULL AND ano)`), e o `GET /api/dfd/itens?pca=` lê a mesma configuração. Na `MesaPca`
  (`marcados`): a coluna **Local** (`localDoProtocolo`, `pca-core.ts` puro — `sistema`/`enviado`/`incorporado`, a fonte única
  da coluna, do escopo e das ações; dica com `motivosNaoEnviar`), o escopo **Todos | Na Mesa do sistema | Enviados |
  Incorporados** e, na seleção, **"Enviar a este PCA (n)"** (o `EnviarAoPca` com **`pcaFixo`** — sem o seletor de PCA);
  Incorporar/Devolver seguem só para os enviados. Os da Mesa do sistema seguem na Mesa principal, sem trava (`estaTravado`
  = só o incorporado); a numeração dos itens segue só do incorporado. `ProtocoloResumo` ganhou `pcaEnviadoEm`.
  - **SÓ EM PREVIEW = PRÉVIA DO PCA (`previaAtiva`, `pca-core.ts` puro):** a visão vale só num PCA de fonte protocolo, com
    ano e em **Preview** — ligar num PCA publicado → 409; **publicar DESLIGA** (`PATCH /api/pca/[id]`; migração `0064` desliga
    nos já publicados); o `Switch` fica travado com o PCA publicado. Ligada, o **Dashboard e o Orçamento do PAINEL** (e o card
    do PCA — "· prévia") somam como PRÉVIA os DFDs ainda não incorporados: **`vinculosPrevia`** (`pca-espaco.ts`) = os DFDs
    que não estão em NENHUM PCA dos protocolos ENVIADOS a este PCA e não incorporados + dos MARCADOS na Mesa do sistema, com a
    ação sugerida pelo assunto (`acaoSugerida`) e DEPOIS dos reais na ordem — a MESMA consolidação (`consolidarPca`) dentro de
    `itensConsolidados` (`previa: {dfds, protocolos}` → `DashboardPca.previa`/`OrcamentoDoPca.previa` → `Callout` "Prévia do
    PCA" no `PainelPca`/`OrcamentoPca`; a fonte da origem dos gráficos diz). Os banners de consulta do painel abrem os
    protocolos/DFDs da prévia (`escopoConsulta`). Nada é gravado; a tela inicial (só publicados) nunca vê a prévia; o
    Calendário (`cronogramaPcas`) segue só com o incorporado.
- **MESA DO PCA DENTRO DA MESA DO SISTEMA (seletor de Mesa, sem migração):** o 1º item da barra da Mesa principal é o
  **`SeletorMesa`** ("Mesa do sistema" | "PCA · nome (ano)" — os PCAs de fonte Protocolos; `DfdsView.seletorMesa`).
  Escolher um PCA navega para **`/painel/mesa?pca=<id>`**, que renderiza o `MesaPca` com o MESMO loader da aba Mesa do
  espaço (**`carregarMesaDoPca`**, `mesa-dados.ts` — `carregarMesa(u, pcaId)` + a ação de cada incorporado + os DFDs em
  outro PCA): escopo, ações, trava, edições `mesa-pca:` e a visão dos marcados conforme a Configuração do PCA (ligada ou
  desligada). As mesas seguem INDEPENDENTES — é só a troca de visão; PCA inexistente/de lista = a Mesa do sistema.
- **Entrada no espaço do PCA:** o card (`PcaCard` com `href`) mostra o **`CarregandoLink`**
  (`useLinkStatus`: o card segue à vista — brilho que varre + barra indeterminada accent na base + um ANEL em CSS que gira [`.animate-girar` —
  o SVG travava com a página ocupada]; só `transform`; parado com "reduzir movimento"; status e fonte em pílulas discretas,
  a base com nome · Σ · contagens numa linha sobre um degradê curto) enquanto o servidor monta a aba — sem `loading.tsx` (dispararia também na troca de aba). Em
  `itensConsolidados` a PREVISÃO sai UMA vez por DFD (o JSON das seções lido por item estourava a CPU do Worker com
  milhares de itens), os lotes correm em paralelo e os itens trazem só as colunas usadas.
- **`BarraSelecao` fixa por PORTAL no `body`:** `position: fixed` dentro de um ancestral com `transform` (o morph das abas do
  espaço do PCA) ficava relativo a ele — a barra saía deslocada e estourava a tela; o lugar no fluxo segue medido onde está
  (remede no `animationend`).

### SEQUENCIAL do item no PCA — migração `0035`
- **Modelo (aditivo):** tabela **`pca_itens`** (`pca_id` cascade + **`sequencial`**, **ÚNICO por PCA** `pca_itens_pca_seq_uq`;
  `dfd_item_id`/`dfd_id`/`protocolo_id` set null; `ativo`, `inativado_em/por`, `motivo`) + o nº no PRÓPRIO item
  (`dfd_itens.pca_id`/`pca_sequencial`). Backfill dos protocolos já incorporados (`ROW_NUMBER() OVER (PARTITION BY pca_id)`).
- **Numeração** (BUILDERS do Drizzle em `pca-itens-sql.ts` — nada de `db.run(sql…)` em `db.batch`; testados pelo driver D1 REAL
  dentro de `db.batch`, `tests/pca-itens-sql.test.ts`):
  `numerarItensDoProtocolo` = `MAX(sequencial)` do PCA (inclui os INATIVOS — nunca reaproveita) + `ROW_NUMBER()` na ordem DFD →
  item, só DFDs vinculados a ESTE PCA com ação ≠ excluir, idempotente (`NOT EXISTS`); `gravarSequencialNosItens` registra no
  item. Os dois rodam no MESMO `db.batch` da incorporação (transação sequencial — sem corrida no MAX). Depois,
  `sincronizarAtivosPca` inativa os números dos DFDs que deixaram de ser vigentes (substituídos/excluídos por outro protocolo).
- **Retirar item do PCA:** Mesa do PCA → Itens → seleção → **"Retirar do PCA"** (`modoPca.acoesItens`) → `POST
  /api/pca/[id]/itens` (`acaoItensPcaSchema` `{acao:"retirar", ids ≤ 100}`, Excluir no PCA, escopo por unidade, auditoria com os
  nºs): o nº fica **INATIVO** (riscado na coluna **"Seq. PCA"** — `modoPca.colunasItens`) e o item sai do Dashboard/Orçamento/cards
  (`itensConsolidados` pula os inativos; `listarPcasCards` desconta via `inativosPorDfd`). O editor de massa da seleção de itens
  só aparece com itens NÃO incorporados. Excluir o PCA zera `dfd_itens.pca_id/pca_sequencial` no mesmo lote.

## Orçamento municipal (relatório CUBO) — migração `0028`
- **O que é:** módulo para subir e consultar o **orçamento** da Prefeitura (dotação por Órgão/Unidade/**Elemento de
  despesa**), a partir do relatório oficial **CUBO.XLSX**. **SOMENTE LEITURA**: importar `.xlsx` (informando o **ano**),
  visualizar e excluir/reenviar — os lançamentos vêm do sistema oficial e NÃO são editados na tela. Aba de módulo
  **`orcamento`** (`/painel/orcamento` = `OrcamentoView`); **admin vê tudo**, **editores** (admin/gestor) importam/
  excluem, demais com a aba só consultam. A migração `0028` concede a aba a quem já vê o `catalogo`.
- **Modelo (`orcamentos` + `orcamento_itens`, ISOLADO — sem FK p/ PCA/DFD):** `orcamentos` (nome, **ano** integer
  obrigatório, `total_itens`, `valor_inicial` = Σ dotação p/ o card sem varrer itens); `orcamento_itens` (orgao/unidade/
  nome_elemento/codigo_elemento + **NOVO PADRÃO DO CUBO (migração `0039`, aditiva): `funcao`/`programa`/`acao`/`ficha`/
  `fonte`** (texto; vazias nos orçamentos importados no padrão antigo) + **6 valores `real`** [emenda impositiva/inicial/suplementação/empenho/saldo/anulação] +
  sequencial; **SEM chave única** — muitas linhas compartilham o mesmo `codigo_elemento`; excluir o orçamento apaga os
  lançamentos, cascade). Acesso em `src/lib/orcamento.ts` (`listarOrcamentos`/`getOrcamentoItens`/`criarOrcamento`/
  `atualizarOrcamento`/`excluirOrcamento`/`inserirOrcamentoItens`); schemas Zod em `orcamento-validation.ts` (puro).
- **Parser DEDICADO (`.xlsx`):** `parse-orcamento-xlsx(-core/-comum).ts` — detecção de colunas **pelo CABEÇALHO, por
  posição** (Órgão/Unidade/Função/Programa/Ação/Nome Elemento/Código/Ficha/Fonte + valores, em qualquer ordem; colunas
  MESCLADAS vazias no meio são ignoradas; `rotuloColunaOrcamento`). **Planilha CONFERIDA antes de importar (nova ou reenvio):** as 15 colunas de `COLUNAS_ORCAMENTO` são OBRIGATÓRIAS (`faltam` — o CUBO antigo, sem Função/Programa/Ação/Ficha/Fonte, é recusado) e cada linha é conferida (`erros` {linha, coluna, motivo}: texto vazio, valor que não é número, Ficha só dígitos, Código com número; até `MAX_ERROS_PLANILHA`=500); o `ImportarOrcamento` mostra as colunas que faltam e a tabela dos problemas e trava o Importar ("Planilha com problemas"); o servidor recusa pelo MESMO critério (`orcamentoItemImportSchema` estrito), com a leitura
  SheetJS no navegador (`raw:false`, fora do bundle do Worker). Pula o título e o **rodapé** ("Qtd. total N"), convertendo
  os valores com **`parseValorPlanilha`** (tolerante a en-US `"5,000,000.00"` E pt-BR `"5.000.000,00"`, inteiros com
  milhar e negativos). Validado contra o CUBO real: **1.345 lançamentos, 18 órgãos, 39 unidades** (bate com o "Qtd. total"
  do arquivo) — e o **CUBO novo** (mesmos 1.345; 17 funções, 41 programas, 242 ações, 1.141 fichas, 31 fontes; Ficha
  preserva o zero à esquerda "0624"). Fixtures (padrão antigo E novo) em `tests/parse-orcamento-xlsx.test.ts`.
- **Import em LOTES (`importar-orcamento.ts` → `POST /api/orcamento`):** discriminada `start-orcamento`|`append-orcamento-itens`
  (espelha `importar-catalogo`: retry de transitório, all-or-nothing — cada import cria um orçamento NOVO; falha apaga o
  parcial). Insert PURO em lotes de **5×17=85** params (< 100 do D1); recomputa `total_itens` + `valor_inicial`. `append`
  é IDEMPOTENTE (apaga `sequencial >= desde` antes de reinserir). Rotas `POST /api/orcamento` + `PATCH`/`DELETE
  /api/orcamento/[id]` (renomear/ano = Configurar, excluir = Excluir; importar = Importar) — envelope `http.ts`, **auditoria** (`registrarAuditoria`,
  entidade `orcamento`).
- **UI — LISTA (`/painel/orcamento` = `OrcamentoView`) + TELA DO ORÇAMENTO (`/painel/orcamento/[id]`):** a lista mostra
  SÓ os **cards 4:5** (`OrcamentoCard` — SÓ INFORMAÇÃO, sem imagem: ano + nome; **dotação ATUALIZADA** (inicial +
  suplementação − anulação) com a barra do **% empenhado**; empenhado e saldo; rodapé órgãos · unidades · lançamentos ·
  data) numa grade compacta (2 colunas no celular → 6 no 2xl) + o card **"+"** (`OrcamentoNovoCard`, editor) que importa
  o `.xlsx` (`Dropzone` → prévia com **Nome + Ano** obrigatório → grava → **abre a tela do orçamento novo**). **UM ano = UM
  orçamento:** no "+", um ano que já existe (`ImportarOrcamento existentes` — todos, sem o filtro do cabeçalho) vira a
  SUBSTITUIÇÃO daquele orçamento (o fluxo do Reenviar); e `comandosSubstituirLancamentos` apaga, no MESMO lote, os demais
  orçamentos do ano (duplicatas antigas + lançamentos) — nada residual; a resposta diz quantos e quantas visões adaptou. O fluxo de
  importação é UM contêiner, **`ImportarOrcamento`** (lançador + prévia + lotes com progresso + avisos flutuantes; cada
  valor novo de `iniciar` abre o lançador — o mecanismo da Mesa), nos dois modos: **novo** e **reenvio** (`alvo`). Os
  indicadores vêm de UMA agregação no banco (`selecionarResumos` em `orcamento.ts`: `listarOrcamentos`/`getOrcamento`, sem
  trazer os lançamentos; núcleo puro `orcamento-indicadores.ts` — `dotacaoAtualizada`/`pctEmpenhado`). **Não há**
  Lançamentos/Vínculos/Visões fora do orçamento. A **tela do orçamento** (`OrcamentoEspacoView`) é ENXUTA e usa a largura
  toda: UMA linha (voltar · nome · ano · dotação atualizada · empenhado % · saldo · lançamentos · Excluir — só o ÍCONE,
  `Button variant="icon" size="sm"`, com nome acessível) e a barra das
  abas **Lançamentos · Comparativo · Vínculos · Visões** (`AbasEspaco`, o MESMO do espaço do PCA; o servidor monta SÓ a aba `?aba=` e
  manda só os campos que ela usa) — as **ferramentas de cada aba ficam NA MESMA LINHA das abas, à direita**
  (`FerramentasAba`: portal para o slot da barra; o estado segue na aba). Tabelas no **padrão da Mesa** (`DataTable
  scrollInterno` + `density="compact"`: corpo rola por dentro e as **linhas por página seguem Configurações → Tabelas**).
  **Lançamentos** (`OrcamentoLancamentos`): **Órgão (cadastro) · Unidade (cadastro)** (pelos Vínculos com as ações —
  `comVinculos`, no servidor) + TODAS as colunas do CUBO (Órgão · Unidade · Função · Programa · Ação · Elemento · Código ·
  Ficha · Fonte + valores com filtro por faixa) + **UMA COLUNA POR VISÃO salva** (Sim/Não — o lançamento entra na visão;
  `aplicarVisao` uma vez por visão); a EDIÇÃO da tabela e as edições salvas como na Mesa (chave **`CHAVE_LANCAMENTOS`** =
  `orcamento-lancamentos:tabela` → tela Orçamento em `telasDaChave`); XLSX/PDF no rodapé; na barra: busca
  (`SearchField compacto`, `predicadoBusca`); detalhe
  SÓ-leitura `OrcamentoItemDetalhe`; no RODAPÉ da tabela (`acoesRodape`, como o "Importar" da Mesa; editor) o botão
  **"Reenviar planilha"** → `ImportarOrcamento alvo`: a prévia compara atual × nova (nome/ano travados), confirma e
  `substituirOrcamentoEmLotes` grava a planilha nova num orçamento TEMPORÁRIO (os mesmos lotes all-or-nothing) e só então
  `POST /api/orcamento/[id]/substituir` `{origemId}` (Importar no Orçamento, auditoria "planilha reenviada — N → M") troca os
  lançamentos num LOTE ATÔMICO (`comandosSubstituirLancamentos`, **`orcamento-sql.ts`** — builders testados pelo driver D1
  REAL no `db.batch`: apaga os do alvo, move os da origem, recalcula os totais, apaga a origem); qualquer falha deixa o
  orçamento anterior intacto e apaga o temporário. O orçamento mantém id/nome/ano (vínculos e visões seguem pelo texto).
  **Comparativo** (`OrcamentoComparativo` → **`TabelaCruzada`**): a TABELA CRUZADA horizontal (como a planilha da
  Prefeitura — ex.: Unidade × Elemento de despesa), em visual MINIMALISTA (cabeçalho sem caixa-alta, zeros como "–", só
  divisórias horizontais). O usuário LIGA duas colunas do CUBO (Linhas × Colunas, `SelectField compacto`) e o seletor das
  colunas APONTA as permitidas — as demais ficam desabilitadas com o motivo (a mesma das linhas, sem dados, mais de
  `MAX_COLUNAS_CRUZAMENTO`=120 valores, ou EQUIVALENTE às linhas 1 para 1); inverter linhas × colunas; MEDIDA; VISÃO
  salva; R$ ou % (a participação de cada valor na LINHA — `ModoCruzamento` "valor"|"pct"; na linha TOTAL, sobre o total geral); busca nas linhas; linha TOTAL fixa; exportar .xlsx (`exportarCruzamentoXlsx`);
  UM toque/clique MARCA a linha (fundo accent opaco — as congeladas cobrem o que rola) e DOIS (duplo clique ou toque duplo na
  mesma célula em até 400 ms — detecção própria, vale no celular; `touch-manipulation` tira o zoom do toque duplo) numa
  célula, rótulo ou total abrem a **`OrigemDados`** (a soma = o número; Enter abre direto); tocar num cabeçalho ordena as linhas SÓ
  na vista; todo texto das células CENTRADO na altura. **TODAS as colunas são iguais** — o nome das linhas (Unidade…), a
  Sigla, o Total e as de valores: tocar no nome ordena; congeladas à esquerda (as que passam de ~60% da largura visível
  deixam de congelar — no celular, em geral só o nome). **EDIÇÃO NA PRÓPRIA PLANILHA (por PAR de colunas ligadas):** o
  **LÁPIS** (só o ícone) fica no **RODAPÉ da tabela** (`TabelaCruzada.acoesRodape`) e liga a edição (`TabelaCruzada.edicao`;
  as colunas ligadas travam, a origem dos números pausa). Cada cabeçalho: a **ALÇA de arrasto** ocupa a faixa ESQUERDA com a
  ALTURA TODA do cabeçalho (←/→ no teclado movem); no TOPO, alinhadas, as ações **congelar · ocultar · ordenar** (a seta
  alterna ▲ crescente / ▼ decrescente); a borda direita ajusta a largura (arrastar, ←/→, duplo clique = padrão — a faixa da largura fica DENTRO da coluna, 12px no
  toque/8px no desktop, sem invadir a alça de arrasto da vizinha: cada ponto responde a UM controle). O NOME
  fica no MESMO lugar dentro e fora da edição e TODO cabeçalho tem a MESMA gráfica — Unidade, Sigla e Total iguais às de
  valores: nome em até 2 linhas CENTRADO na horizontal (`px-5` simétrico; as ações do topo também centradas).
  **Arrastar:** a coluna **LEVANTA** (anima do tamanho real para 104% com sombra — `animate-levantar`) e vai **PRESA ao
  cursor** no ponto em que foi pega; o **LUGAR onde vai ficar aparece SOMBREADO já na posição nova** (prévia
  `soltarColuna`); a tabela ROLA sozinha perto das bordas; ao soltar, a coluna **POUSA** — voa até o lugar e volta ao tamanho
  em `--motion-duration` — e só então a ordem é aplicada (sem movimento reduzido: direto). Robusto: ouvintes na JANELA (a
  prévia reordena os cabeçalhos no DOM e mover um nó derruba o pointer capture), a coluna presa anda direto no DOM
  (`translate3d`, sem re-render), a tabela só re-renderiza quando o DESTINO muda e, da pressão até soltar, NENHUMA seleção
  de texto nem ARRASTO NATIVO do navegador (`segurar()`: bloqueia o `selectstart` e o `dragstart` — o arrasto nativo de uma
  FOTO/texto cancelava o ponteiro: a coluna parava e a imagem do navegador seguia o mouse —, limpa a seleção e põe o cursor
  no documento — também na largura). A coluna presa mostra as células COMO SÃO (fotos, selos) e a sombra do destino esconde
  TODO o conteúdo (`[&>*]:invisible`), não só o texto.
  **EDIÇÕES SALVAS (migração `0041`, tabela `edicoes_tabela`: chave do par + nome + layout + dono + `publico`):** no RODAPÉ,
  o `SeletorEdicoes` — lápis · seletor "Edição" (Padrão do sistema · Minhas · Públicas com o autor) · **estrela** = usar a em
  uso como MINHA PADRÃO (a tabela abre nela; guardada em `preferencias_tabela` — migração `0040`, `usuario_id` + `chave`
  única + `valor` JSON, `PUT`/`DELETE /api/preferencias/tabela` — como `padrao:<chave>` → `{id}`) · lixeira da
  minha. Editando, o rodapé troca para mapa de calor, ocultar zerados, congelar/descongelar/mostrar todas, voltar ao padrão
  do sistema, **Cancelar** e **Salvar** → `SalvarEdicao` (nome; **só para mim** ou **pública** — todos veem e usam;
  ATUALIZAR a minha ou salvar como NOVA — a de outra pessoa sempre vira nova, minha; "usar como minha padrão"). Hook
  **`useEdicoesTabela`** + o orquestrador **`useEditorEdicoes`** (`EdicoesTabela.tsx`, genéricos — o layout salvo, o rascunho, o
  rodapé [seletor | barra da edição] e as camadas; os MESMOS no Comparativo e na `DataTable` da Mesa) + núcleo puro
  **`edicoes-tabela-core.ts`** (`edicoesDaChave`/`edicaoInicial`/`idPadrao`/`chavePadrao`, testado) + D1 em
  **`edicoes-tabela.ts`** (`listarEdicoesTabela` = as minhas + as públicas, com o autor) + rotas **`POST
  /api/tabela/edicoes`** e **`PATCH`/`DELETE /api/tabela/edicoes/[id]`** (a tela da tabela da chave: a sua = Visualizar; publicar ou moderar a pública de outra pessoa = Configurar — ver "PAPÉIS";
  `criarEdicaoSchema`/`editarEdicaoSchema`: nome ≤ 60, layout ≤ 32 KB). A `0041` converte os ajustes salvos antes (um por
  usuário e par em `preferencias_tabela`) na edição pessoal "Minha edição" — e a torna a padrão dele. Confirmações e erros
  em CARD FLUTUANTE (`useConfirmacao` + `AvisoFlutuante`), nunca no alerta do navegador; a explicação de tudo na **AJUDA
  (?)**. O layout (`LayoutCruzamento` `v:2`: larguras, **fixadas** e **ocultas** de QUALQUER coluna — `COL_ROTULO`/
  `COL_EXTRA`/`COL_TOTAL` inclusive; o padrão congela os três —, **ordemManual** das livres, ordem das linhas, calor,
  zerados; a ordem exibida sai de `ordemDasColunas`) é
  normalizado por `coerceLayout` (qualquer JSON → válido e o formato ANTERIOR — Sigla/Total "soltas" — convertido;
  `layoutIgual` compara pelo conteúdo). As peças da edição NO CABEÇALHO são COMPARTILHADAS com a `DataTable`: **`EdicaoColunas.tsx`**
  (`CabecalhoEdicao`, `useArrastoColunas`, `ColunaPresa`) + o núcleo puro **`colunas-layout.ts`** (`ordemDasColunas`/
  `soltarColuna`/`comOrdem`/`comLargura`/`alternarOculta` e o `LayoutTabela` da `DataTable` — `coerceLayoutTabela`). Núcleo PURO
  **`orcamento-cruzamento.ts`** (`permissoesLinhas`/`permissoesColunas`/`cruzar`/`semVazios`/`ordenarLinhas`/
  `ordemDasColunas`/`soltarColuna`/`colunasNaOrdem`/`lancamentosDoRecorte`/`matrizCruzamento`/`coerceLayout`, testado; o CUBO real = 39 unidades × 36
  elementos em ~5 ms). Altura até o fim do display pela MESMA medida do `DataTable scrollInterno` (**`AlturaCheia.tsx`**:
  `useAlturaAteOFim` + `AlturaNoHtml`); larguras padrão por tokens locais `--cz-*` (px); linhas por página de
  Configurações → Tabelas.
  **Vínculos** (`OrcamentoVinculosAba` → `OrcamentoVinculos scrollInterno`): os textos
  DISTINTOS deste orçamento (o vínculo segue GLOBAL); na barra: busca + "Vincular N sugestões". **Visões**
  (`OrcamentoVisoes`): tabela das visões (filtros + lançamentos e Σ que cada uma pega DESTE orçamento) → clicar abre o
  editor no BANNER padrão (`Modal` lg: nome, o aviso dos Vínculos, as dimensões em grade — cada uma um `SeletorMultiplo
  suspenso` — e, no rodapé, a prévia do Σ + Cancelar/Salvar; nada estoura a página); na barra: "Criar visão". As visões vêm do SERVIDOR (`listarVisoesOrcamento`; salvar/excluir →
  `router.refresh`) — o antigo `GET /api/orcamento/visoes` foi removido. Erros em `AvisoFlutuante` (não empurram a
  tabela). `getOrcamentoItens(id)` é sempre de UM orçamento. Ícone `IconWallet`. Aba em `abas.ts` (`orcamento`) + nav em
  `AppShell`.
- **VÍNCULOS do orçamento CRIADOS pelo usuário (migrações `0030` + `0079` + `0080` + `0081`):** a UNIDADE é o micro. Cada vínculo
  liga um texto de Unidade do CUBO ("2 - SECRETARIA MUNICIPAL DE EDUCAÇ…") a UMA unidade cadastrada, com as AÇÕES dele — a
  MESMA unidade do CUBO pode ter VÁRIOS vínculos (as ações divididas entre unidades cadastradas). As ações de um vínculo
  são uma lista EXPLÍCITA ou **"as DEMAIS"** (as que nenhum outro vínculo da unidade pegou — também as que vierem nos
  próximos orçamentos —, menos as de fora; um só por unidade do CUBO); uma ação vai a UMA unidade (nunca conta duas vezes;
  a explícita vence as demais). A `0080` CONVERTEU os vínculos de antes sem perder nada: cada um virou "as demais" com as
  mesmas ações de fora (os textos desvinculados saíram — não são vínculo). O ÓRGÃO não se vincula: **ver por órgão = a
  SOMA das unidades vinculadas** — as dimensões **"Órgão (cadastro)"/"Unidade (cadastro)"** (`orgaoSistema`/`unidadeSistema`
  em `DIMENSOES_ORCAMENTO`) que **`comVinculos`** põe em cada lançamento no servidor (página do orçamento,
  `dadosComparativo`, o orçamento do PCA) valem nas visões, no comparativo e nos lançamentos. Tabela **`orcamento_vinculos`**
  (`chave` = texto normalizado; `reparticao_id` FK set null; **`acoes`** JSON das explícitas, NULL = as demais;
  **`acoes_fora`**; **único por chave + unidade cadastrada**) — **GLOBAL** (vale para todos os orçamentos). Núcleo PURO
  **`orcamento-vinculo.ts`**: `unidadesDoOrcamento` (as unidades do CUBO com as ações), `mapaVinculos` +
  **`unidadeDoLancamento`** (pela AÇÃO — o comparativo PCA × Orçamento usa a mesma régua), `alvosDaUnidade` (a Sigla da tabela
  cruzada — várias unidas por "/"), `linhasVinculos` (cada vínculo com as ações e a dotação que leva neste orçamento),
  `semVinculo` (as unidades com ações sem vínculo + a SUGESTÃO `sugerirAlvo` para as sem nenhum), **`conflitoVinculo`** (a
  REGRA, a mesma na tela e no servidor: uma unidade cadastrada por vez, um só "as demais", lista não vazia e sem ação de
  outro vínculo), `comVinculos`, `lerListaAcoes`. Acesso em `orcamento.ts` (`listarVinculosOrcamento`,
  `alvosVinculoOrcamento`, `criarVinculosOrcamento`/`editarVinculoOrcamento`/`excluirVinculoOrcamento` — conferem a unidade
  e a regra contra os gravados e o próprio pedido; a exclusão APAGA do banco e confirma pelo `RETURNING` — 409 se não saiu).
  **Sempre limpo:** a `0081` apagou os vínculos sem unidade e o gatilho `orcamento_vinculos_unidade_excluida` (BEFORE DELETE
  em `reparticoes`) apaga os vínculos da unidade cadastrada excluída por QUALQUER caminho — nada fica com NULL. As rotas
  devolvem a lista GRAVADA (`{vinculos}`), aplicada na hora pela tela. Rotas **`POST /api/orcamento/vinculos`** (`{vinculos ≤ 200}` — o "Vincular
  N sugestões" manda vários) e **`PATCH`/`DELETE /api/orcamento/vinculos/[id]`** (Configurar no Orçamento, auditoria). UI:
  aba **"Vínculos"** → **`OrcamentoVinculos`** (DS): `Segmented` **Vínculos (N)** (unidade do orçamento · unidade e órgão do
  cadastro · ações — "Todas as demais"/"As demais, menos N"/"k ações" · lançamentos · dotação vinculada; tocar ou o lápis
  edita) | **Sem vínculo (M)** (as unidades com ações sem vínculo, "Aceitar SIGLA" e "Vincular" — já abre o editor com a
  unidade e as ações que faltam); "Novo vínculo" e "Vincular N sugestões" na barra das abas; o editor
  **`EditorVinculoOrcamento`** (DS, num `Modal`): unidade do orçamento, unidade cadastrada (por órgão; sigla repetida mostra o
  órgão — `useRotuloUnidade`), "Incluir as demais ações" e as ações livres (`SeletorMultiplo`), a regra na hora (trava o
  Salvar, com "Abrir o vínculo com …" — o que a regra acusa) e a prévia do que leva; Excluir. `OrcamentoVinculosAba` = o contêiner (uma gravação por vez + `router.refresh`).

## Tarefas (quadro estilo Trello) — migração `0042`
- **O que é:** o módulo **`tarefas`** (`ABA_KEYS`/`NAV_MODULOS`, ícone `IconKanban`; a `0042` concede a aba a quem tem a
  Mesa `dfd`). **Vários QUADROS por grupo**: o quadro é de UM grupo (`tarefa_quadros.grupo_id` cascade) — só os membros do
  grupo veem/editam (`quadroAcessivel`: membro via `gruposDoUsuario`; o ADM, todos) e os RESPONSÁVEIS são pessoas do grupo
  (`pessoasValidas`; as já designadas que saíram do grupo seguem valendo/visíveis). `/painel/tarefas` (`TarefasView`) = os
  quadros do GRUPO ATIVO do cabeçalho (ADM sem grupo = todos) em cards 4:5 (`QuadroCard`: faixa na cor, abertas/atrasadas/
  concluídas) + `QuadroNovoCard` (editor com grupo ativo → modal `CamposQuadro` nome/cor/descrição → abre o quadro; nasce com
  A fazer · Em andamento · Concluído).
- **Modelo (aditivo):** `tarefa_quadros` (+ `prox_ticket`), `tarefa_listas` (`ordem` real, `limite_wip`, `concluida` = "lista
  de concluídas", `arquivada`), `tarefas` (**`ticket`** ÚNICO por quadro, prioridade baixa/media/alta/urgente, `inicio`/`prazo`
  "AAAA-MM-DD", **`ordem` REAL fracionária**, `concluida_em`, `arquivada`), `tarefa_pessoas` (PK tarefa+usuário, `papel`
  responsavel) e `tarefa_etiquetas` + `tarefa_etiqueta_links`. Núcleo PURO **`tarefas-core.ts`** (testado): `estadoPrazo`
  (semáforo: ok · vence ≤ `DIAS_AVISO_PRAZO`=2 · hoje · atrasada · concluída — `COR_ESTADO_PRAZO`), `ordemEntre` (soltar entre
  dois sem renumerar; `renumerar` quando o vão < `VAO_MINIMO`), `vizinhos`/`moverCartao` (otimista; entrar numa lista de
  concluídas conclui, sair desconclui), `filtrarTarefas` (responsável todos/eu/sem/pessoa · prazo · prioridade · etiqueta ·
  busca `predicadoBusca` por título/#ticket), `excedeWip`, `resumoQuadro`, `rotuloTicket`/`rotuloData`,
  `prefixoEdicoesTarefas`. Zod em `tarefas-validation.ts`; D1 em **`tarefas.ts`**; BUILDERS de lote em **`tarefas-sql.ts`**
  (`comandosCriarTarefa` = reserva o ticket + fim da lista + responsáveis/etiquetas num `db.batch` atômico; `comandosMover`;
  `comandosVinculos`) testados pelo driver D1 REAL (`tests/tarefas-sql.test.ts`). Loader **`tarefas-dados.ts`**
  (`carregarQuadros`, `carregarQuadro` = listas + cartões resumidos + etiquetas + pessoas do grupo + edições salvas, UMA carga
  para as três abas).
- **Espaço do quadro** (`/painel/tarefas/[id]` → **`QuadroTarefas`**): UMA linha de cabeçalho (voltar · cor · nome · grupo ·
  abertas/atrasadas/concluídas) + `AbasEspaco` **Dashboard · Quadro · Lista · Calendário · Configuração** com `FerramentasAba` (**`FiltrosTarefas`** —
  busca + `SeletorFiltro` Responsável [a FOTO da escolhida; "as minhas"] / Prazo / Prioridade / Etiqueta + Limpar — e "Nova
  tarefa"). Os cartões ficam em estado LOCAL (sincronizado com o servidor a cada `router.refresh`); o filtro segue entre abas.
  - **Quadro** = **`QuadroKanban`** (listas lado a lado, até o fim do display no desktop com rolagem interna por lista —
    `useAlturaAteOFim`; no celular, `snap` uma coluna por vez) + **`ColunaTarefas`** (nome, contagem com o **WIP em âmbar**
    quando passa, "Adicionar tarefa" pelo título — Enter cria e segue) + **`CartaoTarefa`** (etiquetas, título, `#ticket`
    `CelulaCopiavel`, bandeira da prioridade, prazo no semáforo, fotos; a camada-botão cobre o cartão). **Arrasto**
    (`ArrastoCartoes.tsx`: `useArrastoCartoes` + `CartaoPreso` + `SombraCartao` — o MESMO padrão do arrasto de colunas: ouvintes
    na janela, limiar 6px, `segurar` [extraído para `src/components/segurar.ts`, compartilhado com `EdicaoColunas`], fantasma
    por `translate3d`, rolagem automática horizontal/vertical, pouso em `duracaoMotionMs()`): mouse no cartão inteiro, TOQUE
    pela alça (`IconGrip`, só `pointer-coarse`); Alt + setas movem pelo teclado. Soltar = `moverCartao` otimista + `POST
    /api/tarefas/[id]/mover {listaId, anteriorId, proximoId}` (o servidor calcula a ordem pelos VIZINHOS; renumerou ⇒
    refresh; falhou ⇒ volta).
  - **Lista** = **`TabelaTarefas`** (`DataTable scrollInterno density="compact"` + **edições salvas** — chave
    `tarefas:<quadro>:lista`; Ativas | Arquivadas — restaurar pelo detalhe).
  - **Configuração** = **`ConfiguracaoQuadro`** (editores; os demais consultam) — SÓ o que não se faz no quadro: cor e
    descrição (`CamposQuadro semNome` — o nome é editado no cabeçalho), arquivar/privado (`Switch`), importar do Trello,
    excluir; Equipes, Campos personalizados, Automações, Trello e Modelos. Listas (menu "…" da lista: limite de cartões —
    `LimiteLista` —, "lista de concluídas", arquivar/excluir; arrastar; "Adicionar outra lista"), etiquetas (`SeletorEtiquetas`,
    no cartão — criar, editar e EXCLUIR), o fundo (menu do quadro → `Modal` com o `FundoQuadro`) e as listas do mês (menu do
    quadro → `ListasDoMes`) ficam no próprio quadro.
  - **Detalhe** = **`TarefaDetalhe`** (`Modal`, criar/editar): título, lista, prioridade (`Segmented`), início/prazo (data +
    semáforo), responsáveis (**`SeletorPessoas`** — chips com foto), etiquetas, descrição (lazy: `GET /api/tarefas/[id]`);
    salva SÓ o que mudou; arquivar/restaurar; excluir (editor); fechar com alteração confirma (`useConfirmacao`).
- **Rotas** (envelope `http.ts`, auditoria `tarefa`/`tarefa_quadro`/`tarefa_lista`/`tarefa_etiqueta`): `POST
  /api/tarefas/quadros` (editor; no grupo ativo), `PATCH`/`DELETE /api/tarefas/quadros/[id]`, `POST`/`PATCH
  /api/tarefas/quadros/[id]/listas` (criar / ordem), `POST /api/tarefas/quadros/[id]/etiquetas`, `PATCH`/`DELETE
  /api/tarefas/listas/[id]` e `/api/tarefas/etiquetas/[id]` (editor), `POST /api/tarefas` (qualquer membro), `GET`/`PATCH
  /api/tarefas/[id]` (membro; trocar de lista leva ao FIM dela) + `DELETE` (editor) e `POST /api/tarefas/[id]/mover`.
- **FASE 2 — conteúdo e equipe (migração `0043`, aditiva):** `tarefas` + `estimativa_h`, `vinculo_tipo`/`vinculo_id`
  (índice; SEM FK — o alvo pode ser excluído: o rótulo vira "#id (excluído)"); tabelas `tarefa_checklist` (texto, feito, `ordem`
  real), `tarefa_comentarios` (autor + snapshot do nome, `mencoes` JSON) e `tarefa_anexos` (DORMENTE desde a `0045` — os
  anexos saíram; ver FASE 4). **Observadores** = `tarefa_pessoas.papel='observador'`
  (a pessoa é responsável OU observadora — virar responsável tira da observação: `comandosVinculos` com
  `onConflictDoUpdate`). Núcleo puro (`tarefas-core`): `TIPOS_VINCULO`/`hrefVinculo` (protocolo/DFD →
  `/painel/mesa?abrir=tipo:id`, PCA/orçamento → o espaço), `lerVinculo`, `progressoChecklist`, `mencoesDoTexto` (apelido,
  nome inteiro sem espaço ou 1º nome só quando não é ambíguo — nunca cita a pessoa errada) + `textoMencao`, `gradeMes`/
  `tarefasPorPrazo` (calendário). `TarefaResumo` ganhou `observadores`, `estimativaH`, `vinculo {tipo,id,rotulo}` e as
  contagens `checklist {feitos,total}`/`comentarios` (+ `notas`/`links` na FASE 4) (agregadas no `dadosQuadro` por `GROUP BY`; os rótulos dos
  vínculos por `rotulosVinculos`, lotes ≤ 90). `comandosMassa` (builders, testados no driver D1 real): mover de lista (cada
  uma ao FIM do destino, na ordem; conclusão pela lista), responsável/etiqueta +/−, prazo, prioridade, arquivar.
  - **Detalhe (`TarefaDetalhe`)** — campos + **Estimativa**, **Observadores** (`SeletorPessoas`), **Vínculo**
    (**`VinculoTarefa`**: `Segmented` do tipo + `SeletorBusca` com `onBusca` → `GET /api/tarefas/vinculos`, no escopo de unidade
    do usuário) e o **`ChecklistTarefa`** (ver FASE 4). Painel da direita **Atividade**
    (`Modal.paineis`, aberto por padrão no desktop; botão "Atividade (N)" no rodapé): **Comentários** (**`ComentariosTarefa`**:
    "@" sugere as pessoas do grupo, Ctrl/⌘+Enter envia, editar só o próprio, excluir o próprio ou o editor) | **Histórico**
    (`Historico` + `GET /api/tarefas/[id]/historico` = `historicoEntidade("tarefa", id)`, nova em `auditoria.ts`).
    `GET /api/tarefas/[id]` devolve a tarefa (com os `blocos`) + o conteúdo (checklist e comentários).
  - **Cartão** ganhou os ícones checklist `n/m` (verde completo), comentários, notas/links (FASE 4) e vínculo.
  - **Aba Calendário** (**`CalendarioTarefas`** — ver FASE 5).
  - **Aba Lista**: colunas novas Checklist/Estimativa (faixa)/Vínculo; **seleção** + `BarraSelecao` fixa +
    **`BarraEdicaoMassaTarefas`** (`BarraEdicaoMassa.tsx`, a MESMA `Moldura`) → `POST /api/tarefas/massa` (≤ 50/chamada,
    `{alterados, falhas}`, um quadro por vez, auditoria por tarefa `origem:"massa"`); XLSX/PDF no rodapé da tabela
    (`TabelaTarefas.nomeExportacao`).
  - **Mesa ⇄ Tarefas:** `/painel/mesa?abrir=protocolo:<id>|dfd:<id>` abre o banner (`DfdsView.abrirInicial`; a URL é
    limpa); o botão **`TarefasDoVinculo`** (ícone + "abertas/total") no CABEÇALHO do DFD gravado e do protocolo gravado lista
    as tarefas ligadas (`GET /api/tarefas/do-vinculo`) e **"Criar tarefa"** num quadro → `/painel/tarefas/<q>?nova=tipo:id`
    (a tarefa NOVA abre já vinculada); `?tarefa=<id>` abre aquela tarefa no quadro. Sem tarefas nem quadros, o botão some.
  - **Rotas novas:** `POST /api/tarefas/[id]/checklist` + `PATCH`/`DELETE …/checklist/[itemId]`, `POST …/comentarios` +
    `PATCH`/`DELETE …/comentarios/[cid]`, `GET …/historico`,
    `POST /api/tarefas/massa`, `GET /api/tarefas/vinculos?tipo=&q=`, `GET /api/tarefas/do-vinculo?tipo=&id=` — todas
    pelo papel no grupo do quadro (`tarefaAcessivel` + `recusaNoQuadro`), vínculo conferido por `vinculoAcessivel` (a tela do alvo), auditoria.
- **FASE 3 — recorrência, Dashboard, notificações, modelos e automações (migração `0044`, aditiva):** `tarefas` +
  `recorrencia` (JSON `Recorrencia` {freq diaria|semanal|mensal|anual, intervalo 1–365, dias 0–6 na semanal, base prazo|
  conclusao}) + `recorrencia_anterior_id` (FK set null, **ÚNICO** — a mesma anterior de novo derruba o lote inteiro: concluir,
  reabrir e concluir nunca duplica nem gasta ticket); tabelas `notificacoes` (usuário, tipo, título/texto/link, tarefa/quadro
  cascade, ator + snapshot do nome, `lida`, **`chave` única por pessoa** = dedup das derivadas), `tarefa_modelos` (`quadro` =
  do GRUPO, `tarefa` = do QUADRO; `conteudo` JSON) e `tarefa_automacoes` (quadro, `gatilho` entrar_lista|concluir, lista,
  `acao` JSON, `ativa`). Origens de auditoria novas `automacao`/`recorrencia`; entidades `tarefa_modelo`/`tarefa_automacao`.
  - **Núcleo puro (`tarefas-core`, testado):** `lerRecorrencia`/`rotuloRecorrencia`/**`proximaOcorrencia`** (mensal preso ao
    fim do mês, semanal pelos dias e a cada N semanas, base atrasada avança até hoje, mantém a duração início → prazo; sem
    prazo conta da conclusão), **`notificacaoDePrazo`** (vence amanhã | atrasada até 30 dias; chave `tipo:tarefa:prazo` —
    avisa UMA vez por prazo), **`painelTarefas`** + **`tarefasDoRecorte`** (a MESMA regra — soma do detalhe = número; semana
    seg → dom), **`automacoesDoEvento`** (só as ativas; profundidade 1), `lerAcaoAutomacao`,
    `coerceModeloQuadro`/`coerceModeloTarefa`/`prazoDoModelo`. Builders novos (`tarefas-sql`, testados no driver D1 real):
    `comandosCriarTarefa` com recorrência/anterior/checklist, `comandosCriarQuadroDoModelo`, `comandosNotificacoes` (9 linhas
    por INSERT, `onConflictDoNothing`).
  - **Motor (`tarefas.ts`):** **`aposMovimento(u, quadro, ids, lista)`** — ponto ÚNICO chamado nos 4 caminhos que põem a
    tarefa numa lista (`POST /api/tarefas`, `PATCH /api/tarefas/[id]` com troca de lista, `/mover`, massa "lista"): roda as
    automações (a ação conferida contra o quadro AGORA — `acaoValida`; mover/atribuir/etiquetar/prioridade viram a MESMA
    `comandosMassa`; `notificar` avisa responsáveis + observadores) e, terminando CONCLUÍDA, **`gerarRecorrentes`** (1ª lista
    aberta, mesmos responsáveis/observadores/etiquetas/vínculo/estimativa, checklist desmarcado). BEST-EFFORT; as rotas
    devolvem `atualizar` (o quadro recarrega). `avisarSobreTarefa`/`avisarAtribuicao` (responsável NOVO na criação, edição e
    massa; menção NOVA no comentário/edição; "comentou" aos que acompanham).
  - **Notificações (`notificacoes.ts`):** ver a seção própria **"NOTIFICAÇÕES"** (em Integrações) — o sino, o tempo real,
    a limpeza e o e-mail.
  - **Aba Dashboard** (1ª aba; `DashboardTarefas` por `next/dynamic`, esqueleto = `DashboardMesaEsqueleto`): KPIs (abertas
    + spark, atrasadas, vencem em até 2 dias, concluídas no mês + % no prazo, tempo médio até concluir) + Saúde dos prazos,
    **Carga por pessoa** (tocar filtra o Responsável do quadro), Tarefas por lista (âmbar acima do WIP), Abertas por
    prioridade, Entrada e Conclusões por semana (12) — tocar abre a **`OrigemDados`** com as tarefas (a linha abre o detalhe).
    Sobre as tarefas JÁ FILTRADAS da barra; nenhuma consulta nova.
  - **Recorrência na tela:** **`RecorrenciaTarefa`** no `TarefaDetalhe` (`Switch` Repetir + `Segmented` frequência + "a cada
    N" + dias da semana em chips + base; mostra a próxima data); `IconRepetir` no cartão e no calendário, coluna
    "Recorrência" na Lista e no .xlsx.
  - **Modelos:** "Novo quadro" com **"Começar de"** (modelos de quadro dos grupos da pessoa — `POST /api/tarefas/quadros`
    `{modeloId}` → `criarQuadroDoModelo`). Os modelos de TAREFA viraram cartões-TEMPLATE na F3 (migração `0055`). Rotas `POST
    /api/tarefas/modelos` (só quadro, editor) e `DELETE /api/tarefas/modelos/[id]` (quem salvou ou editor).
  - **Configuração:** seções **Automações** (`AutomacoesQuadro`: as regras em FRASE — `fraseAutomacao` —, a da recorrência
    fixa como "Nativa", liga/desliga, excluir, e o formulário Quando · Fazer · Com; até `MAX_AUTOMACOES`=20) e **Modelos**
    (`ModelosQuadro`). Rotas `POST /api/tarefas/quadros/[id]/automacoes` e `PATCH`/`DELETE /api/tarefas/automacoes/[id]`
    (editor).
- **Usabilidade e toque (revisão):** CRIAR TAREFA é UM fluxo — o BANNER da tarefa (`TarefaDetalhe`, `AberturaTarefa`
  "nova" com a lista e o `prazo`), aberto de onde se está: Quadro = "+ Adicionar tarefa" da coluna (abre o banner DIRETO
  naquela lista — `ColunaTarefas.onNova`; sem campo rápido), Lista = "Adicionar tarefa" na barra (some com as
  Arquivadas à vista), Calendário = o "+" do dia (grade) / do dia da agenda / do cabeçalho (prazo = o dia); sem botão no
  Dashboard. Abas **Quadro · Lista · Calendário · Dashboard · Configuração** (curtos no celular: Agenda · Painel · Config.).
  Filtros ativos por extenso em chips removíveis (`ChipsFiltrosTarefas`); Ativas | Arquivadas virou um `SeletorFiltro`;
  "N arquivadas — ver na Lista" no Quadro. No TOQUE: o cartão tem a alça (44px, `any-pointer-coarse`) e o menu **⋯**
  (Abrir · topo/fim da lista · Concluir · Mover para… · Arquivar — sem arrastar); o encaixe `snap-x` fica desligado durante
  o arrasto (a rolagem automática para a coluna vizinha funciona); mouse/caneta arrastam o cartão inteiro; no celular, os
  PONTOS das colunas acima do quadro (a atual marcada; tocar leva a ela). Detalhe: Prioridade em linha própria (não corta),
  **Concluir/Reabrir** no rodapé (leva à lista de concluídas/1ª aberta pelo MESMO `PATCH` — automações e recorrência
  disparam), nota ao trocar de Lista e, no celular, "Tarefa | Atividade" no próprio corpo (no desktop a Atividade segue ao
  lado). Checklist: tocar no TEXTO marca/desmarca, renomear pelo lápis (`Checkbox alvo` = 44px). Dashboard: KPIs `sm:grid-cols-3 xl:grid-cols-5`. Validado no harness em 360/390/768/1024/
  1280/1920 (sem estouro horizontal) e com toque (CDP).
- **FASE 4 — BLOCOS, checklist robusto, calendário profissional e tela Calendário (migração `0045`, aditiva):**
  - **Sem anexos:** saíram `AnexosTarefa`, as rotas `…/anexos`, `anexoSchema`/`ANEXO_MAX_BYTES` e as funções de anexo. A `0045`
    converte cada anexo do tipo LINK num **bloco Link** (`json_group_array`, nada se perde); `tarefa_anexos` fica DORMENTE
    (fora do `schema.ts`, sem DROP). `redimensionarImagem`/`decodificarDataUrl` seguem (foto do perfil).
  - **BLOCOS da tarefa** (`tarefas.blocos` = JSON `BlocoTarefa[]`; NULL = tarefa antiga): no `TarefaDetalhe`, FIXOS no topo
    título, lista, prioridade e descrição; o resto é montado por blocos — **Nota** e **Link** (repetíveis; o conteúdo fica no
    próprio bloco) e **Checklist · Prazo (início+prazo) · Responsáveis (+observadores) · Etiquetas · Vínculo · Estimativa ·
    Recorrência** (únicos; só a POSIÇÃO — o dado segue nas colunas de sempre). **`PaletaBlocos`** (`BlocosTarefa.tsx`): chips
    dos disponíveis — ARRASTAR (mouse/caneta) até o lugar, com linha-guia (`GuiaBloco`) e o **`ChipPreso`** no ponteiro, ou
    TOCAR/clicar/Enter para acrescentar no fim; no celular fica recolhida em "Adicionar bloco". **`MolduraBloco`**: alça
    (arrasta para reordenar — também no toque), ↑/↓, remover (com dado, confirma; o de campo LIMPA o campo; o checklist
    gravado exclui os itens). Hook **`useArrastoBlocos`** (o padrão do arrasto de cartões: ouvintes na janela, limiar 6px,
    `segurar`, rola o banner perto das bordas). Núcleo puro (`tarefas-core`, testado): `TIPOS_BLOCO`/`ROTULO_BLOCO`,
    `lerBlocos` (tolerante), `blocosDaTarefa` (gravados + os de campo COM DADO que faltam — um bloco com dado nunca some),
    `adicionarBloco`/`moverBloco`/`removerBloco`/`blocosDisponiveis` (teto `MAX_BLOCOS`=30), `blocosParaGravar` (sem nota vazia
    nem link sem endereço), `contagemBlocos`, `urlValida` (link inválido trava o Salvar). Zod `blocosSchema` (sem id nem bloco
    único repetido; link só http/s) em `POST`/`PATCH /api/tarefas`; a recorrência e a cópia/template levam os blocos. O cartão mostra os ícones **Nota**/**Link** (`TarefaResumo.notas`/`links`, contados no banco por
    `json_each` — o texto das notas não vai ao quadro).
  - **Checklist corrigido** (`ChecklistTarefa`): as ações vêm de **`useChecklistServidor`** (tarefa gravada — OTIMISTA e em
    FILA serial: dois toques rápidos nunca se atropelam; item novo com id provisório até o POST devolver o real, e as ações
    sobre ele esperam na fila; falhou ⇒ aviso + relê do servidor; ao esvaziar a fila o quadro recarrega a contagem; trocar
    de tarefa começa do zero — `geracao`) ou **`acoesChecklistRascunho`** (tarefa NOVA: os textos vão no `POST`). Enter/Esc
    fecham a renomeação UMA vez (o blur que vem depois não grava de novo; Esc cancela de verdade); remover confirma.
  - **Calendário profissional** (`CalendarioTarefas`, genérico sobre `TarefaCalendario`): vistas **Mês · Semana · Agenda**
    (`Segmented`); no MÊS as tarefas com início → prazo são FAIXAS contínuas na semana (`faixasDaSemana`, empilhamento sem
    sobrepor, pontas cortadas pela semana), fim de semana sombreado, dias de fora esmaecidos, "+N" abre a semana inteira, o
    nº do dia abre a lista do DIA, setas movem entre os dias (Enter abre); no celular a grade vira a MINI-GRADE (pontos por
    dia) + a lista do dia tocado. **Reagendar arrastando** (`useArrastoDias`: mouse/caneta na tarefa, toque pela alça; o dia
    sob o ponteiro destaca; `reagendar` puro — o início anda junto, mesma duração) → `PATCH` otimista, volta se falhar.
    Cabeçalho: ←/→ (mês ou semana), Hoje, os NÚMEROS (atrasadas · hoje · nesta semana · sem prazo — `contadoresCalendario`)
    e a legenda do semáforo. `semanaDe`/`fimDeSemana`/`lerMes`/`somarMes`/`textoMes` puros e testados.
  - (A tela de TODOS os quadros virou o MÓDULO Calendário — FASE 5.)
- **FASE 5 — MÓDULO CALENDÁRIO por EVENTOS, estilo Google Agenda (migração `0046`, aditiva):**
  - **Módulo próprio e independente:** aba `calendario` em `ABA_KEYS`/`ABAS` (ícone `IconCalendar` em `navModulos.ts`) — no
    menu lateral, na gaveta e na barra inferior (rótulos com `truncate` para 7 itens em 360px); a `0046` concede a aba a toda
    permissão que tem `tarefas`. Saíram o `NAV_CALENDARIO` e o `NavTarefas` (Tarefas e Calendário não se ligam por abas); o
    antigo `/painel/tarefas?aba=calendario` segue redirecionando. A aba Calendário DENTRO do quadro permanece (mesmo componente).
  - **Cada TAREFA é um CONJUNTO de eventos** (núcleo puro `tarefas-core`, testado): `eventosDoCalendario(tarefas, eventos, de,
    ate)` → `EventoCalendario` de 3 TIPOS (`TIPOS_EVENTO`/`ROTULO_TIPO_EVENTO`): **período** (início → prazo, ou só o prazo;
    chave `p{id}`), **recorrência** (as próximas ocorrências no intervalo — `ocorrenciasNoIntervalo`, base prazo, teto 60;
    `r{id}:{data}`) e **evento** cadastrado (`e{id}`). Tabela **`tarefa_eventos`** (tarefa cascade, título, data, `dia_inteiro`,
    `hora_inicio`/`hora_fim` "HH:MM", local, descrição, `cor` nula = a do quadro). Bloco **"Eventos"** na tarefa
    (`TIPOS_BLOCO`; **`EventosTarefa`** + o formulário **`EditorEvento`**, `EventosTarefa.tsx`): na tarefa gravada grava na
    hora (`POST /api/tarefas/[id]/eventos`, `PATCH`/`DELETE /api/tarefas/eventos/[id]` — membro do quadro, auditoria na
    tarefa, teto `MAX_EVENTOS_TAREFA`=100); na NOVA vai no `POST /api/tarefas` (`eventos`, gravados no MESMO lote —
    `comandosCriarTarefa`). `TarefaResumo.eventos` = a contagem. `eventoSchema` (fim > início; hex; tetos).
  - **Escolher os conjuntos** — **`BarraCalendario`** (`BarraCalendario.tsx`): **`MiniMes`** (ir a qualquer data; ponto nos
    dias com evento), **Tipos** (Período · Recorrência · Eventos) e **Conjuntos** (as tarefas com eventos no período,
    agrupadas por QUADRO na cor dele; marcar/desmarcar a tarefa ou o quadro inteiro; busca; Mostrar/Ocultar todos). O que
    fica oculto (`OcultosCalendario` {tarefas, quadros, tipos}, `lerOcultos`/`eventoVisivel`) é preferência da PESSOA
    (`preferencias_tabela`, chave `calendario:ocultos`, `PUT /api/preferencias/tabela` com espera de 600 ms) — vale em todo
    aparelho. Desktop = coluna à esquerda; celular/tablet = botão "Conjuntos" → `Modal`.
  - **`CalendarioTarefas`** (refeito por EVENTOS; o módulo e a aba do quadro): vistas **Dia · Semana · Mês · Agenda**; Dia/
    Semana = GRADE DE HORAS (rola até 7h, faixa "dia todo", eventos com hora posicionados e LADO A LADO quando se cruzam —
    `layoutDoDia`; a LINHA DO AGORA no horário de Brasília); Mês = faixas contínuas (`faixasDaSemana` genérica) + horário;
    celular = mini-grade + a lista do dia. **Criar** tocando num horário vazio (de 30 em 30 min) ou no "+"/"Criar" (escolhe a
    tarefa — `SeletorBusca` das abertas). **Arrastar** reagenda: o evento (dia e hora, mantendo a duração — `PATCH` do
    evento) e o período (prazo pela régua `reagendar`); a recorrência não se arrasta. Atalhos **D/S/M/A**, **T** (hoje), ←/→.
  - **Banner do EVENTO sem sair da tela** (**`EventoBanner`**): título na cor, tipo, quando por extenso, local, descrição e a
    tarefa de origem (prazo no semáforo) + Editar/Excluir (evento cadastrado). **"Ver tarefa"** abre o `TarefaDetalhe` AO LADO
    no MESMO `Modal` (prop `esquerda` = o banner do evento; no celular, a tarefa por cima — `principalNoTopo`); o contexto do
    quadro vem sob demanda por `GET /api/tarefas/[id]?contexto=1` (`contextoTarefa`, `tarefas-dados.ts`).
  - **Carga:** `carregarCalendario` = as tarefas da grade (`tarefasDoCalendario` — agora também as recorrentes abertas e as
    com evento no intervalo), os eventos (`eventosDosQuadros`), as abertas leves (`tarefasAbertasLeves`, p/ "Criar") e os
    ocultos. A aba do quadro busca os eventos só quando é a ativa.
- **FASE 6 — CALENDÁRIO profissional (migração `0047`, aditiva):** núcleo PURO **`calendario-core.ts`** (testado em
  `tests/calendario-core.test.ts`) + D1 em `feriados.ts`/`calendario-assinatura.ts` + Zod em `calendario-validation.ts`.
  - **Evento de VÁRIOS dias** (`tarefa_eventos.data_fim`; `fimDoEvento`) — vira faixa como o período; as consultas usam
    `COALESCE(data_fim, data) >= de`. **Lembrete** (`lembrete_min`, `OPCOES_LEMBRETE` até 1 semana; dia inteiro = 08:00):
    notificação `lembrete` no SINO, DERIVADA NA LEITURA como as de prazo (`derivarLembretes` em `notificacoes.ts`:
    responsável/observador da tarefa ou quem criou o evento; devido do momento do aviso até o fim do dia; chave evento +
    início + antecedência) — o link (`linkEvento`) abre o evento no Calendário (`?evento=<chave>` → `eventoInicial`).
    `EditorEvento` ganhou "Até (vários dias)" + "Lembrete"; `EventosTarefa` e o banner ganharam **Duplicar**.
  - **Recorrência que conta da CONCLUSÃO:** a próxima ocorrência PREVISTA (`ocorrenciaPrevista` — se concluída hoje ou no
    prazo futuro; chave `r{id}:prev`, selo "Prevista").
  - **Arrastar/redimensionar:** `eventoMovido` (o de vários dias anda inteiro; o com hora mantém a duração) e
    `eventoComFim` — a BORDA de baixo de um evento com hora na grade muda a duração (`useRedimensionar`, 15 em 15 min).
    O módulo e a aba do quadro usam as MESMAS funções.
  - **Criar pelo TECLADO** na grade de horas: cada coluna do dia é um `fieldset` focável (↑/↓ de 30 em 30 min, Enter cria).
  - **FERIADOS:** nacionais CALCULADOS (`feriadosNacionais` — fixos + os móveis pela Páscoa `pascoa`: Carnaval, Sexta-feira
    Santa, Corpus Christi) + os do ADM (**Configurações → Feriados**, `FeriadosAdmin`, tabela `feriados`, "todo ano" repete
    o dia/mês — 29/02 só em ano bissexto; rotas `/api/admin/feriados*` `exigirAdmin` + auditoria `feriado`). A grade
    sombreia o dia e mostra o nome; o banner avisa o PRAZO em dia não útil (`avisoDiaNaoUtil`) e o arrasto também;
    "Feriados" liga/desliga na barra (`ocultos.feriados`).
  - **Opções da pessoa** (`calendario:opcoes` — `lerOpcoesCalendario`): semana começando na SEGUNDA (`gradeMes`/`semanaDe`/
    `diasSemanaCurtos` com `inicioSemana`) e OCULTAR sábado/domingo (`diasExibidos`; `faixasDaSemana` agora posiciona pelas
    POSIÇÕES dos dias exibidos).
  - **Cronograma do PCA:** quem vê o módulo PCA vê a PREVISÃO DE ENTREGA dos DFDs vigentes (`cronogramaPcas` em
    `pca-espaco.ts` = `consolidarPca` + `previsaoDoDfd`) como eventos do tipo `pca` no dia 1 do mês (ANUAL = todo mês;
    `eventosPca`), um conjunto por PCA na barra (`ocultos.pcas`); o banner mostra o DFD (planejamento, objeto, unidade,
    valor) e "Abrir o PCA". Filtros de TAREFA ligados escondem a previsão (não se aplicam a DFD).
  - **Exportar e assinar** (`AssinaturaCalendario`): "Baixar .ics" (os eventos à vista — `gerarIcs`, RFC 5545: dia inteiro
    com fim exclusivo, hora em UTC, VALARM do lembrete, escape e dobra de 75 octetos) e o **link de assinatura**
    (`POST`/`DELETE /api/calendario/assinatura`; o token de 32 bytes aparece UMA vez, o banco guarda o SHA-256 —
    `calendario_tokens`) servido por **`GET /api/calendario/ics/[token]`** (sem sessão; pessoa ATIVA; os quadros dos grupos
    dela, sem o que ocultou; 60 dias atrás a 1 ano à frente).
  - **Robustez:** a preferência de ocultos pendente grava ao sair da página (`keepalive`); o contêiner avisa (`truncado`)
    quando uma carga bate no teto (`LIMITE_EVENTOS_CALENDARIO`/`LIMITE_TAREFAS_CALENDARIO`); depois de salvar a tarefa
    aberta ao lado, só o resumo dela é relido (`GET /api/tarefas/[id]?contexto=tarefa`).
- **FASE 7 — CALENDÁRIO em TELA CHEIA, no padrão do Google Agenda (sem migração):**
  - **Layout:** o `CalendarioTarefas` ocupa do topo até o fim do display (`useAlturaTela`: o respiro de baixo do `<main>`
    já soma a navegação inferior no celular) — a PÁGINA NÃO ROLA; a lateral, a grade e os painéis rolam por dentro
    (contêineres que rolam são `relative`: os `input.sr-only` das caixas de marcar não escapam do corte). Barra numa
    linha: menu (celular) · Hoje · ‹ › · o período · **menu de VISTAS** (`Dropdown`: Dia · 4 dias · Semana · Mês · Ano ·
    Programação com as teclas D/X/S/M/Y/A + Mostrar fins de semana / tarefas concluídas / número da semana + Imprimir) ·
    atalhos · ⚙ **Configurações** (`Switch`es das opções + horário de EXPEDIENTE + o slot `configuracoes` — exportar/assinar)
    · painel das **tarefas sem prazo** · Criar. Lateral (16rem): os NÚMEROS, o conteúdo do host (no módulo: os filtros das
    tarefas, o mini-mês com os dias À VISTA destacados, tipos e conjuntos) e a legenda; no celular, folha. A vista e o painel
    ficam lembrados no aparelho (`localStorage`, conveniência).
  - **Mês** enche a altura: quantas faixas cabem por dia sai da altura REAL da linha (`useAltura`); "+N mais" abre o dia numa
    `JanelaFlutuante`; tocar num dia vazio cria. **Dia · 4 dias (`N_DIAS`) · Semana**: grade com o fuso (GMT-03), o expediente
    sombreado (abre no início dele), PRESSIONAR E ARRASTAR num horário vazio cria com o intervalo (`useCriarArrastando`; no
    toque, o toque simples). **Ano**: os 12 meses com pontos (o host carrega o ano inteiro — `onAno` → `?ano=1`;
    `intervaloCalendario` = a MESMA conta no servidor e no cliente: as semanas do mês + 1 semana, ou o ano). **Programação**:
    a lista, rolando até hoje.
  - **Criação rápida** (`JanelaFlutuante`, DS: ao lado do ponto clicado, arrastável pela alça, fecha no Esc/toque fora; no
    celular vira folha): o "(Sem título)" aparece JÁ na grade (`rascunho`); **Evento** (numa tarefa aberta, com ou sem
    horário) ou **Tarefa** (nova — quadro + lista + prazo no dia; `POST /api/tarefas`); "Mais opções" = o formulário completo
    (a tarefa nova é criada e abre ao lado).
  - **Concluir pelo calendário:** o período da tarefa leva o CÍRCULO (como a tarefa do Google) — leva à 1ª lista de concluídas
    (ou à 1ª aberta, reabrindo) pelo mesmo `PATCH` do detalhe (automações/recorrência valem); `listasDosQuadros` na carga e
    `TarefaCalendario.listaId`.
  - **Tarefas sem prazo** (painel à direita): arrastar até um dia define o prazo; tocar abre a tarefa ao lado.
  - **Desfazer** (`toast.desfazer` — o aviso ganhou o botão): mover, redimensionar, concluir/reabrir e excluir evento.
  - **Atalhos:** D/X/S(W)/M/Y/A, T, ←/→ ou P/N, **C** criar, **G** ir para uma data, **/** buscar, **?** ajuda.
  - **Impressão:** "Imprimir" no menu de vistas; o menu, o cabeçalho e a navegação inferior do app têm `print:hidden`.
  - A aba Calendário do quadro usa o MESMO componente (opções gravadas, concluir, tarefas sem prazo do quadro).
- **FASE 8 — EVENTOS DE EQUIPE (migração `0048`, aditiva):** `tarefa_eventos` + `recorrencia` (JSON `RecorrenciaEvento`
  {freq diaria|semanal|mensal|anual, intervalo, dias, ate}), `link_reuniao` (só https), `ocupado` (Ocupado | Livre — o Livre
  aparece CONTORNADO) e `privado`; tabela **`tarefa_evento_convidados`** (evento + usuário cascade, `resposta`
  pendente|sim|nao|talvez, `respondido_em`). Núcleo puro (`tarefas-core`, testado): `ocorrenciasDoEvento` (a SÉRIE expandida
  no intervalo, teto 400 — chave `e{id}:{data}`; mover uma ocorrência move a série pelo DELTA de dias), `rotuloRecorrenciaEvento`,
  `participaDoEvento`/**`mascararPrivados`** (o evento privado de quem não participa vira "Ocupado", sem local/descrição/link —
  aplicado no SERVIDOR: carga do calendário, quadro, `GET /api/tarefas/[id]` e o feed ICS) e `dadosDoEventoGravado`. Rotas:
  convidados = pessoas do grupo (`pessoasValidas`), avisados por notificação `convite`; o privado só é editado por quem
  participa (403); **`POST /api/tarefas/eventos/[id]/resposta`** (só o convidado; avisa o criador — `resposta`). Lembretes
  derivados incluem os convidados (menos quem recusou) e as ocorrências da série. UI: `EditorEvento` com Repetição
  (`EditorRepeticao`, dias da semana em chips), Convidados (`SeletorPessoas`), link da reunião, Ocupado/Livre e Privado;
  `EventoBanner` com a repetição, "Abrir no mapa", "Entrar na reunião", os convidados com a resposta e **"Você vai?"** (Vai ·
  Talvez · Não vai, otimista); lateral do módulo com **"Pesquisar pessoas"** (ver só os eventos delas) e a opção "Ocultar
  recusados"; o **lembrete padrão** (Configurações do calendário) preenche o evento novo.
- **FASE 9 — AGENDAS EXTERNAS, BUSCA e FUSO SECUNDÁRIO (migração `0049`; a `0050` removeu a página pública de agendamento — o Calendário é SÓ INTERNO):**
  - **Agendas externas** (`calendario_externos`: da PESSOA — nome, URL, cor; até `MAX_AGENDAS_EXTERNAS`=10): núcleo puro
    **`ics-core.ts`** (testado) — `lerIcs` (RFC 5545 tolerante: linhas dobradas, texto desescapado, VALARM pulado, `Z` → Brasília,
    DTEND exclusivo no dia inteiro, RRULE FREQ/INTERVAL/UNTIL/COUNT/BYDAY na MESMA expansão dos eventos — `ocorrenciasDoEvento` —,
    EXDATE e RECURRENCE-ID fora da série, CANCELLED fora, teto 3000), `eventosExternos` (tipo **`externo`**, chave
    `x{agenda}:{uid}:{data}`, `EventoCalendario.externo`), **`urlAgendaValida`** (webcal→https; só HTTPS pública — sem
    localhost/IP privado/IPv6 literal/credenciais). D1 + download em **`agendas-externas.ts`** (`lerAgendaExterna`: 8 s, 2 MB em
    streaming, cache de 10 min em memória). Rotas `GET/POST /api/calendario/externos` (o GET com `?de=&ate=` já devolve os
    eventos do intervalo e o erro de cada agenda; o POST baixa e lê antes de gravar) e `PATCH/DELETE …/[id]` (só a da pessoa;
    auditoria `agenda_externa`). Tela: **`useAgendasExternas`** carrega DEPOIS da página (o calendário nunca espera um servidor de
    fora), seção **"Outras agendas"** na `BarraCalendario` (mostrar/ocultar — `OcultosCalendario.externos` —, "falhou" com o
    motivo) e o modal **`GerirAgendasExternas`** (assinar/cor/remover). Somente leitura: não arrasta, sem tarefa no banner.
  - **Busca ÚNICA** (`BuscaCalendario`, CONTROLADA pelo `filtro.busca` — no topo da lateral, a tecla **/** foca; o
    `FiltrosTarefas` do Calendário vem `semBusca`): o texto filtra os eventos À VISTA e, com 2+ letras, lista também os de
    TODOS os meses — `GET /api/calendario/busca?q=` → `buscarNoCalendario` (título/local/descrição dos eventos +
    título/#ticket das tarefas com prazo, nos quadros do calendário — `quadrosDoCalendario`; o PRIVADO de quem não participa
    NÃO entra; a série aparece na próxima ocorrência; de hoje em diante primeiro). No período à vista abre na hora; fora dele
    vai ao mês (`linkEvento`) e abre lá (o `?evento=` vale a cada navegação).
  - **Sem redundâncias (revisão):** a lateral tem UM bloco "busca + filtros + chips" (`FiltrosTarefas semBusca
    semResponsavel` — as pessoas se filtram pelo "Pesquisar pessoas", mais amplo; `ChipsFiltrosTarefas semBusca` — sem o
    chip da busca e o "Limpar filtros" mantém o texto); a busca dos conjuntos e a do painel sem prazo saíram (os conjuntos
    saem dos eventos já filtrados; a lista sem prazo é filtrada pelo host); as opções de exibição (fins de semana,
    concluídas, recusados, nº da semana) ficam SÓ no menu de vistas e as Configurações ficam com as preferências (segunda,
    lembrete, fuso, expediente, exportar); a seção Tipos tem só Período · Recorrência · Eventos · Feriados
    (`TIPOS_COM_CONTROLE`; `lerOcultos` descarta `pca`/`externo`) — o PCA (caixa "todos" no título) e as agendas externas
    se controlam nas seções deles. O `aside` da lateral tem respiro (`-mx-1 px-1`, largura 16,5rem) — o anel de foco não é
    cortado.
  - **Fuso secundário** (`OpcoesCalendario.fusoSecundario`, lista `FUSOS_SECUNDARIOS`): a grade de horas ganha a 2ª régua
    (`diferencaFuso` via `Intl` — o horário de verão de fora entra; `horaNoFuso`, `rotuloGmt`); escolhido nas Configurações.
- **Garantias da AUDITORIA (Calendário e Tarefas):**
  - **Privacidade:** o histórico da tarefa nunca mostra o conteúdo de evento PRIVADO — `eventoParaAuditoria` (gravação) e
    `historicoSemPrivados` (leitura, cobre as linhas antigas) em `tarefas-core`; o lembrete do privado só chega a quem
    participa (o observador, não); `mascararPrivados` também zera `criadoPor`; a busca acha o privado para os responsáveis.
  - **Agendas externas:** redirecionamento seguido À MÃO (`redirect:"manual"`, até 3 saltos, cada `Location` revalidado por
    `urlAgendaValida`, que também tira o ponto final do host e recusa 198.18/15, 192.0.0/24, TEST-NETs); `lerProp` respeita
    aspas; TZID conhecido pelo `Intl` → Brasília (desconhecido = como escrito); BYDAY anda com a troca de dia; regra mensal/
    anual com BYDAY/BYMONTHDAY/BYSETPOS = uma ocorrência (nunca datas erradas).
  - **D1:** convidados em INSERTs de ≤ 30 (`comandosConvidados`/`comandosCriarEvento`/`comandosAtualizarEvento` em
    `tarefas-sql`, testados no driver real com 40 convidados); as consultas do calendário por LOTES de 80 quadros
    (`porLotesDeQuadros`) — nada some além do 90º; `listaAtiva` (lista não arquivada) em eventos, busca e avisos; quadro
    arquivado recusa criar tarefa/lista/etiqueta/automação (409 `MSG_QUADRO_ARQUIVADO`).
  - **Cálculo:** `dataValida` recusa data inexistente; `saltar` leva a série para perto do intervalo (sem teto de passos);
    a recorrente atrasada mostra ocorrências de hoje em diante; evento com hora em vários dias é aceito e o `.ics` sai com o
    início e o fim reais; fim antes do início na grade = até 24:00; `eventoArrastado` (a ocorrência move a série pela
    distância — módulo e aba do quadro); `indiceReal` (kanban filtrado: topo/fim reais, meio antes do visível de baixo).
  - **Telas:** `Button loading` = desabilitado; travas de envio por ref; as bandeiras "foi arrasto/redimensionamento" duram
    só o clique seguinte; o banner do evento é relido dos dados; `JanelaFlutuante` é `role="dialog"` (atalhos pausados) e se
    reposiciona ao crescer; a folha "sem prazo" do celular não é lembrada. Testes em `tests/auditoria-calendario.test.ts`.
- **FASE 10 — EQUIPES do quadro (migração `0052`, aditiva):** tabelas `tarefa_equipes` (quadro cascade, nome, cor, ordem),
  `tarefa_equipe_membros` (equipe + usuário, cascade) e `tarefa_equipes_links` (tarefa + equipe, cascade). A EQUIPE é um grupo
  de pessoas DO GRUPO do quadro, cadastrado na **Configuração** (seção "Equipes": nome + `ColorField` + `SeletorPessoas`;
  Configurar Tarefas no grupo do quadro; `POST /api/tarefas/quadros/[id]/equipes`, `PATCH`/`DELETE /api/tarefas/equipes/[id]` —
  `pessoasValidas`, quadro arquivado = 409, auditoria `tarefa_equipe`). A tarefa recebe equipes além das pessoas (bloco
  **Responsáveis**: `ChipsAlternar` na cor + "Pela equipe:" com as fotos dos membros herdados; `equipes` em `POST`/`PATCH
  /api/tarefas` e na massa — campo "Equipe" +/−), por REFERÊNCIA: mudar a equipe muda todas as tarefas dela.
  **`TarefaResumo.equipes` + `envolvidos`** (= responsáveis ∪ membros das equipes — `envolvidosDe`/`equipesDasLinhas` em
  `tarefas-core`, calculados no servidor em `dadosQuadro`/`getTarefa`/`tarefasDoCalendario` por UMA consulta —
  `linhasEquipes`) e TUDO o que é "de quem é a tarefa" usa os envolvidos: filtro Responsável (eu/pessoa/sem), carga e
  recorte do Dashboard, cartão, Lista (+ coluna "Equipes") e .xlsx ("Equipes" no fim), "Pesquisar pessoas" e o banner do
  evento (**"Participantes pela tarefa"** — todo evento herda os envolvidos), privado (`mascararPrivados`/`participaDoEvento`
  com os envolvidos), avisos (atribuída — também "à sua equipe" —, comentário, automação) e, em SQL, **`pessoaNaTarefa`**
  (`tarefas-sql`: responsável OU membro de equipe da tarefa) nas notificações de prazo/lembrete e na busca do calendário. A
  recorrência copia as equipes; excluir a equipe a tira das tarefas (os responsáveis ficam). Testes: `tarefas-core`
  (envolvidos, filtro/carga/privado pela equipe), `tarefas-sql` (40 membros em INSERTs ≤ 30, criar/editar/massa/cascade,
  `pessoaNaTarefa` no driver D1 real), `migrations` (0052).
- **Lateral do Calendário — conjuntos RECOLHÍVEIS:** na `BarraCalendario`, a seção "Conjuntos (tarefas)", cada QUADRO e o
  "Cronograma do PCA" recolhem/expandem (`BotaoRecolher`: chevron, `aria-expanded`, 44px no toque; recolhido mostra a
  contagem); o que está recolhido fica no APARELHO (`localStorage` `calendario:recolhidos`, lido depois da montagem, com
  try/catch — conveniência).
- **Dados do Calendário Institucional PCA 2026/2027:** cadastrados em produção (grupo Planejamento e Custos); a antiga carga
  `0051` saiu do repositório (já aplicada — o wrangler só aplica arquivos novos). A `0052` tira o INÍCIO das tarefas 8 (Etapa
  8) e 9 (Avisos) daquele quadro — ficam só no prazo, sem a barra longa em todas as semanas.
- **PADRÃO TRELLO — plano em fases F1…F9** (concluir no lugar e datas · checklists nomeados · copiar/mover/templates ·
  menu da lista, quadro do período, favoritos · etiquetas e filtros · atividade + texto formatado + tela no padrão Trello ·
  campos personalizados · vínculos múltiplos · importar do Trello; SEM anexo de arquivo). Entregues:
  - **FASE 11 / F1 — concluir NO LUGAR + prazo com HORA e LEMBRETE (migração `0053`, aditiva):** `tarefas.prazo_hora`
    ("HH:MM"; NULL = dia inteiro) + `lembrete_min`. **Concluir não muda a lista**: `PATCH /api/tarefas/[id]` `{concluida}`
    grava/zera `concluida_em` e, ao concluir, `aposMovimento(…, {id:null, concluida:true})` roda SÓ as regras "ao concluir"
    (`automacoesDoEvento` com `listaId` null) e a recorrência (a próxima nasce na MESMA lista quando ela é comum —
    `listaDaProxima`); mover entre listas COMUNS mantém a conclusão, entrar numa lista de concluídas conclui e SAIR dela
    reabre (`conclusaoAoMover` no núcleo + `conclusaoAoMoverSql` em `comandosMover`/`comandosMassa`). **`CirculoConcluir`**
    (DS: vazio/verde ✓, `discreto` = aparece com o mouse no cartão, área de toque ≥ 44px) no `CartaoTarefa` (antes do título;
    `QuadroKanban.onConcluir`, também no menu do toque), no rodapé do detalhe e no calendário (o círculo do período) — tudo
    pelo MESMO PATCH, otimista, com Desfazer. **`DatasTarefa`** (DS: início, prazo + hora — vazia = "Dia inteiro" —,
    lembrete `OPCOES_LEMBRETE`; sem prazo, hora e lembrete somem) no bloco Prazo do detalhe. `estadoPrazo(…, hora, agora)`
    (o de hoje depois da hora = atrasada; `horaAgoraBrasilia`), `rotuloData(d, hoje, hora)`; o calendário mostra o prazo de
    UM dia com hora como horário na grade (e no `.ics`). Lembrete do prazo DERIVADO no sino (`lembreteDaTarefa`,
    `calendario-core`: a régua `lembreteDevido`; chave `lembrete-tarefa:id:início:min`) para responsáveis, equipes e
    observadores (`pessoaNaTarefa(u, true)`). Testes: `tests/tarefas-trello.test.ts`, `tarefas-sql` (mover), migração.
  - **FASE 12 / F2 — CHECKLISTS NOMEADOS (migração `0054`, aditiva):** tabela `tarefa_checklists` (tarefa cascade, nome,
    ordem) + `tarefa_checklist.checklist_id` (cascade), `prazo` e `responsavel_id` (set null); a migração põe os itens
    antigos num "Checklist" da própria tarefa. O bloco Checklist mostra TODOS os checklists (`ChecklistTarefa`: nome no
    lápis, barra em %, "Ocultar itens marcados" — lembrado no aparelho, `tarefas:checklists-ocultos` —, Excluir com
    confirmação, "Adicionar checklist"; item com prazo no semáforo + foto do responsável e o menu "…" — prazo, responsável,
    **Converter em tarefa**, Excluir). `useChecklistServidor` (otimista, FILA serial; ids provisórios de item E de
    checklist) e `acoesChecklistRascunho` (tarefa nova: `checklists [{nome, itens}]` no `POST /api/tarefas`,
    `comandosChecklistNovo` — itens em INSERTs de 20, ≤ 100 parâmetros). Rotas: `POST /api/tarefas/[id]/checklists`,
    `PATCH`/`DELETE /api/tarefas/checklists/[id]`, item com `checklistId`/`prazo`/`responsavelId` (pessoa do grupo; o
    responsável novo é avisado) e `POST /api/tarefas/[id]/checklist/[itemId]/converter` (nova tarefa na MESMA lista com o
    texto, o prazo e o responsável; o item sai). A recorrência copia os checklists com os nomes (`checklistsParaCopiar`).
    Aviso de prazo do ITEM ao responsável (`notificacaoDePrazoItem`, derivado com os prazos).
  - **FASE 13 / F3 — COPIAR, MOVER ENTRE QUADROS e TEMPLATES (migração `0055`, aditiva):** `tarefas.template` (0/1) +
    `copiada_de` (FK set null). A migração converte cada MODELO DE TAREFA num cartão-template (título como estava, descrição,
    prioridade, estimativa, recorrência, blocos, etiquetas que existem e o checklist → "Checklist") numa lista **TEMPLATES**
    (a 1ª do quadro) e apaga os modelos de tarefa (`ModeloTarefa`/"Usar modelo"/"Salvar como modelo" saíram; os de QUADRO
    ficam). O TEMPLATE fica FORA de: contagens (card do quadro, `resumoQuadro`, WIP da coluna), Dashboard (`valida`),
    Calendário (grade, sem prazo, contadores, feed), avisos de prazo/lembrete, busca, "Tarefas" da Mesa, automações e
    recorrência (`aposMovimento` filtra) e dos filtros ATIVOS (`filtrarTarefas`); não se conclui (422 no `PATCH`; sem
    círculo — selo "Template"). Núcleo: `mapearEtiquetas` (pelo NOME, sem caixa/acento — as que faltam são criadas),
    `mapearPorNome` (equipes), `listaDeTemplates`, `OpcoesCopia`. Builders (`tarefas-sql`, testados no D1 real):
    `comandosCriarTarefa` + `template`/`copiadaDe`/`noInicio`/`novasEtiquetas` e **`comandosMoverQuadro`** (ticket do
    destino, fim da lista, conclusão pela lista, etiquetas trocadas, só as pessoas do grupo do destino, equipes de mesmo
    nome; checklists/comentários/eventos/histórico vão junto). `tarefas.ts`: `copiarTarefa`, `moverTarefaDeQuadro`,
    `destinosDeTarefa`. Rotas `POST /api/tarefas/[id]/copiar` (`copiarTarefaSchema`: quadro, lista, título, topo/fim,
    template, checklists/etiquetas/pessoas/datas), `POST /api/tarefas/[id]/mover-quadro` e `GET /api/tarefas/destinos`
    (quadros ativos acessíveis + listas, só ao abrir o diálogo) — destino acessível, arquivado = 409, auditoria, automações
    do destino. Tela: menu **"…"** no cabeçalho do detalhe (Copiar · Mover para outro quadro · Criar template · Copiar link —
    copiar/mover pedem as alterações salvas) e no menu do cartão; diálogo **`CopiarMoverTarefa`**; ícone de template no pé de
    cada lista (**`SeletorTemplates`**, com a prévia) — cria a tarefa naquela lista e abre com o cursor no FIM do título
    (`AberturaTarefa.focoTitulo`); Lista com **Ativas · Templates · Arquivadas**.
  - **FASE 14 / F4 — LISTAS, QUADRO DO PERÍODO, FAVORITOS e TROCA DE QUADRO (sem migração):** **`MenuLista`** (o "…" no
    cabeçalho de cada lista — `ColunaTarefas.menu`, `QuadroKanban.menuLista`): Adicionar tarefa · **Ordenar por** prazo/
    criação/título/prioridade (`ordenarCartoes`, puro; `POST /api/tarefas/listas/[id]/ordenar` — qualquer membro, renumera os
    ativos em lotes de 100 — `renumerarCartoes`) · **Mover todos os cartões para…** e **Arquivar todos os cartões** (a MESMA
    massa `POST /api/tarefas/massa`, `executarMassa` do quadro) e, para editores, **Copiar lista** / **Mover lista para
    outro quadro** (**`CopiarMoverLista`**: cria a lista no destino — `POST …/listas` com `aposId` = a cópia fica ao lado da
    original, `colocarListaApos` — e passa CARTÃO A CARTÃO pelas rotas de copiar/mover tarefa da F3, com o andamento; mover
    leva também os arquivados e só exclui a original vazia; o que falhar fica nela) e **Arquivar lista**. **Quadro do
    PERÍODO:** `listasDoPeriodo(ano, mês, feriados, diasUteis)` (`calendario-core`, uma lista por dia "05 - OUTUBRO - 2026" —
    `nomeListaDoDia`; só dias úteis tira sábado, domingo, feriados nacionais calculados + os do ADM e pontos facultativos)
    no **"Novo quadro"** (`criarQuadroSchema.periodo`, padrão = o mês seguinte — `mesSeguinte`) e na Configuração → Listas →
    **"Listas do mês"** (`POST /api/tarefas/quadros/[id]/listas/periodo`, editor): `gerarListasDoPeriodo` cria SÓ as que
    faltam (pelo nome), depois das listas comuns e antes das de concluídas. O "Novo quadro" também **copia os TEMPLATES**
    de outro quadro (`templatesDe` → `copiarTemplatesDe`: até 30, numa lista TEMPLATES criada como a 1ª). Campos em
    **`CamposPeriodo`** (`QuadroCard.tsx`). **Favoritos** (preferência `tarefas:favoritos` → `{ids}`, `lerFavoritos`/
    `favoritosPrimeiro`; `favoritosDaPessoa` em `carregarQuadros`/`carregarQuadro`): **`EstrelaFavorito`** no `QuadroCard`
    (fora do link, no canto) e no cabeçalho do quadro, hook **`useFavoritosQuadros`** (otimista, em fila; falha volta);
    os favoritos vêm primeiro na lista de quadros. **`TrocarQuadro`** ("Mudar de quadros" — ver o bullet do painel no
    padrão Trello abaixo) leva ao escolhido na MESMA aba.
  - **FASE 15 / F5 — ETIQUETAS no seletor + FILTROS completos (sem migração):** `FiltroTarefas` virou o do Trello — em cada
    dimensão VÁRIOS valores = QUALQUER um (vazio = sem filtro): `responsaveis` ("eu" · "sem" · pessoa), `prazos`
    (`FILTROS_PRAZO`: atrasadas · hoje · **até amanhã** · **7 dias** · **30 dias** — os "vencem em" só as abertas, de hoje em
    diante — · sem prazo), `prioridades`, `etiquetas` (ids + "sem") e `status` (todas · não concluídas · concluídas); a busca
    segue. Núcleo: `filtrarTarefas`, `contarFiltros` (o número do botão), `filtroDeTarefaAtivo` (o Calendário esconde a
    previsão do PCA/agendas externas), `alternarValor`. **`FiltrosTarefas`** = busca + o botão **Filtrar** (com o número) que
    abre o PAINEL (Pessoas com a foto e "Mostrar mais" · Status · Prazo · Prioridade · Etiquetas na cor); `semStatus`/
    `semResponsavel`/`semBusca` para o Calendário. `ChipsFiltrosTarefas` = um chip por VALOR. O Dashboard marca a carga pela
    pessoa quando há UMA escolhida. **`SeletorEtiquetas`** (+ **`ChipEtiqueta`**) no bloco Etiquetas do detalhe: as marcadas
    em chips + o "+" (busca, caixas na cor, "Mostrar mais" acima de 12; editores: lápis — nome + cor da paleta — e **"Criar
    etiqueta"**, que já a marca na tarefa; grava pelas rotas de etiqueta do quadro e o quadro recarrega).
  - **FASE 16 / F6 — DETALHE NO PADRÃO TRELLO + TEXTO FORMATADO + ATIVIDADE NUM FLUXO (sem migração):**
    - **Texto formatado** — núcleo PURO **`texto-formatado.ts`** (testado): markdown RESTRITO → árvore (`lerTextoFormatado`:
      títulos `#`, listas `-`/`1.`, citação `>`, separador `---`, parágrafos com quebra; `lerInline`: `**negrito**`,
      `*itálico*`/`_itálico_`, `` `código` ``, `[texto](https://…)`, URLs soltas e `@menção` — links SÓ http/https),
      `textoPlano` e `aplicarAcaoTexto` (a barra do editor). Componentes (`TextoFormatado.tsx`): **`TextoFormatado`**
      (desenha por elementos React — nunca HTML cru), **`EditorTexto`** (barra título · negrito · itálico · listas ·
      citação · código · link, Ctrl+B/I, **Escrever | Visualizar**) e **`CampoTextoFormatado`** (lido formatado; tocar ou o
      lápis edita no lugar; "Pronto" volta) — na DESCRIÇÃO, nas NOTAS e nos COMENTÁRIOS.
    - **`AtividadeTarefa`** (ex-`ComentariosTarefa`): **Comentários e atividade** num fluxo só — escrever no TOPO (@menção,
      Ctrl/⌘+Enter), os comentários do mais novo ao mais antigo e, com **Mostrar detalhes** (lembrado no aparelho,
      `tarefas:atividade-detalhes`), as alterações do histórico intercaladas (`EventoHistorico`, exportado do `Historico`;
      o histórico só é buscado com os detalhes à vista). Saíram as abas Comentários | Histórico.
    - **`TarefaDetalhe` na distribuição do Trello:** o **círculo de concluir + o TÍTULO no lugar** (`TituloNoLugar`, cresce
      com o texto), "Na lista", **+ Adicionar** (**`MenuAdicionarCartao`**, `BlocosTarefa.tsx`: metadados + blocos do corpo;
      substitui a antiga `PaletaBlocos`), a **faixa de METADADOS** (`TIPOS_METADADO`: Membros · Etiquetas · Datas ·
      Prioridade · Estimativa — `metadadoTemDado`; aparecem com dado ou acrescentados; tocar abre o editor logo abaixo —
      membros/equipes/observadores, datas + REPETIR + "Remover as datas", prioridade, estimativa; etiquetas pelo
      `SeletorEtiquetas`), a **descrição** formatada e os **blocos do CORPO** (`TIPOS_BLOCO` = nota · checklist · link ·
      eventos · vínculo; alça e ↑/↓). Prazo/responsáveis/etiquetas/estimativa/recorrência deixaram de ser blocos
      (`lerBlocos` ignora os gravados — o dado mora nas colunas; `DadosBlocos` só vínculo/checklist/eventos).
    - **`CartaoTarefa`:** etiquetas em **FAIXAS** na cor — tocar alterna faixa ↔ nome em TODOS os cartões
      (`useEtiquetasComNome`, `tarefas:etiquetas-nome-v2` no aparelho — padrão: com o nome) — e o ícone de **descrição** (`TarefaResumo.temDescricao`,
      calculado no banco em `dadosQuadro`).
  - **FASE 17 / F7 — CAMPOS PERSONALIZADOS + TÍTULO AUTOMÁTICO (migração `0056`, aditiva):** tabelas `tarefa_campos`
    (quadro cascade, nome, `tipo` texto|numero|data|lista|checkbox, `opcoes` JSON, ordem, `no_cartao`) e
    `tarefa_campo_valores` (PK tarefa + campo, ambos cascade) + `tarefa_quadros.formato_titulo` e `tarefas.titulo_manual`.
    Núcleo puro (`tarefas-core`, testado): `valorCampo` (normaliza por tipo — número pt-BR/en, data válida, opção da lista,
    caixa "1"; inválido = null = tira), `rotuloValorCampo`, `lerOpcoesCampo`, **`montarTitulo`** (o formato
    `{Categoria} - {Tipo} - {Nº protocolo}` com os valores; campo vazio SOME com o separador; nome sem acento/caixa; ≤ 200),
    `camposDoFormato`, **`mapearCampos`** (copiar/mover entre quadros: pelo NOME + MESMO tipo, o valor tem de valer no
    destino), `valoresAposMudar`; `FiltroTarefas.campos` (campo de lista/caixa → valores; "" = sem valor). D1: builder
    **`comandosValoresCampos`** (null tira; INSERTs de ≤ 20 linhas com upsert — testado no driver D1 real, também dentro de
    `comandosCriarTarefa` e `comandosMoverQuadro`), `listarCampos`/`criarCampo`/`atualizarCampo` (trocar o TIPO apaga os
    valores; tirar OPÇÕES apaga os valores sem opção)/`excluirCampo`/`ordenarCampos`, `valoresValidos` (campo de outro
    quadro = 422) e **`tituloAutomatico`** (formato ligado e título não manual). `TarefaResumo.campos`/`tituloManual` vêm em
    `dadosQuadro`/`getTarefa`; `carregarQuadro`/`contextoTarefa` trazem os `campos` e o formato. **Título automático no
    SERVIDOR**: `POST /api/tarefas` e o `PATCH` (quando os valores mudam ou `tituloManual:false`) recalculam o título;
    escrever o título à mão marca `tituloManual` ("Usar o automático" volta). Copiar, template, mover de quadro e a
    recorrência levam os valores. Rotas `POST`/`PATCH /api/tarefas/quadros/[id]/campos` (criar até `MAX_CAMPOS`=20, nome
    único / ordem) e `PATCH`/`DELETE /api/tarefas/campos/[id]` (editor, auditoria `tarefa_campo`); o formato vai no `PATCH`
    do quadro. Tela (`CamposTarefa.tsx`): **`CamposPersonalizadosQuadro`** (Configuração: ↑/↓, tipo, opções em
    `CampoLista`, "Mostrar no cartão" + o **Formato do título** com atalhos "+ Campo" e a prévia), **`CamposDaTarefa`**
    (editores por tipo no detalhe, seção "Campos personalizados"; o título acompanha ao vivo) e **`ChipsCamposCartao`**
    (os "no cartão" com valor); colunas na Lista (data = filtro de data, número = faixa) e no .xlsx; seções no painel
    Filtrar (lista e caixa) + chips.
  - **FASE 18 / F8 — VÍNCULOS MÚLTIPLOS, tarefa ↔ tarefa (migração `0057`, aditiva):** tabela `tarefa_vinculos` (PK
    tarefa + tipo + alvo, tarefa cascade, índice `tipo, alvo_id`; sem FK no alvo) — a migração copia o vínculo único antigo
    e `tarefas.vinculo_tipo/vinculo_id` ficam DORMENTES (fora do `schema.ts`). `TIPOS_VINCULO` ganhou **`tarefa`**;
    `TarefaResumo.vinculo` virou **`vinculos: VinculoTarefa[]`** (até `MAX_VINCULOS`=20; na tarefa vinculada, `detalhe` quadro
    › lista, `quadroId`, `prazo`, `concluida`). O vínculo entre TAREFAS vale nos DOIS lados: a linha é gravada por uma, e a
    leitura (`linhasVinculos` — as gravadas pela tarefa + as de outras que apontam para ela) passa por
    **`vinculosPorTarefa`** (puro/testado: sem repetir, sem a própria); **`comandosVinculosTarefa`** troca o conjunto como a
    tarefa o vê (apaga as dela e os reversos, grava a partir dela — testado no D1 real). `rotulosVinculos` devolve os dados
    do alvo (tarefa = "#ticket título"); `rotuloDoVinculo` (core) é o texto único (cartão, Lista, .xlsx). `hrefVinculo` da
    tarefa = `/painel/tarefas/<quadro>?tarefa=<id>`. `buscarVinculos` busca TAREFAS (título ou nº do ticket) nos quadros dos
    grupos do usuário; `vinculoAcessivel` da tarefa = `tarefaAcessivel`; as rotas conferem só os vínculos NOVOS e recusam a
    própria tarefa (422); `tarefasDoVinculo` (o botão "Tarefas" da Mesa) lê a tabela nova. Copiar e a recorrência levam os
    vínculos. Tela: **`VinculosTarefa`** (ex-`VinculoTarefa`) — a lista de cartões compactos (tarefa com o círculo de
    conclusão, quadro › lista e o prazo no semáforo; os demais com o rótulo) com Desvincular e "Vincular" (tipo + busca);
    o bloco do corpo virou "Vínculos"; o cartão mostra o ícone com a contagem; a Lista, a coluna "Vínculos" multi-valor.
  - **FASE 19 / F9 — IMPORTAR DO TRELLO (sem migração):** núcleo PURO **`trello-import.ts`** (testado com um JSON de
    exemplo): `lerTrello` (o JSON exportado → listas na ordem [a fechada, arquivada], etiquetas [`corTrello`: cor do Trello e
    variações `_dark/_light` → hex], cartões [título, descrição, prazo com HORA em Brasília (`dataHoraTrello`, UTC−3),
    início, `dueComplete` = concluída no lugar, `closed` = arquivada, `isTemplate` = template], checklists nomeados com os
    itens MARCADOS, comentários com autor e data, anexos: link para OUTRO cartão do mesmo quadro = vínculo tarefa ↔ tarefa
    (`codigoCartaoTrello`), os demais = blocos Link; cartão de lista inexistente sai; tolerante — nada lança), `casarMembro`
    (membro → pessoa do grupo só quando UMA casa: nome completo, ou usuário/nome = apelido) e `resumoTrello`. Servidor: `POST
    /api/tarefas/quadros/[id]/importar` (`importarTrelloSchema`, editor, quadro não arquivado, auditoria `importar`) em 3
    passos — `estrutura` (`importarEstrutura`: tira as listas VAZIAS se pedido, cria as listas no fim e as etiquetas —
    as de mesmo nome são reusadas), `cartoes` (até `LOTE_IMPORTACAO`=20; `importarCartoes`: um lote atômico por cartão com
    `comandosCriarTarefa` [+ `arquivada`, `ChecklistNovo.feitos`] e `comandosComentariosImportados` [sem usuário, nome e data
    do Trello; INSERTs de 16 — testados no D1 real]; para no 1º erro e devolve o que entrou) e `vinculos`
    (`importarVinculos`: só entre tarefas do quadro, o par e o inverso uma vez). Listas/etiquetas/pessoas conferidas contra
    o quadro. Tela: **`ImportarTrello`** (Configuração → "Importar do Trello"): `Dropzone` do .json → prévia (`StatMini`),
    os membros com o `SelectField` da pessoa (pré-casados), "Importar também os arquivados" e "Tirar as listas vazias" →
    `Progress` por etapa; uma falha mostra o motivo e "Tentar de novo" RETOMA (as chaves já criadas ficam guardadas).
  - **"+ ADICIONAR OUTRA LISTA" no quadro (sem migração):** a última coluna do `QuadroKanban` é a **`NovaLista`** (como no
    Trello: tocar abre o nome, Enter cria no fim e segue aberta para a próxima; Esc/X/tocar fora fecha; no celular, um
    ponto "+" na navegação das colunas) — `QuadroKanban.onNovaLista`, ausente com o quadro arquivado; o quadro SEM listas
    mostra só essa coluna. Quem MANIPULA Tarefas no grupo do quadro cria (`POST /api/tarefas/quadros/[id]/listas` —
    `recusaNoQuadro`); o limite de cartões, "de concluídas" e a posição (`aposId`) seguem de quem CONFIGURA, assim como
    editar/arquivar/excluir/ordenar listas.
  - **DUPLICAR cartão · EXCLUIR QUALQUER LISTA · IMAGEM DE FUNDO por link (migração `0058`, aditiva):**
    - **Duplicar** (o "Copiar cartão" do Trello): o ícone de cópia ao lado do `#ticket` do `CartaoTarefa` (`onDuplicar`), o
      "Duplicar" do menu "⋯" do toque e do "…" do detalhe → `POST /api/tarefas/[id]/copiar` com **`aposId`** (a cópia entra
      logo ABAIXO do original — `colocarTarefaApos` pelos vizinhos, `moverTarefa`), título "Cópia de …" (o AUTOMÁTICO segue
      automático), com Desfazer (editor exclui; os demais arquivam a cópia).
    - **Excluir qualquer lista** (editores): **`ExcluirLista`** (`MenuLista.tsx`; no "…" da lista e na Configuração) conta os
      cartões no servidor (`GET /api/tarefas/listas/[id]`, inclusive arquivados) e escolhe: **mover para outra lista**
      (`DELETE …?moverPara=` → `comandosEsvaziarLista` + a exclusão num lote atômico: todos ao FIM do destino, na ordem, a
      conclusão pela lista — testado no driver D1 real; as automações do destino rodam) ou **excluir tudo junto** (cascade).
    - **Imagem de fundo** (`tarefa_quadros.fundo_url`): só o LINK é guardado — a imagem fica no site de origem (sem upload).
      Configuração → **`FundoQuadro`** (prévia 16:9, Aplicar/Remover, aviso se o site bloquear) — exibida NÍTIDA pela `MolduraQuadro`. Aceita o link DIRETO da
      imagem ou o de uma PÁGINA (pin do Pinterest, `pin.it`): o `PATCH /api/tarefas/quadros/[id]` `{fundoUrl}` resolve
      (`resolverImagemFundo`, `imagem-fundo.ts`) pela **busca segura** (`busca-segura.ts` `baixarSeguro` — a MESMA das
      agendas externas: só HTTPS público, redirecionamento revalidado, tempo/tamanho limitados) e tira o `og:image`/
      `twitter:image` (núcleo puro `imagem-fundo-core.ts`: `fundoUrlValida`, `pareceImagem`, `imagemDaPagina`,
      `urlFundoCss` — testado). A imagem aparece NÍTIDA na `MolduraQuadro` (ver "PADRÃO VISUAL DO TRELLO" abaixo); o
      `QuadroCard` mostra a imagem na faixa (a cor por baixo).
  - **VISUAL DO TRELLO no quadro + ARRASTAR LISTAS + EDIÇÃO NO LUGAR + ITENS ARQUIVADOS (sem migração):**
    - **`CartaoTarefa`:** etiquetas CHEIAS na cor com o nome (padrão; tocar alterna para faixas — `useEtiquetasComNome`) e
      o texto pelo contraste (`textoSobre`, `color.ts` → tokens `--sobre-claro`/`--sobre-escuro`; o mesmo no `ChipEtiqueta`
      do detalhe); selo "Este cartão é um template."; PRAZO em selo (concluída = verde cheio, atrasada = vermelho, vence =
      âmbar) e CHECKLIST completo em verde cheio. Com o MOUSE sobre o cartão aparecem o CONTORNO de seleção, o CÍRCULO de
      concluir (o título abre espaço — largura animada; concluída fica à vista) e os botões EDITAR e DUPLICAR; no toque, o
      círculo, a alça e o menu "⋯" ficam à vista.
    - **Listas:** `ColunaTarefas` sem borda (`rounded-xl`, 17,5rem), o NOME editável no lugar (**`TextoNoLugar`** — um clique
      vira campo com o texto selecionado; Enter/tocar fora grava, Esc desfaz; `PATCH /api/tarefas/listas/[id]`, editores) e
      "Adicionar um cartão". **ARRASTAR LISTAS** pelo cabeçalho (mouse/caneta; no toque, a alça): **`useArrastoListas`**
      (`ArrastoCartoes.tsx`, o padrão do arrasto de cartões — coluna PRESA inclinada no cursor, `SombraLista` no destino,
      rolagem nas bordas, pouso; o clique ao soltar é engolido) → `QuadroTarefas.moverLista` otimista (a ordem de TODAS as
      listas, as arquivadas nos lugares delas) → `PATCH /api/tarefas/quadros/[id]/listas` (editores).
    - **Quadro:** o NOME no cabeçalho também é `TextoNoLugar` (editores; `PATCH` do quadro). "Itens arquivados" (hoje no
      menu "…" do quadro) → **`ItensArquivados`** (`Segmented` Cartões | Listas +
      busca; restaurar — o cartão, qualquer membro; a lista, editores — e excluir — o cartão direto, a lista pela
      `ExcluirLista`); saiu o link "N arquivadas — ver na Lista".
  - **PADRÃO VISUAL DO TRELLO no espaço do quadro (sem migração):** o quadro é UMA **`MolduraQuadro`** (`MolduraQuadro.tsx`)
    — card grande `rounded-2xl` do topo até o fim do display (`useAlturaTela`, agora exportado por `AlturaCheia.tsx` com
    `reserva`; o calendário usa o mesmo), com a **imagem de fundo NÍTIDA** (sem véu; só depois de carregar —
    `useImagemCarrega` de `FundoQuadro.tsx`; sem imagem, degradê da cor do quadro) e, por cima, só **ilhas opacas**:
    - **`FaixaQuadro`** (topo translúcido com desfoque): voltar · título `TextoNoLugar ajustar` (inteiro; a dica traz grupo
      e Abertas/Atrasadas/Concluídas — os contadores e o selo do grupo saíram da tela) · favorito; à direita só ícones —
      **`MembrosQuadro`** (a MESMA **`PilhaFotos`** do cabeçalho — `PilhaFotos.tsx`, DS: fotos `sm` com a primeira por cima, o ponto ao vivo, leque e "+N"; tocar filtra pela pessoa), `FiltrosTarefas buscaNoPainel` (a busca dentro do painel, gatilho
      só ícone), as `FerramentasAba` da vista e o **`MenuQuadro`** "…" (Itens arquivados · Imagem de fundo · Automações ·
      Configurações — rola até `#secao-fundo`/`#secao-automacoes` — · Copiar link); os chips de filtro ativos numa linha
      fina abaixo, só quando há.
    - **`PilulaVistas`** (flutuante, opaca, no rodapé — `RESERVA_PILULA`): Quadro · Lista · Calendário · Dashboard ·
      Configuração | **Mudar de quadros** (`TrocarQuadro` com `gatilho`); troca pela MESMA lógica do `AbasEspaco`
      (`useTrocaAba` + `ConteudoAba`, exportados).
    - Conteúdo: as listas direto sobre a foto (`QuadroKanban naMoldura reservaInferior`: 272px, espaço de 12px,
      `.rolagem-fina`, `--lista-quadro` + `--sombra-cartao`; "Adicionar outra lista" translúcido sobre a imagem —
      `group-data-[com-imagem]/moldura`); Lista/Calendário/Dashboard/Configuração num **`PainelMoldura`** opaco (a tabela e
      o calendário descontam a pílula no `reservaInferior`).
    - Cartão sem o nº do ticket na face (fica na dica/detalhe), `rounded-lg` com a sombra do Trello; ícone de template do pé
      da lista = **`IconCartaoMais`**; a paleta de etiquetas é a do Trello (**`PALETA_ETIQUETAS`**, 10 cores × 3 tons, e
      `corEtiquetaSugerida` — `tarefas-core`, testados). Saíram `FundoDoQuadro` (véu), o `TrocarQuadro soSeta` e o botão
      "Arquivados" solto (foi para o menu "…").
  - **ENQUADRAR O FUNDO · CAPA DO CARTÃO · RECOLHER LISTA (migração `0059`, aditiva):**
    - `tarefa_quadros.fundo_ajuste` (JSON `{x,y,zoom}`): o PONTO FOCAL (%) e o ZOOM (1–3) da imagem — a moldura muda de
      proporção com a tela, então o enquadramento é ponto + zoom, não recorte. Núcleo puro em `imagem-fundo-core.ts`
      (`lerAjusteFundo`, `estiloFundo` → `object-position` + `scale` a partir do ponto, `arrastarFundo`, `avaliarImagemFundo`
      — avisa retrato/proporção fora de 16:9 e resolução abaixo de 1920×1080 —; `PROPORCAO_FUNDO`, testados). A moldura
      desenha a imagem numa `<img object-cover>` (`estiloFundo`) e o `QuadroCard` usa o mesmo ponto. **`FundoQuadro`**:
      prévia 16:9 ARRASTÁVEL (setas também) + zoom + "Centralizar"/"Salvar enquadramento" (`PATCH` do quadro
      `{fundoAjuste}`; trocar a imagem zera o enquadramento), o tamanho da imagem com a recomendação (paisagem 16:9, ≥
      1920×1080) e **Fotos sugeridas** (Unsplash, só o link).
    - `tarefas.capa` (hex): a CAPA colorida do cartão (faixa de 32px no topo, como no Trello) — escolhida no menu "…" do
      detalhe (os 10 tons normais da `PALETA_ETIQUETAS` + "Remover a capa"; grava na hora, `PATCH /api/tarefas/[id]`
      `{capa}`); a cópia do cartão leva a capa.
    - Listas **RECOLHÍVEIS** (botão no cabeçalho, com o mouse sobre a lista; no toque, sempre): vira uma faixa estreita com
      o nome na vertical — tocar expande; guardadas no aparelho (`tarefas:recolhidas:<quadro>`, `useSetLocal` — o hook genérico de ids no aparelho). Com
      filtro ligado, a contagem da lista mostra **"N de M"** (`QuadroKanban.totais`).
    - Título do quadro inteiro: o `TextoNoLugar ajustar` não usa margem negativa nem `max-width` (cortavam a largura
      intrínseca — "tes…"); Dashboard e Configuração ficam "vazados" (`PainelMoldura vazado`: os quadros/seções delas já são
      ilhas opacas).
  - **FUNDO por FOTO/DEGRADÊ/NENHUM + CARD com CAPA 16:9 + QUADRO PRIVADO (migração `0060`, aditiva):**
    - `tarefa_quadros.fundo_gradiente` (JSON `{cores: 2–3 hex, angulo}`) — imagem e degradê se EXCLUEM (o servidor tira um
      ao gravar o outro); sem nenhum, o **padrão do sistema** (a moldura na superfície cinza, sem nada — saiu o degradê da
      cor). Núcleo puro em `imagem-fundo-core.ts`: `lerGradiente` (só hex validados — sem injeção de CSS),
      `cssGradiente`, `GRADIENTES_PADRAO` (10), `ANGULOS_GRADIENTE`, `mesmoGradiente`, `FundoEscolha`/`fundoDoQuadro`/
      `corpoFundo`, `PESQUISAS_SUGERIDAS`, `fotosPicsum`, `fotosDoUnsplash` (testados).
    - **`SeletorFundo`** (o "Tela de fundo" do Trello, no **Novo quadro** e na Configuração → **Fundo do quadro**): prévia do
      quadro, 4 fotos 16:9 + "…" → **Pesquisa de fotos** (busca, pesquisas sugeridas, principais fotos, crédito) e os
      DEGRADÊS em CÍRCULOS — "Sem fundo", os predefinidos e "+" = **degradê próprio** (2–3 cores + direção + prévia).
      Fotos: **`GET /api/tarefas/fotos?q=`** (`buscarFotosFundo`, `fotos-fundo.ts`) — Unsplash com o Worker Secret
      `UNSPLASH_ACCESS_KEY` (cache 10 min), senão a seleção fixa do Picsum; setup em `docs/INTEGRACOES.md`.
      `POST /api/tarefas/quadros` aceita `fundoUrl`/`fundoGradiente` (a imagem resolvida ANTES de criar) e `privado`.
    - **`CapaQuadro`** (`QuadroCard.tsx`): o card do quadro mostra a imagem (com o enquadramento) ou o degradê numa capa
      16:9 DENTRO do card; sem fundo, a superfície com a cor do quadro num traço; contagens numa linha (abertas ·
      atrasadas · concluídas); altura igual na grade.
    - **Quadro PRIVADO** (`tarefa_quadros.privado` + `criado_por` = o dono): só quem criou o vê — NEM o grupo NEM o ADM (o
      ADM só entra no privado cujo dono não existe mais). `quadroAcessivel` barra; **`quadroVisivel(u)`** (`tarefas-sql`,
      testado no D1 real) entra em TODA lista: `listarQuadros(grupos, hoje, usuarioId)` (lista de quadros, calendário,
      busca do calendário, `.ics`, "Tarefas" da Mesa), `buscarVinculos` (tarefa), `tarefasDoVinculo`, `destinosDeTarefa` e
      os avisos derivados do sino. "Quadro privado" no Novo quadro; na Configuração, só o DONO liga/desliga (403 aos
      demais). Cadeado na capa do card e na faixa do quadro. Criar quadro segue só para editores. **Dentro do privado só
      existe o DONO:** `pessoasDoQuadro(q)` (`tarefas.ts`, a fonte única — `soDoDono`) dá as pessoas do quadro (grupo; no
      privado, só o dono) para `carregarQuadro`/`contextoTarefa` (fotos do topo, responsáveis, observadores, equipes,
      convidados, @menção, responsável do checklist, filtro), os comentários e a importação do Trello; `pessoasValidas(q,
      …)` recusa (422) qualquer outra pessoa no privado; o Calendário só oferece o dono ao convidar num evento de tarefa de
      quadro privado (`quadros[].dono`). TORNAR PRIVADO (só o dono; confirma — `useConfirmacao`) é um lote atômico
      **`comandosTornarPrivado`** (`tarefas-sql`, testado no D1 real): liga `privado` e tira os OUTROS de `tarefa_pessoas`,
      `tarefa_equipe_membros`, `tarefa_evento_convidados`, `tarefa_checklist.responsavel_id` e das `notificacoes` do
      quadro (tarefas, eventos, equipes e histórico ficam; auditoria diz o que saiu). Pôr o quadro numa PASTA PRIVADA o torna privado pelo MESMO lote (ver "PASTAS PÚBLICAS/PRIVADAS").
  - **"MUDAR DE QUADROS" no padrão do Trello (sem migração):** o **`TrocarQuadro`** (o item da `PilulaVistas`) abre um
    `Modal` (bottom-sheet no celular) com o **`PainelQuadros`**: `SearchField` "Pesquisar seus quadros" (nome ou grupo —
    `predicadoBusca`), **`ChipsEscolha`** por GRUPO (Tudo · grupo…; só com 2+ grupos — o componente novo de chips de
    escolha que QUEBRAM linha, também usado nas pesquisas sugeridas do `SeletorFundo`) e as MESMAS seções da tela de
    Tarefas (`SecoesDeQuadros` — ver "SEÇÕES DE QUADROS + PASTAS"; os recentes em `localStorage`
    `tarefas:quadros-recentes`, até 8). Tudo com o MESMO **`QuadroCard`** da tela de Tarefas (capa 16:9, grupo, nome em até 2 linhas, contagens, a
    estrela de favorito — `onFavorito` — e, no aberto agora, `atual`: contorno accent + selo "Atual"; `onAbrir` fecha o
    painel ao navegar). Os quadros (de TODOS os grupos da pessoa, sem os arquivados; o privado só do dono) vêm só ao abrir
    por **`GET /api/tarefas/quadros`** (`listarQuadros`). Saíram o `Dropdown` + `SeletorBusca` do trocar de quadro.
  - **SEÇÕES DE QUADROS + PASTAS PÚBLICAS/PRIVADAS (migração `0061`):** a tela de Tarefas e o "Mudar de quadros" usam o MESMO
    **`SecoesDeQuadros`** (`SecoesQuadros.tsx`): **Favoritos** · **Visualizados recentemente** (deste aparelho —
    `registrarQuadroRecente`/`useQuadrosRecentes`) · **Seus quadros** (com 2+ grupos, `ChipsEscolha` por grupo; o card
    "Novo quadro" no fim). Cada seção é uma **`SecaoQuadros`** que MINIMIZA/MAXIMIZA pelo título (guardado neste aparelho —
    `useSecoesRecolhidas`). Favoritos/Recentes/busca usam a **`GradeQuadros`** (o `QuadroCard` INALTERADO em `auto-fill` ≥
    15rem; NÃO se reordena: a tentativa de arrastar — 6px com o mouse ou segurar ~400 ms no toque — vira o **ARRASTO NEGADO**
    (`useArrastoNegado`): o card sacode (`animate-negar-arrasto`), cursor "não permitido", vibração no toque e o aviso
    "Para organizar, arraste em “Seus quadros”" por cima; o arrasto nativo do link é bloqueado e o clique seguinte engolido); "Seus quadros" usa a **`GradePastas`** (`PastasQuadros.tsx`): as **PASTAS** (os conjuntos) e os quadros soltos na
    ORDEM da pessoa. **`PastaQuadro`** = o DESENHO DE UMA PASTA na MESMA célula/altura do `QuadroCard`: a ABA com o ícone, as
    COSTAS no tom da cor, as FOLHAS saindo (as capas de até 3 quadros, em leque; vazia = folhas lisas — numa camada POR CIMA das costas, sem
    corte: em repouso ficam dentro; no hover sobem 8px e, aberta/alvo, 12px — passando do contorno de cima — o efeito 3D; a ABA fica
    atrás delas, como as costas) e a FRENTE na cor
    (texto por `textoSobre`) com "Pasta · N quadros", o nome e os chips abertas/atrasadas; ENTREABRE no hover/foco (a frente
    inclina — `rotateX` com perspectiva — e as folhas sobem), abre mais aberta/alvo; menu "…" = **`MenuConjunto`**. O painel
    da pasta aberta tem a MESMA aba colada ao topo (nome + fechar). Tocar ABRE a
    pasta NO LUGAR: o painel (`PainelPasta`) entra no fim da LINHA da pasta (colunas medidas por `ResizeObserver`), anima a
    altura (`grid-template-rows` 0fr ↔ 1fr — os cards de baixo deslizam) e os internos entram em sequência; uma aberta por
    vez (lembrada no aparelho, `tarefas:pasta-aberta`). **Arrasto** — hook **`useArrastoGrade`** (o padrão do
    `ArrastoCartoes`: janela, 6px, `segurar`, o card PRESO no `CartaoPreso`, o ESPAÇO VAZIO no destino — sem contorno —, rolagem nas bordas da
    página/modal, clique pós-arrasto engolido; no TOQUE, segurar ~400 ms — deslizar antes rola; o card arrastado segue no
    DOM, oculto, para o toque não perder o alvo): soltar entre cards reordena (pousa na sombra); sobre o MEIO de uma pasta
    ("Soltar na pasta") o card ENCOLHE para dentro dela (`CartaoPreso.entrando`) e ela pulsa (`animate-pasta-recebe`) — a
    sombra fica parada enquanto o dedo está sobre a pasta; dentro da aberta reordena; arrastar para fora a tira; pasta não
    entra em pasta; Alt+←/→ reordenam pelo teclado. **As pastas moram no BANCO** (`tarefa_pastas`: grupo cascade, nome, cor,
    `privado`, `criado_por`, ordem; `tarefa_quadros.pasta_id` set null + `pasta_ordem` — um quadro em UMA pasta): a **PÚBLICA**
    é do GRUPO (todos os membros a veem; só EDITORES criam/organizam/movem quadros nela; só quadros NÃO privados do mesmo
    grupo); a **PRIVADA** é do DONO (só ele a vê — nem o grupo nem o ADM; qualquer membro cria) e **tudo dentro dela é
    privado**: só entram quadros criados por ele, que VIRAM privados ao entrar (`comandosTornarPrivado` no mesmo lote — a
    tela confirma antes), o quadro criado dentro dela nasce privado e, ao arrastá-lo para fora, o dono escolhe se ele volta ao
    grupo ("Tornar visível" | "Manter privado"). Trocar a privacidade do quadro na Configuração o tira da pasta que não
    combina (`soltarSeIncompativel`). A migração converteu as pastas antigas (preferência de cada pessoa) em pastas PÚBLICAS
    do grupo do 1º quadro público delas. A ORDEM da RAIZ segue PESSOAL — preferência `tarefas:conjuntos` = **`{ordem}`**
    (`p:<pasta>`/`q:<quadro solto>`). Núcleo puro testado em `tarefas-core`: `pastasDosQuadros` (as pastas com os quadros
    pela `pastaOrdem`), **`podeEditarPasta`**/**`motivoNaoMoverParaPasta`** (as regras, a mesma na tela e no servidor),
    `lerOrdemGrade`, `itensDaGrade`, `moverNaGrade` (destino relativo ao vizinho VISÍVEL; a ordem COMPLETA preserva o lugar
    dos quadros que a tela não mostra), `excluirPasta`. Builders (`tarefas-sql`, testados no D1 real): `comandosMoverParaPasta`,
    `comandosQuadrosDaPasta`, `comandosExcluirPasta`, `pastaVisivel`. Rotas: `POST /api/tarefas/pastas` (`{nome, cor,
    privado, quadros, grupoId?}` — a pública exige editor), `PATCH`/`DELETE /api/tarefas/pastas/[id]` (quem organiza; a
    privacidade é fixa), `POST /api/tarefas/pastas/mover` (o arrasto: `{quadroId, pastaId|null, antesDe, depoisDe,
    tornarPublico}` — `pasta_ordem` pelos vizinhos, `ordemEntre`) e `POST /api/tarefas/quadros` com `pastaId` (criado dentro;
    na privada nasce privado); auditoria `tarefa_pasta`. Na tela: `GradePastas.podeMover` — a pasta que recusa o quadro
    arrastado mostra "Não pode entrar" em vermelho e soltar dá o ARRASTO NEGADO (sacode + o motivo); a PRIVADA leva o
    cadeado na aba e o selo "Privada"; o menu "…" só para quem organiza; `extraPasta` = o card "Novo quadro nesta pasta"
    (editor). Hook `useConjuntosQuadros(inicial, {quadros, ator, aoMudar})` (`estado`/`salvar`/`excluir`/`mover`/
    `confirmacao`, otimista em FILA; ids provisórios `novo-…` até o POST; recarrega os quadros depois). "Nova pasta" →
    **`EditorConjunto`** (nome, cor, o `Switch` "Pasta privada" na criação — travado ligado para quem não é editor — e só os
    quadros que podem entrar; avisa "sai da pasta X"/"vira privado"). O painel do "Mudar de quadros" tem as MESMAS pastas,
    regras e edição (`GET /api/tarefas/quadros` devolve `conjuntos` = `{lista, ordem}` + `ator`).
- **Próximo** (ver `docs/ROADMAP.md`): o padrão Trello está completo (F1…F9) e os avisos já saem por e-mail (Resend — ver
  Integrações); a seguir, o relatório de produtividade por grupo.

## Rotas de API (`src/app/api/**`)
- Envelope padrão **`{ ok: true, ... }`** / **`{ ok: false, error }`**.
- Helpers em **`src/lib/http.ts`**: `ok(data?)`, `erro(msg, status)`, `parseCorpo(schema, req)`
  (valida Zod e devolve 422 pronto). **Rotas novas/editadas devem usá-los** + as guardas
  `exigir*` e `intId` de `api-auth`.
- Validação de entrada sempre com **Zod** (`src/lib/*-validation`).
- DFD/protocolo (além das já citadas): `GET /api/protocolo/[id]?completo=1` (protocolo + DFDs COMPLETOS + unidades com
  responsáveis — banner gravado), `GET /api/dfd/[id]` (DFD + `unidade`), `POST /api/dfd/conferencia` (`{ids ≤ 200}` →
  estado/resumo/validação por DFD, Visualizar numa das Mesas + o escopo), `POST /api/dfd/massa` (`{ids ≤ 500, acao}` → edição em massa,
  Manipular na Mesa de cada DFD), `POST /api/protocolo/massa` (`massaProtocolosSchema`: `{ids ≤ 20, acao reparticao|assunto|valorCapa}`,
  Manipular na Mesa de cada protocolo, escopo por protocolo, `{alterados, falhas}`), `POST /api/dfd/itens/massa` (`massaItensSchema`: `{ids ≤ 100
  de ≤ 5 DFDs, acao catalogo|unidade|quantidade|valorUnitario|remover}`, lote atômico por DFD) e `POST /api/protocolo`
  `start-protocolo` com **`reenvio {protocoloId, resumo}`** (sobrescrita do MESMO protocolo — 422 se nº/Id não conferem).
  IN (...) sempre em lotes de ≤ 90 ids (`LOTE_IDS`/`lotesDeIds`) — limite de 100 parâmetros do D1.
- Gestão/histórico (migração `0031`): `POST /api/protocolo/conferencia` (`{ids ≤ 50}` → estado AGREGADO por protocolo,
  Visualizar numa das Mesas), `PATCH /api/protocolo/[id]` também com `responsavelId`/`situacaoId` (+ `origem` banner|celula),
  `POST /api/protocolo/massa` com as ações `responsavel`/`situacao`, `GET /api/protocolo/[id]/historico` e
  `GET /api/dfd/[id]/historico` (histórico conectado, escopo por unidade), `GET`/`POST /api/admin/situacoes` +
  `PATCH`/`DELETE /api/admin/situacoes/[id]` + `PATCH /api/admin/situacoes/ordem` (`exigirAdmin`) e `PATCH
  /api/perfil/preferencias` (`{responsavelPadraoId}` — pessoa ATIVA do grupo ou `null`).
- Falha de tela (diagnóstico): `POST /api/erros` (`falhaTelaSchema`, `exigirUsuario` — mapa `pessoal`) — a fronteira de erro
  informa o tipo/mensagem/ref/tela; vai aos LOGS do Worker (`[falha-na-tela]`, com o id, o papel e se é admin lidos da
  sessão; sem nome/e-mail) e NÃO à auditoria (mudaria a versão dos dados).
- Métricas da Mesa: `GET /api/mesa/execucao?ano=` (`execucaoMesaSchema`, Visualizar a Mesa do sistema) — o histórico de execução
  (reenvios e ações) dos protocolos da Mesa em tuplas `[protocolo, pessoa, dia, tipo, n]` + as pessoas (foto + apelido).
- Pessoas/sobrescrita (migração `0032`): `GET /api/usuarios/[id]/foto` (a foto do perfil, `exigirUsuario`, cache
  `immutable` pela versão `?v=`), `POST /api/dfd/existentes` (`existentesDfdSchema {numeros ≤ 2000, processo?}` → os DFDs já
  cadastrados em QUALQUER unidade; o de unidade sem acesso só `{numero, acessivel:false}`; com `processo {numero, idExterno}`,
  também o PROTOCOLO já cadastrado do PDF — os DFDs vivos e o rastro do de mesmo nº/Id: a RE-IMPORTAÇÃO pelo "Importar
  protocolo" soma na conciliação os DFDs que não vieram no PDF e continuam nele, com o aviso "use Reenviar protocolo para
  tirá-los" — análise = gravado), `POST /api/dfd` `start-dfd` com
  `origem:"sobrescrita"` + `escolhas {mantidos, editados}` (histórico) e SEM `protocoloId` = mantém o protocolo do DFD, e
  `GET /api/protocolo/[id]?completo=1` também com **`sobrescritos`** (o rastro, com o protocolo atual de cada um).
- Padronização (migração `0038`): `/api/catalogo/unidades-medida*` e `/api/catalogo/classificacoes*` — ver "Padronização:
  UNIDADES DE MEDIDA e CLASSIFICAÇÕES de item".

## UI — Design System por tokens (`/design-system` é a FONTE ÚNICA)
- **REGRA FIRME:** todo componente vive na biblioteca **`/design-system`** (rota pública,
  `src/components/designsystem/Catalogo.tsx`). Ao criar QUALQUER componente (inclui botões e
  ícones), **adicione-o ao catálogo**; as telas só podem **usar componentes do design-system**
  — nada de UI ad-hoc/inline. Ícones = **lucide-react** reexportados como `Icon*` em `icons.tsx`.
- **Nenhuma cor NEUTRA hardcoded** — só `var(--token)` via utilitários (`bg-surface`, `text-text`,
  `text-muted`, `border-border`, `rounded-card`, `shadow-ring`/`shadow-soft`, `bg-accent`…),
  gerados por `@theme inline` em `globals.css`. A **única hex** é a **cor semântica** (tons de apoio `--nat-comunicacao`/
  `--sit-*` [KPIs do PCA, erro de campo, tons violet/orange do `Badge`, "Limpar" dos filtros], feedback `--ok/--warn/
  --danger/--info`, avatar via `avatarVar` em `src/lib/semantic.ts`); tintas
  saem por CSS `color-mix` com `--tint-target`/`--glow-target`.
- **ESPAÇAMENTO por tokens — UMA régua para o sistema inteiro** (`globals.css`): **`--pad-canvas`** = a margem do conteúdo,
  IGUAL no topo, nas laterais e na base (a mesma distância do cabeçalho, do menu e da borda do display — 16px; 12px no
  celular), usada pelo `<main>` do `AppShell` (`p-[var(--pad-canvas)]`; no celular a base soma a navegação inferior + a
  área segura), pelas laterais do cabeçalho, pela tela inicial pública (largura total) e pela margem dos modais;
  **`--gap-block`** = o espaço ENTRE os componentes (raiz das telas `space-y-[var(--gap-block)]`, grades de cartões/KPIs
  `gap-[var(--gap-block)]`, vão entre os banners da pilha do `Modal`) — 12px; **`--pad-card`** = o respiro interno dos
  cartões/quadros/banners (`ChartCard`, `KpiStat`, `StatCard`, `StatMini`, `LinkCard`, seções dos banners e o corpo/
  cabeçalho/rodapé do `Modal`) — 14px; **`--h-header`** = a altura do cabeçalho (56px) — a faixa da marca na sidebar tem a
  MESMA altura (a borda de baixo continua a do cabeçalho) e os itens do menu alinham com a marca. A **densidade do ADM**
  (Aparência) muda todos juntos (compacta 12/8/12 · confortável 24/16/20). Medidas em JS leem o MESMO token
  (`tokenPx`, `src/components/espacamento.ts`): a altura das tabelas com rolagem interna (`DataTable`: o respiro do
  `<main>` + a altura REAL do rodapé — sem rolar a página) e o lugar da `BarraSelecao` fixa. Nada de `space-y-6`/`p-5`
  soltos para separar blocos — o `--gap-col` antigo foi unificado no `--gap-block`.
- **Tema por atributo `data-theme`** (`light`/`dark`) — next-themes `attribute="data-theme"`;
  `@custom-variant dark ([data-theme="dark"] &)`. Fonte **Geist + Geist Mono** (pacote `geist`,
  `--font-sans`/`--font-mono`). Sem `.dark` de classe, sem Inter.
- **ALTURA PADRÃO dos controles = `--h-control-sm`** (34px; 31/38 nas densidades compacta/confortável do ADM) no desktop e
  **44px no celular e no tablet** (abaixo do `lg`): o trilho do `Segmented`, o `SeletorFiltro`, o `Button size="sm"`, TODOS os
  controles do cabeçalho (PCA, unidade, grupo, notificações, `ThemeToggle`) e a LINHA das tabelas compactas. Numa tela
  estreita (360px) só o seletor de PCA encolhe (o rótulo trunca) — o menu e os ícones mantêm os 44px. Dentro da linha, os controles medem `--h-control-sm` − 6px no desktop (`Button size="xs"`,
  `SeletorCelula`) e 44px no celular.
- **Componentes** (`src/components/`): `Button` (§6.8, primário=`bg-text` neutro; o padrão `md` mede 44px no celular e
  `--h-control` no desktop; SÓ ÍCONE (sem texto) = QUADRADO em qualquer tamanho; **`size="sm"`** = compacto p/ rodapés de
  tabela — `--h-control-sm` no desktop, 44px no celular; **`size="xs"`** = AÇÃO DE LINHA de tabela compacta — cabe na linha no
  desktop, 44px no celular, quadrado quando só ícone), `KpiStat` (§6.4; o número proporcional à LARGURA do próprio cartão — container query, teto de 2.05rem —: cabe inteiro no celular e na grade de 5 com o menu), `Segmented` (o trilho inteiro na altura padrão — anel
  INTERNO em vez de borda; no celular itens de 38px com a área de toque cobrindo o trilho = 44px; item **`soIcone`** = só o
  ícone, o rótulo vira o nome acessível/dica — ex.: o Dashboard da Mesa; **`curto`** = o rótulo abaixo de `sm` quando o
  inteiro não cabe — o nome acessível é sempre o texto À VISTA (quem usa comando de voz diz o que lê) — ex.: as visões do
  Catálogo),
  **`DashboardMesa`** (o Dashboard de governança da Mesa: KPIs + barra de métricas + UM gráfico + desempenho por pessoa) +
  **`DashboardMesaEsqueleto`** (a mesma grade enquanto um Dashboard carrega — arquivo leve, fora do chunk dos gráficos;
  `metricas` = a grade da Mesa, sem ela a de Tarefas) + **`BarraMetricas`** (a barra de métricas abaixo das KPIs: o
  `PeriodoPicker` + `SelectField compacto` Dado e Medida + Ajuda; no celular o período + a ajuda numa linha, Dado | Medida na
  outra; abaixo de 400px, Dado e Medida em linhas próprias) + os gráficos em HTML por token **`BarrasH`** (rótulo | barra | valor; linhas
  clicáveis — o que o toque faz no nome acessível, `acao`, padrão "ver a origem dos dados"; com `ativa`, a linha marcada é um
  FILTRO de alternar), **`Colunas`** (colunas verticais com grade, rótulos — no máximo ~8 no eixo, a margem do eixo cabe o rótulo
  em R$ — e dica no hover/foco/toque; com `onEscolher`, a coluna zerada só mostra a dica) e **`BarraSegmentada`** (barra empilhada/medidor com 2px de respiro) em `charts/Barras.tsx`, `FilterChip`, `Avatar`, `Dropdown` (o painel fica PRESO ao gatilho enquanto aberto — acompanha a cada quadro o gatilho e o próprio tamanho, e o lado acima/abaixo é decidido UMA vez ao abrir: marcar um item, um banner que muda de altura ou uma rolagem nunca o soltam; fecha no `pointerdown` fora — vale no toque do iOS; fechar pelo Esc ou pelo `fechar` do conteúdo (escolher, limpar, ordenar) com o foco dentro do painel o devolve ao gatilho; `className` do invólucro e `id`/`title` do
  gatilho opcionais; `papel` "menu" [padrão] | "dialog" [busca/grade — escolher pessoa ou data: `role="dialog"` com nome,
  `aria-haspopup="dialog"`]; `bloqueado` = o gatilho não abre [`aria-disabled`, sem perder o foco — ex.: gravando]; o
  conteúdo em função recebe `fechar` e `{teclado}` = aberto por Enter/Espaço — quem usa leva o foco para dentro do painel),
  `ColorField` (conta-gotas+swatches; `src/lib/color.ts`), **`PeriodoPicker`** (o seletor de período — gatilho no visual do
  `SelectField compacto` com o prefixo "Período", painel `dialog` com o **`PeriodoCorpo`**: atalhos Todo o período | Hoje | Esta
  semana | Este mês, o ano, os meses, o intervalo DE/ATÉ e **Limpar** (`onLimpar`) — o MESMO corpo do filtro de datas das
  tabelas (`DateFilterHeader`, que soma a ordenação e mostra o filtro que vale — o restaurado de uma edição salva aparece no
  DE/ATÉ); alvos de 44px no toque; aberto pelo teclado, o foco vai à opção marcada
  e volta ao gatilho ao escolher/Esc; a conversão em datas é pura — `intervaloDoPeriodo`, `src/lib/periodo.ts`),
  `MultiSelectHeader`,
  **`Tabs`** (`horizontal` = sublinhado que desliza, faixa com esmaecimento nas bordas | `lateral` = no desktop a lista à esquerda com o fundo que desliza até a ativa; monta SÓ a aba aberta — as visitadas ficam escondidas, guardam o rascunho; o painel ENTRA pelo lado da troca — `animate-aba-direita/esquerda`; `alturaTela` = no desktop no máximo até o fim do display, descontando o respiro dos contornos em volta — a página não rola, o painel rola por dentro e a altura segue o conteúdo; `url` = a aba no parâmetro da URL; `separado` (lateral) = no desktop a lista é um cartão PRÓPRIO com a altura FIXA do display e o conteúdo outro cartão ao lado, com a altura que precisa; teclado ←/→/↑/↓/Home/End com o foco junto; `Tab.dica` = a dica; arrastar o dedo troca, menos em campos/tabelas/faixas que rolam de lado), **`AvisoFlutuante`** (o aviso PADRÃO de feedback transitório — erro de importação, leitura em andamento,
  resultado, falha de ação: PEQUENO no canto inferior do display, sem deformar nada ao redor; portal numa região única
  `#avisos-flutuantes` — `.avisos-flutuantes` em `globals.css`, acima da navegação inferior do celular, da `BarraSelecao`
  fixa via `--reserva-rodape` e do rodapé da tabela da Mesa via `--rodape-tabela`; cor/ícone pelo token de feedback, `carregando` = spinner, `onClose` + `duracao` = fecha
  sozinho) + `Toast`/`Toaster` (renderiza o MESMO `AvisoFlutuante`), `DataTable` (cada linha é `group/linha` — os ícones da
  `CelulaCopiavel` aparecem com o mouse na linha; seleção+filtro no cabeçalho+clique na
  linha; **"selecionar todos" marca TODAS as linhas FILTRADAS, não só a página** (estado indeterminado quando parcial);
  **`Column.travado`** = filtro da coluna TRAVADO por um filtro de hierarquia acima da tabela (cadeado + o motivo no
  `title`); **`Column.filtroExterno`** = filtro multi-seleção CONTROLADO DE FORA (opções/seleção/mudança do host — a coluna
  não filtra as linhas por dentro; marca o tópico e entra no "Limpar filtros" — ex.: a Consolidada filtra os ITENS antes de
  agrupar); **`Column.formatarFaixa`** = formato dos números no filtro de faixa (padrão R$ — quantidades/contagens usam
  `num`, a variação `%`); `pageSize` **máx 20**;
  **filtros CONECTADOS (facetas)** — núcleo puro **`tabela-filtros.ts`** (`aplicarFiltros`: as opções/domínio de cada coluna
  vêm das linhas que passam nos DEMAIS filtros; seleção vazia ou com todas as opções = sem filtro; `normalizarFaixa`: o lado
  da faixa no extremo da faceta NÃO vira limite; `contarNaFaixa` = a contagem do painel; `ordenarIndices` numérico × texto
  natural pt-BR com UM `Intl.Collator` reutilizado (performático com milhares), vazios e o traço "—" no fim; **BUSCA dos
  filtros múltiplos com ":"** — `opcoesDaBusca` (opções: "168:170:174" marca EXATAMENTE esses — o termo igual vence o
  "contém"; o mesmo formato do "Copiar planejamentos") e `predicadoBusca` (buscas de LINHAS: catálogo, orçamento, membros
  do grupo, itens do painel — QUALQUER termo; sem acento/caixa, com cache); no `MultiSelectHeader` a busca segue o
  EXCEL: os resultados começam marcados e "Aplicar"/Enter aplica SÓ os resultados marcados; no `SeletorMultiplo` (`suspenso` = a lista num painel flutuante `Dropdown`; `textoVazio` = o rótulo sem nada marcado), Enter
  marca os encontrados); **`Column.valores`** = coluna MULTI-VALOR (a linha casa se QUALQUER valor casa — ex.:
  Estado); **`filter:"range"` + `Column.numero`** = colunas R$ com o **`RangeFilterHeader`**; coluna filtrada fica
  **MARCADA** (gatilho `GatilhoFiltro` em chip accent + sublinhado; `aria-sort`) e o rodapé mostra **"Limpar filtros (N)"**;
  **`reservaInferior`** = altura reservada no fim do display p/ algo fixo abaixo (a `BarraSelecao` da Mesa);
  **`acoesRodape`** = ações no RODAPÉ da tabela, à esquerda do seletor de linhas/paginação (ex.: "Importar protocolo" da Mesa);
  com `scrollInterno`, no CELULAR o rodapé GRUDA acima da navegação inferior (`overflow-clip` no contêiner, `sticky` +
  `--reserva-rodape` da barra de seleção) e a tabela publica a altura dele em `--rodape-tabela` (os avisos flutuantes sobem
  acima); o corte celular × desktop das medidas em JS é o `lg` do Tailwind (`ehDesktop`, `matchMedia("(min-width: 64rem)")`
  — nunca `innerWidth < 1024`, que diverge do CSS com a fonte do navegador ampliada);
  **`edicoes`** (`EdicoesDaTabela`, opt-in) = EDIÇÃO da tabela no cabeçalho + EDIÇÕES SALVAS (colunas + ordenação + filtros;
  pessoais ou públicas; a padrão abre a tabela) — as tabelas da Mesa;
  **`exportar`** (`{nome}` | `false`; padrão LIGADO, nome "Tabela") = os botões **XLSX** e **PDF** no rodapé
  (**`BotaoExportar`**, `ExportarTabelas.tsx`): as linhas À VISTA (filtros das colunas, na ordem, todas as páginas) e as
  colunas visíveis da edição em uso — no .xlsx o número como número, os vários valores unidos, as datas em dd/mm/aaaa
  (`linhasPlanilhaTabela`) e, no fim, a **linha TOTAL** (`linhaTotal`: a soma de cada coluna numérica — valores e quantidades —, "TOTAL" na 1ª coluna não somada; **`Column.total: false`** deixa em branco o que não se soma — valor unitário, médias, %, identificadores como Seq./Ticket); no **PDF** a MESMA linha TOTAL vai em DESTAQUE (`destaques`) e (`tabelaParaPdf` → `baixarTabelaPdf`, `exportar-pdf.ts` com o pdf-lib só no clique;
  layout PURO e testado em **`exportar-pdf-core.ts`**): A4 deitado, título + "N linhas · filtros: …" no topo de cada página,
  o cabeçalho das colunas repetido, larguras pelo conteúdo (a fonte desce de 8 a 5,5 antes de quebrar), texto QUEBRADO por
  palavra na célula (nada truncado — a linha alta continua na página seguinte), números formatados como na tela
  (`Column.formatarFaixa`, senão R$ nas faixas e número nas demais) e à direita, zebra, **COLORIDO como a tabela** (`PaletaPdf` lida dos tokens do tema claro — no escuro, `PALETA_PADRAO`; cabeçalho no `--accent-soft` com o título em accent, a cor de cada célula pela **`Column.corPdf`** — Estado das tabelas da Mesa/DFDs, faixas do PCA × Orçamento — e os negativos em `--danger`; `corRgb` aceita hex/rgb()/var(--token); `destaques` = linhas em negrito, ex.: o TOTAL do Comparativo), e o rodapé **"Baixado por <nome>
  (matrícula N) em dd/mm/aaaa às hh:mm (horário de Brasília) · Página N de M"** (quem = `useQuemExporta`, o contexto
  `ConfigTabelas` do layout do painel; na tela pública, sem o nome);
  tabela larga demais sai em FAIXAS de colunas com as congeladas repetidas (`faixasDeColunas`); caracteres fora das
  fontes do PDF viram o equivalente (`textoParaPdf`). Some com `false` ou fora da permissão (`PermissaoExportar`). A
  tabela cruzada do Comparativo usa o MESMO `BotaoExportar` no rodapé (a matriz à vista; no PDF, o nome da linha, a sigla e
  o total repetidos em cada faixa);
  **`vazio`** = a mensagem do corpo sem nenhuma linha (com linhas escondidas pelos filtros das colunas, vale a dos filtros);
  rodapé compacto com alvos de 44px no celular (paginação, "Limpar filtros", linhas por página);
  **`activeKey`** = linha ATIVA destacada, mestre-detalhe; `fillHeight` = linhas por página automáticas p/ preencher a altura do display no desktop, sem scroll do navegador;
  **`scrollInterno`** = no desktop a tabela OCUPA o espaço até o fim do display DESDE O PRIMEIRO QUADRO (altura TOTAL fixa,
  coluna flex: o CORPO rola por dentro com o `thead` `sticky`, o rodapé fica rente ao fim com qualquer nº de linhas; sem
  linhas, a mensagem fica no meio do espaço) — medida em `useLayoutEffect` (antes da pintura) com o topo pela cadeia de
  `offsetTop` (`topoNoDocumento`: ignora o `transform` do morph das visões), sem scroll do navegador; no HTML do SERVIDOR
  (F5/1º acesso) a MESMA conta roda num trecho FIXO (`ALTURA_NO_HTML`) que o navegador executa ao ler a tabela — antes da
  1ª pintura —, só na renderização do servidor e na hidratação (`useSyncExternalStore`; depois sai do DOM; as classes da
  coluna são `lg:` desde o servidor); um **seletor de linhas
  por página (30/50/100/200)** no rodapé começa na escolha do ADM (**Configurações → Tabelas**, `aparencia.tabelas.linhas`,
  entregue pelo contexto **`ConfigTabelas`** do layout da área logada — `useLinhasTabela`; sem provedor = 30) e limita as
  linhas em DOM (performático com milhares); no celular rola normal; opt-in, exclui `fillHeight` — usado na **Mesa**;
  **alinhamento das células = CENTRO por padrão** (horizontal + vertical `align-middle`), `align:"right"` **só p/ valores monetários (R$)** e `align:"left"` em exceções — o `Column.align` é `"left"|"center"|"right"`;
  **`density`** (`compact`/`default`/`comfortable`) ajusta a altura da linha SÓ daquela tabela — **`compact`** = a das tabelas
  de protocolos, DFDs e itens: TODA linha na MESMA altura (`--h-control-sm`) e o cabeçalho baixo;
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
  (pilha `modaisAbertos`; um Esc já consumido — ex.: fechou o painel de um filtro, que o trata na CAPTURA — não fecha o
  modal); a trava do scroll da página é UMA contagem compartilhada (trava no 1º modal aberto, solta quando o ÚLTIMO fecha
  — fechar fora de ordem nunca deixa a página travada); `duracaoMotionMs()` = duração do motion p/ sequenciar entradas),
  **`GatilhoFiltro`** (o gatilho de TODO filtro de cabeçalho: rótulo + seta de ordenação, ou chip accent + funil quando
  filtrado), **`RangeFilterHeader`** (filtro de FAIXA p/ colunas R$: Crescente/Decrescente, **"Valor cheio"** [marcar limpa a
  barra; arrastar desmarca], **barra de arrasto DUPLA** mín.–máx. sobre os valores VISÍVEIS (`.faixa-dupla` em `globals.css`,
  alças de 24px p/ toque, teclado ←/→) + campos Mín./Máx.), **`BarraSelecao`** (+ `ResumoSelecao`; registro das seleções em
  chips removíveis + somatório R$ + editor + `acoes` na linha do resumo; `fixa` = rodapé do display, publica
  `--reserva-rodape`) + **`BarraSelecaoDfds`** (a da PLANILHA DE DFDs — chips "DFD nº" + Σ + itens + **`BotaoCopiar`**
  "Copiar planejamentos" + `acoes` da tela — ex.: "Excluir do protocolo" na análise) com os editores **`BarraEdicaoMassa`** (DFDs) /
  **`BarraEdicaoMassaProtocolos`** / **`BarraEdicaoMassaItens`** (`BarraEdicaoMassa.tsx`), **`ComparacaoReenvio`**
  (`DiffLinha` antes × depois — `rotulos` Gravado/Novo ou Antes/Depois, `compacto` = valor curto numa linha e texto longo
  recolhido; `acao`/`escolhido` = a escolha da sobrescrita —, `DiffItem`, `BlocoDiff` (`acoes`), `ComparacaoDfdView`
  (`escolha` = **Manter gravado | Usar novo** por diferença + "todos" por bloco + "Outras alterações"; hook
  **`useSobrescrita`**), `ComparacaoProtocolo` — o reenvio do protocolo; `DiffLinha`/`DiffItem`/`BlocoDiff` também servem o
  `Historico`; `DiffItem.rotulosTipo` renomeia o selo), **`ComparacaoDuplicados`** (DFDs duplicados no protocolo: o
  aberto × cada duplicado campo a campo + "Manter este"/"Abrir"), **`Historico`** (timeline por evento — escopos global/protocolo/dfd/item; `HistoricoDoItem` recolhível;
  hook `useHistorico`), **`SeletorCelula`** (dropdown DENTRO da célula — `<select>` nativo transparente, ponto de cor,
  spinner ao salvar, só texto sem permissão; `atual` = valor fora das opções — ex.: a Situação), **`SeletorPessoa`** (UMA
  pessoa — `Dropdown` + `SeletorBusca`: a lista com a FOTO + o APELIDO, o nome completo embaixo quando difere, o próprio
  usuário primeiro "(eu)", os `extras` no topo com ícone — Todos · Sem responsável —, busca por apelido ou nome, ↑/↓/Enter/Esc
  com o foco de volta ao gatilho (sem rolar a tela), 44px no toque, a busca ganha o foco com ponteiro fino ou quando o painel
  abre pelo teclado — no toque, não abre o teclado sozinha; as opções saem do `opcoesPessoa` puro; gatilhos `filtro` [o
  quadrado só-ícone com a FOTO da escolhida — classes do `classeQuadradoFiltro`], `celula` [`PessoaTag` + seta] e `campo` [o
  campo do formulário]; sem `onChange`, só o visual; `salvando` = spinner no lugar da seta e o gatilho travado (`bloqueado`),
  com o foco nele; `atual` = a pessoa fora do grupo, sem re-escolha; o painel é um `role="dialog"` e PARA o clique — numa
  tabela, tocar nele nunca abre a linha; para VÁRIAS pessoas, o `SeletorPessoas` em chips; usos: filtro Responsável e célula
  da Mesa, edição em massa, Perfil → Responsável padrão),
  **`PessoaTag`** (FOTO + APELIDO de uma pessoa — colunas Responsável/Distribuição; nome completo no `title`),
  **`TabelaSobrescritos`** (o RASTRO cinza dos DFDs sobrescritos por outro protocolo, com o link ao protocolo atual),
  `Segmented` com **`ariaLabel`** (nome acessível do grupo — ex.: "Escolha: Objeto" na sobrescrita), **`SeletorFiltro`** (filtro de
  HIERARQUIA na linha das visões — SÓ O ÍCONE num quadrado na altura padrão, accent quando ativo; quem usa troca o ícone pelo
  que representa a escolha, ex.: a FOTO da pessoa; o valor na dica e no nome acessível; `<select>` nativo por cima),
  **`CelulaPca`**/**`CelulaPrioridade`** (`PlanilhaDfds.tsx` — as células PCA e Prioridade, as MESMAS nas tabelas de protocolos,
  DFDs e itens) + as fábricas de coluna **`colunaPlanejamento`**/**`colunaTipoDfd`** (as MESMAS "Nº Plan."/"Tipo" na planilha de
  DFDs, no rastro, na tabela de itens e no detalhe da Consolidada), **`ItemCabecalho`** (`DfdView.tsx` — o cabeçalho do banner
  de UM item: "Item N" + `DfdCabecalho`; Mesa e consulta pública), **`CelulaLista`** (VÁRIOS valores numa célula — os primeiros + "+N", a lista na dica — até 30,
  `dicaLista` —, valor inativo riscado; a visão Consolidada dos itens) + **`MaisN`** (o chip "+N") + **`CelulaTexto`** (o
  MESMO arquivo — texto longo da célula em UMA linha com a dica; `outros` = variantes com "+N"; com os dados completos, o
  texto inteiro — D1, D2… nas variantes), **`DadosCompletos`**/**`BotaoDadosCompletos`** (`DadosCompletos.tsx` — o provedor
  que faz `CelulaTexto`/`CelulaLista`/`EstadoResumo` mostrarem TUDO na célula e o alternador só-ícone da barra da Mesa),
  **`BotaoAtualizar`** + hook **`useGiro`** (`BotaoAtualizar.tsx` — o Atualizar dos banners gravados: o ícone gira enquanto
  recarrega e revisa),
  **`CelulaVariacao`**/**`SeloAbc`**/**`ComposicaoItem`** (`ComposicaoItem.tsx` — a variação dos preços na cor da faixa
  [`nota` na dica], o selo da curva ABC e o detalhe da linha consolidada: KPIs + avisos + a quebra por unidade + as
  ocorrências com o desvio da média e as colunas do host; "Copiar resumo"), **`ConfigTabelas`** (contexto: as linhas por
  página iniciais do ADM para as tabelas),
  **`BotaoCopiar`** (copia um texto pronto; fallback `execCommand`; "Copiado!") + **`CelulaCopiavel`** (o MESMO arquivo —
  ícone DISCRETO de copiar ao lado do valor da célula, `IconCopy`, em TODA tabela nas colunas **nº do protocolo** [copia SEM
  o ano — `numeroSemAno`, `format.ts`: "144756/2026" → "144756"], **Id do protocolo**, **nº do DFD**, **nº de
  planejamento** [a fábrica `colunaPlanejamento` já traz], **código** e **descrição do item** — Mesa (Protocolos, Itens
  Normal e Consolidada), planilha de DFDs (análise, gravado, rastro), itens do DFD, detalhe da Consolidada, Dashboard/consulta
  do PCA, compilação do PCA, Catálogo (+ prévia) e Classificações; célula com VÁRIOS valores copia unidos por ":" —
  `juntarParaCopiar`, o formato da busca dos filtros —, com o rótulo no plural (`plural`); o texto copiado pode diferir do
  exibido (`copiar`); vazio/"—" = sem ícone. SEMPRE VISÍVEL e discreto (`--faint`), mais forte com o mouse na LINHA
  (`group/linha` do `DataTable`) e em accent sobre o ícone; no TOQUE (`pointer-coarse:`) fica a 12px do valor e com a área de
  toque ampliada (44px de altura; 32px de `lg` para cima, onde a linha é baixa) só para cima/baixo/direita — o navegador
  "puxa" o toque para o controle mais próximo: colado ao valor, tocar no número copiaria em vez de abrir a linha. O clique é
  do botão (não abre a linha); ✓ por 1,5 s + aviso "Copiado: …"), **`SeletorBusca`** (seleção ÚNICA com
  BUSCA — lista rolável rótulo + detalhe [+ `icone` decorativo por opção, ex.: a foto], ↑/↓/Enter, alvos ≥44px, até 200 renderizadas;
  `autoFoco`/`compacto` opcionais; ex.: o protocolo de destino ao vincular/mover um DFD na Mesa, com nº · Id · assunto ·
  interessado · unidade e o "atual" marcado; a lista do `SeletorPessoa`),
  `Segmented` (com `disabled`), **`Switch`** (chave/toggle controlada — `role="switch"`, trilho `--accent`, alvo ≥44px;
  ex.: "Bloqueia importação/protocolação" e "Editável" na aba Avaliação), `formStyles`,
  **`MatrizCapacidades`** (a matriz Telas × Ações de um papel — editável ou só-leitura), **`ResumoPapel`** (o resumo das telas e
  ações), **`DetalhesPapelEditor`** (os DETALHES do papel — as restrições dentro das telas; só leitura sem `onChange`),
  **`ResumoDetalhesPapel`** (as restrições: "N restrições" compacto ou por extenso), **`GruposDaPessoa`** (os grupos de uma pessoa, com as telas de cada um) e **`AcessoDaPessoa`** (o "Ver acesso": o que
  a pessoa abre e faz em cada grupo),
  `Field` (TextField/PasswordField/SearchField/**TextArea**/Checkbox [`indeterminado` = a caixa PARCIAL]/**`CampoLista`** [lista em chips — várias referências da
  renovação]/**`SelectField`** [`<select>` nativo no MESMO visual do campo — ex.: a classificação que a unidade de medida
  indica] — ícone + foco accent), **`AcoesCadastro`** (↑/↓/editar/excluir de uma linha de cadastro ordenável — `size="xs"`),
  **`CelulaClassificacao`**/**`CelulaUnidadeCadastrada`** (`EstadoCelula.tsx` — a classificação automática e a unidade
  cadastrada do item na Mesa → Itens), **`ComparacaoUnidades`**/**`EditorUnidadeMedida`** (`UnidadesMedidaView.tsx`) e
  **`ClassificacaoDosItens`**/**`EditorClassificacao`** (`ClassificacoesView.tsx` — a padronização do Catálogo; os editores
  com `somenteLeitura` = a consulta), **`ErroCarga`** (falha ao CARREGAR dados: a mensagem + "Tentar de novo" — `danger` sem
  nada a mostrar, `warn` com a tela seguindo nos dados anteriores), `Callout` (feedback
  por token), `Pager`, `LinkCard`, `LinkExterno` (ÚNICA âncora externa do app — `target=_blank rel=noopener`;
  ex.: verificar assinatura digital), `StatCard`, `StatMini` (mini banner de cabeçalho — 1 por informação, no head do
  DFD/Protocolo: total de itens/valor total/total de DFDs/somatória; `tone` destaca divergência),
  `RelatorioErros` (banner/`Modal` de texto copiável — hoje o relatório de DIFERENÇAS do reenvio),
  `PcaPicker` (define o **PCA do processo** — `select` dos PCAs cadastrados; adivinha o ano pela descrição e avisa;
  obrigatório), **`PainelPendencias`** (o banner ÚNICO de pendências de Protocolo/DFD/Item — a árvore capa › DFDs › itens,
  tocar leva ao lugar, "Copiar / PDF" com a escolha dos problemas e a prévia; os acertos recolhidos no DFD) +
  **`PreviaDocumento`** (a prévia em HTML dos blocos de um PDF de documento) + **`IndicadorPendencias`** (o botão ÚNICO de erros/atenção
  dos banners — chips vermelho/âmbar; alterna o painel de pendências) + **`BotaoAcao`** (a
  ação dos rodapés/cabeçalhos dos banners: SÓ o ícone, o nome na dica, `contagem` no canto; `texto` = a principal com o
  rótulo a partir de 640px), `ItemDetalhe` (painel lateral com todas as infos de UM item da Seção 4 — abre ao clicar na
  linha; mesmo lugar do painel de mensagens; item REPETIDO: os iguais lado a lado + "Ver item" + "Unificar neste item"), `TipoDfdPicker` (conjunto de tipos de DFD — chips de alternância; no
  catálogo: envio/massa/item), `CatalogoItemDetalhe` (painel lateral do item do catálogo — infos + tipos editáveis),
  **`CalendarioTarefas`**/**`BarraCalendario`**/**`MiniMes`**/**`EventoBanner`**/**`EventosTarefa`**/**`EditorEvento`** (o
  Calendário por eventos — ver Tarefas FASES 5–7), **`JanelaFlutuante`** (janela ancorada ao ponto clicado, arrastável; folha no
  celular — a criação rápida do Calendário), **`AssinaturaCalendario`** (exportar/assinar `.ics`),
  **`OrcamentoCard`**/`OrcamentoNovoCard` (card 4:5 do orçamento — só indicadores, sem imagem), **`AbasEspaco`** (abas de
  um ESPAÇO — PCA e Orçamento: `Segmented` + morph + esqueleto; o servidor monta só a aba `?aba=`) + **`FerramentasAba`** (as
  ferramentas da aba NA MESMA LINHA das abas, à direita), `SearchField compacto`/`SelectField compacto` (altura das barras de ferramentas; o select com o rótulo como prefixo),
  **`TabelaCruzada`** (tabela horizontal linhas × colunas com totais — ordenação no cabeçalho, colunas congeladas, %, mapa
  de calor e origem de cada número; TODAS as colunas iguais — com `edicao`, a própria planilha vira o editor: arrastar o
  nome com a coluna presa ao cursor e a SOMBRA do destino, alfinete, olho e largura pela borda; o Comparativo do orçamento),
  **`Ajuda`**/`TopicoAjuda` (o "(?)" — botão discreto que abre a explicação de uma tela num painel; tira o texto de
  instrução da tela), **`SeletorEdicoes`**/**`SalvarEdicao`** + hook `useEdicoesTabela` (`EdicoesTabela.tsx` — as EDIÇÕES
  SALVAS de uma tabela: pessoais ou públicas — quantas quiserem; todos veem e usam as públicas, até como a sua padrão; só o dono ou o ADM altera —, a padrão do usuário), **`useConfirmacao`** (`Confirmacao.tsx` — `cancelar` = o rótulo do "não"; a
  CONFIRMAÇÃO do sistema num `AvisoFlutuante` com Cancelar/Confirmar, no lugar do `confirm()` do navegador; o
  `AvisoFlutuante` ganhou `acoes`),
  **`PlanilhaDfds`** (planilha de DFDs; `unica` = tabela única do gravado; `LinhaDfd.processando` = spinner + o que está
  acontecendo), **`EstadoCelula`** (`EstadoResumo`/`EstadoPonto`/`EstadoProcessando` — a célula "Estado" de TODA tabela),
  **`BarraEdicaoMassa`** (edição em massa — análise/protocolo gravado/Mesa; `versao` = o campo "Gravado × novo" da
  sobrescrita, na análise do protocolo), **`DfdRodape`** (rodapé fixo do banner do
  DFD em UMA linha: indicador + ações só ícone + principal), **`DfdPainelDireito`** (painel da direita do DFD: mensagens /
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
  `theme.ts` `aparenciaToCss` **anti-XSS por allowlist**). Migração `0008`. O **"Restaurar padrão"** (`DELETE
  /api/admin/aparencia`) zera SÓ as chaves VISUAIS (`CHAVES_VISUAIS`/`semChavesVisuais`) — a identidade, as tabelas e os
  blocos irmãos do MESMO registro (`avaliacao`, `integracoes`) ficam (antes o registro inteiro virava "{}").
- **Configurações do ADM (tela única):** `/painel/configuracoes` (`ConfiguracoesAdmin`, admin — `Tabs layout="lateral" separado alturaTela url="aba"`: abas com ícone e dica num cartão FIXO à esquerda (sempre a mesma altura), o conteúdo num cartão separado, cabe no display sem rolar a página, `?aba=` reabre na aba; as explicações no "(?)" — `Ajuda`; excluir PCA pela confirmação do sistema) reúne o **novo**
  + atalhos. Abas: **Identidade** (nome/subtítulo/favicon → mesmo slot `identidade` do `aparenciaSchema`, salvo via
  `PATCH /api/admin/aparencia`; favicon rasterizado p/ PNG ≤64px no cliente), **Papéis** (`PapeisAdmin` — ver "PAPÉIS"),
  **Tabelas** (as LINHAS POR PÁGINA com que as
  tabelas da Mesa abrem — 30/50/100/200; slot `tabelas` do mesmo `aparenciaSchema`, `linhasTabela`), **PCAs** (cadastrar/editar/ativar/excluir
  via `/api/admin/pcas`), **Avaliação** (`AvaliacaoAdmin` — níveis por ponto de Protocolo/DFD/Item + exceções por tipo
  de DFD e categoria de protocolo; ver "Avaliação configurável"), **Situações** (`SituacoesAdmin` — as situações do
  protocolo: nome + cor + ordem; ver "Gestão do protocolo"), **Feriados** (`FeriadosAdmin` — os estaduais/municipais/pontos
  facultativos do Calendário; os nacionais são calculados — ver Tarefas FASE 6) e **Mais** (`LinkCard` →
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
  query/parse puros em `cloudflare-core.ts` (`queryMetricas` = SÓ o Worker `NOME_WORKER`="newpca" — `scriptName` —, o
  escalar MINÚSCULO `string!` [o GraphQL da Cloudflare recusa `String!` — era a falha do painel] e o alias `periodo` sem
  dimensão = CPU p50/p99 EXATOS do período; `motivoErroCloudflare` = o erro em pt-BR com o que fazer); cache 60 s só do
  sucesso. As métricas são EXIBIDAS no **Armazenamento** (`MonitoramentoWorker`: requisições de hoje × o teto de 100 mil/dia
  do plano gratuito, 7 dias, erros, CPU e o gráfico `MetricasChart` com a origem) — o `GET /api/admin/armazenamento` as
  traz quando o monitoramento está ligado (`?fresco=1` no "Recarregar"); o cartão em Integrações só liga/desliga, testa e
  leva ao Armazenamento (a rota `/api/admin/integracoes/metricas` saiu). O **login com Google**
  e o Resend (e-mail) têm cartões próprios (abaixo). Setup no `docs/INTEGRACOES.md`. Só componentes do DS (catalogado).
- **TRELLO — sincronização nos DOIS sentidos pela CONTA INSTITUCIONAL (migração `0062`; plano em 5 fases: base ·
  vincular · saída · entrada · robustez).** **FASE 1 (entregue) — base:** tabelas `trello_quadros` (o quadro ligado ao
  board + webhook + campos personalizados criados + estado), `trello_vinculos` (cada item ligado + o RETRATO da última
  sincronização; únicos por (tipo, local) e (tipo, id do Trello)), `trello_membros` (pessoa ↔ membro) e `trello_fila`
  (saída/entrada; UM item por alvo). Configuração no blob `integracoes.trello` (`TrelloConfig`: chave pública + `token` e
  `segredo` CIFRADOS e write-only + a conta confirmada `membroId`/`usuario`/`nome`, que o "Testar conexão" grava — trocar a
  chave/token a esquece; `trelloConfigurado`, `TRELLO_VAZIO`). Cliente **`trello-api.ts`** (puro, `fetch` injetável): host
  FIXO `api.trello.com/1`, caminho validado (sem SSRF), `Authorization: OAuth` (nunca na URL), 10 s, `ErroTrello` com
  `status`/`esperarS`/`transitorio` (429/5xx/rede); `eu`, `membro`, `membrosDasAreas`. **`trello-config.ts`**
  (`trelloDaConfig`: o cliente com o token decifrado). Núcleo **`trello-sync-core.ts`** (`sugerirMembros` — a régua
  `casarMembro` da importação, só quando casa UMA pessoa); D1 em **`trello-sync.ts`** (`listarLigacoesMembros`,
  `gravarLigacoesMembros` — um membro em UMA pessoa, no mesmo lote). Rotas: `PATCH /api/admin/integracoes` (`trello`),
  `POST …/testar` `{alvo:"trello"}` e `GET`/`PUT /api/admin/integracoes/trello/membros` (ADM; auditoria
  `trello_integracao`). Origem de auditoria `trello`. Tela: cartão **Trello** em Integrações = **`IntegracaoTrello`**
  (controlado; o Salvar é o da tela) + **`MembrosTrello`** (pessoas ↔ membros das áreas de trabalho da conta, escolher
  grava na hora, "Aceitar N sugestões", ligar pelo usuário do Trello); ícone **`IconTrello`**.
  **FASE 2 (entregue) — criar o board ADAPTADO:** núcleo `trello-sync-core.ts` (testado): cores (a `PALETA_ETIQUETAS` É a
  do Trello — `corTrelloDeHex`/`hexDeCorTrello` exatos, cor livre = a mais próxima; `corCapaTrello`; `fundoTrello` = o fundo
  de cor do board mais próximo), datas (`dataParaTrello`/`dataDoTrello`: Brasília ↔ UTC; "dia inteiro" = 12:00 BRT —
  `HORA_DIA_INTEIRO`), notas na descrição (`descricaoComNotas`/`separarNotas`, separador fixo "Notas (PCA)"), os
  **`ValoresCartao`** comparáveis (ids do Trello; `valoresDaTarefa`/`valoresDoCartao` — o MESMO formato dos dois lados e do
  RETRATO), `diferencas`, **`reconciliar`** (só de um lado → vai ao outro; nos dois → vence o mais recente e o outro vira
  `descartados`), `CamposBoard`/`lerCamposBoard` (Prioridade = campo LISTA Baixa/Média/Alta/Urgente, Estimativa (h) =
  número, Ticket = texto, os campos do quadro no MESMO tipo — `TIPO_CAMPO_TRELLO`), `corpoValorCampo`, `lerRetratoCartao`.
  **`trello-vincular.ts`**: `criarBoard` (board PRIVADO da conta institucional, sem listas/etiquetas padrão) e
  **`avancarCriacao`** — ETAPAS RETOMÁVEIS de no máximo `ORCAMENTO`=25 chamadas: listas (arquivadas nascem fechadas) →
  etiquetas → campos personalizados → membros ligados do quadro (privado = só o dono; `campos.membrosBoard`) → cartões →
  detalhes (valores, capa, campos, anexos dos blocos Link e dos vínculos — tarefa = o link do outro cartão, os demais = o
  link do sistema) → checklists e itens (feito, prazo, responsável) → comentários ("**Nome (PCA):** texto"); cada item
  criado vira um `trello_vinculos` (o que tem vínculo não é refeito — parar no meio nunca duplica) e o cartão guarda o
  RETRATO; sem nada faltando, `estado` = `ativo`. `desligarQuadro`, `estadoTrello`. Rota **`GET`/`POST
  /api/tarefas/quadros/[id]/trello`** (`{acao: criar|etapa|desligar}` — editor; quadro privado só o dono; auditoria
  origem `trello`). Tela: Configuração → seção **"Trello"** = **`SincronizacaoTrello`** (contêiner: estado — `seloTrello`
  —, "Criar no Trello" com o `Progress` por tipo, "Continuar", "Abrir no Trello", "Desligar" com confirmação, aviso do
  quadro privado e a lista do que NÃO sincroniza — `NAO_SINCRONIZA`).
  **FASES 3–4 (entregues) — SAÍDA e ENTRADA contínuas, pela MESMA régua (sincronização por ESTADO):** gancho ÚNICO no
  `registrarAuditoria` (`auditoria.ts` → `marcarSaidaTrello`, `trello-fila.ts`): a auditoria de `tarefa`/`tarefa_lista`/
  `tarefa_etiqueta`/`tarefa_quadro`/`tarefa_campo` de um quadro LIGADO (pelo vínculo — vale depois de excluído — ou pela
  tabela; `quadroLigadoDe`) com origem ≠ `trello` entra na **`trello_fila`** e o processador roda DEPOIS da resposta
  (`depoisDaResposta` = `ctx.waitUntil`) — nenhuma das 30 rotas mudou. Builders em **`trello-sql.ts`** (testados no D1
  real): `comandoEnfileirar` (UM item por alvo; renovar muda o `criado_em` em ms), `comandoReivindicar` (UPDATE … WHERE id
  = (subconsulta) RETURNING — dois processamentos nunca pegam o mesmo item; adia 2 min), `comandoConcluir` (só apaga se nada
  novo chegou no meio), `comandoVinculo`. **`trello-processar.ts`** (`processarFila(limite, quadro?)`, orçamento de 30
  chamadas por passada — `contado`): falha = espera crescente (429: a do Trello), depois de 6 fica com o erro à vista;
  quadro `vinculando`/`pausado` = adia. **Cartão ⇄ tarefa** (`sincronizarCartao`): criada aqui → cria o cartão (lista sem
  vínculo → a lista primeiro); criada lá → cria a tarefa (`criarTarefaDoCartao`, "Criada pelo Trello"); excluída aqui →
  exclui o cartão; excluída/levada a outro board LÁ → ARQUIVA aqui (nada daqui é apagado por uma exclusão de lá); movida
  para outro quadro aqui → sai deste board; com os dois → **`reconciliar`** (retrato × daqui × de lá; `empurrar` = PUT dos
  campos + capa + os campos personalizados que mudaram; `trazer` = `patchDoCartao` → `atualizarTarefa` + notas nos blocos +
  template + `moverTarefa` ao fim da lista nova) e o histórico: "Atualizada pelo Trello: …" e cada CONFLITO ("ficou a
  alteração mais recente …; a outra foi descartada", com o antes/depois) — tudo com origem `trello`. **Conteúdo**
  (`sincronizarConteudo`): checklists (nome pelo retrato), ITENS (`ValoresItem`: texto, feito, prazo, responsável — o lado
  que mudou vai ao outro; criar/excluir dos dois lados), COMENTÁRIOS (os daqui vão como "**Nome (PCA):**"; os de lá vêm com
  o nome "(Trello)" e o autor pela ligação — edição/exclusão de comentário não sincroniza) e ANEXOS de URL × blocos Link
  (novo lá = bloco Link aqui; saiu lá = sai o bloco; vínculos viram anexos). Listas (nome, arquivada; excluída aqui =
  ARQUIVADA lá — o Trello não exclui listas; nova lá = lista nova aqui), etiquetas (nome e cor pela paleta; excluída de um
  lado = do outro) e o board (nome/descrição do quadro). **ENTRADA:** `HEAD`/`POST /api/integracoes/trello/webhook/[token]`
  (sem sessão): o token do caminho acha o quadro (o banco guarda só o HASH — `hashToken`), a assinatura `X-Trello-Webhook`
  (`assinaturaWebhookValida`: HMAC-SHA1 do corpo + URL com o segredo da aplicação, comparação em tempo constante) prova a
  origem, `alvoDoAviso` diz o que sincronizar (as ações da CONTA INSTITUCIONAL = eco, ignoradas) → fila de entrada.
  `garantirWebhook` (`trello-vincular.ts`) cria o aviso ao terminar de ligar e no "Sincronizar agora" (sem o segredo, só a
  saída funciona — a tela avisa). A rota do quadro ganhou `sincronizar` (reativa os com erro e processa já), `pausar` e
  `retomar`; a seção Trello, os botões.
  **LIGAR A UM BOARD EXISTENTE (fusão):** `GET /api/integracoes/trello/boards` (`boardsDaConta` — os abertos da conta, os
  já ligados marcados) + `POST …/trello {acao:"ligar", boardId}` → **`ligarBoard`** (recusa board fechado ou já ligado;
  `campos.fundir`) e, na 1ª etapa, **`fundirBoard`** (5 leituras): casa LISTAS e ETIQUETAS pelo nome, os CAMPOS pelo nome +
  tipo (`campoDoBoard` — os nossos três e os do quadro) e os CARTÕES pelo título DENTRO da lista casada (**`casarPorNome`**,
  puro: sem acento/caixa, um a um, por grupo); cada par ganha o vínculo com o RETRATO do lado MAIS ANTIGO
  (**`retratoDaFusao`** — a reconciliação leva o mais recente ao outro) e entra na fila; o que só existe lá entra na fila de
  ENTRADA (vira item daqui quando a ligação termina); o que só existe aqui as etapas criam lá. Checklists/itens/comentários
  só vão na criação para os cartões CRIADOS (`RetratoCartao.nova`); nos casados, `sincronizarConteudo` casa pelo texto
  (`mesmoTexto`) o checklist, o item (marcado de um lado = marcado nos dois) e o comentário sem vínculo antes de criar.
  Terminada a ligação, a rota já processa a fila (`depoisDaResposta`). Tela: "Ligar a um quadro existente" (`Modal` +
  `SeletorBusca` dos boards livres).
  **FASE 5 (entregue) — robustez:** **`worker.ts`** na raiz = o Worker do OpenNext (`.open-next/worker.js`, reexporta o
  `fetch`) + o **`scheduled`** (`wrangler.jsonc`: `main: "worker.ts"`, `triggers.crons ["*/5 * * * *"]`; `worker.ts` fora do
  `tsconfig`), que chama DIRETO no handler a rota interna **`POST /api/integracoes/trello/cron`** (cabeçalho `x-cron-trello` =
  SHA-256 de `INTEGRACOES_CHAVE:cron`, comparação em tempo constante; 401 sem ele) → **`reconciliarQuadros(10)`** (por
  quadro ligado ativo, UMA leitura dos cartões do board — só `dateLastActivity` — × os vínculos: cartão novo/alterado depois
  da última sincronização (1 s de folga), cartão que sumiu, tarefa criada/alterada/excluída aqui e campo sem par entram na
  fila; liga o webhook que falta) + `processarFila(25)`. **Volume (quadro ligado com centenas de cartões):** o cartão é lido
  em UM GET já com checklists, anexos e os últimos comentários (`PARAMS_CARTAO`; `sincronizarConteudo` usa o que veio);
  com mais de `MIN_LOTE`=5 cartões na fila, a passada lê o board INTEIRO uma vez (`loteDoBoard`: `/boards/{id}/cards/all` +
  os comentários do board agrupados por `comentariosPorCartao` — acima de `LIMITE_ACOES_BOARD`, cada cartão lê os seus) e
  cada cartão custa só o D1; a fila trata board › listas › etiquetas › campos › cartões (`PRIORIDADE_FILA` → CASE no
  `comandoReivindicar`); o "Sincronizar agora" processa DENTRO da requisição (lotes de 25; `continuar` não reativa os com
  erro) e a tela repete até zerar com o `Progress`; logo depois de ligar, roda sozinho. **Campos recusados** (`semCampos`):
  "Tentar de novo" (`acao:"campos"` → `tentarCamposDeNovo`: esquece a recusa, roda a etapa dos campos e, dando certo, põe
  todos os cartões ligados na fila de saída). **Uma coisa por vez por quadro (migração `0064`,
  `trello_quadros.processando_ate`):** `comandoTravarQuadro`/`comandoRenovarTrava`/`comandoSoltarQuadro` (`trello-sql.ts`,
  validade `TRAVA_S`=90 s) — `processarFila` só trata o item com a trava do quadro (outra passada nele ⇒ o item é ADIADO,
  `adiados`) e a rota usa `comTravaDoQuadro` em criar/ligar/etapa/campos (espera ~10 s; senão 409); o "Sincronizar agora"
  espera e tenta de novo quando o lote volta todo adiado. **Vínculo tolerante:** `comandosVinculo` = INSERT que não faz
  nada em conflito + UPDATE do próprio vínculo só com o id do Trello livre (nunca o "UNIQUE constraint failed … trello_id");
  `gravarVinculo` devolve se ligou e o item criado AQUI a partir do Trello (tarefa, checklist, item, comentário, lista,
  etiqueta) é excluído quando o id de lá já estava ligado a outro; `criarTarefaDoCartao` grava o vínculo LOGO após criar a
  tarefa (retrato = como nasceu aqui — nova tentativa nunca cria outra tarefa para o mesmo cartão). Fila `campo` = **`sincronizarCampo`** (novo = cria no mesmo tipo;
  renomeado; tipo trocado = recria; opção nova na lista = acrescenta; excluído = exclui lá). **`IndicadorTrello`** (ícone +
  ponto do estado na `FaixaQuadro` do quadro ligado — `carregarQuadro` traz `trello` = `estadoTrello`; tocar leva a
  Configuração → `#secao-trello`) e **"Abrir no Trello"** no "…" do detalhe da tarefa (`GET /api/tarefas/[id]` devolve
  `trelloUrl` — `urlDoCartao`, só `https://trello.com/`).
- **E-MAIL pelo RESEND (migração `0065`):** cartão **"E-mail (Resend)"** em Integrações (`IntegracaoResend`, catalogado; o
  catálogo `resend` virou `ativo`) — no blob `integracoes.resend` (`ResendConfig`: `apiKey` CIFRADA e write-only, `remetente`
  "Nome <avisos@dominio>", `urlSistema` p/ os links — o cron não tem requisição —, `dominio`/`verificado` gravados pelo teste;
  trocar a chave ou o DOMÍNIO do remetente esquece a verificação; `resendConfigurado`, `emailDoRemetente`/
  `dominioDoRemetente`). Cliente PURO **`resend-api.ts`** (host fixo `api.resend.com`, `Authorization: Bearer`, 10 s,
  `redirect:"manual"`, `ErroResend` com `transitorio`/`esperarS`; `dominios`, `enviar`, `enviarLote` ≤ 100) +
  **`resend-config.ts`** (`resendDaConfig`, leitura FRESCA). `POST …/testar {alvo:"resend"}`: confere o domínio do remetente
  (`verified`; a chave "só envio" dá 401 na lista → segue) e manda um e-mail de TESTE a quem testou; enviado = verificado.
  Núcleo PURO **`email-core.ts`** (modelos com o texto ESCAPADO e link ABSOLUTO — `urlAbsoluta` só aceita caminho interno;
  `emailDaNotificacao`/`emailAcessoLiberado`/`emailCodigo`/`emailTeste`; as preferências moram em
  `notificacoes-config-core.ts` — ver "NOTIFICAÇÕES"). Envio em **`email.ts`** (BEST-EFFORT, nunca lança):
  `enviarEmailsPendentes` = as notificações do sino com `email_enviado_em` NULL, < 3 tentativas, das últimas 48 h e com a
  reserva LIVRE (`email-sql.ts`, testado no D1 real) → RESERVA com validade (`email_reservado_em`, compare-and-set: duas
  passadas nunca repetem) → envia em LOTE o que o ADM manda por e-mail às pessoas ATIVAS que não desligaram (as demais ficam
  tratadas sem envio) → **só o envio CONFIRMADO marca `email_enviado_em`** (`comandoConfirmarEmails`); falha devolve a
  pendente com +1 tentativa; a reserva não confirmada (o Worker caiu) VENCE em 10 min e volta à fila — nada se perde. O
  aviso de quadro PRIVADO de outra pessoa não sai. Gatilhos: `notificar` (depois da resposta — `depoisDaResposta` em
  **`segundo-plano.ts`**; só quando algum aviso tem e-mail) e o **cron** `POST /api/integracoes/email/cron` (gatilho PRÓPRIO
  `2-59/5` — ver NOTIFICAÇÕES). O acesso liberado (`PATCH /api/admin/usuarios/[id]`) só sai com o aviso `acesso` ligado pelo
  ADM. A `0065` marca o histórico como tratado (nada de enviar o passado). Setup/DNS em `docs/INTEGRACOES.md` (recebimento
  DESLIGADO — o MX da raiz é o e-mail do domínio). Testes: `tests/resend-email.test.ts`.
- **NOTIFICAÇÕES — controle central, e-mail mínimo, limpeza no banco e TEMPO REAL (migração `0083`, aditiva:
  `notificacoes.email_reservado_em`, índices por tarefa/quadro/(pessoa, id) e o parcial dos pendentes, tabela
  `notificacoes_dispensadas`; a migração encerra os e-mails pendentes velhos/desistidos):**
  - **Catálogo + Configurações → Notificações (ADM):** núcleo PURO **`notificacoes-config-core.ts`** — `CATALOGO_AVISOS`
    (cada aviso: rótulo, descrição, grupo Tarefas · Calendário · Mesa e PCA · Administração e o padrão), por aviso os canais
    **Sino** (o aviso existe), **E-mail** e **Pode desligar** (a pessoa desliga o e-mail no Perfil). Padrão = **e-mail
    MÍNIMO**: só atribuída, atrasada, convite, protocolo designado, cadastro pendente (não desligável) e acesso liberado (só
    e-mail, não desligável); o resto só no sino. `resolverNotificacoes` (qualquer JSON → a config resolvida),
    `compactarNotificacoes` (só o que difere do padrão — blob `configuracoes`, chave `notificacoes`, sem migração), `noSino`,
    `querEmail(cfg, prefs, chave)`, `emailsDaPessoa`, `lerPrefsEmail` (`{ligado, desligados, destino}` — o formato antigo
    `tipos` vira desligados). D1 em `notificacoes-config.ts` (cache 60 s, fail-safe = padrões); rota `GET/PATCH/DELETE
    /api/admin/notificacoes` (`exigirAdmin`, `configNotificacoesSchema`, auditoria com o diff). Tela **`NotificacoesAdmin`**
    (aba "Notificações": por grupo, as três chaves por aviso — desligar o sino trava o resto —, Salvar/Padrão, Ajuda).
    **Perfil → Avisos por e-mail** lista só o que o ADM manda por e-mail (os obrigatórios travados) e grava os desligados.
  - **Gravação (`notificacoes.ts`):** `notificar` → `gravarAvisos`: o tipo desligado no sino não é gravado, o sem e-mail
    já nasce tratado (`NovaNotificacao.semEmail` → `email_enviado_em`), o INSERT devolve quem recebeu de fato (`returning`;
    a chave repetida não volta) e só essas pessoas recebem o aviso AO VIVO. A massa de tarefas e as automações juntam os
    avisos de TODAS as tarefas num `notificar` só (`avisosSobreTarefa`, `seguidoresDasTarefas` — 2 consultas para todas,
    no lugar de um `getTarefa` por tarefa) e a massa só avisa quem PASSOU a ser responsável/da equipe (`jaResponsavelEm`/
    `jaComEquipe`). Os DERIVADOS (prazo — agora também **"vence hoje"** —, lembrete, versão da extensão) saem de UMA
    derivação por pessoa a cada 5 min (`INTERVALO_DERIVAR`, por isolate; o cron força), sem os DISPENSADOS, com `ORDER BY`
    nos tetos de 200; o lembrete de evento de tarefa CONCLUÍDA não dispara. A contagem é 1 `COUNT` (falha = `null`: a tela
    mantém o último número).
  - **Acesso:** a lista e a contagem só trazem o aviso de quadro VISÍVEL (privado = só o dono) dos grupos em que a pessoa
    abre Tarefas/Calendário (`acessivel`); mover a tarefa de quadro leva os avisos junto (`comandosMoverQuadro` atualiza o
    `quadro_id`). **Link canônico** `/painel/tarefas/abrir/<id>` (`linkTarefa(id)`): acha o quadro ATUAL da tarefa (a
    movida continua abrindo; a excluída diz que não existe) — também no "Copiar link"; o `QuadroTarefas` abre o `?tarefa=`
    a cada chegada NOVA (o aviso de outra tarefa do MESMO quadro abre).
  - **Limpar de verdade:** `DELETE /api/notificacoes` (`{ids}` | `{limpar:"lidas"|"todas"}`, só as da pessoa) →
    `comandosExcluirNotificacoes` (`notificacoes-sql.ts`, testado no D1 real): apaga do banco e DISPENSA no mesmo lote os
    derivados (a chave não volta por `DIAS_DISPENSA`=40). **Retenção** no cron (`comandosRetencaoNotificacoes`): lidas > 30
    dias, não lidas > 90, o **teto de 200 por pessoa** (as lidas mais antigas saem antes) e as dispensas vencidas; a fila do
    e-mail sem o que desistiu ou ficou velho (`comandoEncerrarEmailsVelhos`). A lista é PAGINADA (`?antes=<id>&filtro=
    nao-lidas|todas&limite=20` → `{itens, naoLidas, mais}`) e a tela guarda até `MAX_AVISOS_NA_TELA`=100.
  - **TEMPO REAL:** Durable Object **`CaixaNotificacoes`** (`src/lib/caixa-notificacoes-do.ts`, um por pessoa —
    `idFromName("u<id>")`, WebSocket com HIBERNAÇÃO + auto-resposta do "ping"; até 10 abas; binding `CAIXA_NOTIFICACOES` +
    `migrations new_sqlite_classes` no `wrangler.jsonc`, exportado pelo `worker.ts`). O `worker.ts` atende
    `/api/notificacoes/ao-vivo` ANTES do Next: só do próprio site (`origemDoProprioSite`), com a sessão de uma pessoa ATIVA
    (cookie `pca_session` → SHA-256 → `sessoes`, no binding D1 cru) → a caixa dela. `avisarAoVivo(ids)`
    (`notificacoes-ao-vivo.ts`, depois da resposta, até `MAX_AO_VIVO`=25 por requisição) pinga as caixas a cada aviso
    gravado, lido ou limpo — as outras abas e aparelhos acompanham. Núcleo puro `ao-vivo-core.ts` (`lerCookie`,
    `esperaReconexao` 2 s → 60 s). Sem o canal (dev, falha), a tela confere a cada 60 s com a aba à vista.
  - **Crons separados:** `triggers.crons` = `*/5` (Trello) e `2-59/5` (e-mails/avisos), cada um uma invocação com o próprio
    limite de consultas (`worker.ts` → `ROTAS_CRON` por `evento.cron`). O dos e-mails roda a retenção sempre e, com o
    Resend ativo, deriva os avisos de 4 pessoas por passada (`PESSOAS_POR_PASSADA`, ~7 consultas cada — abaixo das 50).
  - **SINO moderno (`SinoNotificacoes`):** desktop = painel preso ao sino (`Dropdown papel="dialog"`, 400px); celular =
    folha (`Modal`). Abas **Todas | Não lidas (N)**, filtro por tipo (`ChipsEscolha`), avisos **agrupados por dia** (Hoje ·
    Ontem · Esta semana · Antes — o dia de Brasília) com os **repetidos juntos** ("+N", expande), **hora relativa** ("há 5
    min", a completa na dica — núcleo puro `notificacoes-tela-core.ts`), ações no hover/foco (sempre à vista no toque):
    **marcar lida/não lida** e **excluir**; rodapé **Marcar todas como lidas · Limpar lidas · Limpar tudo** (confirma; a tela
    tira na hora e o banco só é limpo depois do **Desfazer** de 6 s — ou ao sair da página, `keepalive`) e **Configurar**
    (Perfil; o ADM, Configurações → Notificações). Rolagem infinita; ↑/↓ entre os avisos, Delete exclui; o aviso ao vivo
    MESCLA a 1ª página (`mesclarPrimeiraPagina` — as páginas carregadas ficam, o que está sendo limpo não volta). **Aviso
    novo:** o sino balança (`animate-sino-tocar`), o selo dá um "pop" (`animate-selo-pop`), a **prévia flutuante** com
    "Abrir" (6 s), o **título da aba** com "(N)" (`tituloComContagem`) e `aria-live`. Saída animada (`.aviso-linha` — a
    altura recolhe); tudo respeita "reduzir movimento". Ícones novos `IconLidas`/`IconSemAvisos`/
    `IconEventoAlterado`/`IconCadastro`.
  - **Avisos novos (tipos `vence_hoje`, `evento`, `protocolo`, `pca`, `cadastro`):** **Mesa** — o responsável designado a um
    protocolo (célula/banner e massa — na massa UM aviso por pessoa com a contagem; `avisos-mesa.ts`
    `avisarResponsavelProtocolo`, link `linkProtocolo` = a Mesa em que o protocolo está); **PCA** — enviado, incorporado ou
    devolvido, ao responsável (`avisarPcaProtocolos`); **Administração** — o cadastro pendente vai ao SINO dos ADMs (e ao
    e-mail pela fila — `idsDosAdmins`); **Calendário** — evento com data/hora/local/link alterado ou CANCELADO, aos
    convidados que não recusaram (`avisarEventoAlterado`); **Tarefas** — "vence hoje".
  - **PACOTE 2 (migração `0084`, aditiva — `notificacoes.lida_em`, `email_ok`, `adiada_ate`, `email_apos` + índice
    `criado_em`):**
    - **Limpeza CONFIGURÁVEL (ADM):** `Retencao {auto, lidasDias, naoLidasDias, teto}` (`lerRetencao`, limites
      `LIMITES_RETENCAO`; blob `notificacoesRetencao` — `getRetencao`/`gravarRetencao`); o cron só limpa com `auto` ligado;
      "Limpar agora" (`POST /api/admin/notificacoes/limpar`, roda mesmo com o automático desligado; devolve quantos saíram).
    - **Preferências da PESSOA** (`notificacoes-config-core.ts`): e-mail `{ligado, desligados, destino, modo
      imediato|resumo, horaResumo, silencio}` (`lerPrefsEmail`) — **`emailAposPara`** dá o instante em que o e-mail pode sair
      (resumo = o próximo horário de Brasília, `proximoHorario`; silêncio que vira a noite = o fim, `noSilencio`; o
      obrigatório não espera) e `gravarAvisos` o grava em `email_apos` (a fila o respeita); o sino `PrefsPessoa`
      `{sinoDesligados, tarefas, quadros, som, sistema}` (chave `notificacoes:pessoa`, `lerPrefsPessoa`) — **`silenciado`**:
      o tipo desligado, a TAREFA e o QUADRO silenciados não chegam; os **`AVISOS_DIRETOS`** (atribuída, menção, convite,
      protocolo, cadastro, comunicado) sempre chegam. `preferenciasDe(ids)` (`notificacoes.ts`, UMA consulta para todos os
      destinatários). Rota `GET/PUT /api/notificacoes/preferencias` (pessoal; o GET traz os nomes do que está silenciado).
    - **ADIAR** ("lembrar em 1 h · 3 h · amanhã 8 h"): `PATCH /api/notificacoes {ids, adiarAte}` (até 30 dias; as variantes do
      PATCH são `strictObject`) → `adiada_ate` (some do sino e da contagem até lá; volta não lida) + o **alarme** da caixa
      (`agendarAoVivo` → `POST /alarme` do `CaixaNotificacoes`, `storage.setAlarm` — o aviso volta AO VIVO na hora).
    - **E-mail:** **RESUMO** — por pessoa, no modo resumo (ou com 3+ avisos juntos, o silêncio que acabou) UM e-mail com a
      lista (`emailResumo`); **descadastro** em todo e-mail — link assinado (`descadastro-core.ts`: HMAC-SHA256 com a chave
      mestra, `assinarDescadastro`/`descadastroValido` em tempo constante) + `List-Unsubscribe`/`List-Unsubscribe-Post`
      (RFC 8058); rota PÚBLICA `GET/POST /api/notificacoes/descadastro` (o GET mostra a página com "Confirmar" — leitor de
      links não descadastra; o POST desliga o tipo, ou todos os desligáveis com `t=todos`; o obrigatório recusa).
      `email_ok` = saiu de fato (o pulado não conta) — o relatório de alcance.
    - **Avisos novos:** `concluida` (tarefa concluída → quem acompanha, em `aposMovimento`), `situacao` (situação alterada
      — banner/célula e massa — e protocolo REENVIADO → o responsável; `avisarProtocoloAtualizado`), `centi` (o lote da
      Automação terminou/falhou/cancelado → quem iniciou, no `PATCH` da execução), `comunicado` (o ADM: `POST
      /api/admin/notificacoes/comunicado` — todas as pessoas ativas ou as dos grupos; link só interno).
    - **Alcance (ADM):** `GET /api/admin/notificacoes/alcance?dias=` — por tipo: avisos, pessoas, % lidos, tempo médio até ler
      (`lida_em`), e-mails que saíram, na fila + se o tempo real está ativo.
    - **Telas (compactas, mais ícones que texto):** **`NotificacoesAdmin`** = `Segmented` **Avisos** (cabeçalho só com
      ícones sino · e-mail · pode desligar) · **Limpeza** · **Comunicado** · **Alcance** (`DataTable` compacta, exportável).
      **Perfil → Notificações** = **`PreferenciasNotificacoes`** (grava sozinho em 600 ms — `usePreferenciasNotificacoes`):
      Sino (os tipos em **`ChipsIcone`** — DS: chips de alternar com ícone, `compacto` = só o ícone —, Som, Alerta do sistema
      — pede a permissão do navegador —, Silenciados com "voltar a avisar") e E-mail (Imediato · Resumo diário · Desligado,
      horário, silêncio De/Até, destino, os tipos). **Sino:** ações só com ícone (`Acao`: lida/não lida, **adiar**,
      **silenciar** — as opções abrem EM LINHA, `Pilula`, sem menu sobre menu —, excluir); filtro por tipo em `ChipsIcone`;
      rodapé só com ícones (marcar todas, limpar lidas, limpar tudo, configurar) + "N não lidas". **Som** (`tocarSom`, Web
      Audio, sem arquivo) e **alerta do sistema** (`alertaSistema`, a aba em segundo plano; tocar abre o aviso) conforme as
      escolhas (lidas só quando chega um aviso, cache de 10 min). Ao vivo, uma conferência a cada 5 min cobre o aviso a
      muitas pessoas (o comunicado — o ao vivo pinga até 25 por requisição). O visual dos tipos (ícone/cor/rótulo) é UM
      mapa — **`VISUAL_AVISO`** (`notificacoesVisual.ts`).
  - **Verificação no navegador (Chromium, servidor simulado) — corrigido:** as ações do aviso FLUTUAM por cima (não roubam a
    largura do título; no toque, numa linha embaixo) e o "+N parecidos" fica embaixo do texto (a barra de ações o cobria);
    o "Desfazer" do limpar mora no SINO (`Caixa.limpar` + `Caixa.ocultos` — sobrevive ao painel fechar; antes, fechar o
    painel apagava na hora); o **`Dropdown`** não fecha ao tocar num AVISO FLUTUANTE (`.avisos-flutuantes` — a confirmação
    e o "Desfazer" nascem de dentro do painel); voltar à janela/trocar de tela busca o aviso NOVO (prévia), não só o número
    (`recontar` = `conferirNovo` com 15 s de intervalo). **Toda ação tem a DICA ao passar o mouse:** `Segmented.dica`,
    `Switch.dica`, `title` no `GatilhoFiltro` ("Filtrar e ordenar: …"), na `Ajuda` e no `SeletorMultiplo` suspenso; no sino,
    o aviso inteiro (título, texto, data e "Clique para abrir"), as ações, as pílulas de adiar/silenciar e o rodapé.
  - **VER = LER + FIXAR (migração `0086`, aditiva — `notificacoes.travada`):** o aviso não lido ≥ 60% à vista no sino por
    800 ms (aba à vista) vira VISUALIZADO sozinho, em lote (`PATCH {ids, visto:true}`, IntersectionObserver no painel; fica no
    lugar, colorido). O **MARCADOR** de visualizada à direita de cada aviso é o `CirculoConcluir` (`rotulos` próprios): vazio =
    não vista, verde com ✓ = vista; tocar alterna — marcar como NÃO visualizada **FIXA** o aviso (`travada`, ícone de alfinete):
    ver de novo não o marca; o toque no marcador ou abrir o aviso destravam; "Marcar todas" deixa as fixadas. Regra única no
    builder **`comandoMarcarLidas`** (`notificacoes-sql.ts`, modos `lida`/`nao-lida`/`visto`/`todas`, testado no D1 real).
  - Testes: `tests/notificacoes.test.ts` (catálogo/config, prefs, validação, dia/hora relativa/repetidos/título, canal ao
    vivo, gravação com `returning`, exclusão + dispensa e retenção no driver D1 real, mescla, resumo/silêncio/silenciar,
    retenção do ADM, descadastro assinado, e-mail resumo, a fila com `email_apos`) + `tests/resend-email.test.ts` (reserva
    com validade e confirmação).
- **LOGIN COM GOOGLE (OAuth, sem migração):** cartão **"Login com Google"** em Integrações (`IntegracaoGoogle`,
  catalogado): `integracoes.google` = `{ativo, clientId, clientSecret CIFRADO write-only}` (`GoogleConfig`,
  `googleConfigurado`); o cartão mostra a URI de redirecionamento (`/api/auth/google/callback`, com Copiar) e "Testar"
  (`alvo:"google"`: segredo legível + o Google responde). Fluxo Authorization Code + **PKCE S256** + **state** — núcleo PURO
  **`google-oauth-core.ts`** (testado: `urlAutorizacao`, `desafioPkce`, cookie curto `pca_google` 10 min, `lerIdToken` =
  emissor/público/validade/e-mail verificado, `mensagemErroLogin`, `SENHA_INUTILIZAVEL`) + **`google-oauth.ts`**
  (`googleDaConfig`, `trocarCodigo` — host fixo, 10 s, sem redirecionamento). `GET /api/auth/google` (inicia) e `GET
  /api/auth/google/callback`: e-mail cadastrado ATIVO → sessão + auditoria "entrou com o Google"; pendente/inativo → o aviso;
  e-mail NOVO → `/login?modo=cadastro&erro=google-sem-cadastro` (a conta nasce SÓ pelo cadastro institucional — ver "Autenticação");
  erro → `/login?erro=<código>`. `AuthForm` (login) tem `google` (botão "Entrar com Google", `IconGoogle`) e `erroInicial`;
  as páginas `login`/`cadastro` leem `?erro=`. Setup em `docs/INTEGRACOES.md`.
  **VÍNCULO da conta Google + login com um clique (migração `0066`, aditiva — `usuarios.google_sub` ÚNICO + `google_email`):**
  o login acha o usuário pelo `sub` do Google (mesmo com um e-mail DIFERENTE do cadastro) — regra pura **`decidirLoginGoogle`**:
  vinculada › mesmo e-mail sem outra conta (vincula na hora) › mesmo e-mail com OUTRA conta = recusa (`google-outra-conta`) ›
  `novo` (vai ao cadastro institucional). Perfil → cartão **"Conta Google"** (só com o Google ativo): "Vincular conta
  Google" (`/api/auth/google?vincular=1` → o cookie curto leva o MODO `e`/`v`; `podeVincular` recusa a conta de outro usuário →
  `?google=em-uso`; `MENSAGEM_VINCULO`) e "Desvincular" (`DELETE /api/perfil/google`; recusado a quem só entra pelo Google — sem
  senha). A conta que entrou fica LEMBRADA no aparelho (cookie httpOnly `pca_google_conta`, 1 ano): o login mostra "Continuar
  como <e-mail>" (o Google entra direto nela — `login_hint`, sem a tela de escolher) + "Usar outra conta Google" (`?trocar=1` →
  `select_account`). Erros específicos: `google-estado` (sessão do login expirou/outra aba), `google-token` (Google recusou —
  Client ID/secret/URI), `google-outra-conta`; a volta leva o `motivo` do Google (`codigoErroGoogle`: `invalid_client`,
  `redirect_uri_mismatch`, `invalid_grant`…) e a tela diz o que fazer (`DETALHE_ERRO_GOOGLE` → `mensagemErroLogin`/
  `mensagemVinculo`; o vínculo usa os MESMOS códigos). O "Testar configuração" confere o Client ID + secret JUNTO AO GOOGLE
  (`conferirCredenciaisGoogle`: troca um código inventado — `invalid_grant` = credenciais aceitas).
- **AUTOMAÇÃO — baixar DFDs da Centi (sem migração, só ADM):** tela **`/painel/automacao`** (`AutomacaoAdmin`; nav
  "Automação" `IconRobo`) = Extensão e Centi (estado + instalação) · Opções da emissão (valor de referência, data; avançado:
  modelo de assinatura, `ModuleKey`, `Guid` — no APARELHO, `localStorage` `automacao:centi`) · Baixar DFDs (Ids "1154:1155",
  pasta pelo `showDirectoryPicker` — sem ele, Downloads —, andamento por Id). **Extensão "FINA"** do Chrome `extensao-centi/`
  (MV3; o .zip é montado NA HORA por `GET /api/admin/automacao/extensao` — `zipDaExtensao`, `extensao-zip.ts` — com os arquivos de `extensao-centi-arquivos.ts` [GERADO por `node scripts/gerar-extensao.mjs`; o teste confere que está em dia] e a LOGO do sistema [o favicon PNG da Identidade] como ícone; botão "Baixar extensão" sempre no topo da tela; cada versão nova avisa os ADMs no SINO — `avisoVersaoExtensao`, derivado na leitura com chave por versão) = só o CANAL até a aba da Centi que TEM a
  sessão (login da Centi é POR ABA): `centi-main.js` (mundo MAIN) guarda os cabeçalhos que a própria Centi usa em
  `/wcf/restauth/` (`Refreshtoken`/`Company`/`Month`…, sem os `x-ts` do anti-robô F5; também no `sessionStorage` da aba) e
  executa o pedido da tela com as TRAVAS — só a API da Centi, GET livre, POST em `restauth/operation` (e o anexo, abaixo) com
  `TRAVAS_CENTI` forçadas —; `centi-ponte.js`/`background.js`/`sistema-ponte.js` ligam as abas; injeta-se SOZINHA (`scripting`)
  nas abas já abertas (sem F5 nem novo login). Mensagens com o PROTOCOLO (página da Centi) e a versão (tela — vale a maior;
  cópias antigas se calam). **A LÓGICA mora no sistema** (atualiza com o deploy, sem reinstalar): núcleo PURO
  **`automacao-centi-core.ts`** — `pedidoEmitirDfd` (os 44 `Params` capturados), `analisarRespostaCenti` (o "Processar"
  devolve `{File:{Key, FileName}}` → o PDF é buscado pela chave em `caminhosDoArquivo`/`linkDaResposta`; aceita também PDF
  cru, base64 "JVBER…", gzip "H4sI…" e bytes; falha mostra o `esqueletoCenti`, sem dados/tokens), `lerIdsCenti`,
  `lerConfigCenti` [a CENTI MUDOU a operação em 01/10/2026: o "Processar" da tela passou a mandar ModuleKey 120465 + Guid `24e3e9d0-…` + assinatura 163 — o pedido antigo, 120464, voltava "Usuário sem permissão!"; a configuração antiga guardada no aparelho — `OPERACAO_ANTIGA` — é trocada pela nova na leitura], `VERSAO_EXTENSAO_CENTI` (a MÍNIMA aceita) + `versaoAtende`. Nada entra na Mesa; na Centi, só o anexo ao protocolo indicado (abaixo);
  nenhuma senha no sistema. **Por protocolo** (padrão; `Segmented` Por protocolo | Por Id): os protocolos do sistema numa
  `DataTable` com seleção (as colunas **Situação** e **Responsável** da Mesa à frente — `SeletorCelula`/`SeletorPessoa` na célula, gravam na hora pelo `PATCH /api/protocolo/[id]` `origem:"celula"`, otimista com reversão; as pessoas do grupo ativo + as gravadas de fora dele — `useColunasGestao`; loader `protocolosParaAutomacao`, `automacao.ts` — todos, com a SIGLA da unidade, a data, Σ itens e Σ valor dos DFDs [toda coluna com `render` — a `DataTable` só desenha pelo `render`; o `value` é filtro/ordem], o ano do PCA [sem ano no protocolo, o dos DFDs] e, por DFD, o
  planejamento, o ano do PCA e o ÓRGÃO — `chaveOrgaoCenti`). **Plano da saída** (puro: `planoDosProtocolos`/`planoDosIds` →
  `ArquivoSaida {pastas, nome, partes}`): pasta do protocolo "SIGLA - PCA ano - (nº) - ano" (`nomePastaProtocolo`), PDF
  "Planejamento P - DFD N - PCA ano - (nº) - ano" (`nomeArquivoDfd`) — o PROTOCOLO sempre no fim (`sufixoProtocolos`: "(1222,
  2212) - 2026"; vários anos com " + "), opções no aparelho (`OpcoesSaida`): pasta "PCA ano" por cima,
  PDFs **separados | um por protocolo | um por UNIDADE (a sigla da unidade do DFD) | um único** (unidos pelo `pdf-lib`, import dinâmico) e ordem pelo nº de
  planejamento; DFD sem planejamento é pulado e avisado; cada PLANEJAMENTO é baixado UMA vez no lote (`repetidos`: "DFD
  duplicado" no mesmo protocolo, "Já baixado no protocolo X" vindo de outro — avisados na análise). Sem pasta escolhida (o seletor abre em Downloads), um arquivo vai
  direto para Downloads e vários vão num **.zip com as pastas** (`zip-armazenar.ts`, STORE puro e testado). **Entidade da
  Centi por órgão** (extensão 1.2.0, protocolo 3: o `estado` devolve a entidade aberta — cabeçalho `Company` — e o `pedir`
  aceita `entidade` só naquele pedido): mapa órgão → entidade no aparelho; sem ele, a aberta; falhou e "Descobrir sozinho"
  ligado → tenta as outras (`candidatosEntidade`: as digitadas ou 0–28 — as entidades da Centi — no formato da aberta) e lembra a que deu certo.
  **Segurança dos dados:** cada PDF é CONFERIDO antes de contar como salvo (`conferirConteudoDfd`: o texto das 2 primeiras
  páginas — pdf.js, dinâmico — traz o planejamento E o DFD pedidos como número inteiro; sem texto = falha), a gravação na
  pasta confere o TAMANHO gravado e o PDF unido confere o total de páginas. Tela MINIMALISTA (explicações só no (?)), em
  largura total e SEM rolar o navegador de `lg` (1024px) para cima (`useAlturaTela`, piso 240; a Análise ao lado — 20rem, 24rem no `xl`): cabeçalho = título · (?) · `Segmented` Por protocolo |
  Por Id · selo da extensão/Centi · Verificar · "Extensão x.y.z" · **Ajustes** (`Dropdown` dialog: Saída — formato, pasta PCA,
  ordem, **escolher a pasta** [desligado = Downloads e o botão some], conferir —, Emissão, Entidade por órgão, Avançado);
  corpo = a tabela `scrollInterno` (Pasta/Baixar no RODAPÉ — `acoesRodape`; tocar na linha abre o protocolo no MESMO
  `BannersMesa` da Mesa, com `contextoBanners` exportado de `mesa-dados.ts`) | a **Análise** ao lado (cada DFD do plano por
  pasta, com o estado: Na fila · Baixando · Salvo · Falhou · Sem planejamento, órgão · entidade). Testes:
  `tests/automacao-centi.test.ts`.
  **DESTINO Pasta | Protocolo da Centi (extensão 1.3.22, protocolo 26 — TRAVAS reforçadas: o POST só passa com a FORMA do Emitir DFD (`operacaoDoCorpo`: `IdComprasPlanejamento` + `DFD`=1 — nenhuma outra operação da Centi), o GET só alcança o arquivo gerado (`ARQUIVO`: getbinlink/getbin/getfile), e o serviço (`background.js`) repassa a `operacao` no estado (na 1.3.21 ela não chegava ao sistema); a OPERAÇÃO "Emitir DFD" é PEGA SOZINHA da tela da Centi: quando a própria tela manda um Processar (operation com `IdComprasPlanejamento` e `DFD`=1), a extensão guarda ModuleKey + Guid + modelo de assinatura (`operacaoDoCorpo`, peça pura; `operacaoTela` no sessionStorage; as operações que a PRÓPRIA extensão envia não contam — `proprias`) e o `estado` a devolve; o sistema ajusta a configuração pelo que MUDOU (`ajusteDaOperacao`, avisa) ao verificar a extensão e, quando a Centi recusa a operação ("Usuário sem permissão!" — `operacaoRecusada`), relê o estado, ajusta e tenta UMA vez de novo; sem operação nova, o erro diz para emitir UM DFD pela tela, o lote PARA e a descoberta de entidade não roda (permissão não é entidade); a EMISSÃO (o operation do "Emitir DFD") e o download do PDF saem pelo CLIENTE HTTP DA PRÓPRIA CENTI, o mesmo do anexo — `binarioPelaCenti` (`responseType: arraybuffer`, a entidade do órgão só no cabeçalho daquele pedido); sem o cliente, o envio da extensão; a EMISSÃO vai com os cabeçalhos da aba exatamente como a tela os mandou (sem renovar o rastreio, como na 1.2.0); a extensão NUNCA acrescenta cabeçalho que a tela não manda nem escreve nos clientes HTTP da Centi: `comTokenNovo` só ATUALIZA token/Authorization/refreshtoken que já existem [o operation da tela leva só Refreshtoken + Company + Month; as 1.3.8–1.3.17 acrescentavam token/Authorization e a emissão do DFD dava "Usuário sem permissão!"], a sessão guardada mudou de chave (`__pcaCentiSessao_v2`); o protocolo abre pelo módulo que a Centi aceitar: `load?entity=102907` [PO002] e, se vier Entity nulo, `102908` [PO011 - Tela Protocolo — o único que devolve o protocolo já em tramitação, "Em análise"]; `MODULOS_PROTOCOLO`; o documento novo leva o ModuleKey dos documentos que o protocolo já tem [sem nenhum, 102932]. Base = o código EXATO da 1.3.12, a versão validada no anexo real; a "limpeza" das 1.3.13–1.3.15 foi DESFEITA [depois dela o load do protocolo passou a voltar vazio]; da limpeza ficou só o erro do load com a mensagem da Centi e a forma da resposta, nunca os dados: (1) o load/confirmsave/save saem pelo CLIENTE HTTP DA PRÓPRIA CENTI — a instância do axios em `/restauth` que a tela usa, achada pelo FORMATO entre os módulos do webpack da página (`acharClienteCenti`); sem o cliente, o envio da extensão com a sessão capturada (com os cabeçalhos/endereço/meio do salvar aprendidos na aba e o rastreio renovado — `renovarRastreio`, `dicaCabecalhos`, `dicaTrilha`); (2) o TOKEN da Centi TROCA a cada resposta e a extensão o acompanha (`comTokenNovo`, `tokenNosClientes`); (3) o **`confirmsave` leva o OBJETO do protocolo DIRETO** (como a tela; só o `save` usa `{Token, Object}` — `corpoConfirmar`; o envelope no confirmsave era a causa dos 500 "Erro inesperado") e, com `Confirm: true`, a pergunta da Centi vai ao ADM (`useConfirmacao`) e o save só segue com o "sim" (`aceitar`); (4) o TIPO pelo `LoadObjectReference` como a tela, senão o load do tipo. A peça `__pcaCentiAnexo_p<protocolo>` leva o protocolo no nome; antes de anexar, o PDF não unido é REGRAVADO pelo pdf-lib (`regravarPdf`)):** em Ajustes → Destino, "Protocolo da Centi" pede o
  **Id** (o "Id" do cadastro do protocolo na Centi = o "Id:" da capa) e o **nº** ("156844" ou "156844/2026" — `lerAlvoCenti`)
  + o **tipo do documento** (`OpcoesSaida.tipoDocumento`, padrão `TIPO_DOCUMENTO_DFD`=1039); "Conferir na Centi" mostra o
  protocolo (ação `protocolo`, só leitura) e "Testar anexo" anexa um PDF de 1 página feito no navegador ("TESTE - pode excluir - hora", com confirmação), SEM emitir DFD — separa o salvar da emissão. Cada ARQUIVO do plano (separado ou unido) vira UM documento novo, com a
  descrição = o nome sem ".pdf" (`descricaoDoArquivo`). A gravação é a ÚNICA escrita na Centi e mora na EXTENSÃO
  (`centi-anexo.js`, peças puras testadas por `vm`; ação `anexar` do `centi-main.js`): `load?entity=102907&key=<Id>` →
  confere Id + nº (+ ano) → a mesma descrição já no protocolo = não anexa de novo → `montarSalvar` = o protocolo do load
  SEM mudança (só as listas nulas viram [] — como a tela da Centi) + UM documento (State 0, `IdGed {FileName, Data}` = o
  PDF em base64, o tipo = o REGISTRO do tipo — `load?entity=103868&key=<tipo>`, `tipoDoLoad`, como a tela da Centi manda; sem ele, o objeto de um documento desse tipo já no protocolo, senão a referência pelo Id) →
  `confirmsave` com o objeto direto (`Confirm: true` = a pergunta vai ao ADM; só o "sim" dele grava — nunca confirma sozinha) → `save` → só vale com `Success` e o
  documento de volta com Id real (`conferirSalvo`). O sistema nunca manda o objeto do protocolo; o protocolo é conferido
  ANTES de emitir qualquer DFD e o ADM confirma (`useConfirmacao`) antes de começar; a 1ª recusa do anexo PARA o lote (o erro diz o passo — load/confirmsave/save).
- **PLATAFORMA DE AUTOMAÇÕES CENTI — FUNDAÇÃO (migração `0076`, aditiva; plano em `docs` da conversa: fundação → extensão segura →
  ao vivo → receitas → login/descoberta → gravador de receitas).** Princípios: negado por padrão · escrita só ACRESCENTA ·
  toda escrita = AUTORIZAÇÃO DE USO ÚNICO do servidor (+ confirmação na janela da extensão, entrega 2) · ensaio antes ·
  FREIO de emergência · tudo auditado e idempotente · nada fixo. Tabelas `automacao_execucoes` (receita + versão, quem,
  estado preparada|rodando|pausada|concluida|falhou|cancelada, ensaio, totais recontados NO BANCO), `automacao_passos` (um
  por alvo, único execução+chave), `automacao_autorizacoes` (só o HASH do token; consumida por DELETE … RETURNING, da
  própria pessoa e dentro de `VALIDADE_AUTORIZACAO_S`) e `automacao_registros` (o que foi ESCRITO na Centi; único
  capacidade + alvo + descrição → nunca repete, nem de outro computador). Núcleo PURO **`automacao-core.ts`** (capacidades
  do motor — leitura `estado/ler/consultar/baixar`, `operar`, ESCRITA = lista FIXA `anexar`; `RECEITAS` com as previstas
  `disponivel:false` — protocolos por repartição, relatórios, consultar, tramitar; `coerceConfigAutomacao`,
  `receitaAtiva`, `motivoNaoEscrever`, `podeTransitar`, `estadoFinal`, `textoAlvoAnexo`), builders **`automacao-sql.ts`**
  (testados no D1 real), D1 **`automacao-plataforma.ts`** (config no blob `configuracoes.automacao` lida SEM cache — o
  freio vale na hora; falha ao ler = escrita pausada), Zod **`automacao-validation.ts`**. Rotas (todas `exigirAdmin`,
  origem `centi` na auditoria, entidade `automacao`): `GET/PATCH /api/admin/automacao/config`, `GET/POST …/execucoes`,
  `GET/PATCH …/execucoes/[id]`, `POST …/execucoes/[id]/passos` (≤ 50), `POST …/execucoes/[id]/autorizar` (freio, receita,
  dono, não ensaio, rodando, passo pendente, não feito, limite `automacaoEscrita` 60/min), `POST
  …/autorizacoes/consumir` (pela EXTENSÃO: Origin `chrome-extension://` ou o próprio site; mesma capacidade e mesmo alvo
  em tempo constante; freio de novo) e `GET/POST …/registros`.
  **ENTREGA 2 (extensão 1.4.0) — o ANEXO só pela plataforma:** a tela cria a execução `anexar-dfds` (um passo por
  arquivo — `automacao-cliente.ts`: `iniciarExecucao`/`autorizarEscrita`/`registrarAnexo`/`concluirPasso`/
  `cancelarExecucao`), pede a autorização de CADA escrita (já registrado = não grava de novo) e manda o token com o pedido;
  a **`sistema-ponte.js`** (mundo isolado — scripts da página não a alcançam) CONSOME a autorização no servidor para o alvo
  tirado do PRÓPRIO pedido (Id + nº + ano + descrição) e leva o pedido SEM o token; o **`background.js`** recusa o
  "anexar" sem a autorização ou com outro alvo e abre a **janela de confirmação DA EXTENSÃO** (`confirmar.html`/
  `confirmar.js`, `chrome.windows.create`; uma vez por execução + protocolo, guardado em `chrome.storage.session`;
  recusar, fechar ou 2 min sem resposta = não grava) — XSS na página do sistema não aprova nada. A pergunta do
  `confirmsave` da Centi segue para o ADM (o "sim" pede uma autorização nova). Gravado = `automacao_registros` + passo
  feito; interrompido = execução cancelada; arquivo sem DFD emitido = passo falhou. Sem `localhost` no manifesto nem no
  serviço; permissão `storage`; o gerador inclui `.html`. Testes (vm, `chrome` falso): `tests/extensao-seguranca.test.ts`.
  **ENTREGA 3 (extensão 1.4.1) — tela AO VIVO + destino automático + pré-verificação:** o estado da Centi é conferido ao
  abrir, ao voltar à janela e a cada 20 s com a tela à vista (fora de um lote); a extensão se anuncia sozinha ao ser
  instalada/atualizada (sem F5) e com o id da cópia (duas cópias da MESMA versão = selo de aviso). **Freio na tela:**
  Ajustes → Gravação na Centi (`PATCH /api/admin/automacao/config {ativa}`, pausar confirma; selo "Gravação pausada"; o
  Anexar trava). **Histórico das execuções** (`HistoricoExecucoes`, contêiner: as últimas execuções → os passos ao lado,
  "Cancelar execução" na que ficou rodando/pausada). **Destino "Protocolo de cada DFD"** (`DestinoSaida` `proprio`): cada
  arquivo vai ao protocolo da Centi de onde vieram os DFDs — `alvoDoArquivo` (puro: o "Id:" da capa + o nº; arquivo que junta
  protocolos ou protocolo sem Id = erro, nunca chuta; só no modo Por protocolo); o registro guarda o `protocoloId` e a coluna
  **"Na Centi"** conta os anexados por protocolo. **Pré-verificação** antes de emitir: cada protocolo da Centi conferido
  (Id + nº) e o que já está em `automacao_registros` (`GET …/registros?alvos=`, `jaAnexados`, `descricaoCanonica`) NÃO é
  emitido de novo. **Servidor:** a autorização e o registro só saem para o MESMO alvo gravado no passo da execução
  (`passo.alvo === textoAlvoAnexo(alvo)` — a execução declara os alvos; um pedido depois não troca de protocolo).
  **ENTREGA 4 — as duas receitas no motor + a operação no SERVIDOR:** BAIXAR (destino pasta) também é uma execução
  registrada — receita `emitir-dfd`, um passo `baixar` por DFD (`iniciarExecucaoLeitura`; o resultado final de cada um vai em
  lotes de 50 por `concluirPassos`; o que o lote não chegou a emitir = "falhou"); ANEXAR já era (`anexar-dfds`). A
  OPERAÇÃO Emitir DFD aprendida da tela da Centi vai à configuração do servidor (`PATCH …/config {operacao}`, só quando
  muda — `chaveOp`) e a tela aplica a do servidor ao abrir (sem aviso): o que um ADM aprendeu vale para todos.
  **GRAVADOR DE RECEITAS (extensão 1.5.0, protocolo 27):** Ajustes → "Gravar uma ação na Centi" liga o gravador NA ABA da
  Centi (`gravador` {iniciar|parar|limpar} no `centi-main.js`, sessionStorage `__pcaGravador_v1`, até 300 passos); cada
  pedido que a TELA da Centi faz em `/wcf/` vira só a ESTRUTURA — `estruturaDoPedido` (peça pura do `centi-anexo.js`,
  testada: método, caminho com números trocados por `{n}`, a `entity`, os NOMES dos parâmetros e os campos do corpo com o
  TIPO; nunca um valor, token ou dado pessoal). Parar abre o **`GravadorReceitas`** (DS: a tabela + "Copiar a gravação") —
  a base para montar as próximas receitas (protocolos por repartição, relatórios, consultas, tramitar) sem chute. O serviço
  só aceita as ações `pedir`/`protocolo`/`anexar`/`gravador`.
  **LOGIN AUTOMÁTICO (extensão 1.6.0, protocolo 28):** a senha fica SÓ na extensão. **Opções da extensão**
  (`opcoes.html`/`opcoes.js`, `options_ui`): usuário + senha + "Entrar sozinho quando a sessão cair", Salvar/Esquecer/
  Entrar agora e a situação (pronto · pausado com o motivo · última tentativa). **Cofre** `cofre.js` (serviço via
  `importScripts` + opções): AES-GCM 256 com chave NÃO EXTRAÍVEL no IndexedDB da extensão; o cifrado em
  `chrome.storage.local` (`credCenti`), a situação em `loginCenti`; régua pura `podeTentarLogin` = no máximo **1 tentativa
  a cada 5 min** (`chrome.storage.session` `loginUltima`, para todas as abas); senha recusada ou verificação pedida =
  **PAUSA** até salvar de novo (nunca insiste — não bloqueia a conta); "Entrar agora" ignora só o intervalo. **Tela de
  login** reconhecida no mundo ISOLADO por `centi-login.js` (peças puras: `telaDeLogin` = 1 senha visível + usuário +
  ENTRAR; `sinaisDeBloqueio` = captcha/código/2 senhas/"senha expirada"; `erroDeLogin`; `preencherEEntrar` = setter
  nativo + input/change + clique); a `centi-ponte.js` responde `estado` com `tela:"login"` (vale mais que a sessão
  guardada) e só aceita `centi-login` do SERVIÇO (`sender.id` da extensão, sem `sender.tab`); espera até 15 s: ok ·
  recusado (erro NOVO na tela) · bloqueio · sem-resposta. **Serviço:** `abaCenti` devolve o motivo (`semAba`/`login`/
  `semSessao`); `garantirSessao` tenta entrar por trás no `estado` (a tela não espera) e espera no `entrarAgora`; "sempre
  que cair" também sem a tela do sistema — `tabs.onUpdated` (aba da Centi carregou no login) e o alarme `login-centi`
  (5 min; permissão `alarms`); sem aba da Centi e com o login pronto, abre uma em segundo plano (1 vez a cada 5 min). Ações
  novas da tela: `entrarAgora` e `abrirOpcoes`. **Tela:** `LoginCenti` (selo "Centi na tela de login"/"login pausado" com o
  motivo + "Entrar agora" + "Configurar login"); a resposta à tela traz só a situação (`login`), nunca o usuário/senha.
  Testes: `tests/extensao-login.test.ts` (DOM falso, cofre com `crypto.subtle`, serviço com cofre falso; a senha não aparece
  no mundo da página nem na ponte do sistema).
  **ABA PRÓPRIA + BANNER DAS CREDENCIAIS + ANDAMENTO + INTERROMPER (extensão 1.7.0, protocolo 29):** a automação trabalha
  SÓ numa aba que a extensão abre (`criarAba`: `tabs.create` em segundo plano no grupo azul **"Automação PCA"** — permissão
  `tabGroups`; `abaGuardada` = o id no `storage.session` ou, depois de reabrir o Chrome, a aba do grupo pelo título); as abas
  da Centi do usuário não são usadas. A tela abre a aba ao entrar e no Verificar (`estado {abrir:true}`); fechada pelo
  usuário (`abaFechada`), a conferência de 20 s não reabre — Verificar ou um pedido reabrem. A aba trabalha no sistema
  **COMPRAS** (`COMPRAS` = `/compras/`; a raiz da Centi é só o portal "Acesso aos sistemas", sem login): criada já nele e,
  se estiver no portal ou em outro sistema, vai a ele antes de conferir a sessão (`irParaCompras`, 1.7.1). **Login = o
  DROPDOWN do ícone** (o próprio `popup.html` ganhou o formulário — usuário, senha, "Entrar sozinho", Esquecer, "Salvar e
  entrar"; aparece sozinho sem login salvo ou com a pausa; saíram `credenciais.*`, `opcoes.*` e o `options_ui`):
  `abrirCredenciais` abre o dropdown por `chrome.action.openPopup()` (sem janela em foco, uma janelinha
  `popup.html?janela=1`) SOZINHO uma vez por sessão do navegador (`credenciaisPedidas`) quando falta login ou a senha foi
  recusada; "Configurar login" da tela abre de novo. Régua do
  login: entrar com sucesso zera o `loginUltima` (o intervalo de 5 min vale só depois de uma falha) — F5 na aba que cai no
  login entra de novo na hora (`conferirAba` no `tabs.onUpdated`). **Andamento:** a tela manda a ação `lote`
  (`inicio` → `loteId`, `passo` por DFD, `fim`); o serviço guarda a `atividade` no `storage.session` (título, passo,
  feito/total, últimos 20 passos, estado, a aba dona) e mostra no **selo do ícone** ("3/15"; OK/X/!), no **cartão
  flutuante da aba da automação** (`centi-painel.js`, mundo isolado + Shadow DOM, injetado pelo serviço) e no **popup**
  (`popup.html`/`popup.js`, `action.default_popup` — o `zipDaExtensao` preserva o popup ao pôr o ícone: situação da Centi,
  andamento ao vivo por `storage.session.onChanged`, Interromper, ir para a aba e o login). **Interromper** (o
  dropdown ou o cartão — só da aba da automação; outra aba/página = recusado): o lote vira `interrompido`, a confirmação de
  anexo aberta vale "não", a `sistema-ponte` avisa a tela (`tipo:"interrompido"`) e os pedidos que levam o `lote`
  (`sistema-ponte` repassa `m.lote`) são recusados com `{interrompido:true}` — os de fora do lote seguem; o pedido em curso
  termina. Na tela (`useExtensaoCenti` → `lote`/`interrompido`), o laço para, a fila vira "Interrompido na extensão", o PDF
  unido parcial não é salvo e a execução é cancelada. **F5 na tela:** o serviço marca o lote como `parado` quando a aba dona
  recarrega/fecha (`donoSaiu`); a tela, ao voltar, avisa o último passo; enquanto um lote roda há o aviso de saída
  (`beforeunload`). Testes: `tests/extensao-automacao.test.ts` + `tests/fixtures/chrome-falso.ts` (o `chrome` falso
  compartilhado pelos testes da extensão).
  **TAREFAS + "LER A TELA PROTOCOLO" + ABA SINALIZADA + ID FIXO (extensão 1.8.0, protocolo 30):** o manifesto tem uma
  **`key`** fixa (id `lhdooglmnecpbocibgfobaefahliicnn` em qualquer pasta) — o `credCenti`/`loginCenti` e a chave AES do
  IndexedDB sobrevivem a toda atualização (o `zipDaExtensao` preserva a chave). **Aba sinalizada** pela `atividade`: o
  grupo vira "Automação PCA · 3/15" (azul rodando, verde OK, vermelho interrompido, laranja parado — `grupoDaAtividade`;
  `abaGuardada` acha o grupo pelo COMEÇO do título) e o `centi-painel.js` põe o prefixo no TÍTULO da aba ("▶ 3/15 · …",
  reaplicado a cada 2 s; some 10 s após o fim) e a MOLDURA com a faixa "Automação PCA executando — não feche esta aba".
  **Seletor de TAREFA** (`SelectField compacto`, no aparelho `automacao:tarefa`): DFDs por protocolo · DFDs por Id · **Ler a
  Tela Protocolo** (receita `protocolos-por-reparticao`, agora disponível) → **`TarefaTelaProtocolo`** (contêiner).
  **Aprender clicando** (ação `aprender` iniciar/parar/limpar — a aba vem para a frente e o cartão mostra a instrução):
  enquanto liga, o `centi-main.js` guarda a RESPOSTA de cada pedido da tela (XHR/fetch; nunca os da própria extensão —
  `internos`) por `registroDoAprendiz` (`centi-anexo.js`, puro, testado): CONSULTA de leitura (`consultaPermitida`: só
  `restauth/`, verbo de leitura, nunca salvar/excluir/tramitar/arquivo) com o pedido COMPLETO (método, caminho, corpo sem
  campos com cara de segredo — nunca cabeçalhos) + o resumo da resposta (`acharLista`/`linhaPlana` — o padrão
  `{Fields:[{Key,Value}]}` achatado, 200 linhas); a OPERAÇÃO só quando gerou um ARQUIVO (a emissão do PDF do protocolo —
  ao parar, a chave ModuleKey|Guid vai ao `localStorage` da Centi e passa a valer no `pedir`, com as TRAVAS forçadas).
  Parar → **`AprendizTelaProtocolo`** (DS: as consultas de protocolos com o nome da aba, o mapa das colunas sugerido,
  prévia, a emissão) → Salvar = `PATCH /api/admin/automacao/config {telaProtocolo}` (`ConfigAutomacao.telaProtocolo`,
  `coerceModeloTela` — vale para todos os ADMs; auditoria). Núcleo PURO **`automacao-tela-protocolo.ts`** (testado):
  `modeloDoAprendiz`, `sugerirColunas`, `emissaoAprendida` (o parâmetro da operação cujo valor é um campo de uma linha),
  `lerLinhas`/`itensDaLista`, `juntarProtocolos` (o mesmo protocolo em várias abas = uma linha), `proximaPagina` (take/skip
  ou page), `corpoEmissao`, `nomePdfProtocolo`. **Ler protocolos** = ação `ler` (a MESMA trava de leitura no `centi-main`)
  por consulta e página, execução registrada (passos `consultar`) e o andamento no lote; tabela com Abas · No sistema (pelo
  "Id:" da capa ou pelo nº) · as colunas mapeadas · Exportar. **Emitir e analisar** (seleção ou tocar na linha): um por
  vez, a operação aprendida → o PDF (`analisarRespostaCenti` + `caminhosDoArquivo`) → o **`ProtocoloUploadForm`** com
  `arquivo` (abre a MESMA análise da importação, sem o lançador) e `onFechado(erro?)` (fechar a análise, ou o PDF que não é
  protocolo, segue para o próximo); nada é protocolado sozinho. `arquivo-navegador.ts` (base64, gunzip, download).
  Testes: `tests/automacao-tela-protocolo.test.ts` e os de grupo/trava em `extensao-automacao`/`automacao-centi`.
  **TELA PROTOCOLO PELA INTERFACE (extensão 1.9.0, protocolo 31) — o fluxo padrão da tarefa:** o "Aprender" saiu da tela
  (fica para depois — o código do aprendiz e o `AprendizTelaProtocolo` seguem). **`centi-tela.js`** (mundo ISOLADO, carregado
  antes da `centi-ponte`, que encaminha `telaDepartamentos`/`telaEmAnalise` a ele; `ACOES_CENTI` no serviço) opera a
  PRÓPRIA tela da PO011 como uma pessoa: acha o painel pelo título "Tela Protocolo" (senão clica na aba "PO011…" do topo ou
  digita "PO011" na busca do menu), abre o seletor "Departamentos" (react-select: mousedown/ArrowDown, opções por
  `role="option"`/`-option-N`), lê as repartições; para ler, tira as escolhidas (Backspace), escolhe as pedidas pelo texto
  (sem acento/caixa — confere os chips), clica na LUPA (o 1º botão só-ícone depois do campo), abre "Em Análise (N)" e lê a
  GRADE pelo cabeçalho "PROTOCOLO" (linhas de mesma forma; espera 2 leituras iguais; percorre as páginas pela "Próxima",
  teto 50; total pelo rodapé "Exibindo N registro(s)"). Só LEITURA: lista negra `PROIBIDO` (Protocolar, Operações, Salvar,
  Excluir, Novo, Tramitar…) conferida antes de CADA clique em botão/link. Tela: **`TarefaTelaProtocolo`** = 1 · Repartições
  ("Buscar repartições" → o DROPDOWN **`SeletorMultiplo suspenso`** — busca, marcar todos, limpar; nada empurra o layout; escolha no aparelho `automacao:tela-departamentos`,
  `departamentosEscolhidosValidos`) · 2 · Ler "Em Análise" (execução `protocolos-por-reparticao`, passo `consultar`; lote →
  cartão/moldura da aba) → `DataTable` com seleção (Protocolo copiável · Ano · Departamento · Interessado · Solicitante ·
  Natureza · No sistema — `noSistemaTela`, o ano tem de bater; `normalizarProtocolosTela`) + Exportar; "Tratar selecionados"
  desabilitado (próxima entrega). Testes: `tests/automacao-tela-centi.test.ts` (DOM falso como nos prints: seletor com chips,
  lupa, PROTOCOLAR nunca tocado, abas, grade paginada).
  **1.9.1 — a grade lida de verdade:** o cabeçalho da grade é procurado no DOCUMENTO (a grade fica FORA do bloco dos
  filtros): `acharCabecalho` = o menor ancestral comum dos rótulos PROTOCOLO · ANO · INTERESSADO com os três em FILHOS
  diferentes e rótulos curtos (o "Protocolo" do menu lateral não conta; a célula com ícones de ordenar/filtrar também não);
  linhas pela ESTRUTURA (mesma tag e nº de filhos do cabeçalho) e, sem elas, pela POSIÇÃO (`getBoundingClientRect`: o texto
  vai à coluna sob a qual está, as linhas pela altura — grade virtualizada); o rodapé/paginação pelo bloco da grade; a aba
  aceita "Em Análise(1)"; a aba sem número = 0; a pesquisa termina quando a contagem para de mudar; chips também pelo
  `aria-label` "Remove …" (já escolhidas = nada a mexer). Falha → `{erro, diagnostico}` (a FORMA do DOM, ≤ 1,5 KB, sem
  dados de sessão) → `Callout` fixo + "Copiar diagnóstico" na tarefa. A peça guarda a `versao` (a mais nova substitui a
  que ficou na aba).
  **EMITIR E ANALISAR + LOGIN GUARDADO NO SISTEMA (extensão 1.10.0, protocolo 32):** tocar num protocolo da tabela (ou
  marcar vários e "Emitir e analisar") → ação **`telaEmitir`** (`centi-tela.js`, `{protocolo, ano, departamentos}`): acha a
  linha na grade (senão pesquisa de novo e percorre as páginas), CLIQUE + DUPLO CLIQUE abrem o cadastro ("Protocolo -
  <Id>" com Operações) — conferido pelo campo Protocolo —, **`lerCadastro`** lê TODOS os campos como a Centi mostra
  (`{rotulo, valor}`: o rótulo = o texto mais próximo ANTES do campo que não é campo/botão, sem o "*"; código + nome do
  interessado juntos; seletor pelo texto escolhido) e emite pelo **Operações → Emitir documentos** (a ÚNICA exceção à
  lista negra — `clicarSo` confere o rótulo EXATO; a janela que abrir só é confirmada por Emitir/Processar/Gerar/
  Imprimir/Visualizar/OK/Confirmar, cada botão uma vez; fecha o cadastro no fim). A **captura** mora no `centi-main.js`
  (ação `captura` iniciar|ler|parar, chamada SÓ pela ponte — `ctx.pagina`): enquanto ligada, o operation que a PRÓPRIA tela
  manda vai com as TRAVAS forçadas nos parâmetros que traz (`travarCorpoOperacao`, `centi-anexo.js` — `TRAVAS` agora
  mora lá) e a resposta é guardada, assim como o PDF que ela prepara (`URL.createObjectURL` de um Blob) e o endereço que
  abriria (`window.open` vira uma janela falsa — nada abre); `respostaComArquivo`. No sistema, **`pdfDoAchado`** +
  **`baixarPelaExtensao`** (`arquivo-navegador.ts` — o MESMO caminho do Emitir DFD, agora compartilhado com
  `AutomacaoAdmin.emitirUm`) dão o PDF, que abre no **`ProtocoloUploadForm arquivo`** (a análise da importação: capa, DFDs,
  itens; `onFechado` segue a fila); `TarefaTelaProtocolo` ganhou a coluna **Documento** (Na fila · Emitindo · Em análise ·
  Analisado · Falhou), as colunas dos dados da Centi (`dadosCentiValidos`/`rotulosDosDados`), o "No sistema" pelo **Id**
  da Centi (`noSistemaTela` — o Id decide, senão nº + ano) e a execução `protocolos-por-reparticao` (passos `baixar`).
  **Login guardado no sistema (opcional):** no login da extensão, "Guardar também no sistema PCA" → o serviço manda
  usuário + senha a **`PUT /api/admin/automacao/credencial-centi`** (só com o Origin `chrome-extension://<id fixo>` —
  `ORIGEM_EXTENSAO_CENTI`; nenhuma página imita), cifrados com a chave mestra (`INTEGRACOES_CHAVE`) nas preferências da
  pessoa (`centi-login-cofre.ts`, chave `cofre:centi-login`); sem login no cofre (extensão reinstalada), o serviço o
  traz de volta pelo `GET` (só a extensão recebe a senha; a tela vê só a situação) — no `onInstalled`/`onStartup`, ao abrir
  o popup e antes de tentar entrar (1 vez a cada 10 min). "Esquecer" tira dos dois lugares; Ajustes → **Login da Centi**
  mostra a situação e "Remover do sistema" (`DELETE`). `host_permissions` ganhou o sistema. Testes:
  `automacao-tela-centi` (cadastro + emissão no DOM falso), `automacao-centi` (travas), `extensao-login` (restaurar/
  guardar), `automacao-tela-protocolo`.
  **1.10.1 — a grade da Centi é WIJMO FlexGrid** (`wj-row`/`wj-cell`): ela descobre a célula pelas COORDENADAS do evento
  — todo clique da `centi-tela.js` é o MOUSE de verdade (`mouse`: pointerdown/mousedown/pointerup/mouseup/click NO
  CENTRO do elemento, `getBoundingClientRect`; `duplo` = o par + `dblclick`); o protocolo é trazido à vista
  (`scrollIntoView`) antes do duplo clique. A grade desenha só as linhas VISÍVEIS: `percorrerGrade` volta ao topo e ROLA
  o corpo (`rolador` = o ancestral da 1ª linha com rolagem vertical) lendo a cada passo, até o fim — lê todas e acha a
  linha pedida em listas longas. A falha ao abrir diz a célula (classe, posição) e os cadastros abertos.
  **1.11.0 — EMISSÃO "POR CÓDIGO" + os DADOS da grade (protocolo 33):** a grade é lida pelos DADOS do controle Wijmo
  (ação `grade` no `centi-main.js`: `host["wj-Control"]` → `getCellData` de TODAS as linhas da página — a tela desenha só
  as visíveis — + o **Id** de cada protocolo dos dados da linha, `linhaPlana`; `mostrar` = `scrollIntoView` da linha
  pedida antes do duplo clique); sem o controle, o DOM como antes. A tabela tem colunas FIXAS (Protocolo · Ano · **Id** ·
  **Entrada** · Departamento · Interessado · Solicitante · Natureza · Documento · No sistema — nada é acrescentado ao
  carregar). A captura da emissão guarda também o PEDIDO do operation da tela, os arquivos que a tela BAIXA
  (getbinlink — a chave pode valer uma vez), o `<a download>` clicado e aceita ZIP; o operation que gerou o arquivo vira
  "aprendido" naquela Centi (`OPERACOES`) e vai ao sistema → **`emissaoDoPedido`** (o parâmetro cujo valor é o Id) →
  `PATCH /api/admin/automacao/config {emissaoProtocolo}` (`ConfigAutomacao.emissaoProtocolo`, `coerceEmissaoProtocolo`).
  Dali em diante, cada protocolo é emitido **por código** (`corpoEmissaoProtocolo` + `pedir` operation com as TRAVAS,
  como o Emitir DFD); recusado/sem modelo/sem Id → pela tela (que ensina de novo). O arquivo pode ser ZIP:
  **`zip-ler.ts`** (puro, testado: STORE + DEFLATE) + `pdfDosBytes` (vários PDFs = unidos — `novaUniao` saiu do
  `AutomacaoAdmin` para `arquivo-navegador.ts`); `pdfDoAchado` devolve cada tentativa (endereço → status · começo) no
  diagnóstico (`BaixarCenti` → `DownloadCenti {status, bytes}`).
  **Só por código (sistema, sem mudar a extensão):** com o "Emitir documentos" já aprendido, a emissão NUNCA cai para a
  tela da Centi — a tela só é usada UMA vez para ensinar (sistema sem o modelo, ou o navegador ainda não o aprendeu:
  `emitirPorCodigo` → `{recusada}`), a Centi RECUSOU a operação guardada (`operacaoRecusada` — mudou ou sem permissão) ou a
  grade não trouxe o Id (o cadastro o lê) — e ensina de novo. **Modelo v2 com os CAMPOS DO PROTOCOLO** (`EmissaoProtocolo`
  `v:2` + `campos`, `emissaoDoPedido(corpo, {id, protocolo, ano, hoje})`): além do Id, os parâmetros iguais ao nº
  (`protocolo`), ao "nº/ano" (`protocoloAno`), ao ano (`ano` — só numa chave "ano…", nunca o exercício) e à data de hoje
  (`hoje-dmy`/`hoje-iso`) são preenchidos com os do protocolo PEDIDO (`corpoEmissaoProtocolo(e, alvo)`) — antes iam com os
  do protocolo que ensinou; o modelo antigo (sem `v:2`) é descartado e aprendido de novo UMA vez. A fila lê a emissão, os Ids
  e as repartições de REFS (o aprendido no meio do lote vale já) e espera a configuração carregar antes do 1º protocolo;
  emissão até 300 s (extensão 1.11.2: o binário também). **LOTE AUTOMÁTICO para QUALQUER quantidade:** "Emitir e ler" (os
  marcados ou TODOS) emite cada protocolo e LÊ o PDF no navegador (`indexarProtocoloPdf` → capa + DFDs), um por vez, SEM abrir
  janelas: `conferirLeituraProtocolo` (puro, testado) recusa o PDF de OUTRO protocolo (nº/ano/Id da capa ≠ o pedido) e marca
  "Sem DFDs" em atenção; os DFDs já cadastrados contam (`buscarExistentes`); a coluna Documento mostra Lido/Atenção/Falhou
  com o resumo. Falha TRANSITÓRIA (rede, 5xx, sem resposta — `falhaTransitoria`) tenta UMA vez de novo; os passos da execução
  vão ao servidor de 50 em 50; só os últimos 8 PDFs ficam na memória (`PDFS_NA_MEMORIA`); Interromper vale. Tocar numa
  linha abre a ANÁLISE COMPLETA (o PDF da memória ou emitido de novo). **Cadastros na Tela Protocolo (extensão 1.11.3,
  `centi-tela.js` v6):** antes de abrir um protocolo, TODOS os cadastros abertos são fechados (`fecharCadastros` — Escape +
  o "fechar" da janela: ×, aria-label/title Fechar/Close ou a classe close/fechar/times; nunca o × de um chip do seletor nem
  nada da grade) e o cadastro é achado pelo campo Protocolo entre os abertos (`acharModal(doc, protocolo)`) — antes, um
  cadastro de outro protocolo deixado aberto parava o lote ("O cadastro do protocolo não abriu"). **Sempre SÍNCRONA:** `corpoEmissaoProtocolo` manda
  o parâmetro do modo assíncrono (`ehParamAssincrono`: Assincrono/Assync/Async) como "não" no formato capturado
  (`valorSincrono`) — no assíncrono a Centi gera em segundo plano e a chave dá 404; o diagnóstico mostra os parâmetros ENVIADOS. **Download DIRETO, num pedido só:** a chave do `File.Key` é baixada por
  `caminhoDoArquivo` — o MESMO endereço que a tela da Centi usa: o `URL` da resposta; o arquivo em CACHE (`File.Cache:true`
  — o "Emitir documentos" do protocolo) = **`rest/GetBinCache/{chave}`** (no `getbinlink` ele dava 404 vazio; extensão
  1.11.1 libera esse endereço na trava de leitura); senão `restauth/getbinlink/{chave}/{nome}` (o Emitir DFD) — UMA vez (e o
  link, se a resposta for um); sem PDF, o erro traz o pedido (endereço → status), o esqueleto da resposta (`amostra`) e os
  parâmetros enviados — nenhuma repetição nem endereço adivinhado.
- **FLUXOS DE AUTOMAÇÃO — estilo N8N (v1.24.0, migração `0091`, extensão 1.15.0):** Automação → tarefa **"Fluxos
  (automações personalizadas)"** (`FluxosAutomacao`, `src/components/fluxos/`). Tabela `automacao_fluxos` (nome, `grafo`
  JSON, `frequencia` JSON, `ativo`, `proxima_em`, `ultima_em`, `ultima_execucao`); D1 `fluxos.ts`, Zod `fluxos-validation.ts`,
  rotas `GET/POST /api/admin/automacao/fluxos` e `GET/PATCH/POST(fim da execução)/DELETE …/fluxos/[id]` (`exigirAdmin`,
  auditoria `automacao`). **Núcleo PURO `fluxo-core.ts`** (testado — `tests/fluxo-core.test.ts`): `lerGrafo`,
  `validarGrafo` (Início único, campos obrigatórios, portas, ciclo só pela porta "volta" do Laço — `temCicloSemLaco`),
  `resolverCaminho`/`interpolar` (`{{campo}}`), `comparar` (operadores sem acento/caixa, números pt-BR), `chaveJuncao`,
  `lerFrequencia`/`proximaExecucao` (Brasília; intervalo ≥ 5 min, diário/dias úteis, semanal, mensal) e o MOTOR
  `executarFluxo` (por EVENTOS: o nó roda quando todas as conexões de cada porta entregaram; toda saída é sempre entregue —
  vazia também; nó com todas as entradas vazias é PULADO, menos `rodaSemItens`; o Laço `entregaParcial` entrega "lote" OU
  "fim"; saída implícita "erro" — ligada, o erro segue por ela; sem ela, o fluxo para e aponta o nó; tetos `MAX_PASSOS`,
  `MAX_ITENS`, `MAX_ITERACOES_LACO`). **REGISTRO `fluxo-nos.ts`** (novo nó = uma entrada: tipo, categoria, portas, campos
  DECLARATIVOS, `executar`): Início · Centi (Repartições, Protocolos por situação — `telaApi {situacao}`, CM002 por
  entidade) · Sistema (DFDs, Protocolos) · Leitura (Ler protocolo — `fluxo-navegador.ts`: emissão POR CÓDIGO + leitura do
  PDF) · Lógica (SE, Comparar A × B → iguais/diferentes/só em A/só em B, Laço até o fim, Juntar) · Dados (Filtrar, Definir
  campos, Ordenar, Remover duplicados, Agrupar e somar) · Erros (Apontar erros → relatório) · Saída (Gravar execução nos
  DFDs, Avisar). Modelos prontos em `fluxo-modelos.ts` (só pela API da Centi — sem cair na tela, v1.25.2; cards "Modelos prontos" na lista com "Usar este modelo" — v1.25.1; com `frequencia`/`ativo` — o POST os aceita): **Inclusão PCA — conferir na CM002 e
  protocolar** (v1.25.0, a cada 120 min: Protocolos Em análise da repartição fixa → Laço → Ler → filtra assunto INCLUS →
  **`sistema.naoCadastrados`** (v1.26.0: pula os protocolos já no sistema — Id da capa ou nº/ano — antes de emitir) → **`dados.desdobrar`** (um item por DFD, com o protocolo do pai) → **`dados.conferirCm002`** (v1.26.0, puro `conferirCm002`: fora da CM002, situação proibida/fora da esperada, valor com tolerância, entidade do órgão divergente — um apontamento por problema)
  → **`saida.importarProtocolo`** (entradas entrada + apontamentos, casados por protocolo/ano). A importação headless é
  **`importar-protocolo-auto.ts`** (`lerProtocoloCompleto` = índice + parse completo + OCR + normalização; `importarProtocolo`
  = a régua da Mesa — pula o já cadastrado/DFD existente/PCA sem cadastro/trava do ADM/duplicado/DFD em erro; grava com
  `origem:"automacao"` e os apontamentos na observação). A leitura fica num cache da execução (`CacheLeitura`) — o
  importar não emite de novo; um protocolo que falha vira `leitura:"falha"` e segue. Sem a consulta aprendida (`semConsulta`), os nós `centi.cm002`/`centi.protocolos` e a `TarefaExecucaoDfds` ENSINAM sozinhos (extensão 1.15.1: `telaPlanejamentos {aprender:true}` abre a CM002 — aba ou busca do menu — e clica em Pesquisar; `telaEmAnalise` das repartições) e repetem pela API. A consulta da PO011 é `POST restauth/postdata` `{Data:{Reparticoes:[{Id,Descricao,selected}]}, ItensPerPage, Method, Page}`: o `telaApi {reparticoes}` (extensão 1.15.2, `comReparticoes`) marca `selected` só nas pedidas — a Centi já filtra (`porReparticao`) — e `semPaginacao` cobre `ItensPerPage`. **PAINEL do fluxo** (v1.30.0, `PainelFluxo.tsx`, DS): todo fluxo abre no painel PADRONIZADO — Dados de entrada (os campos `entrada: true` dos componentes, pelo mesmo `CampoDoNo`), Etapas (cada componente em ordem com estado/itens/aviso) e Análise (StatMini + DataTable dos apontamentos, exportável); o diagrama só no botão "Diagrama" (fluxo novo vazio abre nele). `lerDfdCentiPorCodigo` usa a operação do servidor e, recusada, a da extensão (`estado.operacao`) — igual ao Baixar DFDs. **SÓ API** (v1.29.0, extensão 1.16.0): a extensão NÃO opera mais telas — o `ACOES_CENTI` não tem as ações `tela*` (Departamentos/EmAnalise/Emitir/Planejamentos); repartições = `reparticoesApi` (Data.Reparticoes da consulta guardada), Tela Protocolo = `telaApi {reparticoes}`, emissão do protocolo só por código. **Emitir DFD = `GET restauth/load?entity=101026&key=<planejamento>` (`caminhoLoadPlanejamento`, ação `ler` com `entidade`) ANTES do `operation`** — a tela da Centi faz assim e sem o load a Centi responde "Usuário sem permissão!" (Baixar DFDs e `lerDfdCentiPorCodigo`; o load dá a SITUAÇÃO — `acharValor`; `pdf:false` = só o load). **Conferir DFDs × Centi** (v1.28.0: `sistema.dfds` → **`leitura.dfdCenti`** [host `lerDfdCenti` = `lerDfdCentiPorCodigo`, `fluxo-navegador.ts`: o MESMO Emitir DFD do "Baixar DFDs" — `pedidoEmitirDfd` com a config do aparelho `automacao:centi` → `parseDfdPdf`; confere o planejamento; recusa da operação PARA o fluxo] → **`dados.compararDfdCenti`** [puro `compararDfdCenti`: nº, tipo, objeto, valor com tolerância, nº de itens] → `saida.marcarConferencia`); antes (v1.27.0, migração `0092` — `dfds.conferencia_centi` convergente|divergente + `_motivo` + `_em`): `sistema.dfds` (agora com `valor`) + `centi.cm002` → `dados.conferirCm002` → **`saida.marcarConferencia`** (`marcacoesConferencia`, puro: divergente vence, motivo = as mensagens) → `POST /api/admin/automacao/conferencia-dfds` (`exigirAdmin`, ≤ 5000, auditoria); Mesa → DFDs: coluna **Centi** (`CelulaConferenciaCenti`, o motivo na dica). O `centi.protocolos` com repartição e SEM departamento nas linhas PARA com erro (nunca passa todas). Ao fim, o relatório por protocolo do Importar (`host.relatorio`) vai no `POST …/fluxos/[id]` (`relatorio`) e o servidor avisa no sino (tipo `centi`) quem executou. **Editor:** paleta (tocar = acrescenta ligado ao nó marcado;
  arrastar = solta no quadro), `CanvasFluxo` (DS — grade, pan, zoom, portas, curvas, Delete), `PainelNo` (o formulário
  do tipo + o seletor de "dado buscado" pelos campos da última execução + a saída numa tabela), relatório da execução.
  **Agendador:** com a tela aberta e a extensão pronta, a cada minuto roda o fluxo ligado cuja hora chegou
  (`navigator.locks` — uma aba por fluxo); o servidor agenda a próxima no fim. Futuro (o registro comporta): gatilho por
  evento/webhook, HTTP genérico, e-mail, IA (Claude) no servidor, escrita na Centi com autorização.
  **TUDO VIROU FLUXO (v1.31.0, extensão 1.17.0, PROTOCOLO 36):** a tela da Automação (`AutomacaoAdmin`) renderiza SÓ os
  fluxos (`FluxosAutomacao`) — saíram o seletor de Tarefa, `TarefaTelaProtocolo`, `TarefaExecucaoDfds`, o `centi-tela.js`
  e a captura de emissão do `centi-main.js` (as descrições dessas peças acima são HISTÓRICO). As funções antigas são os
  MODELOS (`fluxo-modelos.ts`): **dfds-protocolo** (`sistema.protocolos` → `entrada.selecionar` → `saida.dfdsCenti`),
  **dfds-ids** (`entrada.ids` → `saida.dfdsCenti`), **tela-protocolo** (`centi.protocolos` → selecionar → laço →
  `leitura.protocolo`) e **cm002** (com o ramo "Só na Centi"). Motor do Baixar/anexar em **`automacao-dfds-motor.ts`**
  (`ContextoEmissor`, `emitirUm`/`emitirNaEntidade`, `planoDosItens`, `executarDfds`, `anexarPelaPlataforma`/`testarAnexo`),
  compartilhado com `lerDfdCentiPorCodigo` (sem OCR — `parseDfdPdf(f,{ocr:false})`). Nós novos: `entrada.selecionar`
  (tabela de seleção no painel), `entrada.ids`, `saida.dfdsCenti`; campo `reparticoesCenti`; `DefNo.previa` (itens sem
  executar) e `ContextoNo.parcial` (itens ao vivo). Painel: **`paineis.tsx`** (`HostPainelCtx` + `VISOES` por tipo de nó —
  Seleção, DFDs, Protocolos lidos) e `PainelFluxo` (Dados de entrada + Etapas | abas das visões + **Análise ao vivo**,
  altura pelo `useAlturaTela`, sem rolar o navegador). Colunas/gestão de protocolos em `automacao/ProtocolosAutomacao.tsx`.
  **FLUXOS DENTRO DE FLUXOS (v1.32.0, migração `0093`):** QUALQUER fluxo salvo é um componente. Nó **`fluxo.executar`**
  (categoria `fluxo`; campo tipo `fluxo`): `modo` porItem (cada item roda o filho, `paralelo` 1–6 por `executarEmPool`) |
  lote (uma vez com todos); o `gatilho.inicio` do filho entrega `host.__entrada` (os itens do pai) e os campos `entrada` do
  filho recebem os valores do item (`grafoComEntrada`); o RETORNO = o nó **`saida.retornar`** (porta `__retorno`) ou, sem
  ele, o que os nós finais produziram (`ResultadoExec.retorno`); apontados do filho sobem com `subfluxo`; falha de um item
  vai à porta `falhas` (o "interrompido"/operação recusada para tudo). **Retomada** (`retomar`, chave do item `chave`):
  tabela `automacao_progresso` (fluxo de topo + caminho do nó `ids/nó` + chave; builders `fluxos-sql.ts`, testados no D1 real)
  por `GET/POST/DELETE /api/admin/automacao/fluxos/[id]/progresso?no=` — pula os `ok`, grava a CADA item (v1.33.3), esquece tudo ao
  concluir sem falha; `RecomecarSubfluxo` no painel do nó. **`fluxo.paralelo`** (campo `fluxos`): vários fluxos ao mesmo
  tempo (`Promise.allSettled`, até 6). Segurança: ciclo recusado ao salvar (`cicloAoGravar` → 409, `cicloDeSubfluxos`) e na
  execução (`host.__pilha`), profundidade ≤ `PROFUNDIDADE_MAX`=3; excluir fluxo usado por outro = 409 (`fluxosQueUsam`); o
  filho é lido UMA vez por execução (`carregadorDeFluxos`, a versão salva) e compartilha o `host.__cache` (ex.: os DFDs do
  `sistema.completarDfd` — um item que já é DFD passa direto; sozinho, o planejamento do campo). Modelos com
  `dependencias` + `fluxoModelo` (`grafoDoModelo`): "Conferir DFDs × Centi" = DFDs → Executar "Conferir 1 DFD × Centi"
  (paralelo 3, retomar).
  **Tela (v1.32.1):** a lista mostra SÓ os fluxos salvos, em **`CartaoFluxo`** (DS, `fluxos/CartaoFluxo.tsx` — v1.37.2 — `leitura.dfdCenti.falhaErro` (ligado no "Conferir 1 DFD"): a falha de COMUNICAÇÃO vira erro do subfluxo → o pai grava "falha" e a retomada refaz o DFD (o "não encontrado" segue marcando divergente); "Atualizar pelo modelo" (`criar(…, {atualizar})`) regrava o fluxo salvo e as dependências com o modelo atual. v1.37.1 — no desktop o "Novo fluxo" (`EscolherNovoFluxo coluna`) põe os cartões SOLTOS na coluna (mesma largura dos da lista; topo e rodapé em cartões próprios), a capa usa o `--accent` do tema e o editor mostra as atenções em selo âmbar. v1.37.0 — o `CartaoFluxo` é o `CartaoEspaco` de Tarefas (capa `CapaQuadro` em degradê + ícone, sem foto; nós · última · erros; modelos: nós · frequência · usa) e o FLIP (`useDeslizar`) mede `offsetLeft/Top` cancelando a animação anterior. v1.36.0 — LISTA: `useColunas` divide a largura em N colunas iguais (≥ `LARGURA_CARTAO`=15rem, a de Tarefas), o painel "Novo fluxo" ocupa a ÚLTIMA coluna (entra da direita) e `useDeslizar` (FLIP com `animate`) desliza os cartões ao reorganizar; arrastar reordena pelo `useArrastoGrade` + `CartaoPreso` + `SombraGrade` de Tarefas (ordem por pessoa em `preferencias_tabela` `automacao:ordem-fluxos`, devolvida pelo `GET …/fluxos` como `ordem`) e o modelo arrastado do painel até a lista cria o fluxo naquele lugar; o "+" alterna o painel. v1.35.0 — DIAGRAMA (`fluxo-layout.ts`): `rotasDoGrafo` = rotas SEM linha sobre linha (dobra vertical na faixa livre ±`FAIXA`=12px), `setasDaRota` (setas no meio dos trechos ≥ 64px e na chegada), `coresDasLigacoes` (ligações de um mesmo nó em cores `--serie-*`, "erro" vermelho; a porta ligada fica preenchida na cor), `dobraDaRota` + `Conexao.x` (v1.36.1: arrastar a linha por QUALQUER trecho desloca a dobra — só depois de 4px; o nó arrasta pelo corpo inteiro, as portas param antes; duplo clique volta, Organizar zera); o (?) do zoom = `Ajuda botao`. v1.34.0: LARGURA FIXA `LARGURA_CARTAO`=17rem × h-48, a grade em colunas fixas e o painel do Novo fluxo com a largura de um cartão; o `Badge` ganhou `vivo`/`title`; título
  INTEIRO, descrição em 3 linhas, rodapé; grade `auto-rows-fr` ≥ 16rem; esqueleto `SkeletonCartao` ao carregar); **"Novo
  fluxo"** = `Modal lado="direita"` (painel na altura toda à direita no desktop, folha no celular — prop nova do `Modal`)
  com "Em branco" + TODOS os modelos no mesmo cartão (v1.33.2: o `lado` do `Modal` saiu — o painel desliza na própria tela; o editor do diagrama tem a altura FIXA do display pelo `useAlturaTela`, a paleta e o quadro rolam por dentro) (o que já existe: "Abrir o existente" | "Criar outro"); o "Como
  montar" do diagrama mora no `Ajuda` (?) dos controles de zoom.
- **TELA PROTOCOLO pela API (extensão 1.14.0, protocolo 35):** o `centi-main.js` guarda a consulta que a PRÓPRIA tela da PO011
  faz ao listar (o mesmo `lembrarCm002`, chave `__pcaTelaProtocolo_v1`; reconhecida pela FORMA — `protocolosTela`: protocolo +
  ano + interessado; com situação na lista, só a que traz "em análise") e a ação **`telaApi`** a repete sem paginação (só
  leitura; com situação, filtra `emAnalise`). A `TarefaTelaProtocolo` vai pela API quando a consulta guardada cobre as
  repartições escolhidas (`apiCobreReparticoes` — as da última leitura pela tela, no aparelho `automacao:tela-api-reparticoes`;
  com o departamento nas linhas, `soDasReparticoes` filtra) e, senão ou se falhar, lê pela tela UMA vez (que ensina a consulta).
  Testes: `tests/tela-protocolo-api.test.ts`.
- **EXECUÇÃO DOS DFDs pela API da CM002 (extensão 1.13.0, protocolo 34 — desde a v1.21.0 SEM a tela):** o `centi-main.js`
  GUARDA a consulta que a própria tela da CM002 faz ao Pesquisar (`lembrarCm002` → `localStorage __pcaCm002_v1`, só método,
  caminho e corpo; reconhecida pela FORMA — `planejamentosCm002`: Id + Situação + Finalidade/Centro de custo) e a ação **`cm002`**
  `{entidade}` a REPETE sem paginação (`semPaginacao`: tamanho → 100000, início → 0) na entidade pedida — todas as linhas, só
  leitura (`consultaPermitida`). A `TarefaExecucaoDfds` lê CADA entidade dos órgãos (o `entidade_centi` cadastrado, senão o mapa
  do aparelho), grava por entidade (`POST …/execucao-dfds` com `dfdIds`) e separa as visões DFDs do sistema · Situação diferente
  (≠ Executado) · Não encontrados na Centi · Só na Centi (planejamentos sem DFD). A leitura pela tela (`telaPlanejamentos`) abaixo
  segue na extensão, sem uso na tela. Desde a v1.22.0: andamento FLUTUANTE no rodapé (v1.22.1 — `PainelAndamento`, portal, recolhível: a barra + um cartão por entidade — órgãos, DFDs, lidos,
  ≠ executado, só na Centi) e o selo da execução no `DfdCabecalho` (`execucao`: UM status — a situação da Centi na cor da classe, ou Não
  verificado — DFD gravado e DFD ao lado do protocolo); em Ajustes, o órgão com `entidade_centi` cadastrado fica fixo (`fixas`).
- **EXECUÇÃO DOS DFDs pela CM002 (extensão 1.12.2, migração `0089` — `dfds.execucao_centi`/`execucao_centi_em`):** tarefa
  **"Verificar execução dos DFDs (CM002)"** da Automação (`TarefaExecucaoDfds`): a ação **`telaPlanejamentos`**
  (`centi-tela.js` v9, só leitura e o MÍNIMO de cliques) lê a tabela "Resultados" da CM002 COMO ESTÁ NA TELA (o HTML —
  `lerTabelaCm002`: a linha de cabeçalho com ID e SITUAÇÃO e as linhas de mesma forma); só clica na aba da CM002 se a
  tabela não estiver à vista, em Pesquisar se estiver vazia e na próxima página só enquanto faltar algum planejamento
  pedido — nunca abre um planejamento nem mexe em filtro. **ID = nº de planejamento**. `POST
  /api/admin/automacao/execucao-dfds` (`exigirAdmin`) → núcleo puro **`execucao-centi.ts`** (`situacoesDaGrade`,
  `planoExecucao` — grava só o que mudou, `classeExecucao` executado/cancelado/outro) + auditoria; `GET` = os DFDs com
  planejamento e a situação gravada. Mesa → DFDs: coluna **Execução** (`CelulaExecucao`, só quando algum DFD já foi
  verificado). **Por ENTIDADE:** a CM002 mostra só a entidade aberta na Centi — só os DFDs do órgão ligado a ela (o mapa
  órgão → entidade: o **ID da entidade na Centi CADASTRADO no órgão** — `orgaos.entidade_centi`, migração `0090`, campo no
  `OrgaosAdmin` + coluna "Centi" — vale mais que o mapa do aparelho `automacao:centi-entidades`; `mesmaEntidade`) são verificados; o POST leva `dfdIds`. A tabela desenha só
  as linhas à vista: `lerPaginaCm002` ROLA o corpo para ler todas e volta a rolagem. Testes: `tests/execucao-centi.test.ts`
  + o da tabela em `automacao-tela-centi`.
- **SETA DOS `<select>` (única):** nenhum select usa a seta nativa (varia por navegador — no Mac fica serrilhada e colada na
  borda): `globals.css` tira a aparência nativa de TODO `select` e desenha o chevron do tema (`--seta-select`, na cor de
  `--muted` do claro/escuro) a 0,75rem da borda, com `padding-right` para o texto nunca passar por baixo; dentro da moldura
  do `SelectField` a seta fica rente ao fim do select (`SETA_NA_CAIXA`). Os selects invisíveis sobre um visual próprio
  (`opacity-0` — `SeletorCelula`, `SeletorFiltro`) não mudam.
- **Responsivo/touch mobile-first**: **tabela↔cards**, **modal↔bottom-sheet**,
  sidebar↔bottom-nav (a MESMA lista de módulos — `NAV_MODULOS`); sem overflow horizontal (conteúdo largo rola no próprio container); alvos
  ≥44px; foco visível. **Use toda a largura do desktop.** **Sem emoji.** A **sidebar do `AppShell`** é
  **fixa** (`lg:sticky lg:top-0 lg:h-dvh`) com **scroll interno** na navegação (a lista rola se houver muitas abas).
- **Render correto desde o início** (sem flash/CLS): shim `__name` + `<style>` de tokens antes do
  `ThemeProvider` em `layout.tsx`. Skeleton/shimmer (`Skeleton.tsx`: `Skeleton`, `SkeletonLinhas`, **`SkeletonCartao`** =
  a moldura de cartão com linhas — a espera de uma visão inteira) só onde há espera real.
- Erros: **`src/app/painel/error.tsx`** (a falha de uma tela do painel fica DENTRO do painel — menu e cabeçalho seguem),
  `src/app/error.tsx` (boundary da raiz, export `ErrorBoundary`, página inteira) e `not-found.tsx`. As duas fronteiras usam
  o **`FalhaNaTela`** (DS, catalogado) + o hook **`useFalhaNaTela`**: o TIPO (núcleo puro `erro-tela-core.ts`, testado —
  `servidor` [tem a "ref:"] · `versao` [ChunkLoadError: publicaram com a página aberta] · `conexao` [resposta CORTADA —
  "Connection closed." — ou rede] · `tela`), o texto de cada um, "Tentar novamente"/"Recarregar a página" e os DETALHES
  TÉCNICOS recolhidos ("Copiar detalhes"). Recupera SOZINHO uma vez por tela a cada minuto (`podeTentarDeNovo`, trava no
  `sessionStorage` com reserva na memória): `versao` recarrega a página (só com o `sessionStorage` — nunca em laço);
  `servidor`/`conexao` pedem a tela de novo (`router.refresh()` + `reset()` numa transição). Toda falha vai a `POST
  /api/erros` (os Logs do Worker).
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
- **Biome** (`biome.json`): regras recomendadas — inclusive as de a11y (`noLabelWithoutControl`,
  `noStaticElementInteractions`, `useKeyWithClickEvents`, religadas na v1.5.0). Padrão: ação = `<button>`; rótulo =
  `htmlFor`; fundo DECORATIVO com clique (scrim, célula vazia) = `aria-hidden="true"` com o caminho do teclado ao lado
  (Esc, botão); invólucro que só repassa/para eventos dos filhos = `role="none"` (o Biome não aceita "presentation");
  exceção só com `biome-ignore` + o motivo. CSS fica fora (Tailwind v4); `noArrayIndexKey` off (listas estáticas);
  `noNonNullAssertion`/`useExhaustiveDependencies` são avisos (não alterar deps de hooks automaticamente).

## VERSÕES do sistema e NOVIDADES (sem migração)
- **Fonte única:** `src/lib/versoes.ts` (puro, testado em `tests/versoes.test.ts`) — `VERSOES` (a mais recente PRIMEIRO; cada
  uma: `versao` semver, `data` AAAA-MM-DD, `titulo` e `mudancas` {tipo novo|melhoria|correcao, `area`, `texto`, `link` =
  ONDE mudou — caminho interno, com a aba}), `VERSAO_ATUAL`, `problemasDasVersoes` (ordem, números, datas, links internos —
  o teste exige nenhum) e o `version` do `package.json` = a atual (testado).
- **REGRA FIRME — TODA atualização publicada, de QUALQUER sessão/chat, segue o versionamento:** antes do push na `main`,
  acrescentar a entrada NO TOPO de `VERSOES` (MAIOR = muda o jeito de trabalhar · MENOR = recurso novo · CORREÇÃO = ajuste)
  com o que mudou e o `link` de cada mudança, e o MESMO número no `package.json`; depois publicar (push + "Deploy Cloudflare"
  verde). Antes de começar, `git fetch` da `main`: se outra sessão publicou SEM versão, as mudanças dela entram na próxima
  versão (nada fica fora do registro).
- **Menu:** `VersaoSistema` (`Novidades.tsx`, DS) no fim do menu lateral e da gaveta — "v1.5.0"; tocar abre as Novidades no
  BANNER FLUTUANTE; o ponto accent marca a versão ainda não vista NESTE aparelho (`localStorage` `sistema:versao-vista`).
- **Novidades = BANNER FLUTUANTE, sem página:** **`NovidadesFlutuantes`** (DS) sobre a `JanelaFlutuante` (ao lado da âncora no
  desktop; folha no celular): todas as versões, a escolhida ABERTA e destacada, as outras recolhidas — um **`CartaoVersao`**
  (DS; `onAlternar` = recolhível pelo cabeçalho) por versão: número, título, data, selo "Atual" e cada mudança com o tipo
  (`Badge`), a área e o botão "Ver onde mudou" (o `link`; ir fecha o banner e o sino — `onIr`).
- **Aviso aos ADMs:** tipo **`versao`** no catálogo (`CATALOGO_AVISOS`, grupo Administração — no sino, sem e-mail por padrão;
  o ADM liga em Configurações → Notificações) — `avisoNovaVersao` DERIVADO na leitura para cada Administrador (como a versão
  da extensão), UM por versão (`chave` `versao-sistema:<n>`; limpo, não volta): título "Nova versão N — título", o TEXTO = o
  que mudou (uma linha por mudança, até 4 + "e mais N"; o sino mostra até 4 linhas) e SEM link — tocar no aviso (ou no "Abrir"
  da prévia) abre as Novidades DAQUELA versão (`versaoDoAviso`) no banner flutuante AO LADO do sino, que CONTINUA ABERTO
  (`Dropdown` ignora o toque e o Esc com uma janela `[data-sobre-dropdown]` por cima — o Esc fecha primeiro o banner).

## Ao finalizar qualquer mudança
1. `npm run lint`, `npm test` e `npm run typecheck` verdes (os três bloqueiam o deploy).
2. **Commit + deploy** (push na main) e **verifique o site no ar** sem regressão.
3. **TODA atualização = versão nova** em `src/lib/versoes.ts` + `package.json` e PUBLICADA (ver "VERSÕES" — vale para
   qualquer sessão/chat; o que outra sessão publicou sem versão entra na próxima).
4. **Atualize os `.md`** relevantes (este arquivo, `docs/ROADMAP.md`, README) e a documentação
   do que mudou. Mudanças limpas, cirúrgicas, sem código morto.
