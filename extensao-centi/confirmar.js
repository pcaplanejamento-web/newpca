// Janela de confirmação da escrita na Centi (página da PRÓPRIA extensão — a página do sistema não a alcança). Mostra o
// alvo autorizado e devolve a resposta ao serviço da extensão.
(() => {
  const q = new URLSearchParams(location.search);
  const pedido = q.get("pedido") ?? "";
  const ano = q.get("ano");
  document.getElementById("protocolo").textContent = `${q.get("numero") ?? ""}${ano ? `/${ano}` : ""}`;
  document.getElementById("id").textContent = q.get("id") ?? "";
  document.getElementById("descricao").textContent = q.get("descricao") ?? "";
  document.getElementById("execucao").textContent = `nº ${q.get("execucao") ?? ""}`;
  const responder = (sim) => chrome.runtime.sendMessage({ tipo: "confirmacao", pedido, sim }).finally(() => window.close());
  document.getElementById("sim").addEventListener("click", () => responder(true));
  document.getElementById("nao").addEventListener("click", () => responder(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") responder(false);
  });
  document.getElementById("nao").focus();
})();
