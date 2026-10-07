import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chaveJuncao,
  comparar,
  executarFluxo,
  type Grafo,
  interpolar,
  lerFrequencia,
  lerGrafo,
  numeroDe,
  proximaExecucao,
  resolverCaminho,
  temCicloSemLaco,
  validarGrafo,
} from "../src/lib/fluxo-core.ts";
import { REGISTRO_NOS } from "../src/lib/fluxo-nos.ts";

const ctx = (host: Record<string, unknown> = {}, centi: (a: string, d: unknown) => Record<string, unknown> = () => ({ ok: false })) => ({
  centi: async (a: string, d: unknown) => centi(a, d),
  api: async () => ({ ok: false }),
  cancelado: () => false,
  host,
});

const no = (id: string, tipo: string, config: Record<string, unknown> = {}) => ({ id, tipo, config, x: 0, y: 0 });
const con = (de: string, para: string, saida = "saida", entrada = "entrada") => ({ de, saida, para, entrada });

test("lerGrafo descarta nós repetidos e conexões soltas", () => {
  const g = lerGrafo({ nos: [no("a", "gatilho.inicio"), no("a", "x"), { id: "", tipo: "y" }], conexoes: [con("a", "z"), con("a", "a")] });
  assert.equal(g.nos.length, 1);
  assert.equal(g.conexoes.length, 0);
});

test("validarGrafo exige o Início e os campos obrigatórios", () => {
  const p = validarGrafo({ v: 1, nos: [no("f", "dados.filtrar")], conexoes: [] }, REGISTRO_NOS);
  assert.ok(p.some((x) => /Início/.test(x.texto)));
  assert.ok(p.some((x) => /Campo/.test(x.texto)));
});

test("ciclo só pelo Laço", () => {
  const ciclo: Grafo = { v: 1, nos: [no("a", "dados.filtrar"), no("b", "dados.filtrar")], conexoes: [con("a", "b"), con("b", "a")] };
  assert.equal(temCicloSemLaco(ciclo, REGISTRO_NOS), true);
  const laco: Grafo = { v: 1, nos: [no("l", "logica.laco"), no("b", "dados.campos")], conexoes: [con("l", "b", "lote"), con("b", "l", "saida", "volta")] };
  assert.equal(temCicloSemLaco(laco, REGISTRO_NOS), false);
});

test("comparar: sem acento/caixa e números pt-BR", () => {
  assert.equal(comparar("Execução", "igual", "EXECUCAO"), true);
  assert.equal(comparar("1.234,50", "maior", "1000"), true);
  assert.equal(comparar("", "vazio", null), true);
  assert.equal(comparar("B", "na_lista", "a; b; c"), true);
  assert.equal(numeroDe("R$ 2.500,00"), 2500);
  assert.equal(chaveJuncao("00123"), "123");
  assert.equal(resolverCaminho({ a: { b: 2 } }, "a.b"), 2);
  assert.equal(interpolar("DFD {{n}} / {{x.y}}", { n: 5, x: { y: "ok" } }), "DFD 5 / ok");
});

test("frequência: diário, dias úteis, semanal e intervalo (Brasília)", () => {
  const agora = new Date("2026-10-06T12:00:00Z"); // 09:00 em Brasília, terça
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "diario", hora: "08:00" }), agora), "2026-10-07T11:00:00.000Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "diario", hora: "10:00" }), agora), "2026-10-06T13:00:00.000Z");
  const sex = new Date("2026-10-09T23:00:00Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "diario", hora: "08:00", diasUteis: true }), sex), "2026-10-12T11:00:00.000Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "semanal", hora: "08:00", dias: [5] }), agora), "2026-10-09T11:00:00.000Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "intervalo", minutos: 1 }), agora), "2026-10-06T12:05:00.000Z");
  assert.equal(proximaExecucao(lerFrequencia({ tipo: "manual" }), agora), null);
});

