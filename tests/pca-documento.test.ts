import assert from "node:assert/strict";
import { test } from "node:test";
import { montarPaginas, PAGINA_A4, PAGINA_A4_PAISAGEM, passosDasPaginas } from "../src/lib/documento-pdf-core.ts";
import { gerarDocumentoPdf } from "../src/lib/documento-pdf-gerar.ts";
import {
  blocosDocumentoPca,
  chaveClassificacao,
  configPadrao,
  type DadosDocumento,
  inteiroPorExtenso,
  itensEmOrdem,
  lerConfigDocumento,
  marcadoresDesconhecidos,
  previsaoDoItem,
  substituirMarcadores,
  textoConfig,
  textoSelo,
  totaisDocumento,
  valoresMarcadores,
  valorPorExtenso,
} from "../src/lib/pca-documento-core.ts";
import type { ItemRow } from "../src/lib/queries.ts";

const medir = (s: string, tam: number) => s.length * tam * 0.5;

/** Itens FORA de ordem (a lista do Dashboard vem pelo valor), com o nº de protocolo que NUNCA pode sair no documento. */
function dados(n = 250): DadosDocumento {
  const itens: ItemRow[] = Array.from({ length: n }, (_, k) => {
    const seq = n - k; // decrescente
    return {
      id: 1000 + k,
      idProduto: String(500000 + seq),
      sequencial: seq,
      nomeProduto: `ITEM ${seq} DESCRIÇÃO`,
      unidadeMedida: "UNIDADE",
      quantidade: 2,
      valorReferencia: 10.5,
      valorTotal: 21,
      classificacao: seq % 2 ? "material de consumo" : "Material  de Consumo ",
      dataDesejada: null,
      codigo: seq % 3 ? "SEMED" : "SMS",
      municipio: null,
      dfdNumero: `${100 + (seq % 5)}`,
      protocoloNumero: "PROT-999999/2026",
      mes: seq % 4 ? (seq % 12) + 1 : null,
      ano: 2026,
      anual: seq % 4 === 0,
      periodo: seq % 4 === 0 ? "ANUAL" : null,
      prioridade: seq % 2 ? "ALTA" : "BAIXA",
    };
  });
  return {
    pca: { id: 7, nome: "PCA 2026", ano: 2026 },
    itens,
    dfds: Array.from({ length: 5 }, (_, k) => ({
      numero: `${100 + k}`,
      planejamento: `${2000 + k}`,
      tipo: "DFD-O",
      sigla: "SEMED",
      objeto: "AQUISIÇÃO DE MATERIAL",
      justificativa: "Atender às escolas.",
      prioridade: "ALTA",
      previsao: "MAR/2026",
      itens: n / 5,
      valor: (n / 5) * 21,
    })),
    unidades: { SEMED: "Secretaria Municipal de Educação", SMS: "Secretaria Municipal de Saúde" },
  };
}

test("configuração: sem linha = o padrão DESLIGADO; qualquer JSON vira válido, com o sequencial sempre e ids únicos", () => {
  const p = lerConfigDocumento(null);
  assert.equal(p.ativo, false);
  assert.ok(p.secoes.length >= 4);
  const c = lerConfigDocumento({
    ativo: true,
    titulo: "",
    colunas: ["valorTotal", "valorTotal", "xpto"],
    secoes: [
      { id: "a", titulo: "Um", texto: "x", ativa: false },
      { id: "a", titulo: "Dois", texto: "y" },
      { titulo: "", texto: "" },
    ],
    automaticos: { dfds: false },
    expediente: [{ cargo: "Prefeito", nome: "" }, { cargo: "", nome: "" }],
  });
  assert.equal(c.ativo, true);
  assert.equal(c.titulo, configPadrao().titulo); // título vazio = o padrão
  assert.deepEqual(c.colunas, ["sequencial", "valorTotal"]);
  assert.deepEqual(c.secoes.map((s) => s.id), ["a", "ax"]);
  assert.equal(c.secoes[0].ativa, false);
  assert.equal(c.automaticos.dfds, false);
  assert.equal(c.automaticos.resumo, true);
  assert.deepEqual(c.expediente, [{ cargo: "Prefeito", nome: "" }]);
  // Canônica: a mesma configuração = o mesmo texto (o hash da emissão).
  assert.equal(textoConfig(c), textoConfig(lerConfigDocumento(JSON.parse(textoConfig(c)))));
});

test("valor por extenso", () => {
  assert.equal(valorPorExtenso(0), "zero real");
  assert.equal(valorPorExtenso(1), "um real");
  assert.equal(valorPorExtenso(0.01), "um centavo");
  assert.equal(valorPorExtenso(1234.56), "mil duzentos e trinta e quatro reais e cinquenta e seis centavos");
  assert.equal(valorPorExtenso(1_000_000), "um milhão de reais");
  assert.equal(valorPorExtenso(2_500_000.1), "dois milhões e quinhentos mil reais e dez centavos");
  assert.equal(inteiroPorExtenso(1_250_300), "um milhão, duzentos e cinquenta mil e trezentos");
  assert.equal(inteiroPorExtenso(100), "cem");
  assert.equal(inteiroPorExtenso(101), "cento e um");
  assert.equal(inteiroPorExtenso(1100), "mil e cem");
});

