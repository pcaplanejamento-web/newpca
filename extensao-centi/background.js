// Serviço da extensão: leva o pedido da aba Automação à ABA PRÓPRIA da automação na Centi (aberta e guardada pela
// extensão, no grupo "Automação PCA") e devolve o resultado. As abas da Centi do usuário não são usadas.
// Também: o login automático (o login de cada ADM fica SÓ no sistema PCA, cifrado no banco — a extensão o lê na hora de
// entrar e não guarda nada dele), o andamento do lote (selo no ícone, cartão na aba da automação e o popup) e o
// INTERROMPER pela extensão.
const CENTI = "https://rioverde.centi.com.br/*";
const INICIO_CENTI = "https://rioverde.centi.com.br/";
// O sistema COMPRAS da Centi (a raiz é só o portal "Acesso aos sistemas", sem login): a aba da automação trabalha nele.
const COMPRAS = "https://rioverde.centi.com.br/compras/";
const SISTEMA = ["https://governarv.com.br/painel/automacao*", "https://www.governarv.com.br/painel/automacao*"];
const ORIGENS = ["https://governarv.com.br", "https://www.governarv.com.br"];
const POPUP = chrome.runtime.getURL("popup.html");
const TITULO_GRUPO = "Automação PCA";
const ACOES_CENTI = ["pedir", "protocolo", "anexar", "gravador", "aprender", "ler", "cm002", "telaApi", "reparticoesApi", "trocarOrgao", "cm002Colunas"];

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
// O login da Centi de cada ADM fica SÓ no sistema PCA (cifrado no banco — Automação → Ajustes → Login da Centi): vale em
// qualquer navegador em que a pessoa estiver logada no sistema. A extensão o LÊ a cada tentativa (SELADO à chave dela) e não
// guarda nada dele. Entra e RE-ENTRA sozinha: ao abrir o sistema, quando a aba da Centi cai no login e a cada 5 min no
// alarme. Depois de uma falha, no máximo UMA tentativa a cada 5 min (entrar zera a espera); só a senha RECUSADA pausa (no
// sistema, todos os navegadores — a conta na Centi não é bloqueada) até salvar de novo. `forcar` ignora só o intervalo.
const INTERVALO_LOGIN_MS = 5 * 60 * 1000;
let tentando = null;
function podeTentarLogin(agora, ultima, forcar) {
  if (!forcar && typeof ultima === "number" && agora - ultima < INTERVALO_LOGIN_MS)
    return { pode: false, motivo: "Aguardando o intervalo entre tentativas.", esperarS: Math.ceil((INTERVALO_LOGIN_MS - (agora - ultima)) / 1000) };
  return { pode: true };
}
// A CHAVE desta extensão (ECDH P-256): a privada NÃO EXTRAÍVEL fica no IndexedDB da extensão — nenhuma página nem outra
// extensão a lê; a pública vai em cada pedido e o login chega SELADO a ela (nunca em texto aberto).
const BANCO_CHAVE = "pca-chave";
let chaveMemoria = null;
function abrirBancoChave() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO_CHAVE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("chaves");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}
const pedidoIdb = (r) =>
  new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
