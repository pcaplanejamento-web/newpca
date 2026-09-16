import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { regrasPadrao } from "../src/lib/avaliacao-core.ts";
import {
  contarMensagens,
  dfdRSemReferencia,
  estadoDfd,
  estadoItem,
  estadoProtocolo,
  faltasCirurgicasDfd,
  faltasDoItem,
  itemComErro,
  linhasRelatorioDfd,
  linhasRelatorioProtocolo,
  mensagensDfd,
  situacaoProtocolo,
} from "../src/lib/dfd-tratamento.ts";
import { tipoCurtoDfd } from "../src/lib/parse-dfd-comum.ts";

const item = (over: Record<string, unknown> = {}) => ({
  item: 1,
  codigo: "C1",
  descricao: "D",
  unidade: "UN",
  quantidade: 2,
  valorUnitario: 5,
  valorTotal: 10,
  ...over,
});

describe("tipoCurtoDfd", () => {
  it("extrai o código curto do tipo", () => {
    assert.equal(tipoCurtoDfd("DFD-S — Solução / com ETP"), "DFD-S");
    assert.equal(tipoCurtoDfd("DFD-R — Renovação / Ata vigente"), "DFD-R");
    assert.equal(tipoCurtoDfd("dfd-o algo"), "DFD-O");
    assert.equal(tipoCurtoDfd("DFD-E"), "DFD-E");
  });
  it("null quando não casa", () => {
    assert.equal(tipoCurtoDfd(null), null);
    assert.equal(tipoCurtoDfd("qualquer coisa"), null);
    assert.equal(tipoCurtoDfd("DFD-X"), null); // só S/R/O/E
  });
});

describe("estado por item", () => {
  it("regular quando tem valor unitário e quantidade", () => {
    assert.equal(itemComErro(item()), false);
    assert.equal(estadoItem(item()), "regular");
    assert.deepEqual(faltasDoItem(item()), []);
  });
  it("erro quando falta valor unitário", () => {
    assert.equal(itemComErro(item({ valorUnitario: null })), true);
    assert.equal(estadoItem(item({ valorUnitario: 0 })), "erro");
    assert.deepEqual(faltasDoItem(item({ valorUnitario: null })), ["valor unitário"]);
  });
  it("erro quando falta quantidade", () => {
    assert.deepEqual(faltasDoItem(item({ quantidade: null })), ["quantidade"]);
    assert.deepEqual(faltasDoItem(item({ valorUnitario: null, quantidade: null })), ["valor unitário", "quantidade"]);
  });
});

describe("estado/situação do protocolo", () => {
  it("regular quando a capa bate com a somatória", () => {
    assert.equal(estadoProtocolo({ valorCapa: 1000, valorTotal: 1000, totalDfds: 3 }), "regular");
  });
  it("atenção quando a capa está zerada ou diverge", () => {
    assert.equal(estadoProtocolo({ valorCapa: 0, valorTotal: 1000, totalDfds: 3 }), "atencao");
    assert.equal(estadoProtocolo({ valorCapa: null, valorTotal: 1000, totalDfds: 3 }), "atencao");
    assert.equal(estadoProtocolo({ valorCapa: 900, valorTotal: 1000, totalDfds: 3 }), "atencao");
  });
  it("sem DFDs → regular (nada a conferir) e situação Vazio", () => {
    assert.equal(estadoProtocolo({ valorCapa: null, valorTotal: 0, totalDfds: 0 }), "regular");
    assert.equal(situacaoProtocolo({ totalDfds: 0 }), "vazio");
    assert.equal(situacaoProtocolo({ totalDfds: 2 }), "preenchido");
  });
});

