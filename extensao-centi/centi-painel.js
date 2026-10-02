// O CARTÃO flutuante na ABA DA AUTOMAÇÃO (mundo isolado, Shadow DOM — a tela da Centi não o alcança nem o estiliza):
// o que a automação está fazendo agora (título, passo, barra) e o botão INTERROMPER. Recebe o andamento do serviço da
// extensão; nunca lê nem guarda credenciais.
(() => {
  const MARCA = "__pcaCentiPainel_v1";
  if (window[MARCA]) return;
  window[MARCA] = true;

  const host = document.createElement("div");
  host.id = "pca-automacao-painel";
  const raiz = host.attachShadow({ mode: "closed" });
  raiz.innerHTML = `
<style>
  :host { all: initial; }
  .c { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 320px; max-width: calc(100vw - 32px);
    font: 13px/1.4 Inter, Roboto, system-ui, sans-serif; color: #18181b; background: #fff; border: 1px solid #e4e4e7;
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.18); overflow: hidden; }
  @media (prefers-color-scheme: dark) { .c { color: #fafafa; background: #18181b; border-color: #3f3f46; } .s { color: #a1a1aa; } }
  .t { display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; font-weight: 700; }
  .p { width: 8px; height: 8px; border-radius: 50%; background: #a1a1aa; flex: none; }
  .p.rodando { background: #2563eb; } .p.concluido { background: #16a34a; } .p.interrompido { background: #dc2626; } .p.parado { background: #d97706; }
  .x { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 16px; width: 28px; height: 28px; border-radius: 6px; }
  .b { padding: 0 12px 10px; }
  .s { color: #52525b; margin: 0 0 6px; overflow-wrap: anywhere; }
  .barra { height: 6px; border-radius: 3px; background: rgba(127,127,127,.2); overflow: hidden; margin: 6px 0 8px; }
  .barra > i { display: block; height: 100%; background: #2563eb; width: 0; transition: width .3s; }
  .parar { width: 100%; min-height: 36px; border-radius: 8px; border: 1px solid #dc2626; background: #dc2626; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  .parar[disabled] { opacity: .6; cursor: default; }
  .min .b { display: none; }
</style>
<div class="c min" role="status" aria-live="polite">
  <div class="t"><span class="p"></span><span class="titulo">Aba da Automação PCA</span><button class="x" type="button" aria-label="Mostrar ou recolher">▾</button></div>
  <div class="b"><p class="s passo"></p><div class="barra"><i></i></div><button class="parar" type="button">Interromper</button></div>
</div>`;
  const $ = (s) => raiz.querySelector(s);
  const cartao = $(".c");
  let recolhido = false;
  $(".x").addEventListener("click", () => {
    recolhido = !recolhido;
    cartao.classList.toggle("min", recolhido);
  });
  $(".parar").addEventListener("click", () => {
    $(".parar").disabled = true;
    $(".parar").textContent = "Interrompendo…";
    chrome.runtime.sendMessage({ tipo: "interromper" }).catch(() => {});
  });

  function mostrar(a) {
    const rodando = a?.estado === "rodando";
    $(".p").className = `p ${a?.estado ?? ""}`;
    $(".titulo").textContent = a ? `Automação PCA · ${a.titulo}` : "Aba da Automação PCA";
    $(".passo").textContent = a ? `${a.passo}${a.total ? ` (${Math.min(a.feito, a.total)} de ${a.total})` : ""}` : "Aguardando um lote.";
    $(".barra > i").style.width = a?.total ? `${Math.round((Math.min(a.feito, a.total) / a.total) * 100)}%` : "0";
    const parar = $(".parar");
    parar.style.display = rodando ? "" : "none";
    parar.disabled = false;
    parar.textContent = "Interromper";
    if (!recolhido) cartao.classList.toggle("min", !a);
  }

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id || msg?.alvo !== "painel") return false;
    mostrar(msg.atividade ?? null);
    return false;
  });
  const colocar = () => (document.body ?? document.documentElement).appendChild(host);
  if (document.body) colocar();
  else document.addEventListener("DOMContentLoaded", colocar, { once: true });
  chrome.runtime
    .sendMessage({ tipo: "atividade" })
    .then((r) => mostrar(r?.atividade ?? null))
    .catch(() => mostrar(null));
})();
