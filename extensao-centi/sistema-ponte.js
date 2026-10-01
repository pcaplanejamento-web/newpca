// Ponte na aba Automação do sistema PCA: página <-> extensão. Só esta página fala com a extensão.
(() => {
  const VERSAO = chrome.runtime.getManifest().version;
  const anunciar = () => window.postMessage({ fonte: "pca-ext", tipo: "pronto", versao: VERSAO }, window.location.origin);
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const m = e.data;
    if (m?.fonte !== "pca-pagina") return;
    if (m.tipo === "ola") return anunciar();
    chrome.runtime.sendMessage({ acao: m.acao, dados: m.dados }, (resposta) => {
      const erro = chrome.runtime.lastError;
      window.postMessage(
        { fonte: "pca-ext", id: m.id, resposta: erro ? { ok: false, erro: erro.message } : resposta },
        window.location.origin,
      );
    });
  });
  anunciar();
})();
