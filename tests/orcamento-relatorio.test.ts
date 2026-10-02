import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { montarDocumento, PAGINA_A4 } from "../src/lib/documento-pdf-core.ts";
import { blocosRelatorioOrcamento, regraDoVinculo, relatorioOrcamentoPca, situacaoVinculo } from "../src/lib/orcamento-relatorio.ts";
import { aplicarVisao } from "../src/lib/orcamento-visao.ts";
import { chaveVinculo, mapaVinculos, unidadeDoLancamento, type VinculoOrcamento } from "../src/lib/orcamento-vinculo.ts";

const L = [
  { unidade: "2 - SEMED", acao: "2001 - MANTER ESCOLAS", fonte: "100", nomeElemento: "MATERIAL", valor: 1000 },
  { unidade: "2 - SEMED", acao: "2001 - MANTER ESCOLAS", fonte: "150", nomeElemento: "MATERIAL", valor: 500 },
  { unidade: "2 - SEMED", acao: "2002 - TRANSPORTE", fonte: "100", nomeElemento: "SERVICO", valor: 300 },
  { unidade: "2 - SEMED", acao: "2003 - MERENDA", fonte: "100", nomeElemento: "MATERIAL", valor: 200 },
  { unidade: "5 - SEMUS", acao: "3001 - HOSPITAL", fonte: "100", nomeElemento: "MATERIAL", valor: 700 },
  { unidade: "9 - SEMAD", acao: "4001 - ADM", fonte: "100", nomeElemento: "MATERIAL", valor: 50 },
];
const k = chaveVinculo;
const V: VinculoOrcamento[] = [
  // SEMED: TRANSPORTE vai à unidade 2 (explícita); as demais à 1, menos MERENDA (fica sem vínculo).
  { id: 1, chave: k("2 - SEMED"), texto: "2 - SEMED", alvoId: 1, acoes: null, acoesFora: [k("2003 - MERENDA")] },
  { id: 2, chave: k("2 - SEMED"), texto: "2 - SEMED", alvoId: 2, acoes: [k("2002 - TRANSPORTE"), k("2099 - SEM LANCAMENTO")], acoesFora: [] },
  { id: 3, chave: k("5 - SEMUS"), texto: "5 - SEMUS", alvoId: 3, acoes: null, acoesFora: [] },
];
const U = [
  { id: 1, sigla: "SEMED", nome: "Educação", orgaoSigla: "PMRV" },
  { id: 2, sigla: "TRANSP", nome: "Transporte escolar", orgaoSigla: "PMRV" },
  { id: 3, sigla: "SEMUS", nome: "Saúde", orgaoSigla: "FMS" },
  { id: 4, sigla: "SEMAD", nome: "Administração", orgaoSigla: "PMRV" },
];
const entrada = (filtros = { fonte: ["100"] }) => ({
  pca: { nome: "PCA 2027", ano: 2027 },
  orcamento: { nome: "CUBO 2027", ano: 2027 },
  visao: { nome: "Recursos próprios", filtros },
  lancamentos: L,
  vinculos: V,
  unidades: U,
  planejado: [
    { unidadeId: 1, valor: 900 },
    { unidadeId: 4, valor: 80 },
    { unidadeId: null, valor: 5 },
  ],
});

