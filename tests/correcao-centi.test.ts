import assert from "node:assert/strict";
import { test } from "node:test";
import { chaveMotivo, conferenciaDoRetrato, montarRetrato, tiposDoMotivo } from "../src/lib/conferencia-dfd-centi.ts";
import { executarFluxo, type Grafo, lerGrafo, marcadosDuplicados } from "../src/lib/fluxo-core.ts";
import { grafoDoModelo, MODELOS_FLUXO } from "../src/lib/fluxo-modelos.ts";
import { corrigirDfdPelaCenti } from "../src/lib/correcao-centi-cliente.ts";
import { aplicarCentiPorTipos, NAO_CORRIGIVEIS, planoCorrecao, tiposCorrigiveis, tiposCorrigiveisDoMotivo } from "../src/lib/correcao-centi-core.ts";
import type { DfdDetalhe } from "../src/lib/dfd.ts";
import { compararDfdCenti, MOTIVO_SEM_CORRECAO, REGISTRO_NOS, reconferido } from "../src/lib/fluxo-nos.ts";
import { valorDosItens, type DfdParseado } from "../src/lib/parse-dfd-comum.ts";
import { estadoEscolha, semMarcas } from "../src/lib/sobrescrita-dfd.ts";

const item = (n: number, q = 10, vu = 5) => ({ item: n, codigo: `12345${n}`, descricao: `PRODUTO ${n} DE TESTE`, unidade: "UN", quantidade: q, valorUnitario: vu, valorTotal: q * vu });
const base = (): DfdParseado => ({
  numero: "123",
  planejamento: "456",
  tipo: "DFD-S",
  objeto: "Aquisição de materiais de escritório",
  orgaoEntidade: "PREFEITURA",
  setorRequisitante: "SEC. ADMINISTRAÇÃO",
  siglaSetor: null,
  responsavel: "FULANO",
  matricula: "123",
  email: "a@b.gov.br",
  telefone: "64 9999-0000",
  anoPca: 2027,
  numeroContrato: null,
  numeroAta: null,
  numeroLicitacao: null,
  valorTotal: 100,
  nomeArquivo: "x.pdf",
  secoes: [
    { numero: 3, titulo: "3 - JUSTIFICATIVA", texto: "Necessidade de reposição, conforme demanda." },
    { numero: 6, titulo: "6 - PRIORIDADE", texto: "ALTA" },
  ],
  itens: [item(1), item(2)],
  assinaturas: [],
});
const retrato = (c: DfdParseado) => montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "1" }, { situacao: "Aprovado", numero: "123", tipo: c.tipo }, c, { objeto: true, tolerancia: 0.01 });
const comparavel = (d: DfdParseado) => ({ ...d, reparticaoId: 1 });

function centiDivergente(): DfdParseado {
  const c = base();
  c.objeto = "Aquisição de materiais de limpeza";
  c.secoes[0] = { ...c.secoes[0], texto: "Outra justificativa." };
  c.itens = [item(1, 20), { ...item(2), descricao: "PRODUTO DOIS" }, item(3)];
  c.valorTotal = valorDosItens(c.itens);
  return c;
}

test("corrigir pela Centi: aplicar todas as divergências deixa a conferência CONVERGENTE", () => {
  const s = base();
  const r = retrato(centiDivergente());
  assert.equal(conferenciaDoRetrato(comparavel(s), r).status, "divergente");
  const p = planoCorrecao(s, r, 2027);
  const corrigido = semMarcas(aplicarCentiPorTipos(s, p));
  assert.equal(corrigido.numero, "123");
  assert.equal(corrigido.planejamento, "456");
  assert.equal(corrigido.itens.length, 3);
  assert.equal(corrigido.valorTotal, valorDosItens(corrigido.itens));
  assert.deepEqual(conferenciaDoRetrato(comparavel(corrigido), r), { status: "convergente", motivo: null });
});

test("corrigir pela Centi: os tipos do plano são os do filtro da coluna Centi", () => {
  const s = base();
  const r = retrato(centiDivergente());
  const p = planoCorrecao(s, r, 2027);
  const doMotivo = tiposDoMotivo(conferenciaDoRetrato(comparavel(s), r).motivo);
  for (const t of tiposCorrigiveis(p)) assert.ok(doMotivo.includes(t), `tipo ${t} fora do motivo ${doMotivo.join(", ")}`);
  for (const t of doMotivo) assert.ok(tiposCorrigiveis(p).includes(t), `tipo ${t} do motivo sem correção`);
});