async function parDeChaves() {
  if (chaveMemoria) return chaveMemoria;
  let par = null;
  if (typeof indexedDB !== "undefined") {
    const db = await abrirBancoChave();
    try {
      par = await pedidoIdb(db.transaction("chaves").objectStore("chaves").get("centi"));
      if (!par) {
        par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
        await pedidoIdb(db.transaction("chaves", "readwrite").objectStore("chaves").put(par, "centi"));
      }
    } finally {
      db.close();
    }
  } else par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const publica = btoa(String.fromCharCode(...raw));
  const impressao = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((b) => b.toString(16).padStart(2, "0")).join("");
  chaveMemoria = { privada: par.privateKey, publica, impressao };
  return chaveMemoria;
}
/** Abre o login SELADO (a mesma conta de `centi-login-core.ts` → `abrirSelado`). `null` = não abre. */
async function abrirSelado(privada, impressao, s) {
  try {
    const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
    const enc = new TextEncoder();
    const aad = enc.encode(`centi-entrega:${impressao}`);
    const epk = await crypto.subtle.importKey("raw", deB64(s.epk), { name: "ECDH", namedCurve: "P-256" }, true, []);
    const segredo = await crypto.subtle.deriveBits({ name: "ECDH", public: epk }, privada, 256);
    const base = await crypto.subtle.importKey("raw", segredo, "HKDF", false, ["deriveKey"]);
    const k = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode("pca/centi-entrega/v1"), info: aad },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(s.iv), additionalData: aad }, k, deB64(s.ct));
    const j = JSON.parse(new TextDecoder().decode(pt));
    return typeof j?.usuario === "string" && typeof j?.senha === "string" && j.usuario && j.senha ? j : null;
  } catch {
    return null;
  }
}
const API_LOGIN = `${ORIGENS[0]}/api/admin/automacao/credencial-centi`;
const MSG_SEM_SISTEMA = "Entre no sistema PCA neste navegador (como administrador) — o login da Centi vem de lá.";
const MSG_SEM_LOGIN = "Configure o login da Centi no sistema (Automação → Ajustes → Login da Centi).";
async function apiLogin(metodo, corpo, consulta = "") {
  try {
    const r = await fetch(`${API_LOGIN}${consulta}`, {
      method: metodo,
      credentials: "include",
      cache: "no-store",
      headers: corpo ? { "content-type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok) return j;
    if (r.status === 401 || r.status === 403) return { ok: false, semSistema: true, erro: MSG_SEM_SISTEMA };
    return { ok: false, status: r.status, erro: j?.error ?? `O sistema respondeu ${r.status}.` };
  } catch {
    return { ok: false, semSistema: true, erro: "Sem conexão com o sistema PCA." };
  }
}
/** A SITUAÇÃO do login (sem a senha), guardada 60 s nesta sessão do navegador — a tela confere a cada 20 s. */
async function infoLogin(fresco = false) {
  const guardada = await sessao.ler("loginInfo");
  if (!fresco && guardada && Date.now() - guardada.em < 60 * 1000) return guardada.v;
  const j = await apiLogin("GET", null, "?situacao=1");
  const antigo = !!(await chrome.storage.local.get("credCenti")).credCenti;
  const v = j.ok
    ? {
        credenciais: j.tem === true,
        auto: j.auto !== false,
        pausado: !!j.pausadoEm,
        motivo: j.pausadoEm ? (j.motivo ?? "Login pausado.") : null,
        conta: typeof j.conta === "string" ? j.conta : null,
        // O login da extensão antiga ainda está aqui: o popup pergunta para qual conta ele vai.
        antigo: antigo && j.tem !== true,
      }
    : { credenciais: false, auto: false, pausado: false, motivo: null, semSistema: j.semSistema === true, erro: j.erro };
  await sessao.gravar("loginInfo", { em: Date.now(), v });
  return v;
}

/**
 * SEMPRE PRONTO: ao abrir o sistema (ou o navegador, e no alarme), com o login da Centi guardado e o "entrar sozinho"
 * ligado, a aba da automação abre (em segundo plano) e a Centi entra sozinha. No máximo uma
 * vez a cada 2 min; a aba que a pessoa fechou só volta pela tela da Automação ("Verificar").
 */
async function prepararCenti() {
  const ultimo = await sessao.ler("preparadoEm");
  if (typeof ultimo === "number" && Date.now() - ultimo < 2 * 60 * 1000) return;
  await sessao.gravar("preparadoEm", Date.now());
  const i = await infoLogin();
  if (!i.credenciais || i.pausado || !i.auto) return;
  await garantirSessao({ criar: !(await sessao.ler("abaFechada")) });
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

/** A Centi recusou o login ou pediu uma verificação: pausa NO SISTEMA (nenhum navegador tenta de novo a mesma senha). */
async function pausarNoSistema(codigo) {
  await apiLogin("POST", { acao: "pausar", motivo: codigo });
  await sessao.tirar("loginInfo");
}

function tentarLogin(aba, forcar) {
  if (!tentando)
    tentando = (async () => {
      const p = podeTentarLogin(Date.now(), (await sessao.ler("loginUltima")) ?? null, forcar);
      if (!p.pode) return { resultado: "espera", erro: p.motivo, esperarS: p.esperarS ?? null };
      // O login vem do sistema NA HORA, SELADO à chave deste navegador (nada fica guardado na extensão).
      const k = await parDeChaves().catch(() => null);
      if (!k) return { resultado: "falha", erro: "A extensão não conseguiu criar a chave dela — reinstale-a." };
      const entrega = await apiLogin("GET", null, `?publica=${encodeURIComponent(k.publica)}`);
      await sessao.tirar("loginInfo");
      if (!entrega.ok) return { resultado: entrega.semSistema ? "semSistema" : "falha", erro: entrega.erro };
      if (entrega.tem !== true) return { resultado: "semCredenciais", erro: MSG_SEM_LOGIN };
      if (entrega.pausado) return { resultado: "pausado", erro: entrega.motivo ?? "Login da Centi pausado — salve de novo no sistema." };
      if (!forcar && entrega.auto === false) return { resultado: "desligado" };
      const cred = entrega.selado ? await abrirSelado(k.privada, k.impressao, entrega.selado) : null;
      if (!cred) return { resultado: "falha", erro: "O login chegou, mas não abriu com a chave deste navegador — autorize-o de novo no sistema." };
      // Só na aba da automação, ainda na Centi (a aba pode ter navegado desde a conferência).
      const atual = await chrome.tabs.get(aba.id).catch(() => null);
      if (!atual?.url?.startsWith(INICIO_CENTI)) return { resultado: "falha", erro: "A aba da automação saiu da Centi." };
      await sessao.gravar("loginUltima", Date.now());
      let r = null;
      try {
        r = await comPrazo(chrome.tabs.sendMessage(aba.id, { alvo: "centi-login", usuario: cred.usuario, senha: cred.senha }, { frameId: 0 }), 25000, null);
      } catch {
        r = null; // a página recarregou ao entrar: confere-se pelo estado depois
      }
      const resultado = r?.resultado ?? "sem-resposta";
      // Entrou COM a sessão: a próxima queda pode tentar de novo na hora ("sem-sessao" só zera depois que a "pesquisa"
      // confirmar a sessão — senão uma tela que não é a do login viraria um laço de tentativas).
      if (resultado === "ok") await sessao.tirar("loginUltima");
      // Só a senha RECUSADA pausa (por CÓDIGO — o texto da Centi pode trazer o usuário). Uma verificação (captcha) não pausa:
      // a extensão tenta de novo depois do intervalo, sem ninguém precisar salvar nada.
      if (resultado === "recusado") await pausarNoSistema("recusado");
      return { resultado, erro: resultado === "recusado" ? "A Centi recusou o usuário ou a senha — confira e salve de novo no sistema." : (r?.erro ?? null) };
    })().finally(() => {
      tentando = null;
    });
  return tentando;
}

// A TRANSIÇÃO: até a 1.38.0 o login ficava cifrado AQUI (chrome.storage.local "credCenti" + a chave no IndexedDB
// "pca-cofre"). Com um login já guardado no sistema, o cofre antigo é só APAGADO. Sem ele, quem decide é a PESSOA, no popup
// ("Enviar para a conta <nome>" ou "Descartar") — nunca vai sozinho à conta que estiver logada (pode ser de outra pessoa).
async function chaveDoCofreAntigo() {
  return new Promise((ok) => {
    try {
      const abrir = indexedDB.open("pca-cofre", 1);
      abrir.onupgradeneeded = () => abrir.result.createObjectStore("chaves");
      abrir.onerror = () => ok(null);
      abrir.onsuccess = () => {
        const db = abrir.result;
        try {
          const g = db.transaction("chaves").objectStore("chaves").get("centi");
          g.onsuccess = () => {
            db.close();
            ok(g.result ?? null);
          };
          g.onerror = () => {
            db.close();
            ok(null);
          };
        } catch {
          db.close();
          ok(null);
        }
      };
    } catch {
      ok(null);
    }
  });
}
async function apagarCofreAntigo() {
  await chrome.storage.local.remove(["credCenti", "loginCenti", "credNoSistema"]);
  try {
    indexedDB.deleteDatabase("pca-cofre");
  } catch {}
}
async function lerCofreAntigo() {
  const o = await chrome.storage.local.get(["credCenti", "loginCenti"]);
  if (!o.credCenti) return null;
  try {
    const k = await chaveDoCofreAntigo();
    const b = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
    if (!k) return { ilegivel: true };
    const cred = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b(o.credCenti.iv) }, k, b(o.credCenti.dados))));
    if (!cred?.usuario || !cred?.senha) return { ilegivel: true };
    return { usuario: String(cred.usuario), senha: String(cred.senha), auto: o.loginCenti?.auto !== false };
  } catch {
    return { ilegivel: true };
  }
}
/** Sozinho: só APAGA o cofre antigo quando não serve mais (ilegível, ou o sistema já tem login). */
async function limparCofreAntigo() {
  const c = await lerCofreAntigo();
  if (!c) return;
  if (c.ilegivel) return apagarCofreAntigo();
  const s = await apiLogin("GET", null, "?situacao=1");
  if (s.ok && s.tem === true) await apagarCofreAntigo();
}
/** Pela PESSOA, no popup: envia o login antigo à conta logada (que ela viu pelo nome) ou o descarta. */
async function decidirLoginAntigo(enviar) {
  const c = await lerCofreAntigo();
  if (!c) return { ok: true };
  if (enviar && !c.ilegivel) {
    const r = await apiLogin("POST", { acao: "importar", usuario: c.usuario, senha: c.senha, auto: c.auto });
    if (!r.ok && r.status !== 409) return { ok: false, erro: r.erro };
  }
  await apagarCofreAntigo();
  await sessao.tirar("loginInfo");
  return { ok: true };
}

