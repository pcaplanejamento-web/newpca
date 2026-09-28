import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coletarSecoes, juntarContinuacoesCabecalho, extrairCabecalho } from "../src/lib/parse-dfd-comum.ts";
import {
  type LinhaCorrida,
  larguraVisual,
  quebraFica,
  refluirTexto,
  terminaEmLigacao,
  terminaFrase,
  textoCorrido,
} from "../src/lib/texto-corrido.ts";

// TEXTO CORRIDO: a quebra de linha que é só a LARGURA da linha do PDF some; parágrafo, lista e rótulo ficam.
// Os casos vêm do PDF real (protocolo pd101820 — Centi: corpo 7pt, entrelinha 8,0, margem direita 557,5).

/** Linha do PDF: `x1` = onde a linha termina (a margem é 557,5), base `y` e corpo 7. */
const L = (texto: string, y: number, x1: number, x0 = 38, page = 1): LinhaCorrida => ({ texto, geo: { page, y, x0, x1, h: 7 } });
const DIREITA = 557.5;

describe("texto corrido — pistas do texto", () => {
  it("ligação no fim continua a frase; fim de frase e abreviação", () => {
    assert.equal(terminaEmLigacao("…DE MONITORAMENTO REMOTO NO"), true);
    assert.equal(terminaEmLigacao("…EQUIPAMENTOS E"), true);
    assert.equal(terminaEmLigacao("…COMO FURTOS, INVASÕES,"), true);
    assert.equal(terminaEmLigacao("…REDUZINDO RISCOS E PREJUÍZOS À"), true);
    assert.equal(terminaEmLigacao("…DIRETORIA DO TRABALHO -"), true);
    assert.equal(terminaEmLigacao("…24 HORAS É"), false);
    assert.equal(terminaFrase("…DE ILUMINAÇÃO PÚBLICA."), true);
    assert.equal(terminaFrase("Integrantes Equipe:"), true);
    assert.equal(terminaFrase("…LEI 14.133/21."), true);
    assert.equal(terminaFrase("…PARA ATENDER SEC."), false); // abreviação
    assert.equal(terminaFrase("…EMPRESA X S.A."), false); // inicial
  });

  it("quebraFica: lista, rótulo, continuação e a dúvida (fica)", () => {
    assert.equal(quebraFica("…itens:", "• cadeira", true), true);
    assert.equal(quebraFica("…itens", "• cadeira", true), true); // marcador sempre abre linha
    assert.equal(quebraFica("…o que é", "necessário para…", undefined), false); // minúscula continua
    assert.equal(quebraFica("…SECRETARIA MUNICIPAL", "DE SAÚDE", undefined), false); // "DE" continua
    assert.equal(quebraFica("Nome: FULANO", "Matrícula: 123", undefined, true), true); // rótulo
    assert.equal(quebraFica("RICARDO ROCHA BATISTA", "Gestor/Ordenador", undefined), true); // sem evidência: fica
    assert.equal(quebraFica("…24 HORAS É", "NECESSÁRIA PARA…", true), false); // linha cheia: largura
    assert.equal(quebraFica("…POLO DE CONFECÇÃO", "- MOVELEIRO.", true), false); // traço separador após linha cheia
    assert.equal(quebraFica("- item um", "- item dois", true, true), true); // próximo item da lista
  });
});

