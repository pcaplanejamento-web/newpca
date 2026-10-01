// Ponte na aba da Centi: extensão <-> script da página (centi-main.js, que usa a sessão da Centi).
(() => {
  let seq = 0;
  const pendentes = new Map();
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.fonte !== "pca-main") return;
    const f = pendentes.get(e.data.id);
    if (f) {
      pendentes.delete(e.data.id);
      f(e.data.resposta);
    }
  });
  chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
    const id = ++seq;
    pendentes.set(id, responder);
    window.postMessage({ fonte: "pca-ponte", id, acao: msg.acao, dados: msg.dados }, window.location.origin);
    return true;
  });
})();
