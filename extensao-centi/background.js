// Serviço da extensão: leva o pedido da aba Automação à aba da Centi que tem a sessão e devolve o resultado.
// Instala-se SOZINHO nas abas já abertas (ao instalar/atualizar e quando uma aba da Centi não responde) — sem F5 e sem
// refazer o login: a sessão da Centi continua a da aba.
const CENTI = "https://rioverde.centi.com.br/*";
const SISTEMA = ["https://governarv.com.br/painel/automacao*", "https://www.governarv.com.br/painel/automacao*"];
const ORIGENS = ["https://governarv.com.br", "https://www.governarv.com.br"];
const CONFIRMAR = chrome.runtime.getURL("confirmar.html");
const OPCOES = chrome.runtime.getURL("opcoes.html");
const INICIO_CENTI = "https://rioverde.centi.com.br/";
// O cofre do login (usuário e senha cifrados SÓ na extensão — cofre.js).
if (typeof importScripts === "function" && !globalThis.CofreCenti) importScripts("cofre.js");

const comPrazo = (p, ms, valor) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(valor), ms))]);

async function injetarCenti(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["centi-anexo.js", "centi-main.js"], world: "MAIN" });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["centi-login.js", "centi-ponte.js"] });
}

async function estadoDaAba(tabId) {
  const perguntar = () => comPrazo(chrome.tabs.sendMessage(tabId, { alvo: "centi", acao: "estado" }), 5000, null);
  try {
    const r = await perguntar();
    if (r) return r;
  } catch {}
  try {
    await injetarCenti(tabId);
    return await perguntar();
  } catch {
    return null;
  }
}

// A Centi faz login POR ABA: usa a aba que já tem a sessão. Sem ela, diz POR QUÊ: sem aba, aba na tela de login ou
// aba sem sessão capturada.
async function abaCenti() {
  const abas = await chrome.tabs.query({ url: CENTI });
  if (!abas.length) return { motivo: "semAba", erro: "Abra a Centi (rioverde.centi.com.br) numa aba e faça o login." };
  const estados = await Promise.all(abas.map((a) => estadoDaAba(a.id)));
  const i = estados.findIndex((r) => r?.logado && r.tela !== "login");
  if (i >= 0) return { aba: abas[i], estado: estados[i] };
  const l = estados.findIndex((r) => r?.tela === "login");
  if (l >= 0) return { motivo: "login", aba: abas[l], erro: "Centi na tela de login." };
  return { motivo: "semSessao", erro: "Centi sem sessão: na aba da Centi já logada, clique em Pesquisar (ou abra qualquer tela)." };
}

// LOGIN AUTOMÁTICO — no máximo UMA tentativa a cada 5 min (para todas as abas); senha recusada ou verificação pedida =
// pausa até as credenciais serem salvas de novo. `forcar` (o "Entrar agora") ignora só o intervalo, nunca a pausa.
let tentando = null;
async function infoLogin() {
  const C = globalThis.CofreCenti;
  if (!C) return { credenciais: false, auto: false, pausado: false, motivo: null, ultima: null };
  const c = await C.lerConfig();
  return { credenciais: c.tem, auto: c.auto, pausado: !!c.pausadoEm, motivo: c.pausadoEm ? c.motivo : null, ultima: c.ultima };
}
function tentarLogin(aba, forcar) {
  if (!tentando)
    tentando = (async () => {
      const C = globalThis.CofreCenti;
      if (!C) return { resultado: "semCofre" };
      const cfg = await C.lerConfig();
      if (!cfg.tem) return { resultado: "semCredenciais" };
      if (!forcar && !cfg.auto) return { resultado: "desligado" };
      const { loginUltima } = await chrome.storage.session.get("loginUltima");
      const p = C.podeTentarLogin(Date.now(), loginUltima ?? null, cfg.pausadoEm ? cfg.motivo || "Login pausado." : null, forcar);
      if (!p.pode) return { resultado: "espera", erro: p.motivo, esperarS: p.esperarS ?? null };
      const cred = await C.credenciais().catch(() => null);
      if (!cred) return { resultado: "semCredenciais" };
      await chrome.storage.session.set({ loginUltima: Date.now() });
      let r = null;
      try {
        r = await comPrazo(chrome.tabs.sendMessage(aba.id, { alvo: "centi-login", usuario: cred.usuario, senha: cred.senha }), 25000, null);
      } catch {
        r = null; // a página recarregou ao entrar: confere-se pelo estado depois
      }
      const resultado = r?.resultado ?? "sem-resposta";
      if (resultado === "recusado") await C.pausar(`Senha recusada pela Centi${r.erro ? ` (${r.erro})` : ""} — confira e salve de novo nas opções da extensão.`);
      if (resultado === "bloqueio") await C.pausar("A Centi pediu uma verificação (captcha, código ou troca de senha) — entre à mão e salve de novo nas opções.");
      await C.registrar(resultado);
      return { resultado, erro: r?.erro ?? null };
    })().finally(() => {
      tentando = null;
    });
  return tentando;
}