test("corrigir pela Centi: só os tipos escolhidos — o resto fica como no sistema", () => {
  const s = base();
  const r = retrato(centiDivergente());
  const p = planoCorrecao(s, r, 2027);
  const so = semMarcas(aplicarCentiPorTipos(s, p, ["Objeto"]));
  assert.equal(so.objeto, "Aquisição de materiais de limpeza");
  assert.equal(so.itens.length, 2);
  assert.equal(so.secoes[0].texto, s.secoes[0].texto);
  const qtd = semMarcas(aplicarCentiPorTipos(s, p, ["Item: quantidade"]));
  assert.equal(qtd.itens[0].quantidade, 20);
  assert.equal(qtd.itens[1].descricao, "PRODUTO 2 DE TESTE");
  assert.equal(qtd.objeto, s.objeto);
});

test("corrigir pela Centi: pontuação e centavos dentro da tolerância não são corrigidos", () => {
  const s = base();
  const c = base();
  c.objeto = "AQUISIÇÃO DE MATERIAIS DE ESCRITÓRIO.";
  c.itens = [{ ...item(1), valorUnitario: 5.0004, valorTotal: 50.004 }, item(2)];
  const p = planoCorrecao(s, retrato(c), 2027);
  assert.deepEqual(p.divergentes, []);
  assert.deepEqual(semMarcas(aplicarCentiPorTipos(s, p)).objeto, s.objeto);
});

test("aceite: a chave do motivo muda quando a divergência muda", () => {
  assert.equal(chaveMotivo("a"), chaveMotivo("a"));
  assert.notEqual(chaveMotivo("a"), chaveMotivo("b"));
});

test("retrato: refazer a conferência dá o MESMO motivo da automação", () => {
  const c = centiDivergente();
  const s = base();
  const r = compararDfdCenti(
    [{ id: 1, numero: "123", planejamento: "456", tipo: "DFD-S", entidade: "1", dfdSistema: comparavel(s), centi: { numero: "123", tipo: c.tipo, situacao: "Aprovado", dfd: c } }],
    { tolerancia: 0.01, objeto: true },
  );
  assert.equal(r.divergentes.length, 1);
  assert.equal(conferenciaDoRetrato(comparavel(s), retrato(c)).motivo, r.divergentes[0].mensagem);
});

test("banner: só as divergências vêm “Usar Centi”; pontuação diferente fica “Manter sistema”", () => {
  const s = base();
  const c = centiDivergente();
  c.responsavel = "fulano."; // só pontuação/caixa: não diverge
  const p = planoCorrecao(s, retrato(c), 2027);
  const trabalho = aplicarCentiPorTipos(s, p);
  const divergentes = new Set(p.divergentes.map((d) => d.entrada.chave));
  for (const e of p.entradas) {
    const est = estadoEscolha(e, trabalho, s, p.centi);
    assert.equal(est, divergentes.has(e.chave) ? "novo" : "gravado", `${e.chave}: ${est}`);
  }
  assert.ok(p.entradas.some((e) => e.chave === "responsavel"));
  assert.ok(!divergentes.has("responsavel"));
});

test("massa: no item dos dois lados, só os campos dos tipos escolhidos", () => {
  const s = base();
  const c = base();
  c.itens = [{ ...item(1, 20), descricao: "PRODUTO UM" }, item(2), item(3)];
  const p = planoCorrecao(s, retrato(c), 2027);
  const d = semMarcas(aplicarCentiPorTipos(s, p, ["Item: descrição"]));
  assert.equal(d.itens[0].descricao, "PRODUTO UM");
  assert.equal(d.itens[0].quantidade, 10, "a quantidade fica a do sistema");
  assert.equal(d.itens.length, 2, "o item só da Centi não entra");
  const v = semMarcas(aplicarCentiPorTipos(s, p, ["Valor total"]));
  assert.equal(v.itens[0].quantidade, 20);
  assert.equal(v.itens[0].valorTotal, 100);
  assert.equal(v.itens[0].descricao, "PRODUTO 1 DE TESTE");
  assert.equal(v.itens.length, 2, "Valor total não acrescenta itens");
  assert.equal(v.valorTotal, valorDosItens(v.itens));
});

