/**
 * VERSÕES do sistema — o registro de mudanças (changelog) é a FONTE ÚNICA da versão exibida no menu, da página de
 * Novidades e do aviso aos Administradores. Puro (sem DOM/banco) e testado.
 *
 * Como publicar uma versão nova: acrescente uma entrada NO TOPO de `VERSOES` (a versão maior que a anterior — semver:
 * MAIOR quando muda o jeito de trabalhar, MENOR para recurso novo, CORREÇÃO para ajuste), cada mudança com o `link` de
 * ONDE ela está, e ponha o mesmo número no `package.json`. O deploy faz o resto: o menu mostra o número e cada ADM
 * recebe UM aviso no sino com o que mudou (tocar abre as Novidades num banner flutuante — sem sair da tela).
 */

export type TipoMudanca = "novo" | "melhoria" | "correcao";

export const ROTULO_MUDANCA: Record<TipoMudanca, string> = { novo: "Novo", melhoria: "Melhoria", correcao: "Correção" };

export type Mudanca = {
  tipo: TipoMudanca;
  /** A área do sistema (o nome do menu). */
  area: string;
  texto: string;
  /** ONDE a mudança está — caminho interno (com a aba, quando houver). */
  link?: string;
};

export type Versao = {
  versao: string;
  /** AAAA-MM-DD (dia de Brasília). */
  data: string;
  titulo: string;
  mudancas: Mudanca[];
};