describe("texto corrido — geometria do PDF (DFD 126 real, §3)", () => {
  const linhas = [
    L("A INCLUSÃO NO PCA 2027 DA CONTRATAÇÃO DOS SERVIÇOS DE VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO 24 HORAS É", 598.1, 504.4),
    L("NECESSÁRIA PARA GARANTIR A SEGURANÇA E A INTEGRIDADE DAS INSTALAÇÕES PÚBLICAS, BEM COMO DOS DOCUMENTOS, EQUIPAMENTOS E", 590.1, 536.8),
    L("DEMAIS BENS PATRIMONIAIS EXISTENTES NO ARQUIVO DA SUPERINTENDÊNCIA DE GESTÃO INSTITUCIONAL E DE PESSOAS E NO", 582.0, 483.7),
    L("DEPARTAMENTO DE ILUMINAÇÃO PÚBLICA.", 574.0, 186.1),
    L("A EXECUÇÃO CONTÍNUA DOS SERVIÇOS PERMITE A PREVENÇÃO E O PRONTO ENFRENTAMENTO DE OCORRÊNCIAS COMO FURTOS, INVASÕES,", 565.9, 532.7),
    L("VANDALISMO E OUTROS EVENTOS QUE POSSAM COMPROMETER O FUNCIONAMENTO DAS UNIDADES, REDUZINDO RISCOS E PREJUÍZOS À", 557.9, 518.4),
    L("ADMINISTRAÇÃO MUNICIPAL.", 549.8, 137.9),
  ];
  it("junta as quebras da largura e mantém os 2 parágrafos", () => {
    assert.equal(
      textoCorrido(linhas, { direita: DIREITA }),
      "A INCLUSÃO NO PCA 2027 DA CONTRATAÇÃO DOS SERVIÇOS DE VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO 24 HORAS É NECESSÁRIA PARA GARANTIR A SEGURANÇA E A INTEGRIDADE DAS INSTALAÇÕES PÚBLICAS, BEM COMO DOS DOCUMENTOS, EQUIPAMENTOS E DEMAIS BENS PATRIMONIAIS EXISTENTES NO ARQUIVO DA SUPERINTENDÊNCIA DE GESTÃO INSTITUCIONAL E DE PESSOAS E NO DEPARTAMENTO DE ILUMINAÇÃO PÚBLICA.\n" +
        "A EXECUÇÃO CONTÍNUA DOS SERVIÇOS PERMITE A PREVENÇÃO E O PRONTO ENFRENTAMENTO DE OCORRÊNCIAS COMO FURTOS, INVASÕES, VANDALISMO E OUTROS EVENTOS QUE POSSAM COMPROMETER O FUNCIONAMENTO DAS UNIDADES, REDUZINDO RISCOS E PREJUÍZOS À ADMINISTRAÇÃO MUNICIPAL.",
    );
  });

  it("parágrafo que termina com ponto numa linha CHEIA continua separado (DFD 140: 'PÚBLICA.' ⏎ 'A EXECUÇÃO')", () => {
    const r = textoCorrido(
      [
        L("EXISTENTES NO ARQUIVO DA SUPERINTENDÊNCIA DE GESTÃO INSTITUCIONAL E DE PESSOAS E NO DEPARTAMENTO DE ILUMINAÇÃO PÚBLICA.", 580, 532.8),
        L("A EXECUÇÃO CONTÍNUA DOS SERVIÇOS…", 572, 400),
      ],
      { direita: DIREITA },
    );
    assert.equal(r, "EXISTENTES NO ARQUIVO DA SUPERINTENDÊNCIA DE GESTÃO INSTITUCIONAL E DE PESSOAS E NO DEPARTAMENTO DE ILUMINAÇÃO PÚBLICA.\nA EXECUÇÃO CONTÍNUA DOS SERVIÇOS…");
  });

  it("quebra COLADA de outro PDF no meio da frase some (DFD 142: '…COM' ⏎ 'OBJETO')", () => {
    const r = textoCorrido(
      [
        L("INCLUSÃO PCA 2027 DA DESPESA DO EMPENHO COMPLEMENTAR DO CONTRATO 336/2024, FIRMADO COM RIVER ALARMES, COM", 636.2, 480.6),
        L("OBJETO DE SERVIÇOS DE VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO, PARA ATENDER AS NECESSIDADES DO FUNDO MUNIC. DE", 628.2, 557.5),
        L("ASSISTÊNCIA SOCIAL.", 620.2, 110),
      ],
      { direita: DIREITA },
    );
    assert.equal(r.includes("\n"), false);
  });

  it("bloco novo (vão maior que a entrelinha) e linha curta sem evidência ficam (§8 e §9)", () => {
    assert.equal(
      textoCorrido(
        [L("Integrantes Equipe:", 295.9, 103.4), L("Nome: NEDSON RIBEIRO DA SILVA", 281.7, 155.1), L("Matrícula: 3010035", 267.5, 100.4)],
        { direita: DIREITA },
      ),
      "Integrantes Equipe:\nNome: NEDSON RIBEIRO DA SILVA\nMatrícula: 3010035",
    );
    assert.equal(
      textoCorrido(
        [L("De acordo com a demanda.", 111.6, 129.1), L("RICARDO ROCHA BATISTA", 97.4, 342.3, 253.1), L("Gestor/Ordenador", 83.3, 325.9, 269.5)],
        { direita: DIREITA },
      ),
      "De acordo com a demanda.\nRICARDO ROCHA BATISTA\nGestor/Ordenador",
    );
  });

  it("a frase que atravessa a PÁGINA continua (sem geometria entre páginas, decide o texto)", () => {
    const r = textoCorrido([L("…MANUTENÇÃO PREVENTIVA DOS EQUIPAMENTOS DA REDE MUNICIPAL DE", 60, 540, 38, 1), L("SAÚDE.", 700, 70, 38, 2)], {
      direita: DIREITA,
    });
    assert.equal(r, "…MANUTENÇÃO PREVENTIVA DOS EQUIPAMENTOS DA REDE MUNICIPAL DE SAÚDE.");
  });

  it("palavra hifenizada na quebra junta sem espaço; linha em branco preserva o parágrafo", () => {
    assert.equal(textoCorrido([{ texto: "APARELHO DE AR-" }, { texto: "CONDICIONADO" }]), "APARELHO DE AR-CONDICIONADO");
    assert.equal(textoCorrido([{ texto: "Primeiro." }, { texto: "" }, { texto: "Segundo." }]), "Primeiro.\n\nSegundo.");
  });
});

