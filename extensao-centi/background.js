// Serviço da extensão: leva o pedido da aba Automação à aba da Centi que tem a sessão e devolve o resultado.
// Instala-se SOZINHO nas abas já abertas (ao instalar/atualizar e quando uma aba da Centi não responde) — sem F5 e sem
// refazer o login: a sessão da Centi continua a da aba.
const CENTI = "https://rioverde.centi.com.br/*";
const SISTEMA = ["https://governarv.com.br/painel/automacao*", "https://www.governarv.com.br/painel/automacao*", "http://localhost:3000/painel/automacao*"];
const ORIGENS = ["https://governarv.com.br", "https://www.governarv.com.br", "http://localhost:3000"];

const comPrazo = (p, ms, valor) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(valor), ms))]);

async function injetarCenti(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["centi-main.js"], world: "MAIN" });
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
    if (msg.acao === "estado") return { ok: true, logado: true, entidade: estado?.entidade ?? null };
    if (msg.acao !== "pedir") return { ok: false, erro: "Ação desconhecida." };
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
