import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALERTAS_PADRAO } from "../src/lib/frota-config-core.ts";
import {
  agruparFrota,
  alertasFrota,
  aplicarTravaOrigem,
  consumoDosAbastecimentos,
  contextoFrota,
  fichaDoVeiculo,
  filtrarFrota,
  kpisFrota,
  nomesDim,
  opcoesDim,
  SEM_ORGAO,
  SEM_UNIDADE,
  serieFrota,
  porMesFrota,
  type Transacao,
  transacoesDoPacote,
  type Veiculo,
} from "../src/lib/frota-core.ts";

// [id, tipo 0/1, dia, hora, contrato, placa, produto, tipoManut, litros, preco, valor, hodometro, km, consumo,
//  estabelecimento, cidade, uf, motorista, unidade, reparticao, orgao, empenho, processo, itens, removido]
const ab = (id: number, dia: string, placa: string, litros: number, preco: number, hodo: number | null, produto = "DIESEL S10"): (string | number | null)[] => [
  id, 0, dia, "10:00", "000617000001", placa, produto, null, litros, preco, litros * preco, hodo, null, null, "POSTO A", "RIO VERDE", "GO", "JOAO", "SAUDE", 3, 1, null, null, 1, 0,
];
const mn = (id: number, dia: string, placa: string, valor: number): (string | number | null)[] => [
  id, 1, dia, null, "000600000001", placa, null, "PREVENTIVA", null, null, valor, null, null, null, "OFICINA B", "RIO VERDE", "GO", null, "SAUDE", 3, 1, null, null, 4, 0,
];

const veiculo = (placa: string, extra: Partial<Veiculo> = {}): Veiculo => ({
  placa, tipo: "veiculo", classificacaoId: 1, marca: "FIAT", modelo: "STRADA", ano: 2020, situacao: "ativo", origem: "proprio",
  fipe: 80_000, locacao: null, contrato: null, capacidadeTanque: 55, reparticaoId: 3, observacao: null, ...extra,
});