test("marcadores: troca os conhecidos, mantém e aponta os desconhecidos", () => {
  const d = dados(10);
  const v = valoresMarcadores(d, totaisDocumento(d), configPadrao(), "2026-03-05T15:00:00.000Z");
  assert.equal(substituirMarcadores("PCA {{ano}} · {{ itens }} itens · {{xyz}}", v), "PCA 2026 · 10 itens · {{xyz}}");
  assert.equal(v.data, "5 de março de 2026");
  assert.deepEqual(marcadoresDesconhecidos("{{ano}} {{xyz}} {{xyz}} {{abc}}"), ["xyz", "abc"]);
});

test("itens pelo SEQUENCIAL; classificação na mesma escrita vira UMA; previsão em texto", () => {
  const d = dados(30);
  assert.deepEqual(
    itensEmOrdem(d.itens).map((i) => i.sequencial),
    Array.from({ length: 30 }, (_, k) => k + 1),
  );
  assert.equal(chaveClassificacao(" material  de consumo"), chaveClassificacao("Material de Consumo"));
  assert.equal(chaveClassificacao(null), "NÃO CLASSIFICADO");
  assert.equal(previsaoDoItem({ mes: 3, ano: 2026 }), "MAR/2026");
  assert.equal(previsaoDoItem({ anual: true, periodo: "SEMESTRAL" }), "SEMESTRAL");
  assert.equal(previsaoDoItem({ dataDesejada: null }), "—");
  const t = totaisDocumento(d);
  assert.equal(t.itens, 30);
  assert.equal(t.valor, 630);
  assert.equal(t.classificacoes, 1);
  assert.equal(t.unidades, 2);
});

test("blocos: TODOS os itens, pelo sequencial, com o total; sem protocolo; DFD com o planejamento", () => {
  const d = dados(250);
  const b = blocosDocumentoPca(d, configPadrao(), { codigo: "ABC123", emitidoEm: "2026-03-05T15:00:00.000Z", url: "https://x/pca/documento/verificar/ABC123", selo: "s" }, "2026-03-05T15:00:00.000Z");
  const tabelas = b.filter((x) => x.tipo === "tabela");
  const itens = tabelas.at(-1);
  assert.ok(itens && itens.tipo === "tabela");
  assert.equal(itens.linhas.length, 251); // 250 + o TOTAL
  assert.deepEqual(
    itens.linhas.slice(0, 250).map((l) => Number(l.celulas[0])),
    Array.from({ length: 250 }, (_, k) => k + 1),
  );
  const total = itens.linhas[250];
  assert.equal(total.destaque, true);
  assert.ok(total.celulas.includes("R$ 5.250,00".replace(/ /g, " ")) || total.celulas.some((c) => c.includes("5.250,00")));
  // O nº do protocolo NUNCA aparece no documento.
  assert.equal(JSON.stringify(b).includes("PROT-999999"), false);
  // Nº do DFD e nº de planejamento em colunas PRÓPRIAS, item a item.
  const cab = itens.colunas.map((c) => c.titulo);
  const iDfd = cab.indexOf("Nº DFD");
  const iPlan = cab.indexOf("Nº planejamento");
  assert.ok(iDfd > 0 && iPlan > 0);
  assert.ok(itens.linhas.some((l) => l.celulas[iDfd] === "101" && l.celulas[iPlan] === "2001"));
  // A página deitada antes dos itens e de volta em pé depois.
  const iPag = b.findIndex((x) => x.tipo === "pagina" && x.paisagem);
  assert.ok(iPag > 0 && b.findIndex((x) => x === itens) > iPag);
  // A prévia (sem emissão) sai marcada e sem o registro.
  const previa = blocosDocumentoPca(d, configPadrao(), null, "2026-03-05T15:00:00.000Z");
  assert.ok(JSON.stringify(previa).includes("PRÉVIA"));
  assert.equal(previa.some((x) => x.tipo === "quadro"), false);
});

