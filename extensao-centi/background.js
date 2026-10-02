// Serviço da extensão: leva o pedido da aba Automação à aba da Centi que tem a sessão e devolve o resultado.
// Instala-se SOZINHO nas abas já abertas (ao instalar/atualizar e quando uma aba da Centi não responde) — sem F5 e sem
// refazer o login: a sessão da Centi continua a da aba.
const CENTI = "https://rioverde.centi.com.br/*";
const SISTEMA = ["https://governarv.com.br/painel/automacao*", "https://www.governarv.com.br/painel/automacao*"];
const ORIGENS = ["https://governarv.com.br", "https://www.governarv.com.br"];
const CONFIRMAR = chrome.runtime.getURL("confirmar.html");

const comPrazo = (p, ms, valor) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(valor), ms))]);

async function injetarCenti(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["centi-anexo.js", "centi-main.js"], world: "MAIN" });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["centi-ponte.js"] });
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

// A Centi faz login POR ABA: usa a aba que já tem a sessão.
async function abaCenti() {
  const abas = await chrome.tabs.query({ url: CENTI });
  if (!abas.length) return { erro: "Abra a Centi (rioverde.centi.com.br) numa aba e faça o login." };
  const estados = await Promise.all(abas.map((a) => estadoDaAba(a.id)));
  const i = estados.findIndex((r) => r?.logado);
  if (i >= 0) return { aba: abas[i], estado: estados[i] };
  return { erro: "Centi sem sessão: na aba da Centi já logada, clique em Pesquisar (ou abra qualquer tela)." };
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
});

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  const origem = sender.url ? new URL(sender.url).origin : "";
  if (!ORIGENS.includes(origem) || !sender.url.includes("/painel/automacao")) return false;
  (async () => {
    const { aba, erro, estado } = await abaCenti();
    if (!aba) return { ok: false, erro };
    // O estado vai inteiro: a entidade aberta e a OPERAÇÃO Emitir DFD que a extensão pegou da tela da Centi.
    if (msg.acao === "estado") return { ok: true, logado: true, entidade: estado?.entidade ?? null, operacao: estado?.operacao ?? null };
    if (!["pedir", "protocolo", "anexar", "gravador"].includes(msg.acao)) return { ok: false, erro: "Ação desconhecida." };
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
