// Ponte na aba da Centi: extensão <-> script da página (centi-main.js, que usa a sessão da Centi).
// O LOGIN automático acontece AQUI (mundo isolado, com centi-login.js): o usuário e a senha chegam só do serviço da
// extensão e vão direto aos campos da tela — o script da página e o sistema PCA nunca os veem.
(() => {
  // Protocolo da conversa com o script da página (centi-main.js): só muda se o formato das mensagens mudar.
  const P = 34;
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
  // Sem resposta do script da página → falha clara, nunca espera infinita.
  const pedirPagina = (acao, dados, ms) =>
    new Promise((f) => {
      const id = ++seq;
      const t = setTimeout(() => {
        pendentes.delete(id);
        f({ ok: false, erro: "A aba da Centi não respondeu — aperte F5 nela." });
      }, ms);
      pendentes.set(id, { f, t });
      window.postMessage({ fonte: "pca-centi-pedido", p: P, id, acao, dados }, window.location.origin);
    });
  const L = () => globalThis.__pcaCentiLogin;
  const naTelaDeLogin = () => !!L()?.telaDeLogin(document);
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

  // A tela de login vale mais que a sessão guardada (a sessão caída deixa os cabeçalhos antigos para trás).
  async function estado() {
    const r = await pedirPagina("estado", null, 4000);
    if (naTelaDeLogin()) return { ...r, ok: true, logado: false, tela: "login" };
    return r;
  }

  async function entrar(usuario, senha) {
    const l = L();
    if (!l) return { resultado: "falha", erro: "Peça do login ausente — atualize a extensão." };
    const erroAntes = l.erroDeLogin(document);
    const r = l.preencherEEntrar(document, usuario, senha);
    if (r.startsWith("bloqueio:")) return { resultado: "bloqueio", erro: r.slice(9) };
    if (r !== "enviado") return { resultado: "falha", erro: r };
    let erroSumiu = !erroAntes;
    const fim = Date.now() + 15000;
    while (Date.now() < fim) {
      await esperar(600);
      const b = l.sinaisDeBloqueio(document);
      if (b) return { resultado: "bloqueio", erro: b };
      const erro = l.erroDeLogin(document);
      if (!erro) erroSumiu = true;
      else if (erroSumiu) return { resultado: "recusado", erro };
      if (!naTelaDeLogin()) {
        const e = await pedirPagina("estado", null, 3000);
        if (e?.logado) return { resultado: "ok" };
      }
    }
    return { resultado: naTelaDeLogin() ? "sem-resposta" : "ok" };
  }

  chrome.runtime.onMessage.addListener((msg, sender, responder) => {
    // O login só do SERVIÇO da extensão (sem aba de origem) — nunca de uma página.
    if (msg?.alvo === "centi-login") {
      if (sender.id !== chrome.runtime.id || sender.tab) return false;
      entrar(msg.usuario, msg.senha).then(responder, () => responder({ resultado: "falha", erro: "Falha ao preencher o login." }));
      return true;
    }
    if (msg?.alvo !== "centi") return false;
    // A TELA PROTOCOLO é operada AQUI (mundo isolado, centi-tela.js) pela própria interface — só leitura.
    if (msg.acao === "telaDepartamentos" || msg.acao === "telaEmAnalise" || msg.acao === "telaEmitir" || msg.acao === "telaPlanejamentos") {
      const t = globalThis.__pcaCentiTela;
      // `pagina` = a captura da emissão no script da página (o PDF que a própria Centi gera).
      if (!t) responder({ ok: false, erro: "Peça da Tela Protocolo ausente — atualize a extensão e aperte F5 na aba." });
      else t.executar(msg.acao, msg.dados, { doc: document, win: window, pagina: pedirPagina }).then(responder);
      return true;
    }
    if (msg.acao === "estado") estado().then(responder);
    else pedirPagina(msg.acao, msg.dados, 300000).then(responder);
    return true;
  });
})();
