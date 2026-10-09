/**
 * Catálogo NARRATIVO das lógicas do sistema (fonte única em pt-BR de administrador).
 * Puro/testável (sem `getDb`). Alimenta a aba "Referência" das Configurações — uma
 * listagem READ-ONLY de como o sistema se comporta, para a equipe que não lê o
 * `CLAUDE.md`. Os itens ESTRUTURADOS (níveis, estados, tokens…) NÃO ficam aqui: são
 * renderizados DERIVADOS dos `export const` reais (sempre em sincronia). Aqui ficam só
 * os FLUXOS que não têm um rótulo único no código.
 */

export type DominioLogica =
  | "importacao"
  | "protocolo"
  | "avaliacao"
  | "estados"
  | "normalizacao"
  | "assinatura"
  | "pca"
  | "acesso"
  | "identidade"
  | "tecnico";

export const DOMINIOS: { key: DominioLogica; label: string; resumo: string }[] = [
  { key: "importacao", label: "Importação & DFD", resumo: "Como os DFDs entram (.xlsx/.pdf), são lidos e conferidos." },
  { key: "protocolo", label: "Protocolo", resumo: "O processo que empacota vários DFDs, a capa e a protocolação." },
  { key: "avaliacao", label: "Avaliação", resumo: "O que bloqueia, o que só avisa e o que é automático (definido pelo ADM)." },
  { key: "estados", label: "Estados & Situações", resumo: "Os estados de DFD, item e protocolo e suas cores." },
  { key: "normalizacao", label: "Normalização", resumo: "Padronização automática de prioridade, previsão e valores." },
  { key: "assinatura", label: "Assinatura digital", resumo: "Captura e conferência da assinatura contra os responsáveis." },
  { key: "pca", label: "PCA", resumo: "Edição consolidada, registro leve e o PCA vigente." },
  { key: "acesso", label: "Acesso & RBAC", resumo: "Grupos, permissões, repartições e papéis." },
  { key: "identidade", label: "Identidade & Aparência", resumo: "Nome/subtítulo/favicon do site e a personalização visual." },
  { key: "tecnico", label: "Técnico", resumo: "Limites, segurança e minúcias de implementação." },
];

export type LogicaRef = {
  id: string;
  dominio: DominioLogica;
  titulo: string;
  descricao: string;
  detalhes?: string[];
  /** Arquivo/where de origem (informativo, muted). */
  fonte?: string;
  /** Item muito interno — agrupado no domínio "Técnico". */
  tecnico?: boolean;
  /** Onde o ADM ajusta isto (rótulo sempre; href só quando é uma rota própria). */
  configuravelEm?: { rotulo: string; href?: string };
};