// A "PESQUISA" que deixa a Centi pronta: depois do login (ou sem a sessão capturada) a aba faz UMA leitura inofensiva pelo
// cliente da própria Centi e a sessão é capturada (`aquecer`, centi-main.js). Parada há mais de 10 min com o sistema
// aberto, a mesma leitura mantém a sessão viva. Sem a tela da Centi carregada, a aba é recarregada (no máximo 1 vez a cada
// 2 min) — a tela recarregada faz os pedidos dela.
const AQUECER_SEM_SESSAO_MS = 60 * 1000;
const MANTER_VIVA_MS = 10 * 60 * 1000;
const RECARREGAR_MS = 2 * 60 * 1000;
// `recarregar` = só fora de uma ação e depois de 3 "sem a tela da Centi" seguidos (a heurística do cliente pode falhar:
// nunca recarrega em laço nem no "manter viva").
async function aquecerAba(aba, { recarregar = false } = {}) {
  await sessao.gravar("aquecidoEm", Date.now());
  let r = null;
  try {
    r = await comPrazo(chrome.tabs.sendMessage(aba.id, { alvo: "centi", acao: "aquecer" }), 20000, null);
  } catch {
    r = null;
  }
  if (r?.logado) {
    await sessao.tirar("semClienteSeguidos");
    return r;
  }
  if (recarregar && (r?.semCliente || r?.logado === false)) {
    const n = ((await sessao.ler("semClienteSeguidos")) ?? 0) + 1;
    await sessao.gravar("semClienteSeguidos", n);
    const ultima = await sessao.ler("recarregadaEm");
    const rodando = (await lerAtividade())?.estado === "rodando";
    if (n >= 3 && !rodando && !(typeof ultima === "number" && Date.now() - ultima < RECARREGAR_MS)) {
      await sessao.gravar("recarregadaEm", Date.now());
      await sessao.tirar("semClienteSeguidos");
      await chrome.tabs.reload(aba.id).catch(() => {});
    }
  }
  return r;
}
const aquecerJa = async (intervalo) => {
  const ultimo = await sessao.ler("aquecidoEm");
  return !(typeof ultimo === "number" && Date.now() - ultimo < intervalo);
};

