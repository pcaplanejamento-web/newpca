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
    id: "conferir-1-dfd",
    nome: "Conferir 1 DFD × Centi",
    descricao:
      "UM DFD: buscado na Centi pelo nº de planejamento e comparado (nº, tipo, objeto, valor e itens) → marca Divergente ou Convergente. Usado pelo “Conferir DFDs × Centi”; sozinho, informe o planejamento.",
    ajuda: {
      funciona: "Busca UM DFD na Centi pelo nº de planejamento e compara nº, tipo, objeto, valor e itens com o gravado no sistema.",
      executa: "É usado pelo “Conferir DFDs × Centi”, um DFD por vez. Sozinho, informe o nº de planejamento e execute.",
      resultado: "O DFD marcado Convergente ou Divergente (com o motivo) — coluna “Centi” da Mesa.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("dfd1", "sistema.completarDfd", 280, 160, {}),
        n("busca1", "leitura.dfdCenti", 576, 160, { limite: 1, falhaErro: true }),
        n("cmp1", "dados.compararDfdCenti", 880, 160, { tolerancia: 0.01, objeto: true }),
        n("err1", "erros.apontar", 1184, 32, { todos: true, mensagem: "{{mensagem}}", nivel: "erro" }),
        n("marcar1", "saida.marcarConferencia", 1184, 224),
        n("err2", "erros.apontar", 576, 352, { todos: true, mensagem: "Planejamento {{planejamento}}: DFD não encontrado no sistema", nivel: "erro" }),
        n("ret1", "saida.retornar", 1488, 160, {}),
      ],
      conexoes: [
        c("inicio1", "dfd1"),
        c("dfd1", "busca1"),
        c("dfd1", "err2", "naoEncontrados"),
        c("busca1", "cmp1"),
        c("cmp1", "err1", "divergentes"),
        c("cmp1", "marcar1", "divergentes", "divergentes"),
        c("cmp1", "marcar1", "conformes", "conformes"),
        c("cmp1", "ret1", "divergentes"),
        c("cmp1", "ret1", "conformes"),
      ],
    },
  },
  {
    id: "dfds-de-protocolo-centi",
    nome: "DFDs de um protocolo × Centi (um por vez)",
    descricao: "Lê os DFDs de um protocolo do sistema, UM POR VEZ: busca cada um na Centi, compara e volta para o próximo; no fim, executado.",
    ajuda: {
      funciona: "O “Ler do sistema” identifica os DFDs do protocolo informado (nº ou Id) e entrega um de cada vez; cada DFD é buscado na Centi pelo nº de planejamento e comparado (nº, tipo, objeto, valor e itens).",
      executa: "Informe o protocolo nos Dados de entrada e execute com a extensão da Centi pronta. O laço guarda o estado: lê um, procura na Centi, volta e lê o próximo.",
      resultado: "As divergências apontadas na Análise e, ao terminar, todos os DFDs comparados com executado = sim.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("ler1", "sistema.ler", 280, 160, { objeto: "dfds", buscaDfds: "protocolo", valor: "", entrega: "umPorVez" }),
        n("busca1", "leitura.dfdCenti", 576, 160, { limite: 1 }),
        n("cmp1", "dados.compararDfdCenti", 880, 160, { tolerancia: 0.01, objeto: true }),
        n("err1", "erros.apontar", 1184, 32, { todos: true, mensagem: "{{mensagem}}", nivel: "erro" }),
      ],
      conexoes: [
        c("inicio1", "ler1"),
        c("ler1", "busca1", "item"),
        c("busca1", "cmp1"),
        c("cmp1", "err1", "divergentes"),
        c("cmp1", "ler1", "divergentes", "volta"),
        c("cmp1", "ler1", "conformes", "volta"),
      ],
    },
  },
  {
    id: "conferir-dfds-cm002",
    nome: "Conferir DFDs × Centi",
    descricao:
      "Cada DFD do sistema passa pelo fluxo “Conferir 1 DFD × Centi” — várias conferências ao mesmo tempo e, se parar, continua do DFD em que parou. Marca Divergente ou Convergente (coluna “Centi” da Mesa).",
    dependencias: ["conferir-1-dfd"],
    ajuda: {
      funciona: "Passa cada DFD do sistema pelo fluxo “Conferir 1 DFD × Centi”.",
      executa: "Execute com a extensão pronta: até 3 conferências ao mesmo tempo; se parar, a próxima execução continua do DFD em que parou.",
      resultado: "Todos os DFDs marcados Convergente ou Divergente na coluna “Centi” da Mesa e os divergentes na Análise.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("dfds1", "sistema.ler", 280, 160, { objeto: "dfds", buscaDfds: "todos", entrega: "lista" }),
        n("sub1", "fluxo.executar", 576, 160, { fluxoModelo: "conferir-1-dfd", modo: "porItem", paralelo: 3, retomar: true, chave: "id", limite: 20000 }),
        n("err1", "erros.apontar", 880, 288, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}): {{subfluxo.erro}}", nivel: "erro" }),
      ],
      conexoes: [c("inicio1", "dfds1"), c("dfds1", "sub1"), c("sub1", "err1", "falhas")],
    },
  },
  {
    id: "cm002",
    nome: "Execução dos DFDs na CM002",
    descricao:
      "Os DFDs do sistema são procurados na lista da CM002 (nº de planejamento = ID, no órgão de cada um); a Situação encontrada é gravada na coluna Execução da Mesa; os planejamentos da CM002 sem DFD no sistema ficam numa tabela.",
    ajuda: {
      funciona:
        "Lê os DFDs do sistema (ordenados por órgão) e, de cada um desses órgãos, a lista INTEIRA da CM002 — uma vez por órgão. Cada DFD é procurado pelo nº de planejamento = ID da CM002, no mesmo órgão. Todo DFD de órgão cadastrado recebe um texto: a Situação ou “Não encontrado na CM002”.",
      executa: "Execute com a extensão pronta (a consulta da CM002 aprendida). O ID da Centi de cada órgão vem de Órgãos e Unidades.",
      resultado:
        "A Situação da CM002 na coluna Execução da Mesa → DFDs; atenção para os não executados e os DFDs fora da CM002; a tabela “CM002 sem DFD no sistema” com os planejamentos só na Centi (para ver e usar em outras automações).",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 224),
        n("dfds1", "sistema.ler", 280, 224, { objeto: "dfds", buscaDfds: "todos", entrega: "lista" }),
        n("ord1", "dados.ordenar", 576, 96, { campo: "entidade", ordem: "asc", limite: 0 }),
        { ...n("cm1", "centi.cm002", 576, 352, { dosItens: true }), tentar: { vezes: 2, esperaS: 30 } },
        n("proc1", "logica.procurar", 880, 96, { valor: "{{planejamento}}", onde: "coluna", coluna: "planejamento", operador: "igual", resultado: "primeiro", extraCampo: "entidade", extraColuna: "entidade" }),
        n("grav1", "saida.gravarExecucao", 1184, 0, { campoSituacao: "encontrado.situacao" }),
        n("se1", "logica.se", 1184, 160, { campo: "encontrado.situacao", operador: "diferente", valor: "Executado" }),
        n("err1", "erros.apontar", 1488, 160, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}): {{encontrado.situacao}} na CM002", nivel: "atencao" }),
        n("err2", "erros.apontar", 1184, 320, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}) não está na CM002 do órgão {{entidade}}", nivel: "atencao" }),
        n("proc2", "logica.procurar", 880, 480, { valor: "{{planejamento}}", onde: "coluna", coluna: "planejamento", operador: "igual", resultado: "primeiro", extraCampo: "entidade", extraColuna: "entidade" }),
        n("se2", "logica.se", 1488, 320, { campo: "entidade", operador: "nao_vazio", valor: "" }),
        n("grav2", "saida.gravarExecucao", 1792, 320, { situacaoFixa: "Não encontrado na CM002" }),
        n("tab1", "saida.tabela", 1184, 544, { nome: "CM002 sem DFD no sistema", modo: "substituir" }),
      ],
      conexoes: [
        c("inicio1", "dfds1"),
        c("dfds1", "ord1"),
        c("dfds1", "cm1"),
        c("ord1", "proc1"),
        c("cm1", "proc1", "saida", "tabela"),
        c("proc1", "grav1", "encontrados"),
        c("proc1", "se1", "encontrados"),
        c("se1", "err1", "verdadeiro"),
        c("proc1", "err2", "naoEncontrados"),
        c("proc1", "se2", "naoEncontrados"),
        c("se2", "grav2", "verdadeiro"),
        c("cm1", "proc2"),
        c("dfds1", "proc2", "saida", "tabela"),
        c("proc2", "tab1", "naoEncontrados"),
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
        n("err2", "erros.apontar", 1488, 32, { todos: true, mensagem: "{{no}}: {{erro}}" }),
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
    id: "situacao-cm002-coluna",
    nome: "Situação da CM002 numa coluna da Mesa",
    descricao: "Cada DFD do sistema é procurado nas linhas da CM002 (todas as colunas da Centi); a regra traduz a situação e grava na coluna “Situação na Centi” da Mesa → DFDs.",
    ajuda: {
      funciona: "Lê os DFDs do sistema e a lista inteira da CM002 com todas as colunas; procura cada planejamento nas linhas e aplica as regras (X => Y) à situação encontrada.",
      executa: "Execute com a extensão pronta. Ajuste as regras e o nome da coluna nos dados de entrada; a CM002 é repetida até 2 vezes se a Centi falhar.",
      resultado: "A coluna “Situação na Centi” na Mesa → DFDs preenchida; os planejamentos fora da CM002 aparecem na Análise.",
    },
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("dfds1", "sistema.ler", 280, 64, { objeto: "dfds", buscaDfds: "todos", entrega: "lista" }),
        { ...n("cm1", "centi.cm002", 280, 288, { colunas: true }), tentar: { vezes: 2, esperaS: 30 } },
        n("proc1", "logica.procurar", 576, 160, { valor: "{{planejamento}}", onde: "coluna", coluna: "planejamento", operador: "igual", resultado: "primeiro" }),
        n("regra1", "dados.regra", 880, 96, {
          origem: "encontrado.situacao",
          operador: "contem",
          regras: "EXECUT => Executado\nCANCEL => Cancelado",
          senao: "valor",
          destino: "valor",
        }),
        n("col1", "saida.gravarColuna", 1184, 96, { entidade: "dfd", coluna: "Situação na Centi", campoValor: "valor", campoId: "id" }),
        n("err1", "erros.apontar", 880, 288, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}) não está na CM002", nivel: "atencao" }),
      ],
      conexoes: [
        c("inicio1", "dfds1"),
        c("inicio1", "cm1"),
        c("dfds1", "proc1"),
        c("cm1", "proc1", "saida", "tabela"),
        c("proc1", "regra1", "encontrados"),
        c("regra1", "col1"),
        c("proc1", "err1", "naoEncontrados"),
      ],
    },
  },
];

/** O grafo do modelo com os subfluxos (`fluxoModelo`) trocados pelos ids dos fluxos já criados (`criados`: modelo → id). */
export function grafoDoModelo(m: ModeloFluxo, criados: ReadonlyMap<string, number>): Grafo {
  return {
    ...m.grafo,
    nos: m.grafo.nos.map((no) => {
      const dep = no.config.fluxoModelo;
      if (typeof dep !== "string") return no;
      const { fluxoModelo: _x, ...resto } = no.config;
      const id = criados.get(dep);
      return { ...no, config: id ? { ...resto, fluxoId: String(id) } : resto };
    }),
  };
}
