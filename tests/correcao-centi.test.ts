import assert from "node:assert/strict";
import { test } from "node:test";
import { assinaturaDfdCenti, chaveMotivo, conferenciaDoRetrato, lerRetrato, montarRetrato, retratoDoPlanejamento, textoRetrato, tiposDoMotivo } from "../src/lib/conferencia-dfd-centi.ts";
import { executarFluxo, type Grafo, lerGrafo, marcadosDuplicados } from "../src/lib/fluxo-core.ts";
import { grafoDoModelo, MODELOS_FLUXO } from "../src/lib/fluxo-modelos.ts";
import { corrigirDfdPelaCenti } from "../src/lib/correcao-centi-cliente.ts";
import { aplicarCentiPorTipos, NAO_CORRIGIVEIS, planoCorrecao, simularCorrecao, tiposCorrigiveis, tiposCorrigiveisDoMotivo } from "../src/lib/correcao-centi-core.ts";
import type { DfdDetalhe } from "../src/lib/dfd.ts";
import { compararDfdCenti, MOTIVO_SEM_CORRECAO, naoFeitoNaCenti, REGISTRO_NOS, reconferido } from "../src/lib/fluxo-nos.ts";
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
  // Só pontuação/caixa: a régua da conferência não a vê — não é correção (o banner a mostra como "Manter sistema").
  assert.ok(!p.entradas.some((e) => e.chave === "responsavel"));
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
  assert.equal(v.itens.length, 3, "Valor total traz também o item só da Centi (ele muda o total do DFD)");
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
function servidor(o: { status: string | null; motivo?: string | null; aceite?: string | null; retrato?: unknown; patch?: number; centi?: DfdParseado; depois?: { status: string; motivo: string | null }; recalc?: number }) {
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
    if (metodo === "POST" && o.recalc) return resp(o.recalc, { ok: false, error: "Falhou." });
    if (metodo === "POST") return resp(200, { ok: true, ...(o.depois ?? { status: "convergente", motivo: null }) });
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
    [{ status: "divergente", motivo: "DFD 123 (Planej. 456): 1 diferença — situação CANCELADO na Centi" }, "naoCorrigivel"],
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
  await assert.rejects(corrigirDfdPelaCenti(9, null, servidor({ status: "divergente", retrato: null }).busca), /sem os dados da Centi CONFIRMADOS/);
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
  // A Análise mostra a conferência de DEPOIS da correção (não o "Divergente" da comparação de antes).
  assert.equal(r.corrigidos[0].conferenciaCenti, "convergente");
  assert.equal(r.corrigidos[0].conferenciaCentiMotivo, null);
  assert.equal(r.convergentes[0].conferenciaCenti, undefined, "o aceito não muda o que foi comparado");
  // O NÃO CONFERIDO agora (5) não é corrigido nem derruba o fluxo do DFD: "Sem correção" com o motivo (a retomada o refaz).
  assert.deepEqual(r.semMudanca.map((x) => x.id), [5, 6]);
  assert.equal(r.semMudanca[0].correcao, "naoConferido");
  assert.match(String(r.semMudanca[0].motivo), /^não conferido/);
  assert.deepEqual(r.convergentes.map((x) => x.id), [2], "aceito = já convergente, não é pendência");
  assert.equal(r.convergentes[0].motivo, MOTIVO_SEM_CORRECAO.aceito);
  assert.deepEqual(r.erros.map((x) => x.id), [3, 4]);
  assert.match(String(r.erros[1].erro), /Não reconferido/);
  assert.equal(reconferido({ centi: { a: 1 } }), true);
  assert.equal(reconferido({ centi: { a: 1 }, naoMarcar: true }), false);
  feitos.length = 0;
  await assert.rejects(no.executar({ entrada: itens.slice(0, 3) }, {}, ctx("interrompido") as never, {} as never), /interrompido/);
});

