// Auditoria da extensão: as regressões do serviço (background.js), do cartão (centi-painel.js) e da página da Centi
// (centi-main.js + centi-anexo.js).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { COMPRAS, TELA, ate, fonteExtensao, pausa, servicoFalso } from "./fixtures/chrome-falso.ts";

// ------------------------------------------------------------------ O SERVIÇO
/** O sistema falso: a situação (GET) e a ENTREGA (POST entregar) contadas. */
function sistema(o: { pausado?: boolean; auto?: boolean; entrega429?: boolean }) {
  const entregas: unknown[] = [];
  const resp = (status: number, corpo: unknown) => ({ ok: status < 300, status, json: async () => corpo });
  const fetch = async (url: string, init: Record<string, unknown>) => {
    const corpo = init.body ? JSON.parse(String(init.body)) : null;
    if (init.method === "GET" && new URL(url).searchParams.get("situacao") === "1")
      return resp(200, { ok: true, tem: true, auto: o.auto !== false, pausadoEm: o.pausado ? "2026-11-19T10:00:00Z" : null, motivo: o.pausado ? "Senha recusada" : null });
    if (init.method === "POST" && corpo?.acao === "entregar") {
      entregas.push(corpo);
      if (o.entrega429) return resp(429, { ok: false, error: "Muitas tentativas." });
      if (o.pausado) return resp(200, { ok: true, tem: true, pausado: true, motivo: "Senha recusada" });
      return resp(200, { ok: true, tem: true, auto: o.auto !== false });
    }
    return resp(404, { ok: false });
  };
  return { entregas, fetch };
}
function servicoNoLogin(o: Parameters<typeof sistema>[0]) {
  const sis = sistema(o);
  const s = servicoFalso({
    abas: [{ id: 1, url: COMPRAS }],
    sessao: { abaAutomacao: 1 },
    fetch: sis.fetch,
    naAba: (_id, m) => (m.acao === "estado" ? { ok: true, logado: false, tela: "login" } : undefined),
  });
  return { sis, s };
}

test("serviço: login PAUSADO ou com o automático DESLIGADO não pede a entrega (o limite de 30/h do sistema)", async () => {
  for (const o of [{ pausado: true }, { auto: false }]) {
    const { sis, s } = servicoNoLogin(o);
    for (let i = 0; i < 4; i++) {
      await s.pedir({ acao: "estado" }, { url: TELA, tab: { id: 50 } });
      await pausa(15);
    }
    assert.equal(sis.entregas.length, 0, `nenhuma entrega com ${JSON.stringify(o)}`);
  }
});

test("serviço: a entrega que FALHA (429) respeita o intervalo — não pede de novo a cada conferência", async () => {
  const { sis, s } = servicoNoLogin({ entrega429: true });
  await s.pedir({ acao: "estado" }, { url: TELA, tab: { id: 50 } });
  await ate(() => sis.entregas.length >= 1);
  await pausa(15);
  assert.equal(typeof s.sessao.loginUltima, "number", "a falha arma o intervalo");
  await s.pedir({ acao: "estado" }, { url: TELA, tab: { id: 50 } });
  await pausa(15);
  assert.equal(sis.entregas.length, 1);
});

test("serviço: a aba recém-criada (url vazia, pendingUrl no COMPRAS) já está no COMPRAS — não é navegada de novo", () => {
  const linha = /const noCompras = .*;/.exec(fonteExtensao("background.js"))?.[0];
  assert.ok(linha);
  const noCompras = vm.runInNewContext(`const COMPRAS = ${JSON.stringify(COMPRAS)}; ${linha} noCompras`) as (t: unknown) => boolean;
  assert.equal(noCompras({ url: "", pendingUrl: COMPRAS }), true);
  assert.equal(noCompras({ url: `${COMPRAS}#/x`, pendingUrl: undefined }), true);
  assert.equal(noCompras({ url: "https://rioverde.centi.com.br/", pendingUrl: "" }), false);
});