test("motor: Comparar DFDs × CM002 e Apontar erros dos diferentes", async () => {
  const host = { mapaEntidades: { "o:1": "2" }, chaveOrgao: (id: number | null) => (id ? `o:${id}` : null) };
  const g: Grafo = {
    v: 1,
    nos: [
      no("i", "gatilho.inicio"),
      no("cm", "centi.cm002"),
      no("cmp", "logica.comparar", { chaveA: "planejamento", chaveB: "planejamento", campoA: "execucaoCenti", campoB: "situacao" }),
      no("ap", "erros.apontar", { mensagem: "DFD {{numero}}: {{b.situacao}}" }),
      no("sa", "sistema.protocolos", { dfds: true }),
    ],
    conexoes: [con("i", "cm"), con("i", "sa"), con("sa", "cmp", "saida", "a"), con("cm", "cmp", "saida", "b"), con("cmp", "ap", "diferentes")],
  };
  const protocolos = [{ numero: "10", dfds: [{ numero: "1", planejamento: "0100", execucaoCenti: "EXECUTADO" }, { numero: "2", planejamento: "200", execucaoCenti: "" }] }];
  const r = await executarFluxo(g, REGISTRO_NOS, ctx({ ...host, protocolos }, (a) =>
    a === "cm002" ? { ok: true, linhas: [{ id: "100", situacao: "Executado" }, { id: "200", situacao: "Cancelado" }, { id: "300", situacao: "x" }] } : { ok: false },
  ));
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(r.apontados.length, 1);
  assert.equal(r.apontados[0].mensagem, "DFD 2: Cancelado");
  assert.equal(r.passos.cmp.amostra?.soEmB.length, 1);
});

test("motor: SE com ramo vazio não roda o nó seguinte; Juntar espera as duas entradas", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      no("i", "gatilho.inicio"),
      no("d", "dados.campos", { linhas: "x = 1" }),
      no("se", "logica.se", { campo: "x", operador: "igual", valor: "1" }),
      no("cm", "centi.cm002", { entidades: "2" }),
      no("j", "logica.juntar"),
    ],
    conexoes: [con("i", "d"), con("d", "se"), con("se", "cm", "falso"), con("se", "j", "verdadeiro", "a"), con("cm", "j", "saida", "b")],
  };
  let chamou = false;
  const r = await executarFluxo(g, REGISTRO_NOS, ctx({}, () => {
    chamou = true;
    return { ok: true, linhas: [] };
  }));
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(chamou, false);
  assert.equal(r.passos.cm.estado, "ignorado");
  assert.equal(r.passos.j.itens, 1);
});

test("motor: Laço até o fim processa todos os lotes e entrega em fim", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      no("i", "gatilho.inicio"),
      no("rep", "centi.reparticoes"),
      no("l", "logica.laco", { tamanho: 2 }),
      no("c", "dados.campos", { linhas: "visto = sim" }),
      no("o", "dados.ordenar", { campo: "reparticao", ordem: "desc" }),
    ],
    conexoes: [con("i", "rep"), con("rep", "l"), con("l", "c", "lote"), con("c", "l", "saida", "volta"), con("l", "o", "fim")],
  };
  const r = await executarFluxo(g, REGISTRO_NOS, ctx({}, () => ({ ok: true, departamentos: ["A", "B", "C", "D", "E"] })));
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(r.passos.c.vezes, 3);
  assert.equal(r.passos.o.itens, 5);
  assert.equal(r.passos.o.amostra?.saida[0].reparticao, "E");
  assert.equal(r.passos.o.vezes, 1);
});

test("motor: erro sem a saída 'erro' para o fluxo; com ela, segue", async () => {
  const base: Grafo = { v: 1, nos: [no("i", "gatilho.inicio"), no("rep", "centi.reparticoes"), no("ap", "erros.apontar", { mensagem: "{{erro}}" })], conexoes: [con("i", "rep")] };
  const falha = () => ({ ok: false, erro: "Centi fora" });
  const r1 = await executarFluxo(base, REGISTRO_NOS, ctx({}, falha));
  assert.equal(r1.estado, "falhou");
  assert.equal(r1.noErro, "rep");
  const r2 = await executarFluxo({ ...base, conexoes: [...base.conexoes, con("rep", "ap", "erro")] }, REGISTRO_NOS, ctx({}, falha));
  assert.equal(r2.estado, "concluido", r2.erro);
  assert.equal(r2.apontados[0].mensagem, "Centi fora");
});

