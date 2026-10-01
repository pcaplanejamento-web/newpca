// Roda DENTRO da página da Centi: guarda os cabeçalhos que a própria Centi usa na API (token, entidade, mês) e repete o
// "Processar" do Emitir DFD com eles. Só a operação Emitir DFD, sempre com as TRAVAS (não vincula, não assina, não envia).
(() => {
  let base = "";
  let cabecalhos = null;
  const IGNORAR = /^(content-type|accept|content-length|x-ts)/i;

  function guardar(url, hs) {
    const u = String(url);
    const i = u.indexOf("/restauth/");
    if (i < 0) return;
    const limpos = {};
    for (const [k, v] of Object.entries(hs)) if (!IGNORAR.test(k)) limpos[k] = v;
    // A sessão da Centi vai num destes cabeçalhos (no "operation" capturado: Refreshtoken + Company + Month).
    if (!Object.keys(limpos).some((k) => /^(authorization|token|refreshtoken|company)$/i.test(k))) return;
    base = new URL(u.slice(0, i), location.href).href;
    cabecalhos = limpos;
  }

  const abrir = XMLHttpRequest.prototype.open;
  const definir = XMLHttpRequest.prototype.setRequestHeader;
  const enviar = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...r) {
    this.__pcaUrl = url;
    this.__pcaHs = {};
    return abrir.call(this, m, url, ...r);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__pcaHs) this.__pcaHs[k] = v;
    return definir.call(this, k, v);
  };
  XMLHttpRequest.prototype.send = function (...r) {
    if (this.__pcaUrl && !this.__pcaInterno) guardar(this.__pcaUrl, this.__pcaHs || {});
    return enviar.apply(this, r);
  };
  const buscar = window.fetch;
  window.fetch = function (rec, init, ...resto) {
    try {
      const url = typeof rec === "string" ? rec : rec?.url;
      const hs = new Headers(init?.headers || (typeof rec === "object" ? rec.headers : undefined));
      guardar(url, Object.fromEntries(hs.entries()));
    } catch {}
    return buscar.call(this, rec, init, ...resto);
  };

  const TRAVAS = { AnexarAoProtocolo: "0", AssinarDocumento: "0", Sign: "0", SendMail: "0", StorageReport: "0", Background: "0" };
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function emBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const ehPdf = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

  // Procura o PDF numa resposta JSON: base64 ("JVBER…" = "%PDF") ou um link de arquivo da Centi.
  function acharNoJson(o, prof = 0) {
    if (o == null || prof > 6) return null;
    if (typeof o === "string") {
      const s = o.replace(/^data:application\/pdf;base64,/, "");
      if (s.startsWith("JVBER")) return { b64: s };
      if (/getbinlink/i.test(s)) return { link: s };
      return null;
    }
    if (typeof o === "object") for (const v of Object.values(o)) {
      const r = acharNoJson(v, prof + 1);
      if (r) return r;
    }
    return null;
  }

  function pedir(metodo, url, corpo, tipo) {
    return new Promise((ok, falha) => {
      const x = new XMLHttpRequest();
      x.__pcaInterno = true;
      x.open(metodo, url);
      x.responseType = tipo;
      for (const [k, v] of Object.entries(cabecalhos)) x.setRequestHeader(k, v);
      if (corpo) x.setRequestHeader("Content-Type", "application/json");
      x.setRequestHeader("Accept", "application/json, text/plain, */*");
      x.onload = () => ok(x);
      x.onerror = () => falha(new Error("Sem resposta da Centi (rede)."));
      x.timeout = 120000;
      x.ontimeout = () => falha(new Error("A Centi demorou mais de 2 minutos."));
      x.send(corpo ? JSON.stringify(corpo) : null);
    });
  }

  async function emitir(corpo) {
    if (!cabecalhos) return { ok: false, erro: "Faça o login na Centi e abra qualquer tela (ex.: Planejamento)." };
    if (!corpo || !GUID.test(String(corpo.Guid)) || !Number.isInteger(corpo.ModuleKey) || !Array.isArray(corpo.Params))
      return { ok: false, erro: "Pedido inválido." };
    const params = corpo.Params.map((p) => (p.Key in TRAVAS ? { Key: p.Key, Value: TRAVAS[p.Key] } : p));
    const x = await pedir("POST", `${base}/restauth/operation`, { ModuleKey: corpo.ModuleKey, Guid: corpo.Guid, Params: params }, "arraybuffer");
    if (x.status === 401 || x.status === 403) return { ok: false, erro: "Sessão da Centi expirada — faça o login de novo na Centi." };
    const bytes = new Uint8Array(x.response || new ArrayBuffer(0));
    if (x.status >= 400) return { ok: false, erro: `A Centi respondeu ${x.status}.` };
    if (ehPdf(bytes)) return { ok: true, pdf: emBase64(bytes) };
    const texto = new TextDecoder().decode(bytes);
    // Diagnóstico: o começo da resposta (sem tokens) vai junto da falha, para ajustar o formato.
    const amostra = `${x.getResponseHeader("content-type") || "?"} · ${texto.slice(0, 300).replace(/"(Token|RefreshToken|Authorization)"\s*:\s*"[^"]*"/gi, '"$1":"***"')}`;
    let json;
    try {
      json = JSON.parse(texto);
    } catch {
      return { ok: false, erro: "Resposta da Centi sem PDF.", amostra };
    }
    if (json && typeof json === "object" && json.Captcha) return { ok: false, erro: "A Centi pediu CAPTCHA — emita este pela tela da Centi.", captcha: true };
    const achado = acharNoJson(json);
    if (achado?.b64) return { ok: true, pdf: achado.b64 };
    if (achado?.link) {
      const url = /^https?:/i.test(achado.link) ? achado.link : `${base}/restauth/${achado.link.replace(/^\/?(restauth\/)?/, "")}`;
      const y = await pedir("GET", url, null, "arraybuffer");
      const b = new Uint8Array(y.response || new ArrayBuffer(0));
      if (ehPdf(b)) return { ok: true, pdf: emBase64(b) };
    }
    const msg = json?.Message || json?.Mensagem || json?.Msg || json?.Error;
    return {
      ok: false,
      erro: typeof msg === "string" && msg ? msg : "Resposta da Centi sem PDF.",
      amostra,
    };
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.data?.fonte !== "pca-ponte") return;
    const { id, acao, dados } = e.data;
    let resposta;
    try {
      resposta = acao === "estado" ? { ok: true, logado: !!cabecalhos } : acao === "emitir" ? await emitir(dados) : { ok: false, erro: "Ação desconhecida." };
    } catch (err) {
      resposta = { ok: false, erro: err?.message || "Falha ao emitir." };
    }
    window.postMessage({ fonte: "pca-main", id, resposta }, location.origin);
  });
})();
