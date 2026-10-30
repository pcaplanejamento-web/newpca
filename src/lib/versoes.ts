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
    versao: "1.264.14",
    data: "2026-10-30",
    titulo: "Acabamento da padronização",
    mudancas: [
      { tipo: "melhoria", area: "Indicadores", texto: "Os cartões de indicadores do PCA, do Orçamento do PCA e do Armazenamento seguem a MESMA grade das demais telas.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Interface", texto: "Botões e campos de uma mesma barra com a mesma altura (Catálogo, Avaliação, chat e checklist); a câmera da foto do Perfil com área de toque maior.", link: "/painel/catalogo" },
      { tipo: "correcao", area: "Perfil", texto: "O resultado de trocar ou remover a foto aparece no aviso flutuante — à vista em qualquer aba e no celular.", link: "/painel/perfil" },
      { tipo: "correcao", area: "Configurações", texto: "Integrações: o Salvar só fica ativo quando algo mudou. Trocar de aba nas Configurações não leva mais a subaba anterior para a próxima.", link: "/painel/integracoes" },
      { tipo: "melhoria", area: "Configurações", texto: "Avaliação → Protocolação: a explicação foi para a Ajuda (?); o Termo de uso avisa quando não carrega as pessoas, papéis e grupos.", link: "/painel/configuracoes?aba=avaliacao" },
    ],
  },
  {
    versao: "1.264.13",
    data: "2026-10-30",
    titulo: "Importações: a importação manual também ensina a automática a pular o que não mudou",
    mudancas: [
      { tipo: "melhoria", area: "Importações", texto: "A importação feita pela tela agora guarda a assinatura de cada página lida: a atualização automática reconhece depois as páginas iguais a ela e as pula sem reler.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "Quando uma resposta grande é processada em pedaços menores (depois de uma execução cortada), só o pedaço menor é lido do banco — antes o pedaço inteiro era carregado e só depois cortado.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.264.12",
    data: "2026-10-29",
    titulo: "Menu suave, direita fixa e engrenagem à direita",
    mudancas: [
      { tipo: "melhoria", area: "Interface", texto: "Ao abrir e fechar o menu lateral, o conteúdo estica junto com ele, suave; os cartões (PCA, Orçamento, Catálogo, Tarefas…) que mudam de coluna deslizam até o lugar novo.", link: "/painel/pca" },
      { tipo: "correcao", area: "Interface", texto: "A barra de rolagem da página tem o lugar reservado: ela aparecer nunca mais empurra a tela para a esquerda, e a margem direita fica igual à esquerda.", link: "/painel" },
      { tipo: "melhoria", area: "Interface", texto: "A engrenagem das configurações fica sempre no fim da linha, à direita; no PCA, o ano e o status também ficam à direita.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Navegação", texto: "No caminho do cabeçalho, o nome da página atual fica em destaque.", link: "/painel" },
    ],
  },
  {
    versao: "1.264.11",
    data: "2026-10-29",
    titulo: "Menu e Mais indicadores sem mexer na tela",
    mudancas: [
      { tipo: "correcao", area: "Interface", texto: "Abrir e fechar o menu lateral não move mais o conteúdo: a borda direita fica parada e o menu desliza por cima.", link: "/painel" },
      { tipo: "melhoria", area: "Indicadores", texto: "“Mais indicadores” abre num painel por cima da tela — a barra e a tabela de baixo ficam no lugar; fecha ao tocar fora ou no Esc.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.264.10",
    data: "2026-10-29",
    titulo: "Componentes na escala certa em toda tela",
    mudancas: [
      { tipo: "melhoria", area: "Interface", texto: "Botões, campos, listas e janelas com a mesma altura e o mesmo toque em todos os tamanhos de tela (celular, tablet e desktop); o botão Voltar padrão também no editor das automações, nos cards de Importações e nos quadros de Tarefas.", link: "/painel/tarefas" },
      { tipo: "correcao", area: "Interface", texto: "Janelas e listas flutuantes respeitam a altura visível do celular (barra do navegador e teclado).", link: "/painel" },
    ],
  },
  {
    versao: "1.264.9",
    data: "2026-10-29",
    titulo: "Telas internas sem título, com o voltar à esquerda",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Dentro de um PCA a primeira linha é o voltar à esquerda, as abas e as ferramentas — sem o nome, o ano e os selos (o nome está no caminho do cabeçalho).", link: "/painel/pca" },
      { tipo: "melhoria", area: "Orçamento", texto: "Dentro de um orçamento: o voltar e as abas primeiro, os números em indicadores logo abaixo; excluir fica no fim da linha.", link: "/painel/orcamento" },
      { tipo: "melhoria", area: "Tarefas", texto: "No quadro, o nome saiu do topo (está no caminho do cabeçalho) — renomear o quadro agora é na Configuração.", link: "/painel/tarefas" },
      { tipo: "melhoria", area: "Catálogo", texto: "Na pasta: o voltar e as visões primeiro, os números da pasta em indicadores abaixo.", link: "/painel/catalogo" },
      { tipo: "melhoria", area: "Órgãos", texto: "Nas unidades de um órgão, o voltar à esquerda das abas, sem o título.", link: "/painel/orgaos" },
      { tipo: "melhoria", area: "Importações", texto: "No card aberto: o voltar, as seções e as ferramentas numa linha, a situação e excluir à direita, os números em indicadores abaixo.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.264.8",
    data: "2026-10-29",
    titulo: "A lateral direita sem recuo e as telas do ADM arrumadas",
    mudancas: [
      { tipo: "correcao", area: "Telas", texto: "A lateral direita das telas não fica mais recuada: o espaço reservado para a barra de rolagem ficava vazio quando a tela não rolava.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Armazenamento", texto: "Os indicadores abrem a tela, o carregamento tem o mesmo formato e a confirmação é a do sistema.", link: "/painel/armazenamento" },
      { tipo: "melhoria", area: "Auditoria", texto: "Os filtros (entidade e ação) à esquerda e o recarregar à direita, numa linha só.", link: "/painel/auditoria" },
      { tipo: "correcao", area: "PCA", texto: "Excluir uma planilha ou o PCA trata a falha de rede, não manda dois pedidos e diz o resultado; a Configuração explica que devolver o protocolo à Mesa só inativa os números.", link: "/painel/pca" },
      { tipo: "correcao", area: "Situações", texto: "A confirmação de excluir é a do sistema.", link: "/painel/configuracoes?aba=situacoes" },
    ],
  },
  {
    versao: "1.264.7",
    data: "2026-10-29",
    titulo: "Correções do PCA, um só esqueleto e o menu que não mexe na altura",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "A edição antiga do PCA confere o grupo; o grupo é conferido antes de abrir um protocolo pelo link; só quem configura o PCA troca a visão do orçamento (vale para todos).", link: "/painel/pca" },
      { tipo: "correcao", area: "PCA", texto: "Os itens da Mesa do PCA ficam na tela enquanto os novos chegam (não somem depois de gravar) e a falha ao carregá-los aparece; o nome do PCA não some mais do caminho no topo ao trocar de aba.", link: "/painel/pca" },
      { tipo: "correcao", area: "PCA", texto: "Declarações: baixar de novo mostra o erro sem trocar a página e cancelar a exportação não fecha o PDF; Nova declaração à esquerda da ajuda. O Dashboard vazio por causa da unidade do cabeçalho diz isso.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Telas", texto: "Um só esqueleto em cada tela: o carregamento da rota e o da própria tela são o mesmo (Frotas, Execução, Empenhos, Liquidações, Pagamentos), e os espaços (PCA, orçamento, quadro, pasta) têm o esqueleto deles.", link: "/painel/frotas" },
      { tipo: "correcao", area: "Telas", texto: "Abrir e fechar o menu lateral não faz mais as tabelas tremerem nem os indicadores mudarem de altura — só a largura muda.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Aparência", texto: "Uma prévia não salva não fica mais valendo nas outras telas; salvar e restaurar atualizam o sistema na hora e a confirmação é a do sistema.", link: "/painel/aparencia" },
      { tipo: "correcao", area: "Órgãos", texto: "Rebaixar um órgão só aceita um destino válido e o destino não passa de um órgão para outro.", link: "/painel/orgaos" },
    ],
  },
  {
    versao: "1.264.6",
    data: "2026-10-29",
    titulo: "Mesa, Catálogo e Verificação com os filtros à esquerda",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Os filtros de Responsável e Assunto ficam à esquerda, junto das visões; atualizar, dados completos, lixeira e automações à direita.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Catálogo", texto: "O Catálogo abre sem título: as visões à esquerda e Exportar modelo à direita; na pasta, os números vêm primeiro.", link: "/painel/catalogo" },
      { tipo: "melhoria", area: "Verificação", texto: "Protocolo | DFD à esquerda e a ajuda à direita; na Automação, a ajuda vai para a direita.", link: "/painel/verificacao" },
      { tipo: "correcao", area: "Liquidações", texto: "Liquidações e pagamentos mostram o esqueleto dos indicadores enquanto carregam (a barra não pula mais); as tabelas da execução ficaram sem o código morto dos cards.", link: "/painel/liquidacoes" },
      { tipo: "correcao", area: "Tarefas", texto: "A linha vazia acima dos quadros não ocupa mais espaço quando não há o botão Nova pasta.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.264.5",
    data: "2026-10-29",
    titulo: "O carregamento desenha a tela como ela é",
    mudancas: [
      { tipo: "correcao", area: "Telas", texto: "Enquanto as telas carregam, o esqueleto não mostra mais uma linha de título que a tela não tem: empenhos, liquidações, pagamentos e as telas das frotas começam pelos indicadores; as demais pela barra de botões ou direto no conteúdo.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.264.4",
    data: "2026-10-29",
    titulo: "Barras de botões no mesmo padrão em todas as telas",
    mudancas: [
      { tipo: "melhoria", area: "Telas", texto: "Em toda barra de ferramentas, os seletores, a busca e os filtros ficam à esquerda; recarregar, configurações e ajuda à direita.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.264.3",
    data: "2026-10-29",
    titulo: "O ano à esquerda na barra das tabelas da execução",
    mudancas: [{ tipo: "melhoria", area: "Empenhos", texto: "Em empenhos, liquidações e pagamentos, o seletor de ano fica à esquerda da barra; Recarregar, Importações e Ajuda à direita.", link: "/painel/empenhos" }],
  },
  {
    versao: "1.264.2",
    data: "2026-10-29",
    titulo: "Telas sem título e o horário dos dados à vista",
    mudancas: [
      { tipo: "melhoria", area: "Telas", texto: "PCA, Orçamento, Tarefas, Documentos, Verificação, Automação, Configurações, Auditoria, Armazenamento, Integrações, Avaliação e Referência abrem direto no conteúdo, sem título nem subtítulo (os botões continuam no mesmo lugar).", link: "/painel/pca" },
      { tipo: "melhoria", area: "Empenhos", texto: "Ao lado do Recarregar de empenhos, liquidações e pagamentos, o horário dos dados à vista (\"Dados de 10:42\") — quando vêm do que foi guardado no navegador.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.264.1",
    data: "2026-10-29",
    titulo: "Empenhos, liquidações e pagamentos com os indicadores das Frotas",
    mudancas: [
      { tipo: "melhoria", area: "Empenhos", texto: "As telas de empenhos, liquidações e pagamentos abrem pelos indicadores (os mesmos cartões das Frotas, com dois detalhes cada), sem título; os botões ficam logo abaixo.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Liquidações", texto: "Indicadores: liquidado líquido, pago, saldo e liquidações, com os percentuais.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Pagamentos", texto: "Indicadores: pago líquido, ordens, retenções e anuladas.", link: "/painel/pagamentos" },
    ],
  },
  {
    versao: "1.264.0",
    data: "2026-10-29",
    titulo: "Importações auditadas: só relê o que mudou, sem travas e sem perder leituras",
    mudancas: [
      { tipo: "melhoria", area: "Importações", texto: "A atualização automática agora reconhece a página que não mudou em QUALQUER tamanho (antes, só as pequenas): os meses e órgãos iguais à última leitura são pulados sem baixar em pedaços nem regravar — o ano inteiro deixa de ser reprocessado a cada ciclo.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Importações", texto: "As liquidações passam a ser lidas mês a mês por órgão na atualização automática (antes, semana a semana): quatro vezes menos pedidos à Centi.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "O revezamento entre os cards ficou justo, cada rodada respeita o tempo do disparo seguinte e um card com erro não para mais a fila dos outros.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "Uma resposta pesada para o servidor não encerra mais a importação de pagamentos na primeira vez: a leitura recomeça mais tarde (só a terceira vez divide o período) e os erros antigos não contam depois que a leitura avançou.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "A conclusão confere todos os passos (antes, só os 3.000 primeiros) e descarta os registros de leituras interrompidas; excluir um passo faz o período ser lido de novo de verdade.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "Continuar pela tela um período já dividido pela automática não falha mais; a comparação de queda das liquidações e dos pagamentos usa só importações dos mesmos órgãos.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "A pergunta \"os números caíram\" nunca mais é respondida sozinha quando a tela do card fecha (passa ao painel do canto); Parar durante a pergunta interrompe a série; Parar corta na hora os downloads em curso; a aba renova a posse do lote a cada minuto.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "O andamento não volta para trás entre as páginas, o painel não relê mais o lote inteiro a cada 3 segundos (economia no banco) e a situação \"parada\" só aparece para trabalho de verdade.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Frotas", texto: "Um dia muito movimentado não trava mais o contrato (lido com um teto maior; se nem assim couber, é pulado com o aviso), o ciclo novo começa onde o anterior parou, a importação manual e a automática nunca leem o mesmo contrato juntas e o \"Testar\" não desfaz uma configuração salva no meio.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
    ],
  },
  {
    versao: "1.263.0",
    data: "2026-10-29",
    titulo: "Importações automáticas várias vezes mais rápidas",
    mudancas: [
      { tipo: "melhoria", area: "Importações", texto: "A atualização automática da Centi faz várias tarefas por minuto em vez de uma: Empenhos, Liquidações e Pagamentos avançam juntos e uma resposta grande termina em minutos, não em horas.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Frotas", texto: "A atualização automática da Vólus lê vários períodos por disparo.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "novo", area: "Importações", texto: "A situação da atualização automática diz quantas tarefas a última rodada fez.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.262.1",
    data: "2026-10-29",
    titulo: "Banners do DFD e do protocolo reabrem na hora",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Reabrir um DFD ou um protocolo já visto usa os dados guardados no navegador, sem esperar o servidor; qualquer gravação, sua ou de outra pessoa, renova os dados, e Atualizar sempre busca do banco.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.262.0",
    data: "2026-10-29",
    titulo: "Importações automáticas que não ficam presas e o motivo de cada uma à vista",
    mudancas: [
      { tipo: "correcao", area: "Importações", texto: "Um trecho pesado demais para o servidor não prende mais a importação da Centi para sempre: a cada execução que não avança, o pedaço lido encolhe; sem avançar seis vezes, o período é dividido (ou o erro aparece).", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "Uma resposta grande da Centi que levava mais de 3 horas para ler não recomeça mais do zero.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Frotas", texto: "A leitura da Vólus interrompida no meio não repete o mesmo período para sempre: a falha é contada e o período encolhe até um dia.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "novo", area: "Importações", texto: "Configurações → Importações mostra a última execução da atualização automática e, por importação, o que ela está fazendo e desde quando (erro em vermelho; parada há mais de 30 min em âmbar).", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.261.3",
    data: "2026-10-29",
    titulo: "Capa do protocolo protegida contra gravação sobre dado antigo",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Salvar a capa de um protocolo alterado por outra pessoa depois de aberto agora é recusado com o aviso, em vez de sobrescrever.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.261.2",
    data: "2026-10-29",
    titulo: "Arrasto do painel colado ao dedo, pílula compacta e bolha fixa",
    mudancas: [
      { tipo: "correcao", area: "Importações", texto: "Arrastar o painel “Em segundo plano” acompanha o ponteiro ou o dedo sem atraso (antes ficava para trás num movimento rápido); pegá-lo enquanto ainda desliza para a borda não dá salto; soltar no toque não abre o banner sem querer.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Importações", texto: "A pílula ficou menor e resumida: o nome curto e só a porcentagem (o resto está no banner); os outros trabalhos aparecem num selo no canto.", link: "/painel/execucao" },
      { tipo: "novo", area: "Importações", texto: "“Manter como bolha” (no cabeçalho do banner): o painel fica circular também fechado, com o andamento no anel — guardado neste aparelho.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Navegação", texto: "Recarregar as telas de Empenhos, Liquidações, Pagamentos e Frotas não dá mais o aviso de “a página foi refeita” (os dados guardados só desenham na hora ao voltar pela navegação).", link: "/painel/combustivel" },
    ],
  },
  {
    versao: "1.261.1",
    data: "2026-10-29",
    titulo: "Salvar sobre alteração de outra pessoa é avisado e as abas dividem a conferência de dados novos",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Salvar um DFD que outra pessoa alterou depois que você o abriu não sobrescreve mais a alteração dela: o sistema avisa e recarrega o DFD para você refazer a sua.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Navegação", texto: "Com várias abas abertas, só uma consulta se há dados novos e avisa as outras — menos pedidos ao servidor.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Tarefas", texto: "Checklist e eventos da tarefa e a planilha de Responsáveis mostram o esqueleto enquanto carregam, no lugar do texto “Carregando…”.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.261.0",
    data: "2026-10-29",
    titulo: "Importações sem travas e o painel “Em segundo plano” manuseável como as bolhas do chat",
    mudancas: [
      { tipo: "novo", area: "Importações", texto: "O painel “Em segundo plano” é manuseado como as bolhas do chat: arraste para qualquer lugar (com o mouse ou o dedo), arremesse e ele encosta na borda mais perto; leve-o à lixeira para dispensar os que terminaram; Alt + setas movem pelo teclado; a posição fica guardada neste aparelho. As bolhas do chat desviam dele.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Importações", texto: "Tocar no painel fechado abre o banner POR CIMA dele e a pílula encolhe numa BOLHA (com o andamento num anel); tocar de novo fecha suavemente e a bolha volta a ser pílula.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Navegação", texto: "Abrir e fechar “Mais indicadores” (e outros blocos que crescem) não faz mais o conteúdo dar um pulo para a direita e voltar: o lugar da barra de rolagem fica reservado no computador.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Importações", texto: "Atualização automática da Centi: depois de ler um dia pesado ela segue direto para o dia seguinte (antes pedia de novo a semana e a dividia outra vez), a fila alterna entre os cards (uma leitura longa não deixa os outros sem a vez) e uma leitura que falha sem parar é descartada e pedida de novo.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Importações", texto: "O andamento da importação automática anda pelos bytes (um dia de 5 MB conta o que pesa — antes ficava em 0%), mostra os registros que estão sendo gravados, o baixado de verdade e a última atividade; o passo “Gravando no banco…” que falhou vira erro em vez de girar para sempre.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Frotas", texto: "Quando a Vólus não responde a tempo, o período seguinte é a metade (antes repetia os mesmos 24 dias para sempre); o tempo vale até ler a resposta inteira, a importação manual divide o período lento e espera a automática terminar o mesmo contrato.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "correcao", area: "Frotas", texto: "No painel das importações, o passo com erro mostra o contrato e o tipo, “Falhou” só aparece com um contrato em espera depois de um erro (com o nome dele) e não há mais “100%” ao lado de “Falhou”.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "melhoria", area: "Navegação", texto: "No celular, o cabeçalho fica só com o essencial (menu, PCA, conversas, avisos e claro/escuro): a logo e a foto do perfil ficam no menu e a página pública na marca do menu.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.260.4",
    data: "2026-10-29",
    titulo: "Esqueleto padrão em Empenhos, Liquidações, Pagamentos e Frotas",
    mudancas: [
      { tipo: "melhoria", area: "Carregamento", texto: "Empenhos, Liquidações, Pagamentos, Frotas, Combustível, Manutenção e Veículos mostram o esqueleto padrão da tela enquanto abrem.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.260.3",
    data: "2026-10-29",
    titulo: "Telas da Administração guardadas no navegador",
    mudancas: [
      { tipo: "melhoria", area: "Administração", texto: "Grupos, Órgãos, Unidades, Responsáveis, Situações e Cargos reabrem na hora enquanto nada novo foi gravado; gravar qualquer coisa renova na hora.", link: "/painel/orgaos" },
      { tipo: "correcao", area: "Histórico", texto: "Depois de gravar, o histórico guardado é renovado na hora (antes podia esperar até um minuto).", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.260.2",
    data: "2026-10-29",
    titulo: "Itens da Mesa e histórico guardados no navegador",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "A visão Itens da Mesa (e da Mesa do PCA) fica guardada no navegador: voltar, F5 ou reabrir mostram os itens na hora; muda sozinha quando algum DFD é gravado.", link: "/painel/mesa?vista=itens" },
      { tipo: "melhoria", area: "Histórico", texto: "O histórico dos protocolos, DFDs e itens reabre na hora enquanto nada novo foi gravado.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.260.1",
    data: "2026-10-29",
    titulo: "Dados guardados: sem esqueleto ao voltar, Frotas e mais segurança",
    mudancas: [
      { tipo: "melhoria", area: "Desempenho", texto: "Voltar a Empenhos, Liquidações, Pagamentos e Execução desenha os dados guardados na hora, sem o esqueleto; as outras abas abertas aproveitam o dado já buscado.", link: "/painel/execucao" },
      { tipo: "novo", area: "Frotas", texto: "Frotas, Combustível, Manutenção e Veículos também ficam guardados no navegador.", link: "/painel/frotas" },
      { tipo: "melhoria", area: "Segurança", texto: "Sessão encerrada ou a tela de acesso apagam os dados guardados; papéis com proteção de dados guardam só enquanto a aba está aberta.", link: "/painel/configuracoes?aba=protecao" },
      { tipo: "novo", area: "Termo de uso", texto: "Cláusula automática \"Dados guardados no navegador\".", link: "/painel/configuracoes?aba=termo" },
      { tipo: "novo", area: "Armazenamento", texto: "\"Dados neste navegador\": quantas leituras vieram sem pedir ao servidor.", link: "/painel/armazenamento" },
    ],
  },
  {
    versao: "1.260.0",
    data: "2026-10-29",
    titulo: "Frotas: tabelas da Mesa, Órgão e Unidade do sistema e banners organizados",
    mudancas: [
      { tipo: "novo", area: "Frotas", texto: "As tabelas de combustível, manutenção, veículos, do demonstrativo e dos alertas funcionam como as da Mesa: escolher e reordenar colunas, edições salvas (só sua ou pública), filtros salvos e o botão \"Dados completos\" para ver o texto inteiro nas células.", link: "/painel/combustivel" },
      { tipo: "novo", area: "Frotas", texto: "Colunas e filtros de Órgão e Unidade do sistema (a unidade da Vólus ligada ao cadastro; o órgão da unidade, senão o do contrato). O registro sem ligação aparece como \"Sem unidade\"/\"Sem órgão\" e pode ser filtrado; o novo indicador \"Sem unidade\" diz quantos são.", link: "/painel/manutencao" },
      { tipo: "melhoria", area: "Frotas", texto: "O gasto no tempo usa o MESMO gráfico da Execução, com as mesmas funções: acumulado ou por período, agrupado por dia, semana ou mês, a legenda que liga e desliga, o zoom, a tabela, a dica e a origem do ponto ou do trecho. Os gráficos por veículo e por dimensão ficam lado a lado com a mesma altura e rolagem por dentro; Demonstrativo e Alertas em abas.", link: "/painel/frotas" },
      { tipo: "novo", area: "Frotas", texto: "As cores de Combustível e Manutenção são escolhidas em Configurações → Importações → Frotas (\"Cores dos dados\") e valem nos gráficos, nas barras e nos indicadores.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "melhoria", area: "Frotas", texto: "No computador, as telas de Frotas rolam por dentro, até o fim do display — a página não rola.", link: "/painel/frotas" },
      { tipo: "melhoria", area: "Frotas", texto: "Os banners do abastecimento, da manutenção e da ficha do veículo seguem o padrão dos banners da Execução: título curto, campos em colunas que nunca partem uma palavra e o Órgão e a Unidade do registro.", link: "/painel/combustivel" },
      { tipo: "melhoria", area: "Frotas", texto: "Os indicadores de \"Mais indicadores\" têm o mesmo desenho dos principais (com os detalhes) e a tabela acompanha a abertura e o fechamento deles, sempre rente ao fim da tela.", link: "/painel/veiculos" },
    ],
  },
  {
    versao: "1.259.0",
    data: "2026-10-29",
    titulo: "Dados guardados no navegador, cada um com a sua atualização",
    mudancas: [
      { tipo: "novo", area: "Desempenho", texto: "Empenhos, Liquidações, Pagamentos e Execução ficam guardados no navegador: voltar à tela, apertar F5 ou reabrir o navegador mostra os dados na hora.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Cada dado se atualiza sozinho: importar pagamentos renova só Pagamentos e Execução; importar empenhos renova Empenhos, Liquidações, Pagamentos e Execução.", link: "/painel/pagamentos" },
      { tipo: "melhoria", area: "Empenhos", texto: "Trocar o ano não apaga mais a tabela enquanto o novo ano chega.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Configurações", texto: "Configurações → Tabelas: o ADM pode desligar a guarda dos dados no navegador. Sair ou trocar de conta apaga o que estava guardado.", link: "/painel/configuracoes?aba=tabelas" },
    ],
  },
  {
    versao: "1.258.1",
    data: "2026-10-29",
    titulo: "Frotas: importação da Vólus mais rápida e mais segura",
    mudancas: [
      { tipo: "melhoria", area: "Importações", texto: "A importação da Vólus lê até 3 períodos ao mesmo tempo e, aprendido o tamanho de um contrato, já pede os meses seguintes em partes que cabem — um ano de abastecimentos sai com cerca de metade dos pedidos e várias vezes mais rápido.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "correcao", area: "Importações", texto: "O período grande demais da Vólus é medido inteiro e dividido de uma vez no tamanho certo (antes era dividido ao meio repetidas vezes, com pedidos jogados fora).", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "correcao", area: "Frotas", texto: "Duas leituras quase juntas do mesmo período (a manual e a automática, ou a nova tentativa de um pedido) não dão mais uma transação como removida na Vólus: a 2ª ausência só conta 10 minutos depois da 1ª.", link: "/painel/combustivel" },
      { tipo: "correcao", area: "Importações", texto: "A atualização automática da Frota não relê um período nem recomeça o ciclo por cima de outra execução, a trava cobre a leitura inteira, a autenticação da Vólus é compartilhada pelos pedidos em paralelo e a contagem das removidas não lê mais a tabela inteira.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
    ],
  },
  {
    versao: "1.258.0",
    data: "2026-10-29",
    titulo: "Frotas: a importação da Vólus igual à das outras importações",
    mudancas: [
      { tipo: "melhoria", area: "Importações", texto: "A importação da Vólus mostra o andamento de cada período (lido, dividido, nova tentativa, erro) no mesmo quadro das outras importações e continua ao sair da tela.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "melhoria", area: "Importações", texto: "O painel do canto inferior direito mostra também a Frota: a importação desta aba e a atualização automática da Vólus.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "melhoria", area: "Frotas", texto: "Os indicadores mostram há quanto tempo a Vólus foi lida e, para o administrador, o botão \"Importar agora\" — o mesmo canto da Execução.", link: "/painel/frotas" },
    ],
  },
  {
    versao: "1.257.0",
    data: "2026-10-29",
    titulo: "Frotas: combustível, manutenção e veículos com os dados da Vólus",
    mudancas: [
      { tipo: "novo", area: "Frotas", texto: "Módulo Frotas com o painel da frota: gasto total, combustível, manutenção, consumo médio (km/l pelo hodômetro), custo por km, gasto por mês e por veículo, demonstrativo por qualquer dimensão e os alertas (hodômetro que voltou, consumo e preço fora do padrão, abastecimentos próximos, litros acima do tanque, veículo inativo com gasto).", link: "/painel/frotas" },
      { tipo: "novo", area: "Frotas", texto: "Telas Combustível e Manutenção: todos os abastecimentos e manutenções com os filtros do sistema, o total no rodapé, a exportação e o registro completo (veículo, posto ou oficina, itens, nota e empenho).", link: "/painel/combustivel" },
      { tipo: "novo", area: "Frotas", texto: "Tela Veículos: o cadastro da frota (as placas entram sozinhas pela Vólus) com tipo, classificação, situação, origem (FIPE ou locação), tanque e unidade — edição, edição em massa, planilha e a ficha do veículo em PDF.", link: "/painel/veiculos" },
      { tipo: "novo", area: "Importações", texto: "Integração com a Vólus em Configurações → Importações → Frotas: a credencial cifrada, testar a conexão, importar um ano, os contratos, as unidades ligadas ao cadastro, o histórico das leituras e a atualização automática que grava só o que mudou.", link: "/painel/configuracoes?aba=importacoes&tipo=frotas" },
      { tipo: "novo", area: "Pesquisa", texto: "A pesquisa acha os veículos da frota pela placa, marca ou modelo (prefixo \"veiculo:\") e abre a ficha.", link: "/painel/veiculos" },
      { tipo: "melhoria", area: "Frotas", texto: "Os indicadores mostram os quatro principais com dois detalhes cada (os mesmos cartões do Dashboard do PCA) e os demais em \"Mais indicadores\"; os filtros ficam com nomes curtos, em ordem, e conectados entre si — o valor marcado que outro filtro zerou continua na lista para ser desmarcado.", link: "/painel/frotas" },
      { tipo: "melhoria", area: "Tabelas", texto: "No rodapé de todas as tabelas, exportar, ações, linhas por página e paginação ficam numa linha só; o que não cabe na tela rola de lado.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.256.1",
    data: "2026-10-29",
    titulo: "Empenhos, liquidações e pagamentos sem recarregar",
    mudancas: [
      { tipo: "melhoria", area: "Execução", texto: "Ao voltar às telas de Empenhos, Liquidações e Pagamentos, a tabela aparece na hora — os dados já lidos ficam guardados na aba até uma importação nova.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.256.0",
    data: "2026-10-29",
    titulo: "Telas mais rápidas: cache que não se apaga à toa e telas pré-carregadas",
    mudancas: [
      { tipo: "melhoria", area: "Desempenho", texto: "Cada tela acompanha só os dados que mostra: a importação automática dos empenhos e as gravações de Tarefas não recarregam mais a Mesa, o PCA nem o Orçamento — sair e voltar a uma tela já vista abre na hora.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Desempenho", texto: "Tarefas, Calendário, Empenhos, Liquidações, Pagamentos e Execução só recarregam quando os dados deles mudam.", link: "/painel/execucao" },
      { tipo: "novo", area: "Desempenho", texto: "Com a tela pronta, o sistema pré-carrega em segundo plano as primeiras telas do menu, uma por vez: ir a elas abre sem esperar.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.255.0",
    data: "2026-10-28",
    titulo: "Pesquisa por texto em empenhos, liquidações e pagamentos; pastas e usuários arquivados",
    mudancas: [
      { tipo: "novo", area: "Pesquisa", texto: "Sem prefixo, a pesquisa do menu passa a achar empenhos, liquidações e pagamentos pelo fornecedor ou credor, CPF/CNPJ e números — os mais recentes, de um índice leve guardado na aba por algumas horas. O número exato continua achando todos os anos.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Pesquisa", texto: "As pastas de quadros de Tarefas são pesquisáveis (prefixo \"pasta:\") e o resultado abre a pasta no lugar.", link: "/painel/tarefas" },
      { tipo: "melhoria", area: "Pesquisa", texto: "Os usuários arquivados aparecem marcados com a data do arquivamento e há a entrada \"Usuários arquivados\", que abre a lista deles.", link: "/painel/usuarios" },
      { tipo: "correcao", area: "Pesquisa", texto: "Um quadro de Tarefas criado ou renomeado aparece nas abas da pesquisa sem precisar recarregar a página.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.254.0",
    data: "2026-10-28",
    titulo: "Pesquisa completa: declarações, visões, medidas, responsáveis, importações e todas as sub-abas",
    mudancas: [
      { tipo: "novo", area: "Pesquisa", texto: "A pesquisa do menu passa a achar as declarações do PCA (nº, processo, protocolo da Centi), as visões do orçamento, as medidas e classificações do Catálogo, os catálogos e as pastas pelo nome e, para o ADM, os responsáveis por DFDs e os cards de importação. Tocar abre o registro.", link: "/painel/catalogo" },
      { tipo: "melhoria", area: "Pesquisa", texto: "Também são pesquisáveis as visões do Catálogo (Lista de Itens, Medidas, Classificações), da Verificação (protocolo ou DFD), as vistas do Calendário e as sub-abas de Notificações e Avaliação em Configurações. As abas de cada PCA aparecem só quando a pessoa pode abri-las, e as abas que o papel esconde também não aparecem.", link: "/painel/verificacao" },
      { tipo: "correcao", area: "Pesquisa", texto: "Os filtros rápidos da pesquisa passam a incluir Empenhos, Liquidações, Pagamentos e os tipos novos, e a pesquisa sem prefixo é dividida em pedidos menores (não passa do limite do servidor).", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.253.0",
    data: "2026-10-28",
    titulo: "Pesquisa: empenhos, liquidações, pagamentos e todas as abas",
    mudancas: [
      { tipo: "novo", area: "Pesquisa", texto: "A pesquisa do menu acha empenhos, liquidações e pagamentos pelo número do empenho. Com o prefixo (“empenho:”, “liquidacao:”, “pagamento:” ou “em:”, “li:”, “pg:”) procura também no fornecedor/credor, CPF/CNPJ e histórico. Tocar no resultado abre o registro na tabela da tela, no escopo de unidades de cada pessoa.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Pesquisa", texto: "Todas as abas são pesquisáveis: as de cada orçamento (Lançamentos, Comparativo, Vínculos, Visões), as de cada quadro de Tarefas, a Importação e as Declarações de cada PCA, o Verificar comprovante e as Importações de empenhos, liquidações e pagamentos em Configurações.", link: "/painel/orcamento" },
    ],
  },
  {
    versao: "1.252.1",
    data: "2026-10-28",
    titulo: "Execução: relógio e botão de importar no canto do indicador",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "O relógio da última atualização e o botão de importar ficam mais perto do topo de cada indicador, com o mesmo recuo do topo e da lateral direita.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.252.0",
    data: "2026-10-28",
    titulo: "Importações: intervalo mínimo entre atualizações, a última importação pelo relógio e correções",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Intervalo mínimo entre atualizações (Configurações → Importações → Editar): depois de uma importação concluída, o mesmo card só começa outra quando passar o tempo escolhido. Vale para a importação do card, o “Importar tudo”, o “Importar agora” da Execução e a atualização automática. Continuar uma importação aberta e importar de novo depois de uma falha seguem livres. O botão bloqueado diz a partir de que horas pode atualizar.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "novo", area: "Execução", texto: "Para o ADM, tocar no relógio da última atualização num indicador abre no painel do canto inferior direito a última importação da etapa, com todos os dados: pedidos, erros, registros e últimos passos.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "O relógio e o botão de importar ficam alinhados na linha do título, presos no canto superior direito de cada indicador.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "Uma importação parada há mais de 30 minutos (a aba foi fechada ou recarregada) não fica mais como “importando agora” para sempre. Ela é encerrada sozinha em até 1 minuto e não trava o botão de importar nem o painel do canto. Na atualização automática, ela é refeita na próxima vez do card, sem a espera de 12 horas.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "O “Parar” do painel do canto interrompe a série inteira do “Importar agora” e do “Importar tudo”, não só o card em curso. Se os números caírem no “Importar agora”, a confirmação aparece no próprio painel e continua valendo mesmo depois de sair da tela.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.251.0",
    data: "2026-10-28",
    titulo: "Declarações mais completas e profissionais; a assinatura no lugar do carimbo",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "A declaração passa a exigir o protocolo da Centi a que ela será vinculada (ex.: 156844/2026). Ele aparece no texto, na identificação e no registro de autenticidade do PDF, na lista de declarações e na verificação pública.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "O PDF da declaração ficou sóbrio, em preto e cinza, com títulos de coluna curtos e sem abreviações. Está organizado em seções: Identificação; Itens declarados (código, descrição, medida, DFD e item, planejamento, protocolo e unidade); Quantidades (no PCA, já declarada, declarada e saldo); e Valores (unitário, no PCA, declarado e saldo, com o total).", link: "/painel/pca" },
      { tipo: "melhoria", area: "Sistema", texto: "As tabelas dos documentos em PDF ganharam grade completa (moldura e divisórias entre as colunas), com todas as linhas na mesma espessura e cor, sem nenhuma em negrito. O texto fica centralizado na célula, e nenhuma palavra é partida: cada coluna tem ao menos a largura da maior palavra.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Na tela da declaração, as colunas têm os mesmos títulos do PDF. Para cada item, ela mostra a quantidade já declarada e o saldo.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Sistema", texto: "Documentos assinados: na página da assinatura, o registro da assinatura ocupa o lugar do carimbo do rodapé. As demais páginas seguem com o carimbo. Isso vale para a declaração do PCA e para o comprovante do termo de uso; os comprovantes de aceites anteriores mantêm o desenho com que foram emitidos.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.250.0",
    data: "2026-10-28",
    titulo: "Importar agora pelos indicadores da Execução e o andamento completo no card",
    mudancas: [
      { tipo: "novo", area: "Execução", texto: "Para o ADM, um botão pequeno no canto de cada indicador (empenhos, liquidações, pagamentos) importa na hora os dados atualizados daquela etapa: todos os cards dela, cada um no ano mais recente. O andamento aparece no canto inferior direito e continua mesmo saindo da tela; no fim, os números são atualizados.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Importações", texto: "A aba Importação do card mostra o andamento completo: o percentual, as etapas e cada pedido à Centi.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.249.0",
    data: "2026-10-28",
    titulo: "Declarações: editar até exportar, PDF timbrado e ações na própria tabela",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "A declaração pode ser editada (finalidade, processo, observação e itens) enquanto o PDF não for exportado; ao exportar, ela vale e fica travada — só pode ser cancelada.", link: "/painel/pca" },
      { tipo: "novo", area: "PCA", texto: "O PDF da declaração sai no papel timbrado da Prefeitura de Rio Verde, com título centralizado, texto justificado, a tabela dos itens e “Assinado e datado digitalmente.”; antes de exportar, dá para visualizar a prévia (marcada como PRÉVIA).", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "Cada linha da tabela de declarações tem o botão do PDF (visualizar e exportar) e, em elaboração, o de editar; a coluna Situação mostra Em elaboração, Exportada ou Cancelada.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "A observação usa o editor de texto do sistema (negrito, listas…) e a escolha dos itens ficou mais leve: o campo da quantidade só grava ao sair dele, e as colunas que decidem ficam à vista.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.248.0",
    data: "2026-10-28",
    titulo: "Importações ao vivo para o ADM e a hora da última atualização nos indicadores",
    mudancas: [
      { tipo: "novo", area: "Execução", texto: "Cada indicador (empenhos, liquidações, pagamentos) mostra, discreto no canto, há quanto tempo os dados foram atualizados. Com a hora exata na dica, e um ponto que pulsa enquanto uma importação está em andamento.", link: "/painel/execucao" },
      { tipo: "novo", area: "Importações", texto: "Importar mostra o andamento ao vivo e preciso: o percentual e o tempo que falta, as etapas (preparar, ler o que já está gravado, ler a Centi, conferir e gravar) e cada pedido à Centi. Para cada pedido: aguardando a resposta, baixando (MB e velocidade), lendo, comparando, gravando parte a parte, lido com os novos e alterados, nova tentativa ou erro.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "novo", area: "Importações", texto: "Para o ADM, o painel do canto inferior direito mostra todas as importações ao mesmo tempo, em tempo real: as suas (que seguem ao trocar de tela), as da atualização automática e as de outras abas e pessoas, com Parar e Detalhes. Ao expandir o painel, cada importação mostra todos os dados: etapas, cada pedido, bytes, registros e os últimos passos.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "novo", area: "Perfil", texto: "O ADM pode desligar o andamento das importações no canto em Perfil → Notificações.", link: "/painel/perfil?aba=notificacoes" },
    ],
  },
  {
    versao: "1.247.1",
    data: "2026-10-28",
    titulo: "Sombra do destino ao ordenar colunas",
    mudancas: [
      { tipo: "melhoria", area: "Tabelas", texto: "Ao arrastar uma coluna na aba Ordem, a sombra do item aparece no lugar onde ela vai ficar (o mesmo padrão do arrasto dos cartões).", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.247.0",
    data: "2026-10-28",
    titulo: "Ordem das colunas no seletor",
    mudancas: [
      { tipo: "novo", area: "Tabelas", texto: "O seletor de colunas ganhou a aba Ordem: arraste pela alça (no mouse, na caneta ou no toque) ou use as setas para mudar a ordem das colunas na hora; a ordem entra na visão ao salvar.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.246.0",
    data: "2026-10-28",
    titulo: "Declarações: quem emite em cada PCA e tabelas mais leves",
    mudancas: [
      { tipo: "novo", area: "PCA", texto: "Configuração do PCA → Declarações: escolha quem emite declarações neste PCA — todos com permissão, só os Administradores ou desligado (desligado, os Administradores ainda consultam, baixam e cancelam as já emitidas).", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "As tabelas da Nova declaração e dos itens de uma declaração seguem as linhas por página do sistema (com o seletor no rodapé) e o campo da quantidade só aparece no item marcado — leves com milhares de itens.", link: "/painel/pca" },
      { tipo: "correcao", area: "PCA", texto: "Uma declaração com itens de outras unidades só pode ser cancelada por quem vê todos os itens dela (cancelar devolve o saldo de cada item).", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.245.2",
    data: "2026-10-28",
    titulo: "Escolha das importações automáticas mais clara",
    mudancas: [
      { tipo: "melhoria", area: "Importações", texto: "Em “Quais importações”, cada ano de cada card tem um interruptor: ligado é automática, desligado é manual.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Importações", texto: "Os avisos da escolha e da configuração (o card a configurar, a escolha ainda não salva, o que falta corrigir) ficam no botão de avisos (!), sem faixas na tela.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.245.1",
    data: "2026-10-28",
    titulo: "Seletor de colunas sem rolagem dupla",
    mudancas: [
      { tipo: "correcao", area: "Tabelas", texto: "O seletor de colunas tem uma rolagem só: a busca e o rodapé ficam fixos, nada é cortado e não sobra espaço vazio.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.245.0",
    data: "2026-10-28",
    titulo: "Escolher quais importações atualizam sozinhas",
    mudancas: [
      { tipo: "novo", area: "Importações", texto: "Em “Atualização automática e regras”, a seção “Quais importações” escolhe, card por card e ANO por ano, o que a atualização automática lê (Todas · Nenhuma). O que fica desmarcado só é importado à mão; “Ano atual” acompanha a virada do ano. Até salvar a escolha, tudo continua como estava.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Importações", texto: "O selo “Automática” de cada card segue a escolha (o card fora dela aparece “Manual”), o resumo diz quantas importações são automáticas e a Configuração do card mostra os anos automáticos e os manuais. Uma importação automática em andamento num card ou ano tirado da escolha é encerrada sozinha.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.244.0",
    data: "2026-10-28",
    titulo: "Declarações do PCA",
    mudancas: [
      {
        tipo: "novo",
        area: "PCA",
        texto:
          "Aba Declarações no espaço do PCA: emita a declaração de que itens constam do PCA — com o DFD, o planejamento, a descrição, a quantidade e o valor unitário —, inteira ou PARCIAL (ex.: 6 de 12), para o início da contratação, um empenho complementar, um aditivo ou outra finalidade.",
        link: "/painel/pca",
      },
      {
        tipo: "novo",
        area: "PCA",
        texto:
          "Cada item tem SALDO (a quantidade no PCA menos o já declarado): o sistema não deixa declarar além dele, nem com duas pessoas emitindo ao mesmo tempo; cancelar uma declaração (com o motivo) devolve o saldo.",
        link: "/painel/pca",
      },
      {
        tipo: "novo",
        area: "PCA",
        texto: "O PDF da declaração sai numerado por ano, com o carimbo e o código de verificação: qualquer pessoa confere a autenticidade (válida, cancelada ou alterada) na página pública.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.243.2",
    data: "2026-10-28",
    titulo: "Seletor de colunas em dropdown",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "O seletor de colunas das tabelas abre num dropdown preso ao botão (folha só no celular): a contagem de colunas visíveis, a busca, cada grupo com a contagem e Todos/Nenhum, e no pé Mostrar todas · Padrão (volta às colunas do padrão da tabela).", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.243.1",
    data: "2026-10-28",
    titulo: "Importações sem travar o sistema",
    mudancas: [
      { tipo: "correcao", area: "Importações", texto: "A conferência de cada parte da importação (manual e automática) varria todos os registros do card para cada registro da parte — até 30 segundos por parte, segurando o banco e deixando o sistema fora do ar para todos enquanto importava. Agora cada registro é achado direto pelo índice: milissegundos por parte.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Importações", texto: "Menos pedidos ao mesmo tempo (até 3 × 2 partes) e o \"Importar tudo\" um card por vez: as outras telas nunca esperam pela importação.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.243.0",
    data: "2026-10-28",
    titulo: "Mesa: todo dado vira coluna, seletor de colunas e visões com estado inicial",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "Todos os dados do protocolo e do DFD viram colunas nas tabelas de Protocolos, DFDs e Itens (nas duas Mesas): interessado, CPF/CNPJ, observação, objeto, setor, contato do responsável, nº do contrato/ARP/licitação, datas e o texto de cada seção do DFD. Abrem ocultas e só são lidas quando a coluna é ligada; os dados pessoais e os valores seguem o papel.", link: "/painel/mesa?vista=dfds" },
      { tipo: "novo", area: "Mesa", texto: "Seletor de colunas no rodapé das tabelas: marque as colunas que quer ver, com Todos e Nenhum.", link: "/painel/mesa?vista=protocolos" },
      { tipo: "melhoria", area: "Mesa", texto: "O painel de filtros e visões (o mesmo da Execução) nas tabelas: os filtros em chips, as visões salvas (colunas, filtros e ordem), a sua visão padrão e, para o administrador, o estado inicial para todos — a escolha da própria pessoa vence.", link: "/painel/mesa?vista=itens" },
    ],
  },
  {
    versao: "1.242.1",
    data: "2026-10-28",
    titulo: "Atualização automática dentro do limite do banco",
    mudancas: [
      { tipo: "correcao", area: "Importações", texto: "As páginas sem mudança que a atualização automática pula numa execução agora seguem um orçamento contado de consultas ao banco (8 por execução nos empenhos, 5 nas liquidações e pagamentos) — nunca passa do limite do plano e a última página nunca falha em silêncio.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.242.0",
    data: "2026-10-28",
    titulo: "Atualização automática rápida e segura em segundo plano",
    mudancas: [
      { tipo: "melhoria", area: "Configurações", texto: "A atualização automática não refaz o que não mudou: a página da Centi idêntica à da última volta é reconhecida pela assinatura dos dados e não é relida nem regravada — várias por execução. Uma volta completa cai de horas para cerca de uma hora.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Configurações", texto: "A primeira importação depois da v1.241.0 não reescreve mais todos os registros: os já gravados e iguais só recebem a assinatura (protege o limite diário de gravações do banco).", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Configurações", texto: "Partes menores e de tamanho fixo também para os registros iguais, e as assinaturas baixadas em páginas — a importação pela tela fica estável em cards grandes.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Configurações", texto: "No histórico das importações, quantas páginas vieram sem mudança.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.241.0",
    data: "2026-10-28",
    titulo: "Importações rápidas que só gravam o que mudou, com histórico e “Importar tudo”",
    mudancas: [
      { tipo: "correcao", area: "Configurações", texto: "Fim dos passos em “Erro” na importação: o sistema estourava o tempo de processamento ao conferir partes grandes. Agora cada parte é pequena, a conferência é por assinatura e as partes vão em paralelo.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Configurações", texto: "Muito mais rápida: o ano inteiro num pedido (liquidações e pagamentos: um por órgão, todos ao mesmo tempo); o período grande demais é dividido sozinho.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Configurações", texto: "Só o que mudou é gravado: os registros iguais ao que já está no sistema não são reescritos — o resumo diz quantos vieram iguais.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "novo", area: "Configurações", texto: "“Importar tudo”: todos os cards de uma vez, cada um no seu lote, em paralelo — empenhos primeiro, depois liquidações e pagamentos.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Empenhos", texto: "Mais segurança: o que some da Centi fica “ausente” e continua valendo; só sai (ou é marcado como removido) se faltar de novo na importação seguinte.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Empenhos", texto: "Alterações na Centi: no detalhe de cada empenho, liquidação e pagamento, o histórico de cada campo que mudou (antes → depois), com a data e a importação.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.240.1",
    data: "2026-10-28",
    titulo: "Auditoria das importações: fila do cron mais robusta e telas sem travas",
    mudancas: [
      { tipo: "correcao", area: "Configurações", texto: "Em segundo plano, um card com problema não prende mais a fila: ele espera a próxima vez e os outros seguem.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Configurações", texto: "Desligar a atualização automática encerra as importações que ela tinha começado — nenhum card fica “Importando” para sempre.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Configurações", texto: "Uma importação aberta na tela e a automática começando juntas no mesmo card não dão mais erro: a segunda segue com a que entrou primeiro.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "correcao", area: "Configurações", texto: "Na aba Importações: a falha ao carregar a atualização automática mostra “Tentar de novo”, o card aberto acompanha o fim de uma importação automática e a exclusão recusada diz o motivo.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.240.0",
    data: "2026-10-28",
    titulo: "Atualização automática central: uma configuração e uma fila para todas as importações",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Em Importações, o quadro “Atualização automática e regras” liga/desliga, define frequência, horário e dias úteis e as regras da conferência (queda da soma e dos registros, o que fazer com o que a Centi não traz mais) — UMA vez, para empenhos, liquidações e pagamentos.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Configurações", texto: "Em segundo plano, os cards entram numa fila única: empenhos primeiro (é deles que vem a unidade das liquidações e dos pagamentos), depois liquidações e pagamentos, cada card na sua vez.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Configurações", texto: "A Configuração de cada card fica só com o que é dele: nome, anos e a integração. O que estava ligado num card foi trazido para a configuração central.", link: "/painel/configuracoes?aba=importacoes" },
    ],
  },
  {
    versao: "1.239.0",
    data: "2026-10-28",
    titulo: "Todas as importações num só lugar: Configurações → Importações",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Nova aba “Importações”: os cards de empenhos, liquidações e pagamentos num lugar só. Tocar num card abre ali mesmo a Importação, os Vínculos (empenhos) e a Configuração.", link: "/painel/configuracoes?aba=importacoes" },
      { tipo: "melhoria", area: "Empenhos", texto: "A tela fica só com os dados: a tabela de todos os empenhos. O atalho no título leva às importações (Administrador).", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Liquidações", texto: "A tela fica só com os dados: a tabela de todas as liquidações; as importações estão em Configurações.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Pagamentos", texto: "A tela fica só com os dados: a tabela de todos os pagamentos; as importações estão em Configurações.", link: "/painel/pagamentos" },
      { tipo: "correcao", area: "Sistema", texto: "Listas de escolha dentro de tabelas largas não alargam mais a página no celular.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.238.0",
    data: "2026-10-28",
    titulo: "Importações da Centi blindadas: nada esgota a cota nem trava",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "A conferência de “há dado novo” (a cada minuto em cada aba aberta) lia o histórico inteiro de alterações; agora lê só o último registro — milhares de vezes menos leitura do banco.", link: "/painel" },
      { tipo: "correcao", area: "Empenhos", texto: "A atualização automática não dá mais como abandonada uma importação que ainda avança (página grande lida em partes), espera mais a cada erro de rede (1, 2, 4… min) e só desiste depois de 30 minutos sem avanço.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "Uma letra acentuada partida entre duas partes de uma resposta grande da Centi mudava o número do empenho e o dava como removido; agora a parte termina antes da letra.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "Gravar a mesma importação duas vezes (o pedido repetido pela rede) não faz mais nada: antes podia marcar o ano inteiro como removido.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Liquidações", texto: "A atualização automática de liquidações e pagamentos alterna entre todos os anos do card (antes lia só o ano atual) e o ano que falhou espera 12 horas antes de nova tentativa (a manual libera).", link: "/painel/liquidacoes" },
      { tipo: "correcao", area: "Pagamentos", texto: "“Pedidos demais” e “tempo esgotado” da Centi viram nova tentativa, nunca o fim da importação; resposta fora do formato encerra na hora em vez de repetir.", link: "/painel/pagamentos" },
      { tipo: "melhoria", area: "Empenhos", texto: "A automática não assume mais a importação manual (esperando a confirmação de uma queda ou pausada), não deixa texto grande sobrando no banco e registra no histórico só o fim de cada importação.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Execução", texto: "Depois de cada importação, liquidações e pagamentos são realinhados só no ano e no card importados (antes, as tabelas inteiras), e a lista de anos é lida uma vez por importação.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.237.1",
    data: "2026-10-26",
    titulo: "Sistema de volta: leitura mais leve + todos os anos juntos",
    mudancas: [
      { tipo: "correcao", area: "Empenhos", texto: "As telas paravam com “O servidor não conseguiu montar esta tela”: a lista de anos dos empenhos lia o banco linha a linha a cada abertura e esgotava a cota diária de leituras. Agora lê uma vez por ano (centenas de vezes menos) e fica guardada até uma importação nova.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "A tabela abre em “Todos os anos”: os empenhos de todos os anos importados juntos (coluna Ano para filtrar) — ordenar a data, crescente ou decrescente, passa por todos os anos. Escolher um ano no seletor segue valendo.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Liquidações", texto: "A tabela abre em “Todos os anos”, com a coluna Ano; as liquidações ficam guardadas no servidor até uma importação nova.", link: "/painel/liquidacoes" },
      { tipo: "correcao", area: "Pagamentos", texto: "A tabela abre em “Todos os anos”, com a coluna Ano; os pagamentos ficam guardados no servidor até uma importação nova.", link: "/painel/pagamentos" },
    ],
  },
  {
    versao: "1.237.0",
    data: "2026-10-26",
    titulo: "Empenhos, liquidações e pagamentos numa tabela única",
    mudancas: [
      { tipo: "novo", area: "Empenhos", texto: "A tela abre em “Dados”: todos os empenhos de todos os cards numa tabela só (o mesmo empenho em dois cards aparece uma vez; a coluna Card diz de onde veio). Os cards ficam em “Importações”.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Liquidações", texto: "A tela abre em “Dados”: todas as liquidações de todos os cards numa tabela só; tocar numa linha abre a liquidação com o empenho ligado. Os cards ficam em “Importações”.", link: "/painel/liquidacoes" },
      { tipo: "novo", area: "Pagamentos", texto: "A tela abre em “Dados”: todos os pagamentos de todos os cards numa tabela só; tocar numa linha abre o pagamento. Os cards ficam em “Importações”.", link: "/painel/pagamentos" },
      { tipo: "melhoria", area: "Empenhos", texto: "Tudo da data mais recente à mais antiga: as tabelas, a execução no banner do empenho (liquidações e pagamentos) e os registros da origem do dashboard.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.236.2",
    data: "2026-10-26",
    titulo: "Gráfico da Execução: caixa sem corte e trecho só arrastando",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "A caixa do ponto marcado nunca é cortada: sem espaço, só os números rolam por dentro — o título, “Ver os dados completos” e o fechar ficam sempre à vista.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Um trecho do gráfico é selecionado só clicando, segurando e arrastando (também com o dedo, de lado); clicar em outro ponto apenas leva a marcação para ele.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.236.1",
    data: "2026-10-25",
    titulo: "Gráfico da Execução: a caixa do ponto marcado ao lado dos botões",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "A caixa de informações do ponto marcado (e a que segue o mouse) fica ao lado da lupa e dos botões do gráfico e abaixo dos controles do alto, com o recuo padrão — nunca por cima deles; sem espaço, rola por dentro.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.236.0",
    data: "2026-10-25",
    titulo: "Gráfico da Execução: sem piscar, a última data à vista e datas clicáveis",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "Filtrar não faz mais o gráfico piscar: o desenho escorre direto até os números novos, e as datas que continuam à vista ficam firmes ao trocar Dia, Semana, Mês ou o zoom.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "A última data do gráfico aparece no canto direito (“Hoje” quando é o dia de hoje); a lupa e os botões ao lado subiram para ficar acima dela.", link: "/painel/execucao" },
      { tipo: "novo", area: "Execução", texto: "As datas do gráfico são clicáveis: tocar marca o ponto, tocar de novo abre os dados e tocar em outra data compara o trecho — como no próprio gráfico.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.235.0",
    data: "2026-10-25",
    titulo: "Filtros: o estado inicial à parte e a Unidade no padrão do sistema",
    mudancas: [
      { tipo: "melhoria", area: "Filtros", texto: "Cada filtro mostra o estado inicial numa linha discreta no topo — “Todos” em destaque quando é geral; o resto rola de lado — com o ✓ de em uso ou o botão de voltar a ele.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "O estado inicial definido pelo administrador não marca mais os filtros nem destaca o cartão: só o que muda a partir dele conta como filtro.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "O filtro de Unidade segue o padrão do sistema: a sigla com o nome embaixo e a busca pelos dois.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "O Período também mostra o estado inicial (ex.: ano mais recente) e a Visão vazia passa a se chamar “Estado inicial”.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.234.0",
    data: "2026-10-25",
    titulo: "Execução: filtros em chips, visões salvas e o estado inicial",
    mudancas: [
      { tipo: "novo", area: "Execução", texto: "O botão de filtros do gráfico fica sempre à mão e mostra cada filtro feito num chip; o × devolve aquela parte ao ponto de partida.", link: "/painel/execucao" },
      { tipo: "novo", area: "Execução", texto: "Visões: salve as escolhas com um nome (só para você ou pública, com Configurar) e aplique de novo com um toque — a visão vira um filtro só e fica “alterada” se algo mudar depois.", link: "/painel/execucao" },
      { tipo: "novo", area: "Execução", texto: "O administrador define o estado inicial da tela: é o ponto de partida de todos e não aparece como filtro.", link: "/painel/execucao" },
      { tipo: "novo", area: "Execução", texto: "Filtro Visão no cartão de filtros: escolha uma visão salva direto ali (ou Nenhuma).", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Filtros", texto: "Os seletores de filtro mostram quantos valores estão marcados num selo, e o nome do filtro não fica mais cortado.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "Um filtro de unidade, elemento ou credor continua certo ao trocar o período para outro ano (antes podia apontar outro valor).", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Papéis", texto: "A tela Execução ganhou a ação Configurar (publicar visões e moderar as públicas), dada a quem configura Empenhos.", link: "/painel/configuracoes?aba=papeis" },
    ],
  },
  {
    versao: "1.233.1",
    data: "2026-10-25",
    titulo: "Indício de janela anônima só para o ADM",
    mudancas: [
      { tipo: "correcao", area: "Usuários", texto: "O indício de janela anônima deixou de ir ao navegador da própria pessoa na tela de nomear o aparelho — só o ADM o recebe.", link: "/painel/usuarios" },
    ],
  },
  {
    versao: "1.233.0",
    data: "2026-10-25",
    titulo: "Aparelho em janela anônima apontado ao ADM",
    mudancas: [
      { tipo: "novo", area: "Usuários", texto: "Ao nomear um aparelho, o sistema guarda o indício de janela anônima (pelo armazenamento do navegador). No banner do usuário, só o ADM vê o selo \"Possível janela anônima\" e o \"Temporário\" do aparelho que não voltou a ser usado.", link: "/painel/usuarios" },
      { tipo: "novo", area: "Notificações", texto: "Os ADMs recebem no sino o aviso \"Aparelho possivelmente em janela anônima\", com a pessoa, o navegador e o IP.", link: "/painel/usuarios" },
    ],
  },
  {
    versao: "1.232.1",
    data: "2026-10-25",
    titulo: "Execução: gráfico sem piscadas e transições fluidas",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "Ao ligar um filtro ou trocar o agrupamento, o desenho do gráfico não pisca mais em branco (claro) ou preto (escuro): ele escorre direto para a forma nova.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Desligar uma linha na legenda faz ela descer suave até o chão (e subir ao religar), com a escala se ajustando às linhas que ficaram — a mesma transição do resto do gráfico.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "O botão dos filtros ligados entra e sai deslizando, sem travar: o cálculo dos números espera a animação terminar.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.232.0",
    data: "2026-10-25",
    titulo: "Execução: legenda que liga e desliga as linhas",
    mudancas: [
      { tipo: "novo", area: "Execução", texto: "Bolinhas coloridas no canto superior direito do gráfico ligam e desligam as linhas de Empenhado, Liquidado e Pago (ao menos uma fica sempre à vista).", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "O número de filtros ligados no botão do funil aparece inteiro, sem corte.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "As pontas arredondadas do gráfico não ficam mais retas depois de rolar a página e voltar.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.231.0",
    data: "2026-10-25",
    titulo: "Execução: transições do gráfico sem saltos",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "Em \"Por período\", trocar entre Dia, Semana e Mês não faz mais o desenho saltar para outra forma e voltar: cada linha vai direto da posição antiga à nova, com a escala deslizando junto — o mesmo em qualquer filtro, modo e zoom.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "As linhas de marcação, as datas e a linha de hoje deslizam e trocam junto com o desenho, de forma suave; em trocas rápidas, o que sai esmaece de onde estava, sem piscar.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.230.0",
    data: "2026-10-25",
    titulo: "Seletor de período renovado e conectado",
    mudancas: [
      { tipo: "melhoria", area: "Execução", texto: "O seletor de período ganhou um visual padronizado — o período escolhido no topo com o Limpar em ícone, os atalhos em grade de tamanhos iguais e todas as peças com a mesma altura, borda e curvatura do sistema. Vale em todo lugar: Execução, Dashboard da Mesa e o filtro de datas das tabelas.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "As opções do período ficam ligadas aos dados: escolhido o ano, só os meses com registro (ou até o mês de hoje) podem ser escolhidos, e o intervalo De/Até se limita aos dados existentes; no filtro das tabelas, os meses seguem os demais filtros.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.229.0",
    data: "2026-10-25",
    titulo: "Execução: o gráfico muda como água",
    mudancas: [
      { tipo: "melhoria", area: "Execução", texto: "As linhas do gráfico escorrem da posição antiga até a nova em toda mudança — filtros, Acumulado/Por período, Dia/Semana/Mês, zoom e período —, casadas pela data de cada ponto; no zoom, a janela de datas desliza junto, e as laterais ficam sempre na borda.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "A dica de um ponto marcado ou de um trecho nunca cobre a marcação: fica depois dela, ou antes quando não cabe, e só no meio quando o trecho ocupa quase o gráfico todo; um clique logo depois de arrastar não se perde mais.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.228.1",
    data: "2026-10-25",
    titulo: "Execução: gráfico legível no modo escuro",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "As datas do gráfico ficam em pequenas pílulas de vidro, do mesmo tamanho no claro e no escuro, e trocam suavemente junto com o desenho; no modo escuro, o trecho selecionado clareia cada cor em vez de escurecer.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.228.0",
    data: "2026-10-25",
    titulo: "Execução: comparar trechos do gráfico, transições suaves e o empenho ao lado da origem",
    mudancas: [
      { tipo: "novo", area: "Execução", texto: "Compare um trecho do gráfico: com um ponto marcado, clique em outro ponto — ou pressione e arraste sobre o gráfico. Só as áreas dentro do trecho ficam destacadas — cada cor no seu tom de seleção, com a linha do topo — e o resto esmaece; a comparação mostra o que entrou nele (com as quantidades), a média, o acumulado no início e no fim, o crescimento e quanto foi liquidado e pago; “Ver os dados do trecho” abre a origem dele.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Toda mudança no gráfico é suave: com os mesmos pontos os valores deslizam até os novos, e com outros pontos (agrupamento, zoom, período) um desenho dá lugar ao outro esmaecendo — sempre com as laterais no lugar, também ao abrir e fechar o menu. Datas maiores e mais fortes e linhas de marcação mais visíveis, no claro e no escuro.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Na origem, a evolução até o ponto usa o mesmo desenho e a mesma dica do gráfico da tela, e tocar num registro abre o empenho AO LADO (e dele a liquidação ou o pagamento), na pilha de banners padrão.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.227.0",
    data: "2026-10-25",
    titulo: "Execução: gráfico em tela cheia no cartão, com controles em vidro e marcação por clique",
    mudancas: [
      { tipo: "melhoria", area: "Execução", texto: "O desenho do gráfico ocupa o cartão inteiro (com o respiro e o arredondamento do sistema), as datas ficam sobre ele e os controles flutuam por cima em vidro translúcido: o tipo e o agrupamento no alto, cada um no seu, as setas e as datas do zoom ao lado, e a lupa, o restaurar e a tabela empilhados no canto inferior direito — menores em telas pequenas.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Um clique MARCA o ponto (a dica para ali e dá para passar o mouse sobre ela); o segundo clique no mesmo ponto — ou “Ver os dados completos” — abre a origem. Sem clique, a dica segue o mouse sem nunca ficar sob ele, em vidro translúcido; os pontos sobre as linhas pulsam como “online”.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "As pontas do desenho não descolam mais ao abrir ou fechar o menu e ao trocar o agrupamento; o agrupamento “Auto” saiu (começa em Dia, e um período longo demais sobe para mês sozinho); o zoom mostra as datas completas da janela e quantos dias estão à vista; a tabela dos dados do gráfico segue o limite de linhas do sistema.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.226.0",
    data: "2026-10-25",
    titulo: "Execução: origem com gráficos e tabelas leves",
    mudancas: [
      { tipo: "melhoria", area: "Execução", texto: "A origem de um ponto do gráfico ganhou um painel visual: a evolução acumulada até o ponto, a composição do empenhado (pago, liquidado a pagar e a liquidar) e os 5 maiores por unidade, elemento ou fornecedor — tocar numa barra filtra os registros logo abaixo.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "As tabelas da origem agora são paginadas pelo limite de linhas do sistema (Configurações → Tabelas) e só montam a aba aberta — abrir o acumulado com milhares de empenhos não trava mais.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "Os saldos nunca aparecem negativos: quando o pago passa do liquidado (ou o liquidado passa do empenhado) por causa dos restos a pagar, o indicador vira \"Pago além do liquidado\" (ou \"Liquidado além do empenhado\"), em destaque, na origem e na dica do gráfico.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.225.1",
    data: "2026-10-25",
    titulo: "Menus suspensos sempre dentro do display",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "Todo menu suspenso (filtros, seletores, listas), as dicas flutuantes e as janelas flutuantes ficam inteiros dentro da área visível: descontam a barra de rolagem e, no celular, a barra do navegador e o teclado; sem espaço embaixo, encostam na borda e rolam por dentro em vez de passar dela.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.225.0",
    data: "2026-10-25",
    titulo: "Execução: zoom por datas, clique só no ponto e a fonte da origem no (!)",
    mudancas: [
      { tipo: "melhoria", area: "Execução", texto: "O zoom pela lupa agora muda o PERÍODO à vista: aproximar refaz o gráfico numa janela menor de datas com mais detalhe (um ano em meses vira semanas e depois dias, até 7 dias), com setas para andar no tempo e as datas da janela ao lado; no acumulado, o valor continua o do início do período e a escala se ajusta para a variação aparecer.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "Clicar no gráfico não desenha mais um contorno em volta dele: o retorno do clique é um anel que se expande só em volta do ponto tocado.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Origem dos dados", texto: "A fonte dos dados e as observações da janela “Origem dos dados” saíram da faixa azul e ficam no (!) do cabeçalho — em todas as telas que a usam.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.224.1",
    data: "2026-10-25",
    titulo: "Execução: o ano atual vai até hoje no gráfico",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "Ao analisar o ano atual, o gráfico vai só até o dia de hoje — sem os meses à frente vazios. Anos passados seguem inteiros; um registro com data depois de hoje estende o gráfico até ele.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.224.0",
    data: "2026-10-25",
    titulo: "Execução: clique no ponto, dados acumulados e indicadores que abrem suavemente",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "O gráfico abre a origem só ao tocar no PONTO destacado (com área de toque maior que o desenho), não mais em qualquer lugar do gráfico — e sem o contorno azul ao clicar.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "A dica de cada ponto traz o valor só daquele dia, semana ou mês com as quantidades (empenhos, liquidações, ordens), o acumulado até ali e a execução acumulada: % liquidado e pago sobre o empenhado, o que falta liquidar e pagar e quanto do empenhado do gráfico já foi alcançado.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "A origem de um ponto alterna entre “Só o ponto” e “Acumulado até aqui” (no gráfico acumulado, já abre no acumulado — a soma bate com o que o gráfico mostra) e mostra também o % do empenhado, o que falta liquidar e o que falta pagar.", link: "/painel/execucao" },
      { tipo: "correcao", area: "Execução", texto: "“Mais indicadores” abre e fecha deslizando pela altura, sem saltos: os cartões de baixo acompanham, nada pisca e a preferência guardada abre já pronta.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.223.1",
    data: "2026-10-25",
    titulo: "Execução: controles do gráfico no canto superior esquerdo",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "Os controles do gráfico (Acumulado | Por período, o agrupamento, o zoom pela lupa e a tabela dos dados) ficam alinhados no canto superior esquerdo do cartão; os filtros ligados, os avisos (!) e a ajuda (?) seguem à direita.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.223.0",
    data: "2026-10-25",
    titulo: "Execução reorganizada: indicadores, filtros, demonstrativo e avisos no (!)",
    mudancas: [
      { tipo: "melhoria", area: "Execução", texto: "Indicadores em três colunas — Empenhos, Liquidações e Pagamentos: o Saldo sempre à vista e, em “Mais indicadores”, o Anulado e o Total (saldo + anulado = total), com a quantidade e o percentual. Tocar em qualquer um mostra a origem dos dados, e dela o empenho com as liquidações e os pagamentos.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Todos os filtros à vista no cartão padrão de filtros, ligados entre si: Período, Tipo (Nota de Empenho × Restos a Pagar), Unidade e Órgão do sistema e as classificações do orçamento. Os anos carregados seguem o Período. Saíram o seletor de anos, a visão “Por empenho”, os filtros duplicados da Centi e o funil (repetia as KPIs).", link: "/painel/execucao" },
      { tipo: "novo", area: "Execução", texto: "Demonstrativo abaixo do gráfico: escolha por Unidade, Órgão, Função, Programa, Ação, Elemento, Fonte, Credor, Licitação, Modalidade ou Mensal — empenhado, liquidado, anulado, retido, pago e % pago, com filtros nas colunas, exportação e a origem de cada linha.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Gráfico minimalista — ondas em camadas, sem título nem legenda — com os seus controles (zoom pela lupa: aproximar, afastar e restaurar), os avisos (!) e a ajuda (?) no próprio cartão.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "Tela mais leve: carrega só os registros dos anos do Período (sem a execução de outros anos da antiga visão por empenho), o gráfico anima suave entre os filtros e os indicadores extras entram sem saltos.", link: "/painel/execucao" },
      { tipo: "novo", area: "Empenhos", texto: "Novo botão (!) de avisos, ao lado do (?): as mensagens das telas de empenhos, liquidações e pagamentos (registros sem empenho, configuração pendente do card, falha ao recarregar) ficam nele — nenhuma faixa empurra a tela.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.222.0",
    data: "2026-10-25",
    titulo: "Tipo da liquidação e do pagamento: Nota de Empenho ou Restos a Pagar",
    mudancas: [
      { tipo: "novo", area: "Liquidações", texto: "Nova coluna Tipo: Nota de Empenho quando o empenho é do mesmo ano da liquidação; Restos a Pagar quando é de ano anterior ou não está no sistema (marcado com *). Sem número de empenho, ou empenho de ano posterior, aparece em vermelho como erro. O tipo também está no detalhe da liquidação.", link: "/painel/liquidacoes" },
      { tipo: "novo", area: "Pagamentos", texto: "A mesma coluna Tipo nos pagamentos e no detalhe do pagamento.", link: "/painel/pagamentos" },
      { tipo: "melhoria", area: "Empenhos", texto: "As tabelas de empenhos, liquidações e pagamentos se atualizam sozinhas quando uma importação termina — inclusive a de um ano anterior, que muda o tipo e a unidade das liquidações e dos pagamentos já gravados.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.221.1",
    data: "2026-10-25",
    titulo: "Execução: carga mais segura",
    mudancas: [
      { tipo: "correcao", area: "Execução", texto: "A tela da Execução abre com um pedido só, mostra uma mensagem clara quando o servidor falha e lê os dados em partes menores — anos com muitos empenhos não travam a carga.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.221.0",
    data: "2026-10-25",
    titulo: "Dashboard da execução da despesa",
    mudancas: [
      { tipo: "novo", area: "Execução", texto: "Nova tela Execução: empenhado, liquidado, pago e retido de todos os cards, ligados pelo número do empenho, com o funil da execução e a evolução no tempo (acumulada ou por dia, semana e mês, com zoom). Tocar em qualquer número mostra os empenhos, liquidações e pagamentos que o formam.", link: "/painel/execucao" },
      { tipo: "novo", area: "Execução", texto: "Duas visões: Movimento (cada etapa pela própria data, com os restos a pagar) e Por empenho (os empenhos do período e toda a execução deles, com o que falta liquidar e pagar). Filtros por unidade, órgão, ação, elemento, fonte, fornecedor e mais, com as opções ligadas entre si.", link: "/painel/execucao" },
      { tipo: "melhoria", area: "Execução", texto: "A tela diz de quando são os dados, avisa importação em andamento, com erro ou atrasada, e mostra à parte as liquidações e os pagamentos sem o empenho no sistema. Cada etapa só aparece para quem abre a tela dela.", link: "/painel/execucao" },
    ],
  },
  {
    versao: "1.220.0",
    data: "2026-10-25",
    titulo: "Unidade das liquidações e dos pagamentos pelo empenho",
    mudancas: [
      { tipo: "correcao", area: "Liquidações e pagamentos", texto: "A coluna Unidade passa a mostrar a unidade do empenho ligado, como na tabela de empenhos. O empenho vinculado só ao órgão mostra a sigla do órgão. Se a unidade do empenho mudar, a liquidação e o pagamento acompanham na hora.", link: "/painel/liquidacoes" },
    ],
  },
  {
    versao: "1.219.0",
    data: "2026-10-25",
    titulo: "Liquidações e pagamentos abertos de dentro do empenho",
    mudancas: [
      { tipo: "novo", area: "Empenhos", texto: "No detalhe do empenho, tocar numa liquidação ou num pagamento da Execução abre os dados completos dele ao lado (credor, histórico, órgão e o registro da importação), sem sair do empenho.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.218.0",
    data: "2026-10-24",
    titulo: "Execução dentro do empenho, leitura por órgão e sincronia com o cadastro",
    mudancas: [
      { tipo: "novo", area: "Empenhos", texto: "O detalhe do empenho mostra as liquidações e os pagamentos dele, com as somas conferidas com o liquidado e o pago que a Centi informa. Cada pagamento aponta a liquidação provável (a de mesmo valor).", link: "/painel/empenhos" },
      { tipo: "novo", area: "Empenhos", texto: "Coluna “Conferência” na tabela de empenhos: marca o liquidado acima do empenhado, o pago acima do liquidado e o saldo a pagar que não fecha.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Empenhos", texto: "Opção “Ler só os órgãos dos vínculos” (Configuração → Integração): a importação pede cada órgão pelo ID na Centi, baixando menos e gravando menos no banco. Os IDs são aprendidos em Vínculos → “Descobrir os IDs” e aparecem em “IDs na Centi”. Faltando o ID de algum órgão, a importação lê o ano inteiro como sempre.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos", texto: "A aba Vínculos avisa quando o mesmo empenho também está em outro card com outro destino.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Liquidações e pagamentos", texto: "Agora a unidade que muda de órgão leva junto as liquidações e os pagamentos dela, e trocar o “ID na Centi” de um órgão leva os registros sem empenho ao órgão certo. Antes, só os empenhos acompanhavam.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Liquidações e pagamentos", texto: "As tabelas avisam quantos registros estão sem o empenho no sistema. Em geral são restos a pagar de anos anteriores, que passam a ser ligados quando esses anos entram no card de empenhos.", link: "/painel/liquidacoes" },
    ],
  },
  {
    versao: "1.217.0",
    data: "2026-10-24",
    titulo: "Importações mais leves para o banco e mais rápidas na automática",
    mudancas: [
      { tipo: "melhoria", area: "Empenhos, liquidações e pagamentos", texto: "Agora o sistema compara cada registro com o já gravado antes de escrever. Um registro sem mudança passou de cerca de cinco escritas no banco para uma, o que mantém as reimportações dentro do limite diário do plano gratuito.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos, liquidações e pagamentos", texto: "A atualização automática passou a rodar duas vezes por minuto, uma a cada 30 segundos, e uma trava impede que as duas mexam na mesma importação. Os meses grandes terminam na metade do tempo.", link: "/painel/pagamentos" },
      { tipo: "correcao", area: "Liquidações e pagamentos", texto: "Na leitura em pedaços da automática, um registro que a Centi repete em dois pedaços da mesma resposta passa a contar como repetido. Antes ele contava duas vezes e a conferência podia fechar como parcial.", link: "/painel/pagamentos" },
      { tipo: "novo", area: "Empenhos, liquidações e pagamentos", texto: "A importação mostra o tempo restante. Quando a atualização automática está importando, a tela acompanha sozinha o ano lido e a resposta grande em leitura.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Empenhos, liquidações e pagamentos", texto: "O histórico das importações ganhou três colunas: pedidos feitos à Centi (com os erros), volume baixado e duração.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.216.1",
    data: "2026-10-24",
    titulo: "Importação mais rápida, dentro do plano gratuito",
    mudancas: [
      { tipo: "melhoria", area: "Empenhos, liquidações e pagamentos", texto: "A leitura das linhas da Centi ficou cerca de 35% mais rápida. A limpeza dos textos pula os campos que já vêm limpos, o que acelera a importação pela tela e a automática, sem mudar nenhum dado.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos e liquidações", texto: "Na importação pela tela, cada semana pode ter até 4 MB antes de ser dividida, o que significa menos divisões e menos pedidos. O servidor só repassa a resposta, e o limite por pedido continua o mesmo.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.216.0",
    data: "2026-10-24",
    titulo: "Importação leve e automática em fragmentos",
    mudancas: [
      { tipo: "melhoria", area: "Empenhos, liquidações e pagamentos", texto: "A importação pela tela lê o JSON da Centi no navegador e envia ao sistema em partes de tamanho fixo. Nenhum pedido passa do limite do plano gratuito, qualquer que seja o tamanho do mês, e a conferência de cada linha continua no servidor.", link: "/painel/pagamentos" },
      { tipo: "novo", area: "Pagamentos", texto: "A atualização automática também importa os meses grandes. A resposta é baixada em pedaços de 1 MB e processada em janelas pequenas, uma por minuto. Se a Centi mudar a resposta no meio, a leitura recomeça sozinha.", link: "/painel/pagamentos" },
      { tipo: "melhoria", area: "Empenhos e liquidações", texto: "A atualização automática faz uma tarefa pequena por minuto e reveza entre os cards ligados. Assim, um card nunca atrasa os outros.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Liquidações e pagamentos", texto: "A importação avisa que o órgão e a unidade vêm do empenho de mesmo número, por isso os empenhos devem ser importados antes. Os que chegarem depois são realinhados sozinhos.", link: "/painel/liquidacoes" },
    ],
  },
  {
    versao: "1.215.0",
    data: "2026-10-24",
    titulo: "Pagamentos da Centi",
    mudancas: [
      { tipo: "novo", area: "Pagamentos", texto: "Nova tela Pagamentos, com os mesmos cards de Empenhos e Liquidações: cada card importa as ordens de pagamento da Centi com a própria configuração (integração, anos, atualização automática e regras da conferência) e a sua tabela.", link: "/painel/pagamentos" },
      { tipo: "novo", area: "Pagamentos", texto: "A importação lê todos os órgãos com o “ID na Centi” MÊS A MÊS, com os órgãos de cada mês ao mesmo tempo; só grava quando o ano inteiro foi lido e a contagem confere. O número do empenho dá o órgão e a unidade de cada pagamento (o empenho de qualquer ano).", link: "/painel/pagamentos" },
      { tipo: "novo", area: "Pagamentos", texto: "A tabela mostra o valor da ordem, a retenção, o pago líquido e a anulação (as anuladas ficam guardadas, fora das somas); tocar numa linha abre o pagamento inteiro com o empenho ligado.", link: "/painel/pagamentos" },
      { tipo: "melhoria", area: "Empenhos", texto: "Importar empenhos ou mudar os vínculos de um card leva junto os pagamentos desses empenhos para o novo órgão e unidade.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.214.1",
    data: "2026-10-24",
    titulo: "Auditoria da importação em paralelo",
    mudancas: [
      { tipo: "correcao", area: "Empenhos e liquidações", texto: "Quando a leitura para por uma falha, o aviso diz o período e o órgão (ou a página) que falhou primeiro — com vários pedidos ao mesmo tempo, antes podia citar outro.", link: "/painel/liquidacoes" },
    ],
  },
  {
    versao: "1.214.0",
    data: "2026-10-24",
    titulo: "Importação em paralelo",
    mudancas: [
      { tipo: "melhoria", area: "Liquidações", texto: "A importação lê os órgãos de cada semana AO MESMO TEMPO (até 6 pedidos em paralelo): um órgão que demora ou falha não segura os outros, e o período só fecha quando todos chegaram. As importações de liquidações que estavam abertas foram encerradas — importe de novo.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Empenhos", texto: "A importação lê várias semanas ao mesmo tempo (até 4 pedidos em paralelo); as páginas de cada semana seguem em sequência. Continuar retoma tudo o que faltava de cada semana começada.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos e liquidações", texto: "Os indicadores dos banners (valores do empenho e da liquidação) cabem inteiros em qualquer tamanho de tela — a fonte acompanha a largura do cartão, sem reticências.", link: "/painel/liquidacoes" },
    ],
  },
  {
    versao: "1.213.0",
    data: "2026-10-24",
    titulo: "Detalhe das liquidações e o ano do empenho",
    mudancas: [
      { tipo: "novo", area: "Liquidações", texto: "Toque numa linha da tabela para ver a liquidação inteira num banner: valores, credor, histórico, órgão e unidade do sistema, o registro da importação e o EMPENHO ligado pelo número (valores, fornecedor, ação, elemento, fonte e o card de origem).", link: "/painel/liquidacoes" },
      { tipo: "novo", area: "Liquidações", texto: "Coluna “Ano do empenho”: o empenho é procurado em toda a tabela de empenhos, de qualquer ano (restos a pagar) — sem o empenho no sistema, “—”.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Empenhos", texto: "O banner do empenho mostra também o ano e o Id na Centi.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.212.0",
    data: "2026-10-24",
    titulo: "Liquidações ligadas aos empenhos pelo número",
    mudancas: [
      { tipo: "melhoria", area: "Liquidações", texto: "Uma importação lê as liquidações de todos os órgãos com o “ID na Centi” (Órgãos e Unidades) de uma vez — a aba Órgãos do card saiu; os passos mostram o órgão lido.", link: "/painel/liquidacoes" },
      { tipo: "novo", area: "Liquidações", texto: "A tabela ganhou as colunas Órgão e Unidade do sistema: o número do empenho liga a liquidação ao empenho, e ela segue o órgão e a unidade dele (a Centi não informa a unidade). Sem o empenho importado, fica o órgão do ID na Centi, sem unidade — e passa a seguir o empenho quando ele chegar.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Empenhos", texto: "Importar empenhos ou mudar os vínculos de um card leva junto as liquidações desses empenhos para o novo órgão e unidade.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.211.1",
    data: "2026-10-24",
    titulo: "Excluir importações",
    mudancas: [
      { tipo: "correcao", area: "Empenhos", texto: "Excluir várias importações de uma vez voltou a funcionar: todas saem num pedido só (antes, cada uma fazia várias consultas e o pedido estourava o limite do servidor no meio).", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Liquidações", texto: "A mesma correção na exclusão das importações das liquidações, mais rápida com muitos registros gravados.", link: "/painel/liquidacoes" },
    ],
  },
  {
    versao: "1.211.0",
    data: "2026-10-24",
    titulo: "Liquidações independentes dos empenhos",
    mudancas: [
      { tipo: "melhoria", area: "Liquidações", texto: "O card de liquidações não depende mais de um card de empenhos: a nova aba Órgãos escolhe os órgãos da Centi que ele importa (com a unidade de destino, opcional) e tudo o que a Centi devolve para o órgão é gravado.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Liquidações", texto: "A importação é de um órgão por vez: escolha o órgão e o ano na aba Importação.", link: "/painel/liquidacoes" },
      { tipo: "correcao", area: "Empenhos", texto: "Uma falha passageira da Centi (erro 500, sem resposta) não descarta mais o que já foi lido: a leitura tenta de novo por até 1 minuto e, se não voltar, fica parada — Continuar lê só o que falta.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.210.0",
    data: "2026-10-24",
    titulo: "Conferência em tempo real na importação",
    mudancas: [
      { tipo: "novo", area: "Empenhos", texto: "Cada página lida da Centi é conferida com o banco na hora: a nova coluna Resultado dos passos mostra novos · alterados · iguais · sem vínculo, e o topo da importação soma o resultado até agora.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos", texto: "O registro igual ao gravado não é guardado nem reescrito: dele fica só a chave para a conferência — a importação ocupa espaço só com o que é novo ou mudou.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Liquidações", texto: "A mesma conferência em tempo real nas liquidações, com a coluna Resultado em cada passo.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Empenhos", texto: "A coluna “Novos” dos passos passou a se chamar “Únicos no lote” (os registros que a página trouxe pela 1ª vez nesta importação).", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.209.1",
    data: "2026-10-24",
    titulo: "Auditoria das liquidações",
    mudancas: [
      { tipo: "correcao", area: "Liquidações", texto: "Trocar o card de empenhos de origem tira as liquidações do card anterior na mesma gravação (a tela avisa antes) e é recusado durante uma importação.", link: "/painel/liquidacoes" },
      { tipo: "correcao", area: "Liquidações", texto: "“Editar no card de empenhos” só aparece para quem configura Empenhos; a etapa Vínculos do aviso leva à própria aba do card.", link: "/painel/liquidacoes" },
    ],
  },
  {
    versao: "1.209.0",
    data: "2026-10-24",
    titulo: "Liquidações em tela própria",
    mudancas: [
      { tipo: "novo", area: "Liquidações", texto: "Nova tela Liquidações, com os mesmos cards de Empenhos: cada card importa as liquidações da Centi com a própria configuração, a tabela, a importação conferida e o histórico.", link: "/painel/liquidacoes" },
      { tipo: "novo", area: "Liquidações", texto: "Cada card de liquidações lê os empenhos de um card de empenhos (escolhido na Configuração): a liquidação só entra quando o empenho está lá e segue a unidade dele. A aba Vínculos mostra os vínculos desse card.", link: "/painel/liquidacoes" },
      { tipo: "novo", area: "Liquidações", texto: "Atualização automática das liquidações: no horário do card, lê os órgãos da Centi um após o outro, com a mesma conferência e as mesmas regras de queda.", link: "/painel/liquidacoes" },
      { tipo: "melhoria", area: "Administração", texto: "Liquidações tem permissão própria nos papéis e nos módulos; quem já via Empenhos passou a ver Liquidações com as mesmas ações.", link: "/painel/configuracoes?aba=papeis" },
      { tipo: "melhoria", area: "Empenhos", texto: "As liquidações saíram de dentro dos cards de empenhos; as já importadas foram para um card novo em Liquidações.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.208.0",
    data: "2026-10-24",
    titulo: "Liquidações nos cards de empenhos",
    mudancas: [
      { tipo: "novo", area: "Empenhos", texto: "Nova aba Liquidações em cada card: as liquidações dos empenhos do card, por ano, com valor, anulado, líquido, pago e saldo, filtros e exportação.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Empenhos", texto: "Importação → Empenhos | Liquidações: as liquidações são lidas da Centi por órgão (o ID na Centi do órgão), semana a semana, com a mesma conferência, regras de queda e histórico dos empenhos.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos", texto: "Só é gravada a liquidação cujo empenho está no card; ela segue a unidade do empenho e sai junto com ele.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "Excluir importações do histórico passou a contar corretamente quantas foram excluídas.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.207.4",
    data: "2026-10-24",
    titulo: "Empenhos: sempre o ano inteiro",
    mudancas: [
      { tipo: "melhoria", area: "Empenhos", texto: "A importação, a atualização automática, o Testar e o “Buscar na Centi” leem sempre o ano inteiro (01/01 a 31/12), também no ano atual.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.207.3",
    data: "2026-10-24",
    titulo: "Abas dos empenhos na altura da tela",
    mudancas: [
      { tipo: "correcao", area: "Empenhos", texto: "As abas do card de empenhos respeitam a altura da tela: cabeçalho e abas ficam à vista e só o conteúdo rola por dentro.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos", texto: "“Buscar na Centi” ganhou Interromper, o seletor de ano sempre à vista e segue o período dos parâmetros do card.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "Trocar o órgão gestor ou a unidade de um vínculo com ações escolhidas pede confirmação.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "Na Importação, trocar de ano limpa os números da importação de outro ano e o botão explica quando há outra importação em andamento.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "A Configuração acompanha as alterações salvas por outra pessoa e o Testar diz por que está bloqueado.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.207.2",
    data: "2026-10-24",
    titulo: "Card de empenhos sem rolar a página",
    mudancas: [
      { tipo: "correcao", area: "Empenhos", texto: "No computador, o card de empenhos cabe na tela: só o conteúdo das abas rola por dentro, sem a barra de rolagem do navegador.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "O Testar da Configuração oferece também os anos acrescentados e ainda não salvos; o ano escolhido é sempre um dos anos do card.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "Cancelar uma importação parada pede confirmação, como Interromper e Excluir.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.207.1",
    data: "2026-10-24",
    titulo: "Auditoria dos empenhos",
    mudancas: [
      { tipo: "correcao", area: "Empenhos", texto: "O cabeçalho do card mostra o empenhado com o valor completo (sem abreviar).", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "Uma importação do ano atual que atravessa a meia-noite não fecha mais como parcial por um “dia novo” não lido: vale o dia em que ela começou.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.207.0",
    data: "2026-10-24",
    titulo: "Card de empenhos no padrão do card do orçamento",
    mudancas: [
      { tipo: "melhoria", area: "Empenhos", texto: "Os cards de empenhos usam o mesmo card do orçamento: empenhado líquido em destaque, a barra do % pago, a composição (empenhado, anulado, liquidado, pago, saldo a pagar) com os valores completos e os números de órgãos gestores, unidades orçamentárias, ações, fornecedores e vínculos.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.206.1",
    data: "2026-10-24",
    titulo: "Empenhos: um só ano, período até hoje e andamento ao vivo",
    mudancas: [
      { tipo: "correcao", area: "Empenhos", texto: "Importação, Testar e “Buscar na Centi” usam o MESMO ano (escolher em um vale nos outros); o Testar oferece só os anos do card.", link: "/painel/empenhos" },
      { tipo: "correcao", area: "Empenhos", texto: "O período vai até 31/12 nos anos anteriores e até HOJE no ano atual — o teste pede o ano inteiro e a importação não pede semanas futuras.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos", texto: "A Importação mostra ao vivo há quanto tempo espera a resposta da Centi em cada pedido.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos", texto: "Vínculos: a coluna Ações usa o mesmo selo dos vínculos do orçamento (“Todas” ou “N ações”, a lista na dica); edite as ações no banner do vínculo.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.206.0",
    data: "2026-10-24",
    titulo: "Card de empenhos: configurar antes de importar e vínculos na célula",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Empenhos",
        texto: "Toda a configuração vem antes de qualquer importação: o card novo abre na Configuração (confirme integração, anos, atualização e regras), depois os Vínculos — só então a Importação e a atualização automática são liberadas. O cabeçalho do card mostra as etapas que faltam.",
        link: "/painel/empenhos",
      },
      {
        tipo: "melhoria",
        area: "Empenhos",
        texto: "Na aba Vínculos, quem configura edita direto na célula: órgão gestor, unidade orçamentária, ações e para onde vai no cadastro — grava na hora, com o texto inteiro à vista (sem abreviar).",
        link: "/painel/empenhos",
      },
    ],
  },
  {
    versao: "1.205.0",
    data: "2026-10-24",
    titulo: "Empenhos em cards",
    mudancas: [
      {
        tipo: "novo",
        area: "Empenhos",
        texto: "Tudo da execução da despesa numa tela só, no padrão do Orçamento: cada CARD é uma importação da Centi com a própria configuração e a sua tabela no banco. O card \"+\" cria um card (opcionalmente copiando os vínculos de outro).",
        link: "/painel/empenhos",
      },
      {
        tipo: "novo",
        area: "Empenhos",
        texto: "Dentro de cada card: Empenhos (exatamente o que está gravado), Vínculos (quais órgãos gestores, unidades orçamentárias e ações entram e para qual órgão ou unidade do cadastro vão — o mais específico vale), Importação (manual, conferida, por ano) e Configuração (integração, anos, atualização automática e as regras da conferência — a queda que pede confirmação e o que fazer com o que sumiu da Centi).",
        link: "/painel/empenhos",
      },
      {
        tipo: "melhoria",
        area: "Empenhos",
        texto: "Só o que um vínculo do card cobre é gravado; mudar ou excluir um vínculo vale na hora (o que fica sem vínculo sai do banco). Os empenhos, vínculos e importações que existiam foram para o 1º card.",
        link: "/painel/empenhos",
      },
      {
        tipo: "melhoria",
        area: "Administração",
        texto: "O vínculo com a Centi saiu de Órgãos e Unidades e a aba APIs da Centi saiu de Integrações — agora tudo mora no card de empenhos.",
        link: "/painel/orgaos",
      },
    ],
  },
  {
    versao: "1.204.0",
    data: "2026-10-23",
    titulo: "Unidade do sistema nos empenhos",
    mudancas: [
      {
        tipo: "novo",
        area: "Empenhos",
        texto: "Coluna Unidade na tabela de empenhos: a unidade do cadastro vinculada a cada empenho (vinculado só ao órgão, o órgão), com o filtro padrão de unidade do sistema — sigla e nome, busca pelos dois. Também no detalhe do empenho.",
        link: "/painel/empenhos",
      },
    ],
  },
  {
    versao: "1.203.0",
    data: "2026-10-23",
    titulo: "Unidade orçamentária e ações vinculadas juntas",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Órgãos e Unidades",
        texto: "Na unidade, primeiro a unidade orçamentária da Centi e depois as ações DELA (a lista só mostra as ações da unidade orçamentária escolhida). Sem ação escolhida, valem todas; com ações, só elas — o vínculo é sempre o par unidade orçamentária + ação.",
        link: "/painel/orgaos",
      },
      {
        tipo: "novo",
        area: "Órgãos e Unidades",
        texto: "A mesma unidade orçamentária pode ser dividida por ações entre várias unidades (cada ação em uma só); inteira, fica com uma unidade só.",
        link: "/painel/orgaos",
      },
      {
        tipo: "correcao",
        area: "Órgãos e Unidades",
        texto: "Trocar a unidade orçamentária solta as ações da anterior e a unidade e as ações são gravadas juntas, num passo só.",
        link: "/painel/orgaos",
      },
    ],
  },
  {
    versao: "1.202.0",
    data: "2026-10-23",
    titulo: "Empenhos: só o vinculado entra no banco e vínculo por ações",
    mudancas: [
      {
        tipo: "correcao",
        area: "Integrações",
        texto: "A importação dos empenhos só grava o que tem vínculo em Órgãos e Unidades: o registro sem vínculo não entra no banco nem por um instante (antes passava pela área temporária) — dele fica só a chave até o fim da importação, para conferir a contagem com a Centi. As importações já abertas foram limpas.",
        link: "/painel/integracoes?aba=centi",
      },
      {
        tipo: "novo",
        area: "Órgãos e Unidades",
        texto: "Nas unidades, os empenhos podem ser vinculados pela unidade orçamentária ou por AÇÕES da Centi — várias de uma vez, na coluna “Ações (Centi)” ou no banner da unidade. A ação vale mais que a unidade orçamentária e pertence a uma unidade só.",
        link: "/painel/orgaos",
      },
      {
        tipo: "melhoria",
        area: "Órgãos e Unidades",
        texto: "As colunas da Centi usam a lista do sistema e mostram o texto inteiro, sem abreviar.",
        link: "/painel/orgaos",
      },
      { tipo: "melhoria", area: "Empenhos", texto: "Saiu o aviso das unidades da Centi sem vínculo: unidade sem vínculo é escolha do cadastro — os empenhos dela não são importados.", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.201.0",
    data: "2026-10-23",
    titulo: "Cópias, prints e tempo de cada acesso no histórico",
    mudancas: [
      { tipo: "novo", area: "Perfil", texto: "O histórico de acesso mostra a saída e quanto tempo durou cada acesso (estimado pela última atividade quando a pessoa não saiu), e o tempo de uso dos últimos 30 dias.", link: "/painel/perfil?aba=acessos" },
      { tipo: "novo", area: "Usuários", texto: "Cada cópia de texto (com até 500 caracteres do que foi copiado), captura de tela pelo teclado e impressão fica registrada no usuário, com a tela e os documentos abertos — aba \"Cópias e prints\" do histórico.", link: "/painel/usuarios" },
      { tipo: "melhoria", area: "Configurações", texto: "Proteção de dados → \"Registrar cópias, capturas e impressões\" (ligado por padrão) e o Termo de uso passa a citar esses registros.", link: "/painel/configuracoes?aba=protecao" },
    ],
  },
  {
    versao: "1.200.2",
    data: "2026-10-23",
    titulo: "Vínculo com a Centi escolhido na própria célula",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Órgãos e Unidades",
        texto: "A coluna Empenhos (Centi) virou um seletor na célula: escolha ou troque o órgão gestor (órgãos) e a unidade orçamentária (unidades) sem abrir o banner; nas unidades aparece só a unidade orçamentária, sem repetir o órgão gestor.",
        link: "/painel/orgaos",
      },
    ],
  },
  {
    versao: "1.200.1",
    data: "2026-10-23",
    titulo: "Vínculo da API de empenhos indicado no cadastro",
    mudancas: [
      { tipo: "melhoria", area: "Órgãos e Unidades", texto: "Os campos “Órgão gestor na Centi” e “Unidade orçamentária na Centi” dizem que o vínculo é o da API de empenhos da Centi.", link: "/painel/orgaos" },
    ],
  },
  {
    versao: "1.200.0",
    data: "2026-10-23",
    titulo: "Órgãos e unidades sem correspondência na Centi",
    mudancas: [
      { tipo: "novo", area: "Órgãos e Unidades", texto: "Coluna “Empenhos (Centi)” na tabela de órgãos (o órgão gestor) e na de unidades (a unidade orçamentária): o que ainda não tem correspondência com a API de empenhos aparece em âmbar, “Sem correspondência” — filtre pela coluna para ver só esses.", link: "/painel/orgaos" },
    ],
  },
  {
    versao: "1.199.0",
    data: "2026-10-23",
    titulo: "Vínculo com a Centi no cadastro de Órgãos e Unidades",
    mudancas: [
      { tipo: "novo", area: "Órgãos e Unidades", texto: "No banner de cada UNIDADE, o campo “Unidade orçamentária na Centi” (a lista que a API da Centi traz): escolhida, os empenhos dela passam a ser da unidade. Cada unidade orçamentária vale para uma unidade só.", link: "/painel/orgaos" },
      { tipo: "novo", area: "Órgãos e Unidades", texto: "No banner de cada ÓRGÃO, o campo “Órgão gestor na Centi”: os empenhos desse órgão gestor que não estão numa unidade passam a ser do órgão. “Buscar na Centi” (no fim da lista) lê o ano só para trazer as unidades — nenhum empenho é gravado.", link: "/painel/orgaos" },
      { tipo: "melhoria", area: "Integrações", texto: "Saíram de Integrações a tabela “Unidades da Centi” e o “Puxar unidades”: o vínculo mora no cadastro. Os vínculos já feitos passaram para os órgãos e as unidades.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.198.0",
    data: "2026-10-23",
    titulo: "Empenhos: só as unidades vinculadas ao cadastro",
    mudancas: [
      { tipo: "novo", area: "Integrações", texto: "Unidades da Centi: cada Órgão gestor + Unidade orçamentária que a Centi devolve é VINCULADO a um órgão de Órgãos e Unidades (o órgão inteiro ou uma unidade dele). Só os empenhos de unidade vinculada são gravados — os outros são lidos e conferidos com a Centi, mas descartados. O mesmo vínculo vale para liquidações e pagamentos.", link: "/painel/integracoes?aba=centi" },
      { tipo: "novo", area: "Integrações", texto: "“Puxar unidades” lê o ano só para registrar as unidades da Centi, sem gravar nenhum empenho; “Vincular pela sigla” liga de uma vez as que têm a sigla de um órgão cadastrado.", link: "/painel/integracoes?aba=centi" },
      { tipo: "melhoria", area: "Empenhos", texto: "Banco limpo: os empenhos de unidade sem vínculo saíram; tirar o vínculo apaga os gravados daquela unidade (com confirmação), e excluir um órgão ou unidade do cadastro desfaz os vínculos dele. Cada pessoa vê os empenhos vinculados às suas unidades (o vinculado só ao órgão, às unidades daquele órgão).", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.197.1",
    data: "2026-10-23",
    titulo: "Aparelhos: todos nomeiam, inclusive o Administrador",
    mudancas: [
      { tipo: "correcao", area: "Termo de uso", texto: "O cadastro do aparelho aparece para todas as pessoas, inclusive o Administrador. \"Administrador fora do limite\" agora só tira o limite e a trava de troca do ADM.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.197.0",
    data: "2026-10-23",
    titulo: "Empenhos por órgão: cada grupo vê os seus",
    mudancas: [
      { tipo: "novo", area: "Empenhos", texto: "A tela Empenhos mostra só os empenhos dos órgãos da unidade escolhida no cabeçalho (na “Geral”, de todas as suas unidades). O “Órgão gestor” da Centi é a sigla do órgão cadastrado; o ADM vê todos.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Configurações", texto: "Empenhos entra no Filtro da unidade: desligado, a tela mostra os empenhos de todas as unidades da pessoa.", link: "/painel/configuracoes?aba=escopo" },
      { tipo: "melhoria", area: "Empenhos", texto: "O ADM é avisado na tela dos órgãos gestores da Centi sem órgão cadastrado de mesma sigla (os grupos não os veem até corrigir a sigla).", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.196.0",
    data: "2026-10-23",
    titulo: "Empenhos: atualização automática",
    mudancas: [
      { tipo: "novo", area: "Integrações", texto: "A API de Empenhos pode ser LIGADA no cadastro (desligada por padrão): no horário, nos dias e na frequência escolhidos, o sistema importa sozinho os anos mantidos, um por vez, com a mesma conferência da importação manual. Uma queda suspeita nunca passa sozinha — a importação fecha como parcial para você confirmar.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.195.2",
    data: "2026-10-23",
    titulo: "Termo: assinaturas com os dados atuais do cadastro",
    mudancas: [
      { tipo: "correcao", area: "Termo de uso", texto: "A tabela das assinaturas mostra o nome, a matrícula e a unidade ATUAIS de cada pessoa — mudou o cadastro, muda no termo. O comprovante assinado segue com os dados do momento do aceite.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.195.1",
    data: "2026-10-23",
    titulo: "Termo: aceite único e o nome atual do aparelho",
    mudancas: [
      { tipo: "correcao", area: "Termo de uso", texto: "Quem já aceitou a versão vigente (inclusive no cadastro) nunca é bloqueado de novo: aceitar outra vez vale o aceite que existe e tira a pendência.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Termo de uso", texto: "Os aceites mostram o nome ATUAL do aparelho (renomear acompanha) e o aceite do cadastro é ligado ao aparelho quando ele é nomeado.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Termo de uso", texto: "Tabela das assinaturas com no máximo duas linhas por pessoa: aparelho e IP encurtados (inteiros na dica) e a confirmação por extenso.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.195.0",
    data: "2026-10-23",
    titulo: "Empenhos vira uma tela do sistema",
    mudancas: [
      { tipo: "novo", area: "Empenhos", texto: "Empenhos saiu da Administração e virou uma tela comum: o ADM a põe num módulo (Configurações → Módulos) e libera aos grupos; o papel decide quem consulta e quem exporta.", link: "/painel/empenhos" },
      { tipo: "melhoria", area: "Empenhos", texto: "As edições salvas da tabela de empenhos continuam valendo; a importação segue em Integrações → APIs da Centi (só o ADM).", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.194.1",
    data: "2026-10-23",
    titulo: "Acesso às unidades por aba revisado",
    mudancas: [
      { tipo: "correcao", area: "Grupos", texto: "Telas que não seguem o filtro do cabeçalho passam a mostrar só as unidades que a pessoa acessa (antes mostravam todas).", link: "/painel/grupos" },
      { tipo: "correcao", area: "Verificação", texto: "A Verificação passa a seguir a própria configuração de acesso às unidades do grupo.", link: "/painel/verificacao" },
      { tipo: "melhoria", area: "Grupos", texto: "Documentos saiu do acesso por aba (não depende de unidade).", link: "/painel/grupos" },
    ],
  },
  {
    versao: "1.194.0",
    data: "2026-10-23",
    titulo: "Cadastro do aparelho controlado pelo ADM",
    mudancas: [
      { tipo: "melhoria", area: "Acesso", texto: "O nome do aparelho é obrigatório e conferido: 3 a 40 caracteres, com letras, sem repetições nem símbolos soltos.", link: "/painel/perfil?aba=seguranca" },
      { tipo: "novo", area: "Configurações", texto: "Na Adesão do Termo de uso: o nome e a data do cadastro de cada aparelho e \u201cNovo cadastro de aparelho\u201d para os marcados ou para todos.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Configurações", texto: "O banner da versão do termo separa Assinaturas, Pendentes e Emissões do PDF em abas.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.193.1",
    data: "2026-10-23",
    titulo: "Cabeçalho abre na Geral",
    mudancas: [
      { tipo: "correcao", area: "Cabeçalho", texto: "Quem acessa duas ou mais unidades passa a entrar na \"Geral\" (todas as suas unidades somadas), e não mais na unidade do cadastro.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.193.0",
    data: "2026-10-23",
    titulo: "Tela de Empenhos",
    mudancas: [
      { tipo: "novo", area: "Empenhos", texto: "Administração → Empenhos: os empenhos da Centi de cada ano numa tabela com filtros, edições salvas e XLSX/PDF; os totais do topo (empenhado, anulado, liquidado, pago, a pagar) acompanham os filtros.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Empenhos", texto: "Tocar num empenho abre o detalhe inteiro: valores, classificação da despesa, histórico e a importação que o gravou.", link: "/painel/empenhos" },
      { tipo: "novo", area: "Empenhos", texto: "“Removidos na Centi”, no rodapé da tabela, mostra os empenhos que a Centi não traz mais (guardados, fora das somas).", link: "/painel/empenhos" },
    ],
  },
  {
    versao: "1.192.0",
    data: "2026-10-23",
    titulo: "Adesão ao termo, assinaturas revogáveis e quem emitiu o PDF",
    mudancas: [
      { tipo: "novo", area: "Termo de uso", texto: "Painel de Adesão: quem aceitou a versão vigente, quem está pendente e quem não nomeou aparelho — exportável, com “Lembrar pendentes” (aviso no sino).", link: "/painel/configuracoes?aba=termo" },
      { tipo: "novo", area: "Termo de uso", texto: "Na versão aberta, marque assinaturas e exclua-as: saem do banco e o aceite é exigido de novo dessas pessoas.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "novo", area: "Termo de uso", texto: "Cada versão mostra quem emitiu (visualizou ou baixou) o PDF de cada comprovante, com data e IP.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Termo de uso", texto: "Em Pessoas escolhidas, acrescente todo um papel ou grupo de uma vez; a lista vazia não é salva, quem sai da lista deixa de dever e mudar a lista no Ativo pede confirmação.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Termo de uso", texto: "A seta “Ir ao fim do termo” pulsa de leve para ser vista (parada com reduzir movimento).", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.191.0",
    data: "2026-10-23",
    titulo: "Importação de empenhos mais segura",
    mudancas: [
      { tipo: "melhoria", area: "Integrações", texto: "A importação confere também a SOMA empenhada: nenhum valor negativo ou acima de R$ 1 bilhão, e uma queda grande em relação à última importação do ano pede a sua confirmação antes de gravar. A soma aparece em cada passo e no histórico.", link: "/painel/integracoes?aba=centi" },
      { tipo: "melhoria", area: "Integrações", texto: "Reimportar regrava só o que mudou — o resumo mostra quantos empenhos vieram iguais.", link: "/painel/integracoes?aba=centi" },
      { tipo: "melhoria", area: "Integrações", texto: "Cada importação guarda a versão do leitor; o sistema avisa os anos lidos por uma versão anterior para importar de novo.", link: "/painel/integracoes?aba=centi" },
      { tipo: "melhoria", area: "Integrações", texto: "Uma aba por vez conduz a importação (a outra aba vê que está em andamento) e cada resposta da Centi tem até 1 MB — leitura mais leve para o servidor.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.190.0",
    data: "2026-10-23",
    titulo: "Termo obrigatório para todos ou para pessoas escolhidas",
    mudancas: [
      { tipo: "novo", area: "Termo de uso", texto: "No modo Ativo, o ADM escolhe quem precisa aceitar o termo e nomear o aparelho: Todos (quem entrar depois também) ou Pessoas escolhidas. Quem já aceitou a versão vigente e já nomeou o aparelho não é travado.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Termo de uso", texto: "A confirmação de ativar conta só as pessoas que de fato passam a aceitar, e trocar a lista de escolhidas já cria as pendências de quem entrou nela.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.189.2",
    data: "2026-10-23",
    titulo: "Assinar o termo segue até abrir o sistema",
    mudancas: [{ tipo: "correcao", area: "Termo de uso", texto: "Com o “Termo de Uso aceito” desligado, o botão Assinar continua carregando até o sistema abrir — antes parava e o banner ficava na tela sem nada acontecer.", link: "/painel/configuracoes?aba=termo" }],
  },
  {
    versao: "1.189.1",
    data: "2026-10-23",
    titulo: "Opções do termo organizadas",
    mudancas: [{ tipo: "correcao", area: "Configurações", texto: "As chaves “Mostrar Termo de Uso aceito”, “Permitir baixar o comprovante” e “Administrador fora do limite” ficam numa grade com espaço entre elas (uma por linha no celular).", link: "/painel/configuracoes?aba=termo" }],
  },
  {
    versao: "1.189.0",
    data: "2026-10-23",
    titulo: "Verificação do comprovante: interna e pública melhorada",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Nova aba “Verificar comprovante”: pelo código, o registro COMPLETO da assinatura do Termo de Uso (nome, matrícula, cargo, unidade, e-mail, método, aparelho, IP), se o selo confere, o comprovante na tela e a conferência do arquivo PDF.", link: "/painel/configuracoes?aba=verificar-termo" },
      { tipo: "melhoria", area: "Termo de uso", texto: "A verificação pública ganhou a entrada para digitar o código e, com o código não encontrado, o campo para tentar de novo.", link: "/termo/verificar" },
    ],
  },
  {
    versao: "1.188.1",
    data: "2026-10-23",
    titulo: "Empenhos: valores abaixo de R$ 1.000 corrigidos — importe 2026 de novo",
    mudancas: [
      { tipo: "correcao", area: "Integrações", texto: "A auditoria com os 21.536 empenhos de 2026 achou um erro: a Centi manda os valores com três casas (“100,000” = R$ 100) e o leitor lia como cem mil. Corrigido e conferido campo a campo contra um segundo leitor — nenhuma diferença. Os empenhos importados com o erro foram apagados: importe 2026 de novo.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.188.0",
    data: "2026-10-23",
    titulo: "Termo de uso: tela de aceite e download opcionais",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Configurações → Termo de uso: desligar o banner “Termo de Uso aceito” (a pessoa segue direto ao sistema depois de assinar) e o download do comprovante (fica só a visualização na tela; o Administrador sempre baixa).", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Termo de uso", texto: "A seta “Ir ao fim do termo” não fica mais por cima da barra de rolagem.", link: "/painel/perfil?aba=seguranca" },
    ],
  },
  {
    versao: "1.187.2",
    data: "2026-10-23",
    titulo: "Exclusão das importações só com seleção",
    mudancas: [
      { tipo: "melhoria", area: "Integrações", texto: "Nos passos de uma importação, o botão de excluir só aparece (suavemente) com algo marcado: com parte dos passos, “Excluir selecionados”; com todos, “Excluir importação”.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.187.1",
    data: "2026-10-23",
    titulo: "Excluir várias importações e passos de uma vez; o Testar volta a funcionar",
    mudancas: [
      { tipo: "melhoria", area: "Integrações", texto: "Os passos e o histórico das importações da Centi têm a coluna de seleção: marque quantos quiser e use “Excluir selecionados” para tirá-los do banco. O passo lido que sai volta a faltar e é lido de novo ao continuar.", link: "/painel/integracoes?aba=centi" },
      { tipo: "correcao", area: "Integrações", texto: "O “Testar agora” não para mais em “grande demais”: ele lê a 1ª semana do ano (01/01 a 07/01) — janeiro inteiro passava de 8 MB — e entende a resposta real da Centi.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.187.0",
    data: "2026-10-23",
    titulo: "Comprovante do Termo de Uso com carimbo de assinatura e verificação do arquivo",
    mudancas: [
      { tipo: "novo", area: "Termo de Uso", texto: "O comprovante em PDF traz o carimbo da assinatura em todas as páginas e o painel de autenticidade na página final.", link: "/painel/perfil?aba=seguranca" },
      { tipo: "novo", area: "Termo de Uso", texto: "A verificação pública confere o próprio arquivo: qualquer alteração no PDF, inclusive por inteligência artificial, é detectada.", link: "/painel/perfil?aba=seguranca" },
      { tipo: "melhoria", area: "Termo de Uso", texto: "O comprovante é gerado pelo servidor, sempre igual a partir do registro guardado.", link: "/painel/perfil?aba=seguranca" },
    ],
  },
  {
    versao: "1.186.0",
    data: "2026-10-23",
    titulo: "Termo de Uso: cláusulas automáticas opcionais e rolagem suave",
    mudancas: [
      { tipo: "novo", area: "Termo de Uso", texto: "Cada cláusula gerada pelo sistema pode ser desligada; a escolha vale na próxima publicação.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Termo de Uso", texto: "A seta que leva ao fim do termo rola de forma suave, sem trancos, e some aos poucos.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.185.0",
    data: "2026-10-23",
    titulo: "Empenhos lidos de verdade e exclusão das tentativas",
    mudancas: [
      { tipo: "correcao", area: "Integrações", texto: "A importação dos empenhos lê a resposta real da Centi: ela vem com o JSON dentro de um texto e com aspas sem escape nos históricos (ex.: “BRASIL CUP CAPOEIRA”). A leitura conserta isso sem perder nada — janeiro de 2026 veio inteiro, 5.110 empenhos.", link: "/painel/integracoes?aba=centi" },
      { tipo: "melhoria", area: "Integrações", texto: "O ano é lido semana a semana (respostas de até 2 MB); o período maior é dividido ao meio e o passo aparece como “Dividida”, não como erro. Quando a resposta não traz registros, o passo diz o que veio.", link: "/painel/integracoes?aba=centi" },
      { tipo: "novo", area: "Integrações", texto: "Cada tentativa de importação pode ser excluída do banco (a lixeira no histórico ou “Excluir importação” nos passos), e cada passo com erro também. Os empenhos já gravados por uma importação concluída continuam.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.184.0",
    data: "2026-10-23",
    titulo: "Importação dos empenhos acompanhada ao vivo, mês a mês",
    mudancas: [
      { tipo: "correcao", area: "Integrações", texto: "A importação não para mais em “A API da Centi é grande demais”: o ano é lido mês a mês e o mês que vier grande demais é dividido ao meio, até um dia. A conferência soma o total que a Centi informa em cada período; o Testar lê janeiro.", link: "/painel/integracoes?aba=centi" },
      { tipo: "novo", area: "Integrações", texto: "Cada pedido à Centi aparece na hora em Passos — período, página, registros, novos, total do período, tamanho, tempo e o erro. Tocar num passo mostra o detalhe completo, inclusive o pedido enviado.", link: "/painel/integracoes?aba=centi" },
      { tipo: "novo", area: "Integrações", texto: "Toque numa importação do histórico para ver os passos dela; a importação parada mostra “Ver passos” e continua de onde parou.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.183.1",
    data: "2026-10-23",
    titulo: "Termo de Uso: leitura mais rápida e exclusão sem rastros",
    mudancas: [
      { tipo: "melhoria", area: "Termo de Uso", texto: "Ao chegar ao fim do texto, o “Li e concordo” já fica marcado; a seta preta no canto leva direto ao fim.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Termo de Uso", texto: "Excluir uma versão usada só em teste apaga também as menções a ela no histórico, inclusive nos cadastros feitos no teste.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.183.0",
    data: "2026-10-23",
    titulo: "Termo de Uso: excluir a versão usada só em teste",
    mudancas: [
      { tipo: "novo", area: "Termo de Uso", texto: "A versão aceita só em teste pode ser excluída: saem os aceites de teste (e os comprovantes), as pendências de todas as pessoas e o histórico da versão, num passo só. A versão com aceite real continua protegida.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.182.0",
    data: "2026-10-23",
    titulo: "Importação manual dos empenhos, conferida com a Centi",
    mudancas: [
      { tipo: "novo", area: "Integrações", texto: "Em APIs da Centi → Empenhos, a seção Importar lê os empenhos do ano página a página e só os grava quando a contagem confere com o total que a própria Centi informa. Faltou registro, a Centi falhou ou a importação foi interrompida: nada muda nos empenhos gravados.", link: "/painel/integracoes?aba=centi" },
      { tipo: "melhoria", area: "Integrações", texto: "O editor das APIs ficou proporcional: todos os campos com o mesmo tamanho, os órgãos e as unidades no dropdown padrão do sistema (com busca, marcar todos e limpar) e os botões Testar e Importar no título de cada seção.", link: "/painel/integracoes?aba=centi" },
      { tipo: "novo", area: "Integrações", texto: "Histórico das importações com a situação (Importado, Parcial, Falhou, Cancelado), a conferência (quantos de quantos) e o resultado (novos, atualizados e removidos). O que some da Centi é marcado como removido — nada é apagado.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.181.0",
    data: "2026-10-23",
    titulo: "Editor de texto: fontes e colagem sem negrito indevido",
    mudancas: [
      { tipo: "novo", area: "Editor de texto", texto: "Escolha a fonte de cada parágrafo (padrão do sistema, serifada de documento ou de máquina de escrever); a fonte do texto colado do Word/Docs é reconhecida.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Editor de texto", texto: "Colar texto não deixa mais tudo em negrito: os estilos que o navegador injetava saem, e o documento todo em negrito volta ao normal (os títulos são reconhecidos).", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Termo de Uso", texto: "O termo lido pelas pessoas e a prévia ficam idênticos ao que o ADM editou — mesmos títulos, tamanhos, alinhamentos e fontes.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.180.0",
    data: "2026-10-23",
    titulo: "APIs da Centi: edição direta, órgãos do cadastro e teste",
    mudancas: [
      { tipo: "novo", area: "Integrações", texto: "Testar a API: o botão faz um pedido de verdade à Centi com o que está na tela (mesmo sem salvar) e mostra a resposta, o tempo, quantos registros vieram, o total que a API informa e uma amostra dos dados. Nada é gravado.", link: "/painel/integracoes?aba=centi" },
      { tipo: "melhoria", area: "Integrações", texto: "Os órgãos e as unidades de cada API são escolhidos do cadastro do sistema (Órgãos e Unidades); nas APIs pedidas por órgão, o pedido usa o ID da entidade na Centi de cada órgão.", link: "/painel/integracoes?aba=centi" },
      { tipo: "melhoria", area: "Integrações", texto: "O cadastro da API é editado direto, em seções (O que ler · Quando atualizar · Endereço e parâmetros · Testar), com o (?) explicando cada campo.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.179.3",
    data: "2026-10-23",
    titulo: "Termo de Uso aceito: Continuar a qualquer momento",
    mudancas: [
      { tipo: "correcao", area: "Termo de Uso", texto: "Clicar em “Continuar” antes do fim da contagem abre o sistema na hora — o banner não fica mais preso; se a tela não atualizar, a página recarrega sozinha.", link: "/painel" },
      { tipo: "melhoria", area: "Termo de Uso", texto: "A barra da contagem do aceite avança de forma contínua e suave.", link: "/painel" },
    ],
  },
  {
    versao: "1.179.2",
    data: "2026-10-23",
    titulo: "Editor de texto: colagem e alinhamento em listas",
    mudancas: [
      { tipo: "melhoria", area: "Colagem", texto: "Linhas quebradas no meio da frase (texto colado com formatação) voltam a ser um parágrafo.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Editor de texto", texto: "O botão de alinhamento mostra o alinhamento certo também dentro de listas.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Editor de texto", texto: "O menu de alinhamento tem a largura dos próprios botões, sem espaço sobrando.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.179.1",
    data: "2026-10-23",
    titulo: "APIs da Centi no padrão dos cadastros",
    mudancas: [
      { tipo: "melhoria", area: "Integrações", texto: "O cadastro de cada API da Centi abre no banner padrão dos cadastros (cadeado em cada campo, salva só o que mudou e pede confirmação ao fechar com alteração), a tabela ganhou XLSX/PDF e a ajuda (?) no rodapé, e a aba só é carregada quando aberta.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.179.0",
    data: "2026-10-23",
    titulo: "Integrações: cadastro das APIs da Centi",
    mudancas: [
      { tipo: "novo", area: "Integrações", texto: "Nova aba \"APIs da Centi\" com o cadastro das APIs públicas do portal de transparência (empenhos, liquidações, pagamentos, contratos e receita): endereço, parâmetros, se o ano é pedido inteiro, por órgão ou por fonte, a frequência e a prévia do pedido. É só o cadastro — nada é buscado na Centi; cada API fica \"Em preparação\" até a importação dela chegar, começando pelos empenhos.", link: "/painel/integracoes?aba=centi" },
    ],
  },
  {
    versao: "1.178.1",
    data: "2026-10-23",
    titulo: "Auditoria do editor de texto e da colagem",
    mudancas: [
      { tipo: "correcao", area: "Editor de texto", texto: "“Limpar formatação” também tira o alinhamento; marcas de alinhamento repetidas não se acumulam.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Editor de texto", texto: "Lista colada só fica alinhada quando todos os itens têm o mesmo alinhamento.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Colagem", texto: "Texto colado do Google Docs não vira todo negrito, e o título em negrito do Word/Docs (“1. Objeto”) é reconhecido como título.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Chat", texto: "Colar no chat não cria títulos nem alinhamentos na mensagem.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.178.0",
    data: "2026-10-23",
    titulo: "Alinhamento no editor e texto colado organizado",
    mudancas: [
      { tipo: "novo", area: "Editor de texto", texto: "O editor de texto do sistema ganhou o alinhamento do parágrafo (esquerda, centro, direita, justificado — também por Ctrl+Shift+L/E/R/J). Vale em todo lugar que usa o editor e aparece igual na leitura e nos e-mails.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Editor de texto", texto: "Ao colar um texto, o sistema o organiza: refaz os parágrafos quebrados, transforma os títulos de seção (\"1. Objeto e aceitação\") em títulos, mantém os números dos itens (\"1.1.\", \"I.\", \"a)\") e preserva o alinhamento vindo do outro programa.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.177.0",
    data: "2026-10-23",
    titulo: "Excluir versões do Termo de Uso",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "O administrador pode descartar o rascunho e excluir uma versão publicada que ninguém aceitou (as pendências saem junto). A versão já aceita fica para sempre: os aceites são a prova das assinaturas.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.176.0",
    data: "2026-10-23",
    titulo: "Termo de Uso identificado pela versão e pela data",
    mudancas: [
      { tipo: "melhoria", area: "Configurações", texto: "O Termo de Uso não tem mais título próprio: cada termo é identificado pela versão e pela data e hora da publicação, no editor, nas versões, no aceite, no cadastro e no comprovante em PDF.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.175.0",
    data: "2026-10-23",
    titulo: "Termo de uso e aparelho: entrada mais rápida e aceite que fecha sozinho",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "O administrador escolhe em quanto tempo o aviso \"Termo de Uso aceito\" fecha sozinho (ou se não fecha); a contagem aparece no botão Continuar e pausa enquanto o comprovante é gerado.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Acesso", texto: "Depois de confirmar o aparelho, o Termo de Uso aparece na hora, sem recarregar; a entrada com pendência carrega menos coisas e fica mais rápida.", link: "/painel" },
      { tipo: "correcao", area: "Acesso", texto: "Se a confirmação do aparelho ou o termo não carregarem, aparece um aviso com \"Tentar de novo\" e \"Sair\" — nunca mais uma tela em branco.", link: "/painel" },
      { tipo: "melhoria", area: "Acesso", texto: "Enter confirma o aparelho e assina o termo; os botões não ficam presos carregando nem disparam duas vezes.", link: "/painel" },
    ],
  },
  {
    versao: "1.174.1",
    data: "2026-10-23",
    titulo: "Seleções de aparelhos e termo no tamanho padrão",
    mudancas: [
      { tipo: "correcao", area: "Configurações", texto: "As seleções de limite de aparelhos, prazo de troca, limite por papel e tempo de sessão ficaram no tamanho padrão dos controles, com o rótulo dentro da caixa.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Usuários", texto: "No banner do usuário, o \"Limite desta pessoa\" fica alinhado e na mesma altura do botão de troca.", link: "/painel/usuarios" },
    ],
  },
  {
    versao: "1.174.0",
    data: "2026-10-23",
    titulo: "Termo de uso e aparelhos sem brechas",
    mudancas: [
      { tipo: "correcao", area: "Acesso", texto: "A conta criada, aprovada, reativada ou restaurada depois da publicação também precisa aceitar o Termo de Uso para entrar.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "correcao", area: "Acesso", texto: "Quem está com o termo ou o aparelho pendente não vê a prévia do PCA, os dados da conta, os cartões de PCA nem os avisos do sino antes de concluir.", link: "/painel" },
      { tipo: "melhoria", area: "Acesso", texto: "O aparelho só é reconhecido no navegador em que foi registrado: a identificação copiada para outro navegador pede um aparelho novo e avisa os administradores.", link: "/painel/perfil?aba=seguranca" },
      { tipo: "novo", area: "Configurações", texto: "Ensaio com o sistema ativo: os testadores podem ser escolhidos também no modo Ativo, e \"Só os testadores\" exige a versão nova primeiro só deles.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.173.0",
    data: "2026-10-23",
    titulo: "Restaurar da lixeira da Mesa",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "Restaurar na lixeira da Mesa: o protocolo volta com os DFDs que saíram junto (o esvaziado, com o DFD que o esvaziou) e o mesmo número e histórico; o DFD excluído antes fica na lixeira e pode voltar sozinho depois.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "A restauração nunca cria número repetido nem protocolo vazio: o DFD/item volta ao protocolo/DFD que existe (mesmo, reimportado pelo Id da capa ou pelo nº) e, no PCA incorporado, com o mesmo nº do item.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.172.0",
    data: "2026-10-23",
    titulo: "Termo de Uso obrigatório para entrar no sistema",
    mudancas: [
      { tipo: "melhoria", area: "Acesso", texto: "O aceite do Termo de Uso passou a ser obrigatório como o registro do aparelho: com uma versão pendente, o sistema só abre depois do aceite — sem prazo de carência nem “Ler depois”, também para o Administrador.", link: "/painel/configuracoes?aba=termo" },
    ],
  },
  {
    versao: "1.171.1",
    data: "2026-10-23",
    titulo: "Chat: prévia e resposta sem a marcação do texto",
    mudancas: [
      { tipo: "correcao", area: "Chat", texto: "A prévia da última mensagem na lista de conversas e o trecho citado ao responder aparecem em texto simples, sem os símbolos da formatação (asteriscos, colchetes do link).", link: "/painel" },
    ],
  },
  {
    versao: "1.171.0",
    data: "2026-10-23",
    titulo: "O editor de texto também no calendário, no comunicado, nas automações e na tela de acesso",
    mudancas: [
      { tipo: "melhoria", area: "Calendário", texto: "A descrição do evento é escrita no editor do sistema (negrito, listas, links) e aparece formatada no banner do evento; o arquivo .ics leva o texto sem a marcação.", link: "/painel/calendario" },
      { tipo: "melhoria", area: "Notificações", texto: "O comunicado do administrador é escrito no editor: vai formatado no e-mail e, no sino, em até quatro linhas sem a formatação.", link: "/painel/configuracoes?aba=notificacoes" },
      { tipo: "melhoria", area: "Automação", texto: "A ajuda de cada automação (como funciona, como executa e o resultado) é escrita no editor e aparece formatada no (?).", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Configurações", texto: "A descrição da vitrine e o aviso da tela de acesso são escritos no editor e aparecem formatados no login.", link: "/painel/configuracoes?aba=acesso" },
    ],
  },
  {
    versao: "1.170.0",
    data: "2026-10-23",
    titulo: "Chat com o mesmo editor de texto",
    mudancas: [
      { tipo: "melhoria", area: "Chat", texto: "O campo de mensagem do chat agora é o mesmo editor do sistema: o botão “Aa” mostra a formatação (negrito, itálico, listas, link…); Enter envia e Shift+Enter quebra a linha.", link: "/painel" },
      { tipo: "melhoria", area: "Chat", texto: "Digitar “@” sugere as pessoas da conversa logo acima do campo; ↑/↓ e Enter escolhem.", link: "/painel" },
    ],
  },
  {
    versao: "1.169.0",
    data: "2026-10-23",
    titulo: "O mesmo editor de texto em todo o sistema",
    mudancas: [
      { tipo: "melhoria", area: "Tarefas", texto: "A descrição e as notas das tarefas agora são escritas como se veem, no mesmo editor do Termo de Uso: títulos, negrito, itálico, listas, citação, links, desfazer e refazer.", link: "/painel/tarefas" },
      { tipo: "melhoria", area: "Tarefas", texto: "Os comentários também usam o mesmo editor, com a @menção das pessoas do grupo dentro dele (↑/↓ e Enter escolhem) e Ctrl+Enter para enviar.", link: "/painel/tarefas" },
      { tipo: "melhoria", area: "Configurações", texto: "O editor ganhou a versão compacta para campos, usada nas tarefas; o texto gravado continua o mesmo.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Tarefas", texto: "No celular e no tablet, a barra do editor fica numa linha só: as ferramentas mais usadas primeiro (negrito, itálico, listas, link), arraste de lado ou toque nas setas para ver as demais, e Desfazer e Refazer ficam fixos à direita.", link: "/painel/tarefas" },
    ],
  },
  {
    versao: "1.168.0",
    data: "2026-10-22",
    titulo: "Termo e aparelho em banners flutuantes, aparelho no Online e editor de texto visual",
    mudancas: [
      { tipo: "melhoria", area: "Acesso", texto: "O aceite do Termo de Uso e o cadastro do aparelho agora são banners flutuantes por cima do sistema (sem telas separadas); no prazo de aceite, o aviso no topo abre o banner.", link: "/painel" },
      { tipo: "novo", area: "Configurações", texto: "O texto do Termo de Uso é escrito como se vê, num editor de documentos: estilos de parágrafo, títulos, negrito, itálico, listas, citação, links, desfazer e refazer.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Usuários", texto: "Aparelhos da conta em cartões, com o limite e de onde ele vem, a troca liberada ou bloqueada até a data e o prazo após uma troca.", link: "/painel/usuarios" },
      { tipo: "novo", area: "Presença", texto: "O Online agora mostra em qual aparelho cada pessoa está usando o sistema.", link: "/painel" },
      { tipo: "correcao", area: "Configurações", texto: "Os seletores de limite por papel e de prazo do Termo de uso não cortam mais o texto.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "melhoria", area: "Acesso", texto: "Avisos e presença em tempo real também exigem o aparelho nomeado e o termo em dia.", link: "/painel" },
    ],
  },
  {
    versao: "1.167.0",
    data: "2026-10-22",
    titulo: "Termo de Uso assinado e aparelhos vinculados à conta (com fase de teste)",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Aba Termo de uso: o ADM escreve o termo (com modelo pronto), vê a prévia com as cláusulas automáticas (aparelhos, sessão, registros, proteção, LGPD), publica versões escolhendo quem precisa aceitar e o prazo, e acompanha quem aceitou.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "novo", area: "Configurações", texto: "Implantação em três fases — Desligado, Teste (só os testadores escolhidos, com a opção de repetir a cada login) e Ativo (toda a plataforma).", link: "/painel/configuracoes?aba=termo" },
      { tipo: "novo", area: "Configurações", texto: "Aparelhos por conta: limite padrão, por papel e por pessoa, e o prazo sem nova troca; o ADM libera a troca no banner do usuário.", link: "/painel/configuracoes?aba=termo" },
      { tipo: "novo", area: "Perfil", texto: "Meus aparelhos e termos: renomear e retirar aparelhos e baixar o comprovante assinado de cada termo aceito.", link: "/painel/perfil?aba=seguranca" },
      { tipo: "novo", area: "Usuários", texto: "Banner do usuário com os aparelhos (retirar, limite próprio, liberar troca) e os termos aceitos.", link: "/painel/usuarios" },
    ],
  },
  {
    versao: "1.166.2",
    data: "2026-10-22",
    titulo: "Nada fica vazio: limpeza dos protocolos sem DFDs e a regra do mover",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Os protocolos que tinham ficado sem DFDs foram excluídos e estão na lixeira da Mesa (motivo \"Ficou vazio\").", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "Mover o último DFD de um protocolo para outro (à mão ou pela importação) exclui o protocolo de origem que ficou vazio — com aviso antes e depois.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.166.1",
    data: "2026-10-22",
    titulo: "Correção: o protocolo sem DFDs passa a ser excluído",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "Excluir o último DFD de um protocolo (ou remover o último item do último DFD) agora exclui também o protocolo — a conferência de DFDs restantes contava errado.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "A exclusão do DFD avisa antes e depois quando o protocolo sai junto.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.166.0",
    data: "2026-10-22",
    titulo: "Lixeira da Mesa: limpeza, abrangência e exclusão do que fica vazio",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "A lixeira mostra se o DFD ou item foi excluído avulso, com o DFD inteiro ou com o protocolo inteiro.", link: "/painel/mesa" },
      { tipo: "novo", area: "Mesa", texto: "Limpar a lixeira inteira ou só os protocolos, DFDs e itens selecionados — apaga de vez do banco.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "Excluir o último DFD de um protocolo exclui o protocolo; remover o último item de um DFD exclui o DFD (com confirmação; vão à lixeira como “Ficou vazio”).", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.165.1",
    data: "2026-10-22",
    titulo: "Automação: a pesquisa da Tela Protocolo passa a ser aprendida",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A extensão (1.27.0) reconhece a pesquisa da Tela Protocolo (PO011), que a Centi faz por um pedido que a trava de leitura recusava — por isso o “ainda não foi aprendida” continuava mesmo depois de pesquisar.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "O diagnóstico aponta também a lista que chegou por um pedido não aceito como consulta.", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.165.0",
    data: "2026-10-22",
    titulo: "Lixeira da Mesa completa, com os banners originais",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "Os excluídos abrem nos mesmos banners da Mesa: protocolo (com os DFDs excluídos junto, que abrem ao toque), DFD (com os itens ao lado) e item.", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "O registro guarda e mostra tudo: CPF/CNPJ, órgão, situação, responsável, envio e incorporação ao PCA, arquivo de origem, quem e quando importou e a conferência com a Centi.", link: "/painel/mesa" },
      { tipo: "novo", area: "Mesa", texto: "Itens que saem ao sobrescrever ou reenviar um DFD também vão para a lixeira.", link: "/painel/mesa?vista=itens" },
      { tipo: "melhoria", area: "Mesa", texto: "O (?) da lixeira explica os registros “Completo” e “Sem retrato” (excluídos antes de a lixeira existir) e cada motivo.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.164.1",
    data: "2026-10-22",
    titulo: "Automação: Tela Protocolo aprendida com mais facilidade",
    mudancas: [
      { tipo: "correcao", area: "Automação", texto: "A extensão (1.26.0) passa a aprender a consulta da Tela Protocolo em qualquer pesquisa da PO011 — antes só valia se a lista tivesse algum protocolo “Em análise”.", link: "/painel/automacao" },
      { tipo: "melhoria", area: "Automação", texto: "Quando a consulta ainda não foi aprendida, o erro diz exatamente o que fazer e quais listas a extensão viu sem reconhecer (só os nomes das colunas).", link: "/painel/automacao" },
    ],
  },
  {
    versao: "1.164.0",
    data: "2026-10-22",
    titulo: "Acréscimo e supressão de itens no histórico",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "O histórico do item, do DFD e do protocolo marca cada alteração de item como Inclusão, Acréscimo, Supressão ou Exclusão, com a diferença de quantidade e de valor.", link: "/painel/mesa?vista=itens" },
      { tipo: "melhoria", area: "Mesa", texto: "Cada evento do histórico com itens alterados resume quantos foram incluídos, acrescidos, suprimidos e excluídos, com os valores somados.", link: "/painel/mesa?vista=dfds" },
    ],
  },
  {
    versao: "1.163.0",
    data: "2026-10-22",
    titulo: "Excluídos antigos na lixeira da Mesa",
    mudancas: [
      { tipo: "melhoria", area: "Mesa", texto: "A lixeira da Mesa também mostra os protocolos, DFDs e itens excluídos antes dela existir, lidos do histórico de alterações, na Mesa em que estavam (a do sistema ou a do PCA). Eles aparecem com o selo \"Sem retrato\" e trazem só o que o histórico registrou.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.162.0",
    data: "2026-10-22",
    titulo: "Excluídos da Mesa",
    mudancas: [
      { tipo: "novo", area: "Mesa", texto: "O botão da lixeira na barra da Mesa do sistema e da Mesa do PCA mostra os protocolos, DFDs e itens excluídos, com quem excluiu, quando e o motivo. Tocar numa linha mostra o que era (só leitura).", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Mesa", texto: "Toda exclusão — protocolo (com os DFDs), DFD, item removido em massa ou na edição, DFD fora do reenvio — passa a guardar o retrato completo por 180 dias.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.161.3",
    data: "2026-10-22",
    titulo: "Filtro da Mesa do PCA acompanha o cabeçalho",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Trocar a unidade do cabeçalho refaz o filtro de unidade da Mesa do PCA.", link: "/painel/pca" },
      { tipo: "correcao", area: "Grupos", texto: "Trocar os módulos do grupo também poda o acesso por aba das telas que saíram; o histórico diz acesso por aba.", link: "/painel/grupos" },
    ],
  },
  {
    versao: "1.161.2",
    data: "2026-10-22",
    titulo: "Mesa do PCA abre na unidade do cabeçalho",
    mudancas: [
      {
        tipo: "melhoria",
        area: "PCA",
        texto:
          "Ao entrar na Mesa do PCA, a coluna Unidade já vem filtrada pela unidade do cabeçalho (na Geral, as unidades do grupo) — também com a aba em \"Todas\"; o filtro pode ser trocado na própria tabela.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.161.1",
    data: "2026-10-22",
    titulo: "Aba em Todas sem mudar o cabeçalho + banner do grupo organizado",
    mudancas: [
      {
        tipo: "correcao",
        area: "Grupos",
        texto:
          "A aba em \"Todas\" (ex.: a Mesa do PCA) mostra os dados de todas as unidades sem mexer no seletor de unidade do cabeçalho, que segue com as unidades do grupo; a coluna Unidade fica à vista para filtrar na própria tabela.",
        link: "/painel/grupos",
      },
      {
        tipo: "melhoria",
        area: "Grupos",
        texto: "O banner de editar grupo foi organizado em blocos: identificação · módulos · pessoas · unidades · acesso por aba · PCAs e orçamentos.",
        link: "/painel/grupos",
      },
    ],
  },
  {
    versao: "1.161.0",
    data: "2026-10-22",
    titulo: "Acesso às unidades por aba",
    mudancas: [
      {
        tipo: "novo",
        area: "Grupos",
        texto:
          "\"Acesso de cada tela\" e \"Fonte dos dados\" viraram UMA configuração, aba a aba: Da pessoa (as unidades dela), Soma (a soma travada) ou Todas. Ex.: a Mesa do PCA com todas as unidades e o Dashboard e o Orçamento só na unidade da pessoa. Vale nos dois modos de unidades.",
        link: "/painel/grupos",
      },
      {
        tipo: "melhoria",
        area: "Cabeçalho",
        texto: "Na aba em Soma, o seletor de unidade fica travado (\"Minhas unidades\"); nas abas com Todas, ele mostra todas as unidades só ali.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.160.1",
    data: "2026-10-22",
    titulo: "Mesa do PCA pelo grupo, sem a Mesa do sistema",
    mudancas: [
      {
        tipo: "correcao",
        area: "Grupos",
        texto:
          "A Mesa do PCA segue a tela PCA do grupo: \"Acesso de cada tela → PCA: Todas as unidades\" libera todos os protocolos, DFDs e itens da Mesa do PCA, que abre filtrada pela unidade da pessoa — sem precisar da Mesa do sistema (só do Administrador) e sem liberar Orçamento.",
        link: "/painel/grupos",
      },
      {
        tipo: "correcao",
        area: "Pesquisa",
        texto: "A pesquisa e os vínculos de tarefa acham os protocolos e DFDs da Mesa do PCA pelo mesmo acesso.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.160.0",
    data: "2026-10-22",
    titulo: "Mesa do PCA com todas as unidades, já filtrada na sua",
    mudancas: [
      {
        tipo: "melhoria",
        area: "PCA",
        texto: "A aba Mesa do PCA segue o acesso da tela Mesa do grupo (com \"Todas as unidades\" em Grupos → Acesso de cada tela, vê protocolos, DFDs e itens de todas) e o seletor de unidade do cabeçalho. Sem unidade escolhida, o sistema abre na unidade do seu cadastro — troque para \"Geral\" para ver tudo.",
        link: "/painel/pca",
      },
      {
        tipo: "melhoria",
        area: "Pesquisa",
        texto: "A pesquisa acha os ajustes de acesso: \"acesso de cada tela\", \"todas as unidades\", \"fonte dos dados\", \"PCAs do grupo\" (Grupos), \"componentes\"/\"ocultar abas\" (Papéis), \"Filtro da unidade\" e \"Tela pública\" (Configurações).",
        link: "/painel/grupos",
      },
    ],
  },
  {
    versao: "1.159.2",
    data: "2026-10-22",
    titulo: "Menu recolhido estável com as contas abertas",
    mudancas: [
      {
        tipo: "correcao",
        area: "Conta",
        texto: "Com o menu recolhido, abrir as contas pelo cartão do usuário deixava o menu abrindo e fechando (a sombra e o cursor piscavam). Agora o menu fica aberto enquanto a lista de contas está aberta.",
        link: "/painel/perfil",
      },
    ],
  },
  {
    versao: "1.159.1",
    data: "2026-10-22",
    titulo: "Contas do navegador mais compactas",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Conta",
        texto: "O menu das contas ficou mais enxuto: espaçamentos uniformes, as outras contas com foto menor e o papel, e “Sair” e “Sair de todas” lado a lado numa linha. Entrar com outra conta pela tela de login também limpa do aparelho os dados da conta anterior e avisa as outras abas.",
        link: "/painel/perfil",
      },
    ],
  },
  {
    versao: "1.159.0",
    data: "2026-10-22",
    titulo: "Várias contas no mesmo navegador",
    mudancas: [
      {
        tipo: "novo",
        area: "Conta",
        texto: "Tocar no seu nome no rodapé do menu abre as contas deste navegador: troque de conta com um toque, adicione outra, saia desta (a próxima conta segue entrada) ou de todas. Ao trocar, a tela recarrega inteira e os dados da conta anterior saem do aparelho.",
        link: "/painel/perfil",
      },
    ],
  },
  {
    versao: "1.158.7",
    data: "2026-10-22",
    titulo: "Revisão da troca de visão do orçamento",
    mudancas: [
      {
        tipo: "correcao",
        area: "PCA",
        texto: "Na KPI de Dotação o nome da visão fica numa linha só (o inteiro na dica) — o tamanho não muda; o aviso da engrenagem e o editor seguem a visão PADRÃO do PCA; uma visão excluída volta ao orçamento inteiro; sem orçamento do ano o seletor fica travado.",
        link: "/painel/pca?aba=orcamento",
      },
    ],
  },
  {
    versao: "1.158.6",
    data: "2026-10-22",
    titulo: "Troca de visão fluida",
    mudancas: [
      {
        tipo: "melhoria",
        area: "Orçamento",
        texto: "Trocar a visão no Comparativo (tela do orçamento e do PCA) e no PCA × Orçamento responde na hora e a tabela recalcula em seguida, só no navegador — nada é gravado nem pedido ao servidor.",
        link: "/painel/orcamento",
      },
    ],
  },
  {
    versao: "1.158.5",
    data: "2026-10-22",
    titulo: "Aba Orçamento do PCA sem estourar o servidor",
    mudancas: [
      {
        tipo: "correcao",
        area: "PCA",
        texto: "A aba Orçamento do PCA dava o erro 1102 da Cloudflare (limite de processamento). Os lançamentos do orçamento ficam prontos na memória do servidor e não trafegam mais duas vezes: a tela monta as linhas com os dados que já recebeu.",
        link: "/painel/pca?aba=orcamento",
      },
    ],
  },
  {
    versao: "1.158.4",
    data: "2026-10-22",
    titulo: "Orçamento do PCA mais leve no servidor",
    mudancas: [
      {
        tipo: "correcao",
        area: "PCA",
        texto: "A aba Orçamento do PCA sempre abre pela visão padrão já pronta no servidor; a troca de visão acontece só no navegador. Evita o erro do servidor ao abrir um endereço com a visão.",
        link: "/painel/pca?aba=orcamento",
      },
    ],
  },
  {
    versao: "1.158.3",
    data: "2026-10-22",
    titulo: "Visão do orçamento instantânea e KPIs fixas",
    mudancas: [
      {
        tipo: "melhoria",
        area: "PCA",
        texto: "Trocar a visão no PCA × Orçamento e no Comparativo é um filtro instantâneo: recalcula com os dados já carregados, sem ir ao servidor e sem gravar nada. As duas ficam na mesma visão.",
        link: "/painel/pca?aba=orcamento",
      },
      {
        tipo: "correcao",
        area: "PCA",
        texto: "As KPIs do Orçamento do PCA não mudam mais de tamanho ao trocar a visão.",
        link: "/painel/pca?aba=orcamento",
      },
    ],
  },
  {
    versao: "1.158.2",
    data: "2026-10-22",
    titulo: "Visão do PCA × Orçamento só para quem vê",
    mudancas: [
      {
        tipo: "correcao",
        area: "PCA",
        texto: "Trocar a visão na barra do Orçamento do PCA virou um filtro da sua tela: não grava no PCA, não muda a visão padrão nem afeta os outros usuários. A visão padrão segue pela engrenagem.",
        link: "/painel/pca?aba=orcamento",
      },
    ],
  },
  {
    versao: "1.158.1",
    data: "2026-10-22",
    titulo: "Cartões de PCA com marcação estável e sombra suave",
    mudancas: [
      { tipo: "correcao", area: "Cabeçalho", texto: "A marcação do PCA escolhido acompanha o cartão ao passar o mouse, e os cartões ganharam uma sombra suave.", link: "/" },
    ],
  },
  {
    versao: "1.158.0",
    data: "2026-10-22",
    titulo: "Seletor de PCA em cartões também no sistema",
    mudancas: [
      { tipo: "novo", area: "Cabeçalho", texto: "O PCA do cabeçalho do sistema é escolhido pelos mesmos cartões da página pública, com o cartão \"Todos os PCAs\".", link: "/painel/mesa" },
      { tipo: "melhoria", area: "Página pública", texto: "O painel dos PCAs tem a largura dos cartões, com espaçamento padrão, e os cartões mantêm a proporção 4:5.", link: "/" },
      { tipo: "novo", area: "Configurações", texto: "Tela pública: opção de mostrar os cartões dos PCAs só com a imagem de fundo.", link: "/painel/configuracoes?aba=publico" },
    ],
  },
  {
    versao: "1.157.1",
    data: "2026-10-22",
    titulo: "Ajustes no seletor de PCA e nas telas de acesso",
    mudancas: [
      { tipo: "correcao", area: "Página pública", texto: "Os cartões do seletor de PCA abrem num painel largo, sem rolagem lateral; no celular, com o fundo escurecido.", link: "/" },
      { tipo: "melhoria", area: "Acesso", texto: "A logo da tela de nova senha também leva à página pública.", link: "/login" },
    ],
  },
  {
    versao: "1.157.0",
    data: "2026-10-22",
    titulo: "PCA em cartões na página pública e marca única",
    mudancas: [
      { tipo: "melhoria", area: "Página pública", texto: "O filtro da coluna Unidade da consulta de itens mostra a sigla e o nome, como no sistema.", link: "/?aba=consulta" },
      { tipo: "novo", area: "Página pública", texto: "O PCA é escolhido à esquerda do cabeçalho, com os cartões de cada PCA publicado.", link: "/" },
      { tipo: "melhoria", area: "Acesso", texto: "A logo com o nome no login e no cadastro leva à página pública — a mesma marca dos cabeçalhos.", link: "/login" },
    ],
  },
  {
    versao: "1.156.1",
    data: "2026-10-22",
    titulo: "Logo inteira no menu recolhido",
    mudancas: [{ tipo: "correcao", area: "Menu", texto: "Com o menu recolhido, a logo volta a aparecer inteira e centrada.", link: "/painel" }],
  },
  {
    versao: "1.156.0",
    data: "2026-10-22",
    titulo: "A marca também transita",
    mudancas: [
      { tipo: "melhoria", area: "Menu", texto: "Tocar na marca do sistema (logo e nome) abre a página pública, com o realce ao passar o mouse.", link: "/" },
      { tipo: "melhoria", area: "Página pública", texto: "Logado, a marca leva às Configurações (ADM) ou ao sistema.", link: "/painel/configuracoes" },
    ],
  },
  {
    versao: "1.155.2",
    data: "2026-10-22",
    titulo: "Página pública: menu e consulta",
    mudancas: [
      { tipo: "correcao", area: "Página pública", texto: "O menu começa recolhido sempre que o ADM assim configurou, também ao chegar pelo botão \"Site\" ou trocando de aba.", link: "/" },
      { tipo: "melhoria", area: "Página pública", texto: "A Consulta de itens ocupa a tela até o rodapé, com a tabela rolando por dentro.", link: "/?aba=consulta" },
    ],
  },
  {
    versao: "1.155.1",
    data: "2026-10-22",
    titulo: "Atalhos no fim do cabeçalho",
    mudancas: [
      { tipo: "melhoria", area: "Cabeçalho", texto: "O atalho para a página pública virou o botão \"Site\", o último do canto superior direito.", link: "/" },
      { tipo: "melhoria", area: "Página pública", texto: "Logado, o último botão do cabeçalho diz \"Configurar\" (ADM) ou \"Sistema\".", link: "/painel/configuracoes" },
    ],
  },
  {
    versao: "1.155.0",
    data: "2026-10-22",
    titulo: "Atalhos entre o sistema e a página pública",
    mudancas: [
      { tipo: "novo", area: "Cabeçalho", texto: "Botão no cabeçalho que abre a página pública.", link: "/" },
      { tipo: "novo", area: "Página pública", texto: "Logado, o cabeçalho da página pública ganha o botão de voltar ao sistema: as Configurações para o ADM, o painel para os demais.", link: "/painel/configuracoes" },
    ],
  },
  {
    versao: "1.154.2",
    data: "2026-10-22",
    titulo: "Medida também nos detalhes do item",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "O detalhe do item, a edição em massa, as comparações, os relatórios e as mensagens do catálogo chamam a unidade de medida de Medida.", link: "/painel/mesa?vista=itens" },
    ],
  },
  {
    versao: "1.154.1",
    data: "2026-10-22",
    titulo: "Só \"Medida\", no singular",
    mudancas: [
      { tipo: "correcao", area: "Catálogo", texto: "A visão, o card e o gráfico usam só o nome Medida.", link: "/painel/catalogo" },
    ],
  },
  {
    versao: "1.154.0",
    data: "2026-10-22",
    titulo: "Unidade de medida agora se chama Medida",
    mudancas: [
      { tipo: "melhoria", area: "Dashboard do PCA", texto: "O filtro e o gráfico de unidade de medida passam a se chamar Medida.", link: "/painel/pca" },
      { tipo: "melhoria", area: "Mesa", texto: "Nas tabelas de itens, a coluna da unidade de medida chama-se Medida (e Medida cadastrada).", link: "/painel/mesa?vista=itens" },
      { tipo: "melhoria", area: "Catálogo", texto: "A visão Unidades de medida passa a se chamar Medidas.", link: "/painel/catalogo" },
    ],
  },
  {
    versao: "1.153.1",
    data: "2026-10-22",
    titulo: "Filtros de unidade no mesmo padrão",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "Os filtros de unidade do Dashboard do PCA e da tela pública mostram a sigla e o nome embaixo, como os demais filtros de unidade do sistema.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.153.0",
    data: "2026-10-22",
    titulo: "Tela pública: seletor de unidade padrão e consulta só com a tabela",
    mudancas: [
      { tipo: "correcao", area: "Tela pública", texto: "Com o menu recolhido, a linha abaixo do cabeçalho sumiu.", link: "/" },
      { tipo: "melhoria", area: "Tela pública", texto: "O filtro de unidade do cabeçalho é o mesmo seletor do sistema (sigla e nome, com busca) — e saiu o filtro Unidade repetido abaixo dos indicadores.", link: "/" },
      { tipo: "melhoria", area: "Tela pública", texto: "A Consulta de itens mostra só a tabela, com os filtros dela.", link: "/?aba=consulta" },
      { tipo: "novo", area: "Configurações", texto: "Tela pública: escolha se o menu lateral começa aberto ou recolhido.", link: "/painel/configuracoes?aba=publico" },
    ],
  },
  {
    versao: "1.152.0",
    data: "2026-10-21",
    titulo: "Tela pública: filtros no cabeçalho e consulta no menu",
    mudancas: [
      { tipo: "melhoria", area: "Tela pública", texto: "O PCA e a unidade ficam no cabeçalho — os indicadores começam logo abaixo dele.", link: "/" },
      { tipo: "novo", area: "Tela pública", texto: "A consulta de itens ganhou um item próprio no menu lateral; o Dashboard abre só com os gráficos.", link: "/?aba=consulta" },
      { tipo: "correcao", area: "Tela pública", texto: "O cabeçalho é o mesmo do painel: a linha abaixo dele alinha com a do menu e o Entrar fica discreto até o toque.", link: "/" },
    ],
  },
  {
    versao: "1.151.1",
    data: "2026-10-21",
    titulo: "Documentos: selo do PCA no canto da capa",
    mudancas: [
      { tipo: "melhoria", area: "Documentos", texto: "O selo do PCA vinculado ficou menor, no canto superior esquerdo da capa.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.151.0",
    data: "2026-10-21",
    titulo: "Tela pública com menu lateral e abas publicadas pelo ADM",
    mudancas: [
      { tipo: "novo", area: "Tela pública", texto: "A consulta sem login ganhou o menu lateral do sistema (recolhível; gaveta no celular) com o Entrar fixo no rodapé.", link: "/" },
      { tipo: "novo", area: "Configurações", texto: "Aba Tela pública: o ADM escolhe quais abas do PCA são públicas — Dashboard, Orçamento e Documentos.", link: "/painel/configuracoes?aba=publico" },
      { tipo: "melhoria", area: "Segurança", texto: "Orçamento e documentos públicos só do PCA publicado e da aba liberada — conferidos no servidor; o resto não sai.", link: "/" },
    ],
  },
  {
    versao: "1.150.4",
    data: "2026-10-21",
    titulo: "Filtros só com ícone abrem a lista do sistema",
    mudancas: [
      { tipo: "melhoria", area: "Documentos", texto: "O filtro de PCA usa o filtro padrão (o funil) e abre a lista do sistema.", link: "/painel/documentos" },
      { tipo: "melhoria", area: "Mesa", texto: "Os filtros só com ícone (Assunto) abrem a lista do sistema, com a escolhida marcada.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.150.3",
    data: "2026-10-21",
    titulo: "Documentos: vínculo no selo do orçamento",
    mudancas: [
      { tipo: "melhoria", area: "Documentos", texto: "O PCA vinculado aparece no cartão com o mesmo selo do ano usado nos cartões de orçamento.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.150.2",
    data: "2026-10-21",
    titulo: "Documentos: vínculo no cartão e filtro de PCA compacto",
    mudancas: [
      { tipo: "melhoria", area: "Documentos", texto: "O cartão mostra a que PCAs o documento está vinculado.", link: "/painel/documentos" },
      { tipo: "melhoria", area: "Documentos", texto: "O filtro de PCA virou um ícone e só oferece os PCAs que têm documentos, com a contagem.", link: "/painel/documentos" },
    ],
  },
  {
    versao: "1.150.1",
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
