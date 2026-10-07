import type { Frequencia, Grafo } from "./fluxo-core";

const n = (id: string, tipo: string, x: number, y: number, config: Record<string, unknown> = {}, nome?: string) => ({ id, tipo, x, y, config, nome });
const c = (de: string, para: string, saida = "saida", entrada = "entrada") => ({ de, saida, para, entrada });

/** Fluxos PRONTOS para começar (o "Novo fluxo"). Cada um é só um grafo — editável depois. */
export type ModeloFluxo = {
  id: string;
  nome: string;
  descricao: string;
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
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("prot1", "sistema.protocolos", 280, 160),
        n("sel1", "entrada.selecionar", 576, 160, { chave: "id", semMarcar: "nenhum" }, "Protocolos"),
        n("dfds1", "saida.dfdsCenti", 880, 160),
      ],
      conexoes: [c("inicio1", "prot1"), c("prot1", "sel1"), c("sel1", "dfds1")],
    },
  },
  {
    id: "dfds-ids",
    nome: "Baixar/anexar DFDs · por nºs de planejamento",
    descricao: "Os nºs de planejamento digitados (separados por “:”) → cada DFD é emitido na Centi e vai à pasta ou ao protocolo da Centi.",
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
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("prot1", "centi.protocolos", 280, 160, { situacao: "", reparticao: "" }, "Em análise"),
        n("sel1", "entrada.selecionar", 576, 160, { chave: "protocolo", semMarcar: "nenhum" }, "Protocolos"),
        n("laco1", "logica.laco", 880, 160, { tamanho: 1 }),
        n("ler1", "leitura.protocolo", 1184, 64, { limite: 500 }),
        n("err1", "erros.apontar", 1488, 64, { todos: true, mensagem: "{{no}}: {{erro}}" }, "Falha ao emitir"),
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
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 192),
        n("prot1", "centi.protocolos", 280, 96, { situacao: "", reparticao: "PCA - COORDENADOR (JHONE)" }, "Protocolos em análise"),
        n("novos1", "sistema.naoCadastrados", 576, 96),
        n("laco1", "logica.laco", 880, 96, { tamanho: 1 }),
        n("ler1", "leitura.protocolo", 880, -32, { limite: 200 }),
        n("seLer", "logica.se", 1184, -32, { campo: "leitura", operador: "igual", valor: "falha" }, "Leitura falhou?"),
        n("errLer", "erros.apontar", 1488, -96, { todos: true, mensagem: "Protocolo {{protocolo}}/{{ano}}: {{leituraTexto}}" }, "Falha ao ler"),
        n("inc1", "dados.filtrar", 880, 224, { campo: "assunto", operador: "contem", valor: "INCLUS" }, "Assunto: Inclusão"),
        n("des1", "dados.desdobrar", 1184, 224, { campo: "dfds" }, "Um item por DFD"),
        n("busca1", "leitura.dfdCenti", 1488, 224, { limite: 2000 }, "DFD na Centi"),
        n("conf1", "dados.compararDfdCenti", 1488, 448, { tolerancia: 0.01, objeto: true }, "DFD × Centi"),
        n("err1", "erros.apontar", 1792, 320, { todos: true, mensagem: "{{mensagem}}", nivel: "erro" }, "Divergências"),
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
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("dfd1", "sistema.completarDfd", 280, 160, {}, "O DFD"),
        n("busca1", "leitura.dfdCenti", 576, 160, { limite: 1, falhaErro: true }),
        n("cmp1", "dados.compararDfdCenti", 880, 160, { tolerancia: 0.01, objeto: true }, "DFD × Centi"),
        n("err1", "erros.apontar", 1184, 32, { todos: true, mensagem: "{{mensagem}}", nivel: "erro" }, "Divergências"),
        n("marcar1", "saida.marcarConferencia", 1184, 224),
        n("err2", "erros.apontar", 576, 352, { todos: true, mensagem: "Planejamento {{planejamento}}: DFD não encontrado no sistema", nivel: "erro" }, "Sem DFD"),
        n("ret1", "saida.retornar", 1488, 160, {}, "Devolver o resultado"),
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
    id: "conferir-dfds-cm002",
    nome: "Conferir DFDs × Centi",
    descricao:
      "Cada DFD do sistema passa pelo fluxo “Conferir 1 DFD × Centi” — várias conferências ao mesmo tempo e, se parar, continua do DFD em que parou. Marca Divergente ou Convergente (coluna “Centi” da Mesa).",
    dependencias: ["conferir-1-dfd"],
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("dfds1", "sistema.dfds", 280, 160),
        n("sub1", "fluxo.executar", 576, 160, { fluxoModelo: "conferir-1-dfd", modo: "porItem", paralelo: 3, retomar: true, chave: "id", limite: 20000 }, "Conferir cada DFD"),
        n("err1", "erros.apontar", 880, 288, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}): {{subfluxo.erro}}", nivel: "erro" }, "Não conferidos"),
      ],
      conexoes: [c("inicio1", "dfds1"), c("dfds1", "sub1"), c("sub1", "err1", "falhas")],
    },
  },
  {
    id: "cm002",
    nome: "Execução dos DFDs na CM002",
    descricao: "Cada DFD do sistema: o planejamento é aberto na Centi por API, a situação é gravada no DFD; aponta os não executados, os que não estão na Centi e os planejamentos SÓ na Centi (pela lista da CM002, quando disponível).",
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("dfds1", "sistema.dfds", 280, 160),
        n("busca1", "leitura.dfdCenti", 576, 160, { limite: 20000, pdf: false }, "Planejamento na Centi"),
        n("gravar1", "saida.gravarExecucao", 880, 32),
        n("se0", "logica.se", 880, 288, { campo: "centiErro", operador: "nao_vazio" }, "Não encontrado?"),
        n("err2", "erros.apontar", 1184, 352, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}): {{centiErro}}", nivel: "erro" }, "Fora da Centi"),
        n("se1", "logica.se", 1184, 192, { campo: "centi.situacao", operador: "nao_contem", valor: "EXECUTADO" }, "Não executado?"),
        n("err1", "erros.apontar", 1488, 192, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}): {{centi.situacao}}", nivel: "atencao" }, "Não executados"),
        n("cm1", "centi.cm002", 576, 448, {}, "Lista da CM002"),
        n("cmp1", "logica.comparar", 880, 448, { chaveA: "planejamento", chaveB: "planejamento", operador: "igual" }, "Sistema × CM002"),
        n("err3", "erros.apontar", 1184, 512, { todos: true, mensagem: "Planejamento {{planejamento}} ({{situacao}}) só na Centi — sem DFD no sistema", nivel: "atencao" }, "Só na Centi"),
        n("err4", "erros.apontar", 880, 640, { todos: true, mensagem: "Lista da CM002 não lida: {{erro}}", nivel: "atencao" }, "CM002 indisponível"),
      ],
      conexoes: [
        c("inicio1", "dfds1"),
        c("dfds1", "busca1"),
        c("busca1", "gravar1"),
        c("busca1", "se0"),
        c("se0", "err2", "verdadeiro"),
        c("se0", "se1", "falso"),
        c("se1", "err1", "verdadeiro"),
        c("inicio1", "cm1"),
        c("dfds1", "cmp1", "saida", "a"),
        c("cm1", "cmp1", "saida", "b"),
        c("cmp1", "err3", "soEmB"),
        c("cm1", "err4", "erro"),
      ],
    },
  },
  {
    id: "analisados",
    nome: "Ler protocolos analisados",
    descricao: "Repartições automáticas → protocolos “Analisado” delas → lê cada PDF (laço até o fim) e aponta os que falharam.",
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("rep1", "centi.reparticoes", 280, 160, { filtro: "PCA" }),
        n("prot1", "centi.protocolos", 576, 160, { situacao: "ANALISADO", campoReparticao: "reparticao" }),
        n("laco1", "logica.laco", 880, 160, { tamanho: 1 }),
        n("ler1", "leitura.protocolo", 1184, 32, { limite: 50 }),
        n("se1", "logica.se", 1184, 288, { campo: "leitura", operador: "igual", valor: "falha" }, "Leitura falhou?"),
        n("err1", "erros.apontar", 1488, 224, { todos: true, mensagem: "Protocolo {{protocolo}}/{{ano}}: {{leituraTexto}}" }, "PDF inválido"),
        n("err2", "erros.apontar", 1488, 32, { todos: true, mensagem: "{{no}}: {{erro}}" }, "Falha ao emitir"),
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
