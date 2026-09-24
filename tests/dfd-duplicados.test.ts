import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceRegras, comportamentoNo, regrasPadrao } from "../src/lib/avaliacao-core.ts";
import { avaliacaoSchema } from "../src/lib/avaliacao-validation.ts";
import { compararDuplicados, type DfdComparavel } from "../src/lib/comparar-protocolo.ts";
import {
  avaliarDfd,
  duplicadosDfds,
  faltasCirurgicasDfd,
  indiceAposRemover,
  itensDuplicados,
  mapaItensDuplicados,
  mensagensDfd,
  mensagensItem,
  motivoDuplicidade,
  motivoNaoUnificar,
  outrosDoGrupo,
  removerItemDfd,
  repetidosDoDfd,
  repetidosPorDfd,
  semValorUnitario,
  unificarItensDfd,
} from "../src/lib/dfd-tratamento.ts";

const d = (numero: string, planejamento: string | null = null) => ({ numero, planejamento });
const it_ = (codigo: string | null, descricao: string | null = null, unidade: string | null = null) => ({ codigo, descricao, unidade });

describe("duplicadosDfds (mesmo nº de DFD OU de planejamento — relação DIRETA)", () => {
  it("sem duplicatas ⇒ ninguém conflita", () => {
    assert.deepEqual(duplicadosDfds([d("1", "10"), d("2", "20"), d("3", "30")]), [[], [], []]);
  });

  it("mesmo nº de DFD ⇒ um aponta o outro", () => {
    assert.deepEqual(duplicadosDfds([d("1586", "10"), d("1586", "11")]), [[1], [0]]);
  });

  it("mesmo nº de planejamento ⇒ um aponta o outro", () => {
    assert.deepEqual(duplicadosDfds([d("1", "640"), d("2", "640")]), [[1], [0]]);
  });

  it("NÃO transitivo: A~B pelo nº e B~C pelo planejamento ⇒ A e C não conflitam (manter A não descarta C)", () => {
    // A(1,10) — B(1,11) mesmo número; B(1,11) — C(2,11) mesmo planejamento.
    assert.deepEqual(duplicadosDfds([d("1", "10"), d("1", "11"), d("2", "11")]), [[1], [0, 2], [1]]);
  });

  it("planejamento/nº VAZIO não liga DFDs", () => {
    assert.deepEqual(duplicadosDfds([d("1", null), d("2", null), d("3", ""), d("", "")]), [[], [], [], []]);
  });

  it("três com o mesmo nº ⇒ cada um aponta os outros dois; ignora espaços em volta", () => {
    assert.deepEqual(duplicadosDfds([d(" 9 ", "1"), d("9", "2"), d("9", "3")]), [[1, 2], [0, 2], [0, 1]]);
  });

  it("nº e planejamento iguais ao MESMO outro ⇒ aparece uma vez só", () => {
    assert.deepEqual(duplicadosDfds([d("5", "50"), d("5", "50")]), [[1], [0]]);
  });

  it("lista vazia / de 1 ⇒ sem duplicatas", () => {
    assert.deepEqual(duplicadosDfds([]), []);
    assert.deepEqual(duplicadosDfds([d("1", "10")]), [[]]);
  });

  it("motivoDuplicidade diz o que coincide", () => {
    assert.equal(motivoDuplicidade(d("1", "10"), d("1", "11")), "mesmo nº de DFD");
    assert.equal(motivoDuplicidade(d("1", "10"), d("2", "10")), "mesmo nº de planejamento");
    assert.equal(motivoDuplicidade(d("1", "10"), d("1", "10")), "mesmo nº de DFD e de planejamento");
  });
});

