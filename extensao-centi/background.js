// Serviço da extensão: leva o pedido da aba Automação à ABA PRÓPRIA da automação na Centi (aberta e guardada pela
// extensão, no grupo "Automação PCA") e devolve o resultado. As abas da Centi do usuário não são usadas.
// Também: o login automático (senha só no cofre da extensão), o andamento do lote (selo no ícone, cartão na aba da
// automação e o popup) e o INTERROMPER pela extensão.
const CENTI = "https://rioverde.centi.com.br/*";
const INICIO_CENTI = "https://rioverde.centi.com.br/";
// O sistema COMPRAS da Centi (a raiz é só o portal "Acesso aos sistemas", sem login): a aba da automação trabalha nele.
const COMPRAS = "https://rioverde.centi.com.br/compras/";
const SISTEMA = ["https://governarv.com.br/painel/automacao*", "https://www.governarv.com.br/painel/automacao*"];
const ORIGENS = ["https://governarv.com.br", "https://www.governarv.com.br"];
const CONFIRMAR = chrome.runtime.getURL("confirmar.html");
const POPUP = chrome.runtime.getURL("popup.html");
const TITULO_GRUPO = "Automação PCA";
const ACOES_CENTI = ["pedir", "protocolo", "anexar", "gravador", "aprender", "ler", "cm002", "telaApi", "reparticoesApi", "trocarOrgao"];
// O cofre do login (usuário e senha cifrados SÓ na extensão — cofre.js).
if (typeof importScripts === "function" && !globalThis.CofreCenti) importScripts("cofre.js");

const comPrazo = (p, ms, valor) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(valor), ms))]);
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const sessao = {
  ler: async (k) => (await chrome.storage.session.get(k))[k],
  gravar: (k, v) => chrome.storage.session.set({ [k]: v }),
  tirar: (k) => chrome.storage.session.remove(k),
};
const texto = (v, max) => String(v ?? "").slice(0, max);
const numero = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);

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

// ---------------------------------------------------------------- A ABA PRÓPRIA DA AUTOMAÇÃO
const grupoDaAutomacao = (titulo) => typeof titulo === "string" && titulo.startsWith(TITULO_GRUPO);
const daCenti = (t) => !!(t?.url?.startsWith(INICIO_CENTI) || t?.pendingUrl?.startsWith(INICIO_CENTI));
const noCompras = (t) => !!(t?.url ?? t?.pendingUrl ?? "").startsWith(COMPRAS);

/** A aba da automação: a guardada nesta sessão do navegador; depois de reabrir o Chrome, a do grupo "Automação PCA". */
async function abaGuardada() {
  const id = await sessao.ler("abaAutomacao");
  if (typeof id === "number") {
    try {
      const t = await chrome.tabs.get(id);
      if (daCenti(t)) return t;
    } catch {}
  }
  if (chrome.tabGroups?.query) {
    // O título do grupo leva o andamento ("Automação PCA · 3/15") — acha pelo começo.
    const grupos = (await chrome.tabGroups.query({}).catch(() => [])).filter((g) => grupoDaAutomacao(g.title));
    for (const g of grupos) {
      const abas = await chrome.tabs.query({ groupId: g.id, url: CENTI }).catch(() => []);
      if (abas.length) {
        await sessao.gravar("abaAutomacao", abas[0].id);
        return abas[0];
      }
    }
  }
  return null;
}

function esperarCarregar(tabId, ms) {
  return comPrazo(
    new Promise((ok) => {
      const ver = (id, info) => {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(ver);
          ok(true);
        }
      };
      chrome.tabs.onUpdated.addListener(ver);
    }),
    ms,
    false,
  );
}

let criando = null;
/** Abre a aba da automação (em segundo plano, no grupo azul "Automação PCA") — uma só, mesmo com pedidos juntos. */
function criarAba() {
  if (!criando)
    criando = (async () => {
      const aba = await chrome.tabs.create({ url: COMPRAS, active: false });
      await sessao.gravar("abaAutomacao", aba.id);
      await sessao.tirar("abaFechada");
      try {
        const g = await chrome.tabs.group({ tabIds: [aba.id] });
        await chrome.tabGroups.update(g, { title: TITULO_GRUPO, color: "blue" });
      } catch {}
      await esperarCarregar(aba.id, 30000);
      await esperar(1500);
      return aba;
    })().finally(() => {
      criando = null;
    });
  return criando;
}

