// Roda DENTRO da página da Centi (extensão "fina"): guarda os cabeçalhos que a própria Centi usa na API (sessão da aba,
// entidade, mês) e executa, com eles, o pedido que a aba Automação manda. A LÓGICA (montar o Emitir DFD, ler a resposta,
// achar o PDF) mora no sistema — atualiza sem reinstalar a extensão. Aqui ficam só as TRAVAS: só a Centi, só leitura
// (GET) da API e, para POST, só a operação "Emitir DFD" com não vincular/não assinar/não enviar forçados. A ÚNICA gravação
// é o ANEXO ("anexar"): abre o protocolo pelo load da própria Centi, confere Id + número, acrescenta UM documento novo
// (centi-anexo.js) e salva — o sistema nunca manda o objeto do protocolo.
(() => {
  const PROTOCOLO = 7;
  const MARCA = `__pcaCentiMain_p${PROTOCOLO}`;
  if (window[MARCA]) return;
  window[MARCA] = true;
  const SESSAO = "__pcaCentiSessao";
  let base = "";
  let cabecalhos = null;
  // Os cabeçalhos que a PRÓPRIA tela da Centi usou no salvar (confirmsave/save) e ao abrir um protocolo (load do módulo
  // 102907): o salvar do anexo vai com eles — o último pedido da aba costuma ser de OUTRA tela (a pesquisa do DFD), com o
  // contexto dela. `nomesSalvar` = os NOMES (só os nomes) que a tela mandou no salvar, para o erro dizer o que faltou.
  let doSalvar = null;
  let doProtocolo = null;
  let nomesSalvar = null;
  let tipoSalvar = null;
  // A sessão da Centi é POR ABA (sessionStorage): a última capturada vale também depois de um F5 ou de uma atualização.
  try {
    const salvo = JSON.parse(sessionStorage.getItem(SESSAO) || "null");
    if (salvo?.base && salvo?.cabecalhos) ({ base, cabecalhos } = salvo);
    if (salvo?.doSalvar) ({ doSalvar, nomesSalvar, tipoSalvar } = salvo);
    if (salvo?.doProtocolo) doProtocolo = salvo.doProtocolo;
  } catch {}
  const IGNORAR = /^(content-type|accept|content-length|x-ts)/i;
  const SESSAO_CAB = /^(authorization|token|refreshtoken|company)$/i;

  function guardar(url, hs, metodo) {
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
    if (/^POST$/i.test(metodo || "") && /^\/restauth\/(confirmsave|save)(\?|$)/i.test(caminho)) {
      doSalvar = limpos;
      nomesSalvar = Object.keys(hs).map((k) => k.toLowerCase()).sort();
      tipoSalvar = Object.entries(hs).find(([k]) => /^content-type$/i.test(k))?.[1] ?? null;
    } else if (/[?&]entity=102907(&|$)/.test(caminho)) doProtocolo = limpos;
    try {
      sessionStorage.setItem(SESSAO, JSON.stringify({ base, cabecalhos, doSalvar, nomesSalvar, tipoSalvar, doProtocolo }));
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
    if (this.__pcaUrl && !this.__pcaInterno) guardar(this.__pcaUrl, this.__pcaHs || {}, this.__pcaMetodo);
    return enviar.apply(this, r);
  };
  const buscar = window.fetch;
  window.fetch = function (rec, init, ...resto) {
    try {
      const url = typeof rec === "string" ? rec : rec?.url;
      const hs = new Headers(init?.headers || (typeof rec === "object" ? rec.headers : undefined));
      guardar(url, Object.fromEntries(hs.entries()), init?.method || (typeof rec === "object" ? rec.method : "GET"));
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

  function executar(metodo, url, corpo, entidade, comoTexto = false, cab = cabecalhos, tipo = "application/json") {
    return new Promise((ok, falha) => {
      const x = new XMLHttpRequest();
      x.__pcaInterno = true;
      x.open(metodo, url);
      x.responseType = comoTexto ? "text" : "arraybuffer";
      const k = nomeEntidade();
      for (const [n, v] of Object.entries(cab)) x.setRequestHeader(n, entidade && n === k ? entidade : v);
      if (entidade && !k) x.setRequestHeader("Company", entidade);
      if (corpo) x.setRequestHeader("Content-Type", tipo);
      x.setRequestHeader("Accept", "application/json, text/plain, */*");
      x.onload = () =>
        ok(
          comoTexto
            ? { status: x.status, texto: String(x.response ?? "") }
            : { ok: true, status: x.status, tipo: x.getResponseHeader("content-type") || "", b64: emBase64(new Uint8Array(x.response || new ArrayBuffer(0))) },
        );
      x.onerror = () => falha(new Error("Sem resposta da Centi (rede)."));
      x.timeout = comoTexto ? 280000 : 120000;
      x.ontimeout = () => falha(new Error("A Centi demorou demais para responder."));
      x.send(corpo ? JSON.stringify(corpo) : null);
    });
  }

  async function pedir(d) {
    if (!cabecalhos) return { ok: false, erro: "Centi sem sessão: na aba da Centi já logada, clique em Pesquisar." };
    const url = destino(String(d?.caminho || ""));
    if (!url) return { ok: false, erro: "Destino fora da API da Centi." };
    // A entidade (órgão) do DFD, quando difere da aberta na aba: só um código simples, só neste pedido.
    const ent = d.entidade == null || d.entidade === "" ? null : String(d.entidade);
    if (ent !== null && !/^[\w.-]{1,40}$/.test(ent)) return { ok: false, erro: "Entidade inválida." };
    if (d.metodo === "GET") return executar("GET", url, null, ent);
    if (d.metodo !== "POST" || !/\/restauth\/operation$/.test(new URL(url).pathname)) return { ok: false, erro: "Só a operação Emitir DFD é permitida." };
    const c = d.corpo;
    if (!c || !GUID.test(String(c.Guid)) || !Number.isInteger(c.ModuleKey) || !Array.isArray(c.Params)) return { ok: false, erro: "Pedido inválido." };
    const params = c.Params.map((p) => ({ Key: String(p.Key), Value: p.Key in TRAVAS ? TRAVAS[p.Key] : String(p.Value ?? "") }));
    for (const [Key, Value] of Object.entries(TRAVAS)) if (!params.some((p) => p.Key === Key)) params.push({ Key, Value });
    return executar("POST", url, { ModuleKey: c.ModuleKey, Guid: c.Guid, Params: params }, ent);
  }

  // JSON da API da Centi (load/confirmsave/save): HTTP de erro ou corpo que não é JSON → o motivo, nunca segue às cegas.
  const A = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`];
  // `passo` entra no erro (load/confirmsave/save): diz ONDE a Centi recusou.
  async function api(metodo, caminho, corpo, passo, salvar = false) {
    const url = destino(caminho);
    if (!url) throw new Error("Destino fora da API da Centi.");
    const cab = salvar ? cabecalhosDoSalvar() : cabecalhos;
    const r = await executar(metodo, url, corpo, null, true, cab, (salvar && tipoSalvar) || "application/json");
    let j = null;
    try {
      j = JSON.parse(r.texto);
    } catch {}
    if (r.status >= 400 || !j) {
      const msg = `A Centi recusou o ${passo} (${r.status})${j ? `: ${A.mensagens(j.Message) || "sem mensagem"}` : "."}`;
      throw new Error(salvar ? `${msg} ${A.dicaCabecalhos(nomesSalvar, Object.keys(cab), !!doProtocolo)}` : msg);
    }
    return j;
  }

  async function abrirProtocolo(d) {
    const r = await api("GET", `restauth/load?entity=${A.MODULO_PROTOCOLO}&key=${d.id}`, null, "load do protocolo");
    const c = A.conferirProtocolo(r, d);
    if (c.erro) throw new Error(c.erro);
    return c.entidade;
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
  // pedindo confirmação (confirmsave) → para e mostra a pergunta (nunca confirma sozinha).
  async function anexar(d) {
    if (!A) return { ok: false, erro: "Extensão incompleta na aba da Centi — aperte F5 nela." };
    if (!cabecalhos) return { ok: false, erro: "Centi sem sessão: na aba da Centi já logada, clique em Pesquisar." };
    const erro = A.validarPedido(d);
    if (erro) return { ok: false, erro };
    const e = await abrirProtocolo(d);
    const ja = A.jaAnexado(e, d.descricao);
    if (ja) return { ok: true, jaAnexado: true, ...ja };
    // O registro do tipo, como a tela o manda (falhou a leitura → o tipo que o protocolo já tem / a referência).
    const tipo = await api("GET", `restauth/load?entity=${A.MODULO_TIPO}&key=${d.tipo}`, null, "load do tipo")
      .then((t) => A.tipoDoLoad(t, d.tipo))
      .catch(() => null);
    const corpo = A.montarSalvar(e, d, new Date(), crypto.randomUUID(), tipo);
    const conf = await api("POST", "restauth/confirmsave", corpo, "confirmsave", true);
    if (conf.Confirm === true) return { ok: false, erro: `A Centi pede confirmação: ${A.mensagens(conf.Message) || "sem mensagem"} — anexe pela tela da Centi.` };
    const salvo = A.conferirSalvo(await api("POST", "restauth/save", corpo, "save", true), d);
    return salvo.erro ? { ok: false, erro: salvo.erro } : { ok: true, ...salvo };
  }

  const ACOES = { pedir, protocolo, anexar };
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.data?.fonte !== "pca-centi-pedido" || e.data.p !== PROTOCOLO) return;
    const { id, acao, dados } = e.data;
    let resposta;
    try {
      resposta =
        acao === "estado"
          ? { ok: true, logado: !!cabecalhos, entidade: entidadeAtual() }
          : Object.hasOwn(ACOES, acao)
            ? await ACOES[acao](dados)
            : { ok: false, erro: "Ação desconhecida." };
    } catch (err) {
      resposta = { ok: false, erro: err?.message || "Falha no pedido à Centi." };
    }
    window.postMessage({ fonte: "pca-centi-resposta", p: PROTOCOLO, id, resposta }, location.origin);
  });
})();