test("retrato: o Tipo e o nº comparados são os do LOAD da Centi (como a automação)", () => {
  const s = base();
  const c = base();
  c.tipo = null; // o PDF sem o "Tipo DFD:"
  const r = montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "1" }, { situacao: "Aprovado", numero: "123", tipo: "DFD-R" }, c, { objeto: true, tolerancia: 0.01 });
  const auto = compararDfdCenti(
    [{ id: 1, numero: "123", planejamento: "456", tipo: "DFD-S", entidade: "1", dfdSistema: comparavel(s), centi: { numero: "123", tipo: "DFD-R", situacao: "Aprovado", dfd: c } }],
    { tolerancia: 0.01, objeto: true },
  );
  const rec = conferenciaDoRetrato(comparavel(s), r);
  assert.equal(rec.status, "divergente");
  assert.equal(rec.motivo, auto.divergentes[0].mensagem);
  const corrigido = semMarcas(aplicarCentiPorTipos(s, planoCorrecao(s, r, 2027)));
  assert.equal(corrigido.tipo, "DFD-R");
  assert.equal(conferenciaDoRetrato(comparavel(corrigido), r).status, "convergente");
});

// ——— A correção pelo navegador (a Mesa e a automação usam a MESMA função)

test("tipos corrigíveis do motivo: tira situação, órgão, nº do DFD, não encontrado e outras", () => {
  assert.deepEqual(tiposCorrigiveisDoMotivo(["Objeto", "Situação", "Órgão", "Objeto", "Valor total", "Nº do DFD", "Não encontrado na Centi", "Outras"]), ["Objeto", "Valor total"]);
  assert.ok(NAO_CORRIGIVEIS.has("Situação"));
});

type Chamada = { url: string; metodo: string; corpo: Record<string, unknown> | null };
function servidor(o: { status: string | null; motivo?: string | null; aceite?: string | null; retrato?: unknown; patch?: number; centi?: DfdParseado }) {
  const s = base();
  const centi = o.centi ?? centiDivergente();
  const r = o.retrato === undefined ? retrato(centi) : o.retrato;
  const motivo = o.motivo !== undefined ? o.motivo : conferenciaDoRetrato(comparavel(s), retrato(centi)).motivo;
  const dfd = { ...s, id: 9, reparticaoId: 1, subunidadeId: null, atualizadoEm: "2026-11-01T10:00:00.000Z", conferenciaCenti: o.status, conferenciaCentiMotivo: motivo, conferenciaCentiAceite: o.aceite ?? null } as unknown as DfdDetalhe;
  const chamadas: Chamada[] = [];
  const resp = (st: number, j: unknown) => new Response(JSON.stringify(j), { status: st, headers: { "content-type": "application/json" } });
  const busca = async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    chamadas.push({ url, metodo, corpo: init?.body ? JSON.parse(String(init.body)) : null });
    if (metodo === "GET" && url === "/api/dfd/9") return resp(200, { ok: true, dfd });
    if (metodo === "GET" && url.endsWith("?retrato=1")) return resp(200, { ok: true, retrato: r });
    if (metodo === "PATCH") return o.patch && o.patch !== 200 ? resp(o.patch, { ok: false, error: "Alterado por outra pessoa." }) : resp(200, { ok: true });
    if (metodo === "POST") return resp(200, { ok: true, status: "convergente", motivo: null });
    return resp(404, { ok: false });
  };
  return { busca, chamadas };
}

test("corrigir DFD pela Centi: divergente — grava só o que diverge com a trava e refaz a conferência", async () => {
  const sv = servidor({ status: "divergente" });
  const r = await corrigirDfdPelaCenti(9, null, sv.busca);
  assert.deepEqual(r, { resultado: "corrigido", status: "convergente", motivo: null });
  const patch = sv.chamadas.find((c) => c.metodo === "PATCH");
  assert.ok(patch);
  assert.equal(patch.corpo?.atualizadoEmLido, "2026-11-01T10:00:00.000Z");
  // Identificadores e assinaturas nunca vão no corpo.
  for (const k of ["numero", "planejamento", "assinaturas", "reparticaoId", "subunidadeId"]) assert.equal(k in (patch.corpo ?? {}), false, k);
  assert.equal(patch.corpo?.objeto, "Aquisição de materiais de limpeza");
  assert.equal((patch.corpo?.itens as unknown[] | undefined)?.length, 3);
  assert.equal(sv.chamadas.at(-1)?.corpo?.acao, "recalcular");
});

