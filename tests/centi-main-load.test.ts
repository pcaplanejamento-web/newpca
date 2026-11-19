import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// A aba da Centi FALSA: o cliente HTTP da própria Centi (axios em ".../restauth" achado pelo webpack) e o XHR da página.
// Cada pedido do cliente passa pelo XHR (como o axios real), então o `guardar` da extensão o vê.
type Pedido = { via: "centi" | "xhr"; url: string; headers: Record<string, string> };

function abaCenti(opcoes: { chunk?: boolean; cliente?: boolean; respostaCenti?: (url: string, h: Record<string, string>) => unknown; respostaXhr?: (url: string, h: Record<string, string>) => unknown }) {
  const pedidos: Pedido[] = [];
  const ouvintes: ((e: unknown) => void)[] = [];
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
    getResponseHeader() {
      return null;
    }
    getAllResponseHeaders() {
      return "";
    }
    addEventListener(_t: string, f: () => void) {
      this._ouv.push(f);
    }
    send() {
      pedidos.push({ via: "xhr", url: this._url, headers: { ...this._h } });
      const j = opcoes.respostaXhr?.(this._url, this._h) ?? { Entity: null };
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
    fetch: async () => {
      throw new Error("sem fetch");
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
  return { acao, pedidos, pedidoDaTela };
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
