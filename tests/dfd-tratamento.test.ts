import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { regrasPadrao } from "../src/lib/avaliacao-core.ts";
import type { ConferenciaItem } from "../src/lib/catalogo-conferencia.ts";
import {
  algumCatalogoFundamental,
  avaliarDfd,
  bloqueantesCatalogo,
  contarMensagens,
  dfdRSemReferencia,
  editarItemDfd,
  estadoDfd,
  ESTADO_PROTOCOLO_ROTULO,
  estadoItem,
  estadoProtocoloCor,
  faltasCirurgicasDfd,
  faltasDoItem,
  itemComErro,
  linhasRelatorioDfd,
  linhasRelatorioProtocolo,
  mensagensDfd,
  normalizarSecoesDfd,
  situacaoSecao,
  textoPlanejamentos,
  veredictoLinhaCatalogo,
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

describe("estado do protocolo — rótulo e cor", () => {
  it("três estados (a situação é de gestão, cadastrada pelo ADM)", () => {
    assert.deepEqual(ESTADO_PROTOCOLO_ROTULO, { erro: "Com erro", atencao: "Atenção", regular: "Regular" });
    assert.equal(estadoProtocoloCor("erro"), "var(--danger)");
    assert.equal(estadoProtocoloCor("atencao"), "var(--warn)");
    assert.equal(estadoProtocoloCor("regular"), "var(--ok)");
  });
});

describe("editarItemDfd (edição de item + recomputo do total)", () => {
  const dfd: { itens: { item: number; valorTotal: number | null }[]; valorTotal: number | null } = {
    itens: [
      { item: 1, valorTotal: 100 },
      { item: 2, valorTotal: 50 },
    ],
    valorTotal: 150,
  };
  it("edita o item pelo índice e mantém os demais", () => {
    const d = editarItemDfd(dfd, 0, { valorTotal: 300, descricao: "NOVA" } as Partial<(typeof dfd.itens)[number]>);
    assert.equal(d.itens[0].valorTotal, 300);
    assert.equal(d.itens[1].valorTotal, 50);
  });
  it("recomputa o valorTotal do DFD = Σ itens", () => {
    const p = (v: number | null): Partial<(typeof dfd.itens)[number]> => ({ valorTotal: v });
    assert.equal(editarItemDfd(dfd, 1, p(200)).valorTotal, 300); // 100 + 200
    assert.equal(editarItemDfd(dfd, 0, p(null)).valorTotal, 50); // null + 50
    assert.equal(editarItemDfd(dfd, 0, p(0)).itens[0].valorTotal, 0);
  });
  it("não muda o objeto original (puro)", () => {
    editarItemDfd(dfd, 0, { valorTotal: 999 } as Partial<(typeof dfd.itens)[number]>);
    assert.equal(dfd.itens[0].valorTotal, 100);
    assert.equal(dfd.valorTotal, 150);
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
      planejamento: "640",
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
      planejamento: "640",
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
    assert.deepEqual(faltasCirurgicasDfd({ planejamento: "640", itens: [item()], secoes: secs, reparticaoId: 1, tipo: "DFD-S" }), []);
    // DFD sem nº de planejamento: a linha do despacho diz o que fazer.
    assert.deepEqual(faltasCirurgicasDfd({ planejamento: null, itens: [item()], secoes: secs, reparticaoId: 1, tipo: "DFD-S" }), [
      "Informar o NÚMERO DE PLANEJAMENTO do DFD (corrigir no Centi e reenviar o DFD).",
    ]);
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
  it("Protocolo: DESPACHO com capa; agrupa DFDs de erro igual, referência = número + planejamento", () => {
    const linhas = linhasRelatorioProtocolo({
      numero: "97608/2026",
      idExterno: "2273524",
      interessado: "FUNDO MUNICIPAL DE SAÚDE",
      assunto: "INCLUSÃO - PCA",
      capaMotivo: "Valor da capa ausente/zerado — informar o valor da capa.",
      dfds: [
        { numero: "531", planejamento: "640", tipo: "DFD-R", faltas: ["Informar o VALOR UNITÁRIO dos itens 3, 5 (Seção 4)."] },
        { numero: "702", planejamento: "811", tipo: "DFD-S", faltas: ["Informar o VALOR UNITÁRIO dos itens 3, 5 (Seção 4)."] },
        { numero: "900", planejamento: "915", tipo: "DFD-S", faltas: ["Preencher a Justificativa (Seção 3)."] },
      ],
    });
    const txt = linhas.join("\n");
    assert.match(txt, /DESPACHO DE DEVOLUÇÃO PARA CORREÇÃO/);
    assert.match(txt, /Processo nº 97608\/2026 \(Id 2273524\)/);
    assert.match(txt, /Interessado: FUNDO MUNICIPAL DE SAÚDE/);
    assert.match(txt, /1\. CAPA DO PROCESSO: Valor da capa ausente\/zerado/);
    // 531 e 702 têm a MESMA pendência → uma ÚNICA mensagem (número + nº de planejamento de cada).
    assert.match(txt, /2\. DFDs 531 \(Planej\. 640\), 702 \(Planej\. 811\):/);
    assert.match(txt, /- Informar o VALOR UNITÁRIO dos itens 3, 5/);
    // 900 tem pendência diferente → mensagem própria (singular "DFD").
    assert.match(txt, /3\. DFD 900 \(Planej\. 915\):/);
    assert.match(txt, /- Preencher a Justificativa/);
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
    planejamento: "640",
    itens: [item({ item: 1, valorUnitario: 10, quantidade: 2 })],
    secoes: secOk,
    reparticaoId: 3,
    tipo: "DFD-S",
    anoPca: 2026,
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

  it("catálogo: só aponta problemas ATIVOS; um acerto único quando tudo confere; sem conformidade = igual a hoje", () => {
    const regras = regrasPadrao();
    const dCod = { ...base, itens: [item({ codigo: "1001", valorUnitario: 10, quantidade: 2 })] };
    // Tudo conforme → acerto único de catálogo.
    const okConf = new Map<string, ConferenciaItem>([["1001", cItem()]]);
    const msgsOk = mensagensDfd(dCod, regras, { conformidade: okConf });
    assert.ok(
      msgsOk.some((m) => m.chave === "item.naoCatalogado" && m.status === "acerto" && /conferem com o catálogo/i.test(m.texto)),
    );
    // Não catalogado → atenção (padrão), sem acerto de catálogo.
    const badConf = new Map<string, ConferenciaItem>([["1001", cItem({ faltas: ["naoCatalogado"] })]]);
    const msgsBad = mensagensDfd(dCod, regras, { conformidade: badConf });
    assert.ok(msgsBad.some((m) => m.chave === "item.naoCatalogado" && m.status === "atencao"));
    assert.equal(msgsBad.some((m) => m.chave === "item.naoCatalogado" && m.status === "acerto"), false);
    // INVARIANTE: sem conformidade não há nenhuma mensagem de catálogo (igual a hoje).
    const chavesCat = ["item.naoCatalogado", "item.divergenteCatalogo", "item.tipoIncompativel"];
    assert.equal(mensagensDfd(dCod, regras).some((m) => chavesCat.includes(m.chave)), false);
  });
});

const cItem = (over: Partial<ConferenciaItem> = {}): ConferenciaItem => ({
  faltas: [],
  divergDescricao: false,
  divergUnidade: false,
  sugestao: null,
  ...over,
});

describe("conformidade dos itens com o catálogo (veredito por linha + portão)", () => {
  const regras = regrasPadrao();
  const secOk = [
    { numero: 3, titulo: "JUSTIFICATIVA DA NECESSIDADE", texto: "x" },
    { numero: 5, titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "ANUAL" },
    { numero: 6, titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "ALTA" },
    { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
  ];

  it("veredictoLinhaCatalogo: null sem veredito; conforme; atenção no padrão; erro se fundamental; ignorar volta a conforme", () => {
    assert.equal(veredictoLinhaCatalogo(undefined, regras, "DFD-S"), null);
    assert.deepEqual(veredictoLinhaCatalogo(cItem(), regras, "DFD-S"), { nivel: "conforme", falta: null });
    assert.deepEqual(veredictoLinhaCatalogo(cItem({ faltas: ["naoCatalogado"] }), regras, "DFD-S"), {
      nivel: "atencao",
      falta: "naoCatalogado",
    });
    const rf = { ...regrasPadrao(), pontos: { "item.naoCatalogado": "fundamental" as const } };
    assert.deepEqual(veredictoLinhaCatalogo(cItem({ faltas: ["naoCatalogado"] }), rf, "DFD-S"), {
      nivel: "erro",
      falta: "naoCatalogado",
    });
    const ri = { ...regrasPadrao(), pontos: { "item.naoCatalogado": "ignorar" as const } };
    assert.deepEqual(veredictoLinhaCatalogo(cItem({ faltas: ["naoCatalogado"] }), ri, "DFD-S"), {
      nivel: "conforme",
      falta: null,
    });
  });

  it("veredictoLinhaCatalogo: escolhe a falta mais grave (naoCatalogado > tipoIncompativel > divergente)", () => {
    assert.equal(veredictoLinhaCatalogo(cItem({ faltas: ["divergenteCatalogo", "tipoIncompativel"] }), regras, "DFD-S")?.falta, "tipoIncompativel");
    assert.equal(veredictoLinhaCatalogo(cItem({ faltas: ["naoCatalogado", "tipoIncompativel"] }), regras, "DFD-S")?.falta, "naoCatalogado");
  });

  it("algumCatalogoFundamental: false no padrão; true só quando o ADM eleva um ponto item.*", () => {
    assert.equal(algumCatalogoFundamental(regras, { dfdTipo: "DFD-S" }), false);
    const rf = { ...regrasPadrao(), pontos: { "item.tipoIncompativel": "fundamental" as const } };
    assert.equal(algumCatalogoFundamental(rf, { dfdTipo: "DFD-S" }), true);
  });

  it("bloqueantesCatalogo: [] no padrão e sem conformidade; lista só os fundamentais presentes", () => {
    const conformidade = new Map<string, ConferenciaItem>([
      ["1001", cItem({ faltas: ["naoCatalogado"] })],
      ["1002", cItem({ faltas: ["divergenteCatalogo"] })],
    ]);
    const itens = [{ codigo: "1001" }, { codigo: "1002" }];
    assert.deepEqual(bloqueantesCatalogo(itens, conformidade, regras, { dfdTipo: "DFD-S" }), []);
    assert.deepEqual(bloqueantesCatalogo(itens, undefined, regras, { dfdTipo: "DFD-S" }), []);
    const rf = { ...regrasPadrao(), pontos: { "item.naoCatalogado": "fundamental" as const } };
    assert.deepEqual(bloqueantesCatalogo(itens, conformidade, rf, { dfdTipo: "DFD-S" }), ["Fora do catálogo"]);
    // Sem conformidade nunca bloqueia — mesmo com ponto fundamental (portão preguiçoso).
    assert.deepEqual(bloqueantesCatalogo(itens, undefined, rf, { dfdTipo: "DFD-S" }), []);
  });

  it("avaliarDfd: catálogo é ATENÇÃO no padrão (não bloqueia) e vira bloqueante só quando fundamental (invariante preservado)", () => {
    const conformidade = new Map<string, ConferenciaItem>([["1001", cItem({ faltas: ["naoCatalogado"] })]]);
    const d = {
      planejamento: "640",
      reparticaoId: 3,
      itens: [{ valorUnitario: 10, quantidade: 2, codigo: "1001", item: 1 }],
      secoes: secOk,
      tipo: "DFD-S",
    };
    // INVARIANTE: com/sem conformidade, os bloqueantes são idênticos no padrão.
    assert.deepEqual(avaliarDfd(d, regras).bloqueantes, avaliarDfd(d, regras, { conformidade }).bloqueantes);
    // A atenção aparece com conformidade.
    assert.ok(avaliarDfd(d, regras, { conformidade }).atencoes.some((a) => /não catalogado/i.test(a)));
    // Fundamental → entra em bloqueantes.
    const rf = { ...regrasPadrao(), pontos: { "item.naoCatalogado": "fundamental" as const } };
    assert.ok(avaliarDfd(d, rf, { conformidade }).bloqueantes.some((b) => /não catalogado/i.test(b)));
  });
});

// DFD 136 (pd101820 real): o formulário veio com "6 - FUNDAMENTAÇÃO LEGAL: BAIXA" e SEM a seção de
// prioridade — o texto é uma prioridade trocada de seção.
describe("normalizarSecoesDfd — seção trocada (fundamentação = prioridade)", () => {
  const base = {
    numero: "136", planejamento: "182", tipo: null, objeto: null, orgaoEntidade: null, setorRequisitante: null,
    siglaSetor: null, responsavel: null, matricula: null, email: null, telefone: null, anoPca: 2027,
    numeroContrato: null, numeroAta: null, numeroLicitacao: null, valorTotal: 10, nomeArquivo: "x.pdf",
    assinaturas: [], itens: [],
  };
  it("move a prioridade para a seção certa (auto) e deixa a fundamentação a tratar", () => {
    const { dfd, auto } = normalizarSecoesDfd({
      ...base,
      secoes: [
        { numero: 5, titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "12 meses - PCA 2027." },
        { numero: 6, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "BAIXA" },
      ],
    });
    assert.ok(auto.includes("prioridade"));
    assert.equal(situacaoSecao(dfd.secoes, "PRIORIDADE"), "ok");
    assert.equal(situacaoSecao(dfd.secoes, "FUNDAMENTACAO LEGAL"), "vazia");
    assert.equal(situacaoSecao(dfd.secoes, "PREVISAO DE ENTREGA", 2027), "ok");
  });
  it("não mexe quando a prioridade já existe", () => {
    const secoes = [
      { numero: 6, titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "ALTA" },
      { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "BAIXA" },
    ];
    const { dfd } = normalizarSecoesDfd({ ...base, secoes });
    assert.equal(situacaoSecao(dfd.secoes, "FUNDAMENTACAO LEGAL"), "invalida");
  });
});

describe("textoPlanejamentos (copiar os planejamentos selecionados)", () => {
  it("separa por ':' sem espaço nenhum, na ordem recebida", () => {
    assert.equal(textoPlanejamentos(["1525", "1549", "1554"]), "1525:1549:1554");
  });
  it("ignora vazios/traço, tira espaços internos e não repete", () => {
    assert.equal(textoPlanejamentos([" 1525 ", null, "", "—", "15 49", "1525", undefined, "1554"]), "1525:1549:1554");
  });
  it("sem planejamento ⇒ vazio (nada a copiar)", () => {
    assert.equal(textoPlanejamentos([null, "", "  "]), "");
  });
});
