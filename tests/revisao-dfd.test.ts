import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { regrasPadrao } from "../src/lib/avaliacao-core.ts";
import type { DfdParseado } from "../src/lib/parse-dfd-comum.ts";
import { podeRevisarItens, resumoRevisao, resumoRevisaoLote, revisarCapa, revisarDfd } from "../src/lib/revisao-dfd.ts";

// REVISÃO do gravado (botão Atualizar): os tratamentos automáticos da importação aplicados ao que está no banco.

const dfd = (p: Partial<DfdParseado> = {}): DfdParseado => ({
  numero: "140",
  planejamento: "186",
  tipo: "DFD-S",
  objeto: "AQUISIÇÃO DE SERVIÇO",
  orgaoEntidade: "AMAE - AGENCIA MUN. DE REGULACAO DOS SERVICOS DE AGUA E ESGOTO",
  setorRequisitante: "AMAE",
  siglaSetor: null,
  responsavel: "BRUNO BOTELHO SALEH",
  matricula: "3004619",
  email: "bruno@rioverde.go.gov.br",
  telefone: "(64) 98115-9707",
  anoPca: 2027,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  valorTotal: 100,
  nomeArquivo: "x.pdf",
  secoes: [],
  itens: [{ item: 1, codigo: "524191518", descricao: "VIGILÂNCIA ELETRÔNICA", unidade: "MES", quantidade: 12, valorUnitario: 10, valorTotal: 120 }],
  assinaturas: [],
  ...p,
});

// Texto como a importação ANTERIOR gravava: cada linha visual do PDF virava um "\n".
const JUSTIFICATIVA_LEGADA =
  "A CONTRATAÇÃO DOS SERVIÇOS DE VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO 24 HORAS É NECESSÁRIA PARA GARANTIR A\n" +
  "SEGURANÇA E A INTEGRIDADE DAS INSTALAÇÕES PÚBLICAS, BEM COMO DOS DOCUMENTOS, EQUIPAMENTOS E DEMAIS BENS PATRIMONIAIS\n" +
  "EXISTENTES NO ARQUIVO DA SUPERINTENDÊNCIA DE GESTÃO INSTITUCIONAL E DE PESSOAS E NO DEPARTAMENTO DE ILUMINAÇÃO PÚBLICA.\n" +
  "A EXECUÇÃO CONTÍNUA DOS SERVIÇOS PERMITE A PREVENÇÃO E O PRONTO ENFRENTAMENTO DE OCORRÊNCIAS COMO FURTOS, INVASÕES,\n" +
  "VANDALISMO E OUTROS EVENTOS QUE POSSAM COMPROMETER O FUNCIONAMENTO DAS UNIDADES, REDUZINDO RISCOS E PREJUÍZOS À\n" +
  "ADMINISTRAÇÃO MUNICIPAL.";