/** Mais recente PRIMEIRO. */
export const VERSOES: readonly Versao[] = [
  {
    versao: "1.36.0",
    data: "2026-10-07",
    titulo: "Automação: cartões que enchem a tela e se arrastam",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Os cartões enchem a largura em colunas iguais (sem sobra) e o painel “Novo fluxo” ocupa a última coluna — o cartão nunca muda de tamanho; ao abrir e fechar, os cartões deslizam suaves para o lugar novo.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Arraste os cartões para reordenar as automações (a ordem fica guardada) e arraste um modelo do painel até a lista para criar o fluxo ali — o mesmo arrasto de Tarefas.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "O “+” com o painel aberto o fecha.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.35.0",
    data: "2026-10-07",
    titulo: "Diagrama de fluxo mais legível",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Linhas nunca uma sobre a outra: a dobra que dividiria o corredor vai para uma faixa livre ao lado.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Setas no meio dos trechos e na chegada; cada ligação de um mesmo nó em uma cor; a bolinha da porta ligada fica preenchida na cor da linha.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Arraste o trecho vertical de uma linha para ajustá-la (duplo clique volta ao automático; Organizar refaz todas).", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "O (?) do diagrama no mesmo tamanho e alinhamento dos botões de zoom.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.34.0",
    data: "2026-10-07",
    titulo: "Automação: cartões fixos e cabeçalho enxuto",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Os cartões dos fluxos têm formato fixo — abrir o painel “Novo fluxo” só muda quantos cabem por linha — com animação suave ao passar o mouse.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "“Novo fluxo” só com o ícone; a extensão mostra só o número e, com tudo certo, encolhe para o ícone.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "“Centi logada” pulsa ao vivo e explica o estado ao passar o mouse.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.33.3",
    data: "2026-10-07",
    titulo: "Conferir DFDs: progresso a cada DFD",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Cada DFD é buscado, lido, comparado, marcado e registrado como feito antes do próximo — parar não perde nenhum DFD já conferido.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.33.2",
    data: "2026-10-07",
    titulo: "Editor de fluxos numa tela só",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "O diagrama do fluxo cabe na tela: a lista de blocos e o quadro rolam por dentro, sem rolar o navegador.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.33.1",
    data: "2026-10-07",
    titulo: "Automação: tela mais limpa",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "“Novo fluxo” na linha do cabeçalho, ao lado de Ajustes (agora só o ícone); o painel entra da direita empurrando os cartões, com os mesmos cartões da lista.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Cartões sólidos, todos do mesmo tamanho, com o vão padrão entre eles.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "No diagrama, tocar num nó abre a configuração numa janela flutuante sobre ele; a coluna lateral saiu e o relatório da execução abre pelo botão “Relatório”.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.33.0",
    data: "2026-10-07",
    titulo: "Diagramas organizados",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Botão “Organizar” no diagrama: os componentes em colunas na ordem do fluxo (da esquerda para a direita), o caminho principal em cima e a saída de erro abaixo. Os modelos já nascem organizados.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Ligações em ângulo reto, com seta mostrando a direção, que nunca passam por cima de um componente (desviam pelos corredores); a volta do Laço contorna por fora.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.32.1",
    data: "2026-10-07",
    titulo: "Automações mais limpas",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Cartões das automações proporcionais e com o título inteiro (quebra linha, nunca corta); a tela inicial mostra só os seus fluxos.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "“Novo fluxo” abre um painel à direita com “Em branco” e todos os modelos prontos — o que já existe pode ser aberto ou criado de novo.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "O “Como montar” do diagrama foi para o (?) junto dos controles de zoom; a lista carrega com o esqueleto padrão.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.32.0",
    data: "2026-10-07",
    titulo: "Fluxos dentro de fluxos",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Qualquer fluxo salvo pode ser usado dentro de outro pelo componente “Executar fluxo”: uma vez para cada item (várias execuções ao mesmo tempo, de 1 a 6) ou uma vez com todos. O Início do fluxo usado recebe os itens e o que ele produz segue adiante.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Retomada: um fluxo interrompido continua do item em que parou (vale em outro computador); “Recomeçar do zero” no componente.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "“Executar vários fluxos”: dispara vários fluxos AO MESMO TEMPO com os mesmos dados.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Conferir DFDs × Centi agora usa o fluxo “Conferir 1 DFD × Centi” para cada DFD, 3 de cada vez, retomando de onde parou. Um fluxo usado por outro não pode ser excluído, e fluxos que se usariam em círculo são recusados.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.31.0",
    data: "2026-10-07",
    titulo: "Todas as automações viraram fluxos",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "As tarefas antigas viraram FLUXOS editáveis, com as mesmas funções: Baixar/anexar DFDs por protocolo ou por nºs, Ler a Tela Protocolo e Execução dos DFDs (agora também “Só na Centi”). Crie pelos Modelos prontos.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Componentes novos: Selecionar itens (tabela de seleção no painel), Nºs de planejamento, Baixar/anexar DFDs e o seletor de repartições da Centi.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Análise única e AO VIVO: acompanha cada item processado; o painel cabe na tela sem rolar o navegador. Buscar DFD mais rápido (sem OCR, a mesma emissão do Baixar).", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Extensão 1.17.0: só API — o código que operava as telas da Centi saiu. Instale a versão nova.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.30.0",
    data: "2026-10-07",
    titulo: "Fluxos com tela de painel padronizada",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Todo fluxo abre num PAINEL padronizado: Dados de entrada (os campos dos próprios componentes), Etapas ao vivo (estado e itens de cada componente) e Análise (números + tabela dos apontamentos, exportável). O diagrama só aparece em “Diagrama”, para montar o fluxo.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "O Emitir DFD dos fluxos usa a mesma operação do Baixar DFDs (a do servidor) e, se a Centi a recusar, pega a nova da extensão e tenta de novo — como o Baixar DFDs. Campos numéricos aceitam decimais (ex.: tolerância 0,01).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.29.1",
    data: "2026-10-07",
    titulo: "Fluxo não para no meio",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A extensão (1.16.1) encerrava o lote no meio do fluxo (“O lote foi encerrado”) e cada DFD seguinte virava “não encontrado na Centi”: agora só para quando a tela do sistema é recarregada ou fechada de verdade.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "Falha de comunicação com a Centi não marca mais o DFD como divergente (fica “não conferido”); o lote encerrado para o fluxo na hora.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.29.0",
    data: "2026-10-07",
    titulo: "Automações só por API",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "Emitir DFD voltou a funcionar: como a tela da Centi, o sistema abre o planejamento (load da CM002) na entidade do órgão ANTES de emitir — sem isso a Centi respondia “Usuário sem permissão!”. Extensão 1.16.0.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Todas as automações são só por API: a extensão não opera mais as telas da Centi (repartições, Tela Protocolo, CM002 e emissão de protocolo vêm das consultas da própria Centi).", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Fluxos “Inclusão PCA” e “Execução dos DFDs” buscam cada DFD na Centi pelo planejamento (por API), sem depender da lista da CM002.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.28.0",
    data: "2026-10-07",
    titulo: "Conferir DFDs × Centi pelo Emitir DFD",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "O fluxo “Conferir DFDs × Centi” busca CADA DFD na Centi pelo nº de planejamento com o mesmo Emitir DFD do “Baixar DFDs” (por API, sem a lista da CM002) e compara nº, tipo, objeto, valor e itens — marca Divergente (com o motivo) ou Convergente.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Nós “Buscar DFD na Centi” e “Comparar DFD × Centi” para montar fluxos próprios.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.27.1",
    data: "2026-10-07",
    titulo: "CM002 aprendida sem depender da tabela",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "Sem a consulta da CM002 guardada, a extensão (1.15.3) abre a CM002, clica em Pesquisar e espera a consulta ser reconhecida — não depende mais de achar a tabela Resultados (erro “Abri a aba CM002, mas a tabela Resultados não apareceu”).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.27.0",
    data: "2026-10-07",
    titulo: "DFDs conferidos com a CM002",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Modelo de fluxo “Conferir DFDs × CM002”: todos os DFDs do sistema comparados com a CM002 (presença, situação, valor, entidade) e marcados como Divergente ou Convergente.", link: "/painel/automacao" },
      { tipo: "novo", area: "Mesa", texto: "Coluna “Centi” na tabela de DFDs: Convergente/Divergente, com o motivo da divergência na dica.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.26.1",
    data: "2026-10-07",
    titulo: "Tela Protocolo pela API, por repartição",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A consulta da Tela Protocolo (postdata) vai à Centi já com a repartição escolhida (Data.Reparticoes) e sem paginação (ItensPerPage) — todos os protocolos dela, pela API. Extensão 1.15.2.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.26.0",
    data: "2026-10-07",
    titulo: "Fluxo Inclusão PCA mais robusto",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Nó “Só os não cadastrados”: os protocolos que já estão no sistema não são emitidos nem lidos de novo.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Nó “Conferir DFDs na CM002”: fora da CM002, situação proibida ou fora da esperada, valor divergente (com tolerância) e entidade diferente.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Filtro de repartição seguro: sem o departamento na resposta da Centi, o fluxo para em vez de pegar todos os protocolos.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "A Centi é reconhecida sozinha: sem a consulta aprendida, a extensão (1.15.1) abre a CM002/Tela Protocolo, pesquisa uma vez e segue pela API — sem o erro “Abra a CM002…”.", link: "/painel/automacao" },
      { tipo: "novo", area: "Notificações", texto: "Ao terminar, o fluxo avisa no sino: importados, não importados com o motivo e os apontamentos.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.25.2",
    data: "2026-10-07",
    titulo: "Fluxos só pela API",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Os fluxos buscam os protocolos SÓ pela API da Centi (nunca mais pela tela); o modelo Inclusão PCA já vem na repartição “PCA - COORDENADOR (JHONE)”.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.25.1",
    data: "2026-10-07",
    titulo: "Modelos de fluxo à vista",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "Os modelos prontos (como “Inclusão PCA — conferir na CM002 e protocolar”) aparecem na lista de fluxos com “Usar este modelo”; o já criado abre direto.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.25.0",
    data: "2026-10-07",
    titulo: "Fluxo Inclusão PCA: CM002 + protocolação automática",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Modelo de fluxo “Inclusão PCA — conferir na CM002 e protocolar”, a cada 2 horas: lê os protocolos Em análise da repartição escolhida, confere os DFDs de Inclusão na CM002, aponta os divergentes e importa o protocolo na Mesa com os apontamentos na observação.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Blocos novos: Desdobrar lista (um item por DFD) e Importar protocolo na Mesa (a mesma régua da importação manual — não importa o que já está no sistema nem o protocolo com DFD em erro). O bloco Protocolos ganhou as repartições fixas.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Ler protocolo traz os DFDs completos (nº de planejamento, tipo, valor, itens) e um protocolo que falha não para os outros.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.24.0",
    data: "2026-10-06",
    titulo: "Fluxos de automação (estilo N8N)",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Fluxos personalizados: monte automações ligando blocos num editor visual — buscar na Centi (CM002, repartições, protocolos por situação), dados do sistema, ler protocolos, SE, Comparar A × B, Laço até o fim, Filtrar, Agrupar e Apontar erros.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Frequência por fluxo (a cada N minutos, diário, dias úteis, semanal, mensal) e modelos prontos: execução dos DFDs na CM002 e leitura dos protocolos analisados. Extensão 1.15.0.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.23.0",
    data: "2026-10-06",
    titulo: "Tela Protocolo lida pela API",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Ler “Em Análise” da Tela Protocolo vai pela API da Centi (todas as linhas, sem mexer na tela); a tela é usada só uma vez para ensinar a consulta. Extensão 1.14.0.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.22.1",
    data: "2026-10-06",
    titulo: "Andamento flutuante e status único da execução",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "O andamento da verificação da CM002 (barra e entidades) flutua no rodapé da tela, recolhível, sem empurrar os números nem a tabela.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Mesa", texto: "O selo de execução do DFD mostra um status só (a situação da Centi), sem repetir “Não executado · Não Executado”.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.22.0",
    data: "2026-10-06",
    titulo: "Execução no banner do DFD e verificação ao vivo",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "O cabeçalho do banner do DFD mostra a execução na Centi: Executado, Não executado (com a situação) ou Não verificado.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Automação", texto: "Verificar execução mostra a barra de andamento por entidade e um cartão por entidade (órgãos, DFDs, lidos, não executados, só na Centi).", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Em Ajustes, os órgãos com o ID da entidade cadastrado ficam fixos; descobrir/tentar vale só para os sem ID.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.21.1",
    data: "2026-10-06",
    titulo: "Execução dos DFDs gravada em todas as entidades",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A situação lida pela API da CM002 não era gravada (“esperava um objeto, recebeu um vetor”); agora grava em todas as entidades e mostra a falha de cada uma.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.21.0",
    data: "2026-10-06",
    titulo: "Execução dos DFDs lida pela API da Centi",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Verificar execução lê a CM002 pela API (sem mexer na tela): TODAS as linhas, de cada entidade cadastrada nos órgãos, numa passada só. Na 1ª vez, clique em Pesquisar na CM002 para o sistema aprender a consulta.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Visões separadas: Situação diferente de Executado, Não encontrados na Centi e Só na Centi (planejamentos sem DFD no sistema).", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Extensão 1.13.0 (atualize-a pelo botão Baixar extensão).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.20.1",
    data: "2026-10-06",
    titulo: "Salvar no rodapé do órgão",
    mudancas: [
      { tipo: "melhoria", area: "Órgãos e Unidades", texto: "No banner de editar/criar órgão, o Salvar fica fixo no rodapé, como nos demais banners; o Cancelar saiu (o X já fecha).", link: "/painel/orgaos" },
    ],
  },
  {
    versao: "1.20.0",
    data: "2026-10-06",
    titulo: "ID da entidade da Centi no órgão",
    mudancas: [
      { tipo: "novo", area: "Órgãos e Unidades", texto: "Campo “ID da entidade na Centi” no cadastro do órgão (o nº do seletor do topo da Centi — ex.: 02 - Prefeitura, 03 - Fundo Municipal de Saúde) e a coluna “Centi” na lista.", link: "/painel/orgaos" },
      { tipo: "melhoria", area: "Automação", texto: "Com o ID cadastrado, o Baixar DFDs emite direto na entidade do órgão (sem tentar entidade por entidade) e a Verificar execução já sabe quais DFDs são da entidade aberta na Centi.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.19.2",
    data: "2026-10-06",
    titulo: "Execução dos DFDs por entidade da Centi",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A CM002 mostra só os planejamentos da ENTIDADE aberta na Centi: a verificação agora vale só para os DFDs do órgão ligado a essa entidade (o mapa órgão → entidade do Baixar DFDs, com o atalho “ligar à entidade aberta”) — o mesmo ID em outra entidade nunca é confundido. A tabela da CM002 é lida inteira (ela desenha só as linhas à vista: a extensão rola a lista só para ler). Extensão 1.12.2 (reinstale).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.19.1",
    data: "2026-10-06",
    titulo: "Execução dos DFDs: leitura direta da CM002",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A verificação da execução lê a coluna Situação direto da tabela Resultados da CM002, como está na tela — sem abrir nenhum planejamento e sem clicar em nada quando a pesquisa já está feita (só pesquisa sem filtro se a tabela estiver vazia e passa de página só enquanto faltar algum planejamento). Extensão 1.12.1 (reinstale).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.19.0",
    data: "2026-10-06",
    titulo: "Execução dos DFDs pela Centi (CM002)",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Tarefa “Verificar execução dos DFDs (CM002)”: a extensão lê a Situação de cada planejamento na tela CM002 da Centi (ID = nº de planejamento) e grava em cada DFD — Executado, Cancelado ou outra situação. Só leitura na Centi. Extensão 1.12.0 (reinstale).", link: "/painel/automacao" },
      { tipo: "novo", area: "Mesa", texto: "Coluna “Execução” na lista de DFDs, com filtro: verde = executado, vermelho = cancelado, âmbar = outra situação.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.18.0",
    data: "2026-10-06",
    titulo: "Ano do PCA na previsão e periodicidade no Dashboard",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "O ano da previsão de entrega do DFD é SEMPRE o ano do PCA: o ano escrito no texto, de um contrato ou de uma data antiga, não vale mais, e o nº de um contrato/ata/processo nunca vira data.", link: "/painel/mesa" },
      { tipo: "novo", area: "Mesa", texto: "Previsão GENÉRICA reconhecida e escolhida no Tratamento e na edição em massa: anual, semestral, quadrimestral ou trimestral — o ano fica travado no do PCA.", link: "/painel/mesa" },
      { tipo: "novo", area: "PCA", texto: "Dashboard: \"Definição da Previsão\" compara os itens com o mês definido, os de definição genérica e os sem previsão (valor, itens e %).", link: "/painel/pca" },
      { tipo: "novo", area: "PCA", texto: "Dashboard: \"Contratações Periódicas\" separa os itens anuais, semestrais, quadrimestrais e trimestrais do cronograma, com o filtro \"Previsão\" no topo.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "O Cronograma Mensal mostra só os itens com o mês definido; a leitura \"Distribuído\" soma os genéricos em 1/12 por mês (o fluxo do ano).", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.17.3",
    data: "2026-10-06",
    titulo: "Não lidas reais nas bolhas",
    mudancas: [
      { tipo: "correcao", area: "Chat", texto: "O número em cima da bolha é o das mensagens realmente não lidas: ler em outra aba ou aparelho zera também aqui." },
      { tipo: "correcao", area: "Chat", texto: "A mensagem que chega no instante em que você lê continua contando como não lida, e nenhuma é contada duas vezes ao abrir o sistema." },
    ],
  },
  {
    versao: "1.17.2",
    data: "2026-10-06",
    titulo: "Fotos dos membros iguais às do cabeçalho",
    mudancas: [
      { tipo: "melhoria", area: "Tarefas", texto: "Os membros na faixa do quadro usam a MESMA pilha de fotos do cabeçalho: mesmo tamanho, o ponto ao vivo, leque ao passar o mouse e o \"+N\" do mesmo tamanho.", link: "/painel/tarefas" },
      { tipo: "correcao", area: "Tarefas", texto: "O ponto de presença de cada membro não fica mais coberto pela foto vizinha (a primeira foto fica por cima).", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.17.1",
    data: "2026-10-06",
    titulo: "Bolhas abrem espaço e se encaixam",
    mudancas: [
      { tipo: "melhoria", area: "Chat", texto: "Ao arrastar uma bolha por cima das outras, elas abrem espaço na hora; uma sombra mostra onde ela vai pousar." },
      { tipo: "novo", area: "Chat", texto: "Ímã: soltar perto de outra bolha a encaixa colada a ela; soltar longe a deixa onde foi solta." },
      { tipo: "correcao", area: "Chat", texto: "Arrasto mais leve (um desenho por quadro), sem pulo quando se pega uma bolha ainda pousando, e sem inclinação ou voo com \"reduzir movimento\"." },
    ],
  },
  {
    versao: "1.17.0",
    data: "2026-10-06",
    titulo: "Bolhas do chat independentes",
    mudancas: [
      { tipo: "melhoria", area: "Chat", texto: "Cada bolha é independente: arrastar uma leva só ela — as outras ficam onde estão e só abrem espaço se ela pousar em cima." },
      { tipo: "novo", area: "Chat", texto: "Cada bolha encosta na borda mais perto, na altura em que foi solta (um peteleco a arremessa ao outro lado), e o lugar de cada uma fica guardado." },
      { tipo: "melhoria", area: "Chat", texto: "A janela da conversa abre ao lado da própria bolha. No teclado, Alt + ↑/↓ sobe ou desce a bolha e Alt + ←/→ troca de lado." },
    ],
  },
  {
    versao: "1.16.1",
    data: "2026-10-06",
    titulo: "Card do PCA mais discreto e carregamento fluido",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "Ao abrir um PCA, o indicador de carregamento gira sem travar, mesmo enquanto a tela é montada.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Informações sobre a capa mais discretas: pílulas menores, valor e contagens contidos e um degradê só na base.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.16.0",
    data: "2026-10-06",
    titulo: "Bolhas do chat livres",
    mudancas: [
      { tipo: "novo", area: "Chat", texto: "Reordene as bolhas arrastando dentro da coluna: as outras abrem espaço e a ordem fica guardada. No teclado, Alt + ↑/↓." },
      { tipo: "novo", area: "Chat", texto: "Arremesse a pilha: um peteleco leva as bolhas para o outro lado da tela, com inércia e mola. No teclado, Alt + ←/→." },
      { tipo: "melhoria", area: "Chat", texto: "Ao arrastar, as outras bolhas seguem em cadeia e a bolha inclina com a velocidade; parada, ela assenta." },
      { tipo: "melhoria", area: "Chat", texto: "A janela da conversa fecha em 0,06 s." },
    ],
  },
  {
    versao: "1.15.1",
    data: "2026-10-06",
    titulo: "Fechamento rápido do chat",
    mudancas: [
      { tipo: "melhoria", area: "Chat", texto: "A janela da conversa fecha em cerca de 0,1 s (antes ~0,4 s) — some na hora ao minimizar, tocar fora ou arrastar a bolha." },
      { tipo: "melhoria", area: "Chat", texto: "A bolha solta na lixeira some mais rápido, e a lixeira sai junto." },
    ],
  },
  {
    versao: "1.15.0",
    data: "2026-10-06",
    titulo: "Conversas guardadas por 7 dias",
    mudancas: [
      { tipo: "novo", area: "Chat", texto: "As conversas (do grupo, privadas e em grupo) ficam guardadas por 7 dias: depois de recarregar, a lista, as não lidas e o histórico voltam. Quem estava fora vê a mensagem ao entrar." },
      { tipo: "melhoria", area: "Chat", texto: "O ✓✓ (lida) também fica guardado; as bolhas abertas voltam ao recarregar." },
      { tipo: "melhoria", area: "Chat", texto: "Arrastar a bolha já minimiza a conversa; ao soltar, as bolhas voam até o lugar novo com mola, em cadeia — sem pulo." },
      { tipo: "melhoria", area: "Chat", texto: "A lixeira fecha a bolha — a conversa continua na lista até completar 7 dias." },
    ],
  },
  {
    versao: "1.14.5",
    data: "2026-10-06",
    titulo: "Card do PCA: carregamento e capa renovados",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Ao abrir um PCA, o card continua à vista: um brilho varre o card e uma barra de progresso corre na borda de baixo.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Status e fonte em pílulas de vidro iguais; na base, o ano, o nome, o valor e as contagens em chips sobre um degradê de leitura.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.14.4",
    data: "2026-10-06",
    titulo: "Cards do PCA maiores e Dashboard mais leve",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Cards dos PCAs maiores, com o nome e o valor proporcionais ao card e uma faixa de leitura sobre a capa.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Entrar no PCA ficou mais leve: os itens do Dashboard vão ao navegador num formato compacto, preparado uma vez por atualização dos dados.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.14.3",
    data: "2026-10-06",
    titulo: "Arrastar a bolha do chat",
    mudancas: [
      { tipo: "correcao", area: "Chat", texto: "A bolha com foto agora se arrasta de verdade — antes o navegador arrastava/selecionava a imagem." },
    ],
  },
  {
    versao: "1.14.2",
    data: "2026-10-06",
    titulo: "Chat estável, Ao vivo num só lugar e lixeira",
    mudancas: [
      { tipo: "correcao", area: "Chat", texto: "O chat não some mais: uma falha passageira ao recarregar a tela não desmonta o canal nem apaga as conversas." },
      { tipo: "correcao", area: "Chat", texto: "\"Lida\" (✓✓) e \"digitando…\" das conversas privadas e em grupo funcionam mesmo com as pessoas em grupos ativos diferentes; \"entregue\" só conta quem está mesmo conectado." },
      { tipo: "melhoria", area: "Cabeçalho", texto: "Quem está online e as conversas ficam num único painel \"Ao vivo\", com abas Online e Conversas." },
      { tipo: "melhoria", area: "Chat", texto: "A conversa minimiza ao tocar em qualquer lugar da página ou no ícone — ou fica aberta com o alfinete. Para excluir, arraste a bolha até a lixeira no centro inferior." },
      { tipo: "melhoria", area: "Chat", texto: "Fotos sempre redondas, sombra nos componentes flutuantes e animações novas (a janela cresce da bolha, a lixeira atrai a bolha)." },
    ],
  },
  {
    versao: "1.14.1",
    data: "2026-10-06",
    titulo: "Presença no nível profissional",
    mudancas: [
      { tipo: "correcao", area: "Cabeçalho", texto: "O ponto verde/âmbar voltou ao canto da foto (saía para o lado) e o halo ao vivo ficou mais discreto." },
      { tipo: "melhoria", area: "Cabeçalho", texto: "Até 5 fotos de quem está online e, depois, o círculo \"+N\" (com os nomes na dica)." },
      { tipo: "melhoria", area: "Cabeçalho", texto: "Ausente mostra há quanto tempo (\"Ausente há 12 min\")." },
      { tipo: "melhoria", area: "Presença", texto: "Recarregar a página (F5) não faz a pessoa sumir e voltar: há uma carência de 12 s antes de mostrar a saída." },
      { tipo: "melhoria", area: "Presença", texto: "Quem perdeu a internet sem fechar o sistema sai da lista em até 3 min; sem rede, a tela mostra \"Reconectando…\" e volta sozinha." },
    ],
  },
  {
    versao: "1.14.0",
    data: "2026-10-06",
    titulo: "Chat no estilo Messenger e conversas em grupo",
    mudancas: [
      { tipo: "novo", area: "Chat", texto: "Cada conversa aberta vira uma bolha flutuante com a foto da pessoa; tocar abre a conversa ao lado. Arraste a bolha para qualquer lugar da tela — ela encosta na borda — ou até o × para fechar." },
      { tipo: "novo", area: "Chat", texto: "Conversas em grupo: no ícone do chat, \"Nova conversa em grupo\" com 2 ou mais pessoas do grupo e um nome. Só ao vivo — nada é salvo." },
      { tipo: "melhoria", area: "Cabeçalho", texto: "\"Conversar\" em cada pessoa do painel Online agora; mensagem nova faz a bolha quicar e avisa a quem não foi entregue." },
    ],
  },
  {
    versao: "1.13.0",
    data: "2026-10-06",
    titulo: "Onde cada pessoa está",
    mudancas: [
      { tipo: "novo", area: "Cabeçalho", texto: "No painel Online agora, a tela em que cada pessoa está e o que ela tem aberto (ex.: Mesa › Protocolo 144756/2026 · editando), e a seção Nesta tela." },
      { tipo: "novo", area: "Mesa", texto: "Nas tabelas de protocolos e DFDs, a foto de quem está com o item aberto agora (lápis âmbar quando está editando).", link: "/painel/mesa" },
      { tipo: "novo", area: "Tarefas", texto: "O mesmo nos cartões das tarefas.", link: "/painel/tarefas" },
      { tipo: "melhoria", area: "Configurações", texto: "O ADM liga ou desliga \"Mostrar onde cada pessoa está\" (Presença e chat); nada é gravado.", link: "/painel/configuracoes?aba=presenca" },
    ],
  },
  {
    versao: "1.12.0",
    data: "2026-10-06",
    titulo: "Quem está vendo e editando agora",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "No banner do protocolo e do DFD, as fotos de quem mais está com ele aberto, ao vivo.", link: "/painel/mesa" },
      { tipo: "novo", area: "Mesa", texto: "Aviso em âmbar quando outra pessoa tem alterações não salvas no mesmo protocolo ou DFD — combine antes de salvar.", link: "/painel/mesa" },
      { tipo: "novo", area: "Tarefas", texto: "O mesmo na tarefa aberta, e \"Conversar sobre\" abre o chat do grupo com o link do item.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.11.0",
    data: "2026-10-06",
    titulo: "Chat ao vivo",
    mudancas: [
      { tipo: "novo", area: "Cabeçalho", texto: "Chat ao vivo com o grupo ativo e conversas privadas entre pessoas de um mesmo grupo — as mensagens não são salvas." },
      { tipo: "novo", area: "Cabeçalho", texto: "Digitando…, ✓ enviada e ✓✓ lida (lida por N no grupo), responder citando, @menção e links do sistema que viram cartões." },
      { tipo: "novo", area: "Configurações", texto: "O ADM liga o chat do grupo e o privado (aba Presença e chat).", link: "/painel/configuracoes?aba=presenca" },
    ],
  },
  {
    versao: "1.10.0",
    data: "2026-10-06",
    titulo: "Presença ao vivo 2.0",
    mudancas: [
      { tipo: "melhoria", area: "Cabeçalho", texto: "Quem está online pulsa ao vivo: as fotos se abrem em leque, quem acaba de entrar brilha e o número desliza." },
      { tipo: "novo", area: "Cabeçalho", texto: "Seu status — Disponível, Ocupado, Em reunião ou Não perturbe — com recado e prazo; o Não perturbe silencia o som do sino." },
      { tipo: "novo", area: "Cabeçalho", texto: "Online · Ausente · Visto recentemente, com busca; tocar numa pessoa abre o WhatsApp ou os protocolos dela na Mesa." },
      { tipo: "melhoria", area: "Sistema", texto: "O ponto de presença aparece nas fotos do sistema: Responsável da Mesa, seletores de pessoa, membros do quadro e convidados." },
      { tipo: "novo", area: "Configurações", texto: "Ausente por inatividade: o ADM escolhe depois de quantos minutos parado.", link: "/painel/configuracoes?aba=presenca" },
      { tipo: "novo", area: "Armazenamento", texto: "Online agora: quem está com o sistema aberto em cada grupo.", link: "/painel/armazenamento" },
    ],
  },
  {
    versao: "1.9.0",
    data: "2026-10-06",
    titulo: "Dashboard do PCA mais imersivo, com filtros e a Consulta em aba própria",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "Filtros do Dashboard em menus: Classificação, Mês (com os anuais à parte), Prioridade, Unidade e Unidade de medida — vários valores, só as opções que existem com os demais filtros, com a contagem de itens.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Consulta de itens numa aba própria (Gráficos | Consulta de itens), seguindo os mesmos filtros.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Top 100 itens por valor (antes Top 10), numa lista que rola por dentro, com a posição de cada item.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Gráficos animados: indicadores que correm até o valor novo, barras e colunas que crescem, rosca com o destaque da fatia e o valor no centro.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.8.0",
    data: "2026-10-06",
    titulo: "Novos gráficos e relatório do Dashboard do PCA",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "Gráfico de Prioridade dos DFDs (Alta, Média, Baixa nas cores de semáforo) e Valor por unidade requisitante (as 10 maiores + as demais) — também filtram o Dashboard.", link: "/painel/pca" },
      { tipo: "novo", area: "PCA", texto: "Cronograma em três leituras: por mês, acumulado e com os anuais à parte (uma coluna \"Anual\").", link: "/painel/pca" },
      { tipo: "novo", area: "PCA", texto: "Relatório do Dashboard em PDF: os indicadores e uma tabela por gráfico com o % do total, respeitando os filtros.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.7.0",
    data: "2026-10-06",
    titulo: "Gráficos do PCA que se filtram e se expandem",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "Filtro cruzado: tocar numa fatia ou barra filtra os outros gráficos, os indicadores e a Consulta; os filtros ficam em etiquetas removíveis, com \"Ver origem\".", link: "/painel/pca" },
      { tipo: "novo", area: "PCA", texto: "Expandir o gráfico: ranking de todas as categorias, detalhe com valor, participação e posição, tabela com % do total e a imagem em PNG.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Gráficos com um visual só (cores do tema claro e escuro, mesma cor por categoria), unidades de medida com \"Outras\" e Itens ou Valor, e o cartão \"Maior item\" abre o item.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.6.0",
    data: "2026-10-06",
    titulo: "Quem do grupo está online",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Presença ao vivo: o ADM liga a exibição de quem do grupo está online, os ausentes e a opção de aparecer invisível.", link: "/painel/configuracoes?aba=presenca" },
      { tipo: "novo", area: "Cabeçalho", texto: "As fotos de quem do grupo ativo está com o sistema aberto, ao vivo (verde = online, âmbar = ausente); tocar abre a lista." },
      { tipo: "novo", area: "Perfil", texto: "Aparecer como invisível: você continua vendo quem está online, sem aparecer para os outros.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.5.0",
    data: "2026-10-06",
    titulo: "Saúde dos dados e acessibilidade",
    mudancas: [
      {
        tipo: "novo",
        area: "Armazenamento",
        texto: "Saúde dos dados: a integridade dos totais (DFD × itens, abas da Mesa, numeração do PCA, rastro) e os dados a tratar (capa × somatória, itens sem valor unitário, gravação incompleta, DFD sem planejamento), com o protocolo de cada um — tocar abre na Mesa.",
        link: "/painel/armazenamento",
      },
      { tipo: "melhoria", area: "Sistema", texto: "Acessibilidade: Esc fecha o menu no celular, a data da assinatura validada pela equipe tem rótulo próprio e os leitores de tela ignoram os fundos decorativos." },
    ],
  },
  {
    versao: "1.4.4",
    data: "2026-10-06",
    titulo: "Atualização de segurança e publicação em fila",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "Next.js 16.3.8 (corrige um alerta crítico de segurança) e ferramentas de publicação atualizadas: nenhum alerta crítico ou alto nas dependências." },
      { tipo: "melhoria", area: "Sistema", texto: "Publicação em fila: uma atualização nova espera a anterior terminar, em vez de interrompê-la no meio." },
    ],
  },
  {
    versao: "1.4.3",
    data: "2026-10-06",
    titulo: "Dashboard do PCA com todos os itens",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "A Consulta de Itens do Dashboard mostra todos os itens do PCA, sem o limite de 5.000 linhas.", link: "/painel/pca" },
      {
        tipo: "novo",
        area: "PCA",
        texto: "Nova visão \"Fora da soma\": os DFDs que ficaram fora pela regra do nº de planejamento (repetido, alteração ou exclusão), com o motivo e o DFD que prevaleceu.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.4.2",
    data: "2026-10-05",
    titulo: "Vínculos da unidade sem repetição",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "No banner dos vínculos da unidade, cada unidade do orçamento aparece uma vez só; as ações sem vínculo ficam no selo dela.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.4.1",
    data: "2026-10-05",
    titulo: "Valores dos DFDs com a precisão da Centi",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "O valor do DFD guarda as 4 casas dos preços da Centi: as abas Protocolos, DFDs e Itens mostram sempre o mesmo centavo.", link: "/painel/mesa" },
      { tipo: "correcao", area: "Mesa", texto: "A capa do protocolo é conferida com a somatória exata: diferença menor que 1 centavo (arredondamento da Centi) não aponta mais divergência.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.4.0",
    data: "2026-10-05",
    titulo: "Sino: ver é ler, fixar não lidas e Novidades flutuantes",
    mudancas: [
      { tipo: "melhoria", area: "Sino", texto: "Ver o aviso no sino já o marca como visualizado — sem precisar abrir." },
      { tipo: "melhoria", area: "Sino", texto: "Novo marcador de visualizada: vazio enquanto não vista, colorido com ✓ depois." },
      { tipo: "novo", area: "Sino", texto: "Marcar como não visualizada FIXA o aviso: ver de novo não o marca; o toque no marcador solta." },
      { tipo: "melhoria", area: "Novidades", texto: "Abrem num banner flutuante ao lado do sino (ou pela versão no menu), sem sair da tela." },
      { tipo: "correcao", area: "Mesa", texto: "Totais auditados: valor do protocolo = soma dos DFDs = soma dos itens; gravação incompleta aponta erro.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.3.2",
    data: "2026-10-05",
    titulo: "Vínculo do orçamento mais simples",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "O editor do vínculo mostra só o que importa: as ações com a caixa, o total e as ações futuras numa linha; as de outros vínculos resumidas.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.3.1",
    data: "2026-10-05",
    titulo: "Vínculos do orçamento do PCA mais legíveis",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Com o mouse em “N sem vínculo”, a lista das ações sem vínculo organizada por unidade do orçamento, com os valores.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "No vínculo, as unidades ficam separadas da seleção das ações; as marcadas em destaque e as de outros vínculos à parte.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "PDF dos vínculos com o total no topo e duas tabelas (vinculadas e sem vínculo) com a linha de total.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.3.0",
    data: "2026-10-05",
    titulo: "Versão do sistema e Novidades",
    mudancas: [
      { tipo: "novo", area: "Menu", texto: "O número da versão do sistema aparece no fim do menu lateral; tocar abre as Novidades." },
      { tipo: "novo", area: "Novidades", texto: "O histórico de versões: o que mudou em cada uma e o botão para ir até onde mudou." },
      { tipo: "novo", area: "Notificações", texto: "Os administradores recebem no sino cada versão nova, com o que mudou.", link: "/painel/configuracoes?aba=notificacoes" },
    ],
  },
  {
    versao: "1.2.0",
    data: "2026-10-05",
    titulo: "Configurações reorganizadas",
    mudancas: [
      { tipo: "melhoria", area: "Configurações", texto: "Abas num cartão fixo à esquerda, com ícone e dica; o conteúdo ao lado, sem rolar a página.", link: "/painel/configuracoes" },
      { tipo: "melhoria", area: "Configurações", texto: "A aba aberta fica no endereço da página — recarregar volta nela.", link: "/painel/configuracoes?aba=identidade" },
      { tipo: "melhoria", area: "Configurações", texto: "Excluir um PCA pede a confirmação do próprio sistema.", link: "/painel/configuracoes?aba=pcas" },
    ],
  },
  {
    versao: "1.1.0",
    data: "2026-10-04",
    titulo: "Notificações profissionais",
    mudancas: [
      { tipo: "novo", area: "Notificações", texto: "Controle central dos avisos (sino, e-mail e o que cada pessoa pode desligar), limpeza automática e comunicados.", link: "/painel/configuracoes?aba=notificacoes" },
      { tipo: "novo", area: "Sino", texto: "Avisos em tempo real, agrupados por dia, com adiar, silenciar, limpar e desfazer." },
      { tipo: "novo", area: "Perfil", texto: "Cada pessoa escolhe os avisos do sino, o e-mail imediato ou o resumo diário e o horário de silêncio.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.0.0",
    data: "2026-10-01",
    titulo: "Primeira versão numerada",
    mudancas: [{ tipo: "novo", area: "Sistema", texto: "Mesa, PCA, Catálogo, Orçamento, Tarefas, Calendário e Automação em produção." }],
  },
];

export const VERSAO_ATUAL = VERSOES[0].versao;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
export const versaoValida = (v: string) => SEMVER.test(v);

/** Negativo = `a` mais antiga. */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Só caminho interno (nunca outro site). */
export const linkInterno = (l: string) => l.startsWith("/") && !l.startsWith("//") && !/[\s\\]/.test(l);

export const versaoPorNumero = (v: string | null | undefined): Versao | undefined => VERSOES.find((x) => x.versao === v);

/** "05/10/2026". */
export const dataVersao = (d: string) => {
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
};

const MAX_LINHAS_AVISO = 4;

/** O texto do aviso: o que mudou, uma linha por mudança (até 4 + "e mais N"). */
export function textoMudancas(v: Versao): string {
  const linhas = v.mudancas.slice(0, MAX_LINHAS_AVISO).map((m) => `• ${m.area}: ${m.texto}`);
  const resto = v.mudancas.length - MAX_LINHAS_AVISO;
  if (resto > 0) linhas.push(`e mais ${resto} ${resto === 1 ? "mudança" : "mudanças"}`);
  return linhas.join("\n");
}

/** O aviso no sino de cada Administrador: UM por versão (a `chave`), com o que mudou. Sem link: o sino abre as Novidades
 * daquela versão num banner flutuante (de lá, cada mudança leva ao lugar dela). */
export const avisoNovaVersao = (usuarioId: number, v: Versao = VERSOES[0]) => ({
  usuarioId,
  tipo: "versao" as const,
  titulo: `Nova versão ${v.versao} — ${v.titulo}`,
  texto: textoMudancas(v),
  link: null,
  chave: `versao-sistema:${v.versao}`,
});

/** A versão de um aviso "versao" (pelo título que `avisoNovaVersao` escreve); desconhecida = a atual. */
export function versaoDoAviso(titulo: string): string {
  const v = /vers[aã]o (\d+\.\d+\.\d+)/i.exec(titulo)?.[1];
  return v && versaoPorNumero(v) ? v : VERSAO_ATUAL;
}

/** Os problemas do registro (o teste exige nenhum): ordem, números, datas, links e mudanças. */
export function problemasDasVersoes(lista: readonly Versao[] = VERSOES): string[] {
  const p: string[] = [];
  lista.forEach((v, i) => {
    if (!versaoValida(v.versao)) p.push(`${v.versao}: número fora do padrão X.Y.Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data)) p.push(`${v.versao}: data fora do padrão AAAA-MM-DD`);
    if (!v.titulo.trim()) p.push(`${v.versao}: sem título`);
    if (v.mudancas.length === 0) p.push(`${v.versao}: sem mudanças`);
    for (const m of v.mudancas) if (m.link && !linkInterno(m.link)) p.push(`${v.versao}: link externo ou inválido (${m.link})`);
    const ant = lista[i + 1];
    if (ant && compararVersoes(v.versao, ant.versao) <= 0) p.push(`${v.versao}: não é maior que ${ant.versao}`);
    if (ant && v.data < ant.data) p.push(`${v.versao}: data anterior à da ${ant.versao}`);
  });
  return p;
}
