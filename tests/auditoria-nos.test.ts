import assert from "node:assert/strict";
import { test } from "node:test";
import { corrigirDfdPelaCenti } from "../src/lib/correcao-centi-cliente.ts";
import type { Grafo, Item } from "../src/lib/fluxo-core.ts";
import { operarVariavel } from "../src/lib/fluxo-dados.ts";
import { lerDoSistema, valoresProcurados } from "../src/lib/fluxo-ler-sistema.ts";
import { linhaDaCm002, REGISTRO_NOS } from "../src/lib/fluxo-nos.ts";
import { aceitaItensDeFora } from "../src/lib/fluxo-tipo-item.ts";

type Exec = (e: unknown, c: unknown, ctx: unknown, est: unknown) => Promise<Record<string, Item[]>>;
const no = (tipo: string) => (REGISTRO_NOS.get(tipo) as unknown as { executar: Exec }).executar;

test("Comparar DFD × Centi: o DFD desdobrado de um protocolo da Centi (Id da CAPA) não é lido como DFD do sistema", async () => {
  const centi = { numero: "10", tipo: "DFD-S", situacao: "Em elaboração", valor: 50, totalItens: 1, dfd: { numero: "10", itens: [], secoes: [] } };
  const it = { protocolo: "156844", ano: "2026", id: 987654, numero: "10", planejamento: "100", tipo: "DFD-S", valor: 50, itens: 1, centi };
  // 404: nenhum DFD com o Id da capa — compara pelo resumo, nunca "não conferido".
  const ctx404 = { host: { dfdDoSistema: async () => { throw new Error("DFD não encontrado."); } }, cancelado: () => false, aviso: () => {} };
  const a = await no("dados.compararDfdCenti")({ entrada: [it] }, {}, ctx404, {});
  const todos = Object.values(a).flat();
  assert.ok(!todos.some((x) => x.centiFalha === true), "sem falha de leitura do sistema");
  // Existe um DFD com esse id, mas de OUTRO planejamento: nunca é comparado com ele.
  let lidos = 0;
  const ctxOutro = { host: { dfdDoSistema: async () => { lidos++; return { id: 987654, numero: "99", planejamento: "999", objeto: "OUTRA COISA", itens: [{ item: 1, codigo: "1", descricao: "OUTRO ITEM", unidade: "UN", quantidade: 5, valorUnitario: 10, valorTotal: 50 }], secoes: [] }; } }, cancelado: () => false, aviso: () => {} };
  const b = await no("dados.compararDfdCenti")({ entrada: [it] }, {}, ctxOutro, {});
  assert.equal(lidos, 1);
  // O DFD de outro planejamento tem item e objeto diferentes: comparado com ele, haveria divergência.
  assert.equal((b.divergentes ?? []).length, 0, "nenhuma divergência contra um DFD sem relação");
  assert.equal((b.conformes ?? []).length, 1);
  assert.ok(!(ctxOutro.host as Record<string, unknown>).__retratosCenti || ((ctxOutro.host as Record<string, unknown>).__retratosCenti as Map<number, string>).size === 0);
});

test("Corrigir pela Centi: planejamento CANCELADO na Centi nunca corrige o DFD (mesmo com outras divergências)", async () => {
  const chamadas: string[] = [];
  const busca = (async (url: string) => {
    chamadas.push(url);
    const dfd = {
      conferenciaCenti: "divergente",
      conferenciaCentiMotivo: "DFD 10 (Planej. 100): 2 diferenças — situação CANCELADO na Centi;\nValor total: R$ 50,00 no sistema × R$ 60,00 na Centi",
    };
    return new Response(JSON.stringify({ ok: true, dfd }), { status: 200 });
  }) as typeof fetch;
  const r = await corrigirDfdPelaCenti(9, null, busca);
  assert.equal(r.resultado, "naoCorrigivel");
  assert.deepEqual(chamadas, ["/api/dfd/9"], "nem o retrato é lido, nada é gravado");
});

test("Variável 'somar': números com ponto decimal não viram milhar", () => {
  const r = operarVariavel(0, "somar", "{{v}}", [{ v: 1.5 }, { v: 1234.56 }]) as number;
  assert.ok(Math.abs(r - 1236.06) < 1e-9, String(r));
  assert.equal(operarVariavel(0, "somar", "{{v}}", [{ v: 1.234 }]), 1.234);
  assert.equal(operarVariavel(0, "somar", "{{v}}", [{ v: "1.234,56" }]), 1234.56);
  assert.equal(operarVariavel(null, "definir", "{{v}}", [{ v: "1.234,56" }]), 1234.56);
  assert.equal(operarVariavel(null, "definir", "{{v}}", [{ v: 1.5 }]), 1.5);
  assert.equal(operarVariavel(null, "definir", "abc", []), "abc");
  assert.equal(operarVariavel(null, "definir", "{{v}}", [{ v: "R10" }]), "R10");
  assert.equal(operarVariavel(null, "definir", "{{v}}", [{ v: "98 99999 0000" }]), "98 99999 0000");
});