test("Protocolos por situação exige a extensão que filtra", async () => {
  const g: Grafo = { v: 1, nos: [no("i", "gatilho.inicio"), no("p", "centi.protocolos", { situacao: "ANALISADO" })], conexoes: [con("i", "p")] };
  const velho = await executarFluxo(g, REGISTRO_NOS, ctx({}, () => ({ ok: true, protocolos: [{ protocolo: "1" }] })));
  assert.equal(velho.estado, "falhou");
  const novo = await executarFluxo(g, REGISTRO_NOS, ctx({}, () => ({ ok: true, filtro: "ANALISADO", protocolos: [{ protocolo: "1", ano: "2026" }] })));
  assert.equal(novo.estado, "concluido");
  assert.equal(novo.passos.p.itens, 1);
});

test("modelos prontos são válidos", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  for (const m of MODELOS_FLUXO) assert.deepEqual(validarGrafo(m.grafo, REGISTRO_NOS).filter((p) => p.nivel === "erro"), [], m.nome);
});

test("modelo de protocolos analisados roda o laço com erro de leitura sem travar", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  const g = MODELOS_FLUXO.find((m) => m.id === "analisados")?.grafo as Grafo;
  let lidos = 0;
  const r = await executarFluxo(g, REGISTRO_NOS, {
    centi: async (a: string) =>
      a === "telaDepartamentos"
        ? { ok: true, departamentos: ["DEP. PLANEJAMENTO - PCA", "OUTRO"] }
        : { ok: true, filtro: "ANALISADO", protocolos: [{ protocolo: "1", ano: "2026", id: "9", departamento: "DEP. PLANEJAMENTO - PCA" }, { protocolo: "2", ano: "2026", id: "8", departamento: "DEP. PLANEJAMENTO - PCA" }, { protocolo: "3", ano: "2026", departamento: "OUTRO" }] },
    api: async () => ({ ok: false }),
    cancelado: () => false,
    host: {
      lerProtocolo: async (it: Record<string, unknown>) => {
        lidos++;
        if (it.protocolo === "2") throw new Error("Centi fora");
        return { leitura: "ok", leituraTexto: "3 DFD(s)" };
      },
    },
  });
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(lidos, 2);
  assert.equal(r.apontados.length, 1);
});