describe("frota-core", () => {
  const trs = transacoesDoPacote([
    ab(1, "2026-01-02", "ABC1D23", 40, 6, 10_000),
    ab(2, "2026-01-05", "ABC1D23", 40, 6, 10_400),
    ab(3, "2026-01-09", "ABC1D23", 40, 6, 10_800),
    ab(4, "2026-01-12", "ABC1D23", 40, 6, 11_200),
    ab(5, "2026-01-15", "ABC1D23", 40, 6, 11_300), // 2,5 km/l — fora da mediana (10)
    ab(6, "2026-02-01", "ABC1D23", 70, 6, 11_100), // hodômetro voltou + acima do tanque
    mn(7, "2026-02-03", "ABC1D23", 1500),
    ab(8, "2026-02-03", "XYZ9K88", 30, 6.2, null, "GASOLINA"),
    mn(9, "2026-02-10", "XYZ9K88", 500),
  ]);
  const ctx = contextoFrota([veiculo("ABC1D23"), veiculo("XYZ9K88", { situacao: "inativo" })], [{ id: 1, nome: "Leve", cor: "#2563eb" }], [
    { codigo: "000617000001", sigla: "PMRV", nome: "Prefeitura" },
  ]);
  const consumo = consumoDosAbastecimentos(trs);

  it("o pacote vira transações do mais recente ao mais antigo", () => {
    assert.equal(trs[0].id, 9);
    assert.equal(trs.at(-1)?.id, 1);
    assert.equal(trs.find((t) => t.id === 7)?.tipo, "manutencao");
  });

  it("o consumo pelo hodômetro, por veículo", () => {
    assert.equal(consumo.get(1)?.km, null);
    assert.equal(consumo.get(2)?.km, 400);
    assert.equal(consumo.get(2)?.kmPorLitro, 10);
    assert.equal(consumo.get(6)?.hodometroVoltou, true);
    assert.equal(consumo.get(8)?.km, null);
  });

  it("os indicadores somam o mesmo que os grupos", () => {
    const k = kpisFrota(trs, consumo);
    assert.equal(k.combustivel, 40 * 6 * 5 + 70 * 6 + 30 * 6.2);
    assert.equal(k.manutencao, 2000);
    assert.equal(k.veiculos, 2);
    assert.equal(k.kmRodados, 400 + 400 + 400 + 100);
    // Os detalhes dos indicadores: os meses com gasto, o veículo de maior gasto e a faixa do preço.
    assert.equal(k.meses, 2);
    const porPlaca = agruparFrota(trs, "placa", ctx, consumo);
    assert.equal(k.maiorVeiculo?.placa, porPlaca[0].chave);
    assert.equal(k.precoMin, 6);
    assert.equal(k.precoMax, 6.2);
    assert.equal(k.maiorManutencao?.valor, Math.max(...trs.filter((t) => t.tipo === "manutencao").map((t) => t.valor)));
    for (const dim of ["placa", "contrato", "classificacao", "produto", "mes", "situacao"] as const) {
      const soma = agruparFrota(trs, dim, ctx, consumo).reduce((a, g) => a + g.total, 0);
      assert.ok(Math.abs(soma - k.total) < 1e-6, dim);
    }
    assert.deepEqual(
      porMesFrota(trs).map((m) => m.mes),
      ["2026-01", "2026-02"],
    );
  });

  it("filtra por período e dimensão (a do outro tipo não filtra)", () => {
    const so = filtrarFrota(trs, { dims: { produto: ["GASOLINA"] } }, ctx);
    assert.deepEqual(so.map((t) => t.id).sort((a, b) => a - b), [7, 8, 9]);
    assert.equal(filtrarFrota(trs, { de: "2026-02-01" }, ctx).length, 4);
    assert.deepEqual(
      opcoesDim(trs, "produto", ctx).map((o) => o.valor),
      ["DIESEL S10", "GASOLINA"],
    );
  });

  it("os filtros conectados: as opções vêm dos demais filtros e o valor marcado zerado fica para desmarcar", () => {
    const dims = { placa: ["XYZ9K88"], contrato: ["PMRV"] };
    // Para cada dimensão, a soma das opções = as transações que passam nos DEMAIS filtros (sem a própria dimensão).
    for (const d of ["placa", "contrato", "classificacao", "situacao"] as const) {
      const semEsta = filtrarFrota(trs, { dims: { ...dims, [d]: [] } }, ctx);
      const soma = opcoesDim(semEsta, d, ctx, dims[d as keyof typeof dims]).reduce((a, o) => a + o.n, 0);
      assert.equal(soma, semEsta.length, d);
    }
    // Um valor marcado que os demais filtros zeram continua na lista, com 0 (a placa ativa com o filtro "Inativo").
    const semPlaca = filtrarFrota(trs, { dims: { situacao: ["Inativo"] } }, ctx);
    const placas = opcoesDim(semPlaca, "placa", ctx, ["ABC1D23"]);
    assert.deepEqual(
      placas.map((o) => [o.valor, o.n]),
      [
        ["ABC1D23", 0],
        ["XYZ9K88", 2],
      ],
    );
  });

  it("os alertas", () => {
    const a = alertasFrota(trs, ctx, consumo, ALERTAS_PADRAO);
    const tipos = (id: number) => a.filter((x) => x.id === id).map((x) => x.tipo).sort();
    assert.ok(tipos(5).includes("consumo"));
    assert.ok(tipos(6).includes("hodometro"));
    assert.ok(tipos(6).includes("tanque"));
    assert.ok(tipos(8).includes("inativo"));
    assert.deepEqual(tipos(2), []);
  });

  it("a ficha do veículo", () => {
    const f = fichaDoVeiculo("ABC1D23", trs, consumo);
    assert.equal(f.registros, 7);
    assert.equal(f.posicao, 1);
    assert.equal(f.frota, 2);
    assert.equal(f.ultimoHodometro, 11_100);
    assert.equal(f.postos[0].nome, "POSTO A");
  });

  it("a trava pela origem", () => {
    assert.deepEqual(aplicarTravaOrigem({ origem: "proprio", fipe: 1, locacao: 2, contrato: "x" }), { origem: "proprio", fipe: 1, locacao: null, contrato: null });
    assert.deepEqual(aplicarTravaOrigem({ origem: "contrato", fipe: 1, locacao: 2, contrato: "x" }), { origem: "contrato", fipe: null, locacao: 2, contrato: "x" });
    const t: Transacao = trs[0];
    assert.ok(t);
  });
});

