// Serviço da extensão: leva o pedido da aba Automação à aba da Centi aberta (onde está a sessão) e devolve o resultado.
const ORIGENS = ["https://governarv.com.br", "https://www.governarv.com.br", "http://localhost:3000"];

async function abaCenti() {
  const abas = await chrome.tabs.query({ url: "https://rioverde.centi.com.br/*" });
  return abas.find((a) => a.active) ?? abas[0] ?? null;
}

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  const origem = sender.url ? new URL(sender.url).origin : "";
  if (!ORIGENS.includes(origem) || !sender.url.includes("/painel/automacao")) return false;
  (async () => {
    const aba = await abaCenti();
    if (!aba?.id) return { ok: false, erro: "Abra a Centi (rioverde.centi.com.br) numa aba e faça o login." };
    try {
      return await chrome.tabs.sendMessage(aba.id, { acao: msg.acao, dados: msg.dados });
    } catch {
      return { ok: false, erro: "Recarregue a aba da Centi (F5) — a extensão foi instalada depois que ela abriu." };
    }
  })().then(responder);
  return true;
});
