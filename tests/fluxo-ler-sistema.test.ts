import assert from "node:assert/strict";
import { test } from "node:test";
import { executarFluxo, type Grafo } from "../src/lib/fluxo-core.ts";
import { lerDoSistema, valoresProcurados } from "../src/lib/fluxo-ler-sistema.ts";
import { REGISTRO_NOS } from "../src/lib/fluxo-nos.ts";

const fontes = {
  protocolos: [
    { id: 1, numero: "144756/2026", idExterno: "900", dfds: [{ numero: "10" }, { numero: "11" }] },
    { id: 2, numero: "200/2026", idExterno: "901", dfds: [{ numero: "12" }] },
  ],
  dfds: [
    { id: 10, numero: "10", planejamento: "1119" },
    { id: 11, numero: "11", planejamento: "0120" },
    { id: 12, numero: "12", planejamento: "130" },
  ],
  itens: [
    { id: 1, dfdNumero: "10", dfdPlanejamento: "1119", protocoloNumero: "144756/2026", codigo: "0555" },
    { id: 2, dfdNumero: "12", dfdPlanejamento: "130", protocoloNumero: "200/2026", codigo: "777" },
  ],
};

test("Ler do sistema: geral e específico (protocolo, DFD, item, produto)", () => {
  assert.equal(lerDoSistema(fontes, "dfds", "todos", []).length, 3);
  assert.deepEqual(lerDoSistema(fontes, "protocolos", "id", ["901"]).map((p) => p.id), [2]);
  assert.deepEqual(lerDoSistema(fontes, "protocolos", "numero", ["144756"]).map((p) => p.id), [1]);
  assert.deepEqual(lerDoSistema(fontes, "dfds", "protocolo", ["900"]).map((d) => d.numero), ["10", "11"]);
  assert.deepEqual(lerDoSistema(fontes, "dfds", "planejamento", ["120"]).map((d) => d.numero), ["11"]);
  assert.deepEqual(lerDoSistema(fontes, "itens", "dfd", ["12"]).map((i) => i.id), [2]);
  assert.deepEqual(lerDoSistema(fontes, "itens", "produto", ["555"]).map((i) => i.id), [1]);
  assert.deepEqual(lerDoSistema(fontes, "itens", "protocolo", ["144756"]).map((i) => i.id), [1]);
  assert.deepEqual(valoresProcurados("1119; 0120:130", []), ["1119", "120", "130"]);
  assert.deepEqual(valoresProcurados("{{numero}}", [{ numero: "144756/2026" }, { numero: "200/2026" }]), ["144756", "200"]);
});

test("Ler do sistema UM POR VEZ: lê um, processa, volta, lê outro — o fim leva executado", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      { id: "i", tipo: "gatilho.inicio", config: {}, x: 0, y: 0 },
      { id: "l", tipo: "sistema.ler", config: { objeto: "dfds", buscaDfds: "protocolo", valor: "144756", entrega: "umPorVez" }, x: 0, y: 0 },
      { id: "c", tipo: "dados.campos", config: { linhas: "visto = {{planejamento}}" }, x: 0, y: 0 },
      { id: "f", tipo: "dados.campos", config: { linhas: "acabou = sim" }, x: 0, y: 0 },
    ],
    conexoes: [
      { de: "i", saida: "saida", para: "l", entrada: "entrada" },
      { de: "l", saida: "item", para: "c", entrada: "entrada" },
      { de: "c", saida: "saida", para: "l", entrada: "volta" },
      { de: "l", saida: "fim", para: "f", entrada: "entrada" },
    ],
  };
  const host = { protocolos: fontes.protocolos, __cache: new Map([["dfds", Promise.resolve(fontes.dfds)]]) };
  const r = await executarFluxo(g, REGISTRO_NOS, { centi: async () => ({ ok: false }), api: async () => ({ ok: false }), cancelado: () => false, host });
  assert.equal(r.estado, "concluido", r.erro);
  const fim = r.retorno;
  assert.deepEqual(fim.map((x) => [x.visto, x.executado, x.totalLido]), [["1119", true, 2], ["0120", true, 2]]);
  assert.equal(r.passos.c.vezes, 2);
});