// Sem aba da Centi e com o login automático pronto: abre a Centi em segundo plano (uma vez por intervalo).
let abrindo = null;
function abrirCenti() {
  if (!abrindo)
    abrindo = (async () => {
      const i = await infoLogin();
      const { centiAbertaEm } = await chrome.storage.session.get("centiAbertaEm");
      if (!i.credenciais || !i.auto || i.pausado || !globalThis.CofreCenti?.podeTentarLogin(Date.now(), centiAbertaEm ?? null, null, false).pode) return false;
      await chrome.storage.session.set({ centiAbertaEm: Date.now() });
      const aba = await chrome.tabs.create({ url: INICIO_CENTI, active: false });
      await comPrazo(
        new Promise((ok) => {
          const ver = (id, info) => {
            if (id === aba.id && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(ver);
              ok();
            }
          };
          chrome.tabs.onUpdated.addListener(ver);
        }),
        30000,
      );
      await new Promise((ok) => setTimeout(ok, 2000));
      return true;
    })().finally(() => {
      abrindo = null;
    });
  return abrindo;
}

/** A aba com a sessão — entrando sozinho quando dá. `esperar` = espera o login (senão ele corre por trás). */
async function garantirSessao(esperar, forcar) {
  let r = await abaCenti();
  if (r.motivo === "semAba" && (esperar || forcar)) {
    if (await abrirCenti().catch(() => false)) r = await abaCenti();
  } else if (r.motivo === "semAba") abrirCenti().catch(() => {});
  if (r.motivo !== "login") return r;
  const t = tentarLogin(r.aba, forcar).catch(() => ({ resultado: "falha" }));
  if (!esperar && !forcar) return r;
  const res = await t;
  if (res.resultado === "ok" || res.resultado === "sem-resposta") {
    await new Promise((ok) => setTimeout(ok, 1500));
    const de = await abaCenti();
    if (!de.motivo) return de;
  }
  return { ...r, tentativa: res };
}

// ESCRITA: a confirmação na janela DA EXTENSÃO (a página do sistema não a desenha nem a aprova). Uma vez por execução e
// protocolo; recusar, fechar a janela ou não responder em 2 min = não grava.
async function confirmarEscrita(a) {
  const chave = `${a.execucaoId}|${a.id}`;
  const { confirmadas = [] } = await chrome.storage.session.get("confirmadas");
  if (confirmadas.includes(chave)) return true;
  const pedido = crypto.randomUUID();
  const url = `${CONFIRMAR}?${new URLSearchParams({ pedido, execucao: String(a.execucaoId), id: a.id, numero: a.numero, ano: a.ano ?? "", descricao: a.descricao })}`;
  const sim = await new Promise((ok) => {
    let janela = null;
    let feito = false;
    const fim = (v) => {
      if (feito) return;
      feito = true;
      clearTimeout(t);
      chrome.runtime.onMessage.removeListener(ouvir);
      chrome.windows.onRemoved.removeListener(fechou);
      if (janela != null) chrome.windows.remove(janela).catch(() => {});
      ok(v);
    };
    const ouvir = (m, sender) => {
      if (sender.url?.startsWith(CONFIRMAR) && m?.tipo === "confirmacao" && m.pedido === pedido) fim(m.sim === true);
    };
    const fechou = (id) => {
      if (id === janela) {
        janela = null;
        fim(false);
      }
    };
    const t = setTimeout(() => fim(false), 120000);
    chrome.runtime.onMessage.addListener(ouvir);
    chrome.windows.onRemoved.addListener(fechou);
    chrome.windows
      .create({ url, type: "popup", width: 480, height: 460, focused: true })
      .then((w) => {
        janela = w.id;
        if (feito) chrome.windows.remove(w.id).catch(() => {});
      })
      .catch(() => fim(false));
  });
  if (sim) await chrome.storage.session.set({ confirmadas: [...confirmadas, chave].slice(-50) });
  return sim;
}

