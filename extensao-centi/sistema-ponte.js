// Ponte na aba Automação do sistema PCA: página <-> extensão. Só esta página fala com a extensão.
(() => {
  const VERSAO = chrome.runtime.getManifest().version;
  const responder = (id, resposta) => window.postMessage({ fonte: "pca-ext", id, resposta }, window.location.origin);
  const anunciar = () => window.postMessage({ fonte: "pca-ext", tipo: "pronto", versao: VERSAO }, window.location.origin);
  const RECARREGAR = "A extensão foi atualizada — recarregue esta página (F5).";
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const m = e.data;
    if (m?.fonte !== "pca-pagina") return;
    if (m.tipo === "ola") return anunciar();
    try {
      chrome.runtime.sendMessage({ acao: m.acao, dados: m.dados }, (resposta) => {
        const erro = chrome.runtime.lastError;
        responder(m.id, erro ? { ok: false, erro: erro.message } : (resposta ?? { ok: false, erro: "Sem resposta da extensão." }));
      });
    } catch {
      // A extensão foi recarregada depois que esta página abriu: esta ponte ficou sem a extensão.
      responder(m.id, { ok: false, erro: RECARREGAR });
    }
  });
  anunciar();
})();
