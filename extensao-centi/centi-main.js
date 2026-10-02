// Roda DENTRO da página da Centi (extensão "fina"): guarda os cabeçalhos que a própria Centi usa na API (sessão da aba,
// entidade, mês) e executa, com eles, o pedido que a aba Automação manda. A LÓGICA (montar o Emitir DFD, ler a resposta,
// achar o PDF) mora no sistema — atualiza sem reinstalar a extensão. Aqui ficam só as TRAVAS: só a Centi, só leitura
// (GET) da API e, para POST, só a operação "Emitir DFD" com não vincular/não assinar/não enviar forçados. A ÚNICA gravação
// é o ANEXO ("anexar"): abre o protocolo pelo load da própria Centi, confere Id + número, acrescenta UM documento novo
// (centi-anexo.js) e salva — o sistema nunca manda o objeto do protocolo.
(() => {
  const PROTOCOLO = 17;
  const MARCA = `__pcaCentiMain_p${PROTOCOLO}`;
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
  // Fora da sessão guardada: os do navegador/tamanho, os anti-robô (x-ts…) e os de RASTREIO (trace-*, x-ai-trace — só
  // existem com o rastreio ligado e valem para UM pedido).
  const IGNORAR = /^(content-type|accept|content-length|x-ts|trace-|x-ai-trace)/i;
  const SESSAO_CAB = /^(authorization|token|refreshtoken|company)$/i;
  const gravarSessao = () => {
    try {
      sessionStorage.setItem(SESSAO, JSON.stringify({ base, cabecalhos }));
    } catch {}
  };

  function guardar(url, hs) {
    const u = String(url);
    const i = u.indexOf("/restauth/");
    if (i < 0) return;
    const limpos = {};
    for (const [k, v] of Object.entries(hs)) if (!IGNORAR.test(k)) limpos[k] = v;
    // A sessão da Centi vai num destes cabeçalhos (no "operation" capturado: Refreshtoken + Company + Month).
    if (!Object.keys(limpos).some((k) => SESSAO_CAB.test(k))) return;
    base = new URL(u.slice(0, i), location.href).href;
    cabecalhos = limpos;
    gravarSessao();
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
    gravarSessao();
  }
  const tokenDoXhr = (x) => (n) => {
    try {
      return x.getResponseHeader(n) || null;
    } catch {
      return null;
    }
  };

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
      guardar(url, Object.fromEntries(hs.entries()));
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

  function executar(metodo, url, corpo, entidade, comoTexto = false) {
    return new Promise((ok, falha) => {
      const x = new XMLHttpRequest();
      x.__pcaInterno = true;
      x.open(metodo, url);
      x.responseType = comoTexto ? "text" : "arraybuffer";
      const k = nomeEntidade();
      for (const [n, v] of Object.entries(cabecalhos)) x.setRequestHeader(n, entidade && n === k ? entidade : v);
      if (entidade && !k) x.setRequestHeader("Company", entidade);
      if (corpo) x.setRequestHeader("Content-Type", "application/json");
      x.setRequestHeader("Accept", "application/json, text/plain, */*");
      x.onload = () => {
        // O token novo desta resposta vale JÁ para o próximo pedido (antes de a sequência continuar).
        trocarToken(tokenDoXhr(x));
        return ok(
          comoTexto
            ? { status: x.status, texto: String(x.response ?? "") }
            : { ok: true, status: x.status, tipo: x.getResponseHeader("content-type") || "", b64: emBase64(new Uint8Array(x.response || new ArrayBuffer(0))) },
        );
      };
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

  const A = globalThis[`__pcaCentiAnexo_p${PROTOCOLO}`];
  // JSON da API da Centi pelo envio da extensão (sem o cliente da tela): HTTP de erro ou corpo que não é JSON → o motivo.
  async function api(metodo, caminho, corpo, passo) {
    const url = destino(caminho);
    if (!url) throw new Error("Destino fora da API da Centi.");
    const r = await executar(metodo, url, corpo, null, true);
    let j = null;
    try {
      j = JSON.parse(r.texto);
    } catch {}
    if (r.status >= 400 || !j) throw new Error(`A Centi recusou o ${passo} (${r.status})${j ? `: ${A.mensagens(j.Message) || "sem mensagem"}` : "."}`);
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
  function tokenNosClientes(cli, h) {
    const ler = (n) => (h && (typeof h.get === "function" ? h.get(n) : h[n])) || null;
    const token = ler("token");
    const refresh = ler("refreshtoken");
    for (const v of cli.todas) {
      const c = v.defaults.headers.common;
      if (token) {
        c.token = token;
        c.Authorization = `Bearer ${token}`;
      }
      if (refresh) c.refreshtoken = refresh;
    }
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
  async function apiCenti(metodo, caminho, corpo, passo) {
    const r = await pelaCenti(metodo, caminho, corpo);
    if (!r) {
      try {
        return await api(metodo, caminho, corpo, passo);
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

  async function abrirProtocolo(d) {
    const r = await apiCenti("GET", `restauth/load?entity=${A.MODULO_PROTOCOLO}&key=${d.id}`, null, "load do protocolo");
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
      conf = await apiCenti("POST", "restauth/confirmsave", A.corpoConfirmar(corpo), "confirmsave");
    } catch (err) {
      throw new Error(`${err?.message || "Falha no confirmsave."} [tipo: ${origemTipo}]`);
    }
    // Como a tela: a Centi pedindo confirmação → a pergunta vai ao ADM; só com o "sim" dele (`aceitar`) segue ao save.
    if (conf.Confirm === true && d.aceitar !== true) return { ok: false, confirmar: A.mensagens(conf.Message) || "A Centi pede confirmação para salvar." };
    const salvo = A.conferirSalvo(await apiCenti("POST", "restauth/save", corpo, "save"), d);
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
