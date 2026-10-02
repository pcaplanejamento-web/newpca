// LOGIN AUTOMÁTICO da extensão (simulado em vm): reconhecer a tela de login da Centi, preencher e entrar, a régua das
// tentativas (1 a cada 5 min; senha recusada = pausa) e o cofre (a senha nunca fica em claro nem sai da extensão).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { COMPRAS, pausa, servicoFalso, TELA } from "./fixtures/chrome-falso.ts";

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

// O serviço com um cofre falso e a ABA DA AUTOMAÇÃO (id 1) na tela de login: quando entra, quantas vezes e quando pausa.
function servico(o: { credenciais?: boolean; auto?: boolean; resultado?: string }) {
  const C = cofre();
  const estadoCfg = { tem: o.credenciais !== false, auto: o.auto !== false, pausadoEm: null as number | null, motivo: null as string | null, ultima: null };
  const logins: unknown[] = [];
  const s = servicoFalso({
    abas: [{ id: 1, url: COMPRAS }],
    sessao: { abaAutomacao: 1 },
    cofre: {
      podeTentarLogin: C.podeTentarLogin,
      lerConfig: async () => ({ ...estadoCfg }),
      credenciais: async () => (estadoCfg.tem ? { usuario: "maria", senha: "s3gredo" } : null),
      pausar: async (m: string) => {
        estadoCfg.pausadoEm = Date.now();
        estadoCfg.motivo = m;
      },
      registrar: async () => {},
    },
    naAba: (_id, m) => {
      if (m.alvo === "centi-login") {
        logins.push(m);
        return { resultado: o.resultado ?? "recusado", erro: "Usuário ou senha inválidos" };
      }
      if (m.acao === "estado") return { ok: true, logado: false, tela: "login" };
      return undefined;
    },
  });
  return { pedir: (msg: unknown, url = TELA) => s.pedir(msg, { url, tab: { id: 50 } }), logins, cfg: estadoCfg, s };
}

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

test("serviço: sem credenciais, abre o login no DROPDOWN do ícone UMA vez (não em laço)", async () => {
  const s = servico({ credenciais: false });
  await s.pedir({ acao: "estado" });
  await pausa(20);
  await s.pedir({ acao: "estado" });
  await pausa(20);
  assert.equal(s.s.janelas.filter((u) => u === "dropdown").length, 1);
  // Pedido pelo usuário ("Configurar login") abre o dropdown de novo.
  const r = (await s.pedir({ acao: "abrirOpcoes" })) as { ok: boolean };
  assert.equal(r.ok, true);
  assert.equal(s.s.janelas.filter((u) => u === "dropdown").length, 2);
});

test("serviço: login com sucesso zera a espera (uma queda logo depois entra de novo)", async () => {
  const s = servico({ resultado: "ok" });
  await s.pedir({ acao: "estado" });
  await pausa(20);
  assert.equal(s.s.sessao.loginUltima, undefined);
  await s.pedir({ acao: "estado" });
  await pausa(20);
  assert.equal(s.logins.length, 2);
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
  for (const n of ["centi-main.js", "centi-anexo.js", "sistema-ponte.js", "centi-painel.js"]) assert.ok(!/senha/i.test(semComentarios(fonte(n))), n);
  const ponte = fonte("centi-ponte.js");
  assert.ok(!/postMessage\([^)]*senha/i.test(ponte));
  assert.ok(!/sessionStorage/.test(ponte));
  assert.match(ponte, /sender\.id !== chrome\.runtime\.id \|\| sender\.tab/);
});
