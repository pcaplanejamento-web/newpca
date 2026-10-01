// Roda DENTRO da página da Centi: guarda os cabeçalhos que a própria Centi usa na API (token, entidade, mês) e repete o
// "Processar" do Emitir DFD com eles. Só a operação Emitir DFD, sempre com as TRAVAS (não vincula, não assina, não envia).
(() => {
  // Versão do protocolo/extensão: só responde à ponte da MESMA versão (uma cópia antiga que ficou na aba se cala).
  const VERSAO = "1.0.5";
  const MARCA = `__pcaCentiMain_${VERSAO}`;
  if (window[MARCA]) return;
  window[MARCA] = true;
  const SESSAO = "__pcaCentiSessao";
  let base = "";
  let cabecalhos = null;
  // A sessão da Centi é POR ABA (sessionStorage): a última capturada vale também depois de um F5 ou de uma atualização.
  try {
    const salvo = JSON.parse(sessionStorage.getItem(SESSAO) || "null");
    if (salvo?.base && salvo?.cabecalhos) ({ base, cabecalhos } = salvo);
  } catch {}
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
    try {
      sessionStorage.setItem(SESSAO, JSON.stringify({ base, cabecalhos }));
    } catch {}
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

  // Procura o PDF numa resposta JSON: base64 ("JVBER…" = "%PDF"), base64 gzip ("H4sI…"), vetor de bytes ou a CHAVE do
  // arquivo temporário da Centi ({ "File": { "Key", "FileName" } } — o "Processar" devolve assim e o arquivo é buscado
  // depois pela chave).
  function acharNoJson(o, prof = 0) {
    if (o == null || prof > 8) return null;
    if (typeof o === "string") {
      const s = o.replace(/^data:[^;]+;base64,/, "");
      if (s.startsWith("JVBER")) return { b64: s };
      if (s.startsWith("H4sI")) return { gzip: s };
      return null;
    }
    if (Array.isArray(o)) {
      if (o.length > 4 && o[0] === 37 && o[1] === 80 && o[2] === 68 && o[3] === 70) return { bytes: new Uint8Array(o) };
      for (const v of o) {
        const r = acharNoJson(v, prof + 1);
        if (r) return r;
      }
      return null;
    }
    if (typeof o === "object") {
      for (const v of Object.values(o)) {
        const r = acharNoJson(v, prof + 1);
        if (r) return r;
      }
      if (typeof o.Key === "string" && /^[0-9a-f-]{20,}$/i.test(o.Key)) return { chave: o.Key, nome: o.FileName || "arquivo.pdf", url: o.URL };
    }
    return null;
  }

  const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  async function gunzip(bytes) {
    const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }

  // O esqueleto da resposta (chaves e tipos; textos cortados) — para diagnosticar um formato novo sem expor dados.
  function esqueleto(o, prof = 0) {
    if (o == null || typeof o !== "object") return typeof o === "string" ? `${o.slice(0, 24)}${o.length > 24 ? `…(${o.length})` : ""}` : o;
    if (prof > 4) return "…";
    if (Array.isArray(o)) return [`(${o.length})`, ...o.slice(0, 2).map((v) => esqueleto(v, prof + 1))];
    const r = {};
    for (const [k, v] of Object.entries(o)) r[k] = /token|authorization/i.test(k) ? "***" : esqueleto(v, prof + 1);
    return r;
  }

  // Busca o arquivo temporário pela chave (os caminhos que a Centi usa para baixar binários).
  async function arquivoPelaChave(achado) {
    const n = encodeURIComponent(achado.nome);
    const k = encodeURIComponent(achado.chave);
    const urls = [
      achado.url,
      `${base}/restauth/getbinlink/${k}/${n}`,
      `${base}/restauth/getbinlink/${k}`,
      `${base}/rest/getbinlink/${k}/${n}`,
      `${base}/restauth/getbin/${k}`,
      `${base}/restauth/getfile/${k}`,
    ].filter(Boolean);
    for (const url of urls) {
      try {
        const y = await pedir("GET", new URL(url, location.href).href, null, "arraybuffer");
        if (y.status >= 400) continue;
        const b = new Uint8Array(y.response || new ArrayBuffer(0));
        if (ehPdf(b)) return b;
        // Pode vir um link (texto ou JSON) para o arquivo: segue uma vez.
        const t = new TextDecoder().decode(b).trim().replace(/^"|"$/g, "");
        let link = /^https?:|^\//.test(t) ? t : null;
        if (!link) {
          try {
            const j = JSON.parse(t);
            link = typeof j === "string" ? j : j?.URL || j?.Url || j?.Link || null;
          } catch {}
        }
        if (link) {
          const z = await pedir("GET", new URL(link, location.href).href, null, "arraybuffer");
          const c = new Uint8Array(z.response || new ArrayBuffer(0));
          if (ehPdf(c)) return c;
        }
      } catch {}
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
    let pdf = null;
    if (achado?.gzip) pdf = await gunzip(deBase64(achado.gzip));
    else if (achado?.bytes) pdf = achado.bytes;
    else if (achado?.chave) pdf = await arquivoPelaChave(achado);
    if (pdf && ehPdf(pdf)) return { ok: true, pdf: emBase64(pdf) };
    const msg = json?.Message || json?.Mensagem || json?.Msg || json?.Error;
    return {
      ok: false,
      erro: typeof msg === "string" && msg ? msg : achado?.chave ? "A Centi gerou o PDF, mas não consegui baixá-lo pela chave." : "Resposta da Centi sem PDF.",
      amostra: JSON.stringify(esqueleto(json)).slice(0, 1200),
    };
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.data?.fonte !== "pca-centi-pedido" || e.data.v !== VERSAO) return;
    const { id, acao, dados } = e.data;
    let resposta;
    try {
      resposta = acao === "estado" ? { ok: true, logado: !!cabecalhos } : acao === "emitir" ? await emitir(dados) : { ok: false, erro: "Ação desconhecida." };
    } catch (err) {
      resposta = { ok: false, erro: err?.message || "Falha ao emitir." };
    }
    window.postMessage({ fonte: "pca-centi-resposta", v: VERSAO, id, resposta }, location.origin);
  });
})();
