// Ponte na aba da Centi: extensão <-> script da página (centi-main.js, que usa a sessão da Centi).
(() => {
  let seq = 0;
  const pendentes = new Map();
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.fonte !== "pca-main") return;
    const p = pendentes.get(e.data.id);
    if (p) {
      pendentes.delete(e.data.id);
      clearTimeout(p.t);
      p.f(e.data.resposta);
    }
  });
  chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
    const id = ++seq;
    // Sem resposta do script da página (aba aberta antes da extensão) → falha clara, nunca espera infinita.
    const t = setTimeout(() => {
      pendentes.delete(id);
      responder({ ok: false, erro: "A aba da Centi não respondeu — recarregue a aba da Centi (F5) e faça o login." });
    }, msg.acao === "emitir" ? 140000 : 4000);
    pendentes.set(id, { f: responder, t });
    window.postMessage({ fonte: "pca-ponte", id, acao: msg.acao, dados: msg.dados }, window.location.origin);
    return true;
  });
})();
