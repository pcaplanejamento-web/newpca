import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { telasDaChave } from "../src/lib/edicoes-tabela-core.ts";
import {
  CHAVE_SEM_EMPENHO,
  CHAVE_VAZIO,
  chaveDoValor,
  filtrosParaChaves,
  montarBase,
  type PacoteExec,
  REGRAS_FILTROS_EXEC,
  rotuloOpcao,
  valorDaChave,
  valoresAusentes,
} from "../src/lib/execucao-dash-core.ts";
import {
  coerceEstado,
  coercePeriodo,
  diferencas,
  ESTADO_VAZIO,
  type EstadoFiltros,
  ehChaveFiltrosIniciais,
  lerFiltrosIniciais,
  mesmoEstado,
  paraGuardar,
  partesDefinidas,
  voltarParte,
} from "../src/lib/filtros-visao-core.ts";

const R = { dims: ["unidade", "orgao", "elemento"], tipos: ["ne", "rp"] } as const;
const AUTO = { ano: 2026 };
const est = (e: Partial<EstadoFiltros>): EstadoFiltros => ({ ...ESTADO_VAZIO, ...e });

describe("filtros com visões — estado e diferenças", () => {
  it("o estado inicial não aparece como filtro (zero diferenças)", () => {
    const inicial = est({ tipo: ["rp"], dims: { unidade: ["SMS"] } });
    assert.deepEqual(diferencas(inicial, inicial, R, AUTO), []);
    assert.equal(mesmoEstado(est({ dims: { unidade: ["SMS"] }, tipo: ["rp"] }), inicial, R, AUTO), true);
  });

  it("cada parte diferente vira um chip, na ordem período · tipo · dimensões do lugar", () => {
    const atual = est({ periodo: { ano: 2024 }, tipo: ["ne"], dims: { elemento: ["X"], unidade: ["A"] } });
    assert.deepEqual(diferencas(atual, ESTADO_VAZIO, R, AUTO), ["periodo", "tipo", "unidade", "elemento"]);
  });

  it("a ordem dos valores não conta como diferença", () => {
    assert.deepEqual(diferencas(est({ dims: { unidade: ["A", "B"] } }), est({ dims: { unidade: ["B", "A"] } }), R, AUTO), []);
  });

  it("o período escolhido igual ao automático não é filtro; outro ano é", () => {
    assert.deepEqual(diferencas(est({ periodo: { ano: 2026 } }), ESTADO_VAZIO, R, AUTO), []);
    assert.deepEqual(diferencas(est({ periodo: { ano: 2025 } }), ESTADO_VAZIO, R, AUTO), ["periodo"]);
  });

  it("excluir um chip volta AQUELA parte à referência (não esvazia)", () => {
    const ref = est({ dims: { unidade: ["SMS"] }, tipo: ["rp"] });
    const atual = est({ dims: { unidade: ["SME"], elemento: ["X"] }, tipo: [] });
    const u = voltarParte(atual, ref, "unidade");
    assert.deepEqual(u.dims, { unidade: ["SMS"], elemento: ["X"] });
    const e = voltarParte(u, ref, "elemento");
    assert.deepEqual(e.dims, { unidade: ["SMS"] }, "a dimensão que a referência não tem sai");
    const t = voltarParte(e, ref, "tipo");
    assert.deepEqual(diferencas(t, ref, R, AUTO), []);
    assert.equal(voltarParte(est({ periodo: { ano: 2020 } }), ref, "periodo").periodo, null);
  });

  it("visão aplicada: com ela como referência, nada é filtro; mudar algo depois aparece como chip (alterada)", () => {
    const visao = est({ dims: { unidade: ["SMS"], elemento: ["Y"] } });
    assert.deepEqual(diferencas(visao, visao, R, AUTO), []);
    const mexida = { ...visao, tipo: ["ne"] };
    assert.deepEqual(diferencas(mexida, visao, R, AUTO), ["tipo"]);
  });

  it("guardar: forma canônica e o ano do automático como automático (não envelhece)", () => {
    const g = paraGuardar(est({ periodo: { ano: 2026 }, tipo: ["rp", "ne"], dims: { unidade: ["B", "A"] } }), R, AUTO);
    assert.deepEqual(g, { periodo: null, tipo: ["ne", "rp"], dims: { unidade: ["A", "B"] } });
    assert.deepEqual(paraGuardar(est({ periodo: { ano: 2024, mes: 3 } }), R, AUTO).periodo, { ano: 2024, mes: 3 });
    assert.equal(partesDefinidas(g), 2);
    assert.equal(partesDefinidas(ESTADO_VAZIO), 0);
  });
});