test("cartão da aba: responde à mensagem do serviço (senão o envio rejeita e o painel é injetado de novo)", () => {
  let ouvinte: ((m: unknown, s: unknown, r: (x: unknown) => void) => unknown) | null = null;
  const el = (): Record<string, unknown> =>
    new Proxy(
      {},
      {
        get: (alvo: Record<string, unknown>, k: string) => {
          if (k in alvo) return alvo[k];
          if (k === "classList") return { toggle() {} };
          if (k === "style") {
            alvo.style = {};
            return alvo.style;
          }
          if (k === "attachShadow") return () => ({ set innerHTML(_v: string) {}, querySelector: () => el() });
          if (k === "addEventListener" || k === "appendChild") return () => {};
          return undefined;
        },
        set: (alvo: Record<string, unknown>, k: string, v: unknown) => {
          alvo[k] = v;
          return true;
        },
      },
    );
  const chrome = {
    runtime: {
      id: "ext",
      onMessage: { addListener: (f: typeof ouvinte) => (ouvinte = f) },
      sendMessage: () => Promise.resolve({ atividade: null }),
    },
  };
  const ctx: Record<string, unknown> = { chrome, document: { createElement: el, body: el(), title: "Centi" }, setInterval: () => 0, Date, Math };
  ctx.window = ctx;
  vm.runInNewContext(fonteExtensao("centi-painel.js"), ctx);
  assert.ok(ouvinte);
  let respondeu: unknown = null;
  (ouvinte as NonNullable<typeof ouvinte>)({ alvo: "painel", atividade: null }, { id: "ext" }, (r) => (respondeu = r));
  assert.deepEqual(JSON.parse(JSON.stringify(respondeu)), { ok: true });
});

