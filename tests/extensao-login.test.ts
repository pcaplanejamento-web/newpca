// LOGIN AUTOMÁTICO da extensão (simulado em vm): reconhecer a tela de login da Centi, preencher e entrar, a régua das
// tentativas (1 a cada 5 min; senha recusada = pausa) e o cofre (a senha nunca fica em claro nem sai da extensão).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const fonte = (n: string) => readFileSync(new URL(`../extensao-centi/${n}`, import.meta.url), "utf8");

class Campo {
  tagName = "INPUT";
  eventos: string[] = [];
  _v = "";
  offsetWidth = 100;
  disabled = false;
  type: string;
  constructor(type: string) {
    this.type = type;
  }
  get value() {
    return this._v;
  }
  set value(v: string) {
    this._v = v;
  }
  focus() {}
  dispatchEvent(e: { type: string }) {
    this.eventos.push(e.type);
    return true;
  }
}
function dom(o: { senhas?: number; botao?: string; texto?: string; iframe?: string; oculto?: boolean }) {
  const usuario = new Campo("text");
  const senhas = Array.from({ length: o.senhas ?? 1 }, () => new Campo("password"));
  if (o.oculto) for (const s of senhas) s.offsetWidth = 0;
  const cliques: string[] = [];
  const botao = { tagName: "BUTTON", textContent: o.botao ?? " Entrar ", offsetWidth: 80, disabled: false, click: () => cliques.push("entrar"), getAttribute: () => null };
  const body = { innerText: o.texto ?? "Usuário Senha ENTRAR" };
  const doc = {
    body,
    querySelectorAll(sel: string) {
      if (sel === "input[type=password]") return senhas;
      if (sel === "input") return [usuario, ...senhas];
      if (sel.startsWith("button")) return [botao];
      if (sel === "iframe") return o.iframe ? [{ src: o.iframe }] : [];
      return [];
    },
  };
  return { doc, usuario, senhas, cliques, body };
}
function pecaLogin() {
  const ctx: Record<string, unknown> = {
    Event: class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
  };
  vm.runInNewContext(fonte("centi-login.js"), ctx);
  return ctx.__pcaCentiLogin as {
    telaDeLogin: (d: unknown) => unknown;
    sinaisDeBloqueio: (d: unknown) => string | null;
    erroDeLogin: (d: unknown) => string | null;
    preencherEEntrar: (d: unknown, u: string, s: string) => string;
  };
}

test("login: reconhece a tela (senha + usuário + ENTRAR) e só ela", () => {
  const L = pecaLogin();
  assert.ok(L.telaDeLogin(dom({}).doc));
  assert.equal(L.telaDeLogin(dom({ botao: "Pesquisar" }).doc), null);
  assert.equal(L.telaDeLogin(dom({ senhas: 0 }).doc), null);
  assert.equal(L.telaDeLogin(dom({ oculto: true }).doc), null);
});

test("login: preenche pelo setter nativo, avisa o framework e toca em ENTRAR", () => {
  const L = pecaLogin();
  const d = dom({});
  assert.equal(L.preencherEEntrar(d.doc, "maria", "s3gredo"), "enviado");
  assert.equal(d.usuario.value, "maria");
  assert.equal(d.senhas[0].value, "s3gredo");
  assert.deepEqual(d.senhas[0].eventos, ["input", "change"]);
  assert.deepEqual(d.cliques, ["entrar"]);
  assert.match(L.preencherEEntrar(dom({ botao: "Pesquisar" }).doc, "m", "s"), /não está na tela de login/);
  assert.match(L.preencherEEntrar(d.doc, "", "s"), /Sem usuário/);
});