test("Modelo “Conferir e corrigir DFDs × Centi”: só os divergentes marcados, reconferidos agora, são corrigidos", async () => {
  const { MODELOS_FLUXO, grafoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const { executarFluxo, lerGrafo } = await import("../src/lib/fluxo-core.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-centi");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(m && filho);
  const g0 = lerGrafo(grafoDoModelo(m, new Map([["conferir-corrigir-1-dfd", 77]])));
  // "Só os divergentes gravados" (o padrão do modelo é Todos — teste próprio).
  const g = { ...g0, nos: g0.nos.map((n) => (n.tipo === "dados.filtrarConferencia" ? { ...n, config: { quais: "divergentes" } } : n)) };
  const conf = g.nos.find((n) => n.tipo === "fluxo.executar");
  assert.equal(conf?.config.fluxoId, "77");
  // 1 e 2 divergentes; 3 convergente (fica fora); 2 a Centi não encontra agora.
  const dfds = [
    { id: 1, numero: "1", planejamento: "11", entidade: "2", objeto: "Objeto do sistema", conferenciaCenti: "divergente" },
    { id: 2, numero: "2", planejamento: "22", entidade: "2", conferenciaCenti: "divergente" },
    { id: 3, numero: "3", planejamento: "33", entidade: "2", conferenciaCenti: "convergente" },
  ];
  const corrigidos: number[] = [];
  const marcados: unknown[] = [];
  const host = {
    protocolos: [],
    __cache: new Map<string, unknown>([["dfds", Promise.resolve(dfds)]]),
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

test("Automação única: “Corrigir os divergentes” desligado ou o Reconferir da Mesa SÓ CONFEREM — marcam e nada é corrigido", async () => {
  const { executarFluxo, lerGrafo } = await import("../src/lib/fluxo-core.ts");
  const m = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-centi");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(m && filho);
  const base = lerGrafo(grafoDoModelo(m, new Map([["conferir-corrigir-1-dfd", 77]])));
  const comCorrigir = (corrigir: boolean | undefined, quais = "todos") => ({
    ...base,
    nos: base.nos.map((n) => (n.tipo === "dados.filtrarConferencia" ? { ...n, config: { quais, ...(corrigir === undefined ? {} : { corrigir }) } } : n)),
  });
  const dfds = [
    { id: 1, numero: "1", planejamento: "11", entidade: "2", objeto: "Objeto do sistema", conferenciaCenti: "divergente" },
    { id: 2, numero: "2", planejamento: "22", entidade: "2", objeto: "Objeto do sistema", conferenciaCenti: "convergente" },
  ];
  const rodar = async (g: Grafo, extra: Record<string, unknown> = {}) => {
    const corrigidos: number[] = [];
    const marcados: number[] = [];
    const host = {
      protocolos: [],
      __cache: new Map<string, unknown>([["dfds", Promise.resolve(dfds)]]),
      esperaCentiMs: 0,
      mapaEntidades: { "2": "2" },
      carregarFluxo: async (id: number) => ({ id, nome: filho.nome, grafo: lerGrafo(filho.grafo) }),
      lerDfdCenti: async (plan: string) => ({ planejamento: plan, numero: plan[0], tipo: "DFD-S", objeto: "Outro objeto", valor: 10, totalItens: 1, situacao: "Aprovado" }),
      corrigirPelaCenti: async (id: number) => {
        corrigidos.push(id);
        return { resultado: "corrigido", status: "convergente", motivo: null };
      },
      ...extra,
    };
    const api = async (c: string, init?: unknown) => {
      if (c.includes("conferencia-dfds")) for (const x of ((init as { body: { itens: { dfdId: number }[] } }).body.itens ?? [])) marcados.push(x.dfdId);
      return { ok: true, marcados: 1 };
    };
    const r = await executarFluxo(g, REGISTRO_NOS, { centi: async () => ({ ok: true }), api, cancelado: () => false, host });
    return { r, corrigidos, marcados: [...new Set(marcados)].sort() };
  };
  // Padrão (campo ausente = ligado): confere os dois (Todos) e corrige os divergentes.
  const padrao = await rodar(comCorrigir(undefined));
  assert.equal(padrao.r.estado, "concluido", padrao.r.erro);
  assert.deepEqual(padrao.marcados, [1, 2]);
  assert.deepEqual(padrao.corrigidos.sort(), [1, 2]);
  // Desligado: só confere.
  const so = await rodar(comCorrigir(false));
  assert.equal(so.r.estado, "concluido", so.r.erro);
  assert.deepEqual(so.marcados, [1, 2], "a conferência é marcada");
  assert.deepEqual(so.corrigidos, [], "nada é corrigido");
  assert.ok(
    (so.r.retorno ?? []).some((it) => it.conferenciaCenti === "divergente" && !it.correcao),
    "o divergente volta Divergente, sem passar pela correção",
  );
  // O "Reconferir" da Mesa: mesmo com a correção ligada no fluxo, nada é corrigido; e o filtro deixa passar os escolhidos lá.
  const mesa = await rodar(comCorrigir(true, "divergentes"), { __daMesa: true, __soConferir: true, __entrada: [{ id: 2, numero: "2", planejamento: "22" }] });
  assert.equal(mesa.r.estado, "concluido", mesa.r.erro);
  assert.deepEqual(mesa.marcados, [2], "o convergente escolhido na Mesa é reconferido (o filtro não o tira)");
  assert.deepEqual(mesa.corrigidos, []);
  // O "Corrigir automaticamente" da Mesa: corrige o escolhido.
  const corr = await rodar(comCorrigir(true, "divergentes"), { __daMesa: true, __entrada: [{ id: 2, numero: "2", planejamento: "22" }] });
  assert.deepEqual(corr.corrigidos, [2]);
});

test("Modelo 'Conferir e corrigir': quem escolhe é o CAMPO (Quais + Valor procurado) — marcação antiga não vale e não há Seleção", async () => {
  const m = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-centi");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(m && filho);
  assert.ok(!m.grafo.nos.some((n) => n.tipo === "entrada.selecionar"), "sem a Seleção");
  assert.equal(m.grafo.nos.find((n) => n.id === "dfds1")?.config.marcar, false, "o Ler do sistema não marca");
  const b0 = lerGrafo(grafoDoModelo(m, new Map([["conferir-corrigir-1-dfd", 77]])));
  const dfds = [
    { id: 1, numero: "1", planejamento: "11", entidade: "2", objeto: "Objeto do sistema", conferenciaCenti: "divergente" },
    { id: 2, numero: "2", planejamento: "22", entidade: "2", objeto: "Objeto do sistema", conferenciaCenti: "divergente" },
    { id: 3, numero: "3", planejamento: "33", entidade: "2", objeto: "Objeto do sistema", conferenciaCenti: "convergente" },
  ];
  const com = (ler: Record<string, unknown>): Grafo => ({
    ...b0,
    nos: b0.nos.map((n) => (n.tipo === "sistema.ler" ? { ...n, config: { ...n.config, ...ler } } : n)),
  });
  assert.equal(marcadosDuplicados(b0).size, 0);
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
  // Uma marcação antiga gravada no Ler do sistema NÃO filtra (marcar: false): todos seguem.
  const todos = await rodar(com({ marcados: ["3"] }));
  assert.equal(todos.r.estado, "concluido", todos.r.erro);
  assert.equal(todos.passos.dfds1, 3);
  assert.deepEqual(todos.corrigidos.sort(), [1, 2, 3], JSON.stringify(todos.r.apontados));
  // Dois planejamentos escritos no campo: só eles são conferidos e corrigidos.
  const dois = await rodar(com({ buscaDfds: "planejamento", valor: "11:33" }));
  assert.equal(dois.passos.dfds1, 2);
  assert.deepEqual(dois.corrigidos.sort(), [1, 3]);
  // Um DFD pelo nº.
  const um = await rodar(com({ buscaDfds: "numero", valor: "2" }));
  assert.deepEqual(um.corrigidos, [2]);
});

test("Subfluxo “Conferir e corrigir 1 DFD × Centi” SALVO antes do DFD inteiro: lê o DFD inteiro (guarda os dados da Centi) e acusa desatualizado", async () => {
  const { desatualizadoDoModelo } = await import("../src/lib/fluxo-modelos.ts");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
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

// ---------------------------------------------------------------------------
// AUDITORIA: cada tipo de divergência que a conferência aponta é corrigido — reconferido, fica CONVERGENTE.
// ---------------------------------------------------------------------------

const CASOS: [string, (c: DfdParseado) => void][] = [
  ["Objeto", (c) => { c.objeto = "Outro objeto"; }],
  ["Órgão/Entidade", (c) => { c.orgaoEntidade = "FUNDO MUNICIPAL"; }],
  ["Setor requisitante", (c) => { c.setorRequisitante = "SEC. SAÚDE"; }],
  ["Responsável", (c) => { c.responsavel = "BELTRANO"; }],
  ["Matrícula", (c) => { c.matricula = "999"; }],
  ["E-mail", (c) => { c.email = "x@y.gov.br"; }],
  ["Telefone", (c) => { c.telefone = "64 8888-1111"; }],
  ["Nº do contrato", (c) => { c.numeroContrato = "045-2025"; }],
  ["Nº da ARP", (c) => { c.numeroAta = "12/2026"; }],
  ["Nº da licitação", (c) => { c.numeroLicitacao = "PE 7/2026"; }],
  ["Tipo", (c) => { c.tipo = "DFD-O"; }],
  ["Seção JUSTIFICATIVA", (c) => { c.secoes[0] = { ...c.secoes[0], texto: "Outra justificativa." }; }],
  ["Seção FUNDAMENTAÇÃO LEGAL", (c) => { c.secoes.push({ numero: 7, titulo: "7 - FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" }); }],
  // (a PRIORIDADE que só o sistema tem é TRATAMENTO da equipe — nunca é apagada nem acusada: teste próprio)
  ["Seção PRIORIDADE", (c) => { c.secoes = c.secoes.map((x) => (/PRIORIDADE/.test(x.titulo) ? { ...x, texto: "BAIXA" } : x)); }],
  ["Item: nº", (c) => { c.itens[1] = { ...c.itens[1], item: 7 }; }],
  ["Item: código", (c) => { c.itens[1] = { ...c.itens[1], codigo: "99999" }; }],
  ["Item: descrição", (c) => { c.itens[1] = { ...c.itens[1], descricao: "PRODUTO DOIS ALTERADO" }; }],
  ["Item: medida", (c) => { c.itens[1] = { ...c.itens[1], unidade: "CX" }; }],
  ["Item: quantidade", (c) => { c.itens[1] = { ...c.itens[1], quantidade: 3, valorTotal: 15 }; }],
  ["Item: valor unitário", (c) => { c.itens[1] = { ...c.itens[1], valorUnitario: 7, valorTotal: 70 }; }],
  ["Item só na Centi", (c) => { c.itens.push(item(3)); }],
  ["Item só no sistema", (c) => { c.itens.pop(); }],
];

function casoCenti(muda: (c: DfdParseado) => void): DfdParseado {
  const c = base();
  c.numeroContrato = null;
  muda(c);
  c.valorTotal = valorDosItens(c.itens);
  return c;
}

test("auditoria: cada tipo de divergência é corrigido — tudo e só o tipo — e a reconferência fica CONVERGENTE", () => {
  for (const [tipo, muda] of CASOS) {
    const s = { ...base(), numeroContrato: tipo === "Nº do contrato" ? "045/2025" : null };
    const c = casoCenti(muda);
    const r = montarRetrato({ numero: "123", tipo: s.tipo, entidade: "1" }, { situacao: "Aprovado", numero: "123", tipo: c.tipo }, c, { objeto: true, tolerancia: 0.01 });
    const antes = conferenciaDoRetrato(comparavel(s), r);
    assert.equal(antes.status, "divergente", tipo);
    const tipos = tiposCorrigiveisDoMotivo(tiposDoMotivo(antes.motivo));
    assert.ok(tipos.includes(tipo), `${tipo}: fora de ${tipos.join(", ")}`);
    assert.equal(simularCorrecao(s, r, 2027, null).status, "convergente", `${tipo} (todas)`);
    assert.equal(simularCorrecao(s, r, 2027, [tipo]).status, "convergente", `${tipo} (só o tipo)`);
  }
});

test("auditoria: o Valor total por centavos acumulados (cada item dentro da tolerância) também converge", () => {
  const s = base();
  s.itens = Array.from({ length: 20 }, (_, i) => item(i + 1, 1, 10));
  s.valorTotal = valorDosItens(s.itens);
  const c = base();
  c.itens = Array.from({ length: 20 }, (_, i) => ({ ...item(i + 1, 1, 10.009), valorTotal: 10.009 }));
  c.valorTotal = valorDosItens(c.itens);
  const r = retrato(c);
  const antes = conferenciaDoRetrato(comparavel(s), r);
  assert.equal(antes.status, "divergente");
  assert.deepEqual(tiposDoMotivo(antes.motivo), ["Valor total"]);
  assert.equal(simularCorrecao(s, r, 2027, null).status, "convergente");
  assert.equal(simularCorrecao(s, r, 2027, ["Valor total"]).status, "convergente");
});

test("auditoria: pareamento pela régua da conferência — código repetido com descrição só de pontuação diferente", () => {
  const s = base();
  s.itens = [{ ...item(1), codigo: "111", descricao: "CANETA, AZUL." }, { ...item(2), codigo: "111", descricao: "CANETA VERMELHA" }];
  s.valorTotal = valorDosItens(s.itens);
  const c = base();
  c.itens = [{ ...item(1), codigo: "1.11", descricao: "CANETA VERMELHA", quantidade: 4, valorTotal: 20 }, { ...item(2), codigo: "111", descricao: "caneta azul" }];
  c.valorTotal = valorDosItens(c.itens);
  const r = retrato(c);
  assert.equal(conferenciaDoRetrato(comparavel(s), r).status, "divergente");
  assert.equal(simularCorrecao(s, r, 2027, null).status, "convergente");
});

test("auditoria: o motivo CORTADO (e mais N) não deixa divergência para trás — a automação corrige pelo retrato", async () => {
  const centi = base();
  centi.itens = Array.from({ length: 40 }, (_, i) => ({ ...item(i + 1, 3), descricao: `PRODUTO ${i + 1} MUITO DIFERENTE` }));
  centi.valorTotal = valorDosItens(centi.itens);
  centi.objeto = "Objeto da Centi";
  const s = base();
  const cortado = `DFD 123 (Planej. 456): 42 diferenças — Item 1 (cód. 123451): quantidade 10 × 3 (sistema × Centi);\ne mais 41`;
  const sv = servidor({ status: "divergente", motivo: cortado, centi });
  const r = await corrigirDfdPelaCenti(9, null, sv.busca);
  assert.equal(r.resultado, "corrigido");
  const patch = sv.chamadas.find((c) => c.metodo === "PATCH");
  assert.equal(patch?.corpo?.objeto, "Objeto da Centi");
  assert.equal((patch?.corpo?.itens as unknown[] | undefined)?.length, 40);
  void s;
});

test("auditoria: gravou mas a reconferência ainda diverge — “parcial” com o que restou (nunca “corrigido”)", async () => {
  const sv = servidor({ status: "divergente", depois: { status: "divergente", motivo: "DFD 123 (Planej. 456): 1 diferença — situação CANCELADO na Centi" } });
  const r = await corrigirDfdPelaCenti(9, null, sv.busca);
  // O que resta é só o que a Centi não corrige (Situação): "corrigido", com o que resta tratar no painel — não falha sempre.
  assert.equal(r.resultado, "corrigido");
  assert.deepEqual(r.restam, ["Situação"]);
  const sv2 = servidor({ status: "divergente", depois: { status: "divergente", motivo: "DFD 123 (Planej. 456): 1 diferença — Objeto: “a” no sistema × “b” na Centi" } });
  assert.equal((await corrigirDfdPelaCenti(9, null, sv2.busca)).resultado, "parcial", "ainda diverge num corrigível: parcial (nunca corrigido)");
});

test("auditoria: Situação, Órgão e Nº do DFD não se corrigem pela Centi — ficam apontados", () => {
  const s = base();
  const c = base();
  const r = montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "1", entidadeAchada: "2" }, { situacao: "CANCELADO", numero: "999", tipo: "DFD-S" }, c, { objeto: true, tolerancia: 0.01 });
  const sim = simularCorrecao(s, r, 2027, null);
  assert.equal(sim.status, "divergente");
  assert.deepEqual(tiposDoMotivo(sim.motivo).sort(), ["Nº do DFD", "Situação", "Órgão"].sort());
});

test("execução: motivo só com linha não classificada (Outras) — a automação consulta o retrato e corrige; a massa não", async () => {
  const outras = "DFD 123 (Planej. 456): 1 diferença — algo que a classificação não reconhece";
  assert.deepEqual(tiposDoMotivo(outras), ["Outras"]);
  const sv = servidor({ status: "divergente", motivo: outras });
  const r = await corrigirDfdPelaCenti(9, null, sv.busca);
  assert.equal(r.resultado, "corrigido");
  assert.ok(sv.chamadas.some((c) => c.metodo === "PATCH"));
  const sm = servidor({ status: "divergente", motivo: outras });
  assert.equal((await corrigirDfdPelaCenti(9, ["Objeto"], sm.busca)).resultado, "naoCorrigivel");
  assert.equal(sm.chamadas.some((c) => c.metodo === "PATCH"), false);
});

test("execução: gravou mas a reconferência falhou — “pendente”, nunca “corrigido”; o nó manda a Não corrigidos", async () => {
  const r = await corrigirDfdPelaCenti(9, null, servidor({ status: "divergente", recalc: 500 }).busca);
  assert.equal(r.resultado, "pendente");
  const no = REGISTRO_NOS.get("saida.corrigirPelaCenti");
  assert.ok(no);
  const ctx = {
    centi: async () => ({ ok: true }),
    api: async () => ({ ok: true }),
    aviso: () => undefined,
    cancelado: () => false,
    host: {
      corrigirPelaCenti: async (id: number) =>
        id === 1 ? { resultado: "pendente", status: null, motivo: null } : id === 2 ? { resultado: "parcial", status: "divergente", motivo: "x", restam: ["Situação"] } : { resultado: "convergente", status: "convergente", motivo: null },
    },
  };
  const itens = [1, 2, 3].map((id) => ({ id, numero: String(id), centi: { situacao: "A" } }));
  const s = (await no.executar({ entrada: itens }, {}, ctx as never, {} as never)) as Record<string, Record<string, unknown>[]>;
  assert.deepEqual(s.corrigidos, []);
  assert.deepEqual(s.erros.map((x) => x.id), [1, 2]);
  assert.equal(s.erros[0].erro, MOTIVO_SEM_CORRECAO.pendente);
  assert.match(String(s.erros[1].erro), /Corrigido em parte — ainda diverge: Situação/);
  assert.deepEqual(s.convergentes.map((x) => x.id), [3]);
});

test("DFD a DFD: cada um é corrigido logo depois da SUA reconferência; o que falha é refeito e o já feito não", async () => {
  const m = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-centi");
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(m && filho);
  assert.deepEqual(m.dependencias, ["conferir-corrigir-1-dfd"]);
  const base = lerGrafo(grafoDoModelo(m, new Map([["conferir-corrigir-1-dfd", 77]])));
  const g = (paralelo: number): Grafo => ({
    ...base,
    nos: base.nos.map((n) =>
      n.tipo === "fluxo.executar" ? { ...n, config: { ...n.config, paralelo } } : n,
    ),
  });
  const dfds = [1, 2, 3].map((i) => ({ id: i, numero: String(i), planejamento: `${i}${i}`, entidade: "2", objeto: "Objeto do sistema", conferenciaCenti: "divergente" }));
  const progresso = new Map<string, Map<string, string>>();
  const prog = {
    ler: async (no: string) => [...(progresso.get(no) ?? new Map()).entries()].filter(([, e]) => e === "ok").map(([k]) => k),
    gravar: async (no: string, l: { chave: string; estado: string }[]) => {
      const p = progresso.get(no) ?? new Map<string, string>();
      for (const x of l) p.set(x.chave, x.estado);
      progresso.set(no, p);
    },
    limpar: async (no: string) => void progresso.delete(no),
  };
  const rodar = async (o: { falhaNo?: number; pararEm?: string; paralelo?: number }) => {
    let parar = false;
    const ordem: string[] = [];
    const host = {
      protocolos: [],
      __cache: new Map<string, unknown>([["dfds", Promise.resolve(dfds)]]),
      esperaCentiMs: 0,
      mapaEntidades: { "2": "2" },
      progresso: prog,
      carregarFluxo: async (id: number) => ({ id, nome: filho.nome, grafo: lerGrafo(filho.grafo) }),
      lerDfdCenti: async (plan: string) => {
        ordem.push(`ler:${plan}`);
        if (plan === o.pararEm) parar = true;
        return { planejamento: plan, numero: plan[0], tipo: "DFD-S", objeto: "Outro objeto", valor: 10, totalItens: 1, situacao: "Aprovado" };
      },
      corrigirPelaCenti: async (id: number) => {
        ordem.push(`corrigir:${id}`);
        return id === o.falhaNo ? { resultado: "parcial", status: "divergente", motivo: "x", restam: ["Objeto"] } : { resultado: "corrigido", status: "convergente", motivo: null };
      },
    };
    const api = async (c: string) => {
      if (c.includes("conferencia-dfds")) ordem.push("marcar");
      return c.includes("conferencia-dfds") ? { ok: true, marcados: 1 } : { ok: true };
    };
    const r = await executarFluxo(g(o.paralelo ?? 1), REGISTRO_NOS, { centi: async () => ({ ok: true }), api, cancelado: () => parar, host });
    return { r, ordem, corrigidos: ordem.filter((x) => x.startsWith("corrigir:")).map((x) => Number(x.slice(9))) };
  };
  // Um por vez: ler → marcar → corrigir de CADA DFD antes do próximo.
  const um = await rodar({ falhaNo: 2 });
  assert.equal(um.r.estado, "concluido", um.r.erro);
  assert.deepEqual(um.ordem.slice(0, 3), ["ler:11", "marcar", "corrigir:1"], "a correção espera a conferência gravada do MESMO DFD");
  assert.deepEqual(um.corrigidos, [1, 2, 3]);
  assert.ok(um.r.apontados.some((a) => /DFD 2 \(planejamento 22\): .*ainda diverge/.test(String(a.mensagem))), "o parcial vira falha com o motivo");
  // A fila INTEIRA passou (sem interrupção): a próxima execução recomeça do zero — a agendada reconfere todos, sempre.
  assert.equal(progresso.size, 0, "a fila inteira passou: a retomada recomeça do zero");
  const dois = await rodar({});
  assert.equal(dois.r.estado, "concluido", dois.r.erro);
  assert.deepEqual(dois.corrigidos, [1, 2, 3]);
  // Interrompido no meio: o já corrigido fica; a próxima execução continua dos que faltam.
  const tres = await rodar({ pararEm: "22" });
  assert.deepEqual(tres.corrigidos, [1]);
  const quatro = await rodar({});
  assert.deepEqual(quatro.corrigidos.sort(), [2, 3]);
  // Em paralelo, cada DFD continua com a ordem ler → corrigir.
  const p = await rodar({ paralelo: 3 });
  assert.deepEqual(p.corrigidos.sort(), [1, 2, 3]);
});

test("nó Corrigir com “Não corrigido para o fluxo”: o não corrigido faz o fluxo de UM DFD falhar", async () => {
  const def = REGISTRO_NOS.get("saida.corrigirPelaCenti");
  assert.ok(def);
  const it = { id: 5, numero: "5", centi: { numero: "5" }, mensagem: "x" };
  const ctx = (resultado: string) =>
    ({
      host: { corrigirPelaCenti: async () => ({ resultado, status: null, motivo: null, restam: ["Objeto"] }) },
      cancelado: () => false,
      aviso: () => undefined,
    }) as unknown as Parameters<typeof def.executar>[2];
  await assert.rejects(def.executar({ entrada: [it] }, { falhar: true }, ctx("parcial"), {}), /ainda diverge/);
  await assert.rejects(def.executar({ entrada: [it] }, { falhar: true }, ctx("pendente"), {}), /reconferência falhou/);
  const ok = await def.executar({ entrada: [it] }, { falhar: true }, ctx("corrigido"), {});
  assert.equal((ok as Record<string, unknown[]>).corrigidos.length, 1);
  const sem = await def.executar({ entrada: [it] }, {}, ctx("parcial"), {});
  assert.equal((sem as Record<string, unknown[]>).erros.length, 1, "desligado: vai à porta Não corrigidos");
});

// ——— O caso do DFD 1023 (Planej. 1078): a Centi devolveu as seções 8 e 9 de OUTRO registro (o Fundo de Saúde) e a
// correção trocaria SOLANGE/VANIA (corretos) por SANDRA/THIAGO. Nenhuma leitura assim pode virar base de correção.
const comSecoes = (d: DfdParseado, equipe: string, autoriza: string): DfdParseado => ({
  ...d,
  secoes: [
    ...d.secoes,
    { numero: 8, titulo: "8 - INDICAÇÃO DO(S) INTEGRANTE(S) DA EQUIPE DE PLANEJAMENTO E RESPONSÁVEL PELA FISCALIZAÇÃO", texto: `Integrantes Equipe: Nome: ${equipe}` },
    { numero: 9, titulo: "9 - AUTORIZAÇÃO DEMANDA", texto: `Autorizo o início da formalização da demanda. ${autoriza}` },
  ],
});
const sistema1023 = () => comSecoes(base(), "SOLANGE OLIVEIRA CARVALHO DAMASIO", "VANIA MARIA DA SILVA CHEFE DE GABINETE DO PREFEITO");
const misturado1023 = () => comSecoes(base(), "SANDRA LUCIA BRITO DE ALMEIDA LACERDA", "THIAGO DOS SANTOS SOUZA SECRETÁRIO MUNICIPAL DE SAÚDE");

async function rodarUmDfd(leituras: DfdParseado[], extra: Record<string, unknown> = {}) {
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(filho);
  const dfds = [{ id: 9, numero: "123", planejamento: "456", entidade: "1", ...extra }];
  let n = 0;
  const corrigidos: number[] = [];
  const marcados: { dfdId: number; status: string; retrato?: string }[] = [];
  const host = {
    __cache: new Map<string, unknown>([["dfds", Promise.resolve(dfds)]]),
    __entrada: dfds,
    esperaCentiMs: 0,
    mapaEntidades: { "1": "1" },
    dfdDoSistema: async () => ({ ...comparavel(sistema1023()), id: 9 }),
    lerDfdCenti: async (plan: string) => {
      const d = leituras[Math.min(n++, leituras.length - 1)];
      return { planejamento: plan, numero: "123", tipo: "DFD-S", situacao: "Aprovado", dfd: d };
    },
    corrigirPelaCenti: async (id: number) => {
      corrigidos.push(id);
      return { resultado: "corrigido", status: "convergente", motivo: null };
    },
  };
  const api = async (c: string, init?: unknown) => {
    if (c.includes("conferencia-dfds")) marcados.push(...((init as { body: { itens: typeof marcados } }).body.itens));
    return { ok: true, marcados: 1 };
  };
  const r = await executarFluxo(lerGrafo(filho.grafo), REGISTRO_NOS, { centi: async () => ({ ok: true }), api, cancelado: () => false, host });
  return { r, corrigidos, marcados, leituras: n };
}

test("DFD 1023: a Centi misturou outro registro numa emissão — NÃO corrige, NÃO guarda os dados, o DFD fica não conferido", async () => {
  const x = await rodarUmDfd([misturado1023(), sistema1023()]);
  assert.equal(x.leituras, 2, "a divergência foi confirmada com uma segunda emissão");
  assert.deepEqual(x.corrigidos, [], "nada foi gravado no DFD");
  assert.ok(!x.marcados.some((m) => m.retrato), "nenhum retrato guardado");
  assert.ok(!x.marcados.some((m) => m.status === "divergente"), "a conferência gravada não muda");
  // O fluxo de UM DFD conclui (a situação e o centro de custo dele seguem independentes); o DFD volta NÃO conferido — o
  // "Executar fluxo" o aponta e a retomada o refaz na próxima execução.
  assert.equal(x.r.estado, "concluido", x.r.erro);
  const volta = x.r.retorno.find((y) => Number(y.id) === 9);
  assert.equal(volta?.naoMarcar, true);
  assert.equal(volta?.correcao, "naoConferido");
  assert.match(String(volta?.mensagem), /conteúdos diferentes em duas emissões/);
  assert.equal(naoFeitoNaCenti(volta ?? {}), true);
});

test("DFD com divergência REAL (as duas emissões iguais): guarda o retrato confirmado (v 4) e corrige", async () => {
  const x = await rodarUmDfd([misturado1023(), misturado1023()]);
  assert.equal(x.r.estado, "concluido", x.r.erro);
  assert.deepEqual(x.corrigidos, [9]);
  const m = x.marcados.find((y) => y.status === "divergente");
  assert.ok(m?.retrato);
  assert.equal(lerRetrato(m.retrato)?.v, 4);
});

test("lido em OUTRO órgão da Centi: nunca guarda o retrato nem corrige", async () => {
  const filho = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-1-dfd");
  assert.ok(filho);
  const no = REGISTRO_NOS.get("dados.compararDfdCenti");
  const corr = REGISTRO_NOS.get("saida.corrigirPelaCenti");
  assert.ok(no && corr);
  const host: Record<string, unknown> = { dfdDoSistema: async () => ({ ...comparavel(sistema1023()), id: 9 }), lerDfdCenti: async () => ({ dfd: misturado1023() }) };
  const ctx = { host, cancelado: () => false, aviso: () => undefined } as unknown as Parameters<typeof no.executar>[2];
  const it = { id: 9, numero: "123", planejamento: "456", entidade: "1", entidadeAchada: "2", centi: { numero: "123", tipo: "DFD-S", situacao: "Aprovado", dfd: misturado1023() } };
  const r = (await no.executar({ entrada: [it] }, {}, ctx, {})) as { divergentes: Record<string, unknown>[] };
  assert.equal((host.__retratosCenti as Map<number, string>).size, 0);
  const c = (await corr.executar({ entrada: r.divergentes }, {}, { ...ctx, host: { ...host, corrigirPelaCenti: async () => assert.fail("não pode corrigir") } } as typeof ctx, {})) as {
    erros: Record<string, unknown>[];
  };
  assert.match(String(c.erros[0]?.erro), /outro órgão|órgão 2/);
});

test("retrato antigo (sem a dupla leitura) ou de outro órgão não vale; a assinatura do conteúdo pega a troca das seções", () => {
  const t = textoRetrato(montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "1" }, { situacao: "Aprovado" }, misturado1023(), { objeto: true, tolerancia: 0.01 }));
  assert.ok(t && lerRetrato(t));
  assert.equal(lerRetrato(t.replace('"v":4', '"v":1')), null);
  // O v 2 foi emitido com a assinatura de OUTRO planejamento (id fixo): não vale mais.
  assert.equal(lerRetrato(t.replace('"v":4', '"v":2')), null);
  // O v 3 pode ter sido lido sem os valores ("Emitir valor referência" = Não): não vale mais.
  assert.equal(lerRetrato(t.replace('"v":4', '"v":3')), null);
  const outro = textoRetrato(montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "1", entidadeAchada: "2" }, { situacao: "Aprovado" }, misturado1023(), { objeto: true, tolerancia: 0.01 }));
  assert.equal(lerRetrato(outro), null);
  assert.notEqual(assinaturaDfdCenti(sistema1023()), assinaturaDfdCenti(misturado1023()));
  assert.equal(assinaturaDfdCenti(misturado1023()), assinaturaDfdCenti({ ...misturado1023(), assinaturas: [], nomeArquivo: "outro.pdf" }));
});

