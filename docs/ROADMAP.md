# Roadmap — Tudo que pode ser criado na Plataforma PCA

Catálogo do que é possível construir, com base no **plano técnico**, na **planilha de
controle** (protocolos, compilado PCA, comunicações, orçamento, riscos), no sistema de
referência e no estado atual.

Legenda: ✅ pronto · 🔨 parcial · 🔜 recomendado a seguir · 💡 possível/futuro

---

## 0. Base já pronta
✅ Landing pública · ✅ Login/Cadastro/Sessão · ✅ Papéis (admin/gestor/membro) + aprovação de usuários · ✅ Área da equipe protegida (`/painel`) · ✅ Importação de planilha `.xlsx` em lotes · ✅ Deploy automático · ✅ Responsivo + tema claro/escuro.

### Fase 1 (padrão de design + navegação) — entregue
✅ **Design responsivo** (sidebar no desktop ↔ bottom-nav no mobile; tabela ↔ cards; botão ↔ FAB; modal ↔ bottom-sheet) · ✅ Navegação em 2 seções (Ferramentas / Administração) gated por papel · ✅ **Dashboard** (visão geral de protocolos: StatCards + recentes) · ✅ **Protocolos** — tabela única com **edição inline** (adicionar linha → editar células, como na planilha; dropdowns Natureza/Responsável/Situação/Distribuição, filtros por Natureza/Situação/Responsável/Período, paginação; tabela no desktop, cards editáveis no mobile) · ✅ **Ferramentas** (Dashboard do PCA + Importar + Tabelas dinâmicas) · 🔨 Abas Atividades/Pendências/Equipes/Permissões/Auditoria visíveis ("em construção").