describe("revisarDfd", () => {
  it("seções em parágrafos + a linha do órgão do cabeçalho de página fora (DFD 140 real)", () => {
    const r = revisarDfd(
      dfd({
        secoes: [
          { numero: 3, titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", texto: JUSTIFICATIVA_LEGADA },
          {
            numero: 9,
            titulo: "SECRETÁRIO DEMANDANTE",
            texto: "De acordo com a demanda.\nBRUNO BOTELHO SALEH\nGestor/Ordenador\nAMAE - AGENCIA MUN. DE REGULACAO DOS SERVICOS DE AGUA E ESGOTO",
          },
        ],
      }),
    );
    const [s3, s9] = r.dfd.secoes;
    assert.equal(s3.texto.split("\n").length, 2);
    assert.ok(s3.texto.includes("GARANTIR A SEGURANÇA E A INTEGRIDADE"));
    assert.ok(s3.texto.includes("PÚBLICA.\nA EXECUÇÃO"));
    assert.equal(s9.texto, "De acordo com a demanda.\nBRUNO BOTELHO SALEH\nGestor/Ordenador");
    assert.match(resumoRevisao(r.ajustes), /texto de 2 seções em parágrafos; 1 linha do cabeçalho de página/);
  });

  it("uma seção que é SÓ o nome do órgão fica (é conteúdo, não vazamento)", () => {
    const texto = "AMAE - AGENCIA MUN. DE REGULACAO DOS SERVICOS DE AGUA E ESGOTO";
    const r = revisarDfd(dfd({ secoes: [{ numero: 9, titulo: "SECRETÁRIO DEMANDANTE", texto }] }));
    assert.equal(r.dfd.secoes[0].texto, texto);
  });

  it("campos do cabeçalho limpos: a 'Matrícula:' vazia lida como ':' volta a vazia", () => {
    const r = revisarDfd(dfd({ matricula: ":", responsavel: "  HERICA   CRISTINA  " }));
    assert.equal(r.dfd.matricula, null);
    assert.equal(r.dfd.responsavel, "HERICA CRISTINA");
    assert.match(resumoRevisao(r.ajustes), /2 campos do cabeçalho/);
  });

  it("itens: descrição sem marcador/TAB e unidade limpa — só quando o host permite", () => {
    const suja = dfd({ itens: [{ item: 1, codigo: "1", descricao: "CADEIRA\t• GIRATÓRIA", unidade: " UN ", quantidade: 1, valorUnitario: 5, valorTotal: 5 }] });
    const r = revisarDfd(suja);
    assert.equal(r.dfd.itens[0].descricao, "CADEIRA GIRATÓRIA");
    assert.equal(r.dfd.itens[0].unidade, "UN");
    assert.equal(r.itensAlterados, true);
    const sem = revisarDfd(suja, { itens: false });
    assert.equal(sem.itensAlterados, false);
    assert.equal(sem.dfd.itens[0].descricao, "CADEIRA\t• GIRATÓRIA");
  });

  it("padronização automática (a mesma da importação): prioridade e previsão", () => {
    const r = revisarDfd(
      dfd({
        secoes: [
          { numero: 5, titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "FEVEREIRO" },
          { numero: 6, titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "PRIORIDADE BAIXA" },
        ],
      }),
      { regras: regrasPadrao(), anoPca: 2027 },
    );
    assert.equal(r.dfd.secoes[0].texto, "FEVEREIRO/2027");
    assert.equal(r.dfd.secoes[1].texto, "BAIXA");
  });

  it("DFD-R sem referência: lê contrato/ARP/licitação do texto (reflow junta o nº quebrado)", () => {
    const r = revisarDfd(
      dfd({
        tipo: "DFD-R",
        secoes: [{ numero: 2, titulo: "IDENTIFICAÇÃO DA DEMANDA", texto: "RENOVAÇÃO DO CONTRATO Nº\n336/2024 COM RIVER ALARMES." }],
      }),
    );
    assert.equal(r.dfd.numeroContrato, "336/2024");
    assert.ok(r.ajustes.some((a) => /referências/.test(a.rotulo)));
  });

  it("é IDEMPOTENTE e nunca mexe em identificadores, valores, assinaturas nem na unidade", () => {
    const base = dfd({ secoes: [{ numero: 3, titulo: "JUSTIFICATIVA", texto: JUSTIFICATIVA_LEGADA }], matricula: ":" });
    const r1 = revisarDfd(base);
    const r2 = revisarDfd(r1.dfd);
    assert.deepEqual(r2.ajustes, []);
    assert.equal(r2.dfd, r1.dfd); // nada muda: o MESMO objeto
    for (const k of ["numero", "planejamento", "anoPca", "valorTotal", "assinaturas", "tipo"] as const) assert.deepEqual(r1.dfd[k], base[k]);
    assert.deepEqual(r1.dfd.itens.map((i) => [i.quantidade, i.valorUnitario, i.valorTotal]), base.itens.map((i) => [i.quantidade, i.valorUnitario, i.valorTotal]));
  });

  it("podeRevisarItens: não regrava itens que o servidor recusaria (sem valor unitário + ponto bloqueante)", () => {
    const semVu = dfd({ itens: [{ item: 1, codigo: "1", descricao: "X", unidade: "UN", quantidade: 1, valorUnitario: null, valorTotal: null }] });
    assert.equal(podeRevisarItens(semVu, regrasPadrao(), null), false);
    assert.equal(podeRevisarItens(dfd(), regrasPadrao(), null), true);
  });
});

describe("revisarCapa", () => {
  it("campos de conteúdo da capa em uma linha limpa (identificadores e valor intocados)", () => {
    const capa = {
      reparticaoId: 1,
      interessado: "42 - FUNDO\nEXEMPLO",
      documento: "11.222.333/0001-44",
      assunto: " INCLUSÃO  - PCA ",
      observacao: "PCA 2027",
      valorCapa: 40,
      localReparticao: "SME",
    };
    const r = revisarCapa(capa);
    assert.equal(r.capa.interessado, "42 - FUNDO EXEMPLO");
    assert.equal(r.capa.assunto, "INCLUSÃO - PCA");
    assert.equal(r.capa.valorCapa, 40);
    assert.match(resumoRevisao(r.ajustes), /2 campos da capa/);
    assert.deepEqual(revisarCapa(r.capa).ajustes, []);
  });
});

describe("resumoRevisaoLote (protocolo)", () => {
  it("conta quantos DFDs tiveram cada tipo de ajuste", () => {
    const a = revisarDfd(dfd({ matricula: ":", secoes: [{ numero: 3, titulo: "JUSTIFICATIVA", texto: JUSTIFICATIVA_LEGADA }] })).ajustes;
    const b = revisarDfd(dfd({ secoes: [{ numero: 3, titulo: "JUSTIFICATIVA", texto: JUSTIFICATIVA_LEGADA }] })).ajustes;
    assert.equal(resumoRevisaoLote([a, b, []]), "texto em parágrafos em 2 DFDs; campos do cabeçalho limpos em 1 DFD");
  });
});