test("Substituir DFD pela Centi: sem a segunda emissão igual, nada é gravado", async () => {
  const no = REGISTRO_NOS.get("saida.substituirDfd");
  assert.ok(no);
  let n = 0;
  const gravados: number[] = [];
  const host = {
    lerDfdCenti: async () => ({ dfd: n++ === 0 ? sistema1023() : misturado1023() }),
    substituirDfd: async (id: number) => {
      gravados.push(id);
      return { numero: "123", itens: 2 };
    },
  };
  const ctx = { host, cancelado: () => false, aviso: () => undefined } as unknown as Parameters<typeof no.executar>[2];
  const it = { id: 9, numero: "123", planejamento: "456", entidade: "1", centi: { dfd: misturado1023() } };
  const r = (await no.executar({ entrada: [it] }, {}, ctx, {})) as { erros: Record<string, unknown>[] };
  assert.deepEqual(gravados, []);
  assert.match(String(r.erros[0]?.erro), /conteúdos diferentes/);
  const ok = (await no.executar({ entrada: [it] }, {}, ctx, {})) as { substituidos: unknown[] };
  assert.equal(ok.substituidos.length, 1, "a segunda emissão igual confirma");
  // Sem o registro das seções 8 a 10 na leitura (a prévia da Centi 217): a substituição mantém as do SISTEMA.
  const sem: boolean[] = [];
  const host2 = {
    lerDfdCenti: async () => ({ dfd: misturado1023() }),
    substituirDfd: async (_id: number, _d: unknown, semSecoes810?: boolean) => {
      sem.push(semSecoes810 === true);
      return { numero: "123", itens: 2 };
    },
  };
  const ctx2 = { host: host2, cancelado: () => false, aviso: () => undefined } as unknown as Parameters<typeof no.executar>[2];
  await no.executar({ entrada: [{ ...it, centi: { dfd: misturado1023(), semSecoes810: true, secoes810NaoLidas: true } }] }, {}, ctx2, {});
  await no.executar({ entrada: [{ ...it, centi: { dfd: misturado1023() } }] }, {}, ctx2, {});
  assert.deepEqual(sem, [true, false]);
});