describe("texto corrido — texto GRAVADO (sem geometria: a revisão do botão Atualizar)", () => {
  // Como a importação anterior gravava: 1 linha visual = 1 "\n".
  const legado =
    "A INCLUSÃO NO PCA 2027 DA CONTRATAÇÃO DOS SERVIÇOS DE VIGILÂNCIA ELETRÔNICA COM MONITORAMENTO REMOTO 24 HORAS É\n" +
    "NECESSÁRIA PARA GARANTIR A SEGURANÇA E A INTEGRIDADE DAS INSTALAÇÕES PÚBLICAS, BEM COMO DOS DOCUMENTOS, EQUIPAMENTOS E\n" +
    "DEMAIS BENS PATRIMONIAIS EXISTENTES NO ARQUIVO DA SUPERINTENDÊNCIA DE GESTÃO INSTITUCIONAL E DE PESSOAS E NO\n" +
    "DEPARTAMENTO DE ILUMINAÇÃO PÚBLICA.\n" +
    "ALÉM DISSO, O MONITORAMENTO ININTERRUPTO CONTRIBUI PARA A PRESERVAÇÃO DO PATRIMÔNIO PÚBLICO E PARA A CONTINUIDADE DAS\n" +
    "ATIVIDADES ADMINISTRATIVAS E OPERACIONAIS DESENVOLVIDAS NOS LOCAIS ATENDIDOS, ASSEGURANDO MAIOR EFICIÊNCIA NA GESTÃO DOS\n" +
    "RECURSOS PÚBLICOS E NO ATENDIMENTO AO INTERESSE DA COLETIVIDADE";

  it("a largura visual sai das quebras certas (linha que termina em ligação)", () => {
    const w = larguraVisual([legado]);
    assert.ok(w != null && w > 100 && w < 130);
    assert.equal(larguraVisual(["Nome: X\nMatrícula: 1"]), null); // sem evidência
  });

  it("refaz os parágrafos — inclusive a quebra depois do verbo ('É' ⏎ 'NECESSÁRIA', pela largura)", () => {
    const r = refluirTexto(legado);
    assert.equal(r.split("\n").length, 2);
    assert.ok(r.includes("24 HORAS É NECESSÁRIA PARA GARANTIR"));
    assert.ok(r.startsWith("A INCLUSÃO") && r.includes("PÚBLICA.\nALÉM DISSO"));
  });

  it("é IDEMPOTENTE e não mexe no que não tem evidência (assinatura, rótulos)", () => {
    const r = refluirTexto(legado);
    assert.equal(refluirTexto(r), r);
    const bloco = "De acordo com a demanda.\nRICARDO ROCHA BATISTA\nGestor/Ordenador";
    assert.equal(refluirTexto(bloco), bloco);
    const equipe = "Integrantes Equipe:\nNome: X\nMatrícula:\nEmail:\nResponsável Fiscalização:\nNome: X";
    assert.equal(refluirTexto(equipe), equipe);
  });
});

