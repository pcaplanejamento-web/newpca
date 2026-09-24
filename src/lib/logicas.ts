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
    titulo: "Não protocola com DFD defeituoso",
    descricao:
      "O botão 'Protocolar' fica desabilitado enquanto algum DFD estiver com erro (ou ainda em análise). Se o ADM permitir protocolar assim, uma confirmação lista ANTES os DFDs que não serão protocolados. O relatório de devolução sai em formato de DESPACHO, pronto para devolver o processo para correção.",
    fonte: "ProtocoloUploadForm / linhasRelatorioProtocolo",
    configuravelEm: { rotulo: "Avaliação (protocolo.semDfdEmErro)" },
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
      "O responsável de um protocolo é escolhido SÓ entre as pessoas ativas do GRUPO ATIVO de quem está na Mesa (sem grupo, todas as pessoas ativas) — na célula, na edição em massa e no responsável padrão do Perfil; o servidor recusa outra pessoa. Um responsável já gravado que hoje é de outro grupo continua aparecendo, mas não pode ser re-escolhido. As colunas Responsável e Distribuição mostram a FOTO e o APELIDO (nome completo no passar do mouse).",
    fonte: "listarPessoasDoGrupo / pessoaDoGrupo (usuarios) + PessoaTag",
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
    ],
    fonte: "sobrescrita-dfd / useSobrescrita / POST /api/dfd",
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
      "Acima de Protocolos · DFDs · Itens, dois seletores filtram as TRÊS visões pelo responsável e pelo assunto do protocolo (o DFD e o item herdam os do protocolo de origem). Enquanto ativos, travam as colunas correspondentes da tabela de protocolos — a hierarquia manda.",
    fonte: "passaFiltroMesa (mesa-filtros)",
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
      "Ao conferir, a PRIORIDADE é reduzida a ALTA/MÉDIA/BAIXA e a PREVISÃO DE ENTREGA vira uma DATA (MÊS/AAAA) OU recorrente (ANUAL, com ou sem ano). O que não dá para padronizar fica para tratar à mão.",
    fonte: "normPrioridade / normPrevisao (normalize)",
  },
  {
    id: "norm-valor",
    dominio: "normalizacao",
    titulo: "Valor do DFD = somatória dos itens",
    descricao:
      "O valor de cada item é quantidade × valor unitário (arredondado a 2 casas); o valor do DFD é a soma dos itens. Números em pt-BR e datas são normalizados na importação da planilha PCA.",
    fonte: "parse-dfd-core / normalize",
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
    titulo: "Responsáveis por DFDs: padrões e temporários",
    descricao:
      "Cada repartição tem N responsáveis padrões e N temporários. No período de um temporário, ele é o efetivo (os padrões ficam em cinza); fora do período, volta aos padrões — com estados Agendado/Vigente/Encerrado. Cada responsável tem nome, matrícula, função e uma nomeação (ato + número + link).",
    fonte: "ResponsaveisEditor / reparticao-responsaveis",
    configuravelEm: { rotulo: "Unidades", href: "/painel/orgaos" },
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
      "O ano do PCA é adivinhado pela descrição e confirmado no seletor. Não se protocola nem se importa DFD avulso sem o PCA definido (nível padrão). No protocolo, todos os DFDs herdam o ano do PCA do processo.",
    fonte: "anoPcaDoTexto / PcaPicker",
    configuravelEm: { rotulo: "Avaliação (dfd.anoPca / protocolo.anoPca)" },
  },

  // ---- Acesso & RBAC ----
  {
    id: "rbac-grupo",
    dominio: "acesso",
    titulo: "Grupo ativo define as abas e as repartições",
    descricao:
      "Um usuário pertence a vários grupos e escolhe o grupo ativo no cabeçalho. Cada grupo tem 1 permissão (quais módulos vê: Mesa, PCA, Catálogo, Orçamento — a mesma lista na barra lateral e na barra inferior do celular) e acessa um conjunto de repartições. Ao entrar no painel, o sistema abre a Mesa — onde ficam os protocolos, os DFDs e os itens — ou o 1º módulo liberado; sem nenhum, o Perfil. Permissões antigas que citavam telas removidas (o Dashboard e os Protocolos legados) seguem valendo sem essas telas.",
    fonte: "grupos / permissoes / abas (abasConhecidas, rotaInicial)",
    configuravelEm: { rotulo: "Grupos", href: "/painel/grupos" },
  },
  {
    id: "rbac-admin",
    dominio: "acesso",
    titulo: "Admin sempre vê TODAS as abas/telas",
    descricao:
      "Regra firme: o administrador nunca é bloqueado por nível de acesso — vê todas as abas e telas, ignorando as permissões de grupo. O primeiro usuário cadastrado vira admin/ativo.",
    fonte: "api-auth / grupos",
  },
  {
    id: "rbac-reparticao",
    dominio: "acesso",
    titulo: "A repartição ativa escopa os dados",
    descricao:
      "A repartição ativa do cabeçalho filtra protocolos e PCA. Em 'Geral' (sem repartição) mostra tudo. Toda ESCRITA de DFD/protocolo é escopada por repartição (403 fora do escopo), com anti-sequestro por número.",
    fonte: "getReparticaoContexto / getReparticaoFiltro",
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
      "No Perfil, cada pessoa cadastra um APELIDO (até 40 caracteres) — o nome de exibição no sistema: cabeçalho, colunas Responsável/Distribuição e seletores (a lista mostra 'apelido — nome completo'). Sem apelido, vale o nome. A foto é servida com cache e só é baixada de novo quando o perfil muda.",
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
    id: "tec-sessao",
    dominio: "tecnico",
    titulo: "Sessão, senha e criptografia",
    descricao:
      "A senha usa PBKDF2-SHA256 com 100.000 iterações (teto do Cloudflare Workers) e exige ao menos 8 caracteres. O D1 guarda só o hash do token de sessão; o cookie é httpOnly+Secure.",
    fonte: "password / auth",
    tecnico: true,
  },
];
