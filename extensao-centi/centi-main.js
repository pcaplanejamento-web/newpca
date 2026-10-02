// Roda DENTRO da página da Centi (extensão "fina"): guarda os cabeçalhos que a própria Centi usa na API (sessão da aba,
// entidade, mês) e executa, com eles, o pedido que a aba Automação manda. A LÓGICA (montar o Emitir DFD, ler a resposta,
// achar o PDF) mora no sistema — atualiza sem reinstalar a extensão. Aqui ficam só as TRAVAS: só a Centi, só leitura
// (GET) da API e, para POST, só a operação "Emitir DFD" com não vincular/não assinar/não enviar forçados. A ÚNICA gravação
// é o ANEXO ("anexar"): abre o protocolo pelo load da própria Centi, confere Id + número, acrescenta UM documento novo
// (centi-anexo.js) e salva — o sistema nunca manda o objeto do protocolo.
(() => {
  const PROTOCOLO = 33;
  const MARCA = `__pcaCentiMain_p${PROTOCOLO}`;
  if (window[MARCA]) return;
  window[MARCA] = true;
  // Versão nova da chave: a sessão guardada pelas 1.3.8–1.3.17 trazia cabeçalhos acrescentados (token/Authorization).
  const SESSAO = "__pcaCentiSessao_v2";
  let base = "";
  let cabecalhos = null;
  // Os cabeçalhos que a PRÓPRIA tela da Centi usou no salvar (confirmsave/save) e ao abrir um protocolo (load do módulo
  // 102907): o salvar do anexo vai com eles — o último pedido da aba costuma ser de OUTRA tela (a pesquisa do DFD), com o
  // contexto dela. `nomesSalvar` = os NOMES (só os nomes) que a tela mandou no salvar, para o erro dizer o que faltou.
  let doSalvar = null;
  let doProtocolo = null;
  let nomesSalvar = null;
  let tipoSalvar = null;
  // O endereço EXATO (caminho + parâmetros) que a tela usou no confirmsave/save e a TRILHA dos pedidos dela antes de
  // salvar (só "MÉTODO caminho" — a sessão vai nos cabeçalhos, nunca na URL): o anexo usa o mesmo endereço e o erro mostra
  // a trilha (o passo que a tela faz e a extensão não).
  let urlsSalvar = {};
  // COMO a tela enviou o salvar: "xhr" | "fetch" — o anexo usa o mesmo meio (a proteção anti-robô da página assina os
  // pedidos dela pelo meio e pelo endereço COMO a tela os escreve; por isso o endereço guardado é o BRUTO).
  let viaSalvar = null;
  let trilha = [];
  let trilhaSalvar = null;
  // A OPERAÇÃO "Emitir DFD" que a tela da Centi usou por último nesta aba (ModuleKey, Guid, modelo de assinatura): a
  // extensão a pega SOZINHA quando alguém clica em Processar — o sistema se ajusta quando a Centi a muda.
  let operacaoTela = null;
  // As operações que a PRÓPRIA extensão está enviando pelo cliente da Centi — não são da tela, não se aprende delas.
  const proprias = new Set();
  // A sessão da Centi é POR ABA (sessionStorage): a última capturada vale também depois de um F5 ou de uma atualização.
  try {
    const salvo = JSON.parse(sessionStorage.getItem(SESSAO) || "null");
    if (salvo?.base && salvo?.cabecalhos) ({ base, cabecalhos } = salvo);
    if (salvo?.doSalvar) ({ doSalvar, nomesSalvar, tipoSalvar } = salvo);
    if (salvo?.urlsSalvar) ({ urlsSalvar, trilhaSalvar, viaSalvar } = salvo);
    if (salvo?.doProtocolo) doProtocolo = salvo.doProtocolo;
    if (salvo?.operacaoTela) operacaoTela = salvo.operacaoTela;
  } catch {}
  const IGNORAR = /^(content-type|accept|content-length|x-ts)/i;
  const SESSAO_CAB = /^(authorization|token|refreshtoken|company)$/i;

  function guardar(url, hs, metodo, via) {
    const u = String(url);
    const i = u.indexOf("/restauth/");
    if (i < 0) return;
    const limpos = {};
    for (const [k, v] of Object.entries(hs)) if (!IGNORAR.test(k)) limpos[k] = v;
    // A sessão da Centi vai num destes cabeçalhos (no "operation" capturado: Refreshtoken + Company + Month).
    if (!Object.keys(limpos).some((k) => SESSAO_CAB.test(k))) return;
    base = new URL(u.slice(0, i), location.href).href;
    cabecalhos = limpos;
    const caminho = u.slice(i);
    const passo = `${String(metodo || "GET").toUpperCase()} ${caminho.slice("/restauth/".length).slice(0, 160)}`;
    trilha = [...trilha, passo].slice(-12);
    const salvar = /^POST$/i.test(metodo || "") && caminho.match(/^\/restauth\/(confirmsave|save)(\?|$)/i);
    if (salvar) {
      doSalvar = limpos;
      nomesSalvar = Object.keys(hs).map((k) => k.toLowerCase()).sort();
      tipoSalvar = Object.entries(hs).find(([k]) => /^content-type$/i.test(k))?.[1] ?? null;
      urlsSalvar = { ...urlsSalvar, [salvar[1].toLowerCase()]: u };
      viaSalvar = via;
      if (salvar[1].toLowerCase() === "confirmsave") trilhaSalvar = trilha.slice(0, -1);
    } else if (/[?&]entity=102907(&|$)/.test(caminho)) doProtocolo = limpos;
    try {
      sessionStorage.setItem(SESSAO, JSON.stringify({ base, cabecalhos, doSalvar, nomesSalvar, tipoSalvar, doProtocolo, urlsSalvar, trilhaSalvar, viaSalvar, operacaoTela }));
    } catch {}
  }

  // Os cabeçalhos do salvar: os da tela (salvar › protocolo › último pedido) com a SESSÃO sempre a mais recente.
  function cabecalhosDoSalvar() {
    const contexto = doSalvar ?? doProtocolo ?? cabecalhos;
    const sessao = Object.fromEntries(Object.entries(cabecalhos).filter(([k]) => SESSAO_CAB.test(k) || /^month$/i.test(k)));
    const r = {};
    for (const [k, v] of Object.entries(contexto)) if (!Object.keys(sessao).some((s) => s.toLowerCase() === k.toLowerCase())) r[k] = v;
    return { ...r, ...sessao };
  }

  // O TOKEN da Centi TROCA a cada resposta: o servidor devolve "token" e "refreshtoken" novos e a tela passa a usá-los
  // (Authorization = "Bearer <token>"). A extensão acompanha — lê o token novo de TODA resposta (da tela e dela) e sempre
  // manda o mais recente; com o antigo, o salvar dava "Erro inesperado" (500) e as renovações forçadas, 429.
  function trocarToken(ler) {
    const A = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`];
    if (!cabecalhos || !A) return;
    const novo = A.comTokenNovo(cabecalhos, ler("token"), ler("refreshtoken"));
    if (novo === cabecalhos) return;
    cabecalhos = novo;
    try {
      sessionStorage.setItem(SESSAO, JSON.stringify({ base, cabecalhos, doSalvar, nomesSalvar, tipoSalvar, doProtocolo, urlsSalvar, trilhaSalvar, viaSalvar, operacaoTela }));
    } catch {}
  }
  const tokenDoXhr = (x) => (n) => {
    try {
      return x.getResponseHeader(n) || null;
    } catch {
      return null;
    }
  };

  // A tela da Centi mandou um "Emitir DFD" (o operation do Processar): guarda a operação dela.
  function aprenderOperacao(url, metodo, corpo) {
    try {
      if (!/^POST$/i.test(metodo || "") || !/\/restauth\/operation(\?|$)/.test(String(url))) return;
      const pecas = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`];
      const op = pecas?.operacaoDoCorpo(corpo);
      if (!op || proprias.has(`${op.moduleKey}|${op.guid}`)) return;
      operacaoTela = { ...op, em: new Date().toISOString() };
      sessionStorage.setItem(SESSAO, JSON.stringify({ base, cabecalhos, doSalvar, nomesSalvar, tipoSalvar, doProtocolo, urlsSalvar, trilhaSalvar, viaSalvar, operacaoTela }));
    } catch {}
  }

  // GRAVADOR de receitas (o ADM liga, faz a ação na tela da Centi, para): só a ESTRUTURA de cada pedido (nunca valores),
  // guardada na aba (sessionStorage) — até 300 passos.
  const GRAVADOR = "__pcaGravador_v1";
  const lerGravador = () => {
    try {
      const g = JSON.parse(sessionStorage.getItem(GRAVADOR) || "null");
      return g && Array.isArray(g.passos) ? { ativo: g.ativo === true, passos: g.passos } : { ativo: false, passos: [] };
    } catch {
      return { ativo: false, passos: [] };
    }
  };
  function gravarPasso(url, metodo, corpo) {
    try {
      const g = lerGravador();
      if (!g.ativo || g.passos.length >= 300) return;
      const e = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`]?.estruturaDoPedido(url, metodo, corpo);
      if (!e) return;
      g.passos.push({ ...e, em: new Date().toISOString() });
      sessionStorage.setItem(GRAVADOR, JSON.stringify(g));
    } catch {}
  }
  function gravador(d) {
    const g = lerGravador();
    if (d?.acao === "iniciar") sessionStorage.setItem(GRAVADOR, JSON.stringify({ ativo: true, passos: [] }));
    else if (d?.acao === "parar") sessionStorage.setItem(GRAVADOR, JSON.stringify({ ativo: false, passos: g.passos }));
    else if (d?.acao === "limpar") sessionStorage.removeItem(GRAVADOR);
    const atual = lerGravador();
    return { ok: true, gravando: atual.ativo, passos: atual.passos };
  }

  // APRENDER CLICANDO: o pedido COMPLETO de LEITURA que a tela faz (método, caminho, corpo — nunca cabeçalhos) + o resumo
  // da resposta, para o sistema repetir a consulta depois (a Tela Protocolo). Guardado na aba (sessionStorage), até 40.
  const APRENDIZ = "__pcaAprendiz_v1";
  // As OPERAÇÕES aprendidas que GERARAM UM ARQUIVO (um relatório da tela): só elas, além do Emitir DFD, podem ser
  // repetidas — com as travas forçadas. No localStorage da Centi (valem depois de reabrir a aba).
  const OPERACOES = "__pcaOperacoesArquivo_v1";
  let internos = 0; // pedidos da PRÓPRIA extensão pelo cliente da Centi — não se aprende deles
  const lerAprendiz = () => {
    try {
      const g = JSON.parse(sessionStorage.getItem(APRENDIZ) || "null");
      return g && Array.isArray(g.pedidos) ? { ativo: g.ativo === true, pedidos: g.pedidos } : { ativo: false, pedidos: [] };
    } catch {
      return { ativo: false, pedidos: [] };
    }
  };
  const operacoesAprendidas = () => {
    try {
      const l = JSON.parse(localStorage.getItem(OPERACOES) || "[]");
      return Array.isArray(l) ? l.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  function aprenderResposta(url, metodo, corpo, status, tipo, texto) {
    try {
      if (internos > 0) return;
      const g = lerAprendiz();
      if (!g.ativo) return;
      const r = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`]?.registroDoAprendiz(url, metodo, corpo, status, tipo, texto);
      if (!r) return;
      const igual = (x) => x.tipo === r.tipo && x.metodo === r.metodo && x.caminho === r.caminho && JSON.stringify(x.corpo ?? null) === JSON.stringify(r.corpo ?? null);
      const pedidos = [...g.pedidos.filter((x) => !igual(x)), { ...r, em: new Date().toISOString() }].slice(-40);
      sessionStorage.setItem(APRENDIZ, JSON.stringify({ ativo: true, pedidos }));
    } catch {}
  }
  const textoDoXhr = (x) => {
    try {
      if (x.responseType === "" || x.responseType === "text") return x.responseText;
      if (x.responseType === "json") return JSON.stringify(x.response);
      if (x.responseType === "arraybuffer" && x.response && x.response.byteLength <= 8 * 1024 * 1024) return new TextDecoder().decode(x.response);
    } catch {}
    return null;
  };
  function aprender(d) {
    const g = lerAprendiz();
    if (d?.acao === "iniciar") sessionStorage.setItem(APRENDIZ, JSON.stringify({ ativo: true, pedidos: [] }));
    else if (d?.acao === "parar") {
      sessionStorage.setItem(APRENDIZ, JSON.stringify({ ativo: false, pedidos: g.pedidos }));
      // A operação que gerou um arquivo passa a poder ser repetida (com as travas).
      const A = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`];
      const novas = g.pedidos.filter((x) => x.tipo === "operacao").map((x) => A?.chaveOperacao(x.corpo)).filter(Boolean);
      if (novas.length) localStorage.setItem(OPERACOES, JSON.stringify([...new Set([...operacoesAprendidas(), ...novas])].slice(-20)));
    } else if (d?.acao === "limpar") sessionStorage.removeItem(APRENDIZ);
    const atual = lerAprendiz();
    return { ok: true, aprendendo: atual.ativo, pedidos: atual.pedidos };
  }

  // EMISSÃO ACOMPANHADA (Tela Protocolo → Operações → Emitir documentos, clicado pela centi-tela.js): enquanto ligada, o
  // operation que a PRÓPRIA tela da Centi manda vai com as TRAVAS forçadas (não anexa, não assina, não envia) e a resposta
  // dele é guardada, assim como o PDF que a tela prepara (Blob) e o endereço que ela tentaria abrir (window.open) — sem
  // abrir janela nenhuma. Desligada, a página segue exatamente como antes.
  let captura = null;
  const ehOperacao = (url, metodo) => /^POST$/i.test(metodo || "") && /\/restauth\/operation(\?|$)/.test(String(url));
  const ehPdfBytes = (b) => b && b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  function bytesDoXhr(x) {
    try {
      if (x.responseType === "" || x.responseType === "text") return new TextEncoder().encode(String(x.responseText ?? ""));
      if (x.responseType === "json") return new TextEncoder().encode(JSON.stringify(x.response ?? null));
      if (x.responseType === "arraybuffer" && x.response) return new Uint8Array(x.response);
    } catch {}
    return null;
  }
  function guardarEmissao(cap, status, tipo, bytes, corpo) {
    if (cap && bytes) cap.respostas = [...cap.respostas, { status, tipo: String(tipo || ""), bytes, corpo }].slice(-6);
  }
  // O ARQUIVO que a própria tela baixa na emissão (getbinlink…): os bytes ficam guardados — a chave pode valer UMA vez.
  const ehArquivoUrl = (u) => {
    try {
      return /\/(restauth|rest)\/(getbinlink|getbincache|getbin|getfile)\//i.test(new URL(String(u), location.href).pathname);
    } catch {
      return false;
    }
  };
  function guardarArquivo(cap, status, bytes) {
    if (cap && bytes && status < 400) cap.arquivos = [...cap.arquivos, bytes].slice(-4);
  }
  const ehZipBytes = (b) => b && b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  const criarUrl = URL.createObjectURL;
  URL.createObjectURL = function (o, ...r) {
    const u = criarUrl.call(this, o, ...r);
    try {
      if (captura && o instanceof Blob) captura.blobs = [...captura.blobs, o].slice(-6);
    } catch {}
    return u;
  };
  // O link de download que a tela clicaria (um <a download> com o arquivo): anotado, sem baixar nada no navegador.
  const clicarLink = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...r) {
    if (captura && this.href && (this.href.startsWith("blob:") || ehArquivoUrl(this.href))) {
      captura.urls.push(this.href);
      return;
    }
    return clicarLink.apply(this, r);
  };
  const abrirJanela = window.open;
  window.open = function (url, ...r) {
    if (!captura) return abrirJanela.call(this, url, ...r);
    const cap = captura;
    if (url) cap.urls.push(String(url));
    // Uma "janela" que só anota o endereço que a tela quis mostrar.
    const loc = {};
    Object.defineProperty(loc, "href", { set: (v) => cap.urls.push(String(v)), get: () => "" });
    return { closed: false, close() {}, focus() {}, location: loc, document: { open() {}, write() {}, close() {} } };
  };
  async function capturaEmissao(d) {
    if (d?.acao === "iniciar") {
      captura = { respostas: [], blobs: [], urls: [], arquivos: [] };
      return { ok: true };
    }
    if (d?.acao === "parar") {
      captura = null;
      return { ok: true };
    }
    const cap = captura;
    if (!cap) return { ok: false, erro: "A emissão não está sendo acompanhada." };
    const urls = [...cap.urls, ...(Array.isArray(d?.urls) ? d.urls.map(String) : [])].slice(-12);
    // O operation da tela que gerou o arquivo: vai junto (o sistema aprende a emissão "por código") e passa a poder ser
    // repetido por esta extensão (com as travas) — como uma operação aprendida.
    const P = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`];
    const texto = (b) => (b.length <= 8 * 1024 * 1024 ? new TextDecoder().decode(b) : "");
    const comArquivo = [...cap.respostas].reverse().find((x) => x.status < 400 && (ehPdfBytes(x.bytes) || ehZipBytes(x.bytes) || P?.respostaComArquivo(x.tipo, texto(x.bytes))));
    let operacao = null;
    try {
      operacao = comArquivo?.corpo ? JSON.parse(comArquivo.corpo) : null;
      const chave = operacao && P?.chaveOperacao(operacao);
      if (chave) localStorage.setItem(OPERACOES, JSON.stringify([...new Set([...operacoesAprendidas(), chave])].slice(-20)));
    } catch {}
    const doc = (bytes) => ({ ok: true, pronto: true, pdf: emBase64(bytes), operacao });
    // 1) O arquivo que a tela preparou (Blob), baixou (getbinlink) ou mostraria (endereço blob:) — PDF ou ZIP.
    for (const b of [...cap.blobs].reverse()) {
      const bytes = new Uint8Array(await b.arrayBuffer());
      if (ehPdfBytes(bytes) || ehZipBytes(bytes)) return doc(bytes);
    }
    for (const bytes of [...cap.arquivos].reverse()) if (ehPdfBytes(bytes) || ehZipBytes(bytes)) return doc(bytes);
    for (const u of urls.filter((x) => x.startsWith("blob:"))) {
      try {
        const bytes = new Uint8Array(await (await buscar(u)).arrayBuffer());
        if (ehPdfBytes(bytes) || ehZipBytes(bytes)) return doc(bytes);
      } catch {}
    }
    // 2) A resposta do operation (o arquivo cru ou a CHAVE do arquivo gerado — o sistema o baixa pela chave).
    const r = comArquivo;
    if (r) return { ok: true, pronto: true, resposta: { status: r.status, b64: emBase64(r.bytes) }, operacao };
    // 3) O endereço do arquivo (getbinlink…) que a tela abriria.
    const link = urls.find((u) => {
      try {
        return ARQUIVO.test(new URL(u, location.href).pathname);
      } catch {
        return false;
      }
    });
    if (link) return { ok: true, pronto: true, link, operacao };
    const erro = [...cap.respostas].reverse().find((x) => x.status >= 400 || !P?.respostaComArquivo(x.tipo, texto(x.bytes)));
    return {
      ok: true,
      pronto: false,
      vistos: { operacoes: cap.respostas.length, blobs: cap.blobs.length, enderecos: urls.map((u) => u.slice(0, 80)) },
      ...(erro ? { ultima: { status: erro.status, b64: emBase64(erro.bytes.subarray(0, 4000)) } } : {}),
    };
  }

  const abrir = XMLHttpRequest.prototype.open;
  const definir = XMLHttpRequest.prototype.setRequestHeader;
  const enviar = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...r) {
    this.__pcaUrl = url;
    this.__pcaMetodo = m;
    this.__pcaHs = {};
    return abrir.call(this, m, url, ...r);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__pcaHs) this.__pcaHs[k] = v;
    return definir.call(this, k, v);
  };
  XMLHttpRequest.prototype.send = function (...r) {
    if (captura && this.__pcaUrl && !this.__pcaInterno && ehOperacao(this.__pcaUrl, this.__pcaMetodo)) {
      r[0] = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`]?.travarCorpoOperacao(r[0]) ?? r[0];
      const cap = captura;
      const corpo = typeof r[0] === "string" ? r[0] : null;
      this.addEventListener("load", () => guardarEmissao(cap, this.status, this.getResponseHeader("content-type"), bytesDoXhr(this), corpo));
    }
    if (captura && this.__pcaUrl && !this.__pcaInterno && ehArquivoUrl(this.__pcaUrl)) {
      const cap = captura;
      this.addEventListener("load", () => {
        if (this.responseType === "blob" && this.response instanceof Blob) cap.blobs = [...cap.blobs, this.response].slice(-6);
        else guardarArquivo(cap, this.status, bytesDoXhr(this));
      });
    }
    if (this.__pcaUrl && !this.__pcaInterno) {
      guardar(this.__pcaUrl, this.__pcaHs || {}, this.__pcaMetodo, "xhr");
      aprenderOperacao(this.__pcaUrl, this.__pcaMetodo, r[0]);
      gravarPasso(this.__pcaUrl, this.__pcaMetodo, r[0]);
    }
    if (this.__pcaUrl && String(this.__pcaUrl).includes("/restauth/")) this.addEventListener("load", () => trocarToken(tokenDoXhr(this)));
    if (this.__pcaUrl && !this.__pcaInterno && internos === 0 && lerAprendiz().ativo) {
      const url = this.__pcaUrl;
      const metodo = this.__pcaMetodo;
      this.addEventListener("load", () => aprenderResposta(url, metodo, r[0], this.status, this.getResponseHeader("content-type"), textoDoXhr(this)));
    }
    return enviar.apply(this, r);
  };
  const buscar = window.fetch;
  window.fetch = function (rec, init, ...resto) {
    const comToken = (p) =>
      p.then((r) => {
        try {
          if (String(r.url || "").includes("/restauth/")) trocarToken((n) => r.headers.get(n));
        } catch {}
        return r;
      });
    if (init?.__pcaInterno) return comToken(buscar.call(this, rec, init, ...resto));
    try {
      const url0 = typeof rec === "string" ? rec : rec?.url;
      const metodo0 = init?.method || (typeof rec === "object" ? rec.method : "GET");
      if (captura && ehOperacao(url0, metodo0) && init) {
        const cap = captura;
        const travado = { ...init, body: globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`]?.travarCorpoOperacao(init.body) ?? init.body };
        return comToken(buscar.call(this, rec, travado, ...resto)).then((resp) => {
          resp
            .clone()
            .arrayBuffer()
            .then((b) => guardarEmissao(cap, resp.status, resp.headers.get("content-type"), new Uint8Array(b), typeof travado.body === "string" ? travado.body : null))
            .catch(() => {});
          return resp;
        });
      }
      if (captura && ehArquivoUrl(url0)) {
        const cap = captura;
        return comToken(buscar.call(this, rec, init, ...resto)).then((resp) => {
          resp
            .clone()
            .arrayBuffer()
            .then((b) => guardarArquivo(cap, resp.status, new Uint8Array(b)))
            .catch(() => {});
          return resp;
        });
      }
    } catch {}
    try {
      const url = typeof rec === "string" ? rec : rec?.url;
      const hs = new Headers(init?.headers || (typeof rec === "object" ? rec.headers : undefined));
      const metodo = init?.method || (typeof rec === "object" ? rec.method : "GET");
      guardar(url, Object.fromEntries(hs.entries()), metodo, "fetch");
      aprenderOperacao(url, metodo, init?.body);
      gravarPasso(url, metodo, init?.body);
      if (internos === 0 && lerAprendiz().ativo)
        return comToken(buscar.call(this, rec, init, ...resto)).then((r) => {
          r.clone()
            .text()
            .then((t) => aprenderResposta(url, metodo, init?.body, r.status, r.headers.get("content-type"), t))
            .catch(() => {});
          return r;
        });
    } catch {}
    return comToken(buscar.call(this, rec, init, ...resto));
  };

  const TRAVAS = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`]?.TRAVAS ?? {};
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Os endereços do ARQUIVO gerado pelo Emitir DFD (os únicos que a leitura alcança).
  const ARQUIVO = /\/(restauth|rest)\/(getbinlink|getbincache|getbin|getfile)\//i;

  function emBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // O destino tem de ser a API da Centi desta aba (mesma origem, dentro de /restauth/ ou /rest/).
  function destino(caminho) {
    const u = new URL(caminho, `${base}/`);
    if (u.origin !== location.origin || !/\/(restauth|rest)\//.test(u.pathname)) return null;
    return u.href;
  }

  // A ENTIDADE aberta na aba (o cabeçalho Company que a própria Centi manda — muda quando se troca a entidade lá).
  const nomeEntidade = () => (cabecalhos ? Object.keys(cabecalhos).find((k) => /^company$/i.test(k)) : undefined);
  const entidadeAtual = () => {
    const k = nomeEntidade();
    return k ? String(cabecalhos[k]) : null;
  };

  function executar(metodo, url, corpo, entidade, comoTexto = false, cab = cabecalhos, tipo = "application/json", bruto = url, rastreioNovo = true) {
    return new Promise((ok, falha) => {
      const x = new XMLHttpRequest();
      x.__pcaInterno = true;
      x.open(metodo, bruto);
      x.responseType = comoTexto ? "text" : "arraybuffer";
      const k = nomeEntidade();
      // O rastreio vai NOVO em cada pedido (como a tela gera) — nunca o identificador de um pedido antigo.
      const hs = A && rastreioNovo ? A.renovarRastreio(cab, () => crypto.randomUUID(), Date.now(), Math.random) : cab;
      for (const [n, v] of Object.entries(hs)) x.setRequestHeader(n, entidade && n === k ? entidade : v);
      if (entidade && !k) x.setRequestHeader("Company", entidade);
      if (corpo) x.setRequestHeader("Content-Type", tipo);
      x.setRequestHeader("Accept", "application/json, text/plain, */*");
      x.onload = () => {
        // O token novo desta resposta vale JÁ para o próximo pedido (antes de a sequência continuar).
        trocarToken(tokenDoXhr(x));
        return ok(
          comoTexto
            ? { status: x.status, texto: String(x.response ?? ""), enviados: Object.keys(x.__pcaHs || {}) }
            : { ok: true, status: x.status, tipo: x.getResponseHeader("content-type") || "", b64: emBase64(new Uint8Array(x.response || new ArrayBuffer(0))) },
        );
      };
      x.onerror = () => falha(new Error("Sem resposta da Centi (rede)."));
      x.timeout = comoTexto ? 280000 : 120000;
      x.ontimeout = () => falha(new Error("A Centi demorou demais para responder."));
      x.send(corpo ? JSON.stringify(corpo) : null);
    });
  }

  // O salvar pelo FETCH da página (o mesmo meio da tela): passa pelos envoltórios que a página pôs no fetch.
  async function executarFetch(metodo, bruto, corpo, cab, tipo) {
    const hs = { ...(A ? A.renovarRastreio(cab, () => crypto.randomUUID(), Date.now(), Math.random) : cab), Accept: "application/json, text/plain, */*" };
    if (corpo) hs["Content-Type"] = tipo;
    const r = await window.fetch(bruto, { method: metodo, headers: hs, body: corpo ? JSON.stringify(corpo) : undefined, credentials: "include", __pcaInterno: true });
    return { status: r.status, texto: await r.text(), enviados: Object.keys(hs) };
  }

  async function pedir(d) {
    if (!cabecalhos) return { ok: false, erro: "Centi sem sessão: na aba da Centi já logada, clique em Pesquisar." };
    const url = destino(String(d?.caminho || ""));
    if (!url) return { ok: false, erro: "Destino fora da API da Centi." };
    // A entidade (órgão) do DFD, quando difere da aberta na aba: só um código simples, só neste pedido.
    const ent = d.entidade == null || d.entidade === "" ? null : String(d.entidade);
    if (ent !== null && !/^[\w.-]{1,40}$/.test(ent)) return { ok: false, erro: "Entidade inválida." };
    // A EMISSÃO vai com os cabeçalhos da aba EXATAMENTE como a tela os mandou (como na 1.2.0, quando funcionava) — sem
    // renovar o rastreio (que é só do salvar do anexo).
    // TRAVA: a leitura (GET) só baixa o ARQUIVO gerado (getbinlink/GetBinCache/getbin/getfile) — nenhum outro endereço da API.
    if (d.metodo === "GET") {
      if (!ARQUIVO.test(new URL(url).pathname)) return { ok: false, erro: "Só o download do PDF gerado é permitido." };
      return (await binarioPelaCenti("GET", url, null, ent)) ?? executar("GET", url, null, ent, false, cabecalhos, "application/json", url, false);
    }
    if (d.metodo !== "POST" || !/\/restauth\/operation$/.test(new URL(url).pathname)) return { ok: false, erro: "Só a operação Emitir DFD é permitida." };
    const c = d.corpo;
    if (!c || !GUID.test(String(c.Guid)) || !Number.isInteger(c.ModuleKey) || !Array.isArray(c.Params)) return { ok: false, erro: "Pedido inválido." };
    // TRAVA: só a operação com a FORMA do Emitir DFD (IdComprasPlanejamento + DFD=1) ou uma operação APRENDIDA nesta Centi
    // que gerou um arquivo (o relatório da Tela Protocolo) — nenhuma outra operação da Centi.
    if (!A?.operacaoDoCorpo(c) && !operacoesAprendidas().includes(A?.chaveOperacao(c)))
      return { ok: false, erro: "Só a operação Emitir DFD ou uma emissão aprendida na Tela Protocolo é permitida." };
    const params = c.Params.map((p) => ({ Key: String(p.Key), Value: p.Key in TRAVAS ? TRAVAS[p.Key] : String(p.Value ?? "") }));
    for (const [Key, Value] of Object.entries(TRAVAS)) if (!params.some((p) => p.Key === Key)) params.push({ Key, Value });
    const corpo = { ModuleKey: c.ModuleKey, Guid: c.Guid, Params: params };
    return (await binarioPelaCenti("POST", url, corpo, ent)) ?? executar("POST", url, corpo, ent, false, cabecalhos, "application/json", url, false);
  }

  // A EMISSÃO e o download saem pelo CLIENTE HTTP DA PRÓPRIA CENTI — o MESMO caminho do anexo, que funciona: os
  // cabeçalhos, o token e o contexto são os que a tela usa naquele instante (não os do último pedido capturado na aba).
  // Só para a API /restauth/ (a base do cliente); sem o cliente ou sem resposta, null → o envio da extensão.
  async function binarioPelaCenti(metodo, url, corpo, ent) {
    const cli = acharClienteCenti();
    if (!cli) return null;
    const u = new URL(url);
    const i = u.pathname.indexOf("/restauth/");
    if (i < 0) return null;
    const rel = `${u.pathname.slice(i + "/restauth".length)}${u.search}`;
    const headers = {};
    if (ent !== null) headers[nomeEntidade() || "Company"] = ent;
    const resposta = (r) => {
      tokenNosClientes(cli, r.headers);
      const dados = r.data;
      // ArrayBuffer (ou visão dele) por FORMA, não por instanceof — vale também se vier de outro "realm".
      const binario = dados && typeof dados === "object" && typeof dados.byteLength === "number";
      const bytes = binario
        ? ArrayBuffer.isView(dados)
          ? new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
          : new Uint8Array(dados)
        : new TextEncoder().encode(typeof dados === "string" ? dados : JSON.stringify(dados ?? null));
      const tipo = (typeof r.headers?.get === "function" ? r.headers.get("content-type") : r.headers?.["content-type"]) || "";
      return { ok: true, status: r.status, tipo: String(tipo), b64: emBase64(bytes) };
    };
    const propria = corpo ? `${corpo.ModuleKey}|${String(corpo.Guid).toLowerCase()}` : null;
    if (propria) proprias.add(propria);
    internos++;
    try {
      return resposta(await cli.principal.request({ method: metodo, url: rel, data: corpo ?? undefined, headers, responseType: "arraybuffer" }));
    } catch (e) {
      return e?.response ? resposta(e.response) : null;
    } finally {
      internos--;
      if (propria) proprias.delete(propria);
    }
  }

  // JSON da API da Centi (load/confirmsave/save): HTTP de erro ou corpo que não é JSON → o motivo, nunca segue às cegas.
  const A = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`];
  // `passo` entra no erro (load/confirmsave/save): diz ONDE a Centi recusou.
  async function api(metodo, caminho, corpo, passo, salvar = false, bruto = caminho) {
    // O endereço bruto da tela é relativo à PÁGINA (como o navegador o resolve no open/fetch).
    const url = destino(bruto === caminho ? caminho : new URL(bruto, location.href).href);
    if (!url) throw new Error("Destino fora da API da Centi.");
    const cab = salvar ? cabecalhosDoSalvar() : cabecalhos;
    const tipo = (salvar && tipoSalvar) || "application/json";
    // O endereço vai ao open/fetch ESCRITO como a tela o escreveu (relativo ou completo).
    const r =
      salvar && viaSalvar === "fetch"
        ? await executarFetch(metodo, bruto, corpo, cab, tipo)
        : await executar(metodo, url, corpo, null, true, cab, tipo, salvar ? bruto : url);
    let j = null;
    try {
      j = JSON.parse(r.texto);
    } catch {}
    if (r.status >= 400 || !j) {
      const msg = `A Centi recusou o ${passo} (${r.status})${j ? `: ${A.mensagens(j.Message) || "sem mensagem"}` : "."}`;
      throw new Error(
        salvar
          ? [msg, A.dicaCabecalhos(nomesSalvar, r.enviados ?? Object.keys(cab), !!doProtocolo), A.dicaTrilha(trilhaSalvar, `${viaSalvar || "xhr"} ${caminho}`)].filter(Boolean).join(" ")
          : msg,
      );
    }
    return j;
  }

  // O CLIENTE HTTP DA PRÓPRIA CENTI (a instância do axios em ".../restauth" que a tela usa no load/confirmsave/save):
  // achado pelo FORMATO entre os módulos do webpack da página (nunca pelo número do módulo, que muda a cada publicação da
  // Centi). Por ele o pedido sai EXATAMENTE como o da tela — token, cabeçalhos, proteção anti-robô — e, como a tela faz
  // (a função "E" do código dela), o token novo de cada resposta passa a valer em todos os clientes dela.
  let clienteCenti = null;
  let motivoSemCliente = "";
  function acharClienteCenti() {
    if (clienteCenti) return clienteCenti;
    try {
      const nome = Object.keys(window).find((k) => k.startsWith("webpackJsonp") && Array.isArray(window[k]));
      if (!nome) {
        motivoSemCliente = "a página não expõe os módulos";
        return null;
      }
      let req = null;
      const id = `__pcaCenti${Date.now()}${Math.random().toString(36).slice(2)}`;
      window[nome].push([[id], { [id]: (_m, _e, r) => (req = r) }, [[id]]]);
      if (!req?.c) {
        motivoSemCliente = "sem acesso aos módulos da página";
        return null;
      }
      // Cada módulo e cada exportação lidos com proteção: uma exportação ainda não pronta (lança ao ler) não pode
      // interromper a busca inteira.
      const instancias = new Set();
      const lojas = new Set();
      const olhar = (v) => {
        if (typeof v === "function" && v.defaults && v.interceptors && typeof v.post === "function" && typeof v.get === "function") instancias.add(v);
        else if (v && typeof v === "object" && typeof v.getState === "function" && typeof v.dispatch === "function") lojas.add(v);
      };
      for (const chave of Object.keys(req.c)) {
        let ex;
        try {
          ex = req.c[chave]?.exports;
        } catch {
          continue;
        }
        if (!ex || (typeof ex !== "object" && typeof ex !== "function")) continue;
        try {
          olhar(ex);
        } catch {}
        let nomes = [];
        try {
          nomes = Object.keys(ex);
        } catch {}
        for (const n of nomes) {
          try {
            olhar(ex[n]);
          } catch {}
        }
      }
      const base = (v) => {
        try {
          return String(v.defaults.baseURL || "");
        } catch {
          return "";
        }
      };
      const todas = [...instancias];
      const daApi = todas.filter((v) => /\/restauth\/?$/.test(base(v)));
      // A da tela (load/confirmsave/save) é a sem tempo-limite próprio; as demais recebem o token junto.
      const principal = daApi.find((v) => !v.defaults.timeout) ?? daApi[0] ?? null;
      if (!principal) {
        motivoSemCliente = `nenhum cliente da API entre ${todas.length} encontrados`;
        return null;
      }
      // O ESTADO da tela (redux): a lista das entidades — o nome da entidade de um módulo, que o LoadObjectReference pede.
      const loja =
        [...lojas].find((l) => {
          try {
            return Array.isArray(l.getState()?.Entities);
          } catch {
            return false;
          }
        }) ?? null;
      clienteCenti = { principal, loja, todas: todas.filter((v) => /\/(restauth|vicenti)\/?$/.test(base(v))) };
    } catch (e) {
      motivoSemCliente = e?.message || "falha ao procurar";
    }
    return clienteCenti;
  }
  function tokenNosClientes(_cli, h) {
    const ler = (n) => (h && (typeof h.get === "function" ? h.get(n) : h[n])) || null;
    const token = ler("token");
    const refresh = ler("refreshtoken");
    // NUNCA escreve nos clientes da própria Centi (antes punha token/Authorization nos padrões deles e mudava a sessão da
    // página); a tela cuida do token dela. Só a cópia da extensão acompanha.
    if (!token && !refresh) return;
    trocarToken(ler);
  }
  /** Um pedido pelo cliente da Centi: { status, j } (j = o JSON da resposta), ou null sem o cliente. */
  async function pelaCenti(metodo, caminho, corpo) {
    const cli = acharClienteCenti();
    if (!cli) return null;
    const rel = `/${String(caminho).replace(/^\/?restauth\//, "")}`;
    internos++;
    try {
      const r = metodo === "GET" ? await cli.principal.get(rel) : await cli.principal.post(rel, corpo);
      tokenNosClientes(cli, r.headers);
      return { status: r.status, j: r.data };
    } catch (e) {
      const r = e?.response;
      if (!r) throw new Error(`Sem resposta da Centi (${e?.message || "rede"}).`);
      tokenNosClientes(cli, r.headers);
      return { status: r.status, j: r.data };
    } finally {
      internos--;
    }
  }
  /** A API da Centi: pelo cliente da própria tela; sem ele, pelo envio da extensão. */
  async function apiCenti(metodo, caminho, corpo, passo, salvar = false, bruto = caminho) {
    const r = await pelaCenti(metodo, caminho, corpo);
    if (!r) {
      try {
        return await api(metodo, caminho, corpo, passo, salvar, bruto);
      } catch (e) {
        throw new Error(`${e?.message || "Falha na Centi."} (cliente da Centi não encontrado: ${motivoSemCliente || "?"})`);
      }
    }
    const j = r.j && typeof r.j === "object" ? r.j : null;
    if (r.status >= 400 || !j) throw new Error(`A Centi recusou o ${passo} (${r.status})${j ? `: ${A.mensagens(j.Message) || "sem mensagem"}` : "."} (pelo cliente da Centi)`);
    return j;
  }

  /** O nome da entidade de um módulo (o que a tela manda no LoadObjectReference), pelo estado da tela; sem ele, null. */
  function entidadeDoModulo(cli, modulo) {
    try {
      const lista = cli?.loja?.getState()?.Entities ?? [];
      const e = lista.find((x) => String(x?.Key) === String(modulo));
      return e?.Value?.Name || null;
    } catch {
      return null;
    }
  }
  /** O TIPO do documento como a TELA o obtém ao escolhê-lo: o LoadObjectReference (registra a referência no servidor da
   * Centi — o salvar a procura), logo depois de abrir o protocolo. Sem como fazer igual, null. */
  async function tipoPorReferencia(d) {
    const cli = acharClienteCenti();
    const entidade = entidadeDoModulo(cli, A.MODULO_TIPO);
    if (!cli || !entidade) return null;
    const r = await pelaCenti("POST", "restauth/LoadObjectReference", { Items: [{ DisplayOnReference: [], Entity: entidade, Id: Number(d.tipo) }] });
    const lista = Array.isArray(r?.j) ? r.j : [];
    return A.tipoDoLoad({ Entity: lista.find((o) => o?.ModuleKey === A.MODULO_TIPO) ?? lista[0] }, d.tipo);
  }

  // Abre o protocolo pelo módulo que a Centi aceitar (102907, senão 102908 — o da Tela Protocolo): só segue ao próximo
  // quando a Centi não devolveu o protocolo; Id/número que não conferem param na hora.
  async function abrirProtocolo(d) {
    let ultimo = null;
    for (const modulo of A.MODULOS_PROTOCOLO) {
      const r = await apiCenti("GET", `restauth/load?entity=${modulo}&key=${d.id}`, null, "load do protocolo");
      const c = A.conferirProtocolo(r, d);
      if (!c.erro) return c.entidade;
      ultimo = c.erro;
      if (r?.Entity) break;
    }
    throw new Error(ultimo);
  }

  // Só LEITURA: o resumo do protocolo (o "Conferir" da tela).
  async function protocolo(d) {
    if (!A) return { ok: false, erro: "Extensão incompleta na aba da Centi — aperte F5 nela." };
    if (!cabecalhos) return { ok: false, erro: "Centi sem sessão: na aba da Centi já logada, clique em Pesquisar." };
    const erro = A.validarPedido({ ...d, tipo: "1", descricao: "x", arquivo: "x.pdf", pdf: "JVBER" });
    if (erro) return { ok: false, erro };
    return { ok: true, protocolo: A.resumoProtocolo(await abrirProtocolo(d)) };
  }

  // A ÚNICA gravação: UM documento novo no protocolo conferido. Já anexado (mesma descrição) → não anexa de novo. A Centi
  // pedindo confirmação (confirmsave) → devolve a pergunta; o save só com o "sim" do ADM (`aceitar`), nunca sozinha.
  async function anexar(d) {
    if (!A) return { ok: false, erro: "Extensão incompleta na aba da Centi — aperte F5 nela." };
    if (!cabecalhos) return { ok: false, erro: "Centi sem sessão: na aba da Centi já logada, clique em Pesquisar." };
    const erro = A.validarPedido(d);
    if (erro) return { ok: false, erro };
    // A MESMA sequência da tela ao anexar: abre o protocolo e, depois, obtém o tipo pelo LoadObjectReference (o que a
    // tela faz ao escolher o tipo). Sem o estado da tela para isso: o tipo por load ANTES de abrir o protocolo (um load
    // depois trocaria o protocolo aberto no servidor).
    const porReferencia = !!entidadeDoModulo(acharClienteCenti(), A.MODULO_TIPO);
    let tipo = porReferencia
      ? null
      : await apiCenti("GET", `restauth/load?entity=${A.MODULO_TIPO}&key=${d.tipo}`, null, "load do tipo")
          .then((t) => A.tipoDoLoad(t, d.tipo))
          .catch(() => null);
    const e = await abrirProtocolo(d);
    const ja = A.jaAnexado(e, d.descricao);
    if (ja) return { ok: true, jaAnexado: true, ...ja };
    if (porReferencia) tipo = await tipoPorReferencia(d).catch(() => null);
    const origemTipo = tipo ? (porReferencia ? "referência da tela" : "load") : "sem o registro do tipo";
    const corpo = A.montarSalvar(e, d, new Date(), crypto.randomUUID(), tipo);
    let conf;
    try {
      conf = await apiCenti("POST", "restauth/confirmsave", A.corpoConfirmar(corpo), "confirmsave", true, urlsSalvar.confirmsave || "restauth/confirmsave");
    } catch (err) {
      throw new Error(`${err?.message || "Falha no confirmsave."} [tipo: ${origemTipo}]`);
    }
    // Como a tela: a Centi pedindo confirmação → a pergunta vai ao ADM; só com o "sim" dele (`aceitar`) segue ao save.
    if (conf.Confirm === true && d.aceitar !== true) return { ok: false, confirmar: A.mensagens(conf.Message) || "A Centi pede confirmação para salvar." };
    const salvo = A.conferirSalvo(await apiCenti("POST", "restauth/save", corpo, "save", true, urlsSalvar.save || "restauth/save"), d);
    return salvo.erro ? { ok: false, erro: salvo.erro } : { ok: true, ...salvo };
  }

  // Só LEITURA: repete uma CONSULTA aprendida (a Tela Protocolo) — a trava confere o verbo (nunca salvar/excluir/tramitar).
  async function ler(d) {
    if (!A) return { ok: false, erro: "Extensão incompleta na aba da Centi — aperte F5 nela." };
    if (!cabecalhos) return { ok: false, erro: "Centi sem sessão: na aba da Centi já logada, clique em Pesquisar." };
    const metodo = String(d?.metodo || "").toUpperCase();
    const caminho = String(d?.caminho || "");
    if (!A.consultaPermitida(caminho, metodo)) return { ok: false, erro: "Só consultas (leitura) da Centi podem ser repetidas." };
    const corpo = metodo === "POST" ? (d.corpo ?? null) : null;
    if (corpo !== null && (typeof corpo !== "object" || JSON.stringify(corpo).length > 65536)) return { ok: false, erro: "Consulta inválida." };
    return { ok: true, j: await apiCenti(metodo, caminho, corpo, "consulta") };
  }

  // Os DADOS da grade da Tela Protocolo (Wijmo FlexGrid — o controle mora no elemento, "wj-Control"): TODAS as linhas da
  // página (a tela desenha só as visíveis), com o texto de cada coluna como a tela mostra e o Id do protocolo (dos dados
  // da linha). Só LEITURA, chamada pela ponte (centi-tela.js).
  const RE_ID = /^(id|idprotocolo|protocolo\.id|idprocesso)$/i;
  function gradeDaTela(d) {
    const A0 = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`];
    const norm = (t) =>
      String(t ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
    for (const host of document.querySelectorAll(".wj-flexgrid")) {
      if (!host.offsetWidth && !host.offsetHeight) continue;
      let g = null;
      try {
        g = host["wj-Control"];
      } catch {}
      if (!g?.columns || !g.rows || typeof g.getCellData !== "function") continue;
      const colunas = [];
      for (let c = 0; c < g.columns.length; c++) {
        const col = g.columns[c];
        colunas.push(col?.visible === false ? "" : norm(col?.header ?? col?.binding));
      }
      if (!colunas.includes("PROTOCOLO")) continue;
      const linhas = [];
      let chaves = null;
      for (let r = 0; r < g.rows.length && linhas.length < 5000; r++) {
        const row = g.rows[r];
        if (!row || row.dataItem == null || row.visible === false) continue;
        const valores = colunas.map((h, c) => {
          if (!h) return "";
          try {
            return String(g.getCellData(r, c, true) ?? "");
          } catch {
            return "";
          }
        });
        const plano = A0?.linhaPlana(row.dataItem) ?? {};
        chaves ??= Object.keys(plano).slice(0, 40);
        const k = Object.keys(plano).find((x) => RE_ID.test(x));
        linhas.push({ valores, id: k ? String(plano[k]).replace(/\D/g, "").slice(0, 12) : "" });
      }
      // A linha do protocolo pedido à vista (a tela só desenha as visíveis) — para o duplo clique nela.
      const mostrar = String(d?.mostrar ?? "").replace(/\D/g, "").replace(/^0+/, "");
      const cp = colunas.indexOf("PROTOCOLO");
      if (mostrar && typeof g.scrollIntoView === "function") {
        let i = -1;
        for (let r = 0; r < g.rows.length; r++) {
          let v = "";
          try {
            v = String(g.getCellData(r, cp, false) ?? "");
          } catch {}
          if (v.replace(/\D/g, "").replace(/^0+/, "") === mostrar) {
            i = r;
            break;
          }
        }
        if (i >= 0)
          try {
            g.scrollIntoView(i, cp);
          } catch {}
      }
      return { ok: true, colunas, linhas, chaves: chaves ?? [] };
    }
    return { ok: false };
  }

  const ACOES = { pedir, protocolo, anexar, gravador, aprender, ler, captura: capturaEmissao, grade: gradeDaTela };
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.data?.fonte !== "pca-centi-pedido" || e.data.p !== PROTOCOLO) return;
    const { id, acao, dados } = e.data;
    let resposta;
    try {
      resposta =
        acao === "estado"
          ? { ok: true, logado: !!cabecalhos, entidade: entidadeAtual(), operacao: operacaoTela }
          : Object.hasOwn(ACOES, acao)
            ? await ACOES[acao](dados)
            : { ok: false, erro: "Ação desconhecida." };
    } catch (err) {
      resposta = { ok: false, erro: err?.message || "Falha no pedido à Centi." };
    }
    window.postMessage({ fonte: "pca-centi-resposta", p: PROTOCOLO, id, resposta }, location.origin);
  });
})();
