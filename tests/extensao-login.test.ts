// LOGIN AUTOMÁTICO da extensão (simulado em vm): reconhecer a tela de login da Centi, preencher e entrar, o login vindo
// do SISTEMA (cifrado no banco — a extensão não guarda nada), a régua das tentativas (1 a cada 5 min; senha recusada =
// pausa no sistema) e a transição única do cofre antigo (até a 1.38.0) para o sistema.
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
      if (sel === "iframe") return o.iframe ? [{ src: o.iframe, offsetWidth: 300 }] : [];
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

/** O SISTEMA falso: o login da Centi guardado no banco (a rota `credencial-centi`) e os pedidos que a extensão fez. */
function sistemaFalso(o: { tem?: boolean; auto?: boolean; pausado?: boolean; semSistema?: boolean } = {}) {
  const banco = { tem: o.tem !== false, auto: o.auto !== false, pausado: !!o.pausado, motivo: o.pausado ? "Senha recusada" : (null as string | null), usuario: "maria", senha: "s3gredo" };
  const pedidos: { url: string; metodo: string; corpo: Record<string, unknown> | null }[] = [];
  const resp = (status: number, corpo: unknown) => ({ ok: status < 300, status, json: async () => corpo });
  const fetch = async (url: string, init: Record<string, unknown>) => {
    const corpo = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    pedidos.push({ url, metodo: String(init.method), corpo });
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    if (o.semSistema) return resp(401, { ok: false, error: "Não autenticado" });
    if (init.method === "GET" && url.endsWith("?situacao=1"))
      return resp(200, { ok: true, tem: banco.tem, auto: banco.auto, pausadoEm: banco.pausado ? "2026-11-19T10:00:00Z" : null, motivo: banco.motivo });
    if (init.method === "GET") {
      if (!banco.tem) return resp(200, { ok: true, tem: false });
      if (banco.pausado) return resp(200, { ok: true, tem: true, pausado: true, motivo: banco.motivo });
      return resp(200, { ok: true, tem: true, usuario: banco.usuario, senha: banco.senha, auto: banco.auto });
    }
    if (init.method === "POST" && corpo?.acao === "pausar") {
      banco.pausado = true;
      banco.motivo = String(corpo.motivo);
      return resp(200, { ok: true });
    }
    if (init.method === "POST" && corpo?.acao === "importar") {
      if (banco.tem) return resp(409, { ok: false, error: "Já há um login." });
      Object.assign(banco, { tem: true, usuario: corpo.usuario, senha: corpo.senha, auto: corpo.auto });
      return resp(200, { ok: true });
    }
    return resp(404, { ok: false });
  };
  return { banco, pedidos, fetch };
}

// O serviço com o SISTEMA falso e a ABA DA AUTOMAÇÃO (id 1) na tela de login: quando entra, quantas vezes e quando pausa.
function servico(o: { tem?: boolean; auto?: boolean; semSistema?: boolean; resultado?: string } = {}) {
  const sis = sistemaFalso(o);
  const logins: unknown[] = [];
  const s = servicoFalso({
    abas: [{ id: 1, url: COMPRAS }],
    sessao: { abaAutomacao: 1 },
    fetch: sis.fetch,
    naAba: (_id, m) => {
      if (m.alvo === "centi-login") {
        logins.push(m);
        return { resultado: o.resultado ?? "recusado", erro: "Usuário ou senha inválidos" };
      }
      if (m.acao === "estado") return { ok: true, logado: false, tela: "login" };
      return undefined;
    },
  });
  return { pedir: (msg: unknown, url = TELA) => s.pedir(msg, { url, tab: { id: 50 } }), logins, sis, s };
}

test("serviço: aba na tela de login → lê o login do SISTEMA e entra UMA vez; recusada = pausa NO SISTEMA", async () => {
  const s = servico();
  const r = (await s.pedir({ acao: "estado" })) as { ok: boolean; tela: string; login: { credenciais: boolean } };
  assert.equal(r.ok, false);
  assert.equal(r.tela, "login");
  assert.ok(!JSON.stringify(r).includes("s3gredo"), "a senha nunca vai à tela do sistema");
  await pausa(20);
  assert.equal(s.logins.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s.logins[0])), { alvo: "centi-login", usuario: "maria", senha: "s3gredo" });
  assert.ok(s.sis.pedidos.some((p) => p.url === "https://governarv.com.br/api/admin/automacao/credencial-centi" && p.metodo === "GET"));
  assert.equal(s.sis.banco.pausado, true, "a pausa vale para todos os navegadores");
  assert.match(String(s.sis.banco.motivo), /Senha recusada pela Centi/);
  await s.pedir({ acao: "estado" });
  const e = (await s.pedir({ acao: "entrarAgora" })) as { ok: boolean; erro: string };
  await pausa(20);
  assert.equal(s.logins.length, 1, "pausado: nenhuma nova tentativa, nem forçando");
  assert.match(e.erro, /Senha recusada/);
});