test("login: captcha, código ou troca de senha = bloqueio (não preenche)", () => {
  const L = pecaLogin();
  assert.equal(L.sinaisDeBloqueio(dom({ iframe: "https://www.google.com/recaptcha/api2/anchor" }).doc), "captcha");
  assert.equal(L.sinaisDeBloqueio(dom({ senhas: 2 }).doc), "troca-de-senha");
  assert.equal(L.sinaisDeBloqueio(dom({ texto: "Informe o código de verificação enviado" }).doc), "codigo");
  assert.equal(L.sinaisDeBloqueio(dom({ texto: "Usuário Senha ENTRAR Esqueci minha senha" }).doc), null);
  const d = dom({ iframe: "https://challenges.cloudflare.com/x" });
  assert.equal(L.preencherEEntrar(d.doc, "m", "s"), "bloqueio:captcha");
  assert.equal(d.senhas[0].value, "");
});

test("login: lê a mensagem de senha recusada", () => {
  const L = pecaLogin();
  assert.match(String(L.erroDeLogin(dom({ texto: "ENTRAR\nUsuário ou senha inválidos." }).doc)), /senha inv/i);
  assert.equal(L.erroDeLogin(dom({}).doc), null);
});

function cofre() {
  const ctx: Record<string, unknown> = { crypto, btoa, atob, TextEncoder, TextDecoder, Uint8Array };
  vm.runInNewContext(fonte("cofre.js"), ctx);
  return ctx.CofreCenti as {
    INTERVALO_MS: number;
    podeTentarLogin: (a: number, u: number | null, p: string | null, f?: boolean) => { pode: boolean; esperarS?: number };
    novaChave: () => Promise<CryptoKey>;
    cifrarCom: (k: CryptoKey, t: string) => Promise<{ iv: string; dados: string }>;
    decifrarCom: (k: CryptoKey, c: { iv: string; dados: string }) => Promise<string>;
  };
}

test("cofre: 1 tentativa a cada 5 min; pausa vale sempre (mesmo forçando)", () => {
  const C = cofre();
  const t0 = 1_000_000;
  assert.equal(C.podeTentarLogin(t0, null, null).pode, true);
  const r = C.podeTentarLogin(t0 + 60_000, t0, null);
  assert.equal(r.pode, false);
  assert.equal(r.esperarS, 240);
  assert.equal(C.podeTentarLogin(t0 + C.INTERVALO_MS, t0, null).pode, true);
  assert.equal(C.podeTentarLogin(t0 + 1000, t0, null, true).pode, true);
  assert.equal(C.podeTentarLogin(t0 + C.INTERVALO_MS * 10, t0, "Senha recusada", true).pode, false);
});

test("cofre: a senha cifrada não aparece em claro e só abre com a chave", async () => {
  const C = cofre();
  const k = await C.novaChave();
  const c = await C.cifrarCom(k, JSON.stringify({ usuario: "maria", senha: "s3gredo" }));
  assert.ok(!JSON.stringify(c).includes("s3gredo"));
  assert.equal(JSON.parse(await C.decifrarCom(k, c)).senha, "s3gredo");
  await assert.rejects(C.decifrarCom(await C.novaChave(), c));
});