// ------------------------------------------------------------------ A PÁGINA DA CENTI
const ORIGEM = "https://centi.exemplo.gov.br";
type Pedido = { url: string; headers: Record<string, string>; via: "centi" | "xhr" };
/** A aba da Centi falsa (o cliente axios achado pelo webpack + o XHR da página) — o mínimo do harness de centi-main-load. */
function abaCenti(o: { cliente?: boolean; respostaCenti?: (url: string, h: Record<string, string>, c: unknown) => unknown; respostaXhr?: (url: string, h: Record<string, string>) => unknown }) {
  const pedidos: Pedido[] = [];
  const ouvintes: ((e: unknown) => void)[] = [];
  const respostas: { id: number; resposta: unknown }[] = [];
  const armazem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, String(v)), removeItem: (k: string) => m.delete(k) };
  };
  class XHR {
    status = 0;
    response: unknown = null;
    responseType = "";
    onload: (() => void) | null = null;
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
    send() {
      pedidos.push({ via: "xhr", url: this._url, headers: { ...this._h } });
      const j = o.respostaXhr?.(this._url, this._h) ?? { Entity: null };
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
    Date,
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
    document: { querySelectorAll: () => [], addEventListener: () => {} },
    fetch: async () => {
      throw new Error("sem fetch");
    },
    addEventListener: (t: string, f: (e: unknown) => void) => t === "message" && ouvintes.push(f),
    postMessage: (m: { id: number; resposta: unknown }) => respostas.push(m),
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  if (o.cliente !== false) {
    const daTela = { Refreshtoken: "rt", Company: "02", Month: "11" };
    const axios = Object.assign(async () => ({}), {
      defaults: { baseURL: `${ORIGEM}/compras/restauth` },
      interceptors: {},
      get: async (url: string) => axios.request({ method: "GET", url }),
      post: async (url: string, data: unknown) => axios.request({ method: "POST", url, data }),
      request: async (c: { method: string; url: string; data?: unknown; headers?: Record<string, string> }) => {
        const x = new (ctx.XMLHttpRequest as typeof XHR)();
        x.open(c.method, `${ORIGEM}/compras/restauth${c.url}`);
        const h = { ...daTela, ...(c.headers ?? {}) };
        for (const [k, v] of Object.entries(h)) x.setRequestHeader(k, v);
        x.responseType = "text";
        x.send();
        pedidos[pedidos.length - 1].via = "centi";
        return { status: 200, headers: {}, data: o.respostaCenti?.(c.url, h, c.data) ?? { Entity: null } };
      },
    });
    const modulos = { 1: { exports: { default: axios } } };
    const fila: unknown[] = [];
    fila.push = (item: unknown) => {
      const [, defs, executar] = item as [unknown, Record<string, (m: unknown, e: unknown, r: unknown) => void>, string[][]];
      defs[executar[0][0]]({}, {}, { c: modulos });
      return 1;
    };
    ctx.webpackJsonp = fila;
  }
  vm.createContext(ctx);
  vm.runInContext(readFileSync("extensao-centi/centi-anexo.js", "utf8"), ctx);
  vm.runInContext(readFileSync("extensao-centi/centi-main.js", "utf8"), ctx);
  const janela = vm.runInContext("window", ctx);
  const p = Number(/const PROTOCOLO = (\d+)/.exec(readFileSync("extensao-centi/centi-main.js", "utf8"))?.[1]);
  for (const f of ouvintes) f({ source: janela, data: { fonte: "pca-centi-pedido", p, id: 0, acao: "estado", dados: { automacao: true } } });
  let n = 0;
  const acao = async (nome: string, dados?: unknown) => {
    const id = ++n;
    for (const f of ouvintes) f({ source: janela, data: { fonte: "pca-centi-pedido", p, id, acao: nome, dados } });
    for (let i = 0; i < 100; i++) {
      const r = respostas.find((x) => x.id === id);
      if (r) return JSON.parse(JSON.stringify(r.resposta));
      await new Promise((ok) => setTimeout(ok, 1));
    }
    throw new Error("sem resposta");
  };
  const telaAbre = (url: string, h: Record<string, string>, metodo = "GET") => {
    const x = new (ctx.XMLHttpRequest as typeof XHR)();
    x.open(metodo, `${ORIGEM}/compras/${url}`);
    for (const [k, v] of Object.entries(h)) x.setRequestHeader(k, v);
    x.send();
  };
  const espera = () => new Promise((ok) => setTimeout(ok, 5));
  return { acao, pedidos, telaAbre, espera, local: ctx.localStorage as { getItem: (k: string) => string | null }, sessao: ctx.sessionStorage as { getItem: (k: string) => string | null } };
}
const DA_TELA = { user: "9", token: "tk", refreshtoken: "rt", company: "02", year: "2026", month: "11" };
const planejamento = (id: string, modulo: number, completo: boolean) => ({
  Entity: {
    ModuleKey: modulo,
    Fields: [
      { Key: "Finalidade", Value: "x" },
      { Key: "Situacao", Value: "Ativo" },
      ...(completo
        ? [
            { Key: "IdCentroCusto", Value: { Fields: [{ Key: "Id", Value: 75 }, { Key: "Display", Value: "PM RV, SEC" }] } },
            { Key: "IdPlanejamentoAssinaturaDFD", Value: { Fields: [{ Key: "Id", Value: 114 }] } },
          ]
        : []),
      { Key: "Id", Value: id },
    ],
  },
});

test("Centi: a EMISSÃO pelo cliente da Centi manda o órgão no FORMATO da tela ('3' com '02' = '03'), como o load", async () => {
  const aba = abaCenti({});
  aba.telaAbre("restauth/postdata", { Refreshtoken: "rt", Company: "02", Month: "11" }, "POST");
  await aba.espera();
  await aba.acao("pedir", { metodo: "GET", caminho: "restauth/getbinlink/abc/dfd.pdf", entidade: "3" });
  const ultimo = aba.pedidos.at(-1);
  assert.equal(ultimo?.via, "centi");
  assert.equal(ultimo?.headers.Company, "03");
});

test("Centi: o que a TELA ensina durante um pedido da extensão é aprendido (só o pedido próprio é ignorado)", async () => {
  let aba: ReturnType<typeof abaCenti> | null = null;
  let ensinou = false;
  aba = abaCenti({
    respostaCenti: () => {
      // No meio do pedido da extensão, a pessoa abre um planejamento na CM002.
      if (!ensinou) {
        ensinou = true;
        aba?.telaAbre("restauth/load?entity=999999&key=131", DA_TELA);
      }
      return { Entity: { Fields: [{ Key: "Id", Value: 640 }] } };
    },
    respostaXhr: (u) => (u.includes("entity=999999") ? planejamento("131", 999999, true) : {}),
  });
  aba.telaAbre("restauth/postdata", DA_TELA, "POST");
  await aba.espera();
  await aba.acao("ler", { metodo: "GET", caminho: "restauth/load?entity=101045&key=640", entidade: "6" });
  await aba.espera();
  assert.ok(ensinou);
  const modelo = JSON.parse(aba.local.getItem("__pcaLoadPlanejamento_v1") ?? "null");
  assert.equal(modelo?.modulo, 999999, "o load da tela virou o modelo");
});

test("Centi 217: os módulos FIXOS que voltaram sem o registro são pulados por um tempo (a prévia já em mãos)", async () => {
  const aba = abaCenti({
    cliente: false,
    respostaXhr: (u) => {
      const m = /entity=(\d+)&key=(\d+)/.exec(u);
      if (!m) return {};
      return m[1] === "777777" ? planejamento(m[2], 777777, false) : { Entity: null };
    },
  });
  aba.telaAbre("restauth/load?entity=777777&key=131", DA_TELA);
  await aba.espera();
  const ler = (plan: string) => aba.acao("ler", { metodo: "GET", caminho: `restauth/load?entity=101045&key=${plan}`, entidade: "3", planejamento: plan });
  const r1 = await ler("24");
  assert.deepEqual(r1.incompleto, ["IdCentroCusto", "IdPlanejamentoAssinaturaDFD"]);
  const fixos = (de: number) => aba.pedidos.slice(de).filter((x) => /entity=(101045|101026)/.test(x.url)).length;
  assert.ok(fixos(0) > 0, "1º DFD: os fixos são tentados");
  const antes = aba.pedidos.length;
  const r2 = await ler("25");
  assert.deepEqual(r2.incompleto, ["IdCentroCusto", "IdPlanejamentoAssinaturaDFD"], "a prévia segue sendo devolvida");
  assert.equal(fixos(antes), 0, "2º DFD do mesmo órgão: os fixos vazios não são pedidos de novo");
  assert.match(r2.via, /pulado/);
});

test("Centi: o documento que NÃO persistiu sai da trava 'nunca apagar' (o protocolo não fica travado para sempre)", async () => {
  const doc = (id: number, d: string) => ({ ModuleKey: 102932, Fields: [{ Key: "Id", Value: id }, { Key: "Descricao", Value: d }, { Key: "Sequencial", Value: String(id) }] });
  const docs = [doc(10, "CAPA")];
  const protocolo = () => ({
    Entity: { ModuleKey: 102907, Fields: [{ Key: "Id", Value: "55" }, { Key: "NrProtocolo", Value: "777" }, { Key: "AnoReferencia", Value: "2026" }, { Key: "Documentos", Value: [...docs] }] },
  });
  const aba = abaCenti({
    respostaCenti: (u) => {
      if (/load\?entity=102907&key=55/.test(u)) return protocolo();
      if (/confirmsave/.test(u)) return { Confirm: false, Success: true };
      // A Centi diz que gravou, mas o documento 900 não persiste (o protocolo reaberto não o traz).
      if (/\/save$/.test(u)) return { Success: true, Entity: { Fields: [{ Key: "Documentos", Value: [...docs, doc(900, "DFD 1")] }] } };
      return { Entity: null };
    },
  });
  aba.telaAbre("restauth/postdata", { Refreshtoken: "rt", Company: "02", Month: "11" }, "POST");
  await aba.espera();
  const pedido = { id: 55, numero: 777, ano: 2026, tipo: 1039, descricao: "DFD 1", arquivo: "dfd1.pdf", pdf: "JVBERi0xLjQ=" };
  const r1 = await aba.acao("anexar", pedido);
  assert.equal(r1.ok, false);
  assert.match(r1.erro, /não traz o documento/);
  const r2 = await aba.acao("anexar", pedido);
  assert.doesNotMatch(String(r2.erro), /SEM 1 documento/, "a trava não guarda o documento que não persistiu");
});

test("Centi: o reaberto DESATUALIZADO depois do save não tira da trava os documentos já gravados", async () => {
  const doc = (id: number, d: string) => ({ ModuleKey: 102932, Fields: [{ Key: "Id", Value: id }, { Key: "Descricao", Value: d }, { Key: "Sequencial", Value: String(id) }] });
  let salvou = false;
  const protocolo = () => ({
    Entity: {
      ModuleKey: 102907,
      // Depois do save a Centi devolve o protocolo velho, sem o 11.
      Fields: [{ Key: "Id", Value: "55" }, { Key: "NrProtocolo", Value: "777" }, { Key: "AnoReferencia", Value: "2026" }, { Key: "Documentos", Value: salvou ? [doc(10, "CAPA")] : [doc(10, "CAPA"), doc(11, "OFICIO")] }],
    },
  });
  const aba = abaCenti({
    respostaCenti: (u) => {
      if (/load\?entity=102907&key=55/.test(u)) return protocolo();
      if (/confirmsave/.test(u)) return { Confirm: false, Success: true };
      if (/\/save$/.test(u)) {
        salvou = true;
        return { Success: true, Entity: { Fields: [{ Key: "Documentos", Value: [doc(10, "CAPA"), doc(11, "OFICIO"), doc(900, "DFD 1")] }] } };
      }
      return { Entity: null };
    },
  });
  aba.telaAbre("restauth/postdata", { Refreshtoken: "rt", Company: "02", Month: "11" }, "POST");
  await aba.espera();
  const pedido = { id: 55, numero: 777, ano: 2026, tipo: 1039, descricao: "DFD 1", arquivo: "dfd1.pdf", pdf: "JVBERi0xLjQ=" };
  const r1 = await aba.acao("anexar", pedido);
  assert.match(String(r1.erro), /não traz o documento/);
  const r2 = await aba.acao("anexar", pedido);
  assert.equal(r2.ok, false);
  assert.match(String(r2.erro), /SEM 1 documento/, "o 11 segue na trava");
});