export const LOGICAS: LogicaRef[] = [
  // ---- Importação & DFD ----
  {
    id: "imp-formatos",
    dominio: "importacao",
    titulo: "Importa DFD em .xlsx E em .pdf",
    descricao:
      "O DFD (Documento de Formalização da Demanda) é lido no navegador. Aceita a planilha .xlsx e o PDF; o cabeçalho e as seções são compartilhados entre os dois formatos e produzem o mesmo resultado.",
    detalhes: [
      ".xlsx: tabela lida por coluna da matriz; números pelo valor da célula (não pelo texto formatado).",
      ".pdf: tabela lida pela GRADE desenhada (cada célula tem borda); sem grade, pela posição de coluna.",
    ],
    fonte: "parse-dfd / parse-dfd-pdf / parse-dfd-comum",
  },
  {
    id: "imp-captura-itens",
    dominio: "importacao",
    titulo: "Captura exata dos itens: código, descrição, unidade e valores",
    descricao:
      "Cada trecho do PDF cai na célula (linha × coluna) desenhada da tabela — o código, a descrição e os valores vão sempre para o item certo, mesmo com descrição de dezenas de linhas, linha em branco ou célula que atravessa a página. O texto sai limpo.",
    detalhes: [
      "Código = só os dígitos, na ordem: o código quebrado em 2 linhas (\"524194727\" + \"0\") vira 5241947270; zero à esquerda preservado.",
      "Descrição sem marcadores de lista (•, ▪, ➢, ✓…), TAB, espaço duro e caracteres invisíveis; ², °, ®, § ficam.",
      "Unidade e valores quebrados em 2 linhas são juntados antes de converter; \"1.000\" é mil; uma célula com dois números (\"100 200\") fica vazia para conferência — nunca um valor inventado.",
      "O total acima de R$ 10 milhões, que o Centi quebra em 2 linhas, é lido inteiro (sem desligar a leitura pela grade).",
      "Uma linha da descrição que cita o rodapé, o total ou o cabeçalho (\"CENTÍMETROS…\", \"O VALOR TOTAL…\") não some; o rodapé do Centi sai em qualquer posição.",
      "Símbolo de fonte Symbol/Wingdings: ±, ≥, °, µ… voltam ao caractere real; marcadores de lista (⧫, ●, ❖, ➢, ✓) saem da descrição.",
    ],
    fonte: "grade-pdf / parse-dfd-pdf-core / parse-dfd-comum",
    tecnico: true,
  },
  {
    id: "imp-multipagina",
    dominio: "importacao",
    titulo: "Tabela de itens multipágina (milhares de itens)",
    descricao:
      "Uma tabela de itens pode ocupar dezenas de páginas e um único item ter descrição que atravessa páginas. O leitor é 100% ciente de página: pula o cabeçalho do documento repetido, só encerra a tabela numa seção à margem esquerda e liga a descrição que 'virou a página' ao item anterior.",
    detalhes: ["Validado em um protocolo real de 581 páginas / 104 DFDs (104/104 importam)."],
    fonte: "parse-dfd-pdf-core",
    tecnico: true,
  },
  {
    id: "imp-buracos",
    dominio: "importacao",
    titulo: "Buracos na numeração dos itens são normais",
    descricao:
      "A coluna ITEM pode pular números (itens removidos/fracassados) com os códigos ainda sequenciais. Isso NÃO é erro e não bloqueia — o sistema só aponta os números pulados numa nota informativa abaixo da tabela.",
    fonte: "buracosSequencia (parse-dfd-comum)",
  },
  {
    id: "imp-automatch",
    dominio: "importacao",
    titulo: "Previsão da unidade pela assinatura",
    descricao:
      "Ao importar, o DFD identifica o ÓRGÃO pelo campo 'Órgão/Entidade' e prevê a UNIDADE pelo assinante — o responsável cadastrado que assinou o DFD (qualquer formato de assinatura). Sem previsão, a unidade fica obrigatória e o usuário escolhe no banner.",
    fonte: "preverUnidadeDoDfd (reparticao-match)",
    configuravelEm: { rotulo: "Unidades", href: "/painel/orgaos" },
  },
  {
    id: "imp-conferir",
    dominio: "importacao",
    titulo: "Confere no banner e só grava ao confirmar",
    descricao:
      "Ao importar (ou clicar em 'Ver'), o DFD aparece completo num banner. O usuário confere a repartição e trata as seções; nada é gravado até confirmar. O mesmo componente é usado no import avulso e por DFD dentro do protocolo.",
    fonte: "DfdConferir",
  },
  {
    id: "imp-refs-renovacao",
    dominio: "importacao",
    titulo: "DFD-R: várias referências de renovação",
    descricao:
      "Um DFD de renovação pode citar VÁRIOS contratos, ARPs e licitações: o sistema lê todas as menções do documento e o usuário edita a lista (um valor por chip) no bloco 'Referências da renovação'. DFD-R sem nenhuma referência fica em ATENÇÃO (não bloqueia).",
    fonte: "referenciasRenovacao / listaRefs (parse-dfd-comum)",
  },

  // ---- Protocolo ----
  {
    id: "proto-empacota",
    dominio: "protocolo",
    titulo: "Um protocolo empacota vários DFDs",
    descricao:
      "O protocolo é o 'processo' administrativo que agrupa vários DFDs (escala a milhares). Todo DFD vem de um protocolo. A leitura do PDF é feita em 2 passos, sem estourar memória: um índice leve primeiro; o parse completo, DFD a DFD, só ao protocolar.",
    fonte: "protocolo / parse-protocolo-pdf",
  },
  {
    id: "proto-capa-imutavel",
    dominio: "protocolo",
    titulo: "Identificadores da capa são IMUTÁVEIS",
    descricao:
      "Número, Id, data e ano do PCA do protocolo não podem ser editados em nenhum momento. Os campos de conteúdo da capa (interessado, assunto, observação, CPF/CNPJ, valor da capa e local) têm cadeado POR CAMPO — na análise e no protocolo gravado. A unidade (roteamento) segue editável.",
    fonte: "editarProtocoloSchema / CapaCampos",
  },
  {
    id: "proto-capa-valor",
    dominio: "protocolo",
    titulo: "Conciliação do valor da capa × somatória dos DFDs",
    descricao:
      "O valor da capa é conciliado com a somatória dos valores dos DFDs (tolerância de 1 centavo) na análise E no protocolo gravado: capa zerada/nula OU diferente da somatória é apontada, e 'Substituir pela somatória' corrige num clique. Por padrão, não se protocola com a capa divergente.",
    fonte: "conciliacaoCapa (dfd-tratamento)",
    configuravelEm: { rotulo: "Avaliação (protocolo.valorCapa)" },
  },
  {
    id: "proto-sem-erro",
    dominio: "protocolo",
    titulo: "Não protocola com DFD ou item com erro — nada fica para trás",
    descricao:
      "O botão 'Protocolar' fica desabilitado enquanto algum DFD do envio estiver com erro — o erro é o que a importância de cada ponto de DFD e de ITEM manda bloquear (valor unitário, quantidade, catálogo…) —, ainda em análise, com a assinatura em leitura ou com o catálogo sem conferir. A regra é FIXA: a protocolação nunca pula um DFD; só fica fora o que o usuário tirou do envio (Excluir do protocolo, Manter o existente, escolha do duplicado). O relatório de devolução sai em formato de DESPACHO, pronto para devolver o processo para correção.",
    detalhes: [
      "DFD duplicado com o MESMO nº sem escolha é sempre erro (só um por nº é gravado — o outro ficaria para trás).",
      "DFDs além do teto da análise (300) são analisados ANTES de gravar; sem erro, a protocolação segue sozinha ao terminar.",
      "Itens não conferidos no catálogo por falha de rede (quando o catálogo bloqueia) travam até 'Conferir de novo'.",
      "Falha de GRAVAÇÃO (rede/servidor) deixa a protocolação INCOMPLETA: o aviso lista os DFDs não gravados; complete pelo 'Reenviar protocolo'.",
    ],
    fonte: "ProtocoloUploadForm (semErroBloqueia, dupNivel, protocolarAposAnalise) / avaliarLinhaDfd / linhasRelatorioProtocolo",
    configuravelEm: { rotulo: "Avaliação (importâncias dos pontos de DFD e Item)" },
  },
  {
    id: "proto-duplicados",
    dominio: "protocolo",
    titulo: "DFDs duplicados no PDF: comparar e escolher",
    descricao:
      "Dois ou mais DFDs do mesmo PDF com o mesmo nº de DFD ou de planejamento ficam 'DFD duplicado'. O botão 'Duplicados' no banner do DFD compara o aberto com cada duplicado, campo a campo (com as páginas do PDF, itens e valor), e 'Manter este' escolhe o que segue: os que conflitam com ele são descartados (fora da somatória e da protocolação; dá para trocar ou restaurar) e o erro some antes de protocolar.",
    detalhes: [
      "A escolha descarta só quem conflita DIRETAMENTE com o escolhido (um DFD ligado apenas a um descartado continua).",
      "Sem a escolha e com o ponto sem bloquear, do mesmo nº de DFD só um é gravado — o outro é relatado, nunca sobrescreve em silêncio.",
    ],
    fonte: "duplicadosDfds / compararDuplicados / ComparacaoDuplicados",
    configuravelEm: { rotulo: "Avaliação (protocolo.dfdDuplicado)" },
  },
  {
    id: "proto-excluir-dfd",
    dominio: "protocolo",
    titulo: "Excluir DFDs do protocolo antes de protocolar",
    descricao:
      "Na análise do PDF do protocolo, 'Excluir do protocolo' (no rodapé do DFD ou em massa na seleção) tira o DFD do envio: fica 'Excluído' (cinza, na tabela 'DFDs fora do envio'), não é gravado, sai da somatória da capa e deixa de bloquear a protocolação. 'Restaurar' (no DFD) ou 'Restaurar excluídos' traz de volta.",
    detalhes: [
      "Na importação nada é apagado do banco: o DFD já cadastrado de mesmo nº continua como está — e segue na somatória quando é deste processo (seja qual for o botão que tirou o do PDF do envio).",
      "Ao voltar ao envio ('Restaurar' ou 'Manter este'), a assinatura achatada que a análise pulou é lida por OCR — o DFD fica pendente e a protocolação espera.",
      "No reenvio (sobrescrever o protocolo gravado), excluir tira o DFD do processo: o gravado de mesmo nº vai para a lista 'fora do envio' do topo (Excluir, padrão, ou Manter).",
      "Excluir um dos DFDs duplicados resolve o par (o outro segue).",
    ],
    fonte: "ProtocoloUploadForm (excluirDfds / restaurarExcluidos) · foraDoEnvio",
  },
  {
    id: "proto-copiar-celula",
    dominio: "protocolo",
    titulo: "Copiar o valor da célula (nº do protocolo sem o ano)",
    descricao:
      "Em toda tabela, um ícone discreto ao lado do valor copia o nº do protocolo SEM o ano (\"144756/2026\" → \"144756\"), o Id do protocolo, o nº do DFD, o nº de planejamento, o código e a descrição do item. Na visão Consolidada, as células com vários valores copiam todos unidos por \":\" (o formato que a busca dos filtros aceita).",
    detalhes: [
      "O ícone fica sempre à vista, discreto (mais forte com o mouse na linha); no celular fica afastado do valor — tocar no valor abre a linha, tocar no ícone copia.",
    ],
    fonte: "CelulaCopiavel · numeroSemAno / juntarParaCopiar (format)",
  },
  {
    id: "proto-vias",
    dominio: "protocolo",
    titulo: "Separação das vias (protocolo × DFD avulso)",
    descricao:
      "O sistema classifica o PDF: um protocolo (com capa OU 2+ 'Número DFD') não entra pela aba DFDs, e um DFD avulso não entra pela aba Protocolos. Documento estranho é recusado.",
    fonte: "classificarPdf (parse-protocolo-pdf-core)",
  },
  {
    id: "proto-gestao",
    dominio: "protocolo",
    titulo: "Responsável, Distribuição e Data da protocolação",
    descricao:
      "RESPONSÁVEL = a pessoa designada para cuidar do protocolo, marcada no dropdown da própria célula da Mesa (ou na edição em massa). Ao protocolar, entra o responsável PADRÃO que quem protocola escolheu no Perfil — só num protocolo ainda sem responsável (a sobrescrita/reenvio mantém o designado). DISTRIBUIÇÃO = quem protocolou (o usuário logado). DATA = a data da protocolação.",
    fonte: "iniciarProtocolo (protocolo) / preferências do Perfil",
    configuravelEm: { rotulo: "Perfil → Protocolação", href: "/painel/perfil" },
  },
  {
    id: "proto-pessoas",
    dominio: "protocolo",
    titulo: "Responsável só entre as pessoas do grupo; foto + apelido nas colunas",
    descricao:
      "O responsável de um protocolo é escolhido SÓ entre as pessoas ativas do GRUPO ATIVO de quem está na Mesa (sem grupo, todas as pessoas ativas) — na célula, na edição em massa e no responsável padrão do Perfil; o servidor recusa outra pessoa. Um responsável já gravado que hoje é de outro grupo continua aparecendo, mas não pode ser re-escolhido. As colunas Responsável e Distribuição mostram a FOTO e o APELIDO (nome completo no passar do mouse) e o seletor de pessoa lista a foto e o apelido de cada um, com busca.",
    fonte: "listarPessoasDoGrupo / pessoaDoGrupo (usuarios) + PessoaTag + SeletorPessoa",
    configuravelEm: { rotulo: "Grupos", href: "/painel/grupos" },
  },
  {
    id: "proto-sobrescrita",
    dominio: "protocolo",
    titulo: "Sobrescrever um DFD: escolha dado a dado",
    descricao:
      "Não existem dois DFDs com o mesmo número: um DFD importado de novo SOBRESCREVE o cadastrado. Antes de gravar, o painel 'Diferenças' compara o gravado com o arquivo novo e, em CADA diferença (campo do cabeçalho, seção, assinaturas, item novo/alterado/removido), o usuário escolhe 'Manter gravado' ou 'Usar novo' (ou 'todos' por bloco); o DFD ao lado já mostra o resultado e pode ser editado. O botão 'Sobrescrever DFD' fica no banner do DFD gravado; o 'Importar DFD' de um número já cadastrado e a protocolação (ao abrir o DFD) oferecem a mesma escolha.",
    detalhes: [
      "Pelo banner do DFD (ou importação avulsa) o DFD continua no protocolo dele.",
      "O histórico registra a sobrescrita (canal 'Sobrescrita do DFD'), as diferenças e o que foi mantido/editado.",
      "DFD de mesmo número numa unidade sem acesso não pode ser sobrescrito (aparece como erro; mantenha o já cadastrado).",
      "Na protocolação, o DFD que substitui/move um cadastrado fica na unidade dele (salvo escolha); a escolha espera a leitura da assinatura por OCR.",
      "Enquanto a sobrescrita está em andamento, o banner do DFD fica só-leitura; fechar a conferência com escolhas feitas pede confirmação.",
      "EM MASSA: na seleção da análise do protocolo (reenvio ou importação com DFDs já gravados), o campo 'Gravado × novo' aplica 'Manter os gravados' ou 'Usar os novos' em todas as diferenças dos DFDs selecionados de uma vez (marcar todos + Aplicar). Espera a análise e a leitura das assinaturas; no reenvio, o que ficou igual ao gravado não é regravado.",
      "Na importação do protocolo, os DFDs gravados vêm em segundo plano e o que o arquivo não traz é HERDADO deles (tipo, seções obrigatórias, referências da renovação — só no DFD-R — e a validação da assinatura pela equipe), como no reenvio e no avulso.",
      "A mesma seção com títulos diferentes ('PRIORIDADE' × 'PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO') é UMA escolha; itens renumerados casam pelo código; com os itens de um lado inteiro vale o valor total desse lado.",
      "Protocolo de MESMO Id e número diferente é o mesmo processo renumerado: o registro é renumerado (DFDs, gestão e histórico seguem) — nenhum DFD fica sem protocolo.",
    ],
    fonte: "sobrescrita-dfd (escolherTudo) / comparar-protocolo (chaveSecao, parearItens, herdarTratamentos) / useSobrescrita / BarraEdicaoMassa.versao / protocolo-sql (comandosMesmoId) / POST /api/dfd",
  },
  {
    id: "proto-rastro",
    dominio: "protocolo",
    titulo: "Rastro do DFD sobrescrito por outro protocolo",
    descricao:
      "Quando um protocolo traz um DFD que estava em OUTRO protocolo, o DFD passa para o novo e o de origem guarda um RETRATO cinza, separado ('DFDs sobrescritos por outro protocolo'), com a versão que ele tinha (valor da época). 'Sobrescrito pelo' aponta SEMPRE o protocolo onde o DFD está agora — numa cadeia A → B → C, A e B apontam C — e o clique abre esse protocolo.",
    detalhes: [
      "Os valores do rastro entram na conciliação da capa do protocolo de origem (a capa foi emitida com eles).",
      "O DFD que volta a um protocolo tira o rastro dele ali; excluir o protocolo apaga o rastro dele.",
      "No reenvio, um DFD do PDF que outro protocolo sobrescreveu fica mantido lá ('Restaurar' traz de volta).",
      "Mover um DFD à mão (vínculo) não deixa rastro — o rastro é da sobrescrita por outro protocolo.",
    ],
    fonte: "dfd_passagens (migração 0032) / listarSobrescritos / TabelaSobrescritos",
  },
  {
    id: "proto-filtros-mesa",
    dominio: "protocolo",
    titulo: "Filtros de hierarquia da Mesa: Responsável e Assunto",
    descricao:
      "Na MESMA linha de Protocolos · DFDs · Itens, à direita, dois seletores SÓ COM O ÍCONE filtram as visões — e o Dashboard — pelo responsável (escolhida uma pessoa, o ícone vira a foto dela; a lista mostra a foto e o apelido de cada um) e pelo assunto do protocolo (o DFD e o item herdam os do protocolo de origem). Enquanto ativos, travam as colunas correspondentes da tabela de protocolos — a hierarquia manda. A Mesa ABRE com o responsável escolhido no Perfil → Mesa: só os protocolos do próprio usuário (o padrão), todos ou os sem responsável.",
    fonte: "passaFiltroMesa / filtroInicialMesa (mesa-filtros)",
    configuravelEm: { rotulo: "Perfil → Mesa", href: "/painel/perfil" },
  },
  {
    id: "pca-filtro-cabecalho",
    dominio: "pca",
    titulo: "PCA no cabeçalho: o filtro de todo o sistema",
    descricao:
      "O seletor à esquerda do topo escolhe um PCA (ou \"Todos os PCAs\"): a Mesa passa a mostrar só os protocolos daquele PCA (e os DFDs e itens deles — o DFD segue o PCA do protocolo de origem), o módulo PCA só o card dele e o Orçamento só os orçamentos do ano dele. A escolha fica guardada no navegador, como a unidade e o grupo ativos.",
    detalhes: [
      "Casa pelo ANO do PCA (o protocolo e o DFD guardam o ano) — só entram no seletor os PCAs cadastrados com ano.",
      "Um protocolo antigo, sem ano, aparece no PCA dos DFDs dele — protocolos, DFDs e itens nunca se contradizem.",
      "Não filtra a Mesa de um PCA (já é daquele PCA), o Catálogo, a Administração nem a tela pública; dentro do espaço de um PCA, escolher outro leva ao espaço do escolhido.",
      "Só aparece para quem vê a Mesa, o PCA ou o Orçamento.",
      "As tabelas da Mesa ganharam as colunas PCA (protocolos, DFDs e itens) e Prioridade (DFDs e itens).",
    ],
    fonte: "pca-filtro (cookie pca_filtro) + filtroAnoPcaDfd/filtroAnoPcaProtocolo (dfd-sql)",
  },
  {
    id: "proto-dashboard-mesa",
    dominio: "protocolo",
    titulo: "Dashboard de governança da Mesa",
    descricao:
      "O ícone à esquerda de Protocolos · DFDs · Itens abre o Dashboard da Mesa, minimalista e calculado sobre os MESMOS protocolos e DFDs da Mesa: os KPIs da Mesa agora (com os filtros de Responsável/Assunto do topo — protocolos, valor, conformidade, com responsável, tempo médio na Mesa), a barra de métricas logo abaixo (ver “Métricas de governança por usuário”), UM gráfico em que se escolhe o dado mostrado e o desempenho por pessoa.",
    detalhes: [
      "Os KPIs e o gráfico usam as listas já carregadas e o MESMO cache da coluna Estado; só o histórico de execução (correções e ações) é pedido ao abrir o Dashboard.",
      "Datas em dias de calendário de Brasília; o KPI de tempo alerta os protocolos há mais de 30 dias na Mesa.",
      "O código do Dashboard só é baixado quando o ícone é aberto (a Mesa não carrega gráficos à toa).",
      "Na Mesa do PCA não há Dashboard (o espaço do PCA tem o dele).",
    ],
    fonte: "painelMesa (mesa-dashboard) + graficoMetricas (mesa-metricas) + DashboardMesa",
    configuravelEm: { rotulo: "Configurações → Situações / Avaliação", href: "/painel/configuracoes" },
  },
  {
    id: "proto-metricas-mesa",
    dominio: "protocolo",
    titulo: "Métricas de governança por usuário (Dashboard da Mesa)",
    descricao:
      "Abaixo das KPIs do Dashboard, uma barra escolhe o PERÍODO (o seletor de período do sistema: todo o período, hoje, esta semana, este mês, um ano, um mês de um ano ou um intervalo DE/ATÉ), o DADO do gráfico (responsável, quem protocolou, natureza, tipo de DFD, situação, estado, unidade, tempo na Mesa ou data) e a MEDIDA (protocolos, DFDs, itens, valor, correções ou ações). O MESMO gráfico mostra o dado escolhido; abaixo dele, o desempenho de cada pessoa: protocolos, conformidade, erros, atenção, correções, ações, tempo na Mesa, DFDs, itens e valor.",
    detalhes: [
      "Só a execução da Mesa: protocolos enviados a um PCA e DFDs sem protocolo ficam de fora; nada de PCA, orçamento, tarefas ou calendário. O Assunto do topo continua valendo.",
      "Com o Responsável do topo numa pessoa, as métricas mostram só essa pessoa — pelo responsável, os protocolos pelos quais responde; com o dado “Quem protocolou”, os que protocolou — com os mesmos números da linha da pessoa com “Todos”; ninguém mais ganha linha. Quem só executou (sem protocolos) aparece na visão da equipe.",
      "A semana vai de domingo a sábado (a do seletor de período); datas em dias de Brasília: os protocolos pela protocolação, as correções e as ações pela data em que aconteceram.",
      "Natureza = a categoria do assunto (Inclusão, Exclusão, Alteração não onerosa ou Outros) + o ano do PCA — “INCLUSÃO 2027”.",
      "Correção = o REENVIO do protocolo (o processo devolvido que volta corrigido). Ação = a execução que cada pessoa fez nos protocolos da Mesa (edições no banner, em massa e na tabela, vínculos, exclusões e sobrescritas de DFD), pelo histórico — nas barras de pessoa, de quem executou, qualquer que seja o responsável do protocolo.",
      "Em tipo de DFD e unidade, o protocolo com DFDs diferentes conta em cada barra e uma vez só no total (DFDs, itens e valor se dividem entre as barras). Pessoas e unidades: as 10 maiores + “Outras N”.",
      "O dado Data agrupa pelo tamanho do período: dias (até 31), semanas (até 98 dias), meses (até 36) ou anos — num período de mais de 3 anos, só do primeiro ao último dia com dado (um ano digitado errado não vira colunas vazias sem fim).",
      "Toque em qualquer barra ou linha para ver a origem dela (a soma da lista = o número).",
    ],
    fonte: "mesa-metricas (recorteMetricas + graficoMetricas) + periodo (intervaloDoPeriodo) + GET /api/mesa/execucao (mesa-execucao-sql) + BarraMetricas/PeriodoPicker",
  },
  {
    id: "mesa-itens-consolidados",
    dominio: "protocolo",
    titulo: "Itens consolidados por código (Mesa → Itens)",
    descricao:
      "Na visão Itens da Mesa, ao lado de Protocolos · DFDs · Itens, um seletor alterna Normal (um item por linha) e Consolidada: os itens de MESMO código viram uma linha só — quantidades somadas, valor unitário MÉDIO ponderado pela quantidade e os demais dados (protocolos, DFDs, unidades, prioridades…) juntos na célula, com \"+N\" e a lista na dica.",
    detalhes: [
      "O código é comparado só pelos dígitos (\"524.194.727-0\" = \"5241947270\"); item sem código não consolida (fica numa linha própria).",
      "Valor unitário médio = Σ (quantidade × valor) ÷ Σ quantidade dos itens com quantidade E valor. Item sem quantidade (ou com quantidade zerada) ou sem valor fica fora da média — o detalhe diz quantos.",
      "Filtrar uma coluna de dado (Sigla, Protocolo, Unidade, Estado…) escolhe QUAIS ITENS entram na soma: filtrando uma unidade requisitante, a linha mostra só a quantidade e o valor dela — o total bate com o da visão Normal com o mesmo filtro. Os filtros de número (quantidade, médio, total…) escolhem as linhas.",
      "Variação dos preços (coeficiente de variação): até 25% homogêneo (verde), até 50% atenção (âmbar), acima alerta (vermelho) — aponta preço destoante.",
      "Unidades diferentes no mesmo código (ex.: UN e CX) ficam em âmbar: a quantidade e a média misturam unidades. A variação usa a maior DENTRO de uma mesma unidade e o detalhe mostra a quebra por unidade (preço de caixa não se compara com o de unidade).",
      "Curva ABC pelo valor: A = os códigos que somam os primeiros 80% do valor, B = até 95%, C = o resto; a lista vem do maior valor para o menor.",
      "Tocar numa linha abre o detalhe: indicadores, avisos, a quebra por unidade, as descrições diferentes numeradas (D1, D2…) e cada item de origem (com estado, catálogo, PCA e prioridade) com o desvio do preço em relação à média da unidade; tocar num item abre o banner dele por cima. \"Copiar resumo\" gera o texto para um despacho.",
      "O Estado junta os problemas dos itens (\"Item sem valor (2)\"). A edição segue item a item (visão Normal ou banner do item).",
      "Nas duas visões e no detalhe, cada item mostra o nº de PLANEJAMENTO e o TIPO do DFD de origem (na Consolidada, todos os do código; \"—\" = algum DFD sem o dado, ex.: sem planejamento); filtrar por eles também escolhe os itens da soma. O banner do item mostra o DFD de origem com tipo e planejamento.",
    ],
    fonte: "consolidarItens (itens-consolidados) + ComposicaoItem",
  },
  {
    id: "mesa-dados-completos",
    dominio: "protocolo",
    titulo: "Dados completos nas tabelas da Mesa (um botão)",
    descricao:
      "Na barra da Mesa, ao lado dos filtros, o botão de dados completos troca o resumo de uma linha pelo conteúdo INTEIRO dentro das próprias tabelas: a descrição e o assunto sem cortes, as listas da Consolidada sem o \"+N\" (as descrições diferentes numeradas D1, D2…) e todos os problemas na coluna Estado.",
    detalhes: [
      "Vale para Protocolos, DFDs e Itens (Normal e Consolidada), na Mesa principal e na do PCA; os banners e o Dashboard não mudam.",
      "A escolha fica guardada no usuário: a Mesa já abre do jeito escolhido (inclusive em outro aparelho).",
      "Desligado, a linha volta à altura compacta — o texto inteiro segue na dica e no banner.",
    ],
    fonte: "BotaoDadosCompletos + DadosCompletos (CelulaTexto, CelulaLista, EstadoResumo) · preferência mesa:dados-completos",
  },
  {
    id: "proto-historico",
    dominio: "protocolo",
    titulo: "Histórico conectado: protocolo › DFD › item",
    descricao:
      "Toda alteração é registrada com quem, quando, o CANAL (protocolação, reenvio, edição no banner, em massa, na tabela, vínculo, exclusão) e o PROTOCOLO por onde passou, com o antes → depois de cada campo, seção, assinatura e item. O protocolo mostra o seu histórico e o dos DFDs e itens que passaram por ele (agrupado por evento, com filtro Capa/DFDs/Itens); o DFD mostra o dele; o item, só o que o tocou.",
    fonte: "auditoria (origem/detalhe/protocolo_id) + Historico",
  },

  // ---- Avaliação (narrativo; os pontos vêm DERIVADOS do catálogo) ----
  {
    id: "aval-niveis",
    dominio: "avaliacao",
    titulo: "Quatro níveis por dado avaliado",
    descricao:
      "Cada dado de Protocolo/DFD/Item recebe um nível definido pelo ADM: fundamental (bloqueia importar/protocolar), intermediário (só avisa — atenção âmbar, não bloqueia), automático (corrige sozinho onde há corretor) ou ignorar (não avalia).",
    fonte: "avaliacao-core (CATALOGO_AVALIACAO)",
    configuravelEm: { rotulo: "Avaliação" },
  },
  {
    id: "aval-excecoes",
    dominio: "avaliacao",
    titulo: "Exceções por tipo de DFD e categoria de protocolo",
    descricao:
      "O nível pode ter exceções por tipo de DFD (DFD-S/R/O/E) e por categoria de protocolo. Como o assunto da capa é texto livre, ele é classificado em três categorias fixas — Inclusão, Exclusão e Alteração não onerosa — pela palavra que aparece no assunto. A exceção mais específica vence o padrão global.",
    fonte: "nivelDe / classificarAssunto",
    configuravelEm: { rotulo: "Avaliação" },
  },
  {
    id: "aval-fonte-unica",
    dominio: "avaliacao",
    titulo: "Mesma regra no navegador e no servidor",
    descricao:
      "A avaliação é fonte única: o navegador trava o botão e o servidor reconfere no envio (rejeita por garantia) com a MESMA régua — tipo do DFD e categoria do protocolo, em todos os lotes de itens. Assim nada que a análise liberou é barrado só no fim da protocolação. Com os níveis no padrão de fábrica, o comportamento é idêntico ao histórico do sistema.",
    detalhes: [
      "Catálogo bloqueante: quando o ADM faz um ponto de catálogo bloquear, a análise do protocolo confere os itens de todos os DFDs antes de liberar o 'Protocolar'.",
    ],
    fonte: "faltasObrigatorias → avaliarDfd; categoriaDoProtocolo; POST /api/dfd, /api/protocolo",
  },

  // ---- Estados & Situações (narrativo; enums vêm DERIVADOS) ----
  {
    id: "est-precedencia",
    dominio: "estados",
    titulo: "Precedência do estado do DFD",
    descricao:
      "O estado de um DFD segue a ordem: erro › atenção › editado › regularizado (automático) › regular. A atenção (âmbar) sinaliza sem bloquear (ex.: DFD-R sem referência de renovação). O estado é DERIVADO das mesmas mensagens do painel 'Ver mensagens' — na análise, no protocolo gravado, na lista de DFDs e no servidor — então tabela, painel e botões nunca se contradizem.",
    fonte: "avaliarLinhaDfd / mensagensDoDfd (conferencia-dfd) + estadoDfd",
  },
  {
    id: "est-item",
    dominio: "estados",
    titulo: "Estado por item da tabela",
    descricao:
      "Cada item da Seção 4 aponta a falta (valor unitário ou quantidade, em vermelho) e o item REPETIDO (mesmo código, descrição e unidade de outro item — 'Item duplicado', em âmbar, nunca bloqueia) na coluna Estado. Na análise, os itens com pendência aparecem numa tabela separada, acima dos regulares; depois de protocolado a tabela é única (o filtro da coluna Estado separa).",
    detalhes: [
      "O detalhe do item repetido mostra os iguais lado a lado, 'Ver item', 'Unificar neste item' (soma as quantidades — só com o mesmo valor unitário) e 'Remover item'.",
    ],
    fonte: "estadoItem / faltasDoItem / mensagensItem / unificarItensDfd",
    configuravelEm: { rotulo: "Avaliação (item.duplicado: Avisa ou Ignora)" },
  },
  {
    id: "est-protocolo",
    dominio: "estados",
    titulo: "Estado × Situação do protocolo",
    descricao:
      "ESTADO do protocolo ACUMULA todos os problemas dele: a conciliação da capa (valor ausente/zerado ou diferente da somatória), 'Sem DFDs' e os erros/atenções de CADA DFD e dos seus itens (a mesma conferência por linha dos DFDs), agrupados por problema com a quantidade de DFDs — erro › atenção › regular; o filtro da coluna encontra qualquer um deles. SITUAÇÃO = a etapa do processo, escolhida no dropdown da própria célula entre as situações que o ADM cadastra (nome, cor e ordem).",
    fonte: "avaliarProtocolo (conferencia-dfd) / situações (protocolo_situacoes)",
    configuravelEm: { rotulo: "Configurações → Situações" },
  },

  // ---- Normalização ----
  {
    id: "norm-secoes",
    dominio: "normalizacao",
    titulo: "Padroniza prioridade e previsão automaticamente",
    descricao:
      "Ao conferir, a PRIORIDADE é reduzida a ALTA/MÉDIA/BAIXA e a PREVISÃO DE ENTREGA vira um MÊS DEFINIDO (MÊS/AAAA) OU uma definição GENÉRICA — ANUAL, SEMESTRAL, QUADRIMESTRAL ou TRIMESTRAL. O ANO é SEMPRE o do PCA (o ano escrito no texto, de um contrato ou de uma data antiga, não vale; o nº de um contrato/ata/processo nunca vira data). O que não dá para padronizar fica para tratar à mão.",
    fonte: "normPrioridade / normPrevisao (normalize)",
  },
  {
    id: "norm-texto-corrido",
    dominio: "normalizacao",
    titulo: "Texto do DFD em parágrafos — sem as quebras da linha do PDF",
    descricao:
      "No PDF, cada linha VISUAL virava uma quebra no texto das seções (\"…MONITORAMENTO REMOTO NO⏎DEPARTAMENTO…\"). Agora a importação refaz os parágrafos: a quebra FICA quando é real — fim de frase, item de lista, rótulo (\"Nome:\"), bloco novo, linha curta — e SOME quando é só a largura da linha. Na dúvida, a quebra fica.",
    detalhes: [
      "Pela GEOMETRIA do PDF: o vão entre as linhas (maior que a entrelinha = bloco novo) e até onde a linha vai (perto da margem direita = quebra da largura).",
      "Pelo TEXTO: palavra de ligação no fim (\"…PARA GARANTIR A\", \"…E\", \"…,\") ou a seguinte continuando a frase (minúscula, \"E\", \"DE\"…) juntam; ponto final (fora de abreviação como \"SEC.\"), lista e rótulo separam.",
      "O cabeçalho de página (o órgão emissor repetido no topo de cada página) não vaza mais para a seção que atravessa a página.",
      "\"Órgão/Entidade\" e \"Setor Requisitante\" que quebram em 2 linhas voltam inteiros; Matrícula/e-mail/telefone vazios no PDF ficam vazios (nunca o \":\" nem os da equipe do §8).",
      "Validado no protocolo real (15 DFDs): o texto gravado pela versão anterior, revisado pelo botão Atualizar, fica igual à importação nova.",
    ],
    fonte: "textoCorrido / refluirTexto (texto-corrido) · coletarSecoes / juntarContinuacoesCabecalho (parse-dfd-comum)",
  },
  {
    id: "norm-revisao-atualizar",
    dominio: "normalizacao",
    titulo: "Botão Atualizar: recarrega e revisa o DFD, o item ou o protocolo",
    descricao:
      "O botão de atualização (ao lado do X dos banners gravados) GIRA enquanto recarrega do banco e REVISA os dados: aplica ao que já está gravado os MESMOS tratamentos automáticos da importação. O que foi tratado entra no rascunho, para conferir e gravar em \"Salvar alterações\" (com o histórico).",
    detalhes: [
      "Seções em parágrafos (sem as quebras da linha do PDF) e sem a linha do cabeçalho de página.",
      "Textos limpos no cabeçalho do DFD, na descrição/unidade dos itens e na capa do protocolo.",
      "A padronização automática do ADM (prioridade, previsão, sinônimos) e as referências da renovação lidas do texto (DFD-R sem nenhuma).",
      "Nunca mexe em identificadores (nº, planejamento, ano do PCA), valores, quantidades, assinaturas nem na unidade; revisar de novo não muda nada.",
      "Só-leitura (sem permissão, unidade sem acesso): só recarrega e avisa o que haveria a tratar.",
    ],
    fonte: "revisarDfd / revisarCapa (revisao-dfd) + BotaoAtualizar (useDfdGravado / useProtocoloGravado)",
  },
  {
    id: "norm-valor",
    dominio: "normalizacao",
    titulo: "Valor do DFD = somatória dos itens",
    descricao:
      "O valor de cada item é quantidade × valor unitário (com 4 casas, a precisão da Centi — o item sem total lido recebe essa conta; trocar a quantidade ou o valor unitário recalcula); o valor do DFD é a soma dos itens com 4 casas em TODA parte (a tela mostra ao centavo; a capa bate quando a diferença é menor que 1 centavo): na leitura (o TOTAL GERAL do documento só fecha a tabela), na edição, na sobrescrita e no banco, que fecha os totais pelos itens gravados no mesmo lote. O DFD gravado pela metade aparece como erro \"Gravação incompleta\". Números em pt-BR e datas são normalizados na importação da planilha PCA.",
    fonte: "parse-dfd-comum (fecharValoresItens/totalDoItem/valorDosItens) / dfd-sql (comandoTotaisDfd) / conferencia-dfd",
  },
  {
    id: "norm-unidades-medida",
    dominio: "normalizacao",
    titulo: "Unidades de medida: comparação dos itens com o cadastro (Catálogo)",
    descricao:
      "Catálogo → Unidades de medida: cada unidade tem sigla, nome e sinônimos (as outras grafias aceitas). Toda grafia de unidade dos itens (DFDs e catálogo) é comparada com o cadastro e aparece como Cadastrada, Sugestão ou Não cadastrada, com quantos itens a usam.",
    detalhes: [
      "\"Und.\", \"UND\" e \"und\" são a MESMA grafia (sem caixa, acento, pontuação e espaço; m² = M2).",
      "Sugestão: por QUALQUER escrita da grafia, a regra do sistema a põe na mesma unidade de UMA cadastrada (UND e U.N.D = UNIDADE) ou ela é o plural de uma grafia cadastrada (CAIXAS → CAIXA). Com duas possíveis, não sugere.",
      "Escolha a unidade na linha (a sugestão já vem escolhida) e confirme em \"Adicionar\" — a grafia vira um sinônimo; \"Adicionar N sugestões\" grava todas de uma vez, cada uma na unidade escolhida; \"Cadastrar\" abre a unidade nova já proposta a partir das grafias dos itens.",
      "Se só parte das grafias entrar (outra pessoa alterou a unidade no meio, por exemplo), o aviso diz quantas entraram e o motivo das demais — nada é sobrescrito.",
      "Uma grafia pertence a UMA unidade só — repetir a de outra é recusado. Excluir uma unidade não mexe nos itens: as grafias dela voltam a \"não cadastrada\".",
      "Na Mesa → Itens, a coluna \"Unid. cadastrada\" mostra a sigla cadastrada de cada item (ou \"Não cadastrada\"). Os itens de DFD seguem a unidade ativa do cabeçalho.",
    ],
    fonte: "compararUnidades / comparadorUnidades (padronizacao-core)",
  },
  {
    id: "norm-classificacao-itens",
    dominio: "normalizacao",
    titulo: "Classificação automática dos itens (Catálogo → Classificações)",
    descricao:
      "Cada classificação tem nome, cor e palavras-chave. Todo item é classificado automaticamente pela DESCRIÇÃO: vence a palavra-chave que aparece primeiro; na mesma posição, a mais longa; depois, a ordem da lista. Sem palavra-chave, vale a classificação que a unidade de medida cadastrada indica; sem nenhuma, \"Não classificado\".",
    detalhes: [
      "\"SERVIÇO DE MANUTENÇÃO EM CADEIRAS\" é serviço (SERVIÇO aparece antes de CADEIRA); \"MATERIAL DE LIMPEZA\" vence \"MATERIAL\" na mesma posição.",
      "A palavra-chave casa o início das palavras da descrição (CADEIRA acha CADEIRAS); as de até 3 letras só inteiras ou no plural (KIT acha KITS; AR não acha ARMÁRIO). Sem acento, caixa ou pontuação.",
      "Uma palavra-chave pertence a UMA classificação e o nome é único — o sistema avisa antes de gravar.",
      "O editor mostra ao vivo quantos itens a classificação passa a ter (e quantos vêm de outra) antes de gravar; a tabela \"Classificação dos itens\" mostra o motivo de cada uma — filtrar \"Não classificado\" acha as palavras que faltam; tocar numa linha abre a descrição inteira.",
      "Na Mesa → Itens (Normal, Consolidada e o detalhe) a coluna \"Classificação\" mostra a de cada item, com o motivo na dica. Sem classificação cadastrada, a coluna não aparece.",
    ],
    fonte: "criarClassificador (padronizacao-core) + ClassificacoesView",
  },

  // ---- Assinatura ----
  {
    id: "ass-captura",
    dominio: "assinatura",
    titulo: "Captura a assinatura digital do PDF (2 formatos)",
    descricao:
      "Depois de cada DFD, o PDF traz as assinaturas (certificado digital OU sistema). O sistema lê nome, e-CPF, usuário, data e código verificador. As assinaturas podem vir em várias páginas, sempre depois do DFD; uma capa/despacho é fronteira.",
    fonte: "extrairAssinaturas (parse-dfd-comum)",
  },
  {
    id: "ass-conferencia",
    dominio: "assinatura",
    titulo: "Confere o assinante contra os responsáveis",
    descricao:
      "O assinante precisa bater (nome) com um responsável padrão da repartição OU com um temporário cujo período cobre a data da assinatura. Quatro desfechos: OK, sem-assinatura (informativo, só .xlsx), erro (bloqueia) ou solicitante identificado.",
    detalhes: [
      "PDF sem assinatura → bloqueia (nível padrão).",
      ".xlsx sem assinatura → permitido (informativo).",
      "Repartição sem responsável cadastrado → bloqueia.",
      "Assinante não autorizado (ou fora do período do temporário) → bloqueia.",
    ],
    fonte: "validarAssinatura (reparticao-responsaveis)",
    configuravelEm: { rotulo: "Avaliação (dfd.assinatura)" },
  },
  {
    id: "ass-data-equipe",
    dominio: "assinatura",
    titulo: "Assinatura adicionada pela equipe tem data",
    descricao:
      "Ao ADICIONAR a assinatura à mão (nenhuma lida no arquivo), a equipe informa a DATA da assinatura (obrigatória, não pode ser apagada depois — só corrigida); ao validar uma assinatura lida, vem a data lida (corrigível). A assinatura adicionada é sempre 'validada pela equipe' (dá para desfazer) e, nela, um responsável TEMPORÁRIO só vale se o período dele cobre a data informada. Na assinatura LIDA validada pela equipe, o período não é reexigido (a equipe conferiu o PDF). Data futura ou inválida é recusada (também no servidor).",
    fonte: "validarAssinaturaPelaEquipe (reparticao-responsaveis) / DfdConferir",
  },
  {
    id: "ass-responsaveis",
    dominio: "assinatura",
    titulo: "Responsáveis por DFDs: planilha única, padrões e temporários",
    descricao:
      "As pessoas ficam numa PLANILHA ÚNICA (nome + matrícula, cadastradas uma vez) e são VINCULADAS a unidades ou órgãos: no órgão de assinatura única, os vínculos do órgão valem para todas as unidades; no órgão por unidade, cada unidade tem os seus. Cada vínculo é padrão ou temporário, com função e nomeação (ato + número + link). No período de um temporário, ele é o efetivo (os padrões ficam inativos); fora do período, volta aos padrões — estados Agendado/Vigente/Encerrado. A coluna Conferência aponta o que está mal cadastrado.",
    fonte: "responsaveis-planilha-core / PlanilhaResponsaveis / reparticao-responsaveis",
    configuravelEm: { rotulo: "Órgãos e Unidades → Responsáveis", href: "/painel/orgaos?aba=responsaveis" },
  },

  // ---- PCA ----
  {
    id: "pca-edicao",
    dominio: "pca",
    titulo: "Edição do PCA une DFDs por referência",
    descricao:
      "Uma edição de PCA (ex.: 'PCA 2026') une os DFDs selecionados por referência — DFDs novos não mudam uma edição já gerada. É o plano consolidado da Prefeitura, com escopo por repartição.",
    fonte: "gerarPca (dfd)",
  },
  {
    id: "pca-registro",
    dominio: "pca",
    titulo: "Registro leve + PCA ativo (vigente)",
    descricao:
      "Além da edição, um PCA pode ser um registro leve (só nome + ano, sem unir DFDs), e UM é marcado como ativo/vigente. O ADM cadastra e marca o ativo nas Configurações.",
    fonte: "cadastrarPca / definirPcaAtivo",
    configuravelEm: { rotulo: "PCAs" },
  },
  {
    id: "pca-ano",
    dominio: "pca",
    titulo: "Ano do PCA obrigatório e herdado",
    descricao:
      "O ano do PCA é adivinhado pela descrição e confirmado no seletor. Não se protocola nem se importa DFD avulso sem o PCA definido (nível padrão). No protocolo, todos os DFDs herdam o ano do PCA do processo — e o ANO da previsão de entrega e do cronograma do Dashboard é SEMPRE esse (nunca o de um contrato ou de outro texto).",
    fonte: "anoPcaDoTexto / PcaPicker",
    configuravelEm: { rotulo: "Avaliação (dfd.anoPca / protocolo.anoPca)" },
  },
  {
    id: "pca-incorporado-editavel",
    dominio: "pca",
    titulo: "Protocolo incorporado editável (o PCA acompanha)",
    descricao:
      "O protocolo INCORPORADO a um PCA se edita como qualquer outro — capa, DFDs, itens, assinaturas, massa, reenvio, sobrescrita, mover DFD, excluir DFD e protocolo e Devolver à Mesa (desincorpora) — e o PCA acompanha na hora (Dashboard, Orçamento, consulta pública).",
    detalhes: [
      "O item editado MANTÉM o nº no PCA: antes de regravar, o nº guarda o retrato do item e a linha nova o reencontra (código + descrição + unidade + nº do item, depois chaves mais fracas).",
      "O item novo ganha o próximo nº do PCA; o removido fica com o nº baixado — inativo para sempre, nunca reaproveitado; o retirado do PCA segue retirado.",
      "O DFD está no PCA do protocolo incorporado em que está: entra (com a ação do protocolo) quando chega a ele, sai (nºs baixados) quando o deixa ou é excluído; o substituído volta a valer quando quem o substituía sai.",
      "Única recusa: a re-importação por Id que fundiria um protocolo em um PCA em outro já existente no nº novo — devolva-o antes.",
    ],
    fonte: "pca-sincronia (numeracaoDaGravacao / sincronizarDfdNoPca / sincronizarAtivosPca) · pca-numeracao-core · pca-itens-sql",
  },

  // ---- Acesso & RBAC ----
  {
    id: "rbac-grupo",
    dominio: "acesso",
    titulo: "O grupo decide QUAIS telas; o papel decide o que se faz nelas",
    descricao:
      "Um usuário pertence a vários grupos e escolhe o grupo ativo no cabeçalho. Cada grupo tem 1 permissão — as telas que ele abre (Mesa, PCA, Catálogo, Orçamento, Tarefas, Calendário) — e acessa um conjunto de unidades. O PAPEL da pessoa diz o que ela faz em cada tela: Visualizar, Manipular, Importar, Exportar, Excluir e Configurar. A tela só abre quando o grupo a libera E o papel a visualiza; ao entrar no painel, o sistema abre a 1ª tela que abre (sem nenhuma, o Perfil explica por quê).",
    detalhes: [
      "O que o papel não permite some da tela (importar, seleção e edição em massa, excluir, exportar) ou vira só-leitura — e o servidor recusa (403) do mesmo jeito.",
      "Pela URL, a tela que o grupo ou o papel não abre mostra 'Acesso restrito'.",
    ],
    fonte: "acesso (getAcesso / podeTela) + papeis-core (podeNaTela)",
    configuravelEm: { rotulo: "Papéis" },
  },
  {
    id: "rbac-papel",
    dominio: "acesso",
    titulo: "Papéis: criados pelo ADM, com as ações de cada tela",
    descricao:
      "Em Configurações → Papéis o ADM cria e edita papéis numa matriz Telas × Ações. Qualquer ação liga o Visualizar; sem Visualizar, a tela fica fechada. O Administrador é fixo (tudo, inclusive a Administração); Gestor e Membro são do sistema (editáveis, não excluíveis). Um papel é o PADRÃO dos novos cadastros; o que alguém tem não se exclui.",
    detalhes: [
      "Alterar um papel vale na hora para todas as pessoas dele; retirar capacidades de um papel em uso pede confirmação.",
      "Em Usuários, o ADM troca o papel (com confirmação), marca os grupos, aprova o cadastro já com papel e grupos e vê o acesso efetivo de cada pessoa em cada grupo ('Ver acesso').",
      "O sistema nunca fica sem Administrador ativo: trocar o papel, desativar ou excluir o último é recusado.",
    ],
    fonte: "papeis-core (CATALOGO_PAPEIS / coerceCapacidades) + papeis-sql (travas no comando)",
    configuravelEm: { rotulo: "Papéis" },
  },
  {
    id: "rbac-detalhes",
    dominio: "acesso",
    titulo: "Detalhes do papel: o controle fino dentro das telas",
    descricao:
      "Na aba Detalhes do papel, o ADM restringe o que a pessoa vê e faz DENTRO das telas que abre — os detalhes só RETIRAM acesso e valem em qualquer grupo. Na Mesa do sistema e na de cada PCA: ver ou não o Responsável e a Distribuição (quem protocolou), alterar o Responsável em 3 níveis (não altera · só assume para si · qualquer pessoa do grupo), as LINHAS ('só os meus' = os protocolos em que a pessoa é o Responsável ou que ela protocolou, com os DFDs e itens deles) e o desempenho por pessoa do Dashboard.",
    detalhes: [
      "O que fica oculto não sai do servidor: as listas, os banners, o Dashboard, a exportação e o histórico chegam sem o dado (a troca de Responsável some do histórico de quem não o vê).",
      "'Só os meus' vale nas listas, nos banners, nas buscas, nas conferências, na edição em massa, no vincular e na importação: fora das linhas da pessoa, o protocolo responde como o de unidade sem acesso. Não vale no Dashboard do PCA nem na consulta pública (o plano consolidado).",
      "'Só assume para si' = assumir o protocolo sem responsável ou soltar o seu; tomar o de outra pessoa exige 'qualquer pessoa do grupo'. O responsável padrão do Perfil só entra ao protocolar se o papel permitir.",
      "Sem o Responsável e sem a Distribuição, não há desempenho por pessoa. O Administrador ignora os detalhes (regra firme).",
    ],
    fonte: "papeis-detalhes-core (coerceDetalhes) + mesa-visao-core (visaoMesa / motivoResponsavel) + acesso-mesa (escopoMesa) + mesa-redacao",
    configuravelEm: { rotulo: "Papéis" },
  },
  {
    id: "rbac-recurso",
    dominio: "acesso",
    titulo: "Cada registro segue a tela em que está",
    descricao:
      "Na Mesa, o protocolo (e os DFDs e itens dele) que está num PCA segue a tela PCA; os demais, a Mesa do sistema. Uma tarefa segue o papel no GRUPO DO QUADRO dela (um aviso de outro grupo abre normalmente); a tarefa e os eventos também valem pelo Calendário. As edições públicas das tabelas exigem Configurar na tela da tabela.",
    fonte: "podeNoRecurso / recusaNoQuadro / recusaNaChave",
  },
  {
    id: "rbac-admin",
    dominio: "acesso",
    titulo: "O Administrador sempre vê TODAS as telas",
    descricao:
      "Regra firme: o papel Administrador nunca é bloqueado — vê e faz tudo em todas as telas, com ou sem grupo, e só ele entra na Administração (usuários, grupos, permissões, papéis e configurações). O primeiro usuário cadastrado vira Administrador ativo.",
    fonte: "api-auth (exigirAdmin) / papeis-core (podeNaTela)",
  },
  {
    id: "rbac-reparticao",
    dominio: "acesso",
    titulo: "As unidades do grupo escopam os dados",
    descricao:
      "O acesso às unidades tem 3 estados: TODAS (Administrador, ou grupo com a 'Geral' — também no detalhe e na escrita), as UNIDADES do grupo, ou NENHUMA (sem grupo, a pessoa não vê dado nenhum). A unidade ativa do cabeçalho filtra a Mesa e o PCA; toda escrita de DFD/protocolo confere a unidade (403 fora do escopo), com anti-sequestro por número.",
    fonte: "escopo-unidades-core / getReparticaoContexto / getReparticaoFiltro",
    configuravelEm: { rotulo: "Unidades", href: "/painel/orgaos" },
  },

  // ---- Identidade & Aparência ----
  {
    id: "id-identidade",
    dominio: "identidade",
    titulo: "Nome, subtítulo e favicon do site",
    descricao:
      "A identidade do site (nome, subtítulo e favicon) é definida pelo ADM e renderiza em toda a plataforma: aba do navegador, barra lateral e a tela pública. Sem definição, usa os textos padrão.",
    fonte: "getAparencia().identidade",
    configuravelEm: { rotulo: "Identidade" },
  },  {
    id: "id-apelido",
    dominio: "identidade",
    titulo: "Apelido e foto de cada pessoa",
    descricao:
      "No Perfil, cada pessoa cadastra um APELIDO (até 40 caracteres) — o nome de exibição no sistema: cabeçalho, colunas Responsável/Distribuição e seletores (a lista mostra a foto, o apelido e, embaixo, o nome completo; busca por qualquer um dos dois). Sem apelido, vale o nome. A foto é servida com cache e só é baixada de novo quando o perfil muda.",
    fonte: "pessoa (nomeExibicao / urlFoto) + /api/usuarios/[id]/foto",
    configuravelEm: { rotulo: "Perfil", href: "/painel/perfil" },
  },

  {
    id: "id-aparencia",
    dominio: "identidade",
    titulo: "Personalização visual por tokens",
    descricao:
      "O ADM personaliza cores (claro/escuro), raio dos cards, densidade, animações e ícones, com preview ao vivo. Os tokens são injetados no HTML inicial sem flash e por allowlist (anti-XSS).",
    fonte: "AparenciaAdmin / aparenciaToCss",
    configuravelEm: { rotulo: "Aparência", href: "/painel/aparencia" },
  },

  // ---- Técnico ----
  {
    id: "tec-lotes",
    dominio: "tecnico",
    titulo: "Escrita em lotes, garantida (all-or-nothing)",
    descricao:
      "DFDs com milhares de itens são gravados em lotes com barra de progresso. Falha transitória tem retry; se um lote falha de vez, o DFD parcial é apagado (não fica DFD pela metade). O reenvio do mesmo lote é idempotente (não duplica).",
    fonte: "enviarDfdEmLotes / appendDfdItens",
    tecnico: true,
  },
  {
    id: "tec-streaming",
    dominio: "tecnico",
    titulo: "Protocolação em streaming, sem estourar o Worker",
    descricao:
      "O protocolo é criado só com a capa; os DFDs entram depois, um a um, para escalar a milhares sem estourar CPU/memória do Worker. A análise em segundo plano tem teto (CAP_ANALISE) e cacheia o parse por índice para as edições sobreviverem ao envio.",
    fonte: "ProtocoloUploadForm / api/protocolo",
    tecnico: true,
  },
  {
    id: "tec-limites",
    dominio: "tecnico",
    titulo: "Limites do banco e da requisição",
    descricao:
      "O D1 aceita até 100 parâmetros vinculados por statement (os itens de DFD vão a 11×9=99 por lote) e rejeita compound SELECT longo. Há teto de itens por DFD e de linhas por lote no Zod, e o Drizzle parametriza tudo (sem SQL injection).",
    fonte: "dfd-validation (MAX_*) / dfd",
    tecnico: true,
  },
  {
    id: "tec-falha-tela",
    dominio: "tecnico",
    titulo: "Falha ao carregar uma tela",
    descricao:
      "Quando uma tela falha, o cartão diz o que aconteceu: a resposta chegou cortada (a tela foi grande demais para o limite do servidor ou a conexão oscilou), o sistema foi atualizado com a página aberta, o servidor não conseguiu montá-la ou houve um erro na própria tela. O sistema tenta sozinho uma vez por tela a cada minuto (pede a tela de novo ou recarrega a página), e cada falha vai aos Logs do Worker com o tipo, a tela e o papel de quem a viu — sem nome nem e-mail. No painel, o menu e o cabeçalho continuam.",
    fonte: "erro-tela-core / FalhaNaTela / api/erros",
    tecnico: true,
  },
  {
    id: "tec-sessao",
    dominio: "tecnico",
    titulo: "Sessão, senha e criptografia",
    descricao:
      "A senha usa PBKDF2-SHA256 com 100.000 iterações (teto do Cloudflare Workers) e exige ao menos 8 caracteres. O D1 guarda só o hash do token de sessão; o cookie é httpOnly+Secure.",
    fonte: "password / auth",
    tecnico: true,
  },
];