// O serviço com um cofre falso: quando entra, quantas vezes e quando pausa.
function servico(o: { credenciais?: boolean; auto?: boolean; resultado?: string }) {
  const ouvintes: ((m: unknown, s: { url?: string; id?: string }, r?: (x: unknown) => void) => unknown)[] = [];
  const sessao: Record<string, unknown> = {};
  const logins: unknown[] = [];
  const estadoCfg = { tem: o.credenciais !== false, auto: o.auto !== false, pausadoEm: null as number | null, motivo: null as string | null, ultima: null };
  const ctx: Record<string, unknown> = { URL, URLSearchParams, crypto, setTimeout, clearTimeout, Promise };
  vm.runInNewContext(fonte("cofre.js"), { ...ctx, btoa, atob, TextEncoder, TextDecoder, Uint8Array, globalThis: ctx });
  const real = ctx.CofreCenti as { podeTentarLogin: unknown; INTERVALO_MS: number };
  ctx.CofreCenti = {
    podeTentarLogin: real.podeTentarLogin,
    lerConfig: async () => ({ ...estadoCfg }),
    credenciais: async () => (estadoCfg.tem ? { usuario: "maria", senha: "s3gredo" } : null),
    pausar: async (m: string) => {
      estadoCfg.pausadoEm = Date.now();
      estadoCfg.motivo = m;
    },
    registrar: async () => {},
  };
  ctx.chrome = {
    runtime: {
      id: "ext",
      getURL: (p: string) => `chrome-extension://ext/${p}`,
      onInstalled: { addListener() {} },
      onMessage: { addListener: (f: (typeof ouvintes)[0]) => ouvintes.push(f), removeListener() {} },
      openOptionsPage: async () => {},
    },
    windows: { onRemoved: { addListener() {}, removeListener() {} }, create: async () => ({ id: 1 }), remove: async () => {} },
    storage: { session: { get: async (k: string) => ({ [k]: sessao[k] }), set: async (x: Record<string, unknown>) => Object.assign(sessao, x) } },
    tabs: {
      query: async () => [{ id: 1 }],
      create: async () => ({ id: 2 }),
      sendMessage: async (_id: number, m: { alvo: string; acao?: string; usuario?: string }) => {
        if (m.alvo === "centi-login") {
          logins.push(m);
          return { resultado: o.resultado ?? "recusado", erro: "Usuário ou senha inválidos" };
        }
        if (m.acao === "estado") return { ok: true, logado: false, tela: "login" };
        return { ok: true };
      },
    },
    scripting: { executeScript: async () => [] },
  };
  vm.runInNewContext(fonte("background.js"), ctx);
  const pedir = (msg: unknown, url = "https://governarv.com.br/painel/automacao") =>
    new Promise((ok) => {
      ouvintes[0](msg, { url, id: "ext" }, ok);
    });
  return { pedir, logins, cfg: estadoCfg, ctx };
}
const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

test("serviço: aba na tela de login → avisa a tela e entra sozinho UMA vez; recusada = pausa", async () => {
  const s = servico({});
  const r = (await s.pedir({ acao: "estado" })) as { ok: boolean; tela: string; login: { credenciais: boolean } };
  assert.equal(r.ok, false);
  assert.equal(r.tela, "login");
  assert.ok(!JSON.stringify(r).includes("s3gredo"));
  await pausa(20);
  assert.equal(s.logins.length, 1);
  assert.ok(s.cfg.pausadoEm);
  await s.pedir({ acao: "estado" });
  await s.pedir({ acao: "entrarAgora" });
  await pausa(20);
  assert.equal(s.logins.length, 1);
});

test("serviço: no máximo 1 tentativa a cada 5 min (sem resposta não pausa, mas espera)", async () => {
  const s = servico({ resultado: "sem-resposta" });
  await s.pedir({ acao: "estado" });
  await pausa(20);
  await s.pedir({ acao: "estado" });
  await pausa(20);
  assert.equal(s.logins.length, 1);
  assert.equal(s.cfg.pausadoEm, null);
});

test("serviço: sem credenciais ou com o automático desligado, não tenta", async () => {
  for (const o of [{ credenciais: false }, { auto: false }]) {
    const s = servico(o);
    await s.pedir({ acao: "estado" });
    await pausa(20);
    assert.equal(s.logins.length, 0);
  }
});

test("serviço: páginas de fora não pedem login nem abrem as opções", async () => {
  const s = servico({});
  const r = s.pedir({ acao: "entrarAgora" }, "https://exemplo.com/painel/automacao");
  await pausa(20);
  assert.equal(s.logins.length, 0);
  void r;
});

test("extensão: a senha nunca passa pelo mundo da página nem pela ponte do sistema", () => {
  const semComentarios = (t: string) => t.replace(/^\s*\/\/.*$/gm, "");
  for (const n of ["centi-main.js", "centi-anexo.js", "sistema-ponte.js"]) assert.ok(!/senha/i.test(semComentarios(fonte(n))), n);
  const ponte = fonte("centi-ponte.js");
  assert.ok(!/postMessage\([^)]*senha/i.test(ponte));
  assert.ok(!/sessionStorage/.test(ponte));
  assert.match(ponte, /sender\.id !== chrome\.runtime\.id \|\| sender\.tab/);
});