/**
 * A aba da automação com a sessão. `criar` = abre a aba se não houver (sem ela, só quando o usuário não a fechou);
 * `esperar` = espera o login (senão ele corre por trás); `forcar` = "Entrar agora".
 */
async function garantirSessao({ criar = true, esperarLogin = false, forcar = false, manterViva = false } = {}) {
  let aba = await abaGuardada();
  if (!aba) {
    if (!criar && (await sessao.ler("abaFechada")))
      return { motivo: "semAba", erro: "A aba da automação foi fechada — toque em Verificar para abrir de novo." };
    aba = await criarAba();
  }
  if (!noCompras(aba)) aba = await irParaCompras(aba);
  const e = await estadoDaAba(aba.id);
  if (e?.logado && e.tela !== "login") {
    // Manter viva: só pela conferência do estado (nunca no meio de uma ação), sem lote rodando e sem ação há 10 min — a
    // leitura nunca disputa a sessão da Centi com um Emitir DFD.
    if (manterViva) {
      const parada = !(Number(e.ativoEm) > 0) || Date.now() - Number(e.ativoEm) > MANTER_VIVA_MS;
      const acaoEm = await sessao.ler("acaoEm");
      const ociosa = !(typeof acaoEm === "number" && Date.now() - acaoEm < MANTER_VIVA_MS) && (await lerAtividade())?.estado !== "rodando";
      if (parada && ociosa && (await aquecerJa(MANTER_VIVA_MS))) await aquecerAba(aba);
    }
    return { aba, estado: e };
  }
  if (!e) return { motivo: "semSessao", aba, erro: "A aba da automação não respondeu — aperte F5 nela." };
  if (e.tela !== "login") {
    // Fora do login e sem a sessão capturada: a "pesquisa" a captura (no máximo 1 vez por minuto; o "Entrar agora" já).
    if (forcar || esperarLogin || (await aquecerJa(AQUECER_SEM_SESSAO_MS))) {
      const a = await aquecerAba(aba, { recarregar: true });
      if (a?.logado) {
        const de = await estadoDaAba(aba.id);
        if (de?.logado && de.tela !== "login") return { aba, estado: de };
      }
    }
    return { motivo: "semSessao", aba, erro: "Preparando a Centi na aba da automação (lendo a sessão)…" };
  }
  const t = tentarLogin(aba, forcar).catch(() => ({ resultado: "falha" }));
  if (!esperarLogin && !forcar) return { motivo: "login", aba, erro: "Centi na tela de login — entrando…" };
  const res = await t;
  if (res.resultado === "ok" || res.resultado === "sem-sessao" || res.resultado === "sem-resposta") {
    await esperar(1500);
    let de = await estadoDaAba(aba.id);
    if (de && !de.logado && de.tela !== "login" && (await aquecerAba(aba, { recarregar: true }))?.logado) {
      await sessao.tirar("loginUltima");
      de = await estadoDaAba(aba.id);
    }
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
// A confirmação no BANNER FLUTUANTE DA EXTENSÃO — o dropdown do ícone (a página do sistema não o desenha nem o aprova).
// Sem como abrir o dropdown (nenhuma janela em foco), o MESMO painel numa janelinha compacta. Uma vez por execução e
// protocolo; recusar, fechar a janelinha, interromper ou não responder em 2 min = não grava. Fechar o dropdown (tocar
// fora) NÃO recusa: o pedido fica no ícone (selo "?") até a resposta ou o prazo.
async function abrirConfirmacao() {
  try {
    await chrome.action.openPopup();
    return null;
  } catch {}
  const w = await chrome.windows.create({ url: `${POPUP}?janela=1&confirmar=1`, type: "popup", width: 380, height: 420, focused: true });
  return w.id;
}

async function confirmarEscrita(a) {
  const chave = `${a.execucaoId}|${a.id}`;
  const confirmadas = (await sessao.ler("confirmadas")) ?? [];
  if (confirmadas.includes(chave)) return true;
  const pedido = crypto.randomUUID();
  await sessao.gravar("confirmacao", { pedido, execucao: String(a.execucaoId), id: a.id, numero: a.numero, ano: a.ano ?? "", descricao: a.descricao, ate: Date.now() + 120000 });
  try {
    await chrome.action?.setBadgeText({ text: "?" });
    await chrome.action?.setBadgeBackgroundColor({ color: "#d97706" });
  } catch {}
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
      if (sender.url?.startsWith(POPUP) && m?.tipo === "confirmacao" && m.pedido === pedido) fim(m.sim === true);
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
    abrirConfirmacao()
      .then((id) => {
        janela = id;
        if (feito && id != null) chrome.windows.remove(id).catch(() => {});
      })
      .catch(() => fim(false));
  });
  await sessao.tirar("confirmacao");
  await mostrarAtividade(await lerAtividade()).catch(() => {});
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
  limparCofreAntigo().catch(() => {});
});
// O alarme do login "sempre que cair" — criado também ao abrir o navegador e a cada vez que o serviço acorda (o Chrome
// pode perder os alarmes ao reiniciar).
async function garantirAlarme() {
  try {
    if (!chrome.alarms) return;
    if (!(await chrome.alarms.get("login-centi"))) await chrome.alarms.create("login-centi", { periodInMinutes: 5 });
  } catch {}
}
garantirAlarme();
chrome.runtime.onStartup?.addListener(() => {
  garantirAlarme();
  limparCofreAntigo().catch(() => {});
  prepararCenti().catch(() => {});
});