describe("coletarSecoes + cabeçalho (PDF/planilha)", () => {
  it("seções saem em texto corrido (a planilha sem geometria só junta com evidência do texto)", () => {
    const s = coletarSecoes(["2 - IDENTIFICAÇÃO DA DEMANDA", "AQUISIÇÃO DE MATERIAL DE", "EXPEDIENTE PARA A SECRETARIA.", "7 - FUNDAMENTAÇÃO LEGAL", "LEI 14.133/2021"]);
    assert.deepEqual(
      s.map((x) => x.texto),
      ["AQUISIÇÃO DE MATERIAL DE EXPEDIENTE PARA A SECRETARIA.", "LEI 14.133/2021"],
    );
  });

  it("Setor Requisitante em 2 linhas volta INTEIRO (DFD 140/151 reais) — só entre dois rótulos do cabeçalho", () => {
    const linhas = [
      "1 - ÁREA REQUISITANTE DA DEMANDA",
      "Órgão/Entidade: AMAE - AGENCIA MUN. DE REGULACAO DOS SERVICOS DE AGUA E ESGOTO",
      "Setor Requisitante: AGÊNCIA MUNICIPAL DE REGULAÇÃO DOS SERVIÇOS PÚBLICOS DE ÁGUA E",
      "ESGOTO - AMAE",
      "Responsável pela Demanda: BRUNO BOTELHO SALEH Matrícula: 3004619",
    ];
    const cab = extrairCabecalho(juntarContinuacoesCabecalho(linhas));
    assert.equal(cab.setorRequisitante, "AGÊNCIA MUNICIPAL DE REGULAÇÃO DOS SERVIÇOS PÚBLICOS DE ÁGUA E ESGOTO - AMAE");
    assert.equal(cab.siglaSetor, null); // 1º trecho longo (70) não é sigla — nunca estoura o limite do servidor
    assert.equal(cab.responsavel, "BRUNO BOTELHO SALEH");
    // Sem outro rótulo depois (ex.: a tabela logo abaixo), nada é colado.
    const semRotulo = juntarContinuacoesCabecalho(["Setor Requisitante: SME - EDUCAÇÃO", "ITEM CÓDIGO DESCRIÇÃO", "1 999 PRODUTO"]);
    assert.equal(semRotulo[0], "Setor Requisitante: SME - EDUCAÇÃO");
    // A "Data:" da coluna da direita fica depois do valor inteiro.
    const comData = extrairCabecalho(
      juntarContinuacoesCabecalho(["Setor Requisitante: SECRETARIA DE Data: 31/08/2026", "CULTURA", "Responsável pela Demanda: X"]),
    );
    assert.equal(comData.setorRequisitante, "SECRETARIA DE CULTURA");
  });

  it("Matrícula/e-mail/telefone VAZIOS no cabeçalho ficam vazios (nunca o ':' nem os da equipe do §8)", () => {
    const cab = extrairCabecalho([
      "Responsável pela Demanda: HERICA CRISTINA RODRIGUES RIBEIRO Matrícula:",
      "E-mail: Telefone:",
      "8 - INDICAÇÃO DO(S) INTEGRANTE(S) DA EQUIPE DE PLANEJAMENTO",
      "Nome: KATYUSCE",
      "Matrícula: 3010035",
      "Email: katy@rioverde.go.gov.br",
    ]);
    assert.equal(cab.matricula, null);
    assert.equal(cab.email, null);
    assert.equal(cab.telefone, null);
    assert.equal(extrairCabecalho(["Responsável pela Demanda: X Matrícula: 3004619"]).matricula, "3004619");
  });
});
