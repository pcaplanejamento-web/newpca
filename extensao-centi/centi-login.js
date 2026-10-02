// A TELA DE LOGIN da Centi (mundo ISOLADO da aba — o script da página não vê nada daqui). Peças puras sobre o DOM:
// reconhecer a tela, ler o erro, perceber um bloqueio (captcha, código, troca de senha) e preencher + ENTRAR.
// A senha chega SÓ do serviço da extensão (centi-ponte.js) e vai direto ao campo — nunca a postMessage/sessionStorage.
(() => {
  const g = globalThis;
  if (g.__pcaCentiLogin) return;
  const norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  const visivel = (el) => !!el && !el.disabled && !!(el.offsetWidth || el.offsetHeight || el.getClientRects?.().length);
  const lista = (doc, sel) => Array.from(doc.querySelectorAll(sel)).filter(visivel);

  /** Os campos da tela de login (senha + usuário + o botão ENTRAR), ou null quando a aba não está nela. */
  function telaDeLogin(doc) {
    const senhas = lista(doc, "input[type=password]");
    if (senhas.length !== 1) return null;
    const senha = senhas[0];
    const textos = lista(doc, "input").filter((i) => ["", "text", "email", "tel"].includes(String(i.type ?? "").toLowerCase()));
    const usuario = textos[0];
    const botao = lista(doc, "button, input[type=submit], input[type=button], [role=button]").find((b) => {
      const t = norm(b.textContent || b.value || b.getAttribute?.("aria-label"));
      return t === "ENTRAR" || t === "ACESSAR" || t === "LOGIN" || t === "LOGAR";
    });
    return usuario && botao ? { usuario, senha, botao } : null;
  }

  const textoDaPagina = (doc) => String(doc.body?.innerText ?? doc.body?.textContent ?? "");

  /** Algo que só uma pessoa resolve: captcha, código de verificação ou troca de senha. */
  function sinaisDeBloqueio(doc) {
    const iframes = Array.from(doc.querySelectorAll("iframe")).map((f) => String(f.src ?? ""));
    if (iframes.some((s) => /recaptcha|hcaptcha|turnstile|challenges\.cloudflare/i.test(s))) return "captcha";
    if (lista(doc, "input[autocomplete=one-time-code]").length) return "codigo";
    if (lista(doc, "input[type=password]").length > 1) return "troca-de-senha";
    const t = textoDaPagina(doc);
    if (/captcha|n[aã]o sou um rob[oô]/i.test(t)) return "captcha";
    if (/c[oó]digo de (verifica[cç][aã]o|seguran[cç]a|acesso)/i.test(t)) return "codigo";
    if (/senha (expirada|vencida)/i.test(t)) return "troca-de-senha";
    return null;
  }

  const ERRO =
    /((usu[aá]rio|login)\s+(e|ou|e\/ou)\s+senha\s+(inv[aá]lid|incorret|n[aã]o confere)[^\n.]*|senha\s+(inv[aá]lid|incorret)[^\n.]*|usu[aá]rio\s+(inv[aá]lid|n[aã]o\s+encontrad|bloquead|inativ|desativad)[^\n.]*|(conta|acesso)\s+bloquead[^\n.]*|credenciais\s+inv[aá]lid[^\n.]*)/i;
  /** A mensagem de erro visível do login (senha recusada), ou null. */
  function erroDeLogin(doc) {
    const m = textoDaPagina(doc).match(ERRO);
    return m ? m[0].trim().slice(0, 200) : null;
  }

  /** Valor pelo setter NATIVO + eventos — o framework da tela percebe a digitação. */
  function definirValor(el, v) {
    el.focus?.();
    let proto = Object.getPrototypeOf(el);
    let d = null;
    while (proto && !d) {
      d = Object.getOwnPropertyDescriptor(proto, "value") ?? null;
      proto = Object.getPrototypeOf(proto);
    }
    if (d?.set) d.set.call(el, v);
    else el.value = v;
    const Ev = el.ownerDocument?.defaultView?.Event ?? g.Event;
    el.dispatchEvent(new Ev("input", { bubbles: true }));
    el.dispatchEvent(new Ev("change", { bubbles: true }));
  }

  /** Preenche usuário e senha e toca em ENTRAR. Devolve "enviado" ou o motivo de não ter feito. */
  function preencherEEntrar(doc, usuario, senha) {
    if (typeof usuario !== "string" || !usuario || typeof senha !== "string" || !senha) return "Sem usuário ou senha.";
    const b = sinaisDeBloqueio(doc);
    if (b) return `bloqueio:${b}`;
    const t = telaDeLogin(doc);
    if (!t) return "A aba não está na tela de login.";
    definirValor(t.usuario, usuario);
    definirValor(t.senha, senha);
    t.botao.click();
    return "enviado";
  }

  g.__pcaCentiLogin = Object.freeze({ norm, telaDeLogin, sinaisDeBloqueio, erroDeLogin, preencherEEntrar });
})();