test("buscaEfetiva: {{campo}} que nenhum item preenche lê todos; com o campo filtra; fixo vazio = erro", async () => {
  const { buscaEfetiva } = await import("../src/lib/fluxo-ler-sistema.ts");
  // O Início entrega um item SEM o campo — antes isso dava "Informe o valor procurado".
  assert.equal(buscaEfetiva("planejamento", "{{planejamento}}", valoresProcurados("{{planejamento}}", [{ iniciadoEm: "x" }])), "todos");
  assert.equal(buscaEfetiva("planejamento", "{{planejamento}}", valoresProcurados("{{planejamento}}", [])), "todos");
  assert.equal(buscaEfetiva("planejamento", "{{planejamento}}", ["12"]), "planejamento");
  assert.equal(buscaEfetiva("planejamento", "", []), null);
  assert.equal(buscaEfetiva("todos", "", []), "todos");
});

test("Início → Ler do sistema com {{planejamento}}: sozinho lê TODOS; com os DFDs da Mesa, filtra", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      { id: "i", tipo: "gatilho.inicio", x: 0, y: 0, config: {} },
      { id: "l", tipo: "sistema.ler", x: 200, y: 0, config: { objeto: "dfds", buscaDfds: "planejamento", valor: "{{planejamento}}", entrega: "lista" } },
    ],
    conexoes: [{ de: "i", saida: "saida", para: "l", entrada: "entrada" }],
  };
  const rodar = async (extra: Record<string, unknown>) => {
    const host = { protocolos: fontes.protocolos, __cache: new Map([["dfds", Promise.resolve(fontes.dfds)]]), ...extra };
    const r = await executarFluxo(g, REGISTRO_NOS, { centi: async () => ({ ok: false }), api: async () => ({ ok: false }), cancelado: () => false, host });
    assert.equal(r.estado, "concluido", r.erro);
    return (r.passos.l.amostra?.saida ?? []).map((d) => d.numero);
  };
  assert.deepEqual(await rodar({}), ["10", "11", "12"]);
  assert.deepEqual(await rodar({ __entrada: [{ id: 12, planejamento: "130" }] }), ["12"]);
});

test("campos dos nós: origem {{campo}}, ajuda em todo tipo e os campos que aceitam o nó anterior", async () => {
  const { campoDoValor, AJUDA_TIPO_CAMPO } = await import("../src/lib/fluxo-core.ts");
  assert.equal(campoDoValor("{{planejamento}}"), "planejamento");
  assert.equal(campoDoValor(" {{ centi.situacao }} "), "centi.situacao");
  assert.equal(campoDoValor("DFD {{numero}}"), null);
  assert.equal(campoDoValor("1154; 1155"), null);
  assert.equal(campoDoValor(undefined), null);
  const { sugerirVariavel, variaveisDoGrafo, nomeVariavel } = await import("../src/lib/fluxo-core.ts");
  assert.equal(sugerirVariavel("Ler do sistema", []), "ler_do_sistema");
  assert.equal(sugerirVariavel("Ler do sistema", ["ler_do_sistema"]), "ler_do_sistema_2");
  assert.equal(sugerirVariavel("2 vias", []), "v_2_vias");
  assert.ok(nomeVariavel(sugerirVariavel("Órgão na Centi", [])));
  assert.deepEqual(
    variaveisDoGrafo({ v: 1, conexoes: [], nos: [{ id: "a", tipo: "sistema.ler", x: 0, y: 0, config: {}, guardar: "lido" }, { id: "b", tipo: "dados.variavel", x: 0, y: 0, config: { nome: "total" } }] }),
    ["lido", "total"],
  );
  for (const def of REGISTRO_NOS.values())
    for (const c of def.campos) {
      assert.ok(AJUDA_TIPO_CAMPO[c.tipo], `${def.tipo}.${c.chave}: tipo sem “como preencher”`);
      if (!def.legado) assert.ok(c.ajuda && c.ajuda.length >= 20, `${def.tipo}.${c.chave}: sem “para que serve” didático`);
      if (c.tipo === "selecao") assert.ok(c.opcoes?.length, `${def.tipo}.${c.chave}: seleção sem opções`);
      if (c.aceitaCampo) assert.equal(c.tipo, "texto", `${def.tipo}.${c.chave}: aceitaCampo só em texto`);
    }
});