// ---------------------------------------------------------------- LOGIN AUTOMÁTICO
// No máximo UMA tentativa a cada 5 min DEPOIS DE UMA FALHA (entrar com sucesso zera a espera); senha recusada ou
// verificação pedida = pausa até as credenciais serem salvas de novo. `forcar` ignora só o intervalo, nunca a pausa.
let tentando = null;
async function infoLogin() {
  const C = globalThis.CofreCenti;
  if (!C) return { credenciais: false, auto: false, pausado: false, motivo: null, ultima: null };
  const c = await C.lerConfig();
  return { credenciais: c.tem, auto: c.auto, pausado: !!c.pausadoEm, motivo: c.pausadoEm ? c.motivo : null, ultima: c.ultima };
}

let indoCompras = null;
/** A aba no portal (raiz) ou em outro sistema da Centi vai ao COMPRAS — onde aparece o login e a sessão da automação. */
function irParaCompras(aba) {
  if (!indoCompras)
    indoCompras = (async () => {
      await chrome.tabs.update(aba.id, { url: COMPRAS });
      await esperarCarregar(aba.id, 30000);
      await esperar(1500);
      return { ...aba, url: COMPRAS };
    })().finally(() => {
      indoCompras = null;
    });
  return indoCompras;
}

/**
 * O login da Centi no DROPDOWN do ícone da extensão (o popup). Sozinho, abre UMA vez por sessão do navegador; sem como
 * abrir o dropdown (nenhuma janela em foco), uma janelinha com o mesmo popup.
 */
