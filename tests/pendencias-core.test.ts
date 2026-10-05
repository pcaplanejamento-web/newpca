import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { regrasPadrao } from "../src/lib/avaliacao-core.ts";
import type { ConferenciaItem } from "../src/lib/catalogo-conferencia.ts";
import { conciliacaoCapa, contarMensagens, linhasRelatorioProtocolo, mensagensDfd } from "../src/lib/dfd-tratamento.ts";
import { montarDocumento, PAGINA_A4 } from "../src/lib/documento-pdf-core.ts";
import {
  blocosPendenciasPdf,
  contarDfd,
  contarProtocolo,
  pendenciaDaCapa,
  pendenciasDoDfd,
  pendenciasDoItemSolo,
  soErros,
  textoPendencias,
} from "../src/lib/pendencias-core.ts";

const item = (n: number, o: Partial<{ codigo: string; descricao: string; unidade: string; quantidade: number | null; valorUnitario: number | null }> = {}) => ({
  item: n,
  codigo: o.codigo ?? String(1000 + n),
  descricao: o.descricao ?? `ITEM ${n}`,
  unidade: o.unidade ?? "UN",
  quantidade: o.quantidade === undefined ? 1 : o.quantidade,
  valorUnitario: o.valorUnitario === undefined ? 10 : o.valorUnitario,
  valorTotal: 10,
});