// "Sempre que cair": a aba da automação que carregou (F5) na tela de login entra sozinha; o cartão volta à aba.
async function conferirAba(tabId) {
  const aba = await abaGuardada();
  if (aba?.id !== tabId) return;
  const e = await estadoDaAba(tabId);
  await avisarPainel(tabId, await lerAtividade());
  if (e?.tela === "login") {
    const r = await tentarLogin({ id: tabId }, false);
    // Entrou: a "pesquisa" já deixa a sessão capturada (o sistema vê a Centi pronta sem abrir tela nenhuma).
    if (r?.resultado === "ok" || r?.resultado === "sem-sessao") {
      await esperar(1500);
      const de = await estadoDaAba(tabId);
      if (de && !de.logado && de.tela !== "login" && (await aquecerAba(aba, { recarregar: true }))?.logado) await sessao.tirar("loginUltima");
    }
  } else if (e && !e.logado && (await aquecerJa(AQUECER_SEM_SESSAO_MS))) await aquecerAba(aba, { recarregar: true });
}
chrome.tabs?.onUpdated?.addListener((tabId, info, tab) => {
  // Só uma NAVEGAÇÃO de verdade para fora da Automação para o lote (o "loading" sem url muda de status sem sair da tela —
  // marcava o lote como parado no meio de um fluxo). O F5 / fechar a página avisa pela ponte ("saiu", pagehide).
  if (info.url && !info.url.includes("/painel/automacao")) donoSaiu(tabId).catch(() => {});
  // Abriu o SISTEMA (inclusive logo depois de entrar): deixa a Centi pronta.
  if (info.status === "complete" && ORIGENS.some((o) => tab?.url?.startsWith(`${o}/painel`))) prepararCenti().catch(() => {});
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
chrome.alarms?.onAlarm?.addListener(async (a) => {
  if (a.name !== "login-centi") return;
  limparCofreAntigo().catch(() => {});
  const aba = await abaGuardada().catch(() => null);
  if (aba) await conferirAba(aba.id).catch(() => {});
  else await prepararCenti().catch(() => {});
});

const resumoLogin = async (r) => ({
  ok: false,
  // O motivo da tentativa (senha recusada, sem o sistema, sem login, pausado) diz mais que "Centi na tela de login".
  erro: r.tentativa?.erro && r.tentativa.resultado !== "ok" ? r.tentativa.erro : r.erro,
  tela: r.motivo === "login" ? "login" : undefined,
  motivo: r.motivo,
  login: await infoLogin(!!r.tentativa),
  tentativa: r.tentativa ?? null,
  atividade: await lerAtividade(),
});
const respostaLogada = async (r) => ({
  ok: true,
  logado: true,
  login: await infoLogin(),
  entidade: r.estado?.entidade ?? null,
  operacao: r.estado?.operacao ?? null,
  aprendido: r.estado?.aprendido ?? null,
  atividade: await lerAtividade(),
});

/** O popup (dropdown do ícone da extensão, ou a janelinha dele). */
async function daExtensao(msg) {
  if (msg.tipo === "interromper") return interromper();
  if (msg.tipo === "loginAntigo") return decidirLoginAntigo(msg.enviar === true);
  if (msg.tipo === "configurarLogin") {
    await chrome.tabs.create({ url: `${ORIGENS[0]}/painel/automacao?ajustes=login`, active: true });
    return { ok: true };
  }
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
      const r = await garantirSessao({ criar: msg.dados?.abrir === true, manterViva: true });
      return r.motivo ? await resumoLogin(r) : await respostaLogada(r);
    }
    if (!ACOES_CENTI.includes(msg.acao)) return { ok: false, erro: "Ação desconhecida." };
    // Uma ação na Centi agora: o "manter viva" espera 10 min sem ações (nunca disputa a sessão com ela).
    await sessao.gravar("acaoEm", Date.now());
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