describe("relatório da composição do orçamento", () => {
  it("a conta FECHA: inteiro = retirado pela visão + atribuído às unidades + sem vínculo", () => {
    const r = relatorioOrcamentoPca(entrada());
    const t = r.totais;
    assert.equal(t.cubo.valor, 2750);
    assert.equal(t.foraDaVisao.valor, 500); // fonte 150
    assert.equal(t.nasUnidades.valor, 1000 + 300 + 700);
    assert.equal(t.semVinculo.valor, 200 + 50); // MERENDA (fora do "demais") + SEMAD (sem vínculo)
    assert.equal(t.cubo.valor, t.foraDaVisao.valor + t.nasUnidades.valor + t.semVinculo.valor);
    assert.equal(t.cubo.lancamentos, t.foraDaVisao.lancamentos + t.nasUnidades.lancamentos + t.semVinculo.lancamentos);
  });

  it("o orçamento de cada unidade = o do comparativo (visão + vínculo pela ação)", () => {
    const e = entrada();
    const r = relatorioOrcamentoPca(e);
    const mapa = mapaVinculos(V);
    const comp = new Map<number, number>();
    for (const l of aplicarVisao(L, e.visao.filtros)) {
      const u = unidadeDoLancamento(mapa, l.unidade, l.acao);
      if (u != null) comp.set(u, (comp.get(u) ?? 0) + l.valor);
    }
    for (const u of r.unidades) assert.equal(u.orcamento, comp.get(u.id) ?? 0, u.sigla);
    assert.deepEqual(
      r.unidades.map((u) => u.sigla),
      ["SEMED", "SEMUS", "TRANSP"],
    );
  });

  it("vínculos por extenso: ações, retirado pela visão, ações fora e a escolhida sem lançamento", () => {
    const r = relatorioOrcamentoPca(entrada());
    const semed = r.unidades.find((u) => u.sigla === "SEMED");
    assert.ok(semed);
    const v = semed.vinculos[0];
    assert.match(v.regra, /exceto 1/);
    assert.deepEqual(
      v.acoes.map((a) => [a.texto, a.noCubo, a.naVisao]),
      [["2001 - MANTER ESCOLAS", 1500, 1000]],
    );
    assert.deepEqual(v.fora, [{ texto: "2003 - MERENDA", destino: "sem vínculo (não entra em nenhuma unidade)", noCubo: 200 }]);
    const transp = r.unidades.find((u) => u.sigla === "TRANSP");
    assert.equal(transp?.vinculos[0].acoes.length, 2, "a ação escolhida sem lançamento aparece zerada");
    assert.equal(regraDoVinculo({ acoes: ["a", "b"], acoesFora: [] }), "Só as ações escolhidas (2)");
  });

  it("a visão: por dimensão, o que entra e o que fica fora; unidade/ação nunca são da visão", () => {
    const r = relatorioOrcamentoPca(entrada({ fonte: ["100"], unidade: ["2 - SEMED"] } as never));
    const fonte = r.dimensoes.find((d) => d.rotulo === "Fonte de recurso");
    assert.ok(fonte?.filtrada);
    assert.deepEqual(
      fonte.considerados.map((x) => [x.texto, x.valor]),
      [["100", 2250]],
    );
    assert.deepEqual(
      fonte.naoConsiderados.map((x) => [x.texto, x.valor]),
      [["150", 500]],
    );
    assert.equal(r.dimensoes.filter((d) => d.filtrada).length, 1);
    assert.equal(r.totais.foraDaVisao.valor, 500, "o filtro de unidade não vale na visão");
  });

  it("o que não foi considerado: sem vínculo por ação, unidades com contratações e sem orçamento", () => {
    const r = relatorioOrcamentoPca(entrada());
    assert.deepEqual(
      r.semVinculo.map((g) => [g.unidadeCubo, g.naVisao]),
      [
        ["2 - SEMED", 200],
        ["9 - SEMAD", 50],
      ],
    );
    assert.deepEqual(r.semOrcamento, [{ sigla: "SEMAD", nome: "Administração", orgao: "PMRV", planejado: 80 }]);
    assert.equal(r.planejadoSemUnidade, 5);
    assert.deepEqual(r.retiradoPorUnidadeCubo, [{ unidadeCubo: "2 - SEMED", lancamentos: 1, valor: 500 }]);
  });

  it("definições: o que foi e o que NÃO foi definido na visão e nos vínculos", () => {
    const d = relatorioOrcamentoPca(entrada()).definicoes;
    const dims = relatorioOrcamentoPca(entrada()).dimensoes;
    assert.deepEqual(
      dims.filter((x) => x.filtrada).map((x) => [x.rotulo, x.considerados.map((v) => v.texto), x.naoConsiderados.map((v) => v.texto)]),
      [["Fonte de recurso", ["100"], ["150"]]],
    );
    assert.equal(dims.filter((x) => !x.filtrada).length, 5);
    assert.deepEqual(
      d.unidadesCubo.map((u) => [u.unidadeCubo, situacaoVinculo(u), u.destinos, u.semVinculo, u.valorSemVinculo]),
      [
        ["2 - SEMED", "Parcial", ["SEMED", "TRANSP"], ["2003 - MERENDA"], 200],
        ["5 - SEMUS", "Vinculada", ["SEMUS"], [], 0],
        ["9 - SEMAD", "Sem vínculo", [], ["4001 - ADM"], 50],
      ],
    );
    assert.deepEqual(
      d.unidadesComContratacao.map((u) => [u.sigla, u.comVinculo]),
      [
        ["SEMAD", false],
        ["SEMED", true],
      ],
      "as sem vínculo primeiro",
    );
  });

  it("sem visão: nada é retirado", () => {
    const r = relatorioOrcamentoPca({ ...entrada(), visao: null });
    assert.equal(r.totais.foraDaVisao.valor, 0);
    assert.equal(r.totais.naVisao.valor, 2750);
  });

  it("o documento A4: seções na ordem, páginas dentro da folha, cabeçalho de tabela repetido, Página N de M", () => {
    const r = relatorioOrcamentoPca(entrada());
    const blocos = blocosRelatorioOrcamento(r);
    const secoes = blocos.filter((b) => b.tipo === "secao").map((b) => (b as { texto: string }).texto);
    assert.equal(secoes.length, 6);
    assert.match(secoes[0], /Definições/, "o painel das definições vem PRIMEIRO");
    assert.match(secoes[3], /Parte 1/);
    assert.match(secoes[4], /Parte 2/);
    assert.match(secoes[5], /Parte 3/);
    // Uma tabela longa força várias páginas.
    const longa = { tipo: "tabela" as const, colunas: [{ titulo: "Ação", peso: 3 }, { titulo: "Valor", peso: 1, alinhar: "right" as const }], linhas: Array.from({ length: 200 }, (_, i) => ({ celulas: [`Ação ${i}`, `${i}`] })) };
    const medir = (t: string, tam: number) => t.length * tam * 0.5;
    const paginas = montarDocumento([...blocos, longa], medir, { titulo: "Composição", rodape: "Gerado por X" });
    assert.ok(paginas.length >= 3);
    const { largura: W, altura: H } = PAGINA_A4;
    for (const [i, p] of paginas.entries()) {
      for (const o of p) {
        if (o.t === "texto") {
          assert.ok(o.y > 0 && o.y <= H && o.x >= 0 && o.x + medir(o.texto, o.tam) <= W + 0.5, `fora da folha: ${o.texto}`);
        }
      }
      assert.ok(p.some((o) => o.t === "texto" && o.texto === `Página ${i + 1} de ${paginas.length}`));
    }
    const comCabecalho = paginas.filter((p) => p.some((o) => o.t === "texto" && o.texto === "Ação" && o.cor === "@cabecalhoTexto"));
    assert.ok(comCabecalho.length >= 2, "o cabeçalho da tabela se repete na página seguinte");
  });
});