test("“Os filtrados na tabela”: lê tudo; o campo de planejamento e os ids da tabela recortam — e a tabela é a verdade", async () => {
  const { BUSCAS, BUSCA_TABELA, filtrarPelaTabela, planejamentosDoCampo } = await import("../src/lib/fluxo-ler-sistema.ts");
  for (const o of ["protocolos", "dfds", "itens"] as const) assert.equal(BUSCAS[o][1].valor, BUSCA_TABELA, o);
  assert.equal(lerDoSistema(fontes, "dfds", BUSCA_TABELA, []).length, 3, "lê tudo");
  assert.deepEqual(planejamentosDoCampo("1119: 0120;  130 1119"), ["1119", "120", "130"]);
  const d = fontes.dfds;
  assert.deepEqual(filtrarPelaTabela(d, {}, "dfds").map((x) => x.id), [10, 11, 12], "sem filtro = todos");
  assert.deepEqual(filtrarPelaTabela(d, { planejamentos: "120:130" }, "dfds").map((x) => x.id), [11, 12], "pelo campo (zeros à esquerda)");
  assert.deepEqual(filtrarPelaTabela(d, { planejamentos: "9999" }, "dfds").map((x) => x.id), [], "nº que não existe = nenhum");
  // Os FILTROS das colunas são reaplicados aos DFDs de agora (vale na agendada) — os ids vistos não são mais a régua.
  assert.deepEqual(filtrarPelaTabela(d, { filtrosTabela: { numero: ["10", "12"] } }, "dfds").map((x) => x.id), [10, 12]);
  assert.deepEqual(filtrarPelaTabela(d, { planejamentos: "120:130", filtrosTabela: { numero: ["12"] }, filtrados: [11], filtradosCom: "120:130" }, "dfds").map((x) => x.id), [12], "o filtro vivo vence os ids velhos");
  // Coluna sem régua pura (ex.: a Assinatura): a reserva são os ids vistos com o MESMO campo; com o campo mudado, vale o campo.
  const sem = { assinatura: ["Centi"] };
  assert.deepEqual(filtrarPelaTabela(d, { planejamentos: "120:130", filtrosTabela: sem, filtrados: [12], filtradosCom: "120:130" }, "dfds").map((x) => x.id), [12]);
  assert.deepEqual(filtrarPelaTabela(d, { planejamentos: "1119", filtrosTabela: sem, filtrados: [12], filtradosCom: "120:130" }, "dfds").map((x) => x.id), [10]);
  assert.deepEqual(filtrarPelaTabela(fontes.itens, { planejamentos: "130" }, "itens").length, 2, "o campo é só dos DFDs");
});

test("Ler do sistema em “Os filtrados na tabela”: a execução segue o filtro; da Mesa, a escolha de lá vale", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      { id: "i", tipo: "gatilho.inicio", x: 0, y: 0, config: {} },
      { id: "l", tipo: "sistema.ler", x: 200, y: 0, config: { objeto: "dfds", buscaDfds: "tabela", planejamentos: "1119:130", entrega: "lista", marcar: false } },
    ],
    conexoes: [{ de: "i", saida: "saida", para: "l", entrada: "entrada" }],
  };
  const rodar = async (extra: Record<string, unknown>) => {
    const host = { protocolos: fontes.protocolos, __cache: new Map([["dfds", Promise.resolve(fontes.dfds)]]), ...extra };
    const r = await executarFluxo(g, REGISTRO_NOS, { centi: async () => ({ ok: false }), api: async () => ({ ok: false }), cancelado: () => false, host });
    assert.equal(r.estado, "concluido", r.erro);
    return (r.passos.l.amostra?.saida ?? []).map((x) => x.numero);
  };
  assert.deepEqual(await rodar({}), ["10", "12"]);
  assert.deepEqual(await rodar({ __daMesa: true, __entrada: [{ id: 11, planejamento: "0120" }] }), ["11"], "a Mesa escolhe");
  // O "Quais" inicial do componente e do modelo é o filtro da tabela (sem filtro, lê todos — como o "Todos").
  const campo = REGISTRO_NOS.get("sistema.ler")?.campos.find((c) => c.chave === "buscaDfds");
  assert.equal(campo?.padrao, "tabela");
  const plan = REGISTRO_NOS.get("sistema.ler")?.campos.find((c) => c.chave === "planejamentos");
  assert.equal(plan?.visivel?.({ objeto: "dfds", buscaDfds: "tabela" }), true);
  assert.equal(plan?.visivel?.({ objeto: "dfds", buscaDfds: "todos" }), false);
  const valor = REGISTRO_NOS.get("sistema.ler")?.campos.find((c) => c.chave === "valor");
  assert.equal(valor?.visivel?.({ objeto: "dfds", buscaDfds: "tabela" }), false, "sem valor procurado nos filtrados");
});