test("corrigir DFD pela Centi: convergente, aceito ou só tipos não corrigíveis — nada é gravado", async () => {
  for (const [o, esperado] of [
    [{ status: "convergente" }, "convergente"],
    [{ status: null }, "convergente"],
    [{ status: "divergente", motivo: "DFD 123: Situação: Aprovado" }, "naoCorrigivel"],
  ] as const) {
    const sv = servidor(o);
    assert.equal((await corrigirDfdPelaCenti(9, null, sv.busca)).resultado, esperado);
    assert.equal(sv.chamadas.filter((c) => c.metodo !== "GET").length, 0);
  }
  const s = servidor({ status: "divergente" });
  const motivo = conferenciaDoRetrato(comparavel(base()), retrato(centiDivergente())).motivo;
  const aceite = JSON.stringify({ chave: chaveMotivo(motivo), justificativa: "A Centi está errada.", por: "ADM", em: "2026-11-01" });
  const sa = servidor({ status: "divergente", aceite });
  assert.equal((await corrigirDfdPelaCenti(9, null, sa.busca)).resultado, "aceito");
  assert.equal(sa.chamadas.filter((c) => c.metodo !== "GET").length, 0);
  // Tipos escolhidos fora do motivo: nada a gravar.
  assert.equal((await corrigirDfdPelaCenti(9, ["Tipo"], s.busca)).resultado, "sem");
  assert.equal(s.chamadas.filter((c) => c.metodo !== "GET").length, 0);
});

test("corrigir DFD pela Centi: sem retrato, Centi sem itens ou PATCH recusado — lança e não refaz a conferência", async () => {
  await assert.rejects(corrigirDfdPelaCenti(9, null, servidor({ status: "divergente", retrato: null }).busca), /sem os dados da Centi guardados/);
  const vazio = { ...centiDivergente(), itens: [] };
  const sv = servidor({ status: "divergente", centi: vazio });
  await assert.rejects(corrigirDfdPelaCenti(9, null, sv.busca), /a Centi não tem itens/);
  assert.equal(sv.chamadas.filter((c) => c.metodo !== "GET").length, 0);
  const s409 = servidor({ status: "divergente", patch: 409 });
  await assert.rejects(corrigirDfdPelaCenti(9, null, s409.busca), /Alterado por outra pessoa/);
  assert.equal(s409.chamadas.some((c) => c.metodo === "POST"), false);
});

test("nó Corrigir DFD pela Centi: só o reconferido agora; aceito vai a 'sem correção'; erro fica no DFD; interrompido para tudo", async () => {
  const no = REGISTRO_NOS.get("saida.corrigirPelaCenti");
  assert.ok(no);
  const feitos: number[] = [];
  const ctx = (falha?: string) => ({
    centi: async () => ({ ok: true }),
    api: async () => ({ ok: true }),
    aviso: () => undefined,
    cancelado: () => false,
    host: {
      corrigirPelaCenti: async (id: number) => {
        feitos.push(id);
        if (falha && id === 3) throw new Error(falha);
        return id === 2 ? { resultado: "aceito", status: "divergente", motivo: "x" } : { resultado: "corrigido", status: "convergente", motivo: null };
      },
    },
  });
  const itens = [
    { id: 1, numero: "1", centi: { situacao: "A" } },
    { id: 2, numero: "2", centi: { situacao: "A" } },
    { id: 3, numero: "3", centi: { situacao: "A" } },
    { id: 4, numero: "4" }, // devolvido pelo subfluxo sem a leitura da Centi
    { id: 5, numero: "5", centi: null, centiFalha: true, naoMarcar: true },
    { id: 6, numero: "6", centi: null, centiErro: "não existe" }, // conferido: não encontrado
    { id: 1, numero: "1", centi: { situacao: "A" } }, // repetido
  ];
  const r = (await no.executar({ entrada: itens }, {}, ctx("HTTP 500") as never, {} as never)) as Record<string, Record<string, unknown>[]>;
  assert.deepEqual(feitos, [1, 2, 3]);
  assert.deepEqual(r.corrigidos.map((x) => x.id), [1]);
  assert.deepEqual(r.semMudanca.map((x) => x.id), [2, 6]);
  assert.equal(r.semMudanca[0].motivo, MOTIVO_SEM_CORRECAO.aceito);
  assert.deepEqual(r.erros.map((x) => x.id), [3, 4, 5]);
  assert.match(String(r.erros[1].erro), /Não reconferido/);
  assert.equal(reconferido({ centi: { a: 1 } }), true);
  assert.equal(reconferido({ centi: { a: 1 }, naoMarcar: true }), false);
  feitos.length = 0;
  await assert.rejects(no.executar({ entrada: itens.slice(0, 3) }, {}, ctx("interrompido") as never, {} as never), /interrompido/);
});