test("layout: capa, páginas deitadas só na relação dos itens, numeração contínua e nenhuma página em branco no fim", () => {
  const d = dados(400);
  const b = blocosDocumentoPca(d, configPadrao(), { codigo: "ABC", emitidoEm: "2026-03-05T15:00:00.000Z", url: "u", selo: "s" }, "2026-03-05T15:00:00.000Z");
  const { paginas, tamanhos } = montarPaginas(b, medir, { titulo: "PCA", rodape: "r" });
  assert.equal(paginas.length, tamanhos.length);
  assert.equal(tamanhos[0].largura, PAGINA_A4.largura); // a capa em pé
  assert.ok(tamanhos.some((t) => t.largura === PAGINA_A4_PAISAGEM.largura));
  assert.equal(tamanhos.at(-1)?.largura, PAGINA_A4.largura); // o fecho volta em pé
  paginas.forEach((p, i) => {
    assert.ok(p.some((o) => o.t === "texto" && o.texto === `Página ${i + 1} de ${paginas.length}`));
    // Nada além da largura da página.
    for (const o of p) if (o.t === "texto") assert.ok(o.x >= 0 && o.x < tamanhos[i].largura);
  });
  // Os itens que aparecem: os 400 sequenciais, uma vez cada.
  const seqs = new Set<string>();
  for (const [i, p] of paginas.entries())
    if (tamanhos[i].largura === PAGINA_A4_PAISAGEM.largura) for (const o of p) if (o.t === "texto" && /^ITEM \d+ DESCRIÇÃO$/.test(o.texto)) seqs.add(o.texto);
  assert.equal(seqs.size, 400);
});

test("o PDF sai com páginas em pé e deitadas e o andamento por etapa", async () => {
  const d = dados(60);
  const b = blocosDocumentoPca(d, configPadrao(), null, "2026-03-05T15:00:00.000Z");
  const etapas = new Set<string>();
  const bytes = await gerarDocumentoPdf({ titulo: "PCA", blocos: b }, { rodape: "r", sistema: "s", data: new Date("2026-03-05T15:00:00Z"), onProgresso: (p) => etapas.add(p.etapa) });
  assert.ok(bytes.length > 1000);
  assert.deepEqual([...etapas], ["montando", "desenhando", "salvando"]);
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(() => gerarDocumentoPdf({ titulo: "PCA", blocos: b }, { rodape: "r", sistema: "s", sinal: ctl.signal, onProgresso: () => {} }));
});

test("selo: o texto canônico muda com qualquer número da emissão", () => {
  const base = { codigo: "C", pcaId: 1, emitidoEm: "2026-01-01T00:00:00.000Z", itens: 10, valor: 1.5, dfds: 2, dadosHash: "h", configHash: "k" };
  assert.equal(textoSelo(base), textoSelo({ ...base }));
  for (const [k, v] of Object.entries({ codigo: "D", itens: 11, valor: 1.5001, dfds: 3, dadosHash: "x", configHash: "y" })) assert.notEqual(textoSelo({ ...base, [k]: v }), textoSelo(base));
});

test("auditoria: prévia com os NÚMEROS do PCA inteiro; prioridade canônica; cronograma só do exercício; marcadores do protótipo", () => {
  const d = dados(100);
  const b = blocosDocumentoPca(d, configPadrao(), null, "2026-03-05T15:00:00.000Z", { itens: 10, dfds: 2 });
  const itens = b.filter((x) => x.tipo === "tabela").at(-1);
  assert.ok(itens && itens.tipo === "tabela");
  assert.equal(itens.linhas.length, 11); // 10 + o TOTAL do PCA inteiro
  assert.ok(itens.linhas[10].celulas.some((c) => c.includes("2.100,00")));
  assert.ok(JSON.stringify(b).includes("mostrando 10 de 100 itens"));

  const mista = dados(4);
  mista.itens[0].prioridade = "Média";
  mista.itens[1].prioridade = "MEDIA ";
  mista.itens[2].prioridade = "média";
  mista.itens[3].prioridade = "ALTA";
  mista.itens[0].mes = 3;
  mista.itens[0].ano = 2027;
  const bm = blocosDocumentoPca(mista, configPadrao(), null, "2026-03-05T15:00:00.000Z");
  const s = JSON.stringify(bm);
  assert.equal(s.includes("MEDIA"), false);
  assert.ok(s.includes("Outro exercício — MAR/2027"));

  const v = valoresMarcadores(d, totaisDocumento(d), configPadrao(), "2026-03-05T15:00:00.000Z");
  assert.equal(substituirMarcadores("{{constructor}} {{toString}}", v), "{{constructor}} {{toString}}");
  assert.deepEqual(marcadoresDesconhecidos("{{constructor}}"), ["constructor"]);
});

test("auditoria: os campos públicos do item não levam protocolo nem id interno", async () => {
  const { CAMPOS_ITEM_DOCUMENTO } = await import("../src/lib/pca-documento-core.ts");
  for (const c of ["protocoloNumero", "protocoloIdExterno", "dfdId", "itemNumero", "id"]) assert.equal((CAMPOS_ITEM_DOCUMENTO as readonly string[]).includes(c), false, c);
});

test("auditoria: a montagem em passos dá o MESMO resultado da montagem direta", () => {
  const b = blocosDocumentoPca(dados(600), configPadrao(), null, "2026-03-05T15:00:00.000Z");
  const direto = montarPaginas(b, medir, { titulo: "PCA", rodape: "r" });
  const g = passosDasPaginas(b, medir, { titulo: "PCA", rodape: "r" });
  let passos = 0;
  let r = g.next();
  while (!r.done) {
    passos++;
    r = g.next();
  }
  assert.ok(passos >= 2);
  assert.deepEqual(r.value, direto);
});