describe("itensDuplicados (mesmo código, descrição E unidade)", () => {
  it("sem duplicatas ⇒ vazio", () => {
    assert.deepEqual(itensDuplicados([it_("111", "A"), it_("222", "B")]), []);
  });

  it("mesmo código + descrição + unidade ⇒ um grupo (formatação/pontos/caixa não importam)", () => {
    assert.deepEqual(itensDuplicados([it_("524.193.7263", "X", "UN"), it_("5241937263", "x", "UNIDADE")]), [[0, 1]]);
  });

  it("mesmo código e descrição em OUTRA unidade (UN × CX) ⇒ outra compra, NÃO duplica", () => {
    assert.deepEqual(itensDuplicados([it_("9", "CANETA AZUL", "UN"), it_("9", "CANETA AZUL", "CX")]), []);
  });

  it("mesmo código com descrição DIFERENTE (outro local — DFD 136 real) ⇒ NÃO duplica", () => {
    assert.deepEqual(
      itensDuplicados([
        it_("524194056", "LOCAÇÃO DE EQUIPAMENTOS - SECRETARIA DE AGRICULTURA (ALMOXARIFADO)", "MÊS"),
        it_("524194056", "LOCAÇÃO DE EQUIPAMENTOS - SECRETARIA DE AGRICULTURA- HORTA", "MÊS"),
      ]),
      [],
    );
  });

  it("sem código, mesma descrição e unidade (acentos/caixa ignorados) ⇒ duplicado", () => {
    assert.deepEqual(itensDuplicados([it_(null, "Cimento CP-II", "SC"), it_("", "CIMENTO cp-ii", "sc")]), [[0, 1]]);
  });

  it("sem código, descrições diferentes ⇒ não duplica; sem código E sem descrição é ignorado", () => {
    assert.deepEqual(itensDuplicados([it_(null, "Cimento"), it_(null, "Areia")]), []);
    assert.deepEqual(itensDuplicados([it_(null, null), it_(null, "")]), []);
  });

  it("três iguais ⇒ um grupo; o mapa dá a cada um o MESMO grupo (linear) e outrosDoGrupo tira ele", () => {
    const itens = [it_("9", "a"), it_("1", "b"), it_("9", "A"), it_("9", "á")];
    assert.deepEqual(itensDuplicados(itens), [[0, 2, 3]]);
    const m = mapaItensDuplicados(itens);
    assert.equal(m.get(0), m.get(2)); // o mesmo array compartilhado
    assert.deepEqual(outrosDoGrupo(m.get(0) ?? [], 0), [2, 3]);
    assert.deepEqual(outrosDoGrupo(m.get(2) ?? [], 2), [0, 3]);
    assert.deepEqual(outrosDoGrupo(m.get(3) ?? [], 3, 1), [0]);
    assert.equal(m.has(1), false);
  });

  it("grupo ENORME de iguais: listas limitadas a 10 + o total (nada cresce com o grupo)", () => {
    const itens = Array.from({ length: 3000 }, (_, k) => ({ item: k + 1, codigo: "9", descricao: "A", unidade: "UN" }));
    const r = repetidosDoDfd(itens);
    assert.equal(r.size, 3000);
    assert.deepEqual(r.get(0), { iguais: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], total: 2999 });
    const msg = mensagensItem({ ...itens[0], quantidade: 1, valorUnitario: 1, valorTotal: 1 }, r.get(0));
    assert.match(msg[0].texto, /2, 3, 4, 5, 6, 7, 8, 9, 10, 11 \(\+2989\)/);
    const mesa = repetidosPorDfd(itens.map((x, k) => ({ ...x, id: k, dfdId: 1 })));
    assert.equal(mesa.get(5)?.iguais.length, 10);
    assert.equal(mesa.get(5)?.total, 2999);
  });
});

describe("repetidosPorDfd (visão Itens da Mesa: itens de VÁRIOS DFDs)", () => {
  it("repetição só conta DENTRO do mesmo DFD; a chave é o id da linha", () => {
    const l = [
      { id: 10, dfdId: 1, item: 7, codigo: "9", descricao: "A", unidade: "UN" },
      { id: 11, dfdId: 2, item: 1, codigo: "9", descricao: "A", unidade: "UN" }, // outro DFD: não é repetido
      { id: 12, dfdId: 1, item: 114, codigo: "9", descricao: "a", unidade: "UNIDADE" },
      { id: 13, dfdId: 1, item: 8, codigo: "5", descricao: "B", unidade: "UN" },
    ];
    const m = repetidosPorDfd(l);
    assert.deepEqual([...m.entries()], [
      [10, { iguais: [114], total: 1 }],
      [12, { iguais: [7], total: 1 }],
    ]);
  });
});