describe("dfdRSemReferencia (atenção do DFD-R) + estadoDfd", () => {
  it("DFD-R sem nenhuma referência → true", () => {
    assert.equal(
      dfdRSemReferencia({ tipo: "DFD-R — Renovação", numeroContrato: null, numeroAta: null, numeroLicitacao: null }),
      true,
    );
  });
  it("DFD-R com qualquer referência → false", () => {
    assert.equal(dfdRSemReferencia({ tipo: "DFD-R", numeroContrato: "860/2025", numeroAta: null, numeroLicitacao: null }), false);
    assert.equal(dfdRSemReferencia({ tipo: "DFD-R", numeroContrato: null, numeroAta: "45/2025", numeroLicitacao: null }), false);
    assert.equal(dfdRSemReferencia({ tipo: "DFD-R", numeroContrato: null, numeroAta: null, numeroLicitacao: "12/2025" }), false);
  });
  it("não é DFD-R (S/O/E) → nunca é atenção por referência", () => {
    assert.equal(dfdRSemReferencia({ tipo: "DFD-S — Solução", numeroContrato: null, numeroAta: null, numeroLicitacao: null }), false);
    assert.equal(dfdRSemReferencia({ tipo: null }), false);
  });
  it("estadoDfd: erro > atenção > editado > regularizado > regular", () => {
    assert.equal(estadoDfd(1, true, true, true), "erro"); // faltas manda
    assert.equal(estadoDfd(0, true, true, true), "atencao"); // atenção acima de editado/auto
    assert.equal(estadoDfd(0, true, true, false), "editado");
    assert.equal(estadoDfd(0, true, false, false), "regularizado");
    assert.equal(estadoDfd(0, false, false, false), "regular");
  });
});

describe("faltasCirurgicasDfd (cirúrgico + acionável)", () => {
  const sec = (titulo: string, texto: string) => ({ numero: 0, titulo, texto });
  it("aponta os itens e o que fazer", () => {
    const faltas = faltasCirurgicasDfd({
      itens: [item({ item: 3, valorUnitario: null }), item({ item: 5, valorUnitario: 0 }), item({ item: 7, quantidade: null })],
      secoes: [],
      reparticaoId: 1,
    });
    const txt = faltas.join("\n");
    assert.match(txt, /VALOR UNIT[ÁA]RIO dos itens 3, 5 \(Seção 4\)/);
    assert.match(txt, /QUANTIDADE do item 7 \(Seção 4\)/);
  });
  it("aponta repartição, seções e assinatura", () => {
    const faltas = faltasCirurgicasDfd({
      itens: [item()],
      secoes: [sec("JUSTIFICATIVA DA NECESSIDADE", "ok")], // só a 3 preenchida
      reparticaoId: null,
      assinaturaMotivo: "assinante não é responsável",
    });
    const txt = faltas.join("\n");
    assert.match(txt, /Vincular o DFD à repartição/);
    assert.match(txt, /Preencher a Previsão de entrega\/execução \(Seção 5\)/);
    assert.match(txt, /Preencher a Prioridade/);
    assert.match(txt, /Preencher a Fundamentação legal/);
    assert.doesNotMatch(txt, /Justificativa/); // a 3 está preenchida
    assert.match(txt, /Regularizar a assinatura digital: assinante não é responsável/);
  });
  it("DFD completo → sem faltas", () => {
    const secs = [
      sec("JUSTIFICATIVA", "j"),
      sec("PREVISÃO DE ENTREGA", "MARÇO/2027"),
      sec("PRIORIDADE", "ALTA"),
      sec("FUNDAMENTAÇÃO LEGAL", "Lei 14.133/2021"),
    ];
    assert.deepEqual(faltasCirurgicasDfd({ itens: [item()], secoes: secs, reparticaoId: 1 }), []);
  });
});

