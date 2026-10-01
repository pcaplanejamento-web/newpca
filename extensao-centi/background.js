// Serviço da extensão: leva o pedido da aba Automação à aba da Centi que tem a sessão e devolve o resultado.
const ORIGENS = ["https://governarv.com.br", "https://www.governarv.com.br", "http://localhost:3000"];

const comPrazo = (p, ms, valor) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(valor), ms))]);

// A Centi faz login POR ABA: usa a aba que já tem a sessão (a que fez alguma chamada à API depois do login).
async function abaCenti() {
  const abas = await chrome.tabs.query({ url: "https://rioverde.centi.com.br/*" });
  if (!abas.length) return { erro: "Abra a Centi (rioverde.centi.com.br) numa aba e faça o login." };
  const estados = await Promise.all(
    abas.map((a) => comPrazo(chrome.tabs.sendMessage(a.id, { acao: "estado" }).catch(() => null), 5000, null)),
  );
  const i = estados.findIndex((r) => r?.logado);
  if (i >= 0) return { aba: abas[i] };
  if (estados.every((r) => !r?.ok))
    return { erro: "Recarregue a aba da Centi (F5) — ela abriu antes da extensão (ou da atualização dela)." };
  return { erro: "Centi sem login: faça o login e clique em Pesquisar em qualquer tela da Centi." };
}

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  const origem = sender.url ? new URL(sender.url).origin : "";
  if (!ORIGENS.includes(origem) || !sender.url.includes("/painel/automacao")) return false;
  (async () => {
    const { aba, erro } = await abaCenti();
    if (!aba) return { ok: false, erro };
    if (msg.acao === "estado") return { ok: true, logado: true };
    try {
      return await chrome.tabs.sendMessage(aba.id, { acao: msg.acao, dados: msg.dados });
    } catch {
      return { ok: false, erro: "Recarregue a aba da Centi (F5) e faça o login." };
    }
  })()
    .catch((e) => ({ ok: false, erro: e?.message || "Falha na extensão." }))
    .then(responder);
  return true;
});
