// Ponte na aba Automação do sistema PCA: página <-> extensão. Só esta página fala com a extensão. Cada resposta leva a
// versão: a página ignora a de uma cópia antiga (que fica na aba depois de uma atualização da extensão).
// ESCRITA na Centi ("anexar") só com a AUTORIZAÇÃO DE USO ÚNICO do sistema: esta ponte (fora do alcance dos scripts da
// página) a CONSOME no servidor para o alvo EXATO que será gravado — Id + nº + ano + descrição tirados do próprio pedido —
// e só então leva o pedido adiante, sem o token. O serviço da extensão ainda pede a confirmação na janela dela.
(() => {
  const V = chrome.runtime.getManifest().version;
  const MARCA = `__pcaSistemaPonte_${V}`;
  if (window[MARCA]) return;
  window[MARCA] = true;
  const origem = window.location.origin;
  const responder = (id, resposta) => window.postMessage({ fonte: "pca-extensao", v: V, id, resposta }, origem);
  // O id desta cópia vai junto: duas cópias instaladas = a tela avisa.
  const anunciar = () => window.postMessage({ fonte: "pca-extensao", v: V, tipo: "pronto", versao: V, idExtensao: chrome.runtime.id }, origem);
  const texto = (v) => (v == null ? "" : String(v));

  // Consome a autorização no servidor (a sessão do sistema vai pelo cookie da própria página).
  async function consumir(dados) {
    const a = dados?.autorizacao;
    if (!a || typeof a.token !== "string") return { erro: "Escrita sem a autorização do sistema." };
    const alvo = { id: texto(dados.id), numero: texto(dados.numero), ano: dados.ano ? texto(dados.ano) : null, descricao: texto(dados.descricao) };
    try {
      const r = await fetch(new URL("/api/admin/automacao/autorizacoes/consumir", origem), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: a.token, capacidade: "anexar", alvo }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) return { erro: `Autorização recusada pelo sistema: ${j?.error ?? `erro ${r.status}`}` };
      return { autorizado: { execucaoId: j.execucaoId, chave: j.chave, ...alvo } };
    } catch {
      return { erro: "Não consegui conferir a autorização no sistema (rede)." };
    }
  }

  async function levar(acao, dados) {
    if (acao !== "anexar") return { acao, dados };
    const c = await consumir(dados);
    if (c.erro) return { resposta: { ok: false, erro: c.erro } };
    const { autorizacao: _token, ...semToken } = dados;
    return { acao, dados: semToken, autorizado: c.autorizado };
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== origem) return;
    const m = e.data;
    if (m?.fonte !== "pca-automacao") return;
    if (m.tipo === "ola") return anunciar();
    if (m.v && m.v !== V) return;
    levar(m.acao, m.dados).then((x) => {
      if (x.resposta) return responder(m.id, x.resposta);
      try {
        chrome.runtime.sendMessage({ acao: x.acao, dados: x.dados, autorizado: x.autorizado }, (resposta) => {
          const erro = chrome.runtime.lastError;
          responder(m.id, erro ? { ok: false, erro: erro.message } : (resposta ?? { ok: false, erro: "Sem resposta da extensão." }));
        });
      } catch {
        /* cópia antiga sem a extensão: a página usa a ponte nova */
      }
    });
  });
  anunciar();
})();
