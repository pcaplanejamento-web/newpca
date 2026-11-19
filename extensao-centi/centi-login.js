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
  // Na tela: com tamanho (o desabilitado também — o ENTRAR da Centi 4.0 fica desabilitado até preencher).
  const naTela = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects?.().length);
  const visivel = (el) => naTela(el) && !el.disabled;
  const lista = (doc, sel) => Array.from(doc.querySelectorAll(sel)).filter(visivel);
  const nomeDoCampo = (i) => norm([i.placeholder, i.name, i.id, i.getAttribute?.("aria-label"), i.getAttribute?.("autocomplete")].filter(Boolean).join(" "));
  const TIPOS_TEXTO = ["", "text", "email", "tel"];
  const ehTexto = (i) => TIPOS_TEXTO.includes(String(i.type ?? "").toLowerCase());
  // "Senha" visível pelo OLHO = um campo de texto com o nome de senha.
  const ehSenha = (i) => String(i.type ?? "").toLowerCase() === "password" || (ehTexto(i) && /\bSENHA\b|PASSWORD/.test(nomeDoCampo(i)));
  const ehUsuario = (i) => /USUARIO|LOGIN|\bUSER|CPF|MATRICULA|E-?MAIL/.test(nomeDoCampo(i)) && !ehSenha(i);
  // O botão ENTRAR pelo texto SÓ COM LETRAS ("ENTRAR" + um ícone com nome em texto também vale); "Entrar com o Google" não.
  const ACOES_LOGIN = ["ENTRAR", "ACESSAR", "LOGIN", "LOGAR"];
  const letras = (t) => norm(t).replace(/[^A-Z]/g, "");
  const textoBotao = (b) => b.textContent || b.value || b.getAttribute?.("aria-label") || "";
  const ehEntrar = (b) => {
    const n = norm(textoBotao(b));
    if (/GOOGLE|GOV\.?BR|CERTIFICADO|ESQUECEU/.test(n)) return false;
    const l = letras(textoBotao(b));
    return ACOES_LOGIN.some((a) => l === a || (l.startsWith(a) && l.length <= a.length + 16 && !/COM/.test(n)));
  };

  /** Os campos da tela de login (senha + usuário + o botão ENTRAR), ou null quando a aba não está nela. */
  function telaDeLogin(doc) {
    const campos = lista(doc, "input");
    const senhas = campos.filter(ehSenha);
    if (senhas.length !== 1) return null;
    const senha = senhas[0];
    // Os campos vêm na ORDEM do documento: o usuário = o de nome de usuário; senão o de texto imediatamente ANTES da senha
    // (nunca o 1º da página — uma busca no topo não recebe o usuário).
    const iSenha = campos.indexOf(senha);
    const textos = campos.filter((i) => ehTexto(i) && i !== senha);
    const usuario = textos.find(ehUsuario) ?? campos.slice(0, iSenha).filter(ehTexto).at(-1) ?? null;
    const botao = Array.from(doc.querySelectorAll("button, input[type=submit], input[type=button], a, [role=button]")).filter(naTela).find(ehEntrar);
    return usuario && botao ? { usuario, senha, botao } : null;
  }

  const textoDaPagina = (doc) => String(doc.body?.innerText ?? doc.body?.textContent ?? "");

  /** Algo que só uma pessoa resolve: captcha, código de verificação ou troca de senha. */
  function sinaisDeBloqueio(doc) {
    // Só o desafio À VISTA conta: o reCAPTCHA invisível (o selo "protected by reCAPTCHA") não pede nada a ninguém.
    const desafio = Array.from(doc.querySelectorAll("iframe")).filter(naTela).map((f) => String(f.src ?? ""));
    if (desafio.some((s) => /recaptcha\/api2\/(anchor|bframe)|hcaptcha|turnstile|challenges\.cloudflare/i.test(s))) return "captcha";
    if (lista(doc, "input[autocomplete=one-time-code]").length) return "codigo";
    if (lista(doc, "input").filter(ehSenha).length > 1) return "troca-de-senha";
    const t = textoDaPagina(doc);
    if (/n[aã]o sou um rob[oô]|resolva o captcha|digite o captcha/i.test(t)) return "captcha";
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
    entrar(t);
    return "enviado";
  }

  /** Toca em ENTRAR (habilitado); desabilitado, envia o formulário; sem formulário, Enter no campo da senha. */
  function entrar(t) {
    if (!t.botao.disabled && t.botao.getAttribute?.("aria-disabled") !== "true") {
      t.botao.click();
      return "clique";
    }
    const form = t.senha.form ?? t.senha.closest?.("form");
    if (form?.requestSubmit) {
      form.requestSubmit();
      return "formulario";
    }
    const Ev = t.senha.ownerDocument?.defaultView?.KeyboardEvent ?? g.KeyboardEvent;
    if (Ev) for (const tipo of ["keydown", "keypress", "keyup"]) t.senha.dispatchEvent(new Ev(tipo, { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    return "enter";
  }

  /** Ainda na tela com os campos preenchidos e o ENTRAR habilitado agora: toca de novo (o ENTRAR que habilitou depois). */
  function tocarEntrarDeNovo(doc) {
    const t = telaDeLogin(doc);
    if (!t || t.botao.disabled || !t.senha.value) return false;
    t.botao.click();
    return true;
  }

  g.__pcaCentiLogin = Object.freeze({ norm, telaDeLogin, sinaisDeBloqueio, erroDeLogin, preencherEEntrar, tocarEntrarDeNovo });
})();