test("serviço: no máximo 1 tentativa a cada 5 min (sem resposta não pausa, mas espera)", async () => {
  const s = servico({ resultado: "sem-resposta" });
  await s.pedir({ acao: "estado" });
  await pausa(20);
  await s.pedir({ acao: "estado" });
  await pausa(20);
  assert.equal(s.logins.length, 1);
  assert.equal(s.sis.banco.pausado, false);
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

test("serviço: sem login no sistema, com o automático desligado ou sem o sistema logado, não tenta — e diz por quê", async () => {
  for (const [o, msg] of [
    [{ tem: false }, /Configure o login da Centi no sistema/],
    [{ auto: false }, null],
    [{ semSistema: true }, /Entre no sistema PCA neste navegador/],
  ] as const) {
    const s = servico(o);
    await s.pedir({ acao: "estado" });
    await pausa(20);
    assert.equal(s.logins.length, 0);
    if (msg) {
      const r = (await s.pedir({ acao: "entrarAgora" })) as { erro: string };
      assert.match(r.erro, msg);
    }
  }
});

test("serviço: páginas de fora não pedem login", async () => {
  const s = servico();
  const r = s.pedir({ acao: "entrarAgora" }, "https://exemplo.com/painel/automacao");
  await pausa(20);
  assert.equal(s.logins.length, 0);
  void r;
});

test("serviço: nada da senha fica no armazenamento da extensão (nem no local nem na sessão)", async () => {
  const s = servico({ resultado: "ok" });
  await s.pedir({ acao: "estado" });
  await pausa(20);
  assert.equal(s.logins.length, 1);
  assert.ok(!JSON.stringify({ l: s.s.local, s: s.s.sessao }).includes("s3gredo"));
});

test("popup: 'Configurar no sistema' abre a tela do login no sistema", async () => {
  const s = servico();
  const r = (await s.s.pedir({ tipo: "configurarLogin" }, { url: "chrome-extension://ext/popup.html" })) as { ok: boolean };
  assert.equal(r.ok, true);
  assert.ok(s.s.abas.some((a) => a.url === "https://governarv.com.br/painel/automacao?ajustes=login"));
  // A tela do sistema não tem as ações antigas do cofre da extensão.
  for (const acao of ["abrirOpcoes", "loginNoSistema", "restaurarLogin"]) assert.equal(((await s.pedir({ acao })) as { ok: boolean }).ok, false);
});

test("extensão: a senha nunca passa pelo mundo da página nem pela ponte do sistema; o cofre local saiu", () => {
  // Sem os comentários e sem o FILTRO de segredos do aprendiz (o padrão que TIRA campos como a senha do que é guardado).
  const semComentarios = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/^\s*const SEGREDO = .*$/gm, "");
  for (const n of ["centi-main.js", "centi-anexo.js", "sistema-ponte.js", "centi-painel.js"]) assert.ok(!/senha/i.test(semComentarios(fonte(n))), n);
  const ponte = fonte("centi-ponte.js");
  assert.ok(!/postMessage\([^)]*senha/i.test(ponte));
  assert.ok(!/sessionStorage/.test(ponte));
  assert.match(ponte, /sender\.id !== chrome\.runtime\.id \|\| sender\.tab/);
  assert.ok(!/importScripts/.test(fonte("background.js")), "sem o cofre.js");
  assert.ok(!/cofre\.js|type="password"/.test(fonte("popup.html")), "o popup não pede senha");
  assert.ok(!/\.senha\b|senha: /.test(semComentarios(fonte("popup.js"))), "o popup não lida com a senha");
});

// A TRANSIÇÃO: o cofre antigo (até a 1.38.0 — chrome.storage.local + a chave no IndexedDB) vai ao sistema UMA vez.
async function cofreAntigo(usuario: string, senha: string) {
  const chave = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(JSON.stringify({ usuario, senha }))));
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  const apagados: string[] = [];
  const idb = {
    open() {
      const req: Record<string, unknown> & { onsuccess?: () => void } = {};
      setTimeout(() => {
        req.result = {
          transaction: () => ({
            objectStore: () => ({
              get() {
                const g: Record<string, unknown> & { onsuccess?: () => void } = {};
                setTimeout(() => {
                  g.result = chave;
                  g.onsuccess?.();
                });
                return g;
              },
            }),
          }),
          close() {},
        };
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase: (n: string) => void apagados.push(n),
  };
  return { local: { credCenti: { iv: b64(iv), dados: b64(dados) }, loginCenti: { auto: false }, credNoSistema: true }, idb, apagados };
}

test("transição: o login do cofre antigo vai ao sistema (só com o banco vazio) e o cofre local é apagado", async () => {
  for (const tem of [false, true]) {
    const c = await cofreAntigo("joao", "antiga");
    const sis = sistemaFalso({ tem });
    const s = servicoFalso({ local: c.local, indexedDB: c.idb, fetch: sis.fetch });
    await s.instalar();
    await pausa(30);
    const importou = sis.pedidos.find((p) => p.corpo?.acao === "importar");
    if (tem) assert.equal(importou, undefined, "o do banco vale mais: não é sobrescrito");
    else assert.deepEqual(importou?.corpo, { acao: "importar", usuario: "joao", senha: "antiga", auto: false });
    assert.deepEqual(s.local, {}, "o cofre local saiu");
    assert.deepEqual(c.apagados, ["pca-cofre"]);
  }
  // Sem o sistema logado agora: o cofre antigo fica para a próxima vez (nada se perde).
  const c = await cofreAntigo("joao", "antiga");
  const s = servicoFalso({ local: c.local, indexedDB: c.idb, fetch: sistemaFalso({ semSistema: true }).fetch });
  await s.instalar();
  await pausa(30);
  assert.ok(s.local.credCenti);
  assert.deepEqual(c.apagados, []);
});

// ---------------------------------------------------------------- A CENTI 4.0 (LAYOUT 4.0) E A "PESQUISA" DEPOIS DE ENTRAR
type El = Record<string, unknown> & { eventos?: string[] };
function campo4(o: { type: string; placeholder?: string; disabled?: boolean; largura?: number }): El {
  const c: El = { tagName: "INPUT", type: o.type, placeholder: o.placeholder, offsetWidth: o.largura ?? 100, disabled: !!o.disabled, eventos: [], _v: "" };
  Object.defineProperty(c, "value", { get: () => c._v, set: (v) => (c._v = v), enumerable: true });
  c.focus = () => {};
  c.getAttribute = () => null;
  c.dispatchEvent = (e: { type: string }) => (c.eventos as string[]).push(e.type);
  return c;
}
/** A tela de login 4.0: uma busca no topo, "Usuário", "Senha" (o olho pode mostrar o texto), ENTRAR (pode vir desabilitado,
 * com ícone) e "Entrar com o Google"; o selo "protected by reCAPTCHA" e um iframe invisível do reCAPTCHA. */
function dom4(o: { olho?: boolean; entrarDesabilitado?: boolean; form?: boolean } = {}) {
  const busca = campo4({ type: "text", placeholder: "Pesquisar" });
  const usuario = campo4({ type: "text", placeholder: "Usuário" });
  const senha = campo4({ type: o.olho ? "text" : "password", placeholder: "Senha" });
  const cliques: string[] = [];
  const envios: string[] = [];
  const botao = (t: string, desab = false) => ({ tagName: "BUTTON", textContent: t, offsetWidth: 80, disabled: desab, click: () => cliques.push(t.trim()), getAttribute: () => null });
  const entrar = botao(" ENTRAR arrow_forward ", !!o.entrarDesabilitado);
  const google = botao("Entrar com o Google");
  if (o.form) senha.form = { requestSubmit: () => envios.push("form") };
  const doc = {
    body: { innerText: "Usuário Senha ESQUECEU SUA SENHA? ENTRAR Entrar com o Google protected by reCAPTCHA Privacy Terms" },
    querySelectorAll(sel: string) {
      if (sel === "input") return [busca, usuario, senha];
      if (sel.startsWith("button")) return [google, entrar];
      if (sel === "iframe") return [{ src: "https://www.google.com/recaptcha/api2/anchor?size=invisible", offsetWidth: 0 }];
      return [];
    },
  };
  return { doc, busca, usuario, senha, entrar, cliques, envios };
}

test("login 4.0: reconhece pela tela nova — usuário pelo nome, ENTRAR com ícone, sem o Google nem a busca", () => {
  const L = pecaLogin() as ReturnType<typeof pecaLogin> & { tocarEntrarDeNovo: (d: unknown) => boolean };
  const d = dom4();
  const t = L.telaDeLogin(d.doc) as { usuario: unknown; senha: unknown; botao: unknown };
  assert.equal(t.usuario, d.usuario, "o campo Usuário, não a busca do topo");
  assert.equal(t.botao, d.entrar, "o ENTRAR, nunca o Entrar com o Google");
  assert.equal(L.sinaisDeBloqueio(d.doc), null, "o reCAPTCHA invisível e o selo dele não são bloqueio");
  assert.equal(L.preencherEEntrar(d.doc, "maria", "s3gredo"), "enviado");
  assert.equal(d.usuario.value, "maria");
  assert.equal(d.busca.value, "", "a busca não recebe o usuário");
  assert.deepEqual(d.cliques, ["ENTRAR arrow_forward"]);
});

test("login 4.0: o olho da senha ligado e o ENTRAR desabilitado também entram", () => {
  const L = pecaLogin() as ReturnType<typeof pecaLogin> & { tocarEntrarDeNovo: (d: unknown) => boolean };
  const olho = dom4({ olho: true });
  assert.ok(L.telaDeLogin(olho.doc), "senha à vista pelo olho = campo de texto com o nome Senha");
  const d = dom4({ entrarDesabilitado: true, form: true });
  assert.ok(L.telaDeLogin(d.doc), "o ENTRAR desabilitado identifica a tela");
  assert.equal(L.preencherEEntrar(d.doc, "maria", "s3gredo"), "enviado");
  assert.deepEqual(d.envios, ["form"], "desabilitado = envia o formulário");
  d.entrar.disabled = false;
  assert.equal(L.tocarEntrarDeNovo(d.doc), true, "habilitou depois: toca de novo");
  assert.deepEqual(d.cliques, ["ENTRAR arrow_forward"]);
});

test("serviço: fora do login e sem a sessão = faz a 'pesquisa' (aquecer) e fica pronto; no máximo 1 vez por minuto", async () => {
  let aquecida = false;
  const s = servicoFalso({
    naAba: (_id, m) => {
      if (m.acao === "aquecer") {
        aquecida = true;
        return { ok: true, logado: true };
      }
      if (m.acao === "estado") return { ok: true, logado: aquecida, ativoEm: aquecida ? Date.now() : 0 };
      return undefined;
    },
  });
  const r = (await s.pedir({ acao: "estado" })) as { ok: boolean };
  assert.equal(r.ok, true, "pronta sem ninguém abrir uma tela na Centi");
  assert.equal(s.enviados.filter((e) => e.m.acao === "aquecer").length, 1);
  await s.pedir({ acao: "estado" });
  assert.equal(s.enviados.filter((e) => e.m.acao === "aquecer").length, 1, "pronta e ativa: não aquece de novo");
});

test("serviço: sem a tela da Centi carregada, recarrega a aba só depois de 3 falhas seguidas (1 vez a cada 2 min)", async () => {
  const s = servicoFalso({
    naAba: (_id, m) => {
      if (m.acao === "aquecer") return { ok: false, semCliente: true };
      if (m.acao === "estado") return { ok: true, logado: false };
      return undefined;
    },
  });
  const r = (await s.pedir({ acao: "estado" })) as { ok: boolean; erro: string };
  assert.equal(r.ok, false);
  assert.match(r.erro, /Preparando a Centi/);
  assert.equal(s.recarregadas.length, 0, "uma falha só não recarrega");
  await s.pedir({ acao: "entrarAgora" });
  await s.pedir({ acao: "entrarAgora" });
  assert.equal(s.recarregadas.length, 1, "a 3ª seguida recarrega");
  for (let i = 0; i < 3; i++) await s.pedir({ acao: "entrarAgora" });
  assert.equal(s.recarregadas.length, 1, "nunca em laço (2 min entre recargas)");
});

test("serviço: manter viva só pela conferência do estado, ociosa — nunca junto de uma ação", async () => {
  const viva = servicoFalso({ naAba: (_id, m) => (m.acao === "estado" ? { ok: true, logado: true, ativoEm: Date.now() - 11 * 60_000 } : undefined) });
  await viva.pedir({ acao: "ler", dados: {} });
  assert.equal(viva.enviados.filter((e) => e.m.acao === "aquecer").length, 0, "a ação não aquece");
  await viva.pedir({ acao: "estado" });
  assert.equal(viva.enviados.filter((e) => e.m.acao === "aquecer").length, 0, "logo depois de uma ação, não aquece");
  const ociosa = servicoFalso({ naAba: (_id, m) => (m.acao === "estado" ? { ok: true, logado: true, ativoEm: Date.now() - 11 * 60_000 } : undefined) });
  await ociosa.pedir({ acao: "estado" });
  assert.equal(ociosa.enviados.filter((e) => e.m.acao === "aquecer").length, 1, "parada há mais de 10 min e ociosa: uma leitura a mantém viva");
  assert.ok(ociosa.alarmes.includes("login-centi"), "o alarme do login existe também sem a instalação");
});
