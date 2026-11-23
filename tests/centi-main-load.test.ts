import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { assinaturaDoLoad } from "../src/lib/assinatura-dfd-centi.ts";
import { dadosDoPlanejamento, faltasDoLoad, centroCustoLidoNoLoad } from "../src/lib/automacao-centi-core.ts";

// A aba da Centi FALSA: o cliente HTTP da própria Centi (axios em ".../restauth" achado pelo webpack) e o XHR da página.
// Cada pedido do cliente passa pelo XHR (como o axios real), então o `guardar` da extensão o vê.
type Pedido = { via: "centi" | "xhr"; url: string; headers: Record<string, string> };

function abaCenti(opcoes: {
  chunk?: boolean;
  cliente?: boolean;
  respostaCenti?: (url: string, h: Record<string, string>) => unknown;
  respostaXhr?: (url: string, h: Record<string, string>, corpo?: string) => unknown;
  /** A página chama `fetch` (a Centi 3.0.216.217): a resposta de cada pedido; sem ela, o fetch da página falha. */
  respostaFetch?: (url: string, metodo: string, corpo?: string) => unknown;
  /** É a aba DA AUTOMAÇÃO (o serviço da extensão a marcou no "estado")? Padrão: sim — só ela ensina. */
  automacao?: boolean;
}) {
  const pedidos: Pedido[] = [];
  const ouvintes: ((e: unknown) => void)[] = [];
  const doDocumento: { tipo: string; f: (e: unknown) => void }[] = [];
  // O relógio da aba (o tempo passa entre o clique da pessoa e os pedidos seguintes — `avancar`).
  let deslocamento = 0;
  class Relogio extends Date {
    static now() {
      return Date.now() + deslocamento;
    }
  }
  const respostas: unknown[] = [];
  const armazem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, String(v)), removeItem: (k: string) => m.delete(k) };
  };
  const ORIGEM = "https://centi.exemplo.gov.br";
  class XHR {
    status = 0;
    response: unknown = null;
    responseType = "";
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    _ouv: (() => void)[] = [];
    _url = "";
    _h: Record<string, string> = {};
    open(_m: string, url: string) {
      this._url = url;
    }
    setRequestHeader(k: string, v: string) {
      this._h[k] = v;
    }
    get responseText() {
      return typeof this.response === "string" ? this.response : new TextDecoder().decode(this.response as ArrayBuffer);
    }
    getResponseHeader() {
      return null;
    }
    getAllResponseHeaders() {
      return "";
    }
    addEventListener(_t: string, f: () => void) {
      this._ouv.push(f);
    }
    send(corpo?: unknown) {
      pedidos.push({ via: "xhr", url: this._url, headers: { ...this._h } });
      const j = opcoes.respostaXhr?.(this._url, this._h, typeof corpo === "string" ? corpo : undefined) ?? { Entity: null };
      this.status = 200;
      this.response = this.responseType === "text" ? JSON.stringify(j) : new TextEncoder().encode(JSON.stringify(j)).buffer;
      queueMicrotask(() => {
        this.onload?.();
        for (const f of this._ouv) f();
      });
    }
  }
  const ctx: Record<string, unknown> = {
    URL,
    Date: Relogio,
    TextEncoder,
    TextDecoder,
    Headers,
    crypto: globalThis.crypto,
    btoa,
    atob,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    console,
    XMLHttpRequest: XHR,
    location: { href: `${ORIGEM}/compras/`, origin: ORIGEM },
    sessionStorage: armazem(),
    localStorage: armazem(),
    Request,
    Response,
    // A grade da CM002 (as colunas da tela, lidas 1,5 s depois da lista): nenhuma nesta aba falsa. Os cliques da pessoa
    // (o Pesquisar) chegam aos ouvintes do documento.
    document: { querySelectorAll: () => [], addEventListener: (tipo: string, f: (e: unknown) => void) => doDocumento.push({ tipo, f }) },
    fetch: async (rec: unknown, init?: RequestInit) => {
      if (!opcoes.respostaFetch) throw new Error("sem fetch");
      const req = new Request(rec as string | Request | URL, init);
      const corpo = /^(GET|HEAD)$/i.test(req.method) ? undefined : await req.text();
      return new Response(JSON.stringify(opcoes.respostaFetch(req.url, req.method, corpo)), { status: 200, headers: { "content-type": "application/json" } });
    },
    addEventListener: (t: string, f: (e: unknown) => void) => t === "message" && ouvintes.push(f),
    postMessage: (m: unknown) => {
      respostas.push(m);
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  if (opcoes.cliente !== false) {
    // O "axios" da Centi: o pedido sai pelo XHR da página com os cabeçalhos da TELA (os interceptors) + os do pedido.
    const daTela = { Refreshtoken: "rt-da-tela", Company: "2", Month: "11" };
    const axios = Object.assign(
      async (_c: unknown) => ({}),
      {
        defaults: { baseURL: `${ORIGEM}/compras/restauth` },
        interceptors: {},
        get: async (url: string) => axios.request({ method: "GET", url }),
        post: async (url: string, data: unknown) => axios.request({ method: "POST", url, data }),
        request: async (c: { method: string; url: string; data?: unknown; headers?: Record<string, string> }) => {
          const XH = ctx.XMLHttpRequest as typeof XHR;
          const x = new XH();
          x.open(c.method, `${ORIGEM}/compras/restauth${c.url}`);
          const h = { ...daTela, ...(c.headers ?? {}) };
          for (const [k, v] of Object.entries(h)) x.setRequestHeader(k, v);
          x.responseType = "text";
          x.send();
          pedidos[pedidos.length - 1].via = "centi";
          return { status: 200, headers: {}, data: opcoes.respostaCenti?.(c.url, h) ?? { Entity: null } };
        },
      },
    );
    const modulos = { 1: { exports: { default: axios } } };
    const fila: unknown[] = [];
    fila.push = (item: unknown) => {
      if (opcoes.chunk) {
        // webpack 5: o 3º item é a função que recebe o __webpack_require__.
        (item as [unknown, unknown, (r: unknown) => void])[2]({ c: modulos });
        return 1;
      }
      const [, defs, executar] = item as [unknown, Record<string, (m: unknown, e: unknown, r: unknown) => void>, string[][]];
      const id = executar[0][0];
      defs[id]({}, {}, { c: modulos });
      return 1;
    };
    if (opcoes.chunk) ctx.webpackChunkcenti = fila;
    else ctx.webpackJsonp = fila;
  }
  vm.createContext(ctx);
  vm.runInContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  vm.runInContext(readFileSync("extensao-centi/centi-main.js", "utf8"), ctx);
  const janela = vm.runInContext("window", ctx);
  const p = Number(/const PROTOCOLO = (\d+)/.exec(readFileSync("extensao-centi/centi-main.js", "utf8"))?.[1]);
  // O serviço da extensão pergunta o estado à aba DELE (a da automação): a página a marca.
  if (opcoes.automacao !== false) for (const f of ouvintes) f({ source: janela, data: { fonte: "pca-centi-pedido", p, id: 0, acao: "estado", dados: { automacao: true } } });
  // A pessoa clica num botão da tela (o Pesquisar da CM002 — texto, título ou o ícone da lupa).
  const clicar = (botao: { texto?: string; titulo?: string; classe?: string }) => {
    const el = {
      textContent: botao.texto ?? "",
      className: botao.classe ?? "",
      closest: () => el,
      getAttribute: (k: string) => (k === "title" ? (botao.titulo ?? null) : null),
      querySelectorAll: () => [],
    };
    for (const o of doDocumento) if (o.tipo === "click") o.f({ target: el });
  };
  let n = 0;
  const acao = async (nome: string, dados?: unknown) => {
    const id = ++n;
    for (const f of ouvintes) f({ source: janela, data: { fonte: "pca-centi-pedido", p, id, acao: nome, dados } });
    for (let i = 0; i < 50; i++) {
      const r = respostas.find((x) => (x as { id: number }).id === id) as { resposta: Record<string, unknown> } | undefined;
      if (r) return JSON.parse(JSON.stringify(r.resposta));
      await new Promise((ok) => setTimeout(ok, 1));
    }
    throw new Error("sem resposta");
  };
  // Um pedido da TELA (a pessoa abriu a CM002): a extensão guarda a cópia dos cabeçalhos dela.
  const pedidoDaTela = (h: Record<string, string>) => {
    const XH = ctx.XMLHttpRequest as typeof XHR;
    const x = new XH();
    x.open("POST", `${ORIGEM}/compras/restauth/postdata`);
    for (const [k, v] of Object.entries(h)) x.setRequestHeader(k, v);
    x.send();
  };
  // A TELA abre um registro (o duplo clique na CM002): o pedido dela à API, com os cabeçalhos dela.
  const telaAbre = (url: string, h: Record<string, string>) => {
    const XH = ctx.XMLHttpRequest as typeof XHR;
    const x = new XH();
    x.open("GET", `${ORIGEM}/compras/${url}`);
    for (const [k, v] of Object.entries(h)) x.setRequestHeader(k, v);
    x.send();
  };
  // A TELA da Centi 217 abre o cadastro por um POST com o corpo (ex.: o `searchentity` com o filtro pelo Id).
  const telaPost = (url: string, corpo: unknown, h: Record<string, string>) => {
    const XH = ctx.XMLHttpRequest as typeof XHR;
    const x = new XH();
    x.open("POST", `${ORIGEM}/compras/${url}`);
    for (const [k, v] of Object.entries(h)) x.setRequestHeader(k, v);
    x.send(JSON.stringify(corpo));
  };
  const espera = () => new Promise((ok) => setTimeout(ok, 5));
  // A TELA pede pelo `fetch` da página (já com o gancho da extensão).
  const telaFetch = (rec: unknown, init?: RequestInit) => (janela as { fetch: (r: unknown, i?: RequestInit) => Promise<Response> }).fetch(rec, init);
  const avancar = (ms: number) => {
    deslocamento += ms;
  };
  return { acao, pedidos, pedidoDaTela, telaAbre, telaPost, telaFetch, espera, clicar, avancar, ORIGEM, local: ctx.localStorage as { getItem: (k: string) => string | null } };
}

const LOAD = "restauth/load?entity=101045&key=640";

test("Centi: o load do planejamento num órgão sai pelo CLIENTE DA CENTI, com o órgão só nele", async () => {
  const aba = abaCenti({ respostaCenti: (_u, h) => ({ Entity: { Fields: [{ Key: "Id", Value: 640 }] }, org: h.Company }) });
  aba.pedidoDaTela({ Refreshtoken: "rt-da-tela", Company: "2", Month: "11" });
  const r = await aba.acao("ler", { metodo: "GET", caminho: LOAD, entidade: "6" });
  assert.equal(r.ok, true);
  assert.equal(r.via, "centi");
  assert.equal(r.j.org, "6", "o órgão pedido só neste pedido");
  const ultimo = aba.pedidos.at(-1);
  assert.equal(ultimo?.via, "centi");
  assert.equal(ultimo?.headers.Company, "6");
  // A cópia da tela NÃO passou a ser a do pedido da extensão (o órgão aberto continua o da tela).
  const e = await aba.acao("estado");
  assert.equal(e.entidade, "2");
});

test("Centi: o cliente sem o registro → tenta a cópia; os dois sem ele = o diagnóstico (só os NOMES)", async () => {
  const aba = abaCenti({
    respostaCenti: () => ({ Entity: null }),
    respostaXhr: (u) => (u.includes("key=640") ? { Entity: { Fields: [{ Key: "Id", Value: 640 }] } } : {}),
  });
  aba.pedidoDaTela({ Refreshtoken: "rt-da-tela", Company: "2" });
  const r = await aba.acao("ler", { metodo: "GET", caminho: LOAD, entidade: "6" });
  assert.equal(r.ok, true);
  assert.ok(r.j.Entity, "a cópia abriu o registro");
  assert.match(r.via, /cópia/);

  const nada = abaCenti({ respostaCenti: () => ({ Entity: null }), respostaXhr: () => ({ Entity: null }) });
  nada.pedidoDaTela({ Refreshtoken: "segredo-do-token", Company: "2" });
  const r2 = await nada.acao("ler", { metodo: "GET", caminho: LOAD, entidade: "6" });
  assert.equal(r2.ok, true);
  assert.equal(r2.j.Entity, null);
  assert.match(r2.via, /sem o registro/);
  assert.deepEqual(r2.cabecalhos, ["Refreshtoken", "Company"]);
  assert.ok(!JSON.stringify(r2).includes("segredo-do-token"), "nunca o valor do token");
});

test("Centi: sem o cliente da Centi, o load sai pela cópia de sempre", async () => {
  const aba = abaCenti({ cliente: false, respostaXhr: () => ({ Entity: { Fields: [] } }) });
  aba.pedidoDaTela({ Refreshtoken: "rt", Company: "2" });
  const r = await aba.acao("ler", { metodo: "GET", caminho: LOAD, entidade: "6" });
  assert.equal(r.ok, true);
  assert.match(r.via, /cópia da tela/);
  assert.equal(aba.pedidos.at(-1)?.headers.Company, "6");
});

test("Centi: sem o cliente, a cópia COM token não abre e a sem token abre — vale também para a emissão", async () => {
  // A Centi nova (fetch): os cabeçalhos em minúsculas com token/user/year; o registro só abre sem o token.
  const aba = abaCenti({
    cliente: false,
    respostaXhr: (u, h) => (u.includes("key=718") ? ("token" in h ? { Entity: null } : { Entity: { Fields: [{ Key: "Id", Value: 718 }] } }) : {}),
  });
  aba.pedidoDaTela({ user: "9", token: "t", refreshtoken: "rt", company: "2", year: "2026", month: "11" });
  const r = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=718", entidade: "6" });
  assert.equal(r.ok, true);
  assert.ok(r.j.Entity, "a cópia sem o token abriu");
  assert.equal(r.via, "cópia sem token");
  assert.equal(aba.pedidos.at(-1)?.headers.company, "6", "o órgão pedido no cabeçalho em minúsculas");
  // A próxima leitura já começa pela que abriu.
  const antes = aba.pedidos.length;
  await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=718", entidade: "6" });
  assert.equal(aba.pedidos.length - antes, 1);

  const nada = abaCenti({ cliente: false, respostaXhr: () => ({ Entity: null }) });
  nada.pedidoDaTela({ user: "9", token: "segredo", refreshtoken: "rt", company: "2", year: "2026" });
  const r2 = await nada.acao("ler", { metodo: "GET", caminho: LOAD, entidade: "6" });
  assert.equal(r2.ok, true);
  assert.equal(r2.j.Entity, null);
  assert.match(r2.via, /sem o cliente da Centi/);
  assert.match(r2.via, /da tela 200 sem o registro; sem token 200 sem o registro; mínima 200 sem o registro/);
  assert.ok(!JSON.stringify(r2).includes("segredo"));
});

test("Centi: o AQUECER não troca a cópia de um pedido da tela (só preenche quando não há)", async () => {
  const aba = abaCenti({});
  aba.pedidoDaTela({ Refreshtoken: "rt-da-tela", Company: "3", Month: "11" });
  await aba.acao("aquecer");
  assert.equal((await aba.acao("estado")).entidade, "3");

  const vazia = abaCenti({});
  const r = await vazia.acao("aquecer");
  assert.equal(r.ok, true, "sem cópia, o aquecer a preenche");
  assert.equal((await vazia.acao("estado")).entidade, "2");
});

test("Centi: o cliente também é achado no webpack 5 (webpackChunk…)", async () => {
  const aba = abaCenti({ chunk: true, respostaCenti: () => ({ Entity: { Fields: [] } }) });
  aba.pedidoDaTela({ Refreshtoken: "rt", Company: "2" });
  const r = await aba.acao("ler", { metodo: "GET", caminho: LOAD, entidade: "6" });
  assert.equal(r.via, "centi");
});

// A ESTRUTURA REAL do load do planejamento que a tela da Centi devolveu (DevTools, 17/11/2026 — planejamento 131): o
// planejamento traz o protocolo ligado ANINHADO (com NrProtocolo dentro) — nunca vira modelo de protocolo.
const planejamentoReal = (id: string, modulo = 101045) => ({
  $type: "ORM.ObjectsJSON.Returns.LoadReturn, ORM",
  Entity: {
    Type: 0,
    State: 3,
    ModuleKey: modulo,
    Fields: [
      { Key: "DataInicial", Value: "01/01/2027" },
      {
        Key: "IdCentroCusto",
        Value: { ModuleKey: 0, Fields: [{ Key: "Id", Value: 75 }, { Key: "Display", Value: "PM RV, SECRETARIA MUNICIPAL DE PLANEJAMENTO E GESTÃO" }] },
      },
      { Key: "Finalidade", Value: "EMPENHO COMPLEMENTAR DO CONTRATO 177/2023" },
      { Key: "IdPlanejamentoAssinaturaDFD", Value: { ModuleKey: 0, Fields: [{ Key: "Id", Value: 114 }, { Key: "Display", Value: "SECRETARIA" }] } },
      {
        Key: "IdProtocolo",
        Value: {
          ModuleKey: 0,
          Fields: [
            { Key: "Id", Value: 2275339 },
            { Key: "Display", Value: "99422/2026" },
            { Key: "Object", Value: { ModuleKey: 102951, Fields: [{ Key: "NrProtocolo", Value: "99422" }, { Key: "AnoReferencia", Value: "2026" }] } },
          ],
        },
      },
      { Key: "Id", Value: id },
    ],
  },
  Message: null,
});
// A Centi 3.0.216.217: a tela abre o planejamento por OUTRO módulo (aqui 999999) e com os cabeçalhos em minúsculas; o
// módulo fixo 101045 volta vazio. O registro só abre pelo módulo novo com o órgão no formato da tela ("03").
const CENTI_NOVA = (u: string, h: Record<string, string>) => {
  const m = /entity=(\d+)&key=(\d+)/.exec(u);
  if (!m) return {};
  if (m[1] !== "999999") return { Entity: null };
  return h.company && !/^\d{2}$/.test(h.company) ? { Entity: null } : { ...planejamentoReal(m[2], 999999), org: h.company };
};
const DA_TELA = { user: "9", token: "tk-da-tela", refreshtoken: "rt", company: "02", year: "2026", month: "11" };

test("Centi nova: a extensão APRENDE como a tela abre o planejamento e passa a abrir por ele (órgão no formato da tela)", async () => {
  const aba = abaCenti({ cliente: false, respostaXhr: CENTI_NOVA });
  // Sem aprender: os módulos fixos voltam vazios e o diagnóstico diz o que fazer, com os pedidos da tela.
  aba.telaAbre("restauth/postdata", DA_TELA);
  await aba.espera();
  const antes = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=24", entidade: "3", planejamento: "24" });
  assert.equal(antes.ok, true);
  assert.equal(antes.j.Entity, null);
  assert.equal(antes.semModelo, true);
  assert.match(antes.via, /módulo 101045: .*sem o registro/);
  assert.match(antes.via, /módulo 101026: /);
  assert.match(antes.via, /órgão da tela: 99/);
  assert.match(antes.via, /sem o load aprendido/);
  assert.ok(!JSON.stringify(antes).includes("tk-da-tela"), "nunca o valor do token");

  // A pessoa abre UM planejamento na CM002: a tela pede pelo módulo novo e a extensão aprende.
  aba.telaAbre("restauth/load?entity=999999&key=131", DA_TELA);
  await aba.espera();
  const modelo = JSON.parse(aba.local.getItem("__pcaLoadPlanejamento_v1") ?? "null");
  assert.equal(modelo.modulo, 999999);
  assert.equal(modelo.caminho, "restauth/load?entity=999999&key={id}");
  assert.equal(aba.local.getItem("__pcaLoadProtocolo_v1"), null, "o protocolo aninhado não vira modelo de protocolo");
  assert.equal((await aba.acao("estado")).aprendido.loadPlanejamento.ok, true);

  // Agora o planejamento 24 no órgão 3: pelo pedido aprendido, com o órgão "03" (o formato da tela).
  const r = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=24", entidade: "3", planejamento: "24" });
  assert.equal(r.ok, true);
  assert.equal(r.j.Entity.ModuleKey, 999999);
  assert.equal(r.j.org, "03");
  assert.match(r.via, /^como a tela abre \(módulo 999999\) · cópia (do load )?da tela$/);
  const ultimo = aba.pedidos.at(-1);
  assert.match(ultimo?.url ?? "", /entity=999999&key=24$/);
  assert.equal(ultimo?.headers.company, "03");
});

test("Centi: sem `planejamento` (a extensão antiga do sistema), o load segue o caminho pedido", async () => {
  const aba = abaCenti({ cliente: false, respostaXhr: () => ({ Entity: { Fields: [] } }) });
  aba.pedidoDaTela({ Refreshtoken: "rt", Company: "2" });
  const r = await aba.acao("ler", { metodo: "GET", caminho: LOAD, entidade: "6" });
  assert.equal(r.via, "cópia da tela");
  assert.match(aba.pedidos.at(-1)?.url ?? "", /entity=101045&key=640$/);
});

test("Centi nova: o pedido aprendido usa a cópia dos cabeçalhos do PRÓPRIO load da tela (não a do último pedido)", async () => {
  // A cópia do load da tela abre; a do último pedido (outro contexto — o exercício) não. O token é sempre o mais novo.
  const aba = abaCenti({
    cliente: false,
    respostaXhr: (u, h) => (u.includes("entity=999999") && h.year !== "2026" ? { Entity: null } : CENTI_NOVA(u, h)),
  });
  aba.telaAbre("restauth/load?entity=999999&key=131", DA_TELA);
  await aba.espera();
  aba.pedidoDaTela({ ...DA_TELA, year: "2025" });
  const r = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=24", entidade: "03", planejamento: "24" });
  assert.equal(r.ok, true);
  assert.ok(r.j.Entity, "abriu pela cópia do load da tela");
  assert.match(r.via, /cópia do load da tela$/);
});

test("Centi nova: uma PRÉVIA do planejamento (sem o centro de custo e as seções 8–10) nunca vale como o load", async () => {
  // A tela pede uma prévia (módulo 777777, só Finalidade/Situacao) e o cadastro completo (999999).
  const previa = (id: string) => ({ Entity: { ModuleKey: 777777, Fields: [{ Key: "Finalidade", Value: "x" }, { Key: "Situacao", Value: 1 }, { Key: "Id", Value: id }] } });
  const resposta = (u: string, h: Record<string, string>) => {
    const m = /entity=(\d+)&key=(\d+)/.exec(u);
    if (m?.[1] === "777777") return previa(m[2]);
    return CENTI_NOVA(u, h);
  };
  const aba = abaCenti({ cliente: false, respostaXhr: resposta });
  // Só a prévia aprendida: o load "abre" incompleto — vale o mais completo, marcado, e os fixos são tentados.
  aba.telaAbre("restauth/load?entity=777777&key=131", DA_TELA);
  await aba.espera();
  const r1 = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=24", entidade: "3", planejamento: "24" });
  assert.deepEqual(r1.incompleto, ["IdCentroCusto", "IdPlanejamentoAssinaturaDFD"]);
  assert.match(r1.via, /INCOMPLETO/);
  assert.match(r1.via, /módulo 101045: /, "os fixos também foram tentados");
  // O cadastro completo aberto pela tela substitui a prévia; a prévia depois NÃO o troca de volta.
  aba.telaAbre("restauth/load?entity=999999&key=131", DA_TELA);
  await aba.espera();
  aba.telaAbre("restauth/load?entity=777777&key=132", DA_TELA);
  await aba.espera();
  assert.equal(JSON.parse(aba.local.getItem("__pcaLoadPlanejamento_v1") ?? "null").modulo, 999999);
  const r2 = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=24", entidade: "3", planejamento: "24" });
  assert.equal(r2.incompleto, undefined);
  assert.equal(r2.j.Entity.ModuleKey, 999999);
  assert.equal(r2.j.Entity.Fields.find((f: { Key: string }) => f.Key === "Id").Value, "24", "o registro DESTE planejamento");
});

// A Centi 3.0.216.217 (19/11/2026): as respostas vêm no envelope {Data, Count, IdLog, Success, Message, Code} (o print do
// diagnóstico: "POST restauth/searchentity → 200 (Data,Count,IdLog,Success,Message,Code)"). A tela abre o cadastro por um
// POST com o Id no corpo; o registro vem como OBJETO SIMPLES em `Data` (ou numa lista de um em `Data`).
const cadastro217 = (id: number) => ({
  Id: id,
  Finalidade: "AQUISIÇÃO DE MATERIAL",
  IdCentroCusto: { Id: 9, Descricao: "PM RV, AGENCIA MUN. DE MEIO AMBIENTE E ORDENAMENTO TERRITORIAL" },
  IdPlanejamentoAssinaturaDFD: { Id: 114, Descricao: "SECRETARIA" },
  Situacao: { Id: 2, Descricao: "Não Executado" },
  NumeroDFD: 227,
});
const CENTI_217 = (emLista = false) => (u: string, h: Record<string, string>, corpo?: string) => {
  if (/entity=101045/.test(u)) return { Entity: null, Message: null };
  if (/entity=101026/.test(u)) return { Entity: { ModuleKey: 101026, Fields: [{ Key: "Finalidade", Value: "x" }, { Key: "Id", Value: "277" }] } };
  if (/searchentity/.test(u)) {
    const b = corpo ? JSON.parse(corpo) : {};
    const id = Number(b?.Filtro?.Id);
    if (!id) return { Data: [{ Id: 1 }, { Id: 2 }, { Id: 3 }], Count: 3, IdLog: 1, Success: true, Message: null, Code: 0 };
    if (h.company && !/^\d{2}$/.test(h.company)) return { Data: null, Count: 0, IdLog: 1, Success: true, Message: null, Code: 0 };
    return { Data: emLista ? [cadastro217(id)] : cadastro217(id), Count: 1, IdLog: 1, Success: true, Message: null, Code: 0 };
  }
  return {};
};
const CORPO_217 = (id: number) => ({ Entidade: "ComprasPlanejamento", Filtro: { Id: id }, Pagina: 1 });

for (const emLista of [false, true]) {
  test(`Centi 217: o cadastro em \`Data${emLista ? "[0]" : ""}\` é APRENDIDO e lido no formato do sistema (centro de custo e seções 8–10)`, async () => {
    const aba = abaCenti({ cliente: false, respostaXhr: CENTI_217(emLista) });
    // A pesquisa da CM002 (a lista) nunca vira modelo.
    aba.telaPost("restauth/searchentity", { Entidade: "ComprasPlanejamento", Pagina: 1 }, DA_TELA);
    await aba.espera();
    assert.equal(aba.local.getItem("__pcaLoadPlanejamento_v1"), null);
    // O duplo clique no planejamento 131: o POST com o Id no corpo.
    aba.telaPost("restauth/searchentity", CORPO_217(131), DA_TELA);
    await aba.espera();
    const modelo = JSON.parse(aba.local.getItem("__pcaLoadPlanejamento_v1") ?? "null");
    assert.equal(modelo.metodo, "POST");
    assert.equal(modelo.caminho, "restauth/searchentity");
    assert.equal(modelo.onde, emLista ? "Data[0]" : "Data");
    assert.equal(modelo.completo, true);
    assert.deepEqual(modelo.corpo.Filtro, { Id: "{id:n}" });

    const r = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=277", entidade: "8", planejamento: "277" });
    assert.equal(r.ok, true);
    assert.equal(r.incompleto, undefined);
    assert.match(r.via, new RegExp(`^como a tela abre \\(módulo 0\\) · cópia (do load )?da tela · em Data${emLista ? "\\[0\\]" : ""}$`));
    assert.equal(aba.pedidos.at(-1)?.headers.company, "08", "o órgão no formato da tela");
    // O SISTEMA lê como lia o load de 17/11: as seções 8–10, o centro de custo, a situação.
    assert.deepEqual(faltasDoLoad(r.j), []);
    assert.deepEqual(assinaturaDoLoad(r.j, "277"), { id: "114" });
    const dados = dadosDoPlanejamento(r.j);
    assert.equal(dados.centroCusto, "PM RV, AGENCIA MUN. DE MEIO AMBIENTE E ORDENAMENTO TERRITORIAL");
    assert.equal(dados.situacao, "Não Executado");
    assert.equal(centroCustoLidoNoLoad(r.j), true);
  });
}

test("Centi 217: o cadastro visto por um pedido SEM o nº do planejamento não vira modelo — o erro diz qual pedido e por quê", async () => {
  const aba = abaCenti({
    cliente: false,
    respostaXhr: (u, h, c) => (/getcurrent/.test(u) ? { Data: cadastro217(131), Count: 1, Success: true } : CENTI_217()(u, h, c)),
  });
  aba.telaPost("restauth/getcurrent", { Entidade: "ComprasPlanejamento" }, DA_TELA);
  await aba.espera();
  assert.equal(aba.local.getItem("__pcaLoadPlanejamento_v1"), null);
  const r = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=277", entidade: "8", planejamento: "277" });
  assert.deepEqual(r.incompleto, ["IdCentroCusto", "IdPlanejamentoAssinaturaDFD"], "só a prévia do 101026 abriu");
  assert.match(r.via, /POST restauth\/getcurrent → 200 \(CADASTRO do planejamento em Data, \d+ campos\)/);
  assert.match(r.via, /o nº do planejamento não está no pedido/);
  assert.ok(!r.via.includes("AGENCIA"), "nunca os dados");
});

test("Centi 217: sem o duplo clique, o diagnóstico diz que nenhum pedido da tela trouxe o cadastro", async () => {
  const aba = abaCenti({ cliente: false, respostaXhr: CENTI_217() });
  aba.telaPost("restauth/searchentity", { Entidade: "ComprasPlanejamento", Pagina: 1 }, DA_TELA);
  await aba.espera();
  const r = await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=277", entidade: "8", planejamento: "277" });
  assert.match(r.via, /POST restauth\/searchentity → 200 \(Data,Count,IdLog,Success,Message,Code\)/);
  assert.match(r.via, /nenhum pedido da tela trouxe o cadastro do planejamento desde o último F5/);
});

test("Centi 217 (cliente fetch): a consulta da CM002 pedida com um REQUEST (o corpo dentro dele) ou um URL é aprendida COM o corpo", async () => {
  const LISTA = { Data: [{ Id: 277, Situacao: "Executado", Finalidade: "Aquisição", CentroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" }], Count: 1, Success: true, Message: null, Code: 0 };
  const corpo = { Filtro: { Referencia: 2027 }, Take: 50, Skip: 0 };
  const aba = abaCenti({ cliente: false, respostaFetch: (url) => (/searchentity/.test(url) ? LISTA : { Entity: null }) });
  // A pessoa clica em Pesquisar; a página manda um Request (método, cabeçalhos e o CORPO dentro dele) — o fetch consome o
  // corpo do original.
  aba.clicar({ texto: "Pesquisar" });
  const r = await aba.telaFetch(new Request(`${aba.ORIGEM}/compras/restauth/searchentity`, { method: "POST", body: JSON.stringify(corpo), headers: { "Content-Type": "application/json", Refreshtoken: "rt-da-tela", Company: "8" } }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), LISTA, "a resposta chega inteira à página");
  for (let i = 0; i < 20 && !aba.local.getItem("__pcaCm002_v1"); i++) await aba.espera();
  const g = JSON.parse(aba.local.getItem("__pcaCm002_v1") ?? "null");
  assert.ok(g, "a consulta da CM002 foi aprendida");
  assert.equal(g.metodo, "POST");
  assert.equal(g.caminho, "restauth/searchentity");
  assert.deepEqual(g.corpo, corpo, "com o corpo (antes: vazio — a consulta não se repetia)");
  assert.ok(!JSON.stringify(g).includes("rt-da-tela"), "nunca os valores dos cabeçalhos");
  // O endereço num URL (sem Request): também aprendido, com o corpo do init.
  const b = abaCenti({ cliente: false, respostaFetch: (url) => (/searchentity/.test(url) ? LISTA : { Entity: null }) });
  b.clicar({ classe: "btn btn-primary", titulo: "Pesquisar" });
  await b.telaFetch(new URL(`${b.ORIGEM}/compras/restauth/searchentity`), { method: "POST", body: JSON.stringify(corpo) });
  for (let i = 0; i < 20 && !b.local.getItem("__pcaCm002_v1"); i++) await b.espera();
  const h = JSON.parse(b.local.getItem("__pcaCm002_v1") ?? "null");
  assert.equal(h?.caminho, "restauth/searchentity");
  assert.deepEqual(h?.corpo, corpo);
});

// A REVISÃO (v1.308.0, extensão 1.47.1): na Centi 217 TODA lista e todo cadastro saem pelo mesmo `searchentity` — o corpo
// diz qual. A consulta da CM002 e o load do planejamento aprendidos NUNCA são trocados por outra lista/outro cadastro.
const PLANEJAMENTOS = (n: number) => ({ Data: Array.from({ length: n }, (_, i) => ({ Id: 1500 + i, Situacao: "Executado", Finalidade: `PCA ${i}`, CentroCusto: "PM RV, GABINETE DO PREFEITO, GGIM" })), Count: n, Success: true });
const REQUISICOES = (n: number) => ({ Data: Array.from({ length: n }, (_, i) => ({ Id: 1500 + i, Situacao: "Atendida", CentroCusto: "PM RV, SECRETARIA DE SAÚDE, ALMOXARIFADO" })), Count: n, Success: true });
const CM = { Entidade: "ComprasPlanejamento", Take: 50, Skip: 0 };
const REQ = { Entidade: "RequisicaoCompra", Take: 50, Skip: 0 };
function abaComListas(automacao = true) {
  const aba = abaCenti({
    cliente: false,
    automacao,
    respostaFetch: (_u, _m, corpo) => {
      const b = corpo ? JSON.parse(corpo) : {};
      return b.Entidade === "RequisicaoCompra" ? REQUISICOES(b.Take === 9 ? 3 : 900) : PLANEJAMENTOS(b.Take === 100000 ? 700 : b.Take === 7 ? 1 : 2);
    },
  });
  const buscar = async (corpo: unknown) => {
    await aba.telaFetch(`${aba.ORIGEM}/compras/restauth/searchentity`, { method: "POST", body: JSON.stringify(corpo) });
    for (let i = 0; i < 10; i++) await aba.espera();
  };
  const guardada = () => JSON.parse(aba.local.getItem("__pcaCm002_v1") ?? "null") as { corpo: { Entidade: string; Take: number }; linhas: number } | null;
  return { aba, buscar, guardada };
}

test("CM002 (Centi 217): a consulta só é aprendida da PESQUISA da pessoa, na aba da automação — outra lista nunca a troca", async () => {
  const { aba, buscar, guardada } = abaComListas();
  // A tela pede uma lista SOZINHA (sem a pessoa pesquisar): nada é aprendido.
  await buscar(CM);
  assert.equal(guardada(), null, "lista que a tela pede sozinha (as de apoio) nunca ensina");
  // A pessoa clica em Pesquisar: aprendida.
  aba.clicar({ texto: "Pesquisar" });
  await buscar(CM);
  assert.equal(guardada()?.corpo.Entidade, "ComprasPlanejamento");
  // Depois, outra lista pelo MESMO endereço, com MAIS linhas, sem a pessoa pesquisar: nunca troca (o cenário reproduzido).
  aba.avancar(10_000);
  await buscar(REQ);
  assert.equal(guardada()?.corpo.Entidade, "ComprasPlanejamento", "a lista de requisições nunca vira a CM002");
  // A MESMA consulta com outra paginação ("Mostrar: Todos"): a de mais linhas, sem precisar pesquisar de novo.
  await buscar({ ...CM, Take: 100000 });
  assert.deepEqual([guardada()?.corpo.Take, guardada()?.linhas], [100000, 700]);
  // A mesma consulta com MENOS linhas (a grade filtrada pelo Id) não troca a de mais.
  await buscar({ ...CM, Take: 7 });
  assert.equal(guardada()?.linhas, 700);
  // Uma consulta NOVA só com a pessoa pesquisando (a lupa).
  aba.avancar(10_000);
  aba.clicar({ classe: "fa fa-search" });
  await buscar(REQ);
  assert.equal(guardada()?.corpo.Entidade, "RequisicaoCompra", "a pesquisa da pessoa reensina (o que ela pediu na aba da automação)");
});

test("CM002 (Centi 217): outra aba da Centi (o trabalho do dia) nunca ensina, mesmo pesquisando", async () => {
  const { aba, buscar, guardada } = abaComListas(false);
  aba.clicar({ texto: "Pesquisar" });
  await buscar(REQ);
  aba.clicar({ texto: "Pesquisar" });
  await buscar(CM);
  assert.equal(guardada(), null);
});

test("CM002: a consulta guardada SEM o corpo (até a 1.46.x — nunca se repetia) é trocada pela pesquisa nova, mesmo com menos linhas", async () => {
  const { aba, buscar, guardada } = abaComListas();
  (aba.local as unknown as { setItem: (k: string, v: string) => void }).setItem("__pcaCm002_v1", JSON.stringify({ metodo: "POST", caminho: "restauth/searchentity", corpo: null, linhas: 3000 }));
  aba.clicar({ texto: "Pesquisar" });
  await buscar(CM);
  assert.deepEqual(guardada()?.corpo, CM);
});

test("fetch(Request, {body: null}): o corpo é o do Request (a regra do Fetch) — a consulta é aprendida com ele", async () => {
  const { aba, guardada } = abaComListas();
  aba.clicar({ texto: "Pesquisar" });
  await aba.telaFetch(new Request(`${aba.ORIGEM}/compras/restauth/searchentity`, { method: "POST", body: JSON.stringify(CM) }), { body: null } as RequestInit);
  for (let i = 0; i < 10; i++) await aba.espera();
  assert.deepEqual(guardada()?.corpo, CM);
});

test("Planejamento (Centi 217): um ITEM do planejamento aberto por Id nunca troca o load completo aprendido", async () => {
  const item = (id: number) => ({ Data: { Id: id, IdComprasPlanejamento: 4321, IdCentroCusto: { Id: 3, Descricao: "PM RV, OUTRA SECRETARIA, OUTRO DEPTO" }, Situacao: "Ativo" }, Count: 1, Success: true });
  const resposta = (u: string, h: Record<string, string>, corpo?: string) => {
    const b = corpo ? JSON.parse(corpo) : {};
    if (/searchentity/.test(u) && b.Entidade === "ComprasPlanejamentoItem") return item(Number(b?.Filtro?.Id));
    return CENTI_217()(u, h, corpo);
  };
  const aba = abaCenti({ cliente: false, respostaXhr: resposta });
  aba.telaPost("restauth/searchentity", CORPO_217(131), DA_TELA);
  await aba.espera();
  const completo = JSON.parse(aba.local.getItem("__pcaLoadPlanejamento_v1") ?? "null");
  assert.equal(completo.completo, true);
  // A tela abre um ITEM por Id (o mesmo endereço, outro corpo, menos campos): o modelo fica o do planejamento.
  aba.telaPost("restauth/searchentity", { Entidade: "ComprasPlanejamentoItem", Filtro: { Id: 5432 }, Pagina: 1 }, DA_TELA);
  await aba.espera();
  assert.deepEqual(JSON.parse(aba.local.getItem("__pcaLoadPlanejamento_v1") ?? "null").corpo, completo.corpo);
  // Outra aba (sem a marca da automação): nunca ensina.
  const outra = abaCenti({ cliente: false, respostaXhr: resposta, automacao: false });
  outra.telaPost("restauth/searchentity", CORPO_217(131), DA_TELA);
  await outra.espera();
  assert.equal(outra.local.getItem("__pcaLoadPlanejamento_v1"), null);
});

test("Sistema: o load que traz OUTRO registro (outro Id, ou um item ligado a outro planejamento) não é o planejamento — não abriu", async () => {
  const { outroRegistroNoLoad } = await import("../src/lib/automacao-centi-core.ts");
  const { carregarPlanejamento } = await import("../src/lib/automacao-dfds-motor.ts");
  const ent = (fields: { Key: string; Value: unknown }[]) => ({ Entity: { Fields: fields } });
  assert.equal(outroRegistroNoLoad(ent([{ Key: "Id", Value: "277" }]), "277"), null);
  assert.equal(outroRegistroNoLoad(ent([{ Key: "Id", Value: "0277" }, { Key: "IdComprasPlanejamento", Value: "277" }]), "277"), null, "o próprio planejamento");
  assert.match(outroRegistroNoLoad(ent([{ Key: "Id", Value: "5432" }]), "277") ?? "", /outro registro \(nº 5432\)/);
  assert.match(outroRegistroNoLoad(ent([{ Key: "Id", Value: "277" }, { Key: "IdComprasPlanejamento", Value: { Fields: [{ Key: "Id", Value: 4321 }] } }]), "277") ?? "", /ligado ao planejamento 4321/);
  assert.equal(outroRegistroNoLoad({ Entity: null }, "277"), null);
  const pedir = async () => ({ ok: true, j: ent([{ Key: "Id", Value: "277" }, { Key: "IdComprasPlanejamento", Value: 4321 }, { Key: "Situacao", Value: "Ativo" }]) });
  const r = await carregarPlanejamento({ pedir: pedir as never }, "277", "8");
  assert.ok("erro" in r);
  assert.match((r as { erro: string }).erro, /^Não consegui abrir o planejamento 277 na Centi — a Centi devolveu um registro ligado ao planejamento 4321/);
  assert.match((r as { erro: string }).erro, /Abra UM planejamento na CM002/);
});