async function abrirCredenciais(pedidoDoUsuario) {
  if (!pedidoDoUsuario && (await sessao.ler("credenciaisPedidas"))) return false;
  await sessao.gravar("credenciaisPedidas", true);
  try {
    await chrome.action.openPopup();
    return true;
  } catch {}
  const janela = await sessao.ler("janelaCredenciais");
  if (typeof janela === "number") {
    try {
      await chrome.windows.update(janela, { focused: true });
      return true;
    } catch {}
  }
  try {
    const w = await chrome.windows.create({ url: `${POPUP}?janela=1`, type: "popup", width: 380, height: 600, focused: true });
    await sessao.gravar("janelaCredenciais", w.id);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- O LOGIN GUARDADO NO SISTEMA (opcional)
// A pessoa pode guardar o login TAMBÉM no sistema PCA (cifrado lá com a chave mestra do servidor): reinstalada a extensão
// (o cofre local some junto), ela o traz de volta sozinha. Só o serviço da extensão fala com essa rota — o navegador manda
// o Origin da extensão, que nenhuma página consegue imitar; a sessão do sistema vai pelo cookie.
const API_LOGIN = `${ORIGENS[0]}/api/admin/automacao/credencial-centi`;
async function apiLogin(metodo, corpo) {
  try {
    const r = await fetch(API_LOGIN, {
      method: metodo,
      credentials: "include",
      cache: "no-store",
      headers: corpo ? { "content-type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok) return j;
    if (r.status === 401) return { ok: false, erro: "Entre no sistema PCA neste navegador (como administrador)." };
    return { ok: false, erro: j?.error ?? `O sistema respondeu ${r.status}.` };
  } catch {
    return { ok: false, erro: "Sem conexão com o sistema PCA." };
  }
}
/** Guarda (ou tira) o login do cofre no sistema. */
async function loginNoSistema(guardar) {
  const C = globalThis.CofreCenti;
  if (!guardar) {
    const r = await apiLogin("DELETE");
    if (r.ok) await chrome.storage.local.remove("credNoSistema");
    return r.ok ? { ok: true } : r;
  }
  const cred = await C?.credenciais().catch(() => null);
  if (!cred) return { ok: false, erro: "Salve o login primeiro." };
  const r = await apiLogin("PUT", { usuario: cred.usuario, senha: cred.senha, auto: (await C.lerConfig()).auto });
  if (r.ok) await chrome.storage.local.set({ credNoSistema: true });
  return r.ok ? { ok: true } : r;
}
/** Sem login no cofre (a extensão foi reinstalada): traz o guardado no sistema — por conta própria, 1 vez a cada 10 min. */
async function restaurarDoSistema(pedido = false) {
  const C = globalThis.CofreCenti;
  if (!C || (await C.lerConfig()).tem) return false;
  const ultima = await sessao.ler("restauroEm");
  if (!pedido && typeof ultima === "number" && Date.now() - ultima < 10 * 60 * 1000) return false;
  await sessao.gravar("restauroEm", Date.now());
  const r = await apiLogin("GET");
  if (!r.ok || r.tem !== true || typeof r.usuario !== "string" || typeof r.senha !== "string" || !r.usuario || !r.senha) return false;
  await C.salvar(r.usuario, r.senha, r.auto !== false);
  await chrome.storage.local.set({ credNoSistema: true });
  return true;
}

function tentarLogin(aba, forcar) {
  if (!tentando)
    tentando = (async () => {
      const C = globalThis.CofreCenti;
      if (!C) return { resultado: "semCofre" };
      let cfg = await C.lerConfig();
      if (!cfg.tem && (await restaurarDoSistema().catch(() => false))) cfg = await C.lerConfig();
      if (!cfg.tem) {
        await abrirCredenciais(false);
        return { resultado: "semCredenciais" };
      }
      if (!forcar && !cfg.auto) return { resultado: "desligado" };
      const loginUltima = await sessao.ler("loginUltima");
      const p = C.podeTentarLogin(Date.now(), loginUltima ?? null, cfg.pausadoEm ? cfg.motivo || "Login pausado." : null, forcar);
      if (!p.pode) return { resultado: "espera", erro: p.motivo, esperarS: p.esperarS ?? null };
      const cred = await C.credenciais().catch(() => null);
      if (!cred) return { resultado: "semCredenciais" };
      await sessao.gravar("loginUltima", Date.now());
      let r = null;
      try {
        r = await comPrazo(chrome.tabs.sendMessage(aba.id, { alvo: "centi-login", usuario: cred.usuario, senha: cred.senha }), 25000, null);
      } catch {
        r = null; // a página recarregou ao entrar: confere-se pelo estado depois
      }
      const resultado = r?.resultado ?? "sem-resposta";
      if (resultado === "ok") await sessao.tirar("loginUltima");
      if (resultado === "recusado") {
        await C.pausar(`Senha recusada pela Centi${r.erro ? ` (${r.erro})` : ""} — confira e salve de novo.`);
        await sessao.tirar("credenciaisPedidas");
        await abrirCredenciais(false);
      }
      if (resultado === "bloqueio") await C.pausar("A Centi pediu uma verificação (captcha, código ou troca de senha) — entre à mão na aba da automação e salve de novo.");
      await C.registrar(resultado);
      return { resultado, erro: r?.erro ?? null };
    })().finally(() => {
      tentando = null;
    });
  return tentando;
}

/**
 * A aba da automação com a sessão. `criar` = abre a aba se não houver (sem ela, só quando o usuário não a fechou);
 * `esperar` = espera o login (senão ele corre por trás); `forcar` = "Entrar agora".
 */
async function garantirSessao({ criar = true, esperarLogin = false, forcar = false } = {}) {
  let aba = await abaGuardada();
  if (!aba) {
    if (!criar && (await sessao.ler("abaFechada")))
      return { motivo: "semAba", erro: "A aba da automação foi fechada — toque em Verificar para abrir de novo." };
    aba = await criarAba();
  }
  if (!noCompras(aba)) aba = await irParaCompras(aba);
  const e = await estadoDaAba(aba.id);
  if (e?.logado && e.tela !== "login") return { aba, estado: e };
  if (e?.tela !== "login")
    return { motivo: "semSessao", aba, erro: "Centi abrindo na aba da automação — aguarde ou abra qualquer tela nela." };
  const t = tentarLogin(aba, forcar).catch(() => ({ resultado: "falha" }));
  if (!esperarLogin && !forcar) return { motivo: "login", aba, erro: "Centi na tela de login." };
  const res = await t;
  if (res.resultado === "ok" || res.resultado === "sem-resposta") {
    await esperar(1500);
    const de = await estadoDaAba(aba.id);
    if (de?.logado && de.tela !== "login") return { aba, estado: de };
  }
  return { motivo: "login", aba, erro: "Centi na tela de login.", tentativa: res };
}

// ---------------------------------------------------------------- O ANDAMENTO (lote) E O INTERROMPER
const COR_SELO = { rodando: "#2563eb", interrompido: "#dc2626", concluido: "#16a34a", parado: "#d97706" };
function textoSelo(a) {
  if (!a) return "";
  if (a.estado === "rodando") return a.total ? `${Math.min(a.feito, a.total)}/${a.total}` : "...";
  if (a.estado === "interrompido") return "X";
  if (a.estado === "concluido") return "OK";
  if (a.estado === "parado") return "!";
  return "";
}

// O GRUPO de abas também sinaliza: o título leva o andamento e a cor o estado (azul rodando, verde concluído…).
const COR_GRUPO = { rodando: "blue", interrompido: "red", concluido: "green", parado: "orange" };
function grupoDaAtividade(a) {
  const selo = textoSelo(a);
  return { title: selo ? `${TITULO_GRUPO} · ${selo}` : TITULO_GRUPO, color: COR_GRUPO[a?.estado] ?? "blue" };
}

async function mostrarAtividade(a) {
  try {
    await chrome.action?.setBadgeText({ text: textoSelo(a) });
    if (a && COR_SELO[a.estado]) await chrome.action?.setBadgeBackgroundColor({ color: COR_SELO[a.estado] });
  } catch {}
  const aba = await abaGuardada().catch(() => null);
  if (!aba) return;
  if (typeof aba.groupId === "number" && aba.groupId >= 0)
    await chrome.tabGroups?.update(aba.groupId, grupoDaAtividade(a)).catch(() => {});
  await avisarPainel(aba.id, a);
}

async function avisarPainel(tabId, a) {
  const enviar = () => chrome.tabs.sendMessage(tabId, { alvo: "painel", atividade: a ?? null });
  try {
    await enviar();
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["centi-painel.js"] });
      await enviar();
    } catch {}
  }
}

const lerAtividade = async () => (await sessao.ler("atividade")) ?? null;
async function gravarAtividade(a) {
  await sessao.gravar("atividade", a);
  await mostrarAtividade(a);
}

/** O andamento que a tela do sistema informa: início (zera a interrupção), cada passo e o fim. */
async function lote(dados, dono) {
  const agora = Date.now();
  if (dados?.fase === "inicio") {
    const a = {
      id: crypto.randomUUID(),
      titulo: texto(dados.titulo, 120) || "Automação",
      total: numero(dados.total),
      feito: 0,
      passo: "Começando…",
      passos: [],
      estado: "rodando",
      dono,
      inicio: agora,
      atualizado: agora,
    };
    await gravarAtividade(a);
    return { ok: true, loteId: a.id };
  }
  const a = await lerAtividade();
  if (!a || a.id !== dados?.loteId) return { ok: false, erro: "Lote desconhecido." };
  if (dados.fase === "passo" && a.estado === "rodando") {
    a.feito = numero(dados.feito);
    if (dados.total != null) a.total = numero(dados.total);
    a.passo = texto(dados.texto, 200);
    a.passos = [{ quando: agora, texto: a.passo, estado: texto(dados.estado, 20) || null }, ...a.passos].slice(0, 20);
  }
  if (dados.fase === "fim") {
    if (a.estado === "rodando") a.estado = "concluido";
    if (dados.resumo) a.passo = texto(dados.resumo, 200);
  }
  a.atualizado = agora;
  await gravarAtividade(a);
  return { ok: true, interrompido: a.estado === "interrompido" };
}

let cancelarConfirmacao = null;
/** INTERROMPER (popup ou cartão na aba da automação): o lote para — nada novo começa; a confirmação pendente vale "não". */
async function interromper() {
  const a = await lerAtividade();
  cancelarConfirmacao?.();
  if (a && a.estado === "rodando") {
    a.estado = "interrompido";
    a.passo = "Interrompido na extensão.";
    a.atualizado = Date.now();
    await gravarAtividade(a);
  }
  for (const t of await chrome.tabs.query({ url: SISTEMA }).catch(() => []))
    chrome.tabs.sendMessage(t.id, { alvo: "sistema", tipo: "interrompido", loteId: a?.id ?? null }).catch(() => {});
  return { ok: true };
}

/** A tela que dirigia o lote recarregou ou fechou: o lote parou (a extensão não segue sozinha). */
async function donoSaiu(tabId) {
  const a = await lerAtividade();
  if (a?.estado !== "rodando" || a.dono !== tabId) return;
  a.estado = "parado";
  a.passo = "Parou: a tela do sistema foi recarregada ou fechada.";
  a.atualizado = Date.now();
  await gravarAtividade(a);
}

// ---------------------------------------------------------------- A CONFIRMAÇÃO DA ESCRITA
// A confirmação na janela DA EXTENSÃO (a página do sistema não a desenha nem a aprova). Uma vez por execução e
// protocolo; recusar, fechar a janela, interromper ou não responder em 2 min = não grava.
async function confirmarEscrita(a) {
  const chave = `${a.execucaoId}|${a.id}`;
  const confirmadas = (await sessao.ler("confirmadas")) ?? [];
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
      cancelarConfirmacao = null;
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
    cancelarConfirmacao = () => fim(false);
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
  if (sim) await sessao.gravar("confirmadas", [...confirmadas, chave].slice(-50));
  return sim;
}

// ---------------------------------------------------------------- EVENTOS DO NAVEGADOR
chrome.runtime.onInstalled.addListener(async () => {
  const aba = await abaGuardada().catch(() => null);
  if (aba) injetarCenti(aba.id).catch(() => {});
  for (const a of await chrome.tabs.query({ url: SISTEMA }))
    chrome.scripting.executeScript({ target: { tabId: a.id }, files: ["sistema-ponte.js"] }).catch(() => {});
  chrome.alarms?.create("login-centi", { periodInMinutes: 5 });
  restaurarDoSistema().catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => restaurarDoSistema().catch(() => {}));

// "Sempre que cair": a aba da automação que carregou (F5) na tela de login entra sozinha; o cartão volta à aba.
async function conferirAba(tabId) {
  const aba = await abaGuardada();
  if (aba?.id !== tabId) return;
  const e = await estadoDaAba(tabId);
  await avisarPainel(tabId, await lerAtividade());
  if (e?.tela === "login") await tentarLogin({ id: tabId }, false);
}
chrome.tabs?.onUpdated?.addListener((tabId, info, tab) => {
  // Só uma NAVEGAÇÃO de verdade para fora da Automação para o lote (o "loading" sem url muda de status sem sair da tela —
  // marcava o lote como parado no meio de um fluxo). O F5 / fechar a página avisa pela ponte ("saiu", pagehide).
  if (info.url && !info.url.includes("/painel/automacao")) donoSaiu(tabId).catch(() => {});
  if (info.status !== "complete" || !tab?.url?.startsWith(INICIO_CENTI)) return;
  setTimeout(() => conferirAba(tabId).catch(() => {}), 1500);
});
chrome.tabs?.onRemoved?.addListener(async (tabId) => {
  donoSaiu(tabId).catch(() => {});
  if ((await sessao.ler("abaAutomacao")) === tabId) {
    await sessao.tirar("abaAutomacao");
    await sessao.gravar("abaFechada", true);
  }
});
chrome.windows?.onRemoved?.addListener(async (id) => {
  if ((await sessao.ler("janelaCredenciais")) === id) await sessao.tirar("janelaCredenciais");
});
chrome.alarms?.onAlarm?.addListener(async (a) => {
  if (a.name !== "login-centi") return;
  const aba = await abaGuardada().catch(() => null);
  if (aba) await conferirAba(aba.id).catch(() => {});
});

const resumoLogin = async (r) => ({
  ok: false,
  erro: r.tentativa?.erro && r.tentativa.resultado === "recusado" ? r.tentativa.erro : r.erro,
  tela: r.motivo === "login" ? "login" : undefined,
  motivo: r.motivo,
  login: await infoLogin(),
  tentativa: r.tentativa ?? null,
  atividade: await lerAtividade(),
});
const respostaLogada = async (r) => ({
  ok: true,
  logado: true,
  entidade: r.estado?.entidade ?? null,
  operacao: r.estado?.operacao ?? null,
  atividade: await lerAtividade(),
});

/** O popup (dropdown do ícone da extensão, ou a janelinha dele). */
async function daExtensao(msg) {
  if (msg.tipo === "interromper") return interromper();
  if (msg.tipo === "credenciais") return { ok: await abrirCredenciais(true) };
  if (msg.tipo === "loginNoSistema") return loginNoSistema(msg.guardar === true);
  if (msg.tipo === "restaurarLogin") return { ok: await restaurarDoSistema(true).catch(() => false) };
  if (msg.tipo === "entrarAgora") {
    const r = await garantirSessao({ criar: true, esperarLogin: true, forcar: true });
    return r.motivo ? { ok: false, erro: r.tentativa?.erro || r.erro } : { ok: true };
  }
  if (msg.tipo === "irParaAba") {
    const aba = (await abaGuardada()) ?? (await criarAba());
    await chrome.tabs.update(aba.id, { active: true });
    if (aba.windowId != null) await chrome.windows.update(aba.windowId, { focused: true }).catch(() => {});
    return { ok: true };
  }
  if (msg.tipo === "estado") {
    const aba = await abaGuardada();
    const e = aba ? await estadoDaAba(aba.id) : null;
    const centi = !aba ? "semAba" : e?.tela === "login" ? "login" : e?.logado ? "logada" : "semSessao";
    return { ok: true, centi, entidade: e?.entidade ?? null, login: await infoLogin(), atividade: await lerAtividade() };
  }
  return { ok: false, erro: "Pedido desconhecido." };
}

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  const url = sender.url ?? "";
  // Páginas da extensão: o popup (dropdown do ícone — andamento, Interromper e o login; a confirmação tem o ouvinte próprio).
  if (sender.id === chrome.runtime.id && url.startsWith(POPUP)) {
    if (typeof msg?.tipo !== "string") return false;
    daExtensao(msg)
      .catch((e) => ({ ok: false, erro: e?.message || "Falha na extensão." }))
      .then(responder);
    return true;
  }
  // O cartão na ABA DA AUTOMAÇÃO: só interromper e pedir o andamento — e só dessa aba.
  if (sender.tab && url.startsWith(INICIO_CENTI) && (msg?.tipo === "interromper" || msg?.tipo === "atividade")) {
    (async () => {
      const aba = await abaGuardada();
      if (aba?.id !== sender.tab.id) return { ok: false, erro: "Só a aba da automação." };
      return msg.tipo === "interromper" ? interromper() : { ok: true, atividade: await lerAtividade() };
    })()
      .catch(() => ({ ok: false }))
      .then(responder);
    return true;
  }
  // A tela Automação do sistema.
  if (!ORIGENS.some((o) => url.startsWith(`${o}/`)) || !url.includes("/painel/automacao")) return false;
  (async () => {
    if (msg.acao === "abrirOpcoes") return { ok: await abrirCredenciais(true) };
    if (msg.acao === "lote") return lote(msg.dados, sender.tab?.id ?? null);
    if (msg.acao === "saiu") {
      if (sender.tab?.id != null) await donoSaiu(sender.tab.id);
      return { ok: true };
    }
    if (msg.acao === "entrarAgora") {
      const r = await garantirSessao({ criar: true, esperarLogin: true, forcar: true });
      return r.motivo ? await resumoLogin(r) : await respostaLogada(r);
    }
    if (msg.acao === "estado") {
      const r = await garantirSessao({ criar: msg.dados?.abrir === true });
      return r.motivo ? await resumoLogin(r) : await respostaLogada(r);
    }
    if (!ACOES_CENTI.includes(msg.acao)) return { ok: false, erro: "Ação desconhecida." };
    // Interrompido na extensão: nada novo deste lote começa.
    if (msg.lote) {
      const a = await lerAtividade();
      if (a?.id === msg.lote && a.estado !== "rodando")
        return { ok: false, interrompido: a.estado === "interrompido", erro: a.estado === "interrompido" ? "Interrompido na extensão." : "O lote foi encerrado." };
    }
    const r = await garantirSessao({ criar: true });
    if (r.motivo) return await resumoLogin(r);
    if (msg.acao === "anexar") {
      // Só com a autorização já consumida no sistema pela ponte, para ESTE alvo (Id + nº + descrição do pedido).
      const a = msg.autorizado;
      const d = msg.dados ?? {};
      if (!a || String(d.id) !== a.id || String(d.numero) !== a.numero || String(d.descricao ?? "") !== a.descricao)
        return { ok: false, erro: "Escrita sem a autorização do sistema para este protocolo." };
      if (!(await confirmarEscrita(a))) return { ok: false, erro: "Anexo não confirmado na janela da extensão — nada foi gravado." };
      // Interrompido enquanto a janela de confirmação estava aberta: não grava.
      if (msg.lote) {
        const at = await lerAtividade();
        if (at?.id === msg.lote && at.estado === "interrompido") return { ok: false, interrompido: true, erro: "Interrompido na extensão." };
      }
    }
    try {
      const resp = await chrome.tabs.sendMessage(r.aba.id, { alvo: "centi", acao: msg.acao, dados: msg.dados });
      // APRENDER: a aba da automação vem para a frente — é nela que se clica (Pesquisar, as abas, abrir um protocolo).
      if (msg.acao === "aprender" && msg.dados?.acao === "iniciar" && resp?.ok) {
        await chrome.tabs.update(r.aba.id, { active: true }).catch(() => {});
        if (r.aba.windowId != null) await chrome.windows.update(r.aba.windowId, { focused: true }).catch(() => {});
      }
      return resp;
    } catch {
      return { ok: false, erro: "A aba da automação não respondeu — aperte F5 nela." };
    }
  })()
    .catch((e) => ({ ok: false, erro: e?.message || "Falha na extensão." }))
    .then(responder);
  return true;
});