### Fase 1b (perfil) — entregue
✅ **Tela do usuário**: editar nome/e-mail/**matrícula**, **trocar senha**, **foto** (base64 redimensionada no cliente); a foto reflete no menu; admin edita esses dados em Usuários. · ✅ **Carregamento profissional**: tema aplicado antes da pintura (fim do flash), skeletons com shimmer nas listas, sem títulos/descrições redundantes.

### Fase 2 (início público + PCA) — entregue
✅ **Home `/` = dashboard do PCA PÚBLICO** (todos veem, sem login) · ✅ Aba **PCA** (`/painel/pca`) para subir planilhas + unidades · ✅ Consolidação: dashboard saiu de Ferramentas para `/`; upload para a aba PCA.

### DFD: tela dedicada + banner com header/footer fixos — entregue
✅ DFD virou **tela própria** (`/painel/dfds`, aba **DFD** na nav — migração `0015` mantém o acesso de quem tinha
`pca`); o PCA ficou só com Planilha + PCA. A tabela de DFDs tem **filtro em todas as colunas** + **somatório de
itens e valores** (reativo aos filtros). O banner flutuante ganhou **cabeçalho e botões fixos** (o `Modal` agora
usa portal em `document.body` + layout com `rodape`) e o conteúdo foi reorganizado (sem textos quebrados).

### DFD: conferência em banner + regras de importação — entregue
✅ Ao importar (ou clicar em "Ver"), o DFD aparece **completo num banner flutuante** (`DfdView` em `Modal`,
reutilizado nos dois casos) — só grava no D1 **ao confirmar**. **Bloqueia a importação** (botão travado + lista
explicativa do que falta, mas deixando conferir) quando não há **valor unitário** em todos os itens, **repartição**,
**justificativa**, **previsão de entrega**, **prioridade** ou **fundamentação legal** (`faltasObrigatorias`,
cliente+servidor). Visualização por `GET /api/dfd/[id]`.

### DFD em PDF (além do .xlsx) — entregue
✅ O import de DFD aceita **`.pdf`** além de `.xlsx`: leitura no navegador via **pdf.js** (`parse-dfd-pdf`),
reaproveitando o cabeçalho/seções (`parse-dfd-comum`) e remontando a tabela por posição (rejunta o código
quebrado). Mesmo resultado do `.xlsx` (validado no arquivo real). O `.xlsx` segue como via mais determinística.

### Protocolo → DFDs (importar o PDF do processo com vários DFDs) — entregue
✅ Um **protocolo** (o "processo" administrativo) reúne **vários DFDs**; todo DFD vem de um protocolo. O sistema
importa o **PDF do protocolo** (bundle), **identifica cada DFD** (fatiamento por "Número DFD", reaproveitando o
parser do DFD) e os importa junto com os **dados da capa** (nº processo, interessado, CPF/CNPJ, assunto, valor,
observação, repartição). Banner de conferência com metadados editáveis, **"aplicar repartição a todos"**, tabela
**paginada** dos DFDs (repartição por DFD + situação novo/substitui/move) e a visão completa (`DfdView`) sob demanda;
**grava só os DFDs válidos** — DFD com pendência (`faltasObrigatorias`) **nunca é protocolado**. Também: **criar
protocolo vazio** e **vincular/desvincular** um DFD a um protocolo depois (`PATCH /api/dfd/[id]`). Nova entidade
`dfd_protocolos` + `dfds.protocolo_id` (migração `0016`), escopo por repartição; UI na **aba Protocolos** da tela de
DFD (`DfdsView`), sem nova aba. Rotas `POST /api/protocolo`, `GET`/`DELETE /api/protocolo/[id]`.

### Importação em ESCALA (milhares de DFDs/itens) + barra de progresso — entregue
✅ A importação (planilha, DFD avulso e protocolo) roda em **lotes** com **barra de progresso** (`Progress`, no
`/design-system`). O protocolo é lido em **streaming**: um **índice leve** (só o texto por página, geometria
descartada) lista os DFDs sem travar; ao protocolar, cada DFD é parseado, validado e enviado em lotes
(`start-dfd`/`append-dfd-itens`, `POST /api/dfd`) e **descartado** — nunca segurando mais que 1 DFD por vez. Assim um
protocolo com **milhares de DFDs** e um DFD com **milhares de itens** não estouram memória do navegador nem CPU/
subrequests do Worker. O matcher da tabela do DFD passou a **O(n log n)**. Ao final, um **relatório** mostra os
importados e os bloqueados (com o motivo). A gravação é **all-or-nothing por DFD** (retry de falha transitória +
rollback do DFD parcial; append idempotente), o banner fica **travado** durante a protocolação (não fecha, não
interrompe) e **toda escrita** (DFD e protocolo) é **escopada por repartição** (403 fora do escopo; anti-sequestro
por número).

### DFD editável dentro do protocolo (mesmo componente) + tratamento + edição em massa + split-view — entregue
✅ Dentro do protocolo, cada DFD agora abre o **mesmo componente de conferência/edição** do DFD avulso
(`DfdConferir`) — com a **mesma análise de problemas** e a possibilidade de **tratar** os campos que faltam ou estão
fora do padrão. **Normalização automática** (puros/testáveis): PRIORIDADE vira só **ALTA/MÉDIA/BAIXA** e PREVISÃO DE
ENTREGA vira **MÊS/AAAA** (ou **ANUAL/AAAA** quando recorrente); o que não dá para padronizar fica para o usuário
tratar (PRIORIDADE em `Segmented`, PREVISÃO por mês+ano+ANUAL, FUNDAMENTAÇÃO LEGAL em texto com padrão
"Lei 14.133/2021"). Cada DFD mostra um **estado** — com erro / regularizado automaticamente / editado / regular /
pendente. **Edição em massa**: selecione DFDs na tabela e aplique **repartição, prioridade, previsão ou fundamentação**
aos vários de uma vez (a antiga "aplicar repartição a todos" virou seleção + massa). **Banner do DFD AO LADO**
(mestre-detalhe): clicar num DFD abre o banner do DFD **ao lado** do banner do protocolo (não dentro) — no desktop
os dois ficam lado a lado e o principal desliza para a esquerda; no mobile o banner do DFD cobre a tela (um por
vez); trocar de DFD atualiza suave, fechar volta suave. **Clique na linha abre** em todas as tabelas de
DFD/protocolo (sem botão "Ver"). As **edições sobrevivem** ao envio (cache do parse por DFD). O sistema **separa as
vias e recusa documento errado**: protocolo (capa ou vários DFDs) não entra pela aba DFDs, DFD avulso não entra pela
aba Protocolos, e a repartição do protocolo é sugerida pelo **Interessado**. Setor **é** repartição (rótulo
unificado). Sem migração (usa `dfds.secoes`).

### Importação por botão único + tabelas que preenchem o display + polimentos — entregue
✅ **Um único botão "Importar"** à direita em cada tela (Protocolos, DFD, Planilha PCA) abre um **banner lançador**
(`Dropzone` reutilizável: **solte** o arquivo ou **clique** para escolher); no protocolo o banner é **dividido ao
meio** — importar arquivo **|** criar protocolo manualmente. Isso liberou espaço: as **tabelas de DFDs/Protocolos
(telas DFD e PCA)** agora **ajustam as linhas por página para preencher a altura do display** no desktop (`DataTable
fillHeight`, sem scroll vertical do navegador); as demais tabelas ficam em **≤20 linhas/página**. ✅ **Sidebar fixa**
(altura do display, com scroll interno na navegação se houver muitas abas). ✅ **Não protocola com erro:** o botão
"Protocolar" fica bloqueado enquanto houver DFD com erro. ✅ Com o **banner do DFD ao lado**, a tabela do protocolo
**se ajusta** para caber sem scroll lateral. ✅ Estado **"regularizado automaticamente" agora aparece em verde**.

### Editar DFD/protocolo já gravado (mesmo banner, com cadeado) + polimentos do banner — entregue
✅ Clicar num **DFD ou protocolo já gravado** abre o **mesmo banner da importação** (`DfdConferir` / `ProtocoloView`
editável), começando **travado**. Um **cadeado** ao lado do X **destrava** (com confirmação) e libera a edição; um
**"Salvar alterações"** grava **direto no banco** (repartição e seções do DFD; capa do protocolo) e reflete em todas
as telas. Só admin/gestor edita; escopo por repartição em toda escrita. ✅ O **banner flutuante trava o scroll da
página** (nada interage por trás). ✅ **Fechar o banner do DFD** agora é **animado e simétrico** ao abrir (sem corte).
✅ A tabela do protocolo **agrupa os DFDs por estado** (erros juntos, no topo, p/ tratar) — mudam de grupo ao mudar de
estado. ✅ A **barra de edição em massa** fica **fixa no rodapé** do banner, com tamanho constante (controle do valor
em cima; seletor + Aplicar + Limpar embaixo). ✅ O **dropdown de repartição** encolhe quando o banner do DFD abre ao
lado, para as colunas caberem sem corte. ✅ O banner do **protocolo gravado** usa a **mesma animação da importação**:
clicar num DFD abre-o **ao lado, à direita** (mestre-detalhe, mesmo componente/comportamento) — a única diferença é
o cadeado de edição.

### Repartições: número do interessado + responsáveis (padrões/temporários, nomeação, matrícula/função) — entregue
✅ A tela de **Repartições** (`/painel/reparticoes`, admin) permite **cadastrar o número do interessado** e os
**responsáveis por DFDs** de cada repartição: **vários padrões** + **vários temporários**. **Todo responsável** tem
**nome, matrícula e função** e uma **nomeação** — o ADM escolhe se é **portaria, decreto ou lei**, informa o número e
um **link** para o documento. O temporário tem, além disso, **início e fim**. Durante o período de um temporário,
**ele assume no lugar dos padrões** (os padrões ficam **em cinza**); fora do período, o temporário fica **em cinza** e
os padrões voltam a valer — com **estados** visuais (Agendado/Vigente/Encerrado). Guardado como **JSON** na coluna
`responsavel_dfd` (sem migração nova, com parse tolerante a TODOS os formatos anteriores). Componente
`ResponsaveisEditor` (campos compartilhados entre padrão e temporário) + lógica pura em `reparticao-responsaveis.ts`.

### DFD: assinatura digital (captura, conferência e verificação) — entregue
✅ O sistema agora **captura e salva** os dados de **quem assinou o DFD** — a página "Assinaturas Digitais" que
segue cada DFD no PDF traz **nome, e-CPF, usuário, data/hora e o código verificador** (ex.: `PBfGdg58teX`).
`extrairAssinaturas` (puro) lê essas linhas (tratando o código que quebra para a linha de baixo e **várias
assinaturas por página**); no protocolo elas são capturadas no **índice** e anexadas ao DFD anterior; guardadas em
`dfds.assinaturas` (JSON, migração `0018`). **O banner confere a assinatura**: o assinante tem de ser um
**responsável** cadastrado da repartição — um **padrão**, ou um **temporário** cujo **período cobre a data da
assinatura** (reusa o cadastro de Responsáveis). **Não deixa importar/protocolar** (nem editar um DFD já gravado)
com **assinatura não permitida**: PDF **sem assinatura bloqueia** (e trava o protocolo inteiro), repartição **sem
responsável cadastrado bloqueia**, assinante não autorizado bloqueia; `.xlsx` (sem assinatura) segue permitido.
A regra é a mesma no cliente e **reconferida no servidor** (`start-dfd` e `PATCH` ao trocar a repartição). O DFD
gravado mostra a seção **Assinaturas Digitais** (assinante, CPF, usuário, data, código) + o **responsável pela
solicitação** — quem **pediu a consolidação** no PCA (não quem autoriza) — com período e ato (Portaria/Decreto/Lei)
quando temporário, e **dois botões** `LinkExterno`: **Verificar autenticidade** (site oficial) e **Ver o ato de
nomeação** (link cadastrado). Puro/testável (`validarAssinatura`, `dataAssinaturaISO`) e catalogado no
`/design-system` (`LinkExterno`).

### DFD: tabelas multipágina (milhares de itens) + texto de apoio + 2º formato de assinatura — entregue
✅ **Correção crítica de perda silenciosa:** a tabela de itens de um DFD pode ocupar **dezenas de páginas** (ex.:
**692 itens em 29 páginas**). O parser antigo truncava na 1ª página **sem erro**. Agora o `parse-dfd-pdf-core` é
**100% ciente de página**: pula o cabeçalho do documento/coluna repetido a cada página, casa itens e valores por
`(página, y)` e preserva a ordem entre páginas — **captura TODOS os itens**. Uma **garantia anti-perda**
(`reconciliarItens`) exige numeração **contígua**; se sobrar buraco (leitura incompleta) o DFD **não é gravado pela
metade** (entra em "bloqueados" com os itens faltantes). O **texto de apoio** abaixo da tabela (estimativa) passou a
ser capturado e é exibido logo abaixo dos itens. Validado contra um protocolo real de **581 páginas / 104 DFDs**
(harness pdf.js): a grande maioria importa com contagem exata; os poucos com defeito de origem (item sem número no
PDF) são bloqueados com relatório claro. **2º formato de assinatura** ("Assinaturas Eletrônicas (Sistema)") passou a
ser lido além do "Certificado Digital", e as assinaturas que vêm em **páginas separadas** após o DFD são todas
acumuladas nele (192 assinaturas capturadas no protocolo real).

### Protocolo: Id da capa + conferência do Valor da capa × somatória + mini banners de cabeçalho — entregue
✅ **Id do processo:** a capa traz um **`Id:`** (ex.: `2273524`) além do Número Processo — agora é **lido, mostrado no
preview e salvo** ao protocolar (`dfd_protocolos.idExterno`, migração `0019`). **Preview = gravado:** o banner de
importação mostra **todos os dados da capa** iguais ao protocolo já gravado (Id, CPF/CNPJ, **Valor da capa**, Local).
**Conferência do valor (regras 3/4):** o **Valor da capa** é comparado com a **somatória dos valores dos DFDs** (o
valor de cada DFD é a **soma dos seus itens**); se **divergir**, aponta o erro e **trava a protocolação** — o usuário
**substitui a capa pela somatória** em um clique para liberar (`valoresBatem`, tolerância de 1 centavo; puro/testável).
`ProtocoloView` faz a mesma conferência (aponta; destravado, substitui). **Mini banners de cabeçalho (`StatMini`,
novo no DS):** um por informação, no **head** do DFD (**Total de itens** · **Valor total**) e do Protocolo (**Total de
DFDs** · **Total de itens** · **Somatória dos DFDs**), substituindo os cartões ad-hoc. **PREVISÃO "Anual" corrigida:**
a Seção 5 é **um OU outro** — uma **data** (`MÊS/AAAA`) **ou** recorrente **`ANUAL`** (agora **válido sem ano**; com ano
vira `ANUAL/AAAA`). Reconhece as várias escritas (`ANUAL(MENTE)`, `MENSAL(MENTE)`, `AO LONGO DO ANO`…) e **regulariza**
a que não estiver padronizada; o editor (mês + ano + `Anual`) deixa o usuário controlar sem bugs.

### Protocolo: capa IMUTÁVEL + trava por valor zerado/divergente — entregue
✅ **Os dados da capa não podem ser alterados em nenhum tempo:** no preview de PDF os campos da capa ficam **somente
leitura** (`disabled`/`readOnly`, via `origemPdf`) e no protocolo já gravado (`ProtocoloView`) são sempre read-only;
só a **repartição** (roteamento/escopo — não é dado da capa) continua editável (seletor obrigatório no import, cadeado
no gravado). O servidor reforça: `editarProtocoloSchema`/`atualizarProtocolo` só aceitam **repartição** (a capa é
imutável via API também). O **"criar manual" (sem PDF)** segue editável (o usuário está criando a capa, não alterando
uma lida). **Não protocola** com o **Valor da capa zerado/nulo** OU **diferente da somatória** dos valores dos DFDs —
divergência **trava** e o usuário **substitui** a capa pela somatória para liberar (a conciliação acontece uma única
vez, na importação, antes de gravar).

### Tabelas com ESTADO por linha + erros separados + filtros + relatório copiável — entregue
✅ **DFD (banner):** a tabela de **itens** ganhou uma coluna **Estado** por item (`Com erro` quando falta valor
unitário/quantidade), **filtro/ordenação em todas as colunas** e os **itens com pendência numa tabela separada**
(acima da de regulares). O **cabeçalho** do DFD passou a mostrar o **tipo** (badge **DFD-S/R/O/E**) e o **nº de
planejamento** ao lado do nº — as infos mais importantes. Quando o DFD tem erro, um botão **"Relatório de erro"** ao
pé do banner abre um `RelatorioErros` com **tudo listado para copiar**. **Protocolo (banner):** a **planilha de DFDs**
passou a ter exatamente **seleção · Estado · Situação · Nº DFD · Nº Plan. · Sigla · Tipo · Itens · Valor total** (nessa
ordem, larguras proporcionais, todas filtráveis); os **DFDs com erro** ficam numa **tabela separada**; o **head**
mostra **Id + Assunto** ao lado do nº; o **valor da capa faltando/zerado** é apontado e trava; e há o mesmo botão de
**relatório de erro** no rodapé. **Tela de DFDs → aba Protocolos:** a tabela ganhou **Estado** (integridade capa ×
somatória), **Situação** (tem DFDs?), **Id protocolo** e **Assunto**, e perdeu **Interessado** (redundante com
Repartição). Lógica pura/testável (`tipoCurtoDfd`, `itemComErro`/`estadoItem`, `estadoProtocolo`/`situacaoProtocolo`,
`linhasRelatorioDfd`/`linhasRelatorioProtocolo`); novo componente **`RelatorioErros`** catalogado.

### Cabeçalho FIXO dos banners + rodapés só-somatório + relatório em DESPACHO — entregue
✅ **Head no lugar certo:** o nº/tipo/planejamento do DFD e o nº/Id/Assunto do protocolo passaram para o **cabeçalho
FIXO** do banner (`Modal.cabecalho` = `DfdCabecalho`/`ProtocoloCabecalho`), sem repetir no corpo. **Rodapés
padronizados:** **toda** tabela do sistema mostra no rodapé **só os agregados das linhas** (nº de itens/DFDs +
**somatória dos valores**) — nunca texto de ajuda. **Mensagens cirúrgicas:** as pendências agora apontam
**exatamente** o erro (quais itens, qual seção) e **o que fazer** (`faltasCirurgicasDfd`); o **relatório do protocolo**
sai em **formato de DESPACHO de devolução** (`linhasRelatorioProtocolo`) pronto para devolver o processo para
correção. **Botões** do banner de protocolo **alinhados à direita**. `SECOES_OBRIGATORIAS` virou fonte única (reusada
por `faltasObrigatorias`). Puro/testável.

### Tabela de DFDs e banner de protocolo UNIFICADOS (um só componente) — entregue
✅ **Uma tabela de DFDs para tudo:** novo `PlanilhaDfds` (modelo `LinhaDfd`) é o **mesmo componente** que lista DFDs no
banner de importação, no banner do protocolo **gravado** e na **aba DFDs** — mesmas colunas (Estado · Situação · Nº
DFD · Nº Plan. · Sigla · Tipo · Protocolo · Itens · Valor · ações; as opcionais só aparecem quando há dado), mesma
**separação dos DFDs com erro** numa tabela à parte e mesmo **rodapé de somatório**. **Uma grade de capa para tudo:**
`CapaCampos` (a mesma grade de campos da capa) é usada no import e no gravado. **Banner do protocolo gravado = o do
preview** (CapaCampos + StatMini + conciliação + PlanilhaDfds), só adicionando o **cadeado**. Removidas as
tabelas/colunas duplicadas (`colsDfd`, o `cols` inline do protocolo e a tabela simples do `ProtocoloView`) — sem código
morto. Ambos catalogados.

### DFD → PCA (importar DFDs e compilar edições) — entregue
✅ Aba **PCA** (`/painel/pca`) com 3 abas: **Planilha** (fluxo achatado atual, intacto) · **DFDs** (importa o formulário DFD `.xlsx` no navegador via `parse-dfd`, vincula à repartição por auto-match da sigla do Setor Requisitante, lista/visualiza a tabela do DFD) · **PCA** (une DFDs selecionados numa **edição gerada e salva**, ex.: "PCA 2026", e mostra a compilação organizada por repartição). Escopo **por repartição** (como as `unidades`); sem `grupo_id`. Tabelas `dfds`/`dfd_itens`/`pcas`/`pca_dfds` (migração `0012`). Rotas `POST /api/dfd`, `DELETE /api/dfd/[id]`, `POST /api/pca`, `DELETE /api/pca/[id]`.

### DFD/Protocolo: ano do PCA (obrigatório) + referências de renovação (DFD-R) — entregue
✅ **Ano do PCA** gravado no protocolo e em cada DFD (`ano_pca`, migração `0021`). O sistema **adivinha o ano** pela
descrição (`anoPcaDoTexto`) e o usuário **confirma/escolhe** no **`PcaPicker`** (novo componente do DS — `select` dos
PCAs **cadastrados em Configurações**; guarda o **ano**). **Obrigatório:** não se protocola nem se importa DFD avulso
sem PCA definido (cliente desabilita o botão; servidor rejeita 422). **Todos os DFDs do protocolo herdam** o ano do
PCA do protocolo no envio. Nos **DFD-R** (renovação), `referenciasRenovacao`/`extrairRefsDfd` separam **nº de contrato,
ata (registro de preços) e licitação** (`numero_contrato`/`numero_ata`/`numero_licitacao`) para campos próprios; o
`DfdConferir` mostra o bloco **Referências da renovação** (editável) e, sem nenhuma referência, um **aviso não-bloqueante**
(aponta, não trava — preenchível à mão, inclusive num DFD gravado via `PATCH /api/dfd/[id]`). `DfdView` exibe o **Ano
do PCA** e as referências; `ProtocoloView` exibe o **PCA (ano)**. `anoPca`/PCAs threadados da página → `DfdsView` →
forms. Só componentes do design-system (catalogado). Testes de schema (anoPca/refs) + migração `0021`.

### DFD-R sem referência: estado de ATENÇÃO + tabela própria + relatório opcional — entregue
✅ O DFD-R sem contrato/ata/licitação vira **estado "atenção"** (`EstadoDfd.atencao`, âmbar `--warn`, precedência
erro > atenção > editado > regularizado > regular; `dfdRSemReferencia` puro). **Não bloqueia.** O `PlanilhaDfds`
**separa os DFDs em atenção numa tabela própria** (entre erro e regulares) em TODA lista — importação, protocolo
gravado e aba DFDs (por isso `DfdResumo`/`ProtocoloVisualDfd` passaram a carregar as refs). No import, o usuário
**escolhe incluir** os DFD-R em atenção no **relatório/despacho** (`RelatorioErros` ganhou um `toggle` opcional; o
botão de relatório aparece também quando só há atenção). Mensagem de atenção no `DfdConferir`/`DfdView`. Testes de
`dfdRSemReferencia`/`estadoDfd`. Reuso total (só componentes do DS; catalogado).

### Configurações do ADM: tela única (identidade do site + cadastro de PCAs + atalhos) — entregue
✅ Nova tela **`/painel/configuracoes`** (`ConfiguracoesAdmin`, admin) — ponto único de controle, reunindo **o novo + atalhos**. Abas: **Identidade** (definir **nome, subtítulo e favicon** do site — salvos no slot `identidade` já existente via `PATCH /api/admin/aparencia`; favicon rasterizado p/ PNG ≤64px no cliente), **PCAs** (cadastrar PCA por **nome + ano**, editar, **marcar 1 como ativo/vigente**, excluir — `/api/admin/pcas` + `/api/admin/pcas/[id]`, `exigirAdmin`) e **Mais** (`LinkCard` → aparência/repartições/grupos/permissões/usuários). A **identidade agora renderiza** de fato: `generateMetadata` (aba/favicon), `Brand` do `AppShell` (logo+nome+subtítulo) e o cabeçalho público (`/`) — tudo via `getAparencia()` (cache 60s) com **fallback** aos textos padrão. PCA ganhou a coluna **`ativo`** (migração `0020`) e o **registro leve** (só nome+ano, sem unir DFDs — `gerarPca` intacto); badge **"Ativo"** no módulo PCA. Nav "Configurações" (`IconSettings`) no topo de Administração. Só componentes do design-system (catalogado).

### Avaliação configurável pelo ADM (Protocolo / DFD / Item) — entregue
✅ Nova aba **Avaliação** em `/painel/configuracoes` (`AvaliacaoAdmin`, admin) — **controle total** de importação de DFD, correção de itens e protocolação. Para **cada dado** de Protocolo/DFD/Item o ADM define: o **nível** (**fundamental** bloqueia · **intermediário** só avisa/ATENÇÃO âmbar · **automático** corrige sozinho · **ignorar**); se o campo é **editável pelo usuário na análise** (`editaveis`/`editavelDe` → trava o controle no `DfdConferir`); e as **palavras-chave do ajuste automático** (`sinonimos`/`aplicarSinonimos` → no nível automático, um termo troca o texto todo da seção, dentro de `normalizarSecoesDfd`). Com **exceções de nível por tipo de DFD** (DFD-S/R/O/E, **fixos**) e por **categoria de Protocolo** (INCLUSÃO/EXCLUSÃO/ALTERAÇÃO NÃO ONEROSA, **fixas** — `classificarAssunto`). Núcleo puro/testável `avaliacao-core.ts` (catálogo `CATALOGO_AVALIACAO` = fonte única de UI/defaults/validação), loader cacheado `avaliacao.ts`, schema `avaliacao-validation.ts`, rota `/api/admin/avaliacao` (linha `configuracoes` id=1, chave `avaliacao`, **sem migração**). Toda a validação existente passou a **respeitar as regras**, com **defaults idênticos ao comportamento atual** (invariante coberto por teste). Regras threadadas server→cliente e reconferidas no servidor. Só componentes do design-system (catalogado). Permanecem **travados** (estrutural): integridade de parse, tetos do Zod, acesso por repartição, capa imutável.

### DFD/Protocolo: detalhe do item ao lado + seleção marcada (mestre-detalhe) — entregue
✅ **Clicar numa linha de item** da Seção 4 do DFD abre o **`ItemDetalhe`** (todas as infos do item + estado) no
**MESMO painel da direita** usado pelas mensagens (o painel mostra mensagens OU o item — estado único `PainelDfd`).
E a **seleção da esquerda fica MARCADA**: no protocolo, o **DFD aberto** é destacado na tabela de DFDs; no DFD, o
**item aberto** é destacado na tabela de itens — os dados da direita sempre representam a seleção à esquerda
(mestre-detalhe profissional). `DataTable` ganhou **`activeKey`** e `PlanilhaDfds` **`ativa`** (linha ativa destacada
com barra de acento). Reuso total (tokens, `Modal.lateral`/`lateral2`); catalogado (`ItemDetalhe`); sem migração.

### DFD: painel LATERAL de mensagens (erro/atenção/acerto) navegável — entregue
✅ As mensagens de conferência **saíram do corpo** do banner do DFD para um **painel lateral** (`MensagensDfd`).
`mensagensDfd` (puro, `dfd-tratamento`) monta a lista **COMPLETA** — erro/atenção/**acerto**, sem exceção (só omite
pontos "ignorar" do ADM) — cada uma com uma **âncora** (id do componente no banner, via `data-ancora`). O botão
**`BotaoVerMensagens`** (Ver/Ocultar + numeração por status) fica no **RODAPÉ FIXO** do banner do DFD, **à esquerda do
Fechar**. Ao abrir, um **novo banner** de mensagens surge **AO LADO DIREITO** do DFD (mesma animação), ficando **ambos
manipuláveis** (o DFD NÃO é substituído): no **DFD avulso/gravado solto** = 2 painéis (`Modal.lateral`); **dentro de um
protocolo** = **3 painéis proporcionais** (protocolo | DFD | mensagens) via o novo **`Modal.lateral2`** (colunas do grid
animadas; 1 por vez no mobile). **Clicar numa mensagem** rola o DFD (que segue ao lado) até a âncora e a **destaca na
cor do status**. `mensagensDoDfd` (exportado de `DfdConferir`, confere a assinatura) é a fonte única; "Copiar pendências"
reusa `linhasRelatorioDfd`. Reuso total (tokens); catalogado; testes de `mensagensDfd`. Sem migração.

### Órgão › Unidade: hierarquia, identificação por matchers e renomeação — entregue
✅ **Rename UI-only** "Repartição" → **"Unidade"** (o código/tabela seguem `reparticao*`). Nova entidade **Órgão**
(`orgaos`, migração `0022`) **acima** da unidade — tela `/painel/orgaos` (`OrgaosAdmin`) + `/api/admin/orgaos*`; toda
unidade tem **órgão** (`reparticoes.orgao_id`). Migração **aditiva** que **preserva o legado** (semeia a Prefeitura e
vincula as unidades atuais). **Identificação configurável:** o **Interessado** do protocolo casa a unidade pelo **número**
cadastrado (`numero_interessado`), o **Setor Requisitante** do DFD casa a unidade (`setor_requisitante`), e o
**Órgão/Entidade** do DFD casa o órgão (`orgaos.orgao_entidade`) — tudo no ponto único puro `reparticao-match.ts`
(`casarUnidade`/`casarUnidadePorInteressado`/`casarOrgao`), com **invariante testado** (campos vazios ⇒ igual a hoje).
**Divergência Órgão × Unidade** (item 6.3) vira **atenção âmbar configurável** (`dfd.orgaoUnidadeDivergente`, padrão
intermediário) — Callout no `DfdConferir` + mensagem no painel; o servidor só bloqueia se elevada a fundamental.
Ordenação das listas admin trocou o **arrasto** (`ReorderTable` removido) por **botões ↑/↓** no `DataTable` (reusa
`PATCH .../ordem`). **"Geral"** virou **virtual** (todas as unidades; escondida do CRUD, não editável, concedível por
grupo). Testes de matchers/divergência + preservação do legado na cadeia de migrações. Sem quebrar nada.

### Órgão › Unidade: navegação em drill-down (Órgãos → Unidades do órgão) — entregue
✅ Reorganização da administração: **um** item de nav **"Órgãos e Unidades"** (`/painel/orgaos`). **Clicar num órgão**
abre `/painel/orgaos/[id]` = as **Unidades daquele órgão** (`ReparticoesAdmin` escopado; herda `orgao_id` do escopo,
sem seletor de órgão). A tela solta **`/painel/reparticoes` foi removida**; o `GET /api/admin/reparticoes?orgaoId=`
filtra por órgão. `OrgaosAdmin` ganhou `onRowClick`; `ReparticoesAdmin` ganhou cabeçalho com nome do órgão + voltar.
Referências atualizadas (`AppShell`, `ConfiguracoesAdmin`, `logicas.ts`). Sem código morto (coluna/select de órgão
removidos por redundância), responsivo, componentes do DS. Lint/testes verdes.

### Órgão: assinatura ÚNICA (uma para todas as unidades) ou por unidade — entregue
✅ Cada **órgão** configura (`Segmented` no `OrgaosAdmin`) se a **assinatura (responsáveis por DFDs)** é **uma para
todas as unidades** — definida no próprio órgão com o **mesmo `ResponsaveisEditor`** — ou **por unidade** (padrão,
como antes). Migração `0023` (aditiva): `orgaos.assinatura_unica` + `orgaos.responsavel_dfd`. A resolução é **pura e
única** (`responsaveisEfetivos`) aplicada nos dois pontos que carregam responsáveis (`carregarResponsaveis` servidor +
`responsaveisPorReparticao` cliente, com `leftJoin` no órgão) → toda a conferência de assinatura passa a usar os
responsáveis certos **sem tocar** `validarAssinatura`/`DfdConferir`/`POST /api/dfd`. No `ReparticoesAdmin`, quando o
órgão é "única", o editor da unidade é substituído por uma nota; coluna **"Assinatura"** (Única/Por unidade) na lista
de órgãos. `responsaveisSchema` compartilhado (unidade+órgão). Testes puros de `responsaveisEfetivos` + migração `0023`.

### Fase 4 (Design System + Personalização do ADM) — entregue / em propagação
✅ **Design System por tokens** — tema por `data-theme`, fonte **Geist**, biblioteca única em
**`/design-system`** (Button, StatusTag, KpiStat, Segmented, FilterChip, Dropdown, ColorField
[conta-gotas+swatches], PeriodoPicker, MultiSelectHeader, Tabs [swipe], Toast, DataTable
[seleção+filtro], ícones) + **Theme Playground** + preview mobile · ✅ **Home pública
redesenhada** (tokens/Geist) · ✅ **Painel de Aparência do ADM** (`/painel/aparencia`):
cores claro/escuro, raio, densidade, motion, presets; **persistido no D1** e **injetado sem
flash** (anti-XSS) · ✅ **Chrome do painel** (AppShell/nav/inputs) por token · 🔨 Propagação do
redesign ao conteúdo das telas logadas (Protocolos [status ✅], Dashboard, Usuários, Ferramentas).
Regras em [../CLAUDE.md](../CLAUDE.md); a `/design-system` é a **fonte única** de componentes.

---

## 1. Acesso, Usuários e Equipe (Fase 1 — continuar)
| | Item |
|---|---|
| ✅ | Login, cadastro, sessão, aprovação de cadastros pelo admin |
| ✅ | **Perfil do usuário**: editar nome, e-mail, **matrícula**, trocar senha e **foto** (base64, redimensionada no cliente) — a foto reflete no avatar do menu. Admin edita esses dados em Usuários. |
| 🔜 | **Times/Secretarias**: vincular usuários a setores; filtrar dados por time (dados separados por equipe) |
| 🔜 | **Permissões finas** (RBAC): níveis de acesso configuráveis → telas por equipe |
| 💡 | Convite por e-mail · Recuperação de senha · 2FA · Login Google (SSO) |
| 💡 | **Auditoria**: registro de quem fez o quê (login, edições, exclusões) |

## 2. Gestão de Protocolos (o "coração" do plano) 🔨
Digitalizar a planilha de controle (aba *Distribuição de Protocolos*). Ver [PROTOCOLOS.md](./PROTOCOLOS.md).
| | Item |
|---|---|
| ✅ | **Construtor de tabelas**: várias listas (cards), criar/renomear/excluir |
| ✅ | **Colunas personalizáveis** por tipo (texto/seleção/data/número); opções cadastráveis na tela |
| ✅ | **Edição na própria linha** (data padrão = hoje); busca + paginação; badges coloridos |
| 🔜 | **Importar** a aba "Distribuição de Protocolos" (.xlsx) para uma tabela |
| 💡 | Alertas de vencimento/SLA · Anexos · Comentários · Histórico de alterações |

## 3. Compilado PCA / Contratações (dashboard — expandir) 🔨
| | Item |
|---|---|
| ✅ | Importar `.xlsx`, KPIs, gráficos, consulta de itens com filtros |
| 🔜 | **Editar itens na plataforma** (sem reimportar) + histórico de versões |
| 🔜 | Vincular itens do PCA a protocolos/contratações |
| 💡 | Comparativo entre anos · Metas · Execução vs. planejado |

## 4. Orçamento PCA 🔜
| | Item |
|---|---|
| 🔜 | Orçamento por secretaria/unidade: **planejado × contratado**, % de execução |
| 🔜 | Tabela comparativa (como no sistema de referência) e diferença/saldo |
| 💡 | Importar a aba de orçamento · Alertas de estouro |

## 5. Comunicações Internas 🔜
| | Item |
|---|---|
| 🔜 | Mural/avisos internos · Comunicações vinculadas a um protocolo |
| 💡 | Notificações in-app (sino) · E-mail · Menções (@) |

## 6. Gestão de Riscos 🔜
| | Item |
|---|---|
| 🔜 | Matriz de riscos (probabilidade × impacto) por protocolo/contratação |
| 💡 | Planos de mitigação, responsáveis e acompanhamento de status |

## 7. Documentos / Drive 🔜
| | Item |
|---|---|
| 🔜 | Upload e organização de documentos (por protocolo/unidade) — usa R2 |
| 💡 | Modelos e geração: "Gerar PCA", Declarações, ofícios (como a referência) |

## 8. Relatórios & Exportação 🔜
| | Item |
|---|---|
| 🔜 | Exportar Excel/CSV das consultas · Exportar gráficos em PNG |
| 🔜 | Gerar PDF (relatório analítico, "Gerar PCA", declaração) |
| 💡 | Relatórios agendados/por e-mail |

## 9. Notificações 💡
E-mail e/ou in-app para: prazos de protocolo, cadastro pendente para o admin, atribuição de tarefa, estouro de orçamento.

## 10. Administração & Configurações 🔨
| | Item |
|---|---|
| ✅ | Gestão de usuários (aprovar, papel, ativar/excluir) |
| ✅ | **Aparência (Personalização §39)**: Design Tokens + painel do ADM (`/painel/aparencia`) — cores/raio/densidade/motion + presets, persistido no D1 e injetado sem flash |
| ✅ | **Configurações (`/painel/configuracoes`)**: tela única do ADM — **identidade do site** (nome/subtítulo/favicon, renderizados), **cadastro de PCAs** (nome+ano, editar, marcar ativo, excluir) e **atalhos** para as telas admin |
| ✅ | **Avaliação configurável** (aba Avaliação): níveis (fundamental/intermediário/automático/ignorar) por dado de Protocolo/DFD/Item, com exceções por tipo de DFD e categoria de protocolo |
| 🔜 | Mais configurações da plataforma (secretarias/listas padrão, exercícios) |
| 💡 | Painel de auditoria e uso |

## 11. Qualidade / Transversal
| | Item |
|---|---|
| ✅ | Responsivo + toque + tema claro/escuro |
| ✅ | **Testes** (`node:test`) + **lint** (Biome) + **type-check** com **portão de qualidade na CI** (`ci.yml`/`deploy.yml`); error boundaries (`error.tsx`/`not-found.tsx`); observabilidade do Worker. Regras em [CLAUDE.md](../CLAUDE.md). |
| 🔜 | Tornar o type-check **bloqueante** (hoje informativo) quando o baseline de tipos estiver limpo |
| 🔜 | Deploy via **Workers Builds** (evita quebra quando um token é revogado) |
| 💡 | **PWA** (instalar no celular) · Acessibilidade (WCAG) · Backups do D1 |

---

## Ordem sugerida
1. **Fechar a Fase 1**: times + permissões + perfil + auditoria.
2. **Protocolos** (o núcleo do plano): CRUD + importação + fluxo.
3. **Orçamento** + **Relatórios/Exportação**.
4. **Comunicações** + **Notificações** + **Riscos**.
5. **Documentos/Drive** + extras (SSO, PWA, backups).

> Cada item é entregue de forma incremental e aditiva (sem quebrar o que já existe),
> com commit + deploy + verificação a cada passo.
