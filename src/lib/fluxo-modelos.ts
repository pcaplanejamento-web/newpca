import type { Grafo } from "./fluxo-core";

const n = (id: string, tipo: string, x: number, y: number, config: Record<string, unknown> = {}, nome?: string) => ({ id, tipo, x, y, config, nome });
const c = (de: string, para: string, saida = "saida", entrada = "entrada") => ({ de, saida, para, entrada });

/** Fluxos PRONTOS para começar (o "Novo fluxo"). Cada um é só um grafo — editável depois. */
export const MODELOS_FLUXO: { id: string; nome: string; descricao: string; grafo: Grafo }[] = [
  {
    id: "cm002",
    nome: "Execução dos DFDs na CM002",
    descricao: "Busca a CM002 de cada entidade, grava a situação nos DFDs e aponta os não executados e os que não estão na Centi.",
    grafo: {
      v: 1,
      nos: [
        n("inicio1", "gatilho.inicio", 0, 160),
        n("cm1", "centi.cm002", 280, 64),
        n("gravar1", "saida.gravarExecucao", 576, -64),
        n("dfds1", "sistema.dfds", 280, 288),
        n("chaveA", "dados.campos", 576, 288, { linhas: "chave = {{entidade}}-{{planejamento}}", manter: true }, "Chave DFD"),
        n("chaveB", "dados.campos", 576, 96, { linhas: "chave = {{entidade}}-{{planejamento}}", manter: true }, "Chave CM002"),
        n("cmp1", "logica.comparar", 880, 192, { chaveA: "chave", chaveB: "chave", operador: "igual" }),
        n("se1", "logica.se", 1184, 96, { campo: "b.situacao", operador: "diferente", valor: "EXECUTADO" }, "Não executado?"),
        n("err1", "erros.apontar", 1488, 32, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}): {{b.situacao}}", nivel: "atencao" }, "Não executados"),
        n("err2", "erros.apontar", 1184, 320, { todos: true, mensagem: "DFD {{numero}} (planejamento {{planejamento}}) não está na CM002", nivel: "erro" }, "Fora da CM002"),
      ],
      conexoes: [
        c("inicio1", "cm1"),
        c("inicio1", "dfds1"),
        c("cm1", "gravar1"),
        c("cm1", "chaveB"),
        c("dfds1", "chaveA"),
        c("chaveA", "cmp1", "saida", "a"),
        c("chaveB", "cmp1", "saida", "b"),
        c("cmp1", "se1", "iguais"),
        c("se1", "err1", "verdadeiro"),
        c("cmp1", "err2", "soEmA"),
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