test("assinatura do conteúdo: o rodapé que muda a cada emissão (e-Assinatura, hora, página) não conta; a troca de nomes conta", () => {
  const a = sistema1023();
  const b = { ...sistema1023(), secoes: sistema1023().secoes.map((x, i) => (i === 0 ? { ...x, texto: `${x.texto} Centi ® e-Assinatura: 8ÇH$dg58teX Emitido em 16/11/2026 14:33 por jhone.sousa Página 1 de 4` } : x)) };
  assert.equal(assinaturaDfdCenti(a), assinaturaDfdCenti(b));
  assert.notEqual(assinaturaDfdCenti(a), assinaturaDfdCenti(misturado1023()));
});

test("o retrato só vale para o DFD com o MESMO nº de planejamento; a correção recusa o de outro", async () => {
  const r = lerRetrato(textoRetrato(montarRetrato({ numero: "123", tipo: "DFD-S", entidade: "1" }, { situacao: "Aprovado" }, centiDivergente(), { objeto: true, tolerancia: 0.01 })));
  assert.ok(retratoDoPlanejamento(r, "0456"));
  assert.equal(retratoDoPlanejamento(r, "457"), null);
  assert.equal(retratoDoPlanejamento(r, null), null);
  const outro = { ...centiDivergente(), planejamento: "999" };
  const sv = servidor({ status: "divergente", retrato: retrato(outro) });
  await assert.rejects(corrigirDfdPelaCenti(9, null, sv.busca), /CONFIRMADOS/);
  assert.equal(sv.chamadas.some((c) => c.metodo !== "GET"), false, "nada é gravado");
});