test("modelo Inclusão PCA: compara os DFDs com a CM002 e importa com os apontamentos certos", async () => {
  const { MODELOS_FLUXO } = await import("../src/lib/fluxo-modelos.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "inclusao-pca");
  assert.deepEqual(m?.frequencia, { tipo: "intervalo", minutos: 120 });
  const importados: { protocolo: unknown; ap: string[] }[] = [];
  const r = await executarFluxo(m?.grafo as Grafo, REGISTRO_NOS, {
    centi: async (a: string) =>
      a === "cm002"
        ? { ok: true, linhas: [{ id: "100", situacao: "EM ELABORAÇÃO" }, { id: "101", situacao: "CANCELADO" }] }
        : {
            ok: true,
            filtro: "",
            protocolos: [
              { protocolo: "1", ano: "2026", id: "9", departamento: "PCA - COORDENADOR (JHONE)" },
              { protocolo: "2", ano: "2026", id: "8", departamento: "PCA - COORDENADOR (JHONE)" },
              { protocolo: "3", ano: "2026", id: "7", departamento: "OUTRA" },
            ],
          },
    api: async () => ({ ok: false }),
    cancelado: () => false,
    host: {
      mapaEntidades: { "o:1": "2" },
      lerProtocolo: async (it: Record<string, unknown>) =>
        it.protocolo === "1"
          ? { leitura: "ok", assunto: "INCLUSÃO PCA 2027", dfds: [{ numero: "10", planejamento: "100" }, { numero: "11", planejamento: "101" }, { numero: "12", planejamento: "999" }] }
          : { leitura: "ok", assunto: "EXCLUSÃO PCA 2027", dfds: [{ numero: "20", planejamento: "200" }] },
      importarProtocolo: async (it: Record<string, unknown>, ap: string[]) => {
        importados.push({ protocolo: it.protocolo, ap });
        return { importado: true, protocoloId: 1 };
      },
    },
  });
  assert.equal(r.estado, "concluido", r.erro);
  assert.equal(importados.length, 1, "só o de inclusão da repartição");
  assert.equal(importados[0].protocolo, "1");
  assert.deepEqual(importados[0].ap.sort(), ["DFD 11 (Planej. 101): situação CANCELADO na CM002", "DFD 12 (Planej. 999) não está na CM002"]);
});

test("desdobrar leva o protocolo do pai; apontamentos agrupados por protocolo", async () => {
  const { desdobrar, apontamentosPorProtocolo } = await import("../src/lib/fluxo-nos.ts");
  const d = desdobrar([{ protocolo: "5", ano: "2026", id: "1", dfds: [{ numero: "1" }, { numero: "2" }] }, { protocolo: "6", ano: "2026" }], "dfds");
  assert.deepEqual(d, [{ protocolo: "5", ano: "2026", id: "1", numero: "1" }, { protocolo: "5", ano: "2026", id: "1", numero: "2" }]);
  const m = apontamentosPorProtocolo([{ mensagem: "x", item: d[0] }, { mensagem: "x", item: d[1] }, { mensagem: "y", item: d[1] }]);
  assert.deepEqual(m.get("5/2026"), ["x", "y"]);
});

test("só os não cadastrados: pelo Id da capa ou nº/ano", async () => {
  const { separarCadastrados } = await import("../src/lib/fluxo-nos.ts");
  const r = separarCadastrados(
    [{ protocolo: "1", ano: "2026", id: "9" }, { protocolo: "2", ano: "2026", id: "8" }, { protocolo: "3", ano: "2026", id: "" }, { protocolo: "4", ano: "2026", id: "7" }],
    [{ numero: "50/2026", idExterno: "9" }, { numero: "3/2026", idExterno: null }],
  );
  assert.deepEqual(r.novos.map((x) => x.protocolo), ["2", "4"]);
  assert.deepEqual(r.cadastrados.map((x) => x.protocolo), ["1", "3"]);
});

test("conferir na CM002: fora, proibida, esperada, valor e entidade", async () => {
  const { conferirCm002 } = await import("../src/lib/fluxo-nos.ts");
  const r = conferirCm002(
    [
      { numero: "1", planejamento: "10", valor: 100, entidade: "2" },
      { numero: "2", planejamento: "11", valor: 100, entidade: "2" },
      { numero: "3", planejamento: "12", valor: 100, entidade: "2" },
      { numero: "4", planejamento: "13", valor: 100, entidade: "2" },
      { numero: "5", planejamento: "99", valor: 1, entidade: "2" },
    ],
    [
      { planejamento: "10", situacao: "EM ELABORAÇÃO", valor: "100,005", entidade: "2" },
      { planejamento: "11", situacao: "CANCELADO", valor: 100, entidade: "2" },
      { planejamento: "12", situacao: "APROVADO", valor: "150,00", entidade: "2" },
      { planejamento: "13", situacao: "EM ELABORAÇÃO", valor: 100, entidade: "3" },
    ],
    { proibidas: ["CANCEL"], esperada: ["ELABORA"], campoValor: "valor", tolerancia: 0.01, entidade: (d) => String(d.entidade) },
  );
  assert.deepEqual(r.conformes.map((x) => x.numero), ["1"]);
  assert.deepEqual(r.divergentes.map((x) => x.mensagem), [
    "DFD 2 (Planej. 11): situação CANCELADO na CM002",
    "DFD 3 (Planej. 12): situação APROVADO na CM002 (esperada ELABORA)",
    "DFD 3 (Planej. 12): valor 100,00 no DFD × 150,00 na CM002",
    "DFD 4 (Planej. 13): na CM002 está na entidade 3, o órgão do DFD é da 2",
    "DFD 5 (Planej. 99) não está na CM002",
  ]);
});

test("protocolos com repartição e sem departamento na resposta: para com erro", async () => {
  const g: Grafo = {
    v: 1,
    nos: [
      { id: "i", tipo: "gatilho.inicio", x: 0, y: 0, config: {} },
      { id: "p", tipo: "centi.protocolos", x: 0, y: 0, config: { reparticao: "PCA" } },
    ],
    conexoes: [{ de: "i", saida: "saida", para: "p", entrada: "entrada" }],
  } as unknown as Grafo;
  const r = await executarFluxo(g, REGISTRO_NOS, {
    centi: async () => ({ ok: true, filtro: "", protocolos: [{ protocolo: "1", ano: "2026" }] }),
    api: async () => ({ ok: false }),
    cancelado: () => false,
    host: {},
  });
  assert.equal(r.estado, "falhou");
  assert.match(r.erro ?? "", /departamento/);
});
