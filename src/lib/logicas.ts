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
      ".xlsx: tabela lida por coluna da matriz (mais determinístico).",
      ".pdf: tabela remontada por posição de coluna, rejuntando o código quebrado em 2 linhas.",
    ],
    fonte: "parse-dfd / parse-dfd-pdf / parse-dfd-comum",
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
    titulo: "Auto-match da repartição pela sigla do Setor",
    descricao:
      "Ao importar, o DFD é vinculado a uma repartição automaticamente pela sigla do Setor Requisitante (com fallback pelo nome da secretaria, para siglas divergentes). O usuário confirma ou corrige no banner.",
    fonte: "reparticao-match",
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
    titulo: "Os dados da capa são IMUTÁVEIS",
    descricao:
      "Os dados da capa do protocolo (Id, número, interessado, documento, valor da capa, assunto, local) não podem ser editados em nenhum momento. No preview e no gravado ficam só-leitura. Só a repartição (roteamento, não é dado da capa) permanece editável.",
    fonte: "editarProtocoloSchema",
  },
  {
    id: "proto-capa-valor",
    dominio: "protocolo",
    titulo: "Conciliação do valor da capa × somatória dos DFDs",
    descricao:
      "O valor da capa é conciliado uma única vez, na importação. Não protocola com o valor da capa zerado/nulo OU diferente da somatória dos valores dos DFDs (tolerância de 1 centavo) — o usuário substitui a capa pela somatória (um clique) para liberar. No protocolo já gravado a divergência é só apontada (capa imutável).",
    fonte: "valoresBatem / ProtocoloUploadForm",
    configuravelEm: { rotulo: "Avaliação (protocolo.valorCapa)" },
  },
  {
    id: "proto-sem-erro",
    dominio: "protocolo",
    titulo: "Não protocola com DFD defeituoso",
    descricao:
      "O botão 'Protocolar' fica desabilitado enquanto algum DFD estiver com erro (ou ainda em análise). O relatório de devolução sai em formato de DESPACHO, pronto para devolver o processo para correção.",
    fonte: "ProtocoloUploadForm / linhasRelatorioProtocolo",
    configuravelEm: { rotulo: "Avaliação (protocolo.semDfdEmErro)" },
  },
  {
    id: "proto-vias",
    dominio: "protocolo",
    titulo: "Separação das vias (protocolo × DFD avulso)",
    descricao:
      "O sistema classifica o PDF: um protocolo (com capa OU 2+ 'Número DFD') não entra pela aba DFDs, e um DFD avulso não entra pela aba Protocolos. Documento estranho é recusado.",
    fonte: "classificarPdf (parse-protocolo-pdf-core)",
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
      "A avaliação é fonte única: o navegador trava o botão e o servidor reconfere no envio (rejeita por garantia). Com os níveis no padrão de fábrica, o comportamento é idêntico ao histórico do sistema.",
    fonte: "faltasObrigatorias → avaliarDfd; POST /api/dfd, /api/protocolo",
  },

  // ---- Estados & Situações (narrativo; enums vêm DERIVADOS) ----
  {
    id: "est-precedencia",
    dominio: "estados",
    titulo: "Precedência do estado do DFD",
    descricao:
      "O estado de um DFD segue a ordem: erro › atenção › editado › regularizado (automático) › regular. A atenção (âmbar) sinaliza sem bloquear (ex.: DFD-R sem referência de renovação).",
    fonte: "estadoDfd (dfd-tratamento)",
  },
  {
    id: "est-item",
    dominio: "estados",
    titulo: "Estado por item da tabela",
    descricao:
      "Cada item da Seção 4 marca 'Com erro' (vermelho) quando falta valor unitário ou quantidade. Os itens com pendência aparecem numa tabela separada, acima dos regulares.",
    fonte: "estadoItem / faltasDoItem",
  },
  {
    id: "est-protocolo",
    dominio: "estados",
    titulo: "Estado × Situação do protocolo",
    descricao:
      "No protocolo gravado, ESTADO = integridade do valor da capa × somatória dos DFDs (regular/atenção); SITUAÇÃO = tem DFDs ou não (vazio/com DFDs).",
    fonte: "estadoProtocolo / situacaoProtocolo",
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
      "Um usuário pertence a vários grupos e escolhe o grupo ativo no cabeçalho. Cada grupo tem 1 permissão (quais abas de módulo vê) e acessa um conjunto de repartições.",
    fonte: "grupos / permissoes",
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
