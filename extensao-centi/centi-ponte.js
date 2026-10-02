// Ponte na aba da Centi: extensão <-> script da página (centi-main.js, que usa a sessão da Centi).
(() => {
  // Protocolo da conversa com o script da página (centi-main.js): só muda se o formato das mensagens mudar.
  const P = 25;
  const MARCA = `__pcaCentiPonte_p${P}`;
  if (window[MARCA]) return;
  window[MARCA] = true;
  let seq = 0;
  const pendentes = new Map();
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.fonte !== "pca-centi-resposta" || e.data.p !== P) return;
    const p = pendentes.get(e.data.id);
    if (p) {
      pendentes.delete(e.data.id);
      clearTimeout(p.t);
      p.f(e.data.resposta);
    }
  });
  chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
    if (msg?.alvo !== "centi") return false;
    const id = ++seq;
    // Sem resposta do script da página → falha clara, nunca espera infinita.
    const t = setTimeout(() => {
      pendentes.delete(id);
      responder({ ok: false, erro: "A aba da Centi não respondeu — aperte F5 nela." });
    }, msg.acao === "estado" ? 4000 : 300000);
    pendentes.set(id, { f: responder, t });
    window.postMessage({ fonte: "pca-centi-pedido", p: P, id, acao: msg.acao, dados: msg.dados }, window.location.origin);
    return true;
  });
})();
