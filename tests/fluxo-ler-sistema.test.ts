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
  for (const def of REGISTRO_NOS.values())
    for (const c of def.campos) {
      assert.ok(c.ajuda || AJUDA_TIPO_CAMPO[c.tipo], `${def.tipo}.${c.chave} sem explicação`);
      if (c.aceitaCampo) assert.equal(c.tipo, "texto", `${def.tipo}.${c.chave}: aceitaCampo só em texto`);
    }
});
