/**
 * VERSÕES do sistema — o registro de mudanças (changelog) é a FONTE ÚNICA da versão exibida no menu, da página de
 * Novidades e do aviso no sino. Puro (sem DOM/banco) e testado.
 *
 * Como publicar uma versão nova: acrescente uma entrada NO TOPO de `VERSOES` (a versão maior que a anterior — semver:
 * MAIOR quando muda o jeito de trabalhar, MENOR para recurso novo, CORREÇÃO para ajuste), cada mudança com o `link` de
 * ONDE ela está, e ponha o mesmo número no `package.json`. O deploy faz o resto: o menu mostra o número e cada pessoa
 * recebe UM aviso no sino com o que mudou NAS TELAS QUE O GRUPO DELA ABRE (o ADM, tudo — `mudancasVisiveis`; tocar abre
 * as Novidades num banner flutuante — sem sair da tela).
 */

import { ABAS } from "./abas.ts";

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
    versao: "1.150.0",
    data: "2026-10-21",
    titulo: "Documentos nos PCAs, na pesquisa e no sino",
    mudancas: [
      { tipo: "novo", area: "Documentos", texto: "Cada documento pode ficar em PCAs específicos ou em todos — menu “…” → PCAs vinculados.", link: "/painel/documentos" },
      { tipo: "novo", area: "Documentos", texto: "Filtro por PCA ao lado da pesquisa (também “Sem PCA”).", link: "/painel/documentos" },
      { tipo: "novo", area: "PCA", texto: "Aba Documentos no espaço do PCA: os documentos dele, vincular e desvincular dali mesmo.", link: "/painel/pca" },
      { tipo: "novo", area: "Pesquisa", texto: "Documentos aparecem na pesquisa rápida do menu (prefixo “documento:” ou “do:”).", link: "/painel/documentos" },
      { tipo: "melhoria", area: "Documentos", texto: "Seguem o grupo: o documento só de PCAs de fora do seu grupo não aparece, e o papel decide o que se faz.", link: "/painel/documentos" },
      { tipo: "novo", area: "Notificações", texto: "Os administradores recebem no sino o envio, a edição e a exclusão de documentos (configurável em Notificações).", link: "/painel/configuracoes?aba=notificacoes" },
    ],
  },
  {
    versao: "1.149.4",
    data: "2026-10-21",
    titulo: "Documentos: cartão do link sem repetição",
    mudancas: [
      { tipo: "melhoria", area: "Documentos", texto: "O cartão do documento do Drive não repete mais “No Google Drive”: o Tamanho já diz “Drive”.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.149.3",
    data: "2026-10-21",
    titulo: "Documentos: publicação dos decodificadores de PDF",
    mudancas: [
      { tipo: "correcao", area: "Documentos", texto: "A correção dos PDFs digitalizados chega ao ar: só os decodificadores necessários são publicados.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.149.2",
    data: "2026-10-21",
    titulo: "Domínio dos itens de protocolo em toda tela",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "O Dashboard e a consulta do PCA passam a recalcular logo depois que os itens são reclassificados — o domínio dos itens de protocolo aparece no gráfico, no filtro e na tabela.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Mesa", texto: "O detalhe do item mostra o domínio (material ou serviço) gravado.", link: "/painel/mesa?vista=itens" },
    ],
  },
  {
    versao: "1.149.1",
    data: "2026-10-21",
    titulo: "Documentos: PDFs digitalizados com as letras",
    mudancas: [
      { tipo: "correcao", area: "Documentos", texto: "PDFs digitalizados (scan em camadas, como decretos) aparecem com as letras ao ver, ao compactar e pelo link do Drive.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.149.1",
    data: "2026-10-21",
    titulo: "Geral com o número de unidades",
    mudancas: [
      {
        tipo: "correcao",
        area: "Cabeçalho",
        texto: "A opção da soma das unidades agora se chama “Geral (N unidades)”, vem escolhida e aparece para todos que acessam mais de uma unidade.",
        link: "/painel/mesa",
      },
    ],
  },
  {
    versao: "1.149.0",
    data: "2026-10-21",
    titulo: "Geral das minhas unidades e fonte dos dados por aba",
    mudancas: [
      {
        tipo: "novo",
        area: "Cabeçalho",
        texto: "Quem acessa mais de uma unidade ganha a opção “Geral”, já escolhida, com os dados somados de todas as suas unidades.",
        link: "/painel/mesa",
      },
      {
        tipo: "novo",
        area: "Grupos",
        texto: "No banner do grupo, “Fonte dos dados”: cada aba das telas usa a unidade selecionada no cabeçalho ou a fonte única (sempre a soma das unidades da pessoa). Substitui as “Funções das telas”.",
        link: "/painel/grupos",
      },
    ],
  },
  {
    versao: "1.148.0",
    data: "2026-10-21",
    titulo: "Documentos: link do Drive sem upload",
    mudancas: [
      { tipo: "novo", area: "Documentos", texto: "“Colar link do Google” não envia mais o arquivo: guarda só o link e abre o PDF direto do Drive, sempre na versão atual.", link: "/painel/documentos" },
      { tipo: "correcao", area: "Documentos", texto: "A escolha do tamanho do PDF começa no original — o texto não some por uma compactação forte escolhida sem querer.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.147.0",
    data: "2026-10-21",
    titulo: "Classificação e domínio gravados em todo item",
    mudancas: [
      {
        tipo: "novo",
        area: "Itens",
        texto: "Todo item — de protocolo ou de planilha — tem a Classificação (do cadastro do Catálogo; na planilha, a do arquivo quando o Catálogo não reconhece) e o Domínio (Material ou Serviço) gravados no banco. Mudar o cadastro regrava sozinho.",
        link: "/painel/catalogo",
      },
      {
        tipo: "novo",
        area: "Catálogo · Classificações",
        texto: "Cada classificação define o Domínio dos itens dela (Material, Serviço ou pela descrição).",
        link: "/painel/catalogo",
      },
      { tipo: "melhoria", area: "Mesa · Itens", texto: "Coluna Domínio na visão Itens.", link: "/painel/mesa?vista=itens" },
      { tipo: "melhoria", area: "PCA · Dashboard", texto: "O gráfico e o filtro de Domínio passam a valer para todos os itens, também os vindos de protocolos.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.146.1",
    data: "2026-10-21",
    titulo: "Documentos: fontes do PDF e card do link",
    mudancas: [
      { tipo: "correcao", area: "Documentos", texto: "As fontes do PDF passam a carregar no leitor (o texto aparece ao ver e ao compactar).", link: "/painel/documentos" },
      { tipo: "melhoria", area: "Documentos", texto: "O link do Google virou um card próprio, “Colar link do Google”, ao lado de “Enviar PDF”.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.146.0",
    data: "2026-10-21",
    titulo: "Documentos: texto que sumia e PDF por link do Google",
    mudancas: [
      { tipo: "correcao", area: "Documentos", texto: "As letras de PDFs com fontes não embutidas (Word, Google Docs) não somem mais ao ver nem ao compactar.", link: "/painel/documentos" },
      { tipo: "novo", area: "Documentos", texto: "“Usar link do Google”: cole o link do Docs ou do Drive e o PDF é copiado e guardado como um enviado.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.145.0",
    data: "2026-10-21",
    titulo: "PCA: Domínio dos itens no Dashboard",
    mudancas: [
      {
        tipo: "novo",
        area: "PCA · Dashboard",
        texto: "O Domínio do item (material, serviço…) entra no Dashboard: gráfico “Domínio dos Itens”, filtro no topo, coluna na consulta e no relatório — só quando há dados. A Classificação segue com o próprio gráfico.",
        link: "/painel/pca",
      },
      { tipo: "melhoria", area: "PCA · Importação", texto: "A visão Itens mostra também o Domínio.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.144.0",
    data: "2026-10-21",
    titulo: "Grupos: funções de cada tela e orçamentos do grupo",
    mudancas: [
      {
        tipo: "novo",
        area: "Grupos",
        texto: "No banner do grupo, “Funções das telas” liga ou desliga as partes de cada tela para o grupo — ex.: no PCA, o Dashboard, o Orçamento, a Mesa do PCA e o Relatório de variação.",
        link: "/painel/grupos",
      },
      {
        tipo: "novo",
        area: "Grupos · Orçamento",
        texto: "“Orçamentos do grupo”: como os PCAs, o grupo vê todos os orçamentos ou só os escolhidos — na lista, na tela do orçamento, na pesquisa e nos vínculos de tarefa.",
        link: "/painel/grupos",
      },
    ],
  },
  {
    versao: "1.143.0",
    data: "2026-10-21",
    titulo: "PCA: Tipo do DFD e Classificação do item separados",
    mudancas: [
      {
        tipo: "correcao",
        area: "PCA · Dashboard",
        texto: "A Classificação dos itens vindos de protocolos mostrava o tipo do DFD. Agora a Classificação é a do item pelo cadastro do Catálogo (Classificações) e o Tipo do DFD tem coluna própria — em todos os PCAs, também no gráfico e nos filtros.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.142.0",
    data: "2026-10-21",
    titulo: "Importação do PCA em cards e itens; avisos só no sino",
    mudancas: [
      { tipo: "melhoria", area: "PCA · Importação", texto: "O upload virou um card no padrão do sistema (capa, data, quem enviou, unidades, itens e valor) e a importação ocupa o tamanho de um card na grade.", link: "/painel/pca" },
      { tipo: "novo", area: "PCA · Importação", texto: "Visão Uploads | Itens, como no Catálogo: todos os itens importados numa tabela (do sequencial maior ao menor); tocar num card abre só os itens dele.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Notificações", texto: "As notificações aparecem só no sino — sem o aviso flutuante na tela.", link: "/painel/perfil?aba=notificacoes" },
    ],
  },
  {
    versao: "1.141.0",
    data: "2026-10-21",
    titulo: "Grupos por unidade de cadastro: acesso de cada tela e várias unidades por pessoa",
    mudancas: [
      { tipo: "novo", area: "Grupos", texto: "No modo “Unidade de cadastro de cada pessoa”, cada tela do grupo escolhe: só as unidades de cadastro da pessoa ou todas as unidades.", link: "/painel/grupos" },
      { tipo: "novo", area: "Usuários", texto: "A pessoa pode trabalhar em várias unidades: o campo “Unidades em que trabalha” marca mais de uma e escolhe a principal.", link: "/painel/usuarios" },
      { tipo: "melhoria", area: "Cabeçalho", texto: "Nas telas com todas as unidades, o seletor de unidade do cabeçalho mostra todas; nas demais, as de cadastro.", link: "/painel/grupos" },
    ],
  },
  {
    versao: "1.140.0",
    data: "2026-10-21",
    titulo: "Documentos: a barra vai até o tamanho do arquivo",
    mudancas: [
      {
        tipo: "correcao",
        area: "Documentos",
        texto: "O ADM agora pode guardar o PDF no tamanho original (até 20 MB): o máximo da barra é o próprio arquivo. O PDF é gravado em partes.",
        link: "/painel/documentos",
      },
    ],
  },
  {
    versao: "1.139.0",
    data: "2026-10-21",
    titulo: "PCA: upload único, sequencial sagrado e avisos aos administradores",
    mudancas: [
      {
        tipo: "melhoria",
        area: "PCA · Importação",
        texto: "Cada arquivo enviado vira UM cartão (com as unidades dele), mesmo a planilha consolidada; excluir o cartão tira o upload inteiro.",
        link: "/painel/pca",
      },
      {
        tipo: "novo",
        area: "PCA · Importação",
        texto:
          "O sequencial é sagrado: nunca dois itens com o mesmo nº no PCA. O nº que vem na planilha sobrescreve o item que já o tinha; sem nº, o item segue a sequência; o arquivo com sequencial repetido não entra.",
        link: "/painel/pca",
      },
      { tipo: "melhoria", area: "PCA · Mesa", texto: "Ao incorporar um protocolo, os itens continuam a sequência do PCA (depois dos itens da planilha), na ordem.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA · Dashboard", texto: "A consulta de itens abre do sequencial maior ao menor — os itens recém-adicionados primeiro.", link: "/painel/pca" },
      {
        tipo: "novo",
        area: "Notificações",
        texto:
          "Movimentação no PCA: os administradores são avisados quando um protocolo é enviado, incorporado ou devolvido, itens são retirados, uma planilha é importada ou excluída e um PCA é criado, alterado ou excluído. Configurável em Configurações → Notificações.",
        link: "/painel/configuracoes?aba=notificacoes",
      },
    ],
  },
  {
    versao: "1.138.0",
    data: "2026-10-21",
    titulo: "Documentos: o ADM escolhe o tamanho de cada PDF",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Documentos",
        texto:
          "Ao enviar um PDF, o administrador escolhe o tamanho numa barra: do mínimo legível (o menor sem prejudicar a leitura) ao tamanho original do arquivo, vendo a prévia da 1ª página. O ADM pode guardar até 1 MB; os demais seguem com até 100 KB, compactados sozinhos.",
        link: "/painel/documentos",
      },
    ],
  },
  {
    versao: "1.137.1",
    data: "2026-10-21",
    titulo: "Documentos: enviar pelo card no fim da grade",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Documentos",
        texto: "O envio de PDFs virou o card \"Enviar PDF\", no tamanho dos demais e logo depois do último documento (tocar escolhe; arrastar solta nele).",
        link: "/painel/documentos",
      },
    ],
  },
  {
    versao: "1.137.0",
    data: "2026-10-21",
    titulo: "Documentos: compactação escolhida pelo ADM",
    mudancas: [
      {
        tipo: "novo",
        area: "Documentos",
        texto:
          "Ao enviar um PDF, o administrador escolhe a compactação: automática (só para caber em 100 KB) ou 25%, 50%, 75% ou 90% menor que o original — sempre com no máximo 100 KB.",
        link: "/painel/documentos",
      },
    ],
  },
  {
    versao: "1.136.0",
    data: "2026-10-21",
    titulo: "Documentos: PDFs guardados no sistema",
    mudancas: [
      {
        tipo: "novo",
        area: "Documentos",
        texto:
          "Módulo novo Documentos: suba PDFs (cada um vira um card), visualize e baixe. Todo documento fica com no máximo 100 KB — o sistema compacta sozinho, baixando a qualidade até caber. Permissão própria por grupo e papel.",
        link: "/painel/documentos",
      },
    ],
  },
  {
    versao: "1.135.0",
    data: "2026-10-21",
    titulo: "Quem está online em todos os seus grupos",
    mudancas: [
      {
        tipo: "novo",
        area: "Presença",
        texto:
          "O painel Ao vivo mostra quem está online em TODOS os grupos de que você faz parte ao mesmo tempo — cada pessoa com os grupos dela marcados e filtro por grupo. Vale para quem o papel permite ver quem está online.",
        link: "/painel/mesa",
      },
    ],
  },
  {
    versao: "1.134.1",
    data: "2026-10-21",
    titulo: "Prévia da planilha mostra os dados",
    mudancas: [{ tipo: "correcao", area: "PCA", texto: "A tabela da prévia da planilha agora mostra os dados de cada linha (antes as linhas vinham em branco).", link: "/painel/pca" }],
  },
  {
    versao: "1.134.0",
    data: "2026-10-21",
    titulo: "Prévia completa da planilha do PCA",
    mudancas: [
      {
        tipo: "novo",
        area: "PCA",
        texto: "Antes de importar, a planilha abre num banner com o resumo, os apontamentos e TODAS as linhas e colunas como serão gravadas (filtros, total e exportar). Só “Importar” grava.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.133.1",
    data: "2026-10-21",
    titulo: "Cada parte da tela com a sua estrutura de carregamento",
    mudancas: [
      { tipo: "melhoria", area: "Sistema", texto: "Enquanto uma tela demora, cada parte dela — tabela, cartões, abas, calendário — mostra a própria forma, igual à que vai aparecer.", link: "/painel/mesa" },
      { tipo: "correcao", area: "Tarefas", texto: "Os quadros de Tarefas, os catálogos e as automações carregam com a mesma forma de cartão que têm prontos.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.133.0",
    data: "2026-10-21",
    titulo: "PCA de lista pronta recebe protocolos e a planilha consolidada",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "O PCA de lista pronta também recebe protocolos: ganhou a aba Mesa (enviar, incorporar, devolver), ao lado da Importação.", link: "/painel/pca" },
      { tipo: "novo", area: "PCA", texto: "A Importação aceita a planilha consolidada com a coluna LOCAL (ex.: Enviar_PCA): vira uma planilha por unidade, com domínio, prioridade e o ID do protocolo, e mostra a prévia com os problemas antes de gravar.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Dashboard, Orçamento e cards somam planilhas e protocolos sem contar o mesmo processo duas vezes: as linhas da planilha de um protocolo incorporado dão lugar aos itens do protocolo, que nunca são alterados.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.132.0",
    data: "2026-10-21",
    titulo: "Telas guardadas por 2 horas, sem piscar",
    mudancas: [
      { tipo: "melhoria", area: "Sistema", texto: "Telas e abas já abertas ficam guardadas por até 2 horas e voltam na hora; qualquer gravação continua atualizando o que mudou.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Sistema", texto: "Ao passar o mouse (ou encostar o dedo) num item do menu ou num cartão de PCA, Orçamento ou quadro, a tela já começa a carregar.", link: "/painel/pca" },
      { tipo: "correcao", area: "Sistema", texto: "Trocar de aba não pisca mais: a aba atual fica à vista até a nova chegar, e a estrutura de carregamento só aparece quando a espera é longa.", link: "/painel/orcamento" },
    ],
  },
  {
    versao: "1.131.2",
    data: "2026-10-21",
    titulo: "Itens da Mesa sem carregar de novo",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Voltar à Mesa e abrir os Itens não carrega a lista de novo: ela fica pronta enquanto nada for gravado.", link: "/painel/mesa" },
      { tipo: "correcao", area: "PCA", texto: "A visão Itens da Mesa de cada PCA também volta pronta.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.131.1",
    data: "2026-10-21",
    titulo: "Estrutura da tela só quando demora",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "A estrutura de carregamento só aparece quando a tela demora; a que abre logo entra direto, sem piscar.", link: "/painel/mesa" },
      { tipo: "correcao", area: "Sistema", texto: "Cada tela mostra, enquanto carrega, a mesma forma que vai ter: a Mesa, os cartões de PCA, Orçamento, Catálogo, Tarefas e Automação, o Calendário e as abas das Configurações e do Perfil.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.131.0",
    data: "2026-10-21",
    titulo: "Telas que abrem na hora",
    mudancas: [
      { tipo: "melhoria", area: "Sistema", texto: "Ao tocar num item do menu, a estrutura da tela aparece na hora e os dados entram logo em seguida.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "Gravações de Tarefas e do Calendário não fazem mais a Mesa, o PCA, o Orçamento e o Catálogo recalcularem nem recarregarem.", link: "/painel/mesa" },
      { tipo: "correcao", area: "PCA", texto: "O Dashboard de um PCA por planilhas acompanha na hora as planilhas importadas.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.130.0",
    data: "2026-10-21",
    titulo: "Estado da Mesa sem reconferir",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "O Estado de cada protocolo e DFD é conferido uma vez e fica guardado: ao entrar na Mesa (também depois de recarregar a página) as linhas já aparecem conferidas — só o que mudou é conferido de novo.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "PCA", texto: "A Mesa de cada PCA também abre com o Estado já conferido.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Mesa", texto: "\"Reverificar tudo\" refaz a conferência completa de todas as linhas, ignorando o que estava guardado.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.129.0",
    data: "2026-10-21",
    titulo: "Trocar de tela sem recarregar",
    mudancas: [
      { tipo: "melhoria", area: "Sistema", texto: "Voltar a uma tela já vista (Mesa, Dashboard, Orçamento, PCA) é imediato: ela fica pronta por 30 minutos e só recarrega quando alguém grava um dado novo.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Sistema", texto: "Entrar e sair do sistema não descarta mais os dados já preparados das telas pesadas.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.128.0",
    data: "2026-10-21",
    titulo: "Carregamento mais rápido",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Os itens já conferidos ficam salvos: voltar à visão Itens não verifica tudo de novo — só o que mudou. \"Reverificar tudo\" refaz a verificação completa.", link: "/painel/mesa?vista=itens" },
      { tipo: "melhoria", area: "PCA", texto: "Orçamento, Mesa do PCA e o comparativo abrem mais rápido: os dados ficam prontos enquanto nada muda.", link: "/painel/pca" },
      { tipo: "correcao", area: "Sistema", texto: "O círculo de carregamento gira sempre, mesmo com a página ocupada.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.127.0",
    data: "2026-10-19",
    titulo: "Orçamento com Redução e quantidade de empenhos",
    mudancas: [
      { tipo: "novo", area: "Orçamento", texto: "A importação do CUBO lê as colunas Valor Redução e Qtd Empenho; elas aparecem nos lançamentos, no detalhe do lançamento e no card do orçamento.", link: "/painel/orcamento" },
      { tipo: "correcao", area: "Orçamento", texto: "A dotação atualizada desconta a Redução (antes, a Anulação), e o % empenhado usa o empenho líquido (empenho − anulação), como o saldo do CUBO. A coluna Qtd Empenho não é mais lida como o valor do empenho.", link: "/painel/orcamento" },
      { tipo: "melhoria", area: "Orçamento", texto: "O Comparativo ganhou as medidas Redução, Empenho líquido e Qtd. de empenhos.", link: "/painel/orcamento" },
    ],
  },
  {
    versao: "1.126.0",
    data: "2026-10-16",
    titulo: "Relatório de variação dos preços",
    mudancas: [
      {
        tipo: "novo",
        area: "Mesa",
        texto: "Na visão Consolidada dos itens, o Relatório de variação (PDF): itens com valor inflado, valor sugerido, impacto do reajuste e a variação por código — de todos, dos filtrados, dos de variação acima de 25% ou dos escolhidos, num PDF ou um por unidade.",
        link: "/painel/mesa?vista=itens",
      },
    ],
  },
  {
    versao: "1.125.3",
    data: "2026-10-16",
    titulo: "Correção do Orçamento do PCA",
    mudancas: [
      {
        tipo: "correcao",
        area: "PCA",
        texto: "A aba Orçamento do PCA voltou a abrir (a tela entrava em laço ao informar as linhas filtradas).",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.125.2",
    data: "2026-10-16",
    titulo: "Relatório da composição pelas linhas filtradas",
    mudancas: [
      {
        tipo: "melhoria",
        area: "PCA",
        texto: "O Relatório da composição pode sair só com as unidades filtradas na tabela; saem os botões Elementos e Relatório dos vínculos.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.125.1",
    data: "2026-10-16",
    titulo: "Botão Elementos no rodapé da tabela",
    mudancas: [
      { tipo: "melhoria", area: "PCA › Orçamento", texto: "O relatório dos elementos virou o botão “Elementos” no rodapé da tabela PCA × Orçamento; com uma unidade só, o PDF não repete a tabela geral.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.125.0",
    data: "2026-10-16",
    titulo: "Orçamento do PCA: grupos, elementos e vínculos; XLSX com escolha de colunas",
    mudancas: [
      { tipo: "novo", area: "PCA › Orçamento", texto: "“Ver por Grupo”: unidades que compartilham o orçamento (ex.: a Secretaria e o Fundo de Cultura) somam numa linha só. O botão “Grupos” cadastra os grupos, com sugestões pelos vínculos.", link: "/painel/pca" },
      { tipo: "novo", area: "PCA › Orçamento", texto: "Relatório dos elementos de despesa (PDF): a dotação considerada por elemento, das unidades com contratações no PCA e unidade a unidade, com o planejado e o saldo.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA › Orçamento", texto: "A coluna Vínculos ganhou filtro (Vinculada · Com ações sem vínculo · Sem vínculo · Sem orçamento), e a tabela tem seleção com o “Relatório dos vínculos” das linhas marcadas (ou das filtradas).", link: "/painel/pca" },
      { tipo: "melhoria", area: "Tabelas", texto: "O XLSX abre a escolha das colunas antes de baixar: as do PDF vêm marcadas, e a sua escolha fica lembrada neste aparelho.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Automação", texto: "As automações em andamento mostram a % e o tempo que falta no painel de segundo plano.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.124.0",
    data: "2026-10-16",
    titulo: "Cartões sem esticar com texto longo",
    mudancas: [
      { tipo: "correcao", area: "Orçamento", texto: "O nome do orçamento no cartão fica em até 2 linhas e o valor em uma — o nome inteiro aparece ao passar o mouse; os cartões vizinhos não esticam mais.", link: "/painel/orcamento" },
      { tipo: "melhoria", area: "Sistema", texto: "Título e subtítulo dos gráficos e o título dos avisos flutuantes limitados a 2 linhas, com o texto inteiro ao passar o mouse.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.123.0",
    data: "2026-10-16",
    titulo: "KPIs sempre compactos",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "O KPI “Maior item” não estica mais os cartões com a descrição inteira: a dica de todo KPI fica em até 2 linhas e o texto completo aparece ao passar o mouse.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.122.0",
    data: "2026-10-16",
    titulo: "Telas mais simples com uma unidade no cabeçalho",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Com uma unidade escolhida no cabeçalho, as colunas Unidade e Sigla saem das tabelas e o Dashboard não oferece mais “Dado = Unidade”. Em “Geral”, tudo volta.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "PCA", texto: "Orçamento do PCA sem “Por órgão” e sem a coluna Órgão; consulta dos protocolos sem a coluna Unidade quando só há uma unidade.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Orçamento", texto: "Comparativo abre pela Ação e não cruza dimensões de um valor só; Lançamentos sem as colunas de órgão/unidade repetidas.", link: "/painel/orcamento" },
      { tipo: "melhoria", area: "Tarefas", texto: "Lista sem a coluna Unidade e o painel Filtrar sem a seção da unidade quando só há uma.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.121.0",
    data: "2026-10-16",
    titulo: "Papéis controlam presença, novidades e o escopo da Mesa do PCA",
    mudancas: [
      { tipo: "novo", area: "Papéis", texto: "Componente “Escopo da Mesa do PCA”: sem ele, o seletor Todos | Enviados | Incorporados some e a Mesa do PCA mostra todos.", link: "/painel/configuracoes?aba=papeis" },
      { tipo: "novo", area: "Papéis", texto: "Detalhe “Aparecer online para os outros”: só o papel decide quem é visto no “Online agora”.", link: "/painel/configuracoes?aba=papeis" },
      { tipo: "novo", area: "Papéis", texto: "Detalhe “Ver as novidades”: sem ele, a versão do menu e o aviso de nova versão não aparecem.", link: "/painel/configuracoes?aba=papeis" },
    ],
  },
  {
    versao: "1.120.0",
    data: "2026-10-16",
    titulo: "Troca de visão da Mesa mais rápida e suave",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Trocar entre Protocolos, DFDs e Itens responde na hora: a tabela atual esmaece e a nova acende num fade curto, sem tremer o cabeçalho.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "Os itens começam a carregar quando o mouse passa pelas visões — a aba Itens abre pronta.", link: "/painel/mesa?vista=itens" },
    ],
  },
  {
    versao: "1.119.0",
    data: "2026-10-16",
    titulo: "Mesa com uma tabela só",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Protocolos, DFDs e Itens usam a MESMA tabela: trocar de visão muda só as colunas e as linhas — a moldura, o rodapé e os filtros não somem.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.118.0",
    data: "2026-10-16",
    titulo: "Todas as telas obedecem à unidade do cabeçalho",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Aba \"Filtro da unidade\": o ADM escolhe quais telas obedecem à unidade do cabeçalho e as regras do catálogo, do orçamento e das tarefas sem vínculo.", link: "/painel/configuracoes?aba=escopo" },
      { tipo: "melhoria", area: "PCA", texto: "Com uma unidade escolhida, cards, Dashboard, Orçamento e Mesa do PCA mostram só os dados dela.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Orçamento", texto: "Cards, lançamentos, comparativo e visões só com os lançamentos que os vínculos levam à unidade.", link: "/painel/orcamento" },
      { tipo: "melhoria", area: "Catálogo", texto: "Só os itens e históricos usados nos DFDs da unidade (ou o catálogo inteiro, conforme o ADM).", link: "/painel/catalogo" },
      { tipo: "melhoria", area: "Tarefas", texto: "Quadros e calendário só com as tarefas vinculadas à unidade.", link: "/painel/tarefas" },
      { tipo: "melhoria", area: "Calendário", texto: "Eventos e tarefas só da unidade escolhida.", link: "/painel/calendario" },
    ],
  },
  {
    versao: "1.117.0",
    data: "2026-10-16",
    titulo: "Filtros e recorte da Mesa no rodapé da tabela",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Os filtros feitos e o Recorte da Mesa ficam no rodapé da tabela, num menu (funil com o número): abra para ver cada filtro, limpar um só ou todos.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Tabelas", texto: "Botões do rodapé simplificados em ícones (filtros e importar), com o nome na dica.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.116.0",
    data: "2026-10-16",
    titulo: "Mesa conectada: Protocolos, DFDs e Itens com os mesmos filtros",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "Os filtros de Protocolos, DFDs e Itens agora se conectam: filtrar protocolos mostra só os DFDs e itens deles; filtrar itens (ex.: um código) leva aos DFDs e protocolos que os têm. Os filtros e a ordem de cada visão continuam ao trocar de visão.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "A faixa “Recorte da Mesa” acima da tabela mostra o que vem das outras visões; o ✕ tira os filtros de uma delas e “Limpar recorte” zera tudo.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.115.0",
    data: "2026-10-16",
    titulo: "Grupo pela unidade de cadastro",
    mudancas: [
      { tipo: "novo", area: "Grupos", texto: "O grupo escolhe de onde vêm as unidades: \u201cUnidades escolhidas\u201d (como antes) ou \u201cUnidade de cadastro de cada pessoa\u201d — cada membro vê só a unidade em que trabalha. Quem está sem unidade de cadastro é apontado no editor do grupo.", link: "/painel/grupos" },
    ],
  },
  {
    versao: "1.114.2",
    data: "2026-10-16",
    titulo: "Matrícula com até 7 números",
    mudancas: [
      { tipo: "correcao", area: "Cadastro", texto: "A matrícula aceita até 7 números (antes, exatamente 6), no cadastro e na edição do usuário pelo ADM.", link: "/login?modo=cadastro" },
    ],
  },
  {
    versao: "1.114.1",
    data: "2026-10-16",
    titulo: "Fim do alerta repetido de aparelho novo",
    mudancas: [
      { tipo: "correcao", area: "Segurança", texto: "O alerta “Login de um aparelho novo” / “Novo acesso à sua conta” não aparece mais quando o mesmo navegador entra do mesmo IP já visto no seu histórico de acesso (o cookie do aparelho pode se perder).", link: "/painel/perfil?aba=acessos" },
    ],
  },
  {
    versao: "1.114.0",
    data: "2026-10-15",
    titulo: "Palavras apontadas no item",
    mudancas: [
      { tipo: "novo", area: "Avaliação", texto: "Novo ponto “Palavras no item”: o ADM cadastra conjuntos de palavras (separadas por “;”), cada um com a sua importância, e o item cuja descrição contém uma delas é apontado. Desligado por padrão.", link: "/painel/configuracoes?aba=avaliacao" },
      { tipo: "melhoria", area: "Mesa", texto: "O item com palavra apontada aparece no Estado, nas pendências (leva à descrição do item), no despacho e, se o ADM escolher bloquear, trava a importação.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.113.0",
    data: "2026-10-15",
    titulo: "Automação: conferência final na Centi e continuar de onde parou",
    mudancas: [
      {
        tipo: "novo",
        area: "Automação",
        texto: "Ao terminar um anexo, o sistema abre o protocolo na Centi e confere cada arquivo: “Conferido na Centi: N de N”. O que não estiver lá vira falha “Não confirmado” — nada é dado como anexado sem a prova da Centi.",
        link: "/painel/automacao",
      },
      {
        tipo: "novo",
        area: "Automação",
        texto: "Continuar de onde parou: ao fim de cada execução a conferência no protocolo roda sozinha e mostra “Enviar os que faltam” — interrompida, com falha ou com a página fechada, basta enviar o que falta.",
        link: "/painel/automacao",
      },
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "Falha passageira (rede, tempo esgotado, servidor indisponível) na emissão ou no anexo ganha UMA nova tentativa sozinha antes de virar “Falhou” — sem risco de duplicar: a extensão confere o protocolo antes de gravar.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.112.0",
    data: "2026-10-15",
    titulo: "Automação: andamento ao vivo com % e tempo restante",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "Etapas acompanham a execução em tempo real: a % de conclusão pelo trabalho real (cada DFD conta), o tempo estimado para terminar pelo ritmo dos últimos minutos, a etapa em curso destacada com “n de N” e o DFD que está sendo tratado agora.",
        link: "/painel/automacao",
      },
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "Análise dos DFDs: cada protocolo/unidade recolhe sozinho quando termina (com “Concluído” ou as falhas), a lista rola suave até o que está em curso e você pode abrir/fechar qualquer grupo.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "Voltar à lista e abrir de novo o fluxo em execução não zera mais as etapas (“0/3”) — o andamento continua à vista.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.111.0",
    data: "2026-10-15",
    titulo: "Automação: conferir no protocolo o que foi anexado e enviar o que falta",
    mudancas: [
      {
        tipo: "novo",
        area: "Automação",
        texto: "Baixar/anexar DFDs: “Conferir no protocolo” abre o protocolo da Centi só para ler e mostra, arquivo a arquivo, o que já está anexado (com o nº do documento), o que falta e o que o sistema registrou mas a Centi não tem. “Enviar os que faltam” emite e anexa só esses.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "“Já estava” só quando o documento está de fato no protocolo da Centi: antes bastava o registro do sistema (de uma execução anterior) para o arquivo ser pulado. Registrado mas ausente na Centi agora é enviado de novo.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "O anexo nunca apaga documentos: o protocolo devolvido sem documentos já gravados (desatualizado) é recusado, o salvar que perde documentos vira erro e, depois de gravar, o protocolo é aberto de novo para confirmar o documento. O nº mostrado é o do documento NOVO. Atualize a extensão para a 1.25.0.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.110.0",
    data: "2026-10-15",
    titulo: "Automação: o estado de cada DFD mostra o que acontece de fato",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "Cada DFD do Baixar/anexar mostra o passo real: Emitindo na Centi · Conferindo o PDF · No PDF unido · Anexando na Centi · Aguardando sua confirmação — e o fim real: Anexado/Salvo · Já estava · Falhou · Interrompido. A entidade da Centi aparece já na fila (prevista, com “?”) e a emissão confirma a real.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "Os números batem em todo lugar: a barra (“12 anexado(s) · 4 já estava(m) · 1 falhou — 17 de 46”), o painel do canto e o ícone da extensão contam os DFDs CONCLUÍDOS — o “já estava no protocolo” não é mais contado como anexado e o 1º DFD não aparece feito antes de terminar.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "O histórico das execuções nunca fica “Rodando” para sempre: fechar a página cancela a execução, uma falha no meio a encerra com o motivo e a parada há mais de 30 minutos (sem sinal de vida) vira “Falhou”. O que não foi emitido aparece com o motivo, e uma falha de rede no registro tenta de novo.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "Segurança: a autorização de gravar na Centi só é aceita da extensão da Plataforma PCA (ou do próprio sistema) — nenhuma outra extensão a usa.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.109.0",
    data: "2026-10-15",
    titulo: "Automação: ordem da tabela, permissão no banner da extensão e correções",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "Os DFDs seguem na SEQUÊNCIA da tabela de Seleção — a ordenação e os filtros que você fez, só os marcados (ou os à vista, sem marcação). Saiu o “Ordenar pelo planejamento”.",
        link: "/painel/automacao",
      },
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "A permissão para gravar na Centi aparece no banner flutuante da extensão (o painel do ícone), nunca numa tela própria. Tocar fora não recusa: o pedido fica no ícone (selo “?”) até você responder.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "“Autorização inválida, já usada ou vencida”: uma cópia antiga da extensão, que ficava na página depois de atualizar, gastava a autorização antes da nova. A cópia antiga agora fica em silêncio. Atualize a extensão para a 1.24.0.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "O selo “N problema(s)” abre a lista com cada problema e o componente dele — tocar leva ao componente no diagrama.",
        link: "/painel/automacao",
      },
      {
        tipo: "correcao",
        area: "Automação",
        texto: "A aba Análise do Baixar/anexar DFDs mostra cada DFD processado (concluído, falhou, pulado) ao vivo e no fim — antes ficava em 0.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.108.0",
    data: "2026-10-15",
    titulo: "Baixar/anexar DFDs: testar o protocolo e achar só pelo Id",
    mudancas: [
      {
        tipo: "novo",
        area: "Automação",
        texto: "“Testar protocolo” nos Dados de entrada do Baixar/anexar DFDs: abre o protocolo na Centi só para ler e mostra o número, o assunto, o interessado e os documentos — ou o motivo de não ter achado.",
        link: "/painel/automacao",
      },
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "O nº do protocolo ficou opcional: em branco, o protocolo é achado só pelo Id e o número vem da Centi (o anexo continua conferindo Id + nº). Atualize a extensão para a 1.23.0.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.107.12",
    data: "2026-10-15",
    titulo: "Anexo na Centi: abre o protocolo como a tela da Centi",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "O anexo de DFDs num protocolo da Centi parava em \u201cA Centi n\u00e3o devolveu o protocolo\u201d: a Centi deixou de abrir o protocolo pelo caminho que a extens\u00e3o usava. A extens\u00e3o 1.22.0 aprende sozinha como a pr\u00f3pria tela da Centi abre o protocolo \u2014 basta abrir o protocolo UMA vez na Tela Protocolo da Centi com a extens\u00e3o ativa. Baixe a extens\u00e3o nova.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Quando o protocolo n\u00e3o abre, a automa\u00e7\u00e3o para com UM aviso que diz o que cada caminho respondeu e o que fazer \u2014 sem repetir o mesmo erro em cada DFD.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.107.11",
    data: "2026-10-15",
    titulo: "Cartões suaves ao fechar o menu e foto sem achatar",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "Fechar o menu lateral agora faz a mesma animação suave de abrir, ao contrário: os cartões do PCA (e semelhantes) deslizam e mudam de tamanho sem saltar.", link: "/painel/pca" },
      { tipo: "correcao", area: "Menu", texto: "A foto do usuário não achata mais com o menu recolhido.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.107.10",
    data: "2026-10-15",
    titulo: "Cartões e usuário estáveis no menu",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "Ao abrir e fechar o menu, os cartões mudam de tamanho e de lugar numa transição suave (sem saltar), e o cartão do usuário encolhe mantendo a borda, com a foto centralizada.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.107.9",
    data: "2026-10-15",
    titulo: "Cartões deslizam ao abrir e fechar o menu",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "Ao abrir e fechar o menu lateral, os cartões (PCA, Orçamento, Catálogo, Tarefas, Automação) deslizam até o lugar novo em vez de pular de linha ou coluna.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.107.8",
    data: "2026-10-15",
    titulo: "Menu recolhido alinhado",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "Com o menu recolhido, as seleções e a foto do usuário ficam centralizadas no trilho, sem cortes nem deformação; ícones e foto não mudam de lugar ao abrir e fechar.", link: "/painel" },
    ],
  },
  {
    versao: "1.107.7",
    data: "2026-10-15",
    titulo: "Logo e usuário estáveis no menu recolhido",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "A logo não muda mais de lugar ao abrir e fechar o menu, e o cartão do usuário aparece inteiro com o menu recolhido.", link: "/painel" },
    ],
  },
  {
    versao: "1.107.6",
    data: "2026-10-15",
    titulo: "Menu lateral com transição suave",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "Ao abrir e fechar o menu lateral, o conteúdo à direita estica e encolhe numa animação suave, sem pular de lugar.", link: "/painel" },
    ],
  },
  {
    versao: "1.107.5",
    data: "2026-10-15",
    titulo: "Seletor de unidade organizado e imagens protegidas",
    mudancas: [
      { tipo: "melhoria", area: "Cabeçalho", texto: "O seletor de unidade segue o desenho do filtro de unidades das tabelas: a sigla em cima, o nome por extenso embaixo e uma busca por sigla ou nome.", link: "/painel" },
      { tipo: "melhoria", area: "Segurança", texto: "As imagens do sistema — a logo, as fotos e as capas — não podem mais ser arrastadas nem copiadas pelo botão direito ou pelo toque longo.", link: "/painel" },
    ],
  },
  {
    versao: "1.107.4",
    data: "2026-10-15",
    titulo: "Menu abre sem a seleção encolher",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "Ao abrir o menu, a seleção não encolhe mais antes de esticar (no Windows, a barra de rolagem aparecia de repente); o menu segue rolando pela roda do mouse e pelo toque.", link: "/painel" },
    ],
  },
  {
    versao: "1.107.3",
    data: "2026-10-15",
    titulo: "Menu recolhido sem cortes no Windows",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "Com o menu recolhido, os botões não ficam mais cortados no Windows: a barra de rolagem some no trilho (a rolagem continua) e volta ao abrir o menu.", link: "/painel" },
    ],
  },
  {
    versao: "1.107.2",
    data: "2026-10-15",
    titulo: "Seletores do cabeçalho sem cortes e navegação mais rápida",
    mudancas: [
      { tipo: "correcao", area: "Cabeçalho", texto: "Os seletores de grupo, unidade e PCA mostram os nomes inteiros, sem abreviar — na lista e no botão.", link: "/painel" },
      { tipo: "melhoria", area: "Menu", texto: "Ao tocar numa tela do menu, o ícone mostra que ela está carregando; a logo leva direto à sua tela inicial, sem redirecionamento.", link: "/painel" },
    ],
  },
  {
    versao: "1.107.1",
    data: "2026-10-15",
    titulo: "Proteção da pesquisa contra abuso",
    mudancas: [
      { tipo: "melhoria", area: "Integrações", texto: "Guia para o ADM ligar, no painel da Cloudflare, o limite de pedidos da pesquisa: robôs e scripts são barrados antes de gastar o sistema.", link: "/painel/integracoes" },
    ],
  },
  {
    versao: "1.107.0",
    data: "2026-10-15",
    titulo: "Pesquisa mais rápida e mais leve",
    mudancas: [
      { tipo: "melhoria", area: "Pesquisa", texto: "Protocolos e DFDs são encontrados na hora, enquanto você digita: a lista do que você pode ver fica na memória da aba e só é buscada de novo quando algum dado muda.", link: "/painel" },
      { tipo: "melhoria", area: "Pesquisa", texto: "As demais telas vão num pedido só; o mesmo termo pesquisado de novo volta na hora, e o pedido antigo é cancelado quando você continua digitando.", link: "/painel" },
    ],
  },
  {
    versao: "1.106.2",
    data: "2026-10-15",
    titulo: "Pesquisa sempre na Mesa certa",
    mudancas: [
      { tipo: "correcao", area: "Pesquisa", texto: "Protocolo ou DFD aberto por qualquer link — favorito, recente, tarefa, aviso — vai à Mesa em que está HOJE: a do PCA, ou a do sistema. Um link antigo nunca mais cai em \"Acesso restrito\" quando o item está num PCA que você abre.", link: "/painel/pca" },
      { tipo: "correcao", area: "Pesquisa", texto: "As dicas e os filtros da pesquisa mostram só o que você tem acesso.", link: "/painel" },
    ],
  },
  {
    versao: "1.106.1",
    data: "2026-10-15",
    titulo: "Pesquisa mostra onde casou",
    mudancas: [
      { tipo: "melhoria", area: "Pesquisa", texto: "O trecho pesquisado fica marcado em todo o resultado — no nome, no detalhe (Id, assunto, protocolo) e na prévia —, com todos os termos e sem depender de acento.", link: "/painel" },
      { tipo: "melhoria", area: "Pesquisa", texto: "Enquanto pesquisa, o banner mostra o esqueleto nos filtros, na lista e na prévia.", link: "/painel" },
    ],
  },
  {
    versao: "1.106.0",
    data: "2026-10-15",
    titulo: "Pesquisa precisa e filtros que se adaptam",
    mudancas: [
      { tipo: "correcao", area: "Pesquisa", texto: "Busca precisa: um número (\"65\") procura só nos números — nº, Id, planejamento e código —, nunca no texto livre; sem acento só onde o português o põe (ç, ão, õe), sem trazer resultados soltos.", link: "/painel" },
      { tipo: "melhoria", area: "Pesquisa", texto: "O filtro escolhido vira um bloco sólido no campo: apagar no começo tira o filtro inteiro, nunca uma parte; o × também volta a \"Tudo\".", link: "/painel" },
      { tipo: "melhoria", area: "Pesquisa", texto: "Com a pesquisa iniciada, só aparecem os filtros que têm resultado, com a contagem de cada um, entrando com uma animação suave.", link: "/painel" },
    ],
  },
  {
    versao: "1.105.1",
    data: "2026-10-15",
    titulo: "Filtros da pesquisa sem a barra por cima",
    mudancas: [{ tipo: "correcao", area: "Pesquisa", texto: "A barra de rolagem dos filtros rápidos fica abaixo dos chips, nunca sobre eles.", link: "/painel" }],
  },
  {
    versao: "1.105.0",
    data: "2026-10-15",
    titulo: "Pesquisa mais inteligente",
    mudancas: [
      { tipo: "melhoria", area: "Pesquisa", texto: "Vários termos de uma vez (\"secretaria saúde 2027\" exige todos) e sem precisar de acento: \"manutencao\" acha \"MANUTENÇÃO\". O resultado exato vem primeiro.", link: "/painel" },
      { tipo: "novo", area: "Pesquisa", texto: "Filtros rápidos no banner (Protocolos, DFDs, Itens, Tarefas, Calendário, Orçamento, Catálogo…), só das telas que você abre.", link: "/painel" },
      { tipo: "novo", area: "Pesquisa", texto: "Tarefas achadas também pela descrição, pelos comentários e pelos itens dos checklists; ajustes das Configurações e Integrações pelo nome (\"turnstile\", \"senha\", \"marca d'água\"); papéis, cargos, situações e feriados abrem já no registro.", link: "/painel/tarefas" },
      { tipo: "melhoria", area: "Pesquisa", texto: "Mais rápida: os tipos mais usados aparecem primeiro e as outras telas chegam em seguida.", link: "/painel" },
    ],
  },
  {
    versao: "1.104.0",
    data: "2026-10-15",
    titulo: "Pesquisa em todas as telas",
    mudancas: [
      { tipo: "novo", area: "Pesquisa", texto: "A pesquisa agora acha também os lançamentos do orçamento (ficha, ação, elemento, unidade), os itens do catálogo, o histórico de compra e os eventos do calendário — e abre o registro na tela e aba certas.", link: "/painel/orcamento" },
      { tipo: "novo", area: "Pesquisa", texto: "Para o administrador: usuários, órgãos, unidades, grupos, papéis, cargos, situações, feriados e automações, cada um abrindo o banner na própria tela.", link: "/painel/usuarios" },
      { tipo: "melhoria", area: "Pesquisa", texto: "Só aparece o que a pessoa pode abrir: cada tipo exige a tela (e a aba) em que o dado está. Novos atalhos: l: lançamentos, c: catálogo, h: histórico, e: calendário, u: usuários, au: automações.", link: "/painel" },
    ],
  },
  {
    versao: "1.103.3",
    data: "2026-10-15",
    titulo: "Pesquisa respeita a Mesa de cada item",
    mudancas: [
      { tipo: "correcao", area: "Pesquisa", texto: "Protocolos, DFDs e itens só aparecem para quem abre a Mesa em que estão: os da Mesa do sistema exigem a Mesa; os de um PCA exigem o PCA no grupo e a aba Mesa liberada no papel.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.103.2",
    data: "2026-10-15",
    titulo: "Pesquisa leva à aba Mesa do PCA",
    mudancas: [
      { tipo: "correcao", area: "Pesquisa", texto: "Protocolo, DFD ou item que está num PCA abre na aba Mesa do espaço daquele PCA, com o banner aberto e a trilha do cabeçalho completa (PCA › PCA › Mesa).", link: "/painel/pca" },
      { tipo: "correcao", area: "Mesa", texto: "Escolher um PCA no seletor de Mesa leva à aba Mesa do espaço do PCA, em vez de uma tela à parte.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.103.1",
    data: "2026-10-15",
    titulo: "Menu alinhado ao conteúdo",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "O primeiro módulo do menu (e a linha dele com o menu recolhido) começa na mesma altura do primeiro componente das telas, com o espaço padrão em volta da pesquisa.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.103.0",
    data: "2026-10-15",
    titulo: "Favoritos na pesquisa",
    mudancas: [
      {
        tipo: "novo",
        area: "Pesquisa",
        texto: "Favorite telas, abas, PCAs, protocolos, DFDs e itens pela estrela; eles ficam no painel da direita da pesquisa (no celular, no topo) e valem em todos os seus aparelhos.",
        link: "/painel/mesa",
      },
      { tipo: "melhoria", area: "Pesquisa", texto: "O painel da direita fica fixo e dividido: em cima os detalhes do resultado, embaixo os favoritos.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.102.1",
    data: "2026-10-15",
    titulo: "Menu lateral alinhado",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "A foto do usuário fica no mesmo lugar com o menu recolhido.", link: "/painel/perfil" },
      { tipo: "correcao", area: "Pesquisa", texto: "O campo de pesquisa do menu ficou na mesma linha do título das telas, com o mesmo respiro em cima e embaixo.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.102.0",
    data: "2026-10-15",
    titulo: "Pesquisa só mostra o que você pode abrir",
    mudancas: [
      {
        tipo: "correcao",
        area: "Pesquisa",
        texto: "Protocolos, DFDs e itens só aparecem quando você abre a Mesa em que estão; os que estão num PCA abrem na Mesa daquele PCA (antes levavam a \"Acesso restrito\").",
        link: "/painel/mesa",
      },
      {
        tipo: "melhoria",
        area: "Pesquisa",
        texto: "Pesquise por nº de planejamento, Id ou nº do protocolo, interessado, nº do DFD, código e descrição do item.",
        link: "/painel/mesa",
      },
    ],
  },
  {
    versao: "1.101.1",
    data: "2026-10-15",
    titulo: "Pesquisa mostra o caminho de cada tela e aba",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Pesquisa",
        texto: "Cada resultado mostra a sequência até ele (ex.: PCA › 2025 · PCA Teste › Orçamento), e o trecho buscado aparece só em negrito.",
        link: "/painel/mesa",
      },
    ],
  },
  {
    versao: "1.101.0",
    data: "2026-10-15",
    titulo: "Pesquisa do sistema completa (com as abas)",
    mudancas: [
      { tipo: "novo", area: "Pesquisa", texto: "Pesquisa as ABAS de cada tela (Mesa, Configurações, Órgãos, Perfil e cada PCA) — ex.: “aba: segurança” ou “PCA 2027 orçamento”.", link: "/painel/mesa" },
      { tipo: "novo", area: "Pesquisa", texto: "Resultados por grupo com “Ver todos”, termo em destaque, número exato primeiro, ações rápidas (tema, menu, perfil, sair) e prévia do item ao lado.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Pesquisa", texto: "Atalhos de prefixo (p:, d:, t:, i:…) com Tab, recentes removíveis, esqueleto por grupo, aviso de falha com “Tentar de novo”, tela cheia no celular e leitura por leitor de tela.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "A Mesa abre direto numa visão pelo endereço (?vista=dfds, itens, dashboard).", link: "/painel/mesa?vista=dfds" },
    ],
  },
  {
    versao: "1.100.0",
    data: "2026-10-15",
    titulo: "Pesquisa do sistema no menu lateral",
    mudancas: [
      { tipo: "novo", area: "Menu", texto: "Pesquisa rápida fixa logo abaixo da logo (Ctrl+K / ⌘K): abre um banner que pesquisa telas, PCAs, protocolos, DFDs e tarefas, com recentes e dicas de prefixo (dfd:, item:, tarefa:…).", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Cabeçalho", texto: "A pesquisa saiu do cabeçalho — a trilha ficou só com a navegação.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.99.0",
    data: "2026-10-15",
    titulo: "Trilha completa e paleta Ctrl+K",
    mudancas: [
      { tipo: "novo", area: "Cabeçalho", texto: "A trilha mostra o espaço, a aba (troca pelo ⌃⌄) e o protocolo/DFD/tarefa aberto; a seção também troca pelo ⌃⌄.", link: "/painel/mesa" },
      { tipo: "novo", area: "Cabeçalho", texto: "Ctrl+K (⌘K) abre a paleta “Ir para…”: todas as telas e PCAs, com busca e os recentes.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Cabeçalho", texto: "Busca e recentes nas listas da trilha, selo do PCA que filtra a tela, trilha no celular e níveis do meio que somem primeiro.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.98.0",
    data: "2026-10-15",
    titulo: "Trilha de navegação no cabeçalho",
    mudancas: [
      { tipo: "novo", area: "Cabeçalho", texto: "Trilha no padrão do Cloudflare: seção › tela (troca de tela pelo ⌃⌄) e, no espaço de um PCA, o PCA (troca de PCA pelo ⌃⌄).", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Cabeçalho", texto: "O seletor de PCA foi para a direita do cabeçalho; “Todos os PCAs” só aparece com mais de um PCA.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.97.2",
    data: "2026-10-15",
    titulo: "Menu recolhido: foto e animação sem trancos",
    mudancas: [
      { tipo: "correcao", area: "Menu", texto: "A foto do usuário aparece com o menu recolhido.", link: "/painel/perfil" },
      { tipo: "correcao", area: "Menu", texto: "Ao recolher e abrir o menu, a tela não se redesenha a cada quadro: muda de largura uma vez e desliza. Grades, tabelas e gráficos, como os cards do PCA, não pulam mais.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.97.1",
    data: "2026-10-15",
    titulo: "Menu recolhido: separadores e animação",
    mudancas: [
      { tipo: "melhoria", area: "Menu", texto: "Com o menu recolhido, o nome de cada módulo vira uma linha curta que separa os grupos de ícones. Ao abrir e recolher, os textos acompanham a largura com reticências e entram deslizando, numa curva mais suave.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.97.0",
    data: "2026-10-15",
    titulo: "Menu lateral recolhível",
    mudancas: [
      { tipo: "novo", area: "Menu", texto: "O botão no rodapé do menu lateral recolhe o menu para uma faixa só com os ícones, e o conteúdo ganha a largura. Com o mouse sobre a faixa, o menu abre por cima do conteúdo, sem empurrá-lo. A escolha fica lembrada neste navegador.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.96.6",
    data: "2026-10-15",
    titulo: "Sair só com o ícone no menu",
    mudancas: [
      { tipo: "melhoria", area: "Menu", texto: "No cartão do usuário do menu lateral, o Sair virou um ícone à direita do acesso ao perfil.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.96.5",
    data: "2026-10-15",
    titulo: "Card do orçamento com valor real",
    mudancas: [
      { tipo: "melhoria", area: "Orçamento", texto: "O card mostra a dotação atualizada com o valor completo (sem abreviar) e o ano em destaque no canto superior direito.", link: "/painel/orcamento" },
    ],
  },
  {
    versao: "1.96.4",
    data: "2026-10-15",
    titulo: "Filtro de sigla num componente só",
    mudancas: [
      { tipo: "melhoria", area: "Tabelas", texto: "Unidade, órgão e sigla usam o mesmo filtro com o nome embaixo, mais leve: cada opção é calculada uma vez.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.96.3",
    data: "2026-10-15",
    titulo: "Filtro de órgão com o nome",
    mudancas: [
      { tipo: "melhoria", area: "Tabelas", texto: "O filtro das colunas de órgão de todas as tabelas mostra o nome de cada sigla e busca pela sigla ou pelo nome — o mesmo modelo das unidades.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.96.2",
    data: "2026-10-15",
    titulo: "Presença só pelo ADM",
    mudancas: [
      { tipo: "melhoria", area: "Perfil", texto: "A opção de aparecer invisível saiu do Perfil: a presença é definida só pelas configurações do administrador.", link: "/painel/perfil" },
      { tipo: "melhoria", area: "Configurações", texto: "Presença sem a chave “Permitir aparecer invisível”; quem tinha ficado invisível volta a aparecer.", link: "/painel/configuracoes?aba=presenca" },
    ],
  },
  {
    versao: "1.96.1",
    data: "2026-10-15",
    titulo: "Perfil sem rolar a página",
    mudancas: [
      { tipo: "melhoria", area: "Perfil", texto: "A conta Google fica no cabeçalho do Perfil (vincular/desvincular), o histórico de acesso ganhou aba própria e o conteúdo das abas rola por dentro, sem rolar a página.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.96.0",
    data: "2026-10-15",
    titulo: "Perfil reorganizado em abas",
    mudancas: [
      { tipo: "melhoria", area: "Perfil", texto: "O Perfil ficou em abas: Conta, Segurança, Aparência, Notificações, Trabalho e Meu acesso — cada assunto no seu lugar, sem cartão dentro de cartão.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.95.0",
    data: "2026-10-15",
    titulo: "Modos escuros e horário do tema",
    mudancas: [
      { tipo: "novo", area: "Perfil", texto: "Aparência no Perfil: padrão do site, claro, escuro, seguir o sistema, pelo horário do dia ou horário personalizado.", link: "/painel/perfil" },
      { tipo: "novo", area: "Perfil", texto: "Tonalidade do modo escuro: Carvão, Azul-marinho ou Preto (OLED), aplicada sem piscar ao abrir.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.94.2",
    data: "2026-10-14",
    titulo: "Filtros sem texto cortado",
    mudancas: [
      { tipo: "melhoria", area: "Tabelas", texto: "As opções dos filtros das colunas mostram o texto inteiro, quebrando a linha — sigla e nome da unidade completos.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.94.1",
    data: "2026-10-14",
    titulo: "Filtro de unidade igual em todas as tabelas",
    mudancas: [
      { tipo: "correcao", area: "Orçamento", texto: "O filtro da coluna Unidade do PCA × Orçamento usa o mesmo desenho das demais tabelas: a sigla e o nome embaixo.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.94.0",
    data: "2026-10-14",
    titulo: "Unidades com o nome em todas as tabelas",
    mudancas: [
      { tipo: "melhoria", area: "Tabelas", texto: "O filtro das colunas de unidade e sigla de todas as tabelas mostra o nome de cada sigla e busca pela sigla ou pelo nome.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.93.2",
    data: "2026-10-14",
    titulo: "Filtro Unidade com o nome",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "O filtro Unidade do Dashboard mostra o nome de cada sigla e busca pela sigla ou pelo nome.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.93.1",
    data: "2026-10-14",
    titulo: "Filtros do Dashboard do PCA numa linha",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Os filtros do Dashboard ficam numa única linha, com a explicação no (?) e o PDF num botão só com o ícone.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.93.0",
    data: "2026-10-14",
    titulo: "Histórico de acesso",
    mudancas: [
      { tipo: "novo", area: "Perfil", texto: "Histórico de acesso: o último acesso e cada entrada na sua conta com data, hora, dispositivo, canal (senha ou Google) e IP — exportável.", link: "/painel/perfil" },
      { tipo: "novo", area: "Usuários", texto: "Coluna \"Último acesso\" na lista e o histórico de acesso de cada pessoa no banner do usuário.", link: "/painel/usuarios" },
    ],
  },
  {
    versao: "1.92.0",
    data: "2026-10-14",
    titulo: "Segurança: sessão inativa e alertas de login",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Aba Segurança: o administrador escolhe depois de quanto tempo parada a sessão é encerrada (15 min a 8 h, ou não encerra).", link: "/painel/configuracoes?aba=seguranca" },
      { tipo: "novo", area: "Notificações", texto: "Alerta de login suspeito no sino dos administradores: entrada por um aparelho novo (também avisa a própria pessoa) e conta bloqueada por senhas erradas.", link: "/painel/configuracoes?aba=seguranca" },
      { tipo: "correcao", area: "Acesso", texto: "\"Esqueci a senha\" não revela mais se um e-mail tem conta ao pedir o código duas vezes.", link: "/login?modo=senha" },
      { tipo: "correcao", area: "Consulta pública", texto: "Objeto, setor e responsável dos DFDs na consulta pública passam pela máscara de dados pessoais (CPF, e-mail, telefone).", link: "/" },
    ],
  },
  {
    versao: "1.91.1",
    data: "2026-10-14",
    titulo: "Correções da auditoria",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Item sem a quantidade carregada não é mais apontado como \"sem quantidade\" por engano.", link: "/painel/mesa" },
      { tipo: "correcao", area: "Mesa", texto: "Importação em lotes: a quantidade ausente ou fracionada também é barrada nos lotes seguintes quando a Avaliação manda bloquear.", link: "/painel/mesa" },
      { tipo: "correcao", area: "Orçamento", texto: "Relatório da composição por unidade: as unidades com contratações são escolhidas pelo cadastro, não pela sigla (siglas repetidas entre órgãos).", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.91.0",
    data: "2026-10-14",
    titulo: "Módulos configuráveis, chat por grupo e quem vê os online",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Nova aba Módulos: o ADM cria os módulos do menu, dá nome, ordena e define as telas de cada um. O menu mostra uma seção por módulo.", link: "/painel/configuracoes?aba=modulos" },
      { tipo: "melhoria", area: "Grupos", texto: "O grupo passa a liberar módulos (as telas vêm deles) e ganhou a chave “Chat liberado”.", link: "/painel/grupos" },
      { tipo: "novo", area: "Configurações", texto: "Em Papéis → Detalhes → Presença, o ADM define se o papel vê quem está online.", link: "/painel/configuracoes?aba=papeis" },
    ],
  },
  {
    versao: "1.90.3",
    data: "2026-10-14",
    titulo: "KPIs do orçamento do PCA: detalhes completos e baixas",
    mudancas: [{ tipo: "melhoria", area: "PCA", texto: "As KPIs do Orçamento do PCA voltaram com todos os detalhes, em duas colunas e sem a divisória — mais baixas.", link: "/painel/pca" }],
  },
  {
    versao: "1.90.2",
    data: "2026-10-14",
    titulo: "KPIs do orçamento do PCA mais compactas",
    mudancas: [{ tipo: "melhoria", area: "PCA", texto: "As KPIs do Orçamento do PCA ficaram mais baixas: o valor completo e todos os detalhes em duas colunas, sem a divisória.", link: "/painel/pca" }],
  },
  {
    versao: "1.90.1",
    data: "2026-10-14",
    titulo: "KPIs do orçamento do PCA completas",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "As KPIs do Orçamento do PCA mostram os valores completos e os detalhes: a visão, a dotação bruta e o retirado, o que está sem vínculo, as contratações e o planejado sem orçamento, as unidades com saldo e com déficit e quantas estão dentro, em atenção ou acima.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.90.0",
    data: "2026-10-14",
    titulo: "Quantidade fracionada e ajuda nas avaliações",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Novo ponto de avaliação “Quantidade menor que 1” (item com quantidade entre 0 e 1, ex.: 0,001): aponta “Quantidade fracionada” no item, no DFD e no protocolo — atenção por padrão, configurável (bloqueia/avisa/ignora).", link: "/painel/configuracoes?aba=avaliacao" },
      { tipo: "melhoria", area: "Configurações", texto: "Cada ponto de Avaliação tem o (?) com o que confere, onde aparece, como funciona e o que cada comportamento faz; também “Editável”, estados de ciclo, assuntos, travas e botões da protocolação.", link: "/painel/configuracoes?aba=avaliacao" },
    ],
  },
  {
    versao: "1.89.3",
    data: "2026-10-14",
    titulo: "Quantidade zerada apontada na Mesa",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "A Mesa aponta “Quantidade zerada” (erro) no Estado do item, do DFD e do protocolo — separado de “Item sem quantidade” —, com o filtro da coluna Estado para achar todos.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.89.2",
    data: "2026-10-14",
    titulo: "Item com quantidade zero é erro",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Item com quantidade zerada (ou negativa) passa a ser erro “Item sem quantidade (vazia ou zero)” — na célula Estado, nas pendências, no despacho e na importação, como já era o valor unitário. Antes só a quantidade vazia era apontada e o item com total R$ 0,00 passava como regular.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.89.1",
    data: "2026-10-14",
    titulo: "KPIs do Dashboard do PCA completas",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "As KPIs do Dashboard mostram os valores completos (sem abreviar) e mais detalhes: itens com valor, média por DFD, classificações, protocolos, DFDs, unidades, mediana, menor valor, itens acima da média e a participação do maior item.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.89.0",
    data: "2026-10-14",
    titulo: "Relatório da composição por unidade",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "O Relatório da composição do orçamento do PCA pode sair de todas as unidades ou só das escolhidas — num arquivo só ou um PDF para cada unidade.", link: "/painel/pca" },
      { tipo: "correcao", area: "Sistema", texto: "Tocar de novo no número da versão, com as Novidades abertas, fecha o banner.", link: "/painel" },
    ],
  },
  {
    versao: "1.88.1",
    data: "2026-10-14",
    titulo: "Card do orçamento renovado",
    mudancas: [
      { tipo: "melhoria", area: "Orçamento", texto: "O card mostra a dotação abreviada e completa, a composição (inicial, suplementação, anulação, emenda), a execução com o % e os valores completos, e órgãos, unidades, programas, ações e lançamentos — sem cortar texto.", link: "/painel/orcamento" },
    ],
  },
  {
    versao: "1.88.0",
    data: "2026-10-14",
    titulo: "Vínculos expandidos definidos no papel",
    mudancas: [
      { tipo: "melhoria", area: "Configurações", texto: "Em Papéis → Detalhes → Exibição, o ADM define se os vínculos já abrem expandidos no banner do Orçamento do PCA (saiu a chave do banner).", link: "/painel/configuracoes?aba=papeis" },
    ],
  },
  {
    versao: "1.87.1",
    data: "2026-10-14",
    titulo: "Barra de progresso ao trocar a visão",
    mudancas: [{ tipo: "melhoria", area: "PCA", texto: "Trocar a visão do orçamento mostra a barra de progresso com a porcentagem e a etapa no aviso do canto inferior.", link: "/painel/pca" }],
  },
  {
    versao: "1.87.0",
    data: "2026-10-14",
    titulo: "Vínculos: abrir expandidos e progresso da gravação",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "Banner dos vínculos da linha: \"Abrir expandidos\" deixa todos os vínculos já abertos ao entrar (preferência deste aparelho); vários podem ficar abertos ao mesmo tempo.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Orçamento", texto: "Gravar ou excluir um vínculo mostra a barra de progresso com a porcentagem e a etapa (enviando, gravado, recalculando) no aviso do canto inferior.", link: "/painel/orcamento" },
    ],
  },
  {
    versao: "1.86.1",
    data: "2026-10-14",
    titulo: "Filtros da visão em consulta",
    mudancas: [{ tipo: "melhoria", area: "Orçamento", texto: "Na visão em consulta, cada filtro abre e mostra os valores que entram (com a dotação e os lançamentos) e os que ficam de fora — sem poder alterar.", link: "/painel/pca" }],
  },
  {
    versao: "1.86.0",
    data: "2026-10-14",
    titulo: "Ver as configurações da visão",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "Olho ao lado da Visão no PCA × Orçamento: abre os filtros e os vínculos da visão em uso só para consulta, sem poder alterar.", link: "/painel/pca" },
      { tipo: "novo", area: "Papéis", texto: "Componente \"Configurações da visão\" no PCA: o ADM decide, por papel, quem vê o olho.", link: "/painel/configuracoes?aba=papeis" },
    ],
  },
  {
    versao: "1.85.2",
    data: "2026-10-14",
    titulo: "Carregando ao trocar a visão",
    mudancas: [{ tipo: "melhoria", area: "PCA", texto: "Trocar a visão do orçamento no PCA mostra o aviso \"Aplicando a visão…\" com o carregando no canto inferior até os números novos chegarem.", link: "/painel/pca" }],
  },
  {
    versao: "1.85.1",
    data: "2026-10-14",
    titulo: "Caixas de marcar não deslocam mais os banners",
    mudancas: [{ tipo: "correcao", area: "Sistema", texto: "Marcar uma caixa (ex.: as ações de um vínculo do orçamento) não faz mais o banner pular e mostrar um espaço em branco — vale em todas as caixas de marcar.", link: "/painel/pca" }],
  },
  {
    versao: "1.85.0",
    data: "2026-10-14",
    titulo: "Configurações do orçamento em modo consulta",
    mudancas: [
      { tipo: "melhoria", area: "Orçamento", texto: "Aba Vínculos: quem não configura o Orçamento abre cada vínculo para ver as ações e os destinos, sem poder alterar.", link: "/painel/orcamento" },
      { tipo: "melhoria", area: "PCA", texto: "PCA × Orçamento: a coluna Vínculos, o banner da linha e a engrenagem da visão abrem para todos em modo consulta; só quem configura altera.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.84.1",
    data: "2026-10-14",
    titulo: "Visão do orçamento sem exigir Configurar",
    mudancas: [{ tipo: "melhoria", area: "PCA", texto: "Trocar a visão do orçamento no PCA × Orçamento passou a valer para quem visualiza o PCA — não é mais tratado como configuração.", link: "/painel/pca" }],
  },
  {
    versao: "1.84.0",
    data: "2026-10-14",
    titulo: "Papéis com controle por componente",
    mudancas: [
      { tipo: "novo", area: "Papéis", texto: "Detalhes do papel → Componentes: em cada tela, escolha por aba/visão/tabela o que o papel vê, manipula, importa, exporta, exclui ou configura.", link: "/painel/configuracoes?aba=papeis" },
      { tipo: "melhoria", area: "Papéis", texto: "(?) explicativo em cada tela, ação, componente e detalhe do editor de papéis.", link: "/painel/configuracoes?aba=papeis" },
    ],
  },
  {
    versao: "1.83.4",
    data: "2026-10-14",
    titulo: "Cabeçalho da tarefa compacto",
    mudancas: [{ tipo: "melhoria", area: "Tarefas", texto: "O cabeçalho do banner da tarefa ficou compacto: círculo, ticket e título alinhados na mesma altura.", link: "/painel/tarefas" }],
  },
  {
    versao: "1.83.3",
    data: "2026-10-14",
    titulo: "Rodapé do cartão em uma linha",
    mudancas: [{ tipo: "melhoria", area: "Tarefas", texto: "O rodapé do cartão junta ícones, unidade, números da Mesa e fotos numa única linha.", link: "/painel/tarefas" }],
  },
  {
    versao: "1.83.2",
    data: "2026-10-14",
    titulo: "PDF da lista com todo o conteúdo das tarefas",
    mudancas: [{ tipo: "melhoria", area: "Tarefas", texto: "O PDF da lista traz cada tarefa completa: dados, descrição, notas, links, checklists com os itens, eventos e comentários.", link: "/painel/tarefas" }],
  },
  {
    versao: "1.83.1",
    data: "2026-10-14",
    titulo: "Listas do quadro mais largas",
    mudancas: [{ tipo: "melhoria", area: "Tarefas", texto: "As listas do quadro ficaram mais largas (20rem): títulos e o pé da lista sem quebras; o botão do filtro da lista foi corrigido.", link: "/painel/tarefas" }],
  },
  {
    versao: "1.83.0",
    data: "2026-10-14",
    titulo: "Lista com filtro e PDF; cartão reorganizado",
    mudancas: [
      { tipo: "melhoria", area: "Tarefas", texto: "O cartão mostra a unidade e os números do protocolo/DFD/item numa linha própria; ícones e fotos embaixo.", link: "/painel/tarefas" },
      { tipo: "novo", area: "Tarefas", texto: "Filtro em cada lista do quadro por membros, unidade e protocolo/DFD/item (o funil no pé da lista).", link: "/painel/tarefas" },
      { tipo: "novo", area: "Tarefas", texto: "PDF da lista: o ícone no pé da lista baixa os cartões à vista.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.82.2",
    data: "2026-10-14",
    titulo: "Números da Mesa no cartão da tarefa",
    mudancas: [{ tipo: "melhoria", area: "Tarefas", texto: "O cartão da tarefa mostra em selos os números do protocolo, do DFD e do item vinculados.", link: "/painel/tarefas" }],
  },
  {
    versao: "1.82.1",
    data: "2026-10-14",
    titulo: "Tarefa com os números da Mesa e título no cabeçalho",
    mudancas: [
      { tipo: "melhoria", area: "Tarefas", texto: "A tarefa criada sobre um item já fica vinculada também ao DFD e ao protocolo dele; sobre um DFD, também ao protocolo.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Tarefas", texto: "O título da tarefa é editado direto no cabeçalho do banner (sem o campo repetido abaixo).", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.82.0",
    data: "2026-10-14",
    titulo: "Tarefas com a sigla da unidade e Emitir DFDs da lista",
    mudancas: [
      { tipo: "melhoria", area: "Tarefas", texto: "No banner da tarefa, todos os componentes que dá para adicionar ficam numa linha fixa acima do rodapé (rola de lado no celular).", link: "/painel/tarefas" },
      { tipo: "novo", area: "Tarefas", texto: "A tarefa ligada a protocolo, DFD ou item leva a SIGLA da unidade: no cartão, na coluna Unidade da Lista e no título sugerido ao criar pela Mesa.", link: "/painel/tarefas" },
      { tipo: "novo", area: "Tarefas", texto: "Filtrar por unidade (sigla, ou sem unidade) no painel Filtrar; o responsável já filtrava.", link: "/painel/tarefas" },
      { tipo: "novo", area: "Tarefas", texto: "Emitir DFDs (ADM): no rodapé da aba Lista, roda a automação com os DFDs das tarefas À VISTA — os filtros valem.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.81.1",
    data: "2026-10-14",
    titulo: "Tarefa da Mesa segue aberta depois de criada",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Editar uma tarefa pelo botão Tarefas não leva mais à tela de Tarefas; depois de criada, a tarefa continua aberta na Mesa para editar.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.81.0",
    data: "2026-10-14",
    titulo: "Tarefas da Mesa sem sair da Mesa",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "Criar tarefa num protocolo, DFD ou item abre a tarefa COMPLETA ali mesmo (lista, pessoas, datas, etiquetas, checklists, campos), já vinculada e com o título sugerido.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "As tarefas ligadas abrem e se editam por cima da Mesa; concluir/reabrir pelo círculo; filtro Abertas | Todas e atalho para o quadro.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.80.1",
    data: "2026-10-14",
    titulo: "Criar tarefa: só os quadros do grupo ativo",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "O \"Criar tarefa\" de um protocolo, DFD ou item lista só os quadros do grupo escolhido no cabeçalho, com o grupo informado no seletor.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.80.0",
    data: "2026-10-14",
    titulo: "Tarefas: lista com pessoa, tarefa sobre o item e exclusão limpa",
    mudancas: [
      { tipo: "novo", area: "Tarefas", texto: "A lista pode ser atribuída a uma pessoa (menu da lista): a foto fica no cabeçalho e a tarefa nova nela já nasce com a pessoa como responsável.", link: "/painel/tarefas" },
      { tipo: "novo", area: "Mesa", texto: "Tarefas também sobre um ITEM: o botão Tarefas no banner do item cria a tarefa já vinculada a ele (e o item pode ser vinculado a qualquer tarefa).", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "Ao criar a tarefa sobre um protocolo, DFD ou item, aparecem as listas atribuídas ao responsável do protocolo e a você — a tarefa já abre na lista certa.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Tarefas", texto: "Excluir a lista com as tarefas limpa o banco por inteiro — também os vínculos de outras tarefas que apontavam para elas.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.79.0",
    data: "2026-10-10",
    titulo: "Biblioteca de componentes só para o ADM",
    mudancas: [
      { tipo: "melhoria", area: "Administração", texto: "A biblioteca de componentes saiu da área pública e fica em Administração → Componentes, só para administradores.", link: "/painel/design-system" },
    ],
  },
  {
    versao: "1.78.1",
    data: "2026-10-09",
    titulo: "Linhas vazias só até a visão da tabela",
    mudancas: [
      { tipo: "correcao", area: "Tabelas", texto: "As linhas vazias completam a tabela só até o limite da visão (nunca além das linhas por página); com o conteúdo maior que a visão, nenhuma é acrescentada.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.78.0",
    data: "2026-10-09",
    titulo: "Tabelas: marcar antes de abrir e linhas intercaladas",
    mudancas: [
      { tipo: "melhoria", area: "Tabelas", texto: "Um clique marca a linha na cor de destaque; o segundo clique na linha marcada abre o banner (Enter abre direto).", link: "/painel/mesa" },
      { tipo: "novo", area: "Aparência", texto: "Cor das linhas intercaladas de todas as tabelas, no claro e no escuro.", link: "/painel/aparencia" },
      { tipo: "melhoria", area: "Tabelas", texto: "A página da tabela fica sempre cheia: linhas vazias completam as que faltam, sem seleção nem clique.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.77.1",
    data: "2026-10-09",
    titulo: "Verificação só para visualizar",
    mudancas: [
      { tipo: "melhoria", area: "Verificação", texto: "Protocolo ou DFD agora se escolhe num seletor à direita do título.", link: "/painel/verificacao" },
      { tipo: "correcao", area: "Verificação", texto: "Os banners da verificação são só de visualização: nada se edita, exclui ou seleciona.", link: "/painel/verificacao" },
    ],
  },
  {
    versao: "1.77.0",
    data: "2026-10-09",
    titulo: "Verificação nos grupos e Novidades pelo acesso",
    mudancas: [
      { tipo: "novo", area: "Grupos", texto: "A Verificação virou uma tela própria do grupo: o ADM a libera em “Telas do grupo” (quem já abria a Mesa continua com ela).", link: "/painel/grupos" },
      { tipo: "melhoria", area: "Grupos", texto: "Cartões dos grupos no padrão do sistema: as telas liberadas em ícones, pessoas, unidades e PCAs; tocar abre a edição.", link: "/painel/grupos" },
      { tipo: "melhoria", area: "Novidades", texto: "As Novidades do menu mostram só as mudanças das telas que o seu grupo abre.", link: "/painel/verificacao" },
    ],
  },
  {
    versao: "1.76.0",
    data: "2026-10-09",
    titulo: "Grupos: telas e PCAs no próprio grupo",
    mudancas: [
      { tipo: "novo", area: "Grupos", texto: "As telas que cada grupo abre agora se escolhem no próprio grupo. A tela Permissões saiu; cada grupo herdou as telas da permissão que usava.", link: "/painel/grupos" },
      { tipo: "novo", area: "Grupos", texto: "Cada grupo escolhe os PCAs que acessa: todos (também os que forem criados) ou só os marcados. Fora deles, o PCA some da lista, do cabeçalho, da Mesa e do Calendário.", link: "/painel/grupos" },
      { tipo: "melhoria", area: "Grupos", texto: "No banner de editar o grupo, o Salvar fica fixo no rodapé; o Cancelar saiu (o X fecha).", link: "/painel/grupos" },
      { tipo: "melhoria", area: "Notificações", texto: "O aviso de nova versão chega a todos, só com o que mudou nas telas que o grupo de cada pessoa abre.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.75.0",
    data: "2026-10-09",
    titulo: "Verificação de protocolos e DFDs",
    mudancas: [
      { tipo: "novo", area: "Verificação", texto: "Tela nova no menu Módulos: solte um protocolo (.pdf) ou um DFD (.pdf ou .xlsx) e veja todos os erros e atenções, com as mesmas regras da importação da Mesa \u2014 nada é gravado, serve só para consulta.", link: "/painel/verificacao" },
      { tipo: "novo", area: "Verificação", texto: "As pendências encontradas viram relatório: despacho, WhatsApp, lista ou PDF, pelo indicador no rodapé do banner.", link: "/painel/verificacao" },
      { tipo: "novo", area: "Usuários", texto: "Excluir um usuário agora o ARQUIVA: a pessoa perde o acesso e tudo fica guardado. Em \u201cArquivados\u201d, no rodapé da tabela, dá para restaurar ou excluir definitivamente.", link: "/painel/usuarios" },
      { tipo: "correcao", area: "Acesso", texto: "No login, a área do captcha tem altura fixa: ele aparece abaixo do botão Entrar sem mover nada.", link: "/login" },
    ],
  },
  {
    versao: "1.74.0",
    data: "2026-10-08",
    titulo: "Automações: lixeira e devolver ao painel",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Arraste um cartão da sua lista até a lixeira que surge no centro, embaixo, para excluí-lo \u2014 ela acende em vermelho com o cartão por cima e pede a confirmação.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Com o painel \u201cNovo fluxo\u201d aberto, arraste um cartão da sua lista de volta para ele: o fluxo sai da lista (com confirmação) e o modelo volta a ficar disponível no painel.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Ao arrastar um modelo do painel, o lugar em que ele vai cair aparece tracejado na sua lista só com o cartão sobre ela; fora da lista não há lugar marcado e, solto ali, o cartão volta voando ao painel.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.73.3",
    data: "2026-10-08",
    titulo: "Automações: a lista rola por dentro",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Os cartões das automações ficam num espaço com rolagem própria, na altura da tela — a página não rola mais; o painel \u201cNovo fluxo\u201d fica ao lado com a mesma altura e arrastar um cartão até a borda rola a lista.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.73.2",
    data: "2026-10-08",
    titulo: "Marcar todos sempre à vista",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Nas tabelas com marcação, a caixa do topo (marcar todos) fica fixa no cabeçalho ao rolar para baixo e para o lado \u2014 as caixas das linhas não passam mais por cima dela.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.73.1",
    data: "2026-10-08",
    titulo: "Rolagem leve: a barra acompanha o arrasto",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "As barras de rolagem (vertical e horizontal) voltaram a ser as do navegador, que seguem o arrasto na velocidade do ponteiro, sem travar \u2014 as barras desenhadas pelo sistema eram arrastadas pela página e atrasavam quando ela estava ocupada. Clara ou escura conforme o tema.", link: "/painel/mesa" },
      { tipo: "correcao", area: "Sistema", texto: "Rolar ficou mais leve em todas as telas: o cabeçalho e a navegação do celular não desfocam mais o conteúdo que passa por baixo a cada quadro, e as medidas do rodapé das tabelas e da barra de seleção só atualizam a página quando o tamanho muda de fato.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.73.0",
    data: "2026-10-08",
    titulo: "Responsável de fora do município",
    mudancas: [
      { tipo: "novo", area: "Órgãos e Unidades", texto: "No cadastro da pessoa responsável, a chave \u201cFuncionário de fora do município\u201d: ela fica sem matrícula (o campo some), a planilha mostra \u201cFora do município\u201d e a conferência deixa de apontar \u201cSem matrícula\u201d. Vale também no cadastro rápido ao vincular.", link: "/painel/orgaos?aba=responsaveis" },
    ],
  },
  {
    versao: "1.72.1",
    data: "2026-10-08",
    titulo: "Tabelas: rolagem lateral estável e caixa de marcar do sistema",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "A rolagem lateral das tabelas não treme nem trava mais: as bordas ficam nas células, então a coluna de marcação (e as congeladas) andam junto da borda ao rolar.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "A caixa de marcar das tabelas e dos filtros segue o arredondamento de Configurações → Aparência (até virar um círculo), no lugar do quadrado do navegador.", link: "/painel/aparencia" },
      { tipo: "correcao", area: "PCA", texto: "Na coluna Local da Mesa do PCA a informação não se repete mais (\u201cIncorporado · Incorporar\u201d virou \u201cIncorporado\u201d; a substituição e a exclusão dizem o que fazem) e a célula usa o mesmo desenho das colunas de estado.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.72.0",
    data: "2026-10-08",
    titulo: "Responsáveis sempre no lugar que vale",
    mudancas: [
      { tipo: "correcao", area: "Órgãos e Unidades", texto: "O responsável é gravado sempre onde a assinatura dos DFDs é conferida: no órgão com assinatura única e em cada unidade quando é por unidade. Os vínculos que estavam no lugar errado (ex.: na unidade própria de um órgão com assinatura única) foram levados ao órgão — a assinatura volta a conferir.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "melhoria", area: "Órgãos e Unidades", texto: "Ligar ou desligar a assinatura única, o “Também unidade”, promover, rebaixar ou trocar a unidade de órgão leva os responsáveis junto, automaticamente (com confirmação quando há escolha).", link: "/painel/orgaos" },
      { tipo: "melhoria", area: "Órgãos e Unidades", texto: "“Onde responde” separado em Órgãos e Unidades (agrupadas por órgão), só com os lugares que valem pela configuração; o (?) diz por que os demais não aparecem.", link: "/painel/orgaos?aba=responsaveis" },
    ],
  },
  {
    versao: "1.71.1",
    data: "2026-10-08",
    titulo: "Tabelas: marcação fixa e selos no raio do sistema",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Em toda tabela com a coluna de marcação, ela fica presa à esquerda ao rolar de lado — a caixa de marcar está sempre à vista.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "Os selos dentro das células (Situação, Centi, Execução, PCA, Prioridade, \u201c+N\u201d, ABC e etiquetas) seguem o arredondamento definido em Configurações → Aparência.", link: "/painel/aparencia" },
    ],
  },
  {
    versao: "1.71.0",
    data: "2026-10-08",
    titulo: "Automação: seleção nas tabelas e cartões mais simples",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Toda tabela do painel do fluxo tem a coluna de seleção: nas que alimentam a automação (Seleção, Do sistema, Tabela salva), as marcadas são as que passam (nenhuma marcada = todas); nas de resultado, “Executar com os selecionados” roda o fluxo só com elas.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "No “Ler do sistema”, o valor procurado é escolhido numa lista com o que existe no sistema (planejamentos, DFDs, protocolos ou produtos) e só aparece quando a busca não é “Todos”.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "O (?) fica no próprio cartão da automação: um toque mostra o que ela faz. O painel lateral “Novo fluxo” vai até o fim da tela, no padrão do sistema, e não mostra as automações que você já adicionou.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "Arrastar um modelo do painel até a lista funciona sempre, também com a lista vazia; “Atualizar pelo modelo” fica no próprio fluxo; o selo “Sem extensão” segue o mesmo desenho do Preview do PCA.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.70.2",
    data: "2026-10-08",
    titulo: "Automação: os DFDs do sistema à vista no painel",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "O componente “Ler do sistema” ganhou a aba “Do sistema” no painel do fluxo: os DFDs (ou protocolos e itens) lidos aparecem já ao abrir, sem executar e sem a extensão, na mesma tabela da Mesa — tocar abre o banner.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.70.1",
    data: "2026-10-08",
    titulo: "Proteção de captura invisível",
    mudancas: [
      { tipo: "correcao", area: "Configurações", texto: "A proteção de impressão e captura ficou invisível: a tela não pisca nem é coberta ao usar as teclas. A impressão sai em branco e a imagem do PrtScn some da área de transferência.", link: "/painel/configuracoes?aba=protecao" },
    ],
  },
  {
    versao: "1.70.0",
    data: "2026-10-08",
    titulo: "Consulta de itens em uma linha",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Na Consulta de itens do Dashboard, as abas, a busca e a ajuda (?) ficam numa linha só, todas na mesma altura; a explicação saiu da tela e foi para o (?).", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "As linhas das tabelas da consulta ficam na altura padrão: o produto, o assunto e o motivo em uma linha, com o texto inteiro na dica.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Os selos de ano e Preview da linha de título seguem o arredondamento dos controles definido pelo ADM em Aparência.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.69.2",
    data: "2026-10-08",
    titulo: "Nome do espaço em destaque",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "O nome do PCA (e do orçamento) ficou maior, preenchendo a altura da linha de título, junto da seta e dos selos.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.69.1",
    data: "2026-10-08",
    titulo: "Linha de título com a altura da seta",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "Nome, ano e status do PCA com a mesma altura do botão de voltar; o mesmo no Orçamento.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "O selo Preview ficou mais limpo: sem o lápis e sem o brilho — o ponto respira e solta ondas suaves.", link: "/painel/pca" },
      { tipo: "correcao", area: "PCA", texto: "No Dashboard do PCA, os indicadores, os filtros e os gráficos voltaram a ter o espaço padrão entre si.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.69.0",
    data: "2026-10-08",
    titulo: "Linha de título padronizada",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Nome, ano e status do PCA com a mesma altura, proporcional ao botão de voltar; o Preview ganhou ícone e um brilho ao vivo que varre o selo.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Orçamento", texto: "A linha do título do orçamento segue o mesmo padrão: nome e ano com a mesma altura.", link: "/painel/orcamento" },
      { tipo: "melhoria", area: "Sistema", texto: "Abaixo da linha de título de cada tela, o mesmo espaço que há acima dela — padronizado em todo o sistema.", link: "/painel/configuracoes" },
    ],
  },
  {
    versao: "1.68.1",
    data: "2026-10-08",
    titulo: "Margens do conteúdo proporcionais",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "O conteúdo ficou mais perto do cabeçalho e da base da tela — metade da margem lateral, que segue igual — e as quatro distâncias ficam proporcionais em todas as telas.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.68.0",
    data: "2026-10-08",
    titulo: "Respiro interno igual nos 4 lados",
    mudancas: [
      { tipo: "melhoria", area: "Sistema", texto: "Cartões, quadros e banners passaram a ter o MESMO respiro interno em cima, embaixo e nas laterais, em todas as telas (a régua da densidade do ADM).", link: "/painel/pca" },
      { tipo: "correcao", area: "PCA", texto: "Os indicadores (KPIs) tinham um recuo extra à esquerda; agora o texto fica à mesma distância de todas as bordas.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.67.1",
    data: "2026-10-08",
    titulo: "Botão de ajuda (?) centralizado",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "O ícone do botão de ajuda (?) ficava encostado à esquerda, fora do fundo ao passar o mouse. Agora fica centralizado em todas as telas.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.67.0",
    data: "2026-10-08",
    titulo: "Espaço do PCA mais limpo",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Nome, ano e situação do PCA na mesma linha das abas; a aba Configuração virou só o ícone da engrenagem.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Ano com o ícone do calendário e o selo Preview com o ponto pulsando (ao vivo); o texto da fonte (Protocolos) saiu do cabeçalho.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Dashboard: o aviso da prévia virou o (?) ao lado das abas e saiu o filtro de unidade do topo — o filtro Unidade abaixo dos KPIs faz o mesmo.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.66.1",
    data: "2026-10-08",
    titulo: "Giro da seta mais suave",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "A seta dos dropdowns gira mais devagar e de forma suave — começa e termina com calma, ao abrir e ao fechar.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.66.0",
    data: "2026-10-08",
    titulo: "Seta dos dropdowns gira ao abrir",
    mudancas: [
      { tipo: "melhoria", area: "Sistema", texto: "Em toda lista de seleção, filtro e menu, a seta gira suave ao abrir e aponta para o lado oposto da lista — mostra onde tocar para fechar. Ao fechar, volta girando.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.65.0",
    data: "2026-10-08",
    titulo: "Proteção de dados corrigida + marca d'água",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "“Ocultar ao sair da janela” cobria a tela toda vez que um campo perdia o foco. Agora só cobre quando a janela inteira perde o foco.", link: "/painel/configuracoes?aba=protecao" },
      { tipo: "melhoria", area: "Sistema", texto: "A proteção é imperceptível no uso: nada aparece na tela. A impressão sai em branco e a captura com a tecla Windows (Win+Shift+S, Win+PrtScn) ou Cmd+Shift no Mac sai coberta; no PrtScn, a imagem some da área de transferência.", link: "/painel/configuracoes?aba=protecao" },
      { tipo: "novo", area: "Configurações", texto: "Marca d'água invisível na tela com o nome, a matrícula e a hora de quem vê — fica na captura e sai legível no papel.", link: "/painel/configuracoes?aba=protecao" },
    ],
  },
  {
    versao: "1.64.0",
    data: "2026-10-08",
    titulo: "Listas de seleção mais completas",
    mudancas: [
      { tipo: "melhoria", area: "Sistema", texto: "A lista abre alinhada à caixa inteira do campo, rápida, com linhas mais baixas no computador. A busca e o título ficam fixos no topo ao rolar.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Sistema", texto: "No celular, as listas grandes sobem de baixo, ocupando a largura da tela. Com o campo fechado, digitar uma letra já troca a opção.", link: "/painel/configuracoes" },
      { tipo: "novo", area: "PCA", texto: "Na Visão do PCA × Orçamento, cada visão mostra o resumo dos filtros e em quantos PCAs é usada. O ponto âmbar marca a visão com valores fora deste orçamento, e “Editar esta visão” e “Nova visão” ficam no rodapé da lista. As visões salvas aparecem separadas do “Orçamento inteiro”.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Mesa", texto: "A Situação, na edição em massa, e a Classificação, na unidade de medida, mostram a cor de cada opção.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.63.0",
    data: "2026-10-08",
    titulo: "Proteção de dados",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Nova aba Proteção de dados: bloqueie a seleção e a cópia de texto, a impressão e a captura de tela, e oculte o conteúdo quando a janela perde o foco.", link: "/painel/configuracoes?aba=protecao" },
      { tipo: "novo", area: "Configurações", texto: "O ADM escolhe em quais papéis os bloqueios valem (em todas as telas e banners) e se a tela pública também é bloqueada.", link: "/painel/configuracoes?aba=protecao" },
    ],
  },
  {
    versao: "1.62.0",
    data: "2026-10-08",
    titulo: "Listas de seleção no desenho do sistema",
    mudancas: [
      { tipo: "melhoria", area: "Sistema", texto: "Toda lista de seleção (Visão, Linhas, Colunas, Medida, cargo, unidade, papel e as demais) abre agora no desenho do sistema, e não mais na lista do aparelho. A opção escolhida fica em destaque com o check, os grupos aparecem separados e as opções indisponíveis ficam esmaecidas, com o motivo na dica.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Sistema", texto: "Listas com mais de 12 opções ganham a busca no topo. Pelo teclado: setas, Enter e digitar a letra para saltar. No celular, as opções têm o tamanho do toque.", link: "/painel/configuracoes" },
    ],
  },
  {
    versao: "1.61.0",
    data: "2026-10-07",
    titulo: "Vínculos por visão do orçamento",
    mudancas: [
      { tipo: "novo", area: "Orçamento", texto: "Cada visão pode ter os seus vínculos por unidade do orçamento. Os vínculos de antes viram o padrão, e a visão segue o padrão até ganhar os seus. Na aba Vínculos, escolha a visão na barra.", link: "/painel/orcamento" },
      { tipo: "novo", area: "Orçamento", texto: "Ao salvar um vínculo, escolha onde ele vale: só esta visão, todas, ou as visões que você marcar. “Usar o padrão” devolve a unidade ao padrão na visão.", link: "/painel/orcamento" },
      { tipo: "novo", area: "Orçamento", texto: "O banner da visão ganhou a parte Vínculos, ao lado dos filtros, e a lista de visões mostra quais têm vínculos próprios.", link: "/painel/orcamento" },
      { tipo: "melhoria", area: "PCA", texto: "O Orçamento do PCA usa os vínculos da visão do PCA: KPIs, PCA × Orçamento, Comparativo e relatório. O vínculo de cada linha também pergunta onde salvar.", link: "/painel/pca" },
      { tipo: "novo", area: "Orçamento", texto: "Um (?) explica as visões, nas abas Visões e Vínculos, no banner da visão e no PCA × Orçamento.", link: "/painel/orcamento" },
    ],
  },
  {
    versao: "1.60.0",
    data: "2026-10-07",
    titulo: "Nomeações unificadas nos Responsáveis",
    mudancas: [
      { tipo: "novo", area: "Responsáveis", texto: "No banner da pessoa, os vínculos com o mesmo ato (decreto, portaria ou lei de mesmo número) aparecem num cartão só, com todos os lugares em que ela responde.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "novo", area: "Responsáveis", texto: "Editar a nomeação vale para todos os lugares de uma vez: os dados ficam iguais em todos, lugares novos entram e o lugar desmarcado sai (com confirmação).", link: "/painel/orgaos?aba=responsaveis" },
    ],
  },
  {
    versao: "1.59.0",
    data: "2026-10-07",
    titulo: "Editar onde o responsável responde; cargo fora da lista é erro",
    mudancas: [
      { tipo: "melhoria", area: "Responsáveis", texto: "Cargo ou função fora da lista de Cargos e funções (da pessoa ou do temporário) agora é ERRO na Conferência — também no órgão e na unidade em que a pessoa responde.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "novo", area: "Responsáveis", texto: "Ao editar um vínculo, dá para trocar onde ele responde (unidade ou órgão), a pessoa e os dados — e escolher mais lugares, que viram vínculos novos com a mesma nomeação.", link: "/painel/orgaos?aba=responsaveis" },
    ],
  },
  {
    versao: "1.58.0",
    data: "2026-10-07",
    titulo: "Responsáveis exonerados, vários lugares por nomeação e ordem por cargo",
    mudancas: [
      { tipo: "novo", area: "Responsáveis", texto: "Exonerar um responsável com a data: os vínculos cadastrados continuam valendo, mas ele não recebe vínculos novos nem um vínculo que comece depois da exoneração. Os exonerados ficam no botão “Exonerados”, à direita, com as linhas em cinza.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "novo", area: "Responsáveis", texto: "Ao vincular, escolha várias unidades e órgãos de uma vez — todos recebem a mesma nomeação e o mesmo período.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "melhoria", area: "Responsáveis", texto: "Vínculo encerrado não é mais erro nem atenção: aparece em cinza na nova coluna “Encerrados”.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "melhoria", area: "Responsáveis", texto: "A planilha abre pela prioridade do cargo (a ordem de Configurações → Cargos e funções) e depois pelo nome; os vínculos de cada lugar seguem a mesma ordem.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "melhoria", area: "Órgãos", texto: "“Também unidade” virou uma coluna própria e o nome do órgão aparece inteiro em até duas linhas.", link: "/painel/orgaos" },
    ],
  },
  {
    versao: "1.57.0",
    data: "2026-10-07",
    titulo: "Tabelas das automações iguais às da Mesa",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "As tabelas das automações (Seleção, Análise ao vivo e Tabela salva) usam as MESMAS tabelas da Mesa: protocolos, DFDs e itens com as mesmas colunas, filtros e exportação.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Tocar numa linha abre o protocolo, o DFD ou o item na mesma pilha de banners da Mesa, sem sair da automação.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.56.0",
    data: "2026-10-07",
    titulo: "Responsáveis com cargo, período e foto; órgãos pelo código da Centi",
    mudancas: [
      { tipo: "novo", area: "Responsáveis", texto: "O cargo ou função é da PESSOA, escolhido entre os cargos cadastrados (nova coluna “Cargo/função padrão”); o vínculo padrão segue o cargo dela e o temporário tem o cargo próprio do período. As funções digitadas antes viraram cargos cadastrados.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "novo", area: "Responsáveis", texto: "O padrão agora tem data inicial e final — sem data final, vale até ser informada; a assinatura do DFD só confere dentro do período (o padrão antigo, sem datas, segue igual). Padrão e temporários aparecem em seções separadas.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "novo", area: "Responsáveis", texto: "O responsável pode ser ligado a um usuário da plataforma (sugerido pela mesma matrícula) e ganha a foto dele no nome.", link: "/painel/orgaos?aba=responsaveis" },
      { tipo: "novo", area: "Configurações", texto: "Aba “Cargos e funções”: a lista usada no cadastro dos usuários e dos responsáveis — renomear um cargo renomeia em todos.", link: "/painel/configuracoes?aba=cargos" },
      { tipo: "melhoria", area: "Órgãos", texto: "Órgãos ordenados pelo código da Centi (sem ordenação manual), com as colunas Código Centi · Nome · Sigla à frente e a edição da tabela (ocultar, arrastar, congelar e salvar edições).", link: "/painel/orgaos" },
    ],
  },
  {
    versao: "1.55.1",
    data: "2026-10-07",
    titulo: "Substituir DFDs pela Centi: estado real e leitura completa",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "Na análise do “Substituir DFDs pelos dados da Centi”, cada DFD mostra Substituído (com os itens gravados) ou Falhou (com o motivo) — não fica mais em “Processado”, e o Ok conta os substituídos.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "O PDF baixado da Centi para substituir um DFD é lido como na importação, inclusive a assinatura achatada por OCR.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.55.0",
    data: "2026-10-07",
    titulo: "Visão do orçamento à vista no PCA",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "PCA × Orçamento: o seletor “Visão” na barra da tabela — escolher a visão do orçamento do PCA na hora, sem abrir a engrenagem (quem não configura o PCA vê a visão em uso, travada).", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.54.2",
    data: "2026-10-07",
    titulo: "DFDs com textos longos aceitos",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "DFDs com descrição de item, objeto, órgão, setor ou seção muito longos eram recusados na protocolação, no reenvio e na importação avulsa (“Grande demais: esperava que o texto tivesse <= 4000 caracteres”). Agora cada um desses textos aceita até 20 mil caracteres — também ao editar o DFD gravado.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "O envio dos itens de um DFD se divide também pelo tamanho das descrições: DFDs com muitas descrições longas são gravados sem nenhum pedido pesado.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.54.1",
    data: "2026-10-07",
    titulo: "Seleção das automações com os itens certos",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A tabela de seleção mostrava itens de outra automação (ou de uma execução antiga pela Mesa). Agora cada automação abre com os próprios itens — no “Substituir DFDs pelos dados da Centi”, todos os DFDs do sistema para escolher.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.54.0",
    data: "2026-10-07",
    titulo: "Baixar DFDs por DFD e andamento sempre à vista",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Modelo “Baixar DFDs · por DFD”: escolha DFD a DFD no sistema (ou os selecionados na Mesa) e baixe cada um da Centi.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "O andamento fica minimizado no canto em qualquer tela, inclusive na da Automação; expandir mostra DFD a DFD (Salvo, Falhou, Baixando) com a contagem correta.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.53.0",
    data: "2026-10-07",
    titulo: "Responsáveis por DFDs numa planilha única",
    mudancas: [
      {
        tipo: "novo",
        area: "Órgãos e Unidades",
        texto:
          "Planilha única dos responsáveis: cada pessoa (nome + matrícula) é cadastrada uma vez e vinculada a unidades ou órgãos — padrão ou temporário, com função, nomeação e período. Os responsáveis cadastrados antes foram convertidos sem perder nada.",
        link: "/painel/orgaos?aba=responsaveis",
      },
      {
        tipo: "novo",
        area: "Órgãos e Unidades",
        texto:
          "Vincular segue a regra do órgão: assinatura única = os responsáveis do órgão; por unidade = os de cada unidade. Escolha a pessoa da planilha (busca por nome ou matrícula) ou cadastre na hora.",
        link: "/painel/orgaos",
      },
      {
        tipo: "novo",
        area: "Órgãos e Unidades",
        texto:
          "Coluna Conferência: aponta quem está sem responsável vigente, sem matrícula, sem função ou nomeação, temporário encerrado e nomes repetidos com matrículas diferentes.",
        link: "/painel/orgaos",
      },
      {
        tipo: "melhoria",
        area: "Órgãos e Unidades",
        texto:
          "Tabelas de órgãos e unidades no padrão da Mesa (filtros por coluna, exportar XLSX/PDF) e um banner por órgão/unidade com os dados por cadeado, os responsáveis, a estrutura, ocultar e excluir.",
        link: "/painel/orgaos",
      },
    ],
  },
  {
    versao: "1.52.0",
    data: "2026-10-07",
    titulo: "Nós das automações: tudo por escolha e (?) didático",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Automação",
        texto:
          "Comportamento 100% por escolha (Repetir, Esperar, Guardar o resultado — com o nome sugerido — e Desativar), cada um com o (?).",
        link: "/painel/automacao",
      },
      {
        tipo: "melhoria",
        area: "Automação",
        texto:
          "Todos os nós revisados: limites, tempos, lotes e tolerâncias em opções; tabelas salvas, colunas da Mesa e variáveis escolhidas da lista (ou um nome novo); “Gravar no campo” pelos campos do item.",
        link: "/painel/automacao",
      },
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "O (?) de cada campo agora explica para que serve, como preencher e as opções.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.51.0",
    data: "2026-10-07",
    titulo: "Seleção carrega todos os DFDs e campos dos nós por escolha",
    mudancas: [
      {
        tipo: "correcao",
        area: "Automação",
        texto:
          "A seleção do “Substituir DFDs” voltou a carregar: rodando sozinho, o “Ler do sistema” com o campo do nó anterior lê TODOS os DFDs; vindo da Mesa, só os escolhidos lá.",
        link: "/painel/automacao",
      },
      {
        tipo: "melhoria",
        area: "Automação",
        texto:
          "Campos dos nós por escolha: os dados do nó anterior em lista (com “Ler os campos” sem executar), o valor que vem do nó anterior fica travado com a origem à vista, órgãos da Centi em lista, Repetir/Esperar em opções e o (?) em todo campo.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.50.1",
    data: "2026-10-07",
    titulo: "Seleção da automação carrega os itens",
    mudancas: [
      {
        tipo: "correcao",
        area: "Automação",
        texto:
          "A tabela de seleção não carregava (“Informe o valor procurado”): o “Ler do sistema” com {{campo}} e sem itens chegando agora lê todos — você escolhe na tabela; vindos da Mesa, segue filtrando.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.50.0",
    data: "2026-10-07",
    titulo: "Automações rodam direto da Mesa, em segundo plano",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "Botão “Automação” na barra de seleção: roda a automação com os protocolos, DFDs ou itens SELECIONADOS (a seleção da Mesa vale no componente de seleção do fluxo).", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "O robô da barra do topo roda com TODOS os protocolos, DFDs ou itens filtrados da visão aberta.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Automação", texto: "A automação não leva mais à tela da Automação: confirma na Mesa e roda em segundo plano, acompanhada (e interrompida) pelo painel flutuante do canto inferior.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.49.2",
    data: "2026-10-07",
    titulo: "A seleção das automações carrega os itens sozinha",
    mudancas: [
      {
        tipo: "correcao",
        area: "Automação",
        texto: "A tabela “Selecionar itens” de qualquer automação já lista os itens ao abrir (lê só o que vem antes dela, sem gravar nada) — com “Recarregar itens” no rodapé. Marque e execute.",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.49.1",
    data: "2026-10-07",
    titulo: "Escolher quais DFDs serão substituídos",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Automação",
        texto: "Na automação “Substituir DFDs pelos dados da Centi”, uma tabela de seleção mostra os DFDs encontrados e só os marcados são substituídos (use “Atualizar pelo modelo” nas automações já criadas).",
        link: "/painel/automacao",
      },
    ],
  },
  {
    versao: "1.49.0",
    data: "2026-10-07",
    titulo: "Substituir DFD pelos dados da Centi e automações na Mesa",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Modelo “Substituir DFDs pelos dados da Centi”: cada DFD é lido na Centi e os dados gravados no sistema são substituídos pelos da Centi (a mesma sobrescrita do banner, com o histórico).", link: "/painel/automacao" },
      { tipo: "novo", area: "Mesa", texto: "Botão Automações na barra da Mesa do sistema: roda a automação escolhida com os DFDs selecionados (ou os à vista).", link: "/painel/mesa" },
      { tipo: "novo", area: "Automação", texto: "“Disponível na Mesa” nas configurações de cada automação — escolha pessoal de quais aparecem no botão da Mesa.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.48.0",
    data: "2026-10-07",
    titulo: "Automações de cada ADM, públicas ou privadas",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Cada Administrador tem o PRÓPRIO painel de automações; os outros ADMs não veem nem mexem nas suas.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Automação PÚBLICA ou privada (Configurações da automação): as públicas aparecem no painel lateral “Novo fluxo” dos outros ADMs, que usam uma cópia ou a chamam dentro dos fluxos deles. As que já existiam ficaram públicas.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Tabela dos itens processados: coluna Órgão, rolagem estável durante a execução (os novos entram no fim) e linhas por página escolhidas no rodapé e salvas.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.47.0",
    data: "2026-10-07",
    titulo: "CM002 com “Mostrar: Todos” e o nó Órgão na Centi",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A CM002 é lida como a tela pediu e com “Mostrar: Todos” — vale a resposta com mais linhas, página a página se preciso; a consulta guardada é a que trouxe mais linhas. Saiu a limpeza de filtros da 1.46.0 (extensão 1.21.0).", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Nó “Órgão na Centi”: cada DFD é analisado no órgão dele (o ID da Centi cadastrado no órgão) ou em órgãos fixos; “um órgão por vez” troca o órgão em análise na Centi a cada lote. O modelo “Execução dos DFDs na CM002” já o usa.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.46.0",
    data: "2026-10-07",
    titulo: "CM002 lida por inteiro e coluna Situação na Mesa",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A CM002 é lida INTEIRA: sem os filtros da tela (Referência/Finalidade/Situação) e página a página até o total que a Centi informa. Leitura incompleta ou filtrada para o fluxo com o motivo — nunca marca “não encontrado” à toa (extensão 1.20.0).", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "O nó CM002 avisa quantas linhas leu de cada órgão (lidas de total, páginas).", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Mesa", texto: "A coluna Execução virou “Situação”. Na Mesa do PCA, Situação e Centi abrem ocultas — mostre-as pela edição da tabela.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.45.1",
    data: "2026-10-07",
    titulo: "Execução dos DFDs sempre em texto e todos avaliados",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "A coluna Execução mostra só o texto da Situação da CM002 — os códigos numéricos antigos foram apagados e nunca mais são gravados.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Automação", texto: "Todo DFD de órgão cadastrado recebe a Execução: a Situação da CM002 ou “Não encontrado na CM002” (refaça o fluxo pelo modelo).", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "“Entidade” virou “Órgão” nos nós e ajustes da Centi.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.45.0",
    data: "2026-10-07",
    titulo: "Execução dos DFDs pela lista da CM002 e tabelas nas automações",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "O modelo “Execução dos DFDs na CM002” lê a lista da CM002 uma vez por órgão (só as entidades dos DFDs), casa o nº de planejamento com o ID na mesma entidade e grava a Situação na coluna Execução.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Mesa", texto: "A coluna Execução passa a receber o texto da Situação da CM002 (Executado, Não Executado…), não mais um código numérico.", link: "/painel/mesa" },
      { tipo: "novo", area: "Automação", texto: "Nós “Salvar em tabela” e “Ler tabela salva”: guarde dados de uma automação (ex.: planejamentos da CM002 sem DFD no sistema), veja no painel e use colunas e linhas em outras automações.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "“Procurar nas linhas” casa também um segundo campo (ex.: a entidade) e “Gravar execução” lê a situação de qualquer campo.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.44.0",
    data: "2026-10-07",
    titulo: "Colunas da Centi, procurar, regras e colunas na Mesa",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Nós “Escolher colunas” (as colunas da Centi — a CM002 traz todas com a extensão 1.19.0), “Procurar nas linhas” (numa coluna ou em todas) e “Regra: se encontrar, grava” (X => Y, com o senão).", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Nó “Gravar na coluna da Mesa”: cria a coluna (ou usa a cadastrada) em Protocolos, DFDs ou Itens e grava o valor de cada registro.", link: "/painel/mesa" },
      { tipo: "novo", area: "Automação", texto: "Todo nó pode REPETIR quando falha (vezes + espera) e GUARDAR o estado numa variável; nós “Variável”, “Esperar” e “Parar o laço quando”.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "“DFDs do sistema” virou “Ler do sistema” nos modelos; novo modelo “Situação da CM002 numa coluna da Mesa”.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.43.0",
    data: "2026-10-07",
    titulo: "Nó “Ler do sistema” e laços em qualquer leitura",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Nó “Ler do sistema”: protocolos, DFDs ou itens — todos ou um recorte (DFDs de um protocolo, itens de um DFD, um produto) por nº, Id, planejamento ou código, inclusive pelo {{campo}} do item que chega.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Entrega tudo de uma vez ou UM POR VEZ (Próximo → Volta): guarda o estado, lê o próximo e, ao terminar, “Fim” leva executado = sim.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Modelo “DFDs de um protocolo × Centi (um por vez)”.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.42.0",
    data: "2026-10-07",
    titulo: "Nós padronizados e CM002 robusta",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "O nome de cada nó é a função dele (não se edita); abaixo, uma linha diz como está configurado.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "O painel do nó não corta mais as abas Configurar/Saída; todo componente aparece na paleta.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "Lista da CM002: entidade sem planejamentos vale como lista vazia, a Centi que recusa a página única é lida página a página e uma entidade com falha não derruba as outras (extensão 1.18.0).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.41.0",
    data: "2026-10-07",
    titulo: "Diagramas mais limpos",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Ligações que saem da mesma porta dobram no mesmo ponto — uma sobe, a outra desce, sem linha sobre linha.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Organizar alinha a entrada de cada nó com a saída de quem chega: as linhas saem retas, sem degrau, e os nós ficam próximos.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "O nó ligado à saída “erro” não vai mais para longe (a linha “infinita” para baixo); o diagrama afetado se reorganiza ao abrir.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "O botão (?) da barra do editor ficou no mesmo desenho dos demais botões.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.40.0",
    data: "2026-10-07",
    titulo: "(?) em cada componente do fluxo",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Cada componente (nó) tem o (?) com o que faz, o que recebe, o que entrega e o que se configura — no diagrama, na paleta, no painel do nó e nas etapas.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "O cartão “Em branco” do Novo fluxo também se arrasta até a lista e cria a automação manual ali.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.39.0",
    data: "2026-10-07",
    titulo: "Ajuda e configurações de cada automação",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "Cada automação tem o (?) com como funciona, como executa e a informação resultante — todas as automações prontas já vêm explicadas.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Botão de Configurações da automação: nome, descrição, frequência e o texto da ajuda.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Diagrama, Relatório, Salvar, Executar e Excluir viraram botões de ícone (o nome na dica).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.38.2",
    data: "2026-10-07",
    titulo: "Contorno do modelo escolhido inteiro",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "No painel “Novo fluxo”, o contorno do modelo escolhido (Em branco, por padrão) aparece inteiro — não é mais cortado nas bordas.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.38.1",
    data: "2026-10-07",
    titulo: "Arrastar cartões sem tremer",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "Reordenar os cartões das automações não pula nem fica oscilando — o lugar é medido sem a animação e a sombra segura a posição.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Tarefas", texto: "O mesmo ajuste no arrasto dos quadros e das pastas.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.38.0",
    data: "2026-10-07",
    titulo: "Automações em segundo plano",
    mudancas: [
      { tipo: "novo", area: "Automação", texto: "A automação continua rodando ao sair da tela: use o sistema normalmente — ela fica minimizada no canto inferior direito, com o andamento.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Tocar no painel minimizado expande: “Detalhes” volta à execução completa e “Parar” interrompe.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Executar outro fluxo com um rodando o põe na FILA — roda em seguida, sem bloquear a edição dos demais.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Chat", texto: "As bolhas do chat e os avisos flutuantes ficam acima do painel da automação — nada se sobrepõe.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.37.3",
    data: "2026-10-07",
    titulo: "Conferir DFDs × Centi: o resultado de cada DFD ao vivo",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A análise ao vivo mostra Convergente, Divergente (com o motivo), Não conferido ou Falhou em cada DFD — antes ficava só “Processado”.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "Cada DFD divergente aparece UMA vez, com todas as divergências juntas.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.37.2",
    data: "2026-10-07",
    titulo: "Conferir DFDs × Centi: falha refeita e fluxo atualizável",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "Conferir DFDs × Centi: o DFD que falha na comunicação com a Centi não é marcado nem dado como feito — a retomada tenta ele de novo.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "“Atualizar pelo modelo” no Novo fluxo: regrava o fluxo salvo (e os que ele usa) com o modelo de hoje, mantendo a frequência.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.37.1",
    data: "2026-10-07",
    titulo: "Automação: acabamento dos cartões e avisos",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "No painel “Novo fluxo”, os cartões dos modelos têm exatamente a largura dos da lista.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "A capa dos cartões segue a cor de destaque escolhida em Aparência (claro e escuro).", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "No editor do fluxo, as atenções voltaram a aparecer (selo âmbar com a lista na dica) ao lado dos problemas.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.37.0",
    data: "2026-10-07",
    titulo: "Automação: cartões no padrão de Tarefas",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Os cartões das automações usam o MESMO cartão dos quadros de Tarefas (capa, nome e 3 números: nós, última execução, erros) — sem foto, todos do mesmo tamanho; os modelos do “Novo fluxo” também.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "Arrastar e reordenar os cartões não embaralha mais a grade (a animação de reorganização mede as posições de layout).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.36.1",
    data: "2026-10-07",
    titulo: "Diagrama: arrastar sem conflito com o quadro",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "Arrastar o nó por qualquer ponto dele (não só o título) move o nó — antes, o corpo arrastava o quadro de fundo.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "Arrastar a linha por qualquer trecho a ajusta para os lados; tocar só marca (não grava ajuste).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.36.0",
    data: "2026-10-07",
    titulo: "Automação: cartões que enchem a tela e se arrastam",
    mudancas: [
      { tipo: "melhoria", area: "Automação", texto: "Os cartões enchem a largura em colunas iguais (sem sobra) e o painel “Novo fluxo” ocupa a última coluna — o cartão nunca muda de tamanho; ao abrir e fechar, os cartões deslizam suaves para o lugar novo.", link: "/painel/automacao" },
      { tipo: "novo", area: "Automação", texto: "Arraste os cartões para reordenar as automações (a ordem fica guardada) e arraste um modelo do painel até a lista para criar o fluxo ali — o mesmo arrasto de Tarefas.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "O “+” com o painel aberto o fecha.", link: "/painel/automacao" },
      { tipo: "correcao", area: "Automação", texto: "No diagrama, a linha chega exatamente no centro da bolinha da porta.", link: "/painel/automacao" },
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

/** As telas da ADMINISTRAÇÃO (só o ADM as abre — a mudança nelas só chega ao ADM). */
const PREFIXOS_ADMIN = [
  "/painel/configuracoes",
  "/painel/usuarios",
  "/painel/grupos",
  "/painel/orgaos",
  "/painel/integracoes",
  "/painel/automacao",
  "/painel/armazenamento",
  "/painel/auditoria",
  "/painel/aparencia",
  "/painel/design-system",
] as const;
const naRota = (link: string, prefixo: string) => link === prefixo || link.startsWith(`${prefixo}/`) || link.startsWith(`${prefixo}?`);

/** A TELA de uma mudança pelo link: a chave do módulo (Mesa, PCA…), "admin" (Administração) ou `null` = de todos (login,
 * perfil, tela pública…). */
export function telaDaMudanca(link: string | undefined): string | null {
  if (!link) return null;
  if (PREFIXOS_ADMIN.some((p) => naRota(link, p))) return "admin";
  return ABAS.find((a) => naRota(link, a.href))?.key ?? null;
}

/** A versão só com as mudanças das telas que a pessoa abre (`telas` = as dos grupos dela; `admin` = todas). */
export function mudancasVisiveis(v: Versao, telas: ReadonlySet<string>, admin: boolean): Versao {
  if (admin) return v;
  return { ...v, mudancas: v.mudancas.filter((m) => {
    const t = telaDaMudanca(m.link);
    return t == null || (t !== "admin" && telas.has(t));
  }) };
}

/** O aviso no sino: UM por versão (a `chave`), com o que mudou NAS TELAS QUE A PESSOA ABRE (`mudancasVisiveis`) — sem
 * nenhuma mudança para ela, nenhum aviso (`null`). Sem link: o sino abre as Novidades daquela versão num banner flutuante
 * (de lá, cada mudança leva ao lugar dela). */
export function avisoNovaVersao(usuarioId: number, v: Versao = VERSOES[0]) {
  if (v.mudancas.length === 0) return null;
  return {
    usuarioId,
    tipo: "versao" as const,
    titulo: `Nova versão ${v.versao} — ${v.titulo}`,
    texto: textoMudancas(v),
    link: null,
    chave: `versao-sistema:${v.versao}`,
  };
}

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