function dfd() {
  return {
    chave: 7,
    numero: "1209",
    planejamento: "1509",
    tipo: "DFD-S",
    reparticaoId: 3,
    anoPca: 2027,
    itens: [
      item(1),
      item(2, { valorUnitario: null }),
      item(3, { quantidade: null, valorUnitario: 0 }),
      item(4, { codigo: "555", descricao: "CANETA", unidade: "UN" }),
      item(5, { codigo: "555", descricao: "CANETA", unidade: "UN" }),
      item(6, { codigo: "999" }),
    ],
    secoes: [
      { numero: 3, titulo: "JUSTIFICATIVA DA NECESSIDADE DA AQUISIÇÃO", texto: "Necessário" },
      { numero: 5, titulo: "PREVISÃO DE ENTREGA/EXECUÇÃO", texto: "ANUAL" },
      { numero: 6, titulo: "PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", texto: "URGENTISSIMA" },
      { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
    ],
  };
}
const conf = new Map<string, ConferenciaItem>([["999", { faltas: ["naoCatalogado"], divergDescricao: false, divergUnidade: false, sugestao: null }]]);

describe("pendenciasDoDfd — o DFD é a SOMA dos itens", () => {
  const d = dfd();
  const msgs = mensagensDfd(d, regrasPadrao(), { conformidade: conf });
  const p = pendenciasDoDfd(d, msgs, conf);

  it("a contagem do DFD é a MESMA das mensagens (régua única)", () => {
    const c = contarMensagens(msgs);
    assert.deepEqual(contarDfd(p), { erros: c.erro, atencoes: c.atencao });
  });
  it("cada item com pendência aparece com os problemas dele e o alvo no campo", () => {
    const porItem = new Map(p.itens.map((x) => [x.item, x]));
    assert.deepEqual([...porItem.keys()], [2, 3, 4, 5, 6]);
    assert.equal(porItem.get(3)?.problemas.length, 2);
    assert.deepEqual(porItem.get(2)?.problemas[0].alvo, { dfd: 7, item: 1, ancora: "valorUnitario" });
    assert.match(porItem.get(4)?.problemas[0].texto ?? "", /igual ao item 5/);
    assert.equal(porItem.get(6)?.problemas[0].alvo.ancora, "catalogo");
    assert.equal(porItem.get(2)?.status, "erro");
    assert.equal(porItem.get(4)?.status, "atencao");
  });
  it("a seção fora do padrão leva o CONTEÚDO atual e a âncora da seção", () => {
    const pr = p.pendencias.find((x) => x.chave === "dfd.prioridade");
    assert.equal(pr?.contexto, "URGENTISSIMA");
    assert.equal(pr?.alvo.ancora, "prioridade");
    assert.match(pr?.onde ?? "", /Seção 6/);
  });
  it("ponto em 'ignorar' some", () => {
    const r = regrasPadrao();
    r.pontos["item.duplicado"] = "ignorar";
    const p2 = pendenciasDoDfd(d, mensagensDfd(d, r, { conformidade: conf }), conf);
    assert.ok(!p2.itens.some((x) => x.problemas.some((y) => y.chave === "item.duplicado")));
  });
});

describe("protocolo = capa + SOMA dos DFDs; texto e PDF", () => {
  const d = dfd();
  const p1 = pendenciasDoDfd(d, mensagensDfd(d, regrasPadrao(), { conformidade: conf }), conf, ["Informar o VALOR UNITÁRIO dos itens 2, 3."]);
  const conc = conciliacaoCapa({ valorCapa: 10, somatorio: 60, totalDfds: 1 });
  const proto = { numero: "144756/2026", idExterno: "999", interessado: "SEMED", assunto: "INCLUSÃO", capa: pendenciaDaCapa(conc, 10), dfds: [p1] };

  it("contagem = capa + DFDs", () => {
    const c = contarDfd(p1);
    assert.deepEqual(contarProtocolo(proto), { erros: c.erros + 1, atencoes: c.atencoes });
    assert.match(proto.capa?.contexto ?? "", /Somatória dos DFDs/);
  });
  it("despacho = o despacho de sempre + Respeitosamente", () => {
    const t = textoPendencias(proto, "despacho");
    const base = linhasRelatorioProtocolo({
      numero: proto.numero,
      idExterno: proto.idExterno,
      interessado: proto.interessado,
      assunto: proto.assunto,
      capaMotivo: proto.capa?.texto ?? null,
      dfds: [{ numero: "1209", planejamento: "1509", tipo: "DFD-S", faltas: ["Informar o VALOR UNITÁRIO dos itens 2, 3."] }],
    }).join("\n");
    assert.equal(t, `${base}\n\nRespeitosamente`);
  });
  it("WhatsApp: negrito e marcadores; lista: hierarquia com o lugar", () => {
    const w = textoPendencias(proto, "whatsapp");
    assert.match(w, /^\*Pendências — Protocolo 144756\/2026\*/);
    assert.match(w, /\*DFD 1209 \(Planej\. 1509\) — DFD-S\*/);
    assert.match(w, /◦ Item 2 \(cód\. 1002\): Sem valor unitário/);
    const l = textoPendencias(proto, "lista");
    assert.match(l, /\[Prioridade da compra\/contratação \(Seção 6\)\]/);
  });
  it("só erros tira as atenções", () => {
    const e = soErros(proto);
    assert.equal(contarProtocolo(e).atencoes, 0);
    assert.ok(!e.dfds[0].itens.some((x) => x.item === 4));
  });
  it("PDF: tabela dos itens com a célula que falta colorida, sem cortar", () => {
    const { blocos } = blocosPendenciasPdf(proto);
    const tabelas = blocos.filter((b) => b.tipo === "tabela");
    assert.equal(tabelas.length, 2);
    const itens = tabelas[1];
    assert.ok(itens.tipo === "tabela");
    const linha2 = itens.linhas.find((x) => x.celulas[0] === "2");
    assert.equal(linha2?.celulas[5], "falta");
    assert.ok(linha2?.cores?.[5]);
    const medir = (t: string, tam: number) => t.length * tam * 0.5;
    const pgs = montarDocumento(blocos, medir, { titulo: "T", rodape: "R" });
    for (const pg of pgs) for (const o of pg) if (o.t === "texto") assert.ok(o.x + medir(o.texto, o.tam) <= PAGINA_A4.largura - PAGINA_A4.margem + 1);
  });
});

describe("pendenciasDoItemSolo — o banner do item", () => {
  it("cada problema aponta o CAMPO do item; a contagem é a do item", () => {
    const d = pendenciasDoItemSolo({ chave: 7, numero: "1209", planejamento: "1509", tipo: "DFD-S" }, item(3, { quantidade: null, valorUnitario: null }), 2, [
      { chave: "item.valorUnitario", status: "erro", texto: "Item sem valor unitário." },
      { chave: "item.quantidade", status: "erro", texto: "Item sem quantidade." },
      { chave: "item.naoCatalogado", status: "atencao", texto: "Fora do catálogo" },
    ]);
    assert.deepEqual(contarDfd(d), { erros: 2, atencoes: 1 });
    assert.deepEqual(d.itens[0].problemas.map((p) => p.alvo.ancora), ["valorUnitario", "quantidade", "catalogo"]);
    assert.match(textoPendencias({ numero: "", capa: null, dfds: [d] }, "despacho", "item"), /Item 3 \(cód\. 1003\): Item sem valor unitário\.; Item sem quantidade\./);
  });
  it("sem problema: nada a listar", () => {
    const d = pendenciasDoItemSolo({ chave: 7, numero: "1", planejamento: null, tipo: null }, item(1), 0, []);
    assert.equal(d.itens.length, 0);
  });
});
