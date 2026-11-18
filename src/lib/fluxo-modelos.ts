import type { AjudaFluxo, Frequencia, Grafo } from "./fluxo-core";

const n = (id: string, tipo: string, x: number, y: number, config: Record<string, unknown> = {}) => ({ id, tipo, x, y, config });
const c = (de: string, para: string, saida = "saida", entrada = "entrada") => ({ de, saida, para, entrada });

/** Fluxos PRONTOS para começar (o "Novo fluxo"). Cada um é só um grafo — editável depois. */
export type ModeloFluxo = {
  id: string;
  nome: string;
  descricao: string;
  /** O (?) da automação: como funciona, como executa e o resultado. */
  ajuda: AjudaFluxo;
  grafo: Grafo;
  frequencia?: Frequencia;
  ativo?: boolean;
  /** Os modelos usados DENTRO deste (nó "Executar fluxo" com `fluxoModelo`) — criados antes, se ainda não existem. */
  dependencias?: string[];
  /** Só existe como etapa de outro modelo (`dependencias`): fora do "Novo fluxo"; o fluxo salvo fica escondido na lista. */
  interno?: boolean;
};

export const MODELOS_FLUXO: ModeloFluxo[] = [
  {
    id: "dfds-protocolo",
    nome: "Baixar/anexar DFDs · por protocolo",
    descricao:
      "Os protocolos do sistema numa tabela de seleção → cada DFD dos marcados é emitido na Centi (entidade do órgão, conferido) e vai à pasta, ao protocolo da Centi indicado ou ao de cada DFD.",
    ajuda: {
      funciona: "Lista os protocolos já gravados no sistema numa tabela. Os DFDs de cada protocolo marcado são emitidos na Centi, um a um, na entidade do órgão de cada DFD.",
      executa: "Execute com a extensão da Centi pronta: marque os protocolos e toque em Executar. Cada PDF é conferido (planejamento e nº do DFD) antes de contar como salvo. Destino e formato ficam nos Ajustes da Automação.",
      resultado: "Os PDFs dos DFDs na pasta escolhida (ou em Downloads) ou anexados ao protocolo da Centi, com o estado de cada um: Salvo, Falhou ou Sem planejamento.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("prot1", "sistema.protocolos", 280, 160),
        n("sel1", "entrada.selecionar", 576, 160, { chave: "id", semMarcar: "nenhum" }),
        n("dfds1", "saida.dfdsCenti", 880, 160),
      ],
      conexoes: [c("inicio1", "prot1"), c("prot1", "sel1"), c("sel1", "dfds1")],
    },
  },
  {
    id: "dfds-ids",
    nome: "Baixar/anexar DFDs · por nºs de planejamento",
    descricao: "Os nºs de planejamento digitados (separados por “:”) → cada DFD é emitido na Centi e vai à pasta ou ao protocolo da Centi.",
    ajuda: {
      funciona: "Recebe os nºs de planejamento digitados e emite cada DFD na Centi pela mesma operação do “Emitir DFD”.",
      executa: "Digite os nºs separados por “:” (ex.: 1525:1549) e toque em Executar, com a extensão da Centi pronta.",
      resultado: "Os PDFs dos DFDs na pasta ou no protocolo da Centi indicado, com o estado de cada nº.",
    },
    grafo: {
      v: 1,
      nos: [n("inicio1", "gatilho.inicio", 0, 160), n("ids1", "entrada.ids", 280, 160), n("dfds1", "saida.dfdsCenti", 576, 160)],
      conexoes: [c("inicio1", "ids1"), c("ids1", "dfds1")],
    },
  },
  {
    id: "dfds-dfd",
    nome: "Baixar DFDs · por DFD",
    descricao: "Os DFDs do sistema numa tabela de seleção (ou os escolhidos na Mesa) → cada DFD marcado é emitido na Centi e vai à pasta ou ao protocolo da Centi.",
    ajuda: {
      funciona: "Lista todos os DFDs gravados no sistema. Você marca DFD a DFD quais baixar; pela Mesa, os DFDs selecionados lá já entram.",
      executa: "Marque os DFDs e toque em Executar, com a extensão da Centi pronta. O andamento fica minimizado no canto da tela; toque nele para ver DFD a DFD.",
      resultado: "O PDF de cada DFD na pasta escolhida (ou em Downloads) ou anexado ao protocolo da Centi, com o estado de cada um: Salvo, Falhou ou Sem planejamento.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("ler1", "sistema.ler", 280, 160, { objeto: "dfds", buscaDfds: "tabela", entrega: "lista" }),
        n("sel1", "entrada.selecionar", 576, 160, { chave: "id", semMarcar: "nenhum" }),
        n("dfds1", "saida.dfdsCenti", 880, 160),
      ],
      conexoes: [c("inicio1", "ler1"), c("ler1", "sel1"), c("sel1", "dfds1")],
    },
  },
  {
    id: "tela-protocolo",
    nome: "Ler a Tela Protocolo",
    descricao:
      "Os protocolos “Em análise” das repartições escolhidas (pela API) numa tabela de seleção → cada marcado é emitido e lido (capa e DFDs); tocar num lido abre a análise completa da importação.",
    ajuda: {
      funciona: "Busca, pela API da Centi, os protocolos “Em análise” das repartições escolhidas e os mostra numa tabela de seleção.",
      executa: "Escolha as repartições, execute e marque os protocolos. Cada marcado é emitido e lido no navegador (capa e DFDs).",
      resultado: "A lista de protocolos com o estado da leitura (Lido, Atenção, Falhou); tocar num lido abre a análise completa da importação.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("prot1", "centi.protocolos", 280, 160, { situacao: "", reparticao: "" }),
        n("sel1", "entrada.selecionar", 576, 160, { chave: "protocolo", semMarcar: "nenhum" }),
        n("laco1", "logica.laco", 880, 160, { tamanho: 1 }),
        n("ler1", "leitura.protocolo", 1184, 64, { limite: 500 }),
        n("err1", "erros.apontar", 1488, 64, { todos: true, mensagem: "{{no}}: {{erro}}" }),
      ],
      conexoes: [c("inicio1", "prot1"), c("prot1", "sel1"), c("sel1", "laco1"), c("laco1", "ler1", "lote"), c("ler1", "laco1", "saida", "volta"), c("ler1", "err1", "erro")],
    },
  },
  {
    id: "inclusao-pca",
    nome: "Inclusão PCA — conferir na CM002 e protocolar",
    descricao:
      "A cada 2 h: protocolos Em análise da repartição escolhida → pula os já cadastrados → lê cada um (só os de INCLUSÃO) → busca cada DFD na Centi por API (planejamento + Emitir DFD) e compara nº, tipo, objeto, valor, itens e situação → importa na Mesa com os apontamentos e avisa no sino.",
    frequencia: { tipo: "intervalo", minutos: 120 },
    ativo: true,
    ajuda: {
      funciona: "Confere os protocolos de INCLUSÃO no PCA contra a Centi: cada DFD é buscado pelo nº de planejamento e comparado (nº, tipo, objeto, valor, itens e situação).",
      executa: "Roda sozinho a cada 2 horas (com a tela da Automação aberta e a extensão pronta) ou ao tocar em Executar. Pula os protocolos já cadastrados.",
      resultado: "Os protocolos importados na Mesa com os apontamentos na observação, o relatório por protocolo e o aviso no sino de quem executou.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 192),
        n("prot1", "centi.protocolos", 280, 96, { situacao: "", reparticao: "PCA - COORDENADOR (JHONE)" }),
        n("novos1", "sistema.naoCadastrados", 576, 96),
        n("laco1", "logica.laco", 880, 96, { tamanho: 1 }),
        n("ler1", "leitura.protocolo", 880, -32, { limite: 200 }),
        n("seLer", "logica.se", 1184, -32, { campo: "leitura", operador: "igual", valor: "falha" }),
        n("errLer", "erros.apontar", 1488, -96, { todos: true, mensagem: "Protocolo {{protocolo}}/{{ano}}: {{leituraTexto}}" }),
        n("inc1", "dados.filtrar", 880, 224, { campo: "assunto", operador: "contem", valor: "INCLUS" }),
        n("des1", "dados.desdobrar", 1184, 224, { campo: "dfds" }),
        n("busca1", "leitura.dfdCenti", 1488, 224, { limite: 2000 }),
        n("conf1", "dados.compararDfdCenti", 1488, 448, { tolerancia: 0.01, objeto: true }),
        n("err1", "erros.apontar", 1792, 320, { todos: true, mensagem: "{{mensagem}}", nivel: "erro" }),
        n("imp1", "saida.importarProtocolo", 2096, 192, { limite: 200 }),
      ],
      conexoes: [
        c("inicio1", "prot1"),
        c("prot1", "novos1"),
        c("novos1", "laco1", "novos"),
        c("laco1", "ler1", "lote"),
        c("ler1", "laco1", "saida", "volta"),
        c("laco1", "seLer", "fim"),
        c("seLer", "errLer", "verdadeiro"),
        c("laco1", "inc1", "fim"),
        c("inc1", "des1"),
        c("inc1", "imp1"),
        c("des1", "busca1"),
        c("busca1", "conf1"),
        c("conf1", "err1", "divergentes"),
        c("err1", "imp1", "saida", "apontamentos"),
      ],
    },
  },
  {
    id: "conferir-corrigir-1-dfd",
    nome: "Verificar 1 DFD na Centi",
    interno: true,
    descricao:
      "A etapa de UM DFD do “Verificar DFDs na Centi”: lê o planejamento na Centi uma vez e faz as verificações escolhidas — a situação, o centro de custo (e a unidade) e o conteúdo (com a correção dos divergentes).",
    ajuda: {
      funciona:
        "Lê o planejamento do DFD na Centi UMA vez (o PDF só quando o conteúdo é verificado) e passa pelas verificações escolhidas, em sequência: 1) Situação — grava a situação da Centi na coluna Situação da Mesa (ou “Não encontrado na Centi”); 2) Centro de custo — grava o texto completo da Centi na coluna Centro de Custo e confere a unidade (com “Trocar a unidade divergente”, passa o DFD para a unidade da Centi); 3) Conteúdo — compara TODAS as informações com o gravado, marca a coluna Centi e, com “Corrigir os divergentes”, troca só o que diverge.",
      executa: "Roda dentro do “Verificar DFDs na Centi”, um DFD por vez — não precisa ser executada sozinha.",
      resultado:
        "UM resultado por DFD com as três verificações. O que não pôde ser lido na Centi ou corrigido faz esta etapa falhar com o motivo — a automação principal registra e a próxima execução tenta de novo.",
    },
    // Sem a escolha no item (`verificar` — quem roda a etapa sozinha, sem o "O que verificar"): só o CONTEÚDO, como sempre
    // foi (a correção segue a regra do "Corrigir pela Centi"); situação e centro de custo só quando pedidos.
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 240),
        n("dfd1", "sistema.completarDfd", 280, 240, {}),
        n("err2", "erros.apontar", 280, 448, { todos: true, mensagem: "{{motivo}}", nivel: "erro" }),
        n("busca1", "leitura.dfdCenti", 576, 240, { limite: 1, falhaErro: true, exigirOrgao: true, dfdInteiro: true }),
        n("seSit", "logica.se", 872, 240, { campo: "verificar.situacao", operador: "igual", valor: "sim" }),
        n("sit1", "saida.gravarExecucao", 1168, 112, { naoEncontrado: "Não encontrado na Centi" }),
        n("seCc", "logica.se", 1464, 240, { campo: "verificar.centro", operador: "igual", valor: "sim" }),
        n("cc1", "dados.conferirUnidade", 1760, 112),
        n("cc2", "saida.gravarCentroCusto", 2056, 112, { campoCentro: "centroCustoCenti", campoId: "id" }),
        n("apU", "erros.apontar", 2352, 288, { todos: false, campo: "unidadeConfere", operador: "igual", valor: "desconhecida", mensagem: "{{mensagemUnidade}} — cadastre a unidade (Órgãos e Unidades) ou o centro de custo dela", nivel: "erro" }),
        n("seT", "logica.se", 2352, 112, { campo: "verificar.trocarUnidade", operador: "igual", valor: "sim" }),
        n("apD", "erros.apontar", 2648, 288, { todos: false, campo: "unidadeConfere", operador: "igual", valor: "nao", mensagem: "{{mensagemUnidade}}", nivel: "atencao" }),
        n("apE", "erros.apontar", 3240, 0, { todos: true, mensagem: "{{mensagemUnidade}} — a unidade não foi trocada: {{motivoTroca}}", nivel: "erro" }),
        n("seD", "logica.se", 2648, 16, { campo: "unidadeConfere", operador: "igual", valor: "nao" }),
        n("troca1", "saida.trocarUnidade", 2944, 0, { campoUnidade: "unidadeCentiId", campoId: "id" }),
        n("seCont", "logica.se", 3240, 240, { campo: "verificar.conteudo", operador: "diferente", valor: "nao" }),
        n("cmp1", "dados.compararDfdCenti", 3536, 112, { tolerancia: 0.01, objeto: true }),
        n("marcar1", "saida.marcarConferencia", 3832, 288),
        n("seCorr", "logica.se", 3832, 48, { campo: "verificar.corrigir", operador: "diferente", valor: "nao" }),
        n("corr1", "saida.corrigirPelaCenti", 4128, 48, { falhar: true }),
        n("ret1", "saida.retornar", 4424, 240, {}),
      ],
      conexoes: [
        c("inicio1", "dfd1"),
        c("dfd1", "busca1"),
        c("dfd1", "err2", "naoEncontrados"),
        c("busca1", "seSit"),
        c("seSit", "sit1", "verdadeiro"),
        c("seSit", "seCc", "falso"),
        c("sit1", "seCc"),
        c("seCc", "cc1", "verdadeiro"),
        c("seCc", "seCont", "falso"),
        c("cc1", "cc2", "todos"),
        c("cc2", "seT"),
        c("cc2", "apU"),
        c("seT", "apD", "falso"),
        c("troca1", "apE", "erros"),
        c("seT", "seD", "verdadeiro"),
        c("seT", "seCont", "falso"),
        c("seD", "troca1", "verdadeiro"),
        c("seD", "seCont", "falso"),
        c("troca1", "seCont", "alterados"),
        c("troca1", "seCont", "erros"),
        c("seCont", "cmp1", "verdadeiro"),
        c("seCont", "ret1", "falso"),
        c("cmp1", "marcar1", "divergentes", "divergentes"),
        c("cmp1", "marcar1", "conformes", "conformes"),
        c("cmp1", "ret1", "conformes"),
        c("cmp1", "seCorr", "divergentes"),
        c("seCorr", "corr1", "verdadeiro"),
        c("seCorr", "ret1", "falso"),
        c("marcar1", "corr1", "saida", "depois"),
        c("corr1", "ret1", "corrigidos"),
        c("corr1", "ret1", "convergentes"),
        c("corr1", "ret1", "semMudanca"),
      ],
    },
  },
  {
    id: "analisados",
    nome: "Ler protocolos analisados",
    descricao: "Repartições automáticas → protocolos “Analisado” delas → lê cada PDF (laço até o fim) e aponta os que falharam.",
    ajuda: {
      funciona: "Pega as repartições automaticamente e os protocolos “Analisado” delas na Centi.",
      executa: "Execute com a extensão pronta: cada protocolo é emitido e lido, um a um, em laço até o fim.",
      resultado: "A leitura de cada protocolo e os apontamentos dos que falharam.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("rep1", "centi.reparticoes", 280, 160, { filtro: "PCA" }),
        n("prot1", "centi.protocolos", 576, 160, { situacao: "ANALISADO", campoReparticao: "reparticao" }),
        n("laco1", "logica.laco", 880, 160, { tamanho: 1 }),
        n("ler1", "leitura.protocolo", 1184, 32, { limite: 50 }),
        n("se1", "logica.se", 1184, 288, { campo: "leitura", operador: "igual", valor: "falha" }),
        n("err1", "erros.apontar", 1488, 224, { todos: true, mensagem: "Protocolo {{protocolo}}/{{ano}}: {{leituraTexto}}" }),
        n("err2", "erros.apontar", 1784, 32, { todos: true, mensagem: "{{no}}: {{erro}}" }),
      ],
      conexoes: [
        c("inicio1", "rep1"),
        c("rep1", "prot1"),
        c("prot1", "laco1"),
        c("laco1", "ler1", "lote"),
        c("ler1", "laco1", "saida", "volta"),
        c("ler1", "err2", "erro"),
        c("laco1", "se1", "fim"),
        c("se1", "err1", "verdadeiro"),
      ],
    },
  },
  {
    id: "conferir-corrigir-centi",
    nome: "Verificar DFDs na Centi",
    descricao:
      "Verifica cada DFD do sistema na Centi — escolha o que: o conteúdo (corrige os divergentes), a situação (execução) e o centro de custo com a unidade; ou tudo de uma vez. Se parar, continua de onde parou.",
    dependencias: ["conferir-corrigir-1-dfd"],
    ajuda: {
      funciona:
        "1) “Quais” escolhe os DFDs. Em “Os filtrados na tabela” (o padrão) seguem os que passam nos filtros da tabela da aba “DFDs”: filtre qualquer coluna ou escreva em “Nº de planejamento” um ou vários números separados por “:”; sem filtro, todos. Os filtros valem também na execução agendada (são reaplicados aos DFDs de agora). 2) “O que verificar na Centi” — marque uma ou mais (todas = tudo de uma vez): CONTEÚDO (compara cabeçalho, seções e cada item; marca a coluna Centi; com “Corrigir os divergentes”, troca só o que diverge — nº do DFD, planejamento, assinaturas, unidade, protocolo e PCA ficam os do sistema; “Pela conferência gravada” escolhe só os divergentes ou também os não conferidos); SITUAÇÃO (a situação do planejamento na coluna Situação da Mesa); CENTRO DE CUSTO (o texto completo da Centi na coluna Centro de Custo e a unidade conferida — com “Trocar a unidade divergente”, o DFD passa para a unidade da Centi). “Listar planejamentos da Centi sem DFD no sistema” lê a CM002 dos órgãos e salva a tabela “CM002 sem DFD no sistema”. 3) Cada DFD é lido na Centi UMA vez (um por vez — a sessão da Centi é uma só); o PDF só quando o conteúdo é verificado.",
      executa:
        "Com a extensão da Centi pronta: escolha os DFDs e o que verificar e execute. Interrompida, a próxima execução continua dos que faltam com as mesmas escolhas; terminada, a próxima recomeça (“Recomeçar do zero” na Análise recomeça antes). Na Mesa, o selo da coluna Centi usa esta automação para “Reconferir” e “Corrigir” (só o conteúdo).",
      resultado:
        "As colunas Centi, Situação e Centro de Custo da Mesa atualizadas; os DFDs corrigidos e as unidades trocadas, com o histórico; na Análise, um resultado por DFD com as três verificações e os que falharam, com o motivo.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("dfds1", "sistema.ler", 280, 160, { objeto: "dfds", buscaDfds: "tabela", entrega: "lista", marcar: false }),
        n("div1", "dados.filtrarConferencia", 576, 160, { conteudo: true, quais: "todos", corrigir: true, situacao: true, centro: true, trocarUnidade: false, semDfd: false }),
        n("conf1", "fluxo.executar", 872, 160, { fluxoModelo: "conferir-corrigir-1-dfd", modo: "porItem", paralelo: 3, retomar: true, chave: "id", limite: 20000 }),
        n("sem1", "centi.semDfd", 872, 352),
      ],
      conexoes: [c("inicio1", "dfds1"), c("dfds1", "div1"), c("div1", "conf1"), c("div1", "sem1")],
    },
  },
];

