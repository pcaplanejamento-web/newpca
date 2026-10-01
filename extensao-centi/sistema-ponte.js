// Ponte na aba Automação do sistema PCA: página <-> extensão. Só esta página fala com a extensão. Cada resposta leva a
// versão: a página ignora a de uma cópia antiga (que fica na aba depois de uma atualização da extensão).
(() => {
  const V = chrome.runtime.getManifest().version;
  const MARCA = `__pcaSistemaPonte_${V}`;
  if (window[MARCA]) return;
  window[MARCA] = true;
  const origem = window.location.origin;
  const responder = (id, resposta) => window.postMessage({ fonte: "pca-extensao", v: V, id, resposta }, origem);
  const anunciar = () => window.postMessage({ fonte: "pca-extensao", v: V, tipo: "pronto", versao: V }, origem);
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== origem) return;
    const m = e.data;
    if (m?.fonte !== "pca-automacao") return;
    if (m.tipo === "ola") return anunciar();
    if (m.v && m.v !== V) return;
    try {
      chrome.runtime.sendMessage({ acao: m.acao, dados: m.dados }, (resposta) => {
        const erro = chrome.runtime.lastError;
        responder(m.id, erro ? { ok: false, erro: erro.message } : (resposta ?? { ok: false, erro: "Sem resposta da extensão." }));
      });
    } catch {
      /* cópia antiga sem a extensão: a página usa a ponte nova */
    }
  });
  anunciar();
})();