describe("relatório de erros (copiável)", () => {
  it("DFD: cabeçalho + lista cirúrgica de pendências", () => {
    const linhas = linhasRelatorioDfd({
      numero: "531",
      planejamento: "600",
      tipo: "DFD-S — Solução",
      faltas: ["Informar o VALOR UNITÁRIO do item 3 (Seção 4).", "Vincular o DFD à repartição/Setor requisitante responsável."],
    });
    const txt = linhas.join("\n");
    assert.match(txt, /DFD 531 \(DFD-S\) — Planejamento 600/);
    assert.match(txt, /Pendências a corrigir:/);
    assert.match(txt, /1\. Informar o VALOR UNITÁRIO do item 3/);
  });
  it("DFD sem pendências → 'Sem pendências.'", () => {
    const linhas = linhasRelatorioDfd({ numero: "1", faltas: [] });
    assert.equal(linhas[linhas.length - 1], "Sem pendências.");
  });
  it("Protocolo: DESPACHO com capa + DFDs cirúrgicos", () => {
    const linhas = linhasRelatorioProtocolo({
      numero: "97608/2026",
      idExterno: "2273524",
      interessado: "FUNDO MUNICIPAL DE SAÚDE",
      assunto: "INCLUSÃO - PCA",
      capaMotivo: "Valor da capa ausente/zerado — informar o valor da capa.",
      dfds: [{ numero: "531", tipo: "DFD-R", faltas: ["Informar o VALOR UNITÁRIO dos itens 3, 5 (Seção 4)."] }],
    });
    const txt = linhas.join("\n");
    assert.match(txt, /DESPACHO DE DEVOLUÇÃO PARA CORREÇÃO/);
    assert.match(txt, /Processo nº 97608\/2026 \(Id 2273524\)/);
    assert.match(txt, /Interessado: FUNDO MUNICIPAL DE SAÚDE/);
    assert.match(txt, /1\. CAPA DO PROCESSO: Valor da capa ausente\/zerado/);
    assert.match(txt, /2\. DFD 531 \(DFD-R\):/);
    assert.match(txt, /- Informar o VALOR UNITÁRIO dos itens 3, 5/);
    assert.match(txt, /reencaminhe-se o processo/);
  });
});

describe("mensagensDfd (painel de mensagens: erro/atenção/acerto)", () => {
  const secOk = [
    { numero: 3, titulo: "JUSTIFICATIVA DA NECESSIDADE", texto: "x" },
    { numero: 5, titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "ANUAL" },
    { numero: 6, titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "ALTA" },
    { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
  ];
  const base = {
    itens: [item({ item: 1, valorUnitario: 10, quantidade: 2 })],
    secoes: secOk,
    reparticaoId: 3,
    tipo: "DFD-S",
    anoPca: 2026,
    valorEstimado: 20,
    valorTotal: 20,
    assinatura: { status: "ok" as const },
  };

  it("DFD-S completo → só acertos, todas com âncora; sem referência de renovação", () => {
    const msgs = mensagensDfd(base);
    assert.ok(msgs.length >= 6);
    assert.ok(msgs.every((m) => m.status === "acerto"));
    assert.ok(msgs.every((m) => typeof m.ancora === "string" && m.ancora.length > 0));
    assert.equal(
      msgs.some((m) => m.chave === "dfd.referenciaRenovacao"),
      false,
    );
  });

  it("faltas fundamentais viram ERRO; DFD-R sem referência vira ATENÇÃO", () => {
    const msgs = mensagensDfd({
      ...base,
      tipo: "DFD-R",
      reparticaoId: null,
      itens: [item({ valorUnitario: null })],
    });
    const c = contarMensagens(msgs);
    assert.ok(c.erro >= 2); // repartição + valor unitário (fundamentais no padrão)
    assert.ok(
      msgs.some((m) => m.chave === "dfd.referenciaRenovacao" && m.status === "atencao"),
    );
    assert.ok(msgs.some((m) => m.chave === "dfd.reparticao" && m.status === "erro" && m.ancora === "reparticao"));
  });

  it("respeita o nível 'ignorar' do ADM (o ponto some da lista)", () => {
    const regras = { ...regrasPadrao(), pontos: { "item.quantidade": "ignorar" as const } };
    const msgs = mensagensDfd({ ...base, itens: [item({ quantidade: null })] }, regras);
    assert.equal(
      msgs.some((m) => m.chave === "item.quantidade"),
      false,
    );
  });
})