describe("filtros com visões — saneamento (nunca confiar no JSON guardado)", () => {
  it("lixo vira o estado vazio", () => {
    for (const v of [null, undefined, 1, "x", [], { dims: "x", tipo: "ne" }]) assert.deepEqual(coerceEstado(v, R), ESTADO_VAZIO);
  });

  it("dimensão e tipo de fora saem; valores não texto, vazios, repetidos e controles saem; teto de valores", () => {
    const e = coerceEstado(
      {
        tipo: ["rp", "xx", "rp"],
        dims: { unidade: ["A", "A", 3, "", "B\u0000"], outra: ["Z"], __proto__: { elemento: ["P"] }, elemento: Array.from({ length: 500 }, (_, i) => `v${i}`) },
      },
      R,
    );
    assert.deepEqual(e.tipo, ["rp"]);
    assert.deepEqual(e.dims.unidade, ["A", "B"]);
    assert.equal("outra" in e.dims, false);
    assert.equal(e.dims.elemento.length, 200);
  });

  it("período: só os válidos", () => {
    assert.equal(coercePeriodo({ ano: 1900 }), null);
    assert.deepEqual(coercePeriodo({ ano: 2025, mes: 13 }), { ano: 2025 });
    assert.deepEqual(coercePeriodo({ preset: "mes", ano: 2025 }), { preset: "mes" });
    assert.equal(coercePeriodo({ preset: "custom", de: "2025-02-31x" }), null);
    assert.deepEqual(coercePeriodo({ preset: "custom", de: "2025-05-01", ate: "2025-01-01" }), { preset: "custom", de: "2025-01-01", ate: "2025-05-01" });
    assert.equal(coercePeriodo({ preset: "outro" }), null);
  });

  it("estado inicial do ADM: só as chaves conhecidas, cada estado saneado", () => {
    const r = lerFiltrosIniciais({ execucao: { tipo: ["rp"], dims: { orgao: ["7"], bad: ["x"] } }, outra: { tipo: ["ne"] } }, { execucao: REGRAS_FILTROS_EXEC });
    assert.deepEqual(r, { execucao: { periodo: null, tipo: ["rp"], dims: { orgao: ["7"] } } });
    assert.deepEqual(lerFiltrosIniciais("x", { execucao: REGRAS_FILTROS_EXEC }), {});
    assert.equal(ehChaveFiltrosIniciais("execucao"), true);
    assert.equal(ehChaveFiltrosIniciais("mesa"), false);
  });

  it("as visões da Execução seguem a tela Execução (salvar = Visualizar; publicar = Configurar)", () => {
    assert.deepEqual(telasDaChave("execucao:filtros"), { telas: ["execucao"], quadroId: null });
  });
});

describe("Execução — valores ESTÁVEIS (o índice do dicionário muda a cada pacote)", () => {
  const pacote = (unidades: string[]): PacoteExec => ({
    v: "1",
    anos: [2025],
    disponiveis: [2025],
    fontes: { liquidacoes: true, pagamentos: true },
    meta: [],
    orgaos: [[7, "PMRV", "Prefeitura"]],
    dic: { unidade: unidades.map((u, i) => [i, u]) },
    emp: [],
    liq: [],
    pag: [],
  });

  it("o mesmo texto ganha a chave certa em pacotes com outra numeração", () => {
    const a = montarBase(pacote(["SMS", "SME"]));
    const b = montarBase(pacote(["SME", "SMS", "SMA"]));
    const valor = valorDaChave(a, "unidade", chaveDoValor(a, "unidade", "SMS"));
    assert.equal(valor, "SMS");
    assert.equal(chaveDoValor(a, "unidade", "SMS"), "0");
    assert.equal(chaveDoValor(b, "unidade", "SMS"), "1");
    assert.deepEqual(filtrosParaChaves(b, { unidade: ["SMS", "SMA"] }), { unidade: ["1", "2"] });
  });

  it("o valor que o pacote não tem fica como ausente: não casa, mostra o próprio nome e é contado", () => {
    const b = montarBase(pacote(["SME"]));
    const k = chaveDoValor(b, "unidade", "SMS");
    assert.equal(k, "?SMS");
    assert.equal(rotuloOpcao(b, "unidade", k), "SMS");
    assert.equal(valorDaChave(b, "unidade", k), "SMS");
    assert.equal(valoresAusentes(b, { unidade: ["SMS", "SME"], orgao: ["7", "9"] }), 2);
  });

  it("as chaves especiais e o órgão (pelo id) são estáveis como são", () => {
    const b = montarBase(pacote(["SME"]));
    assert.equal(chaveDoValor(b, "unidade", CHAVE_VAZIO), CHAVE_VAZIO);
    assert.equal(chaveDoValor(b, "elemento", CHAVE_SEM_EMPENHO), CHAVE_SEM_EMPENHO);
    assert.equal(valorDaChave(b, "orgao", "7"), "7");
    assert.equal(chaveDoValor(b, "orgao", "7"), "7");
  });
});