test("Gravar na coluna da Mesa (Centro de Custo, diagrama antigo): a leitura que falhou não apaga o centro gravado", async () => {
  const posts: unknown[] = [];
  const ctx = { host: {}, cancelado: () => false, aviso: () => {}, api: async (_u: string, o?: { body?: unknown }) => {
      posts.push(o?.body);
      return { ok: true };
    },
  };
  const c = { entidade: "dfd", coluna: "Centro de Custo", campoValor: "centroCustoCenti", apagar: true };
  await no("saida.gravarColuna")({ entrada: [{ id: 1, centroNaoLido: true }, { id: 2, centroCustoCenti: "PM RV, GGIM" }] }, c, ctx, {});
  assert.deepEqual(posts, [{ itens: [{ dfdId: 2, centro: "PM RV, GGIM" }] }]);
  posts.length = 0;
  await no("saida.gravarColuna")({ entrada: [{ id: 1, centroNaoLido: true }] }, c, ctx, {});
  assert.deepEqual(posts, [], "nada é gravado (nem apagado)");
  // Outra coluna, sem "apagar": o item sem valor segue para "ignorados", como antes.
  const o = await no("saida.gravarColuna")({ entrada: [{ id: 3, centroNaoLido: true }] }, { entidade: "dfd", coluna: "Outra", campoValor: "x" }, ctx, {});
  assert.equal(o.ignorados.length, 1);
  assert.equal(o.saida.length, 0);
});

test("Ler do sistema: o nº com ano não mistura registros de anos diferentes", () => {
  const fontes = {
    protocolos: [
      { id: 1, numero: "200/2025", idExterno: "11", dfds: [{ numero: "A" }] },
      { id: 2, numero: "200/2026", idExterno: "22", dfds: [{ numero: "B" }] },
    ],
    dfds: [
      { id: 10, numero: "A", protocolo: "200/2025" },
      { id: 11, numero: "B", protocolo: "200/2026" },
    ],
    itens: [
      { id: 100, protocoloNumero: "200/2025" },
      { id: 101, protocoloNumero: "200/2026" },
    ],
  };
  const v = valoresProcurados("200/2026", []);
  assert.deepEqual(v, ["200/2026"]);
  assert.deepEqual(lerDoSistema(fontes, "protocolos", "numero", v).map((p) => p.id), [2]);
  assert.deepEqual(lerDoSistema(fontes, "itens", "protocolo", v).map((i) => i.id), [101]);
  // DFDs pelo protocolo: o de mesmo nº em outro ano não entra.
  const comAno = { ...fontes, protocolos: [{ id: 2, numero: "200/2026", idExterno: "22", dfds: [{ numero: "5/2026" }] }], dfds: [{ id: 20, numero: "5/2026", protocolo: "200/2026" }, { id: 21, numero: "5/2025", protocolo: "300/2025" }] };
  assert.deepEqual(lerDoSistema(comAno, "dfds", "protocolo", v).map((d) => d.id), [20]);
  // Sem ano no procurado: os dois, como antes.
  assert.deepEqual(lerDoSistema(fontes, "protocolos", "numero", valoresProcurados("200", [])).map((p) => p.id), [1, 2]);
});

test("aceitaItensDeFora: o valor escondido de uma busca antiga não esconde o 'Executar com os selecionados'", () => {
  const g = {
    nos: [
      { id: "a", tipo: "gatilho.inicio", x: 0, y: 0, config: {} },
      { id: "b", tipo: "sistema.ler", x: 0, y: 0, config: { objeto: "dfds", buscaDfds: "tabela", valor: "123" } },
    ],
    conexoes: [{ de: "a", saida: "saida", para: "b", entrada: "entrada" }],
  } as unknown as Grafo;
  assert.equal(aceitaItensDeFora(g, [{ id: 1, numero: "10", planejamento: "100" }], () => "sistema"), true);
});

test("Planejamentos da Centi sem DFD: a CM002 do órgão já lida na execução não é lida de novo", async () => {
  let leituras = 0;
  const cache = new Map<string, unknown>();
  const ctx = {
    host: { __cache: cache },
    cancelado: () => false,
    aviso: () => {},
    centi: async (acao: string) => {
      if (acao === "cm002") leituras++;
      return { ok: true, linhas: [{ id: "100", situacao: "Executado" }, { id: "200", situacao: "Executado" }] };
    },
    api: async (u: string) => (u.includes("execucao-dfds") ? { ok: true, dfds: [] } : { ok: true }),
  };
  const r = await linhaDaCm002({ entidade: "8", planejamento: "100" }, ctx as never);
  assert.ok("linha" in r);
  const s = await no("centi.semDfd")({ entrada: [{ entidade: "8", planejamento: "100", verificar: { semDfd: "sim" } }] }, {}, ctx, {});
  assert.equal(leituras, 1, "uma leitura por órgão na execução");
  assert.deepEqual(s.saida.map((l) => l.planejamento).sort(), ["100", "200"]);
});

test("Planejamentos da Centi sem DFD: consulta filtrada (nenhum planejamento dos DFDs na lista) não grava a tabela", async () => {
  const posts: string[] = [];
  const ctx = {
    host: { __cache: new Map<string, unknown>() },
    cancelado: () => false,
    aviso: () => {},
    centi: async () => ({ ok: true, linhas: [{ id: "700", situacao: "Executado" }, { id: "800", situacao: "Executado" }] }),
    api: async (u: string) => {
      posts.push(u);
      return u.includes("execucao-dfds") ? { ok: true, dfds: [] } : { ok: true };
    },
  };
  const s = await no("centi.semDfd")({ entrada: [{ entidade: "8", planejamento: "100", verificar: { semDfd: "sim" } }] }, {}, ctx, {});
  assert.equal(s.saida.length, 0);
  assert.ok(!posts.some((u) => u.includes("/tabelas")), "a tabela não é substituída");
  assert.ok(Object.values(s).flat().some((x) => /consulta aprendida está filtrada/.test(String(x.mensagem ?? ""))));
});