/** O grafo do modelo com os subfluxos (`fluxoModelo`) trocados pelos ids dos fluxos já criados (`criados`: modelo → id). */
export function grafoDoModelo(m: ModeloFluxo, criados: ReadonlyMap<string, number>): Grafo {
  return {
    ...m.grafo,
    modelo: m.id,
    nos: m.grafo.nos.map((no) => {
      const dep = no.config.fluxoModelo;
      if (typeof dep !== "string") return no;
      const { fluxoModelo: _x, ...resto } = no.config;
      const id = criados.get(dep);
      return { ...no, config: id ? { ...resto, fluxoId: String(id) } : resto };
    }),
  };
}

/**
 * O fluxo salvo ficou para trás do modelo de mesmo nome: os TIPOS dos nós diferem (o modelo ganhou/perdeu etapas) ou um
 * nó de mesmo id e tipo NÃO TEM (ausente) uma opção que o modelo LIGA (ex.: "Comparar o DFD inteiro" — sem ela, a conferência não
 * guarda os dados da Centi e a correção não tem com o que corrigir). Posições e os demais ajustes da pessoa não acusam.
 */
export function desatualizadoDoModelo(g: Pick<Grafo, "nos">, m: Pick<ModeloFluxo, "grafo">): boolean {
  const tipos = (nos: readonly { tipo: string }[]) => nos.map((n) => n.tipo).sort().join("|");
  if (tipos(g.nos) !== tipos(m.grafo.nos)) return true;
  for (const nm of m.grafo.nos) {
    const ns = g.nos.find((x) => x.id === nm.id && x.tipo === nm.tipo);
    if (!ns) continue;
    // Só a opção AUSENTE (o salvo é de antes dela) — um "false" gravado é escolha da pessoa.
    for (const [k, v] of Object.entries(nm.config)) if (v === true && ns.config[k] === undefined) return true;
  }
  return false;
}

/** O modelo de que o fluxo nasceu: o id gravado no diagrama; sem ele (fluxo antigo), o de mesmo nome. */
export function modeloDoFluxo(f: { nome: string; grafo?: { modelo?: string } | null }): ModeloFluxo | undefined {
  const id = f.grafo?.modelo;
  return (id ? MODELOS_FLUXO.find((m) => m.id === id) : undefined) ?? MODELOS_FLUXO.find((m) => m.nome === f.nome);
}
