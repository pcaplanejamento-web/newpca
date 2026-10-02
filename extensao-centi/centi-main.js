// Roda DENTRO da página da Centi (extensão "fina"): guarda os cabeçalhos que a própria Centi usa na API (sessão da aba,
// entidade, mês) e executa, com eles, o pedido que a aba Automação manda. A LÓGICA (montar o Emitir DFD, ler a resposta,
// achar o PDF) mora no sistema — atualiza sem reinstalar a extensão. Aqui ficam só as TRAVAS: só a Centi, só leitura
// (GET) da API e, para POST, só a operação "Emitir DFD" com não vincular/não assinar/não enviar forçados. A ÚNICA gravação
// é o ANEXO ("anexar"): abre o protocolo pelo load da própria Centi, confere Id + número, acrescenta UM documento novo
// (centi-anexo.js) e salva — o sistema nunca manda o objeto do protocolo.
(() => {
  const PROTOCOLO = 25;
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
    if (this.__pcaUrl && !this.__pcaInterno) {
      guardar(this.__pcaUrl, this.__pcaHs || {}, this.__pcaMetodo, "xhr");
      aprenderOperacao(this.__pcaUrl, this.__pcaMetodo, r[0]);
    }
    if (this.__pcaUrl && String(this.__pcaUrl).includes("/restauth/")) this.addEventListener("load", () => trocarToken(tokenDoXhr(this)));
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
      const url = typeof rec === "string" ? rec : rec?.url;
      const hs = new Headers(init?.headers || (typeof rec === "object" ? rec.headers : undefined));
      const metodo = init?.method || (typeof rec === "object" ? rec.method : "GET");
      guardar(url, Object.fromEntries(hs.entries()), metodo, "fetch");
      aprenderOperacao(url, metodo, init?.body);
    } catch {}
    return comToken(buscar.call(this, rec, init, ...resto));
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
    if (d.metodo === "GET") return (await binarioPelaCenti("GET", url, null, ent)) ?? executar("GET", url, null, ent, false, cabecalhos, "application/json", url, false);
    if (d.metodo !== "POST" || !/\/restauth\/operation$/.test(new URL(url).pathname)) return { ok: false, erro: "Só a operação Emitir DFD é permitida." };
    const c = d.corpo;
    if (!c || !GUID.test(String(c.Guid)) || !Number.isInteger(c.ModuleKey) || !Array.isArray(c.Params)) return { ok: false, erro: "Pedido inválido." };
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
    try {
      return resposta(await cli.principal.request({ method: metodo, url: rel, data: corpo ?? undefined, headers, responseType: "arraybuffer" }));
    } catch (e) {
      return e?.response ? resposta(e.response) : null;
    } finally {
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
    try {
      const r = metodo === "GET" ? await cli.principal.get(rel) : await cli.principal.post(rel, corpo);
      tokenNosClientes(cli, r.headers);
      return { status: r.status, j: r.data };
    } catch (e) {
      const r = e?.response;
      if (!r) throw new Error(`Sem resposta da Centi (${e?.message || "rede"}).`);
      tokenNosClientes(cli, r.headers);
      return { status: r.status, j: r.data };
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

  const ACOES = { pedir, protocolo, anexar };
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