test("trava da sessão da Centi: duas abas nunca intercalam load e emissão", async () => {
  const { comSessaoCenti } = await import("../src/lib/centi-sessao.ts");
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let fila: Promise<unknown> = Promise.resolve();
  const locks = {
    request: (_n: string, f: () => Promise<unknown>) => {
      const r = fila.then(f);
      fila = r.catch(() => undefined);
      return r;
    },
  };
  Object.defineProperty(globalThis, "navigator", { value: { locks }, configurable: true, writable: true });
  try {
    const log: string[] = [];
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const aba = (nome: string) =>
      comSessaoCenti(async () => {
        log.push(`${nome}:load`);
        await espera(5);
        log.push(`${nome}:emitir`);
      });
    await Promise.all([aba("A"), aba("B")]);
    assert.deepEqual(log, ["A:load", "A:emitir", "B:load", "B:emitir"]);
  } finally {
    if (desc) Object.defineProperty(globalThis, "navigator", desc);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});

test("nunca apagar o que a equipe tratou e a Centi não traz: Prioridade/Previsão/Fundamentação e referências do DFD-R ficam", () => {
  const s = base();
  s.tipo = "DFD-R";
  s.numeroContrato = "045/2025";
  s.secoes = [
    ...s.secoes,
    { numero: 5, titulo: "5 - PREVISÃO DE ENTREGA", texto: "MARÇO/2027" },
    { numero: 7, titulo: "7 - FUNDAMENTAÇÃO LEGAL", texto: "Lei 14.133/2021" },
  ];
  const c = base();
  c.tipo = "DFD-R";
  c.secoes = [{ ...c.secoes[0] }]; // a Centi sem Prioridade, Previsão e Fundamentação
  const r = retrato(c);
  // A conferência não acusa o que só o sistema tratou.
  assert.equal(conferenciaDoRetrato(comparavel(s), r).status, "convergente");
  const corr = simularCorrecao(s, r, 2027);
  assert.equal(corr.status, "convergente");
  const titulos = corr.corrigido.secoes.map((x) => x.titulo).join("|");
  assert.match(titulos, /PRIORIDADE/);
  assert.match(titulos, /PREVIS/);
  assert.match(titulos, /FUNDAMENTA/);
  assert.equal(corr.corrigido.numeroContrato, "045/2025");
});

test("o que a Centi TEM com outro conteúdo continua sendo corrigido (prioridade diferente)", () => {
  const s = base();
  const c = base();
  c.secoes = [c.secoes[0], { numero: 6, titulo: "6 - PRIORIDADE", texto: "BAIXA" }];
  const r = retrato(c);
  assert.equal(conferenciaDoRetrato(comparavel(s), r).status, "divergente");
  const corr = simularCorrecao(s, r, 2027);
  assert.equal(corr.status, "convergente");
  assert.equal(corr.corrigido.secoes.find((x) => /PRIORIDADE/.test(x.titulo))?.texto, "BAIXA");
});

test("validade do retrato para corrigir: até 24 h e nunca anterior à última gravação do DFD", async () => {
  const { retratoValido, MSG_RETRATO_VENCIDO } = await import("../src/lib/conferencia-dfd-centi.ts");
  const agora = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(retratoValido("2026-11-15T13:00:00Z", "2026-11-15 10:00:00", agora), true);
  assert.equal(retratoValido("2026-11-15T11:00:00Z", "2026-11-15 10:00:00", agora), false);
  assert.equal(retratoValido("2026-11-16T10:00:00Z", "2026-11-16 11:00:00", agora), false);
  assert.equal(retratoValido(null, null, agora), false);
  // O cliente recusa quando o servidor diz que venceu.
  const dfd = { ...base(), id: 9, conferenciaCenti: "divergente", conferenciaCentiMotivo: "DFD 123 (Planej. 456): 1 diferença — Objeto: “a” no sistema × “b” na Centi", atualizadoEm: "x" } as unknown as DfdDetalhe;
  const busca = async (url: string) =>
    new Response(JSON.stringify(url.includes("retrato=1") ? { ok: true, retrato: null, vencido: true } : { ok: true, dfd }), { status: 200 });
  await assert.rejects(corrigirDfdPelaCenti(9, null, busca as typeof fetch), (e: Error) => e.message === MSG_RETRATO_VENCIDO);
});

test("Quais DFDs: Todos reconfere também os gravados convergentes; os outros filtram pelo gravado", async () => {
  const { passaConferencia } = await import("../src/lib/fluxo-dados.ts");
  const conv = { conferenciaCenti: "convergente", conferenciaCentiEm: "2026-11-16T10:00:00Z", atualizadoEm: "2026-11-16 09:00:00" };
  const velho = { ...conv, atualizadoEm: "2026-11-16 11:00:00" };
  const div = { conferenciaCenti: "divergente" };
  const nunca = { conferenciaCenti: null };
  assert.deepEqual([conv, velho, div, nunca].map((x) => passaConferencia(x, "todos")), [true, true, true, true]);
  assert.deepEqual([conv, velho, div, nunca].map((x) => passaConferencia(x, "divergentes")), [false, false, true, false]);
  assert.deepEqual([conv, velho, div, nunca].map((x) => passaConferencia(x, "pendentes")), [false, true, true, true]);
  const m = MODELOS_FLUXO.find((x) => x.id === "conferir-corrigir-centi");
  assert.equal(m?.grafo.nos.find((x) => x.id === "div1")?.tipo, "dados.filtrarConferencia");
  assert.ok(!m?.grafo.nos.some((x) => x.tipo === "entrada.selecionar"), "sem a Seleção: o campo escolhe");
});

test("todo modelo cabe nos limites do salvar (nome e descrição — senão “Atualizar pelo modelo” falha)", () => {
  for (const m of MODELOS_FLUXO) {
    assert.ok(m.descricao.length <= 400, `${m.id}: descrição com ${m.descricao.length} caracteres`);
    assert.ok(m.nome.length <= 80, `${m.id}: nome longo`);
  }
});

test("todo modelo passa no Zod do salvar (criar e atualizar)", async () => {
  const { criarFluxoSchema, editarFluxoSchema } = await import("../src/lib/fluxos-validation.ts");
  for (const m of MODELOS_FLUXO) {
    const corpo = { nome: m.nome, descricao: m.descricao, ajuda: m.ajuda, grafo: grafoDoModelo(m, new Map()) };
    const a = criarFluxoSchema.safeParse(corpo);
    assert.ok(a.success, `${m.id}: ${a.success ? "" : a.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    assert.ok(editarFluxoSchema.safeParse(corpo).success, m.id);
  }
});