describe("planilha do cadastro", () => {
  it("lê as colunas pelo nome e aponta o que não casa", async () => {
    const { alteracoesDaPlanilha } = await import("../src/lib/frota-core.ts");
    const r = alteracoesDaPlanilha(
      [
        ["Placa", "Classificação", "Situação", "Origem", "FIPE", "Unidade", "Tanque"],
        ["abc-1d23", "Leve", "Inativo", "Próprio", "R$ 80.000,50", "SMS", 55],
        ["XYZ9K88", "Pesado", "ativo", "contrato", "", "", ""],
        ["ABC1D23", "", "", "", "", "", ""],
        ["ZZZ0000", "", "", "", "", "", ""],
      ],
      { placas: new Set(["ABC1D23", "XYZ9K88"]), classificacoes: [{ id: 1, nome: "Leve", cor: "#000000" }], unidades: [{ id: 3, codigo: "SMS", nome: "Saúde" }] },
    );
    assert.deepEqual(r.alteracoes[0], { placa: "ABC1D23", classificacaoId: 1, situacao: "inativo", origem: "proprio", fipe: 80000.5, reparticaoId: 3, capacidadeTanque: 55 });
    assert.equal(r.alteracoes[1].origem, "contrato");
    assert.equal(r.alteracoes[1].classificacaoId, undefined);
    assert.equal(r.alteracoes.length, 2);
    assert.equal(r.avisos.length, 3);
  });
});

describe("frota-core — Órgão e Unidade do sistema (v1.259.0)", () => {
  const ctx = contextoFrota([], [], []);
  // As colunas 25–28 do pacote: a unidade do sistema (sigla, nome) e o órgão (sigla, nome).
  const comUnidade = (linha: (string | number | null)[], u: string | null, o: string | null) => [...linha, u, u ? `Unidade ${u}` : null, o, o ? `Órgão ${o}` : null];
  const trs = transacoesDoPacote([
    comUnidade(ab(1, "2026-01-02", "AAA1A11", 10, 6, null), "SMS", "PMRV"),
    comUnidade(ab(2, "2026-03-05", "AAA1A11", 20, 6, null), "SMS", "PMRV"),
    comUnidade(mn(3, "2026-03-10", "BBB2B22", 900), null, "PMRV"),
    comUnidade(mn(4, "2026-04-10", "CCC3C33", 300), null, null),
    ab(5, "2026-04-11", "CCC3C33", 5, 6, null), // pacote antigo (sem as colunas novas) = sem unidade e sem órgão
  ]);
  const consumo = consumoDosAbastecimentos(trs);

  it("o registro sem ligação vira 'Sem unidade'/'Sem órgão' e é filtrável", () => {
    const op = opcoesDim(trs, "unidadeSistema", ctx);
    assert.deepEqual(
      op.map((o) => [o.valor, o.n]),
      [
        ["SMS", 2],
        [SEM_UNIDADE, 3],
      ],
    );
    assert.deepEqual(
      opcoesDim(trs, "orgao", ctx).map((o) => o.valor),
      ["PMRV", SEM_ORGAO],
    );
    assert.deepEqual(
      filtrarFrota(trs, { dims: { unidadeSistema: [SEM_UNIDADE] } }, ctx).map((t) => t.id).sort(),
      [3, 4, 5],
    );
    assert.equal(nomesDim(trs, "unidadeSistema").get("SMS"), "Unidade SMS");
    assert.equal(nomesDim(trs, "orgao").get("PMRV"), "Órgão PMRV");
  });

  it("os agrupamentos por Órgão e Unidade somam os indicadores; os sem unidade contam", () => {
    const k = kpisFrota(trs, consumo);
    for (const d of ["orgao", "unidadeSistema"] as const) {
      const g = agruparFrota(trs, d, ctx, consumo);
      assert.equal(Math.round(g.reduce((s, x) => s + x.total, 0) * 100), Math.round(k.total * 100), d);
    }
    assert.equal(k.semUnidade, 3);
    assert.equal(k.valorSemUnidade, 900 + 300 + 30);
  });

  it("a série (a régua da Execução): o acumulado termina nos indicadores; por período soma o total; o zoom continua o acumulado", () => {
    const k = kpisFrota(trs, consumo);
    const s = serieFrota(trs, {}, "mes", "2026-12-31");
    assert.equal(s.granularidade, "mes");
    const fim = s.pontos.at(-1);
    assert.equal(fim?.acCombustivel, k.combustivel);
    assert.equal(fim?.acManutencao, k.manutencao);
    assert.equal(
      s.pontos.reduce((t, p) => t + p.combustivel + p.manutencao, 0),
      k.total,
    );
    // Na janela do zoom, o acumulado começa com o que veio antes dela.
    const ini = s.pontos[0].de;
    const z = serieFrota(trs, { de: s.pontos.at(-1)?.de, ate: s.pontos.at(-1)?.ate }, "dia", "2026-12-31", { acumularDesde: ini });
    assert.equal(Math.round(((z.pontos.at(-1)?.acCombustivel ?? 0) + (z.pontos.at(-1)?.acManutencao ?? 0)) * 100), Math.round(k.total * 100));
  });
});