describe("item REPETIDO — nunca bloqueia; aponta e trata (remover / unificar)", () => {
  const base = {
    planejamento: "640",
    reparticaoId: 1,
    tipo: "DFD-S",
    secoes: [
      { numero: 3, titulo: "JUSTIFICATIVA", texto: "j" },
      { numero: 5, titulo: "PREVISÃO DE ENTREGA", texto: "ANUAL" },
      { numero: 6, titulo: "PRIORIDADE", texto: "ALTA" },
      { numero: 7, titulo: "FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
    ],
  };
  const itens = [
    { item: 7, codigo: "9", descricao: "A", quantidade: 1, valorUnitario: 10, valorTotal: 10, unidade: "UN" },
    { item: 8, codigo: "5", descricao: "B", quantidade: 2, valorUnitario: 3, valorTotal: 6, unidade: "UN" },
    { item: 114, codigo: "9", descricao: "A", quantidade: 3, valorUnitario: 10, valorTotal: 30, unidade: "UN" },
  ];

  it("é ATENÇÃO (não bloqueia) por padrão, aponta os pares e some depois de tratar", () => {
    const av = avaliarDfd({ ...base, itens });
    assert.deepEqual(av.bloqueantes, []);
    assert.ok(av.atencoes.some((a) => a.includes("repetidos")));
    const msg = mensagensDfd({ ...base, itens }).find((m) => m.chave === "item.duplicado");
    assert.equal(msg?.status, "atencao");
    assert.ok(msg?.texto.includes("7 = 114"), msg?.texto);
    const d2 = removerItemDfd({ itens, valorTotal: 46 }, 2);
    assert.deepEqual(avaliarDfd({ ...base, itens: d2.itens }).atencoes, []);
  });

  it("o ADM NÃO consegue fazê-lo bloquear: o nível antigo 'fundamental' é ignorado (cai no padrão)", () => {
    const regras = { ...regrasPadrao(), pontos: { "item.duplicado": "fundamental" } };
    assert.equal(comportamentoNo(regras, "item.duplicado"), "avisa");
    assert.deepEqual(avaliarDfd({ ...base, itens }, regras).bloqueantes, []);
    // "ignorar" continua valendo (some de tudo).
    const ign = { ...regrasPadrao(), pontos: { "item.duplicado": "ignorar" } };
    assert.deepEqual(avaliarDfd({ ...base, itens }, ign).atencoes, []);
    assert.equal(mensagensDfd({ ...base, itens }, ign).some((m) => m.chave === "item.duplicado"), false);
    assert.deepEqual(faltasCirurgicasDfd({ ...base, itens }, ign), []);
  });

  it("config GRAVADA com o nível antigo: coerceRegras tira e o ADM salva sem erro", () => {
    const bruto = { pontos: { "item.duplicado": "fundamental", "dfd.tipo": "intermediario" }, exDfd: { "DFD-S": { "item.duplicado": "fundamental" } } };
    const r = coerceRegras(bruto);
    assert.deepEqual(r.pontos, { "dfd.tipo": "intermediario" });
    assert.deepEqual(r.exDfd, {});
    assert.doesNotThrow(() => avaliacaoSchema.parse(r));
    // O corpo antigo como veio (sem a limpeza) é recusado pelo schema — por isso a limpeza na leitura.
    assert.throws(() => avaliacaoSchema.parse(bruto));
  });

  it("despacho: 'Conferir os itens REPETIDOS 7 = 114…'", () => {
    const l = faltasCirurgicasDfd({ ...base, itens });
    assert.ok(l.some((x) => x.includes("REPETIDOS 7 = 114")), l.join("\n"));
  });

  it("célula do item: 'Item repetido' em atenção com os iguais; faltas próprias seguem erro", () => {
    const m = mensagensItem(itens[0], { iguais: [114], total: 1, cor: "#ca8a04" });
    assert.deepEqual(
      m.map((x) => [x.status, x.chave]),
      [["atencao", "item.duplicado"]],
    );
    assert.ok(m[0].texto.includes("114"));
    assert.equal(m[0].cor, "#ca8a04");
    const semValor = mensagensItem({ ...itens[0], valorUnitario: null }, { iguais: [114], total: 1 });
    assert.deepEqual(
      semValor.map((x) => x.status),
      ["erro", "atencao"],
    );
    assert.deepEqual(mensagensItem(itens[1]), []);
  });

  it("unificar: soma quantidades e totais no mantido, tira os outros, total do DFD igual", () => {
    const u = unificarItensDfd({ itens, valorTotal: 46 }, 0, [2]);
    assert.equal(u.itens.length, 2);
    assert.deepEqual(
      u.itens.map((i) => [i.item, i.quantidade, i.valorTotal]),
      [
        [7, 4, 40],
        [8, 2, 6],
      ],
    );
    assert.equal(u.valorTotal, 46);
    // Mantendo o ÚLTIMO: o índice dele depois da remoção.
    const u2 = unificarItensDfd({ itens, valorTotal: 46 }, 2, [0]);
    assert.deepEqual(
      u2.itens.map((i) => [i.item, i.quantidade]),
      [
        [8, 2],
        [114, 4],
      ],
    );
    assert.equal(indiceAposRemover(2, [0]), 1);
    assert.equal(indiceAposRemover(0, [2]), 0);
  });

  it("unificar só com a MESMA base: quantidade e o mesmo valor unitário em todos (senão não mexe)", () => {
    assert.equal(motivoNaoUnificar([itens[0], itens[2]]), null);
    assert.match(motivoNaoUnificar([itens[0], { ...itens[2], valorUnitario: 11 }]) ?? "", /diferentes/);
    assert.match(motivoNaoUnificar([itens[0], { ...itens[2], quantidade: null }]) ?? "", /quantidade/);
    assert.match(motivoNaoUnificar([itens[0], { ...itens[2], valorUnitario: null }]) ?? "", /valor unitário/);
    assert.match(motivoNaoUnificar([itens[0]]) ?? "", /repetido/);
    const semBase = { itens: [itens[0], { ...itens[2], valorUnitario: 11 }], valorTotal: 43 };
    assert.equal(unificarItensDfd(semBase, 0, [1]), semBase);
    // índice inválido ⇒ intacto
    const dd = { itens, valorTotal: 46 };
    assert.equal(unificarItensDfd(dd, 0, [9]), dd);
    assert.equal(unificarItensDfd(dd, 5, [0]), dd);
  });

  it("unificar sem valor total nos itens: total = quantidade somada × valor unitário", () => {
    const u = unificarItensDfd(
      {
        itens: [
          { quantidade: 0.1, valorUnitario: 3, valorTotal: null },
          { quantidade: 0.2, valorUnitario: 3, valorTotal: null },
        ],
        valorTotal: null,
      },
      0,
      [1],
    );
    assert.equal(u.itens[0].quantidade, 0.3);
    assert.equal(u.itens[0].valorTotal, 0.9);
    assert.equal(u.valorTotal, 0.9);
  });
});

describe("semValorUnitario (a MESMA régua no cliente e no servidor)", () => {
  it("vazio, zero, negativo e NÃO numérico = ausente", () => {
    for (const v of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(semValorUnitario(v), true, String(v));
    assert.equal(semValorUnitario(0.01), false);
  });

  it("valor NaN no item vira falta de valor (não passa como preenchido)", () => {
    const av = avaliarDfd({ planejamento: "1", reparticaoId: 1, itens: [{ valorUnitario: Number.NaN, quantidade: 1 }], secoes: [] });
    assert.ok(av.bloqueantes.includes("valor unitário em todos os itens"));
  });
});

describe("compararDuplicados (o DFD aberto × o duplicado)", () => {
  const dfd = (over: Partial<DfdComparavel>): DfdComparavel => ({
    numero: "1586",
    planejamento: "640",
    tipo: "DFD-S",
    objeto: "Objeto",
    orgaoEntidade: null,
    setorRequisitante: null,
    responsavel: null,
    matricula: null,
    email: null,
    telefone: null,
    numeroContrato: null,
    numeroAta: null,
    numeroLicitacao: null,
    anoPca: 2027,
    reparticaoId: 1,
    valorTotal: 10,
    secoes: [{ titulo: "3 - JUSTIFICATIVA", texto: "J" }],
    assinaturas: [],
    itens: [{ item: 1, codigo: "9", descricao: "A", unidade: "UN", quantidade: 1, valorUnitario: 10, valorTotal: 10 }],
    ...over,
  });

  it("idênticos ⇒ nenhuma diferença", () => {
    assert.equal(compararDuplicados(dfd({}), dfd({})).total, 0);
  });

  it("mesmo planejamento e nº diferente ⇒ o Nº DFD entra como diferença (e o resto campo a campo)", () => {
    const c = compararDuplicados(dfd({}), dfd({ numero: "1590", objeto: "Outro" }));
    assert.equal(c.situacao, "alterado");
    assert.deepEqual(
      c.campos.map((x) => [x.campo, x.antes, x.depois]),
      [
        ["numero", "1586", "1590"],
        ["objeto", "Objeto", "Outro"],
      ],
    );
    assert.equal(c.total, 2);
  });

  it("itens: o que só um dos lados tem e o que muda", () => {
    const c = compararDuplicados(
      dfd({}),
      dfd({
        valorTotal: 25,
        itens: [
          { item: 1, codigo: "9", descricao: "A", unidade: "UN", quantidade: 2, valorUnitario: 10, valorTotal: 20 },
          { item: 2, codigo: "7", descricao: "B", unidade: "UN", quantidade: 1, valorUnitario: 5, valorTotal: 5 },
        ],
      }),
    );
    assert.deepEqual(
      c.itens.map((i) => [i.tipo, i.item]),
      [
        ["alterado", 1],
        ["novo", 2],
      ],
    );
  });
});