test("Modelo “Corrigir DFDs divergentes pela Centi”: só os divergentes marcados, reconferidos agora, são corrigidos", async () => {
  const { MODELOS_FLUXO, grafoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const { executarFluxo, lerGrafo } = await import("../src/lib/fluxo-core.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "corrigir-divergentes-centi");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-1-dfd");
  assert.ok(m && filho);
  const g = lerGrafo(grafoDoModelo(m, new Map([["conferir-1-dfd", 77]])));
  const conf = g.nos.find((n) => n.tipo === "fluxo.executar");
  assert.equal(conf?.config.fluxoId, "77");
  // 1 e 2 divergentes; 3 convergente (fica fora); 2 a Centi não encontra agora.
  const dfds = [
    { id: 1, numero: "1", planejamento: "11", entidade: "2", conferenciaCenti: "divergente" },
    { id: 2, numero: "2", planejamento: "22", entidade: "2", conferenciaCenti: "divergente" },
    { id: 3, numero: "3", planejamento: "33", entidade: "2", conferenciaCenti: "convergente" },
  ];
  const corrigidos: number[] = [];
  const marcados: unknown[] = [];
  const host = {
    protocolos: [],
    __cache: new Map<string, unknown>([["dfds", Promise.resolve(dfds)]]),
    __daMesa: true,
    __entrada: dfds,
    esperaCentiMs: 0,
    mapaEntidades: { "2": "2" },
    carregarFluxo: async (id: number) => ({ id, nome: filho.nome, grafo: lerGrafo(filho.grafo) }),
    lerDfdCenti: async (plan: string) => {
      if (plan === "22") throw new Error("NAO_ENCONTRADO: o planejamento 22 não existe nesta entidade da Centi.");
      return { planejamento: plan, numero: "1", tipo: "DFD-S", objeto: "Outro objeto", valor: 10, totalItens: 1, situacao: "Aprovado" };
    },
    corrigirPelaCenti: async (id: number) => {
      corrigidos.push(id);
      return { resultado: "corrigido", status: "convergente", motivo: null };
    },
  };
  const api = async (c: string, init?: unknown) => {
    if (c.includes("conferencia-dfds")) {
      marcados.push((init as { body: unknown }).body);
      return { ok: true, marcados: 1, convergentes: 0, divergentes: 1 };
    }
    return { ok: true };
  };
  const r = await executarFluxo(g, REGISTRO_NOS, { centi: async () => ({ ok: true }), api, cancelado: () => false, host });
  assert.equal(r.estado, "concluido", r.erro);
  assert.ok(marcados.length, "a reconferência marca os DFDs antes de corrigir");
  assert.deepEqual(corrigidos, [1], "só o divergente reconferido e lido na Centi agora; o convergente nem entra");
});

test("Modelo 'Corrigir divergentes': as marcas da aba Do sistema não valem — a Seleção decide; sem marcar, a Análise avisa", async () => {
  const m = MODELOS_FLUXO.find((x) => x.id === "corrigir-divergentes-centi");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-1-dfd");
  assert.ok(m && filho);
  const base = lerGrafo(grafoDoModelo(m, new Map([["conferir-1-dfd", 77]])));
  const dfds = [
    { id: 1, numero: "1", planejamento: "11", entidade: "2", conferenciaCenti: "divergente" },
    { id: 2, numero: "2", planejamento: "22", entidade: "2", conferenciaCenti: "divergente" },
    { id: 3, numero: "3", planejamento: "33", entidade: "2", conferenciaCenti: "convergente" },
  ];
  // O caso do print: o DFD 3 marcado na aba "Do sistema" (filtrava tudo) e nada na Seleção.
  const comMarcas = (sel: string[] | undefined) => ({
    ...base,
    nos: base.nos.map((n) =>
      n.tipo === "sistema.ler" ? { ...n, config: { ...n.config, marcados: ["3"] } } : n.tipo === "entrada.selecionar" ? { ...n, config: { ...n.config, marcados: sel } } : n,
    ),
  });
  assert.ok(marcadosDuplicados(base).has("dfds1"));
  const rodar = async (g: Grafo) => {
    const corrigidos: number[] = [];
    const passos: Record<string, number> = {};
    const host = {
      protocolos: [],
      __cache: new Map<string, unknown>([["dfds", Promise.resolve(dfds)]]),
      esperaCentiMs: 0,
      mapaEntidades: { "2": "2" },
      carregarFluxo: async (id: number) => ({ id, nome: filho.nome, grafo: lerGrafo(filho.grafo) }),
      lerDfdCenti: async (plan: string) => ({ planejamento: plan, numero: "1", tipo: "DFD-S", objeto: "Outro objeto", valor: 10, totalItens: 1, situacao: "Aprovado" }),
      corrigirPelaCenti: async (id: number) => {
        corrigidos.push(id);
        return { resultado: "corrigido", status: "convergente", motivo: null };
      },
    };
    const api = async (c: string) => (c.includes("conferencia-dfds") ? { ok: true, marcados: 1 } : { ok: true });
    const r = await executarFluxo(g, REGISTRO_NOS, { centi: async () => ({ ok: true }), api, cancelado: () => false, host }, (p) => {
      passos[p.no] = p.itens;
    });
    return { r, corrigidos, passos };
  };
  const vazio = await rodar(comMarcas(undefined));
  assert.equal(vazio.r.estado, "concluido", vazio.r.erro);
  assert.equal(vazio.passos.dfds1, 3, "o Ler do sistema lê TODOS — a marca antiga da aba Do sistema não vale");
  assert.equal(vazio.passos.div1, 2, "os dois divergentes chegam à Seleção");
  assert.deepEqual(vazio.corrigidos, []);
  assert.ok(vazio.r.apontados.some((a) => a.nivel === "atencao" && /nada seguiu/.test(String(a.mensagem))), "sem marcar: a Análise avisa");
  const um = await rodar(comMarcas(["2"]));
  assert.deepEqual(um.corrigidos, [2], "só o marcado na Seleção é corrigido");
  assert.ok(!um.r.apontados.some((a) => /nada seguiu/.test(String(a.mensagem))));
  // O salvo não muda; sem Seleção depois, a marca do Ler do sistema segue valendo.
  assert.deepEqual(comMarcas(undefined).nos.find((n) => n.id === "dfds1")?.config.marcados, ["3"]);
  const semSel: Grafo = { v: 1, nos: [base.nos[0], base.nos[1]], conexoes: [{ de: "inicio1", saida: "saida", para: "dfds1", entrada: "entrada" }] };
  assert.equal(marcadosDuplicados(semSel).size, 0);
});

test("Subfluxo “Conferir 1 DFD × Centi” SALVO antes do DFD inteiro: lê o DFD inteiro (guarda os dados da Centi) e acusa desatualizado", async () => {
  const { desatualizadoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-1-dfd");
  assert.ok(filho);
  const atual = lerGrafo(filho.grafo);
  // O salvo antigo: o "Buscar DFD" sem a chave dfdInteiro.
  const antigo: Grafo = {
    ...atual,
    nos: atual.nos.map((n) => (n.tipo === "leitura.dfdCenti" ? { ...n, config: (({ dfdInteiro: _x, ...r }) => r)(n.config) } : n)),
  };
  assert.equal(desatualizadoDoModelo(antigo, filho), true, "falta a opção que o modelo liga");
  assert.equal(desatualizadoDoModelo(atual, filho), false);
  const no = REGISTRO_NOS.get("leitura.dfdCenti");
  assert.ok(no);
  const pedidos: (boolean | undefined)[] = [];
  const ctx = (c: Record<string, unknown>) => ({
    host: { esperaCentiMs: 0, mapaEntidades: { "2": "2" }, lerDfdCenti: async (p: string, _e?: string, _pdf?: boolean, completo?: boolean) => {
      pedidos.push(completo);
      return { planejamento: p, numero: "1" };
    } },
    config: c,
  });
  const item = [{ id: 1, numero: "1", planejamento: "11", entidade: "2" }];
  const rodar = (c: Record<string, unknown>) =>
    no.executar({ entrada: item }, c, {
      host: ctx(c).host,
      api: async () => ({ ok: true }),
      centi: async () => ({ ok: true }),
      cancelado: () => false,
      aviso: () => {},
      parcial: () => {},
    } as never, {} as never);
  await rodar({ limite: 1 });
  await rodar({ limite: 1, dfdInteiro: false });
  assert.deepEqual(pedidos, [true, false], "sem a chave = DFD inteiro; desligado de propósito = só o resumo");
});