chrome.runtime.onInstalled.addListener(async () => {
  for (const a of await chrome.tabs.query({ url: CENTI })) injetarCenti(a.id).catch(() => {});
  for (const a of await chrome.tabs.query({ url: SISTEMA }))
    chrome.scripting.executeScript({ target: { tabId: a.id }, files: ["sistema-ponte.js"] }).catch(() => {});
  chrome.alarms?.create("login-centi", { periodInMinutes: 5 });
});

// "Sempre que cair": a aba da Centi que carregou na tela de login (e, a cada 5 min, as que caíram sem recarregar).
async function conferirLogin(tabId) {
  const e = await estadoDaAba(tabId);
  if (e?.tela === "login") await tentarLogin({ id: tabId }, false);
}
chrome.tabs?.onUpdated?.addListener((tabId, info, tab) => {
  if (info.status !== "complete" || !tab?.url?.startsWith(INICIO_CENTI)) return;
  setTimeout(() => conferirLogin(tabId).catch(() => {}), 1500);
});
chrome.alarms?.onAlarm?.addListener(async (a) => {
  if (a.name !== "login-centi") return;
  for (const aba of await chrome.tabs.query({ url: CENTI })) await conferirLogin(aba.id).catch(() => {});
});

const ACOES_CENTI = ["pedir", "protocolo", "anexar", "gravador"];
const resumoLogin = async (r) => ({ ok: false, erro: r.erro, tela: r.motivo === "login" ? "login" : undefined, motivo: r.motivo, login: await infoLogin(), tentativa: r.tentativa ?? null });

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  // A página de opções da extensão: "Testar agora".
  if (sender.id === chrome.runtime.id && sender.url?.startsWith(OPCOES)) {
    if (msg?.tipo !== "entrarAgora") return false;
    garantirSessao(true, true)
      .then((r) => (r.motivo ? { ok: false, erro: r.tentativa?.erro || r.erro } : { ok: true }))
      .catch((e) => ({ ok: false, erro: e?.message || "Falha na extensão." }))
      .then(responder);
    return true;
  }
  const origem = sender.url ? new URL(sender.url).origin : "";
  if (!ORIGENS.includes(origem) || !sender.url.includes("/painel/automacao")) return false;
  (async () => {
    if (msg.acao === "abrirOpcoes") {
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    }
    if (msg.acao === "entrarAgora") {
      const r = await garantirSessao(true, true);
      return r.motivo ? await resumoLogin(r) : { ok: true, logado: true, entidade: r.estado?.entidade ?? null, operacao: r.estado?.operacao ?? null };
    }
    const r = await garantirSessao(false, false);
    if (r.motivo) return await resumoLogin(r);
    const { aba, estado } = r;
    // O estado vai inteiro: a entidade aberta e a OPERAÇÃO Emitir DFD que a extensão pegou da tela da Centi.
    if (msg.acao === "estado") return { ok: true, logado: true, entidade: estado?.entidade ?? null, operacao: estado?.operacao ?? null };
    if (!ACOES_CENTI.includes(msg.acao)) return { ok: false, erro: "Ação desconhecida." };
    if (msg.acao === "anexar") {
      // Só com a autorização já consumida no sistema pela ponte, para ESTE alvo (Id + nº + descrição do pedido).
      const a = msg.autorizado;
      const d = msg.dados ?? {};
      if (!a || String(d.id) !== a.id || String(d.numero) !== a.numero || String(d.descricao ?? "") !== a.descricao)
        return { ok: false, erro: "Escrita sem a autorização do sistema para este protocolo." };
      if (!(await confirmarEscrita(a))) return { ok: false, erro: "Anexo não confirmado na janela da extensão — nada foi gravado." };
    }
    try {
      return await chrome.tabs.sendMessage(aba.id, { alvo: "centi", acao: msg.acao, dados: msg.dados });
    } catch {
      return { ok: false, erro: "A aba da Centi não respondeu — aperte F5 nela." };
    }
  })()
    .catch((e) => ({ ok: false, erro: e?.message || "Falha na extensão." }))
    .then(responder);
  return true;
});
