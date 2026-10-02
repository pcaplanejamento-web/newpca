// Peças PURAS do ANEXO de PDFs num protocolo da Centi (testadas: tests/automacao-centi.test.ts). Roda na página da Centi
// ANTES do centi-main.js, que as usa: a ÚNICA gravação permitida é acrescentar UM documento novo ao protocolo que a própria
// Centi acabou de devolver (load) — o resto do protocolo vai exatamente como veio (o que a tela da Centi faz no Salvar).
// O nome leva a VERSÃO do protocolo: uma cópia antiga que ficou na aba (de uma versão anterior da extensão) nunca é
// reaproveitada pela nova.
(() => {
  const NOME = "__pcaCentiAnexo_p27";
  if (globalThis[NOME]) return;
  // O protocolo abre por um destes módulos: 102907 (PO002 - Protocolo) ou 102908 (PO011 - Tela Protocolo). O protocolo
  // que entrou na tramitação ("Em análise") a Centi só devolve pelo 102908 — o 102907 responde Entity nulo, sem mensagem.
  const MODULO_PROTOCOLO = 102907;
  const MODULOS_PROTOCOLO = [102907, 102908];
  const MODULO_DOCUMENTO = 102932;
  const MODULO_TIPO = 103868;
  const TIPO = "ORM.ObjectsJSON.Transports.ObjectDataJSON, ORM";
  // Listas que o load devolve nulas e a tela da Centi manda vazias no Salvar.
  const LISTAS = ["AtesteControleInterno", "LinksDownloads", "EtapasFluxo"];
  const MAX_PDF_B64 = 80 * 1024 * 1024;

  const campos = (o) => (o && Array.isArray(o.Fields) ? o.Fields : []);
  const valor = (o, k) => campos(o).find((f) => f.Key === k)?.Value;
  const idDe = (v) => (v && typeof v === "object" ? valor(v, "Id") : v);
  const texto = (v) => String(v ?? "").trim();
  const mesmaDescricao = (a, b) => texto(a).replace(/\s+/g, " ").toUpperCase() === texto(b).replace(/\s+/g, " ").toUpperCase();
  // Caractere de controle (quebra de linha, tab…) — não entra em descrição nem em nome de arquivo.
  const temControle = (t) => [...t].some((c) => c.charCodeAt(0) < 32);
  const dois = (n) => String(n).padStart(2, "0");
  const dataCenti = (d) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;

  /** Valida o pedido do sistema (só dígitos nos códigos; o PDF em base64 começando por "%PDF"). Devolve o erro ou null. */
  function validarPedido(d) {
    if (!/^\d{1,12}$/.test(String(d?.id ?? ""))) return "Id do protocolo inválido.";
    if (!/^\d{1,12}$/.test(String(d?.numero ?? ""))) return "Nº do protocolo inválido.";
    if (d.ano != null && !/^\d{4}$/.test(String(d.ano))) return "Ano do protocolo inválido.";
    if (!/^\d{1,9}$/.test(String(d?.tipo ?? ""))) return "Tipo do documento inválido.";
    const desc = texto(d.descricao);
    if (!desc || desc.length > 250 || temControle(desc)) return "Descrição inválida.";
    const arq = texto(d.arquivo);
    if (!/\.pdf$/i.test(arq) || arq.length > 250 || temControle(arq) || /[/\\]/.test(arq)) return "Nome do arquivo inválido.";
    const pdf = String(d.pdf ?? "");
    if (!pdf.startsWith("JVBER") || pdf.length > MAX_PDF_B64 || !/^[A-Za-z0-9+/]+=*$/.test(pdf)) return "O arquivo não é um PDF.";
    return null;
  }

  /** O protocolo que a Centi devolveu no load: confere o Id e o NÚMERO (e o ano, quando informado) — nunca anexa noutro. */
  function conferirProtocolo(retorno, d) {
    const e = retorno?.Entity;
    if (!e || !MODULOS_PROTOCOLO.includes(e.ModuleKey) || !Array.isArray(e.Fields)) {
      // O que a Centi respondeu (a mensagem dela e a FORMA da resposta — nunca os dados), para o erro dizer o motivo.
      const msg = mensagens(retorno?.Message);
      const forma = retorno && typeof retorno === "object" ? Object.keys(retorno).slice(0, 8).join(", ") : typeof retorno;
      const mod = e && typeof e === "object" ? ` · módulo ${e.ModuleKey ?? "?"}` : "";
      return { erro: `A Centi não devolveu o protocolo${msg ? `: ${msg}` : " — confira o Id"} (resposta: ${forma || "vazia"}${mod}).` };
    }
    if (texto(valor(e, "Id")) !== String(d.id)) return { erro: `A Centi não achou o protocolo de Id ${d.id}.` };
    const numero = texto(valor(e, "NrProtocolo"));
    const ano = texto(valor(e, "AnoReferencia"));
    if (numero !== String(d.numero)) return { erro: `O Id ${d.id} é do protocolo ${numero || "?"}${ano ? `/${ano}` : ""}, não do ${d.numero}.` };
    if (d.ano != null && ano !== String(d.ano)) return { erro: `O protocolo ${numero} é de ${ano || "?"}, não de ${d.ano}.` };
    if (!Array.isArray(valor(e, "Documentos"))) return { erro: "A Centi não devolveu os documentos do protocolo." };
    return { entidade: e };
  }

  /** O resumo do protocolo (o "Conferir" da tela). */
  function resumoProtocolo(e) {
    const docs = valor(e, "Documentos") ?? [];
    return {
      id: texto(valor(e, "Id")),
      numero: texto(valor(e, "NrProtocolo")),
      ano: texto(valor(e, "AnoReferencia")),
      assunto: texto(valor(valor(e, "IdAssunto"), "Display")),
      interessado: texto(valor(valor(e, "IdPessoa"), "Display")),
      descricao: texto(valor(e, "Descricao")),
      documentos: docs.length,
      descricoes: docs.map((x) => texto(valor(x, "Descricao"))),
    };
  }

  /** O documento já anexado com a MESMA descrição (não anexa duas vezes). */
  function jaAnexado(e, descricao) {
    const doc = (valor(e, "Documentos") ?? []).find((x) => mesmaDescricao(valor(x, "Descricao"), descricao));
    return doc ? { sequencial: texto(valor(doc, "Sequencial")), documento: texto(valor(doc, "Id")) } : null;
  }

  /** O TIPO do documento como a tela da Centi o manda: o registro do tipo (load do módulo de tipos, State 3) — só quando é
   * mesmo o tipo pedido. */
  function tipoDoLoad(retorno, tipo) {
    const t = retorno?.Entity;
    return t && t.ModuleKey === MODULO_TIPO && Array.isArray(t.Fields) && texto(valor(t, "Id")) === String(tipo) ? t : null;
  }

  /** O corpo do confirmsave/save: o protocolo do load SEM MUDANÇA + UM documento novo no fim (o formato da tela da Centi).
   * O tipo: o registro do tipo (`tipoDoLoad` — o que a tela manda); sem ele, o objeto que a Centi já devolve num documento
   * desse tipo; senão, a referência pelo Id. */
  function montarSalvar(e, d, agora, guid, tipoCarregado = null) {
    const docs = valor(e, "Documentos");
    const igual = docs.find((x) => String(idDe(valor(x, "IdPessoaDocumentoTipo"))) === String(d.tipo));
    const tipo =
      tipoCarregado ??
      (igual
        ? valor(igual, "IdPessoaDocumentoTipo")
        : { $type: TIPO, Type: 0, State: 10, ModuleKey: 0, Guid: null, Fields: [{ Key: "Id", Value: Number(d.tipo) }], DynamicAttributes: null });
    const quando = dataCenti(agora);
    const f = (Key, Value) => ({ Key, Value });
    const novo = {
      Type: 0,
      State: 0,
      // O módulo do documento = o de um documento que o protocolo já tem (o mesmo módulo de onde veio); sem nenhum, o padrão.
      ModuleKey: docs.find((x) => Number.isInteger(x?.ModuleKey) && x.ModuleKey > 0)?.ModuleKey ?? MODULO_DOCUMENTO,
      Guid: guid,
      Fields: [
        f("IdProtocolo", "0"),
        f("IdPessoaDocumentoTipo", tipo),
        f("Sequencial", "0"),
        f("Descricao", texto(d.descricao)),
        f("IdGed", { Fields: [f("Id", 0), f("FileName", texto(d.arquivo)), f("Data", String(d.pdf))] }),
        f("IdGedOriginal", "0"),
        f("IdVinculo", ""),
        f("Documento", ""),
        f("Data", quando),
        f("IdReparticao", "0"),
        f("DescricaoCompletaReparticao", ""),
        f("TipoAndamento", "0"),
        f("IdUsuario", "0"),
        f("NomeUsuario", ""),
        f("IdProtocoloRegularidade", "0"),
        f("AvaliacaoRegularidade", ""),
        f("ObservacaoAvaliacao", ""),
        f("IdConceito", "0"),
        f("Status", "0"),
        f("DataRevogacao", quando),
        f("DocumentoExterno", "1"),
        f("ConfereOriginal", "0"),
        f("IdUsuarioConfereOriginal", "0"),
        f("NomeUsuarioConfereOriginal", ""),
        f("DataConfereOriginal", quando),
        f("ObservacaoConfereOriginal", ""),
        f("QuantidadePaginas", "0"),
        f("DocumentoSigiloso", "0"),
        f("IdUsuarioSigilo", "0"),
        f("Reassinar", "0"),
        f("Assinaturas", []),
        f("UsuariosSigilosos", []),
        f("Id", "0"),
        f("IdUsuarioCadastro", "0"),
        f("IdUsuarioAlteracao", "0"),
        f("DataCadastro", ""),
        f("LastUpdate", ""),
      ],
      DynamicAttributes: [],
    };
    const Fields = e.Fields.map((c) =>
      c.Key === "Documentos" ? { Key: c.Key, Value: [...docs, novo] } : LISTAS.includes(c.Key) && c.Value == null ? { Key: c.Key, Value: [] } : c,
    );
    return { Token: "", Object: { ...e, Fields } };
  }

  /** O corpo do CONFIRMSAVE = o OBJETO do protocolo DIRETO (a tela da Centi chama `confirmsave(initialValues)`); só o
   * `save` leva o envelope `{Token, Object}`. O envelope no confirmsave chegava ao servidor como um objeto vazio (500). */
  function corpoConfirmar(salvar) {
    return salvar.Object;
  }

  /** O texto das mensagens da Centi (lista de textos ou de objetos). */
  function mensagens(m) {
    const lista = Array.isArray(m) ? m : m == null ? [] : [m];
    return lista
      .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? (x.Message ?? x.Text ?? x.Mensagem ?? x.Description ?? "") : ""))
      .map(texto)
      .filter(Boolean)
      .join(" · ");
  }

  /** A resposta do save: só vale com Success e o documento novo de volta com Id real. */
  function conferirSalvo(r, d) {
    if (r?.Success !== true) return { erro: `A Centi não gravou${mensagens(r?.Message) ? `: ${mensagens(r.Message)}` : "."}` };
    const doc = (valor(r.Entity, "Documentos") ?? []).filter((x) => mesmaDescricao(valor(x, "Descricao"), d.descricao)).pop();
    const id = texto(valor(doc, "Id"));
    if (!doc || !id || id === "0") return { erro: "A Centi respondeu, mas o documento não voltou no protocolo — confira na Centi." };
    return { sequencial: texto(valor(doc, "Sequencial")), documento: id };
  }

  /** A dica do erro do salvar, pelos NOMES dos cabeçalhos (nunca os valores): os que a tela da Centi mandou no salvar e o
   * anexo não mandou (os anti-robô "x-ts…" a extensão não reproduz); sem o salvar da tela aprendido, como ensiná-lo. */
  function dicaCabecalhos(nomesTela, nomesEnviados, _protocoloAberto) {
    if (!Array.isArray(nomesTela) || !nomesTela.length) return "";
    const enviados = new Set((nomesEnviados ?? []).map((n) => String(n).toLowerCase()));
    const fixos = /^(content-type|content-length|accept)$/i;
    const faltam = nomesTela.map((n) => String(n).toLowerCase()).filter((n) => !fixos.test(n) && !enviados.has(n));
    const robo = faltam.filter((n) => n.startsWith("x-ts"));
    const outros = faltam.filter((n) => !n.startsWith("x-ts"));
    if (outros.length) return `Cabeçalhos do salvar da Centi que faltaram: ${outros.join(", ")}.`;
    if (robo.length) return "O salvar da Centi exige a verificação anti-robô da própria tela — anexe por ela.";
    return "Os cabeçalhos são os mesmos da tela da Centi.";
  }

  /** A trilha da tela da Centi antes do salvar dela (só "MÉTODO caminho"; números longos encurtados) e o endereço usado
   * pelo anexo — o passo que a tela faz e o anexo não aparece aqui. Sem trilha: como aprendê-la. */
  function dicaTrilha(trilha, usado) {
    if (!Array.isArray(trilha) || !trilha.length) return "";
    const curto = (t) => String(t).replace(/\d{7,}/g, (n) => `${n.slice(0, 3)}…`).slice(0, 90);
    return `Passos da tela antes de salvar: ${trilha.slice(-8).map(curto).join(" › ")}. Anexo: ${curto(usado)}.`;
  }

  /** Os cabeçalhos de RASTREIO (trace-*, x-ai-trace…) vão NOVOS em cada pedido, como a tela os gera: um identificador
   * repetido de um pedido antigo faz o salvar da Centi falhar ("Erro inesperado"). No valor, cada GUID vira um GUID novo,
   * cada carimbo de tempo em ms vira o de agora e cada sequência hexadecimal/alfanumérica longa vira outra do mesmo
   * tamanho. Os demais cabeçalhos (sessão, entidade, mês…) ficam como estão. */
  const RASTREIO = /^(x-ai-trace|x-trace|trace-|x-request-id|request-id|x-correlation-id|correlation-id)/i;
  function renovarRastreio(cab, guid, agora, aleatorio) {
    const novoDe = (amostra) => {
      const hex = /^[0-9a-f]+$/i.test(amostra);
      const alfabeto = hex ? "0123456789abcdef" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let r = "";
      for (let i = 0; i < amostra.length; i++) r += alfabeto[Math.floor(aleatorio() * alfabeto.length)];
      return amostra === amostra.toUpperCase() && hex ? r.toUpperCase() : r;
    };
    const r = {};
    for (const [k, v] of Object.entries(cab ?? {})) {
      if (!RASTREIO.test(k)) {
        r[k] = v;
        continue;
      }
      r[k] = String(v ?? "")
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, () => guid())
        .replace(/(?<![0-9a-z])1\d{12}(?![0-9a-z])/gi, () => String(agora))
        .replace(/(?<![0-9a-z-])[0-9a-z]{16,}(?![0-9a-z-])/gi, (m) => novoDe(m));
    }
    return r;
  }

  /** Os cabeçalhos com o TOKEN que a Centi devolveu na resposta (ela troca a cada resposta e a tela usa o novo):
   * token, Authorization "Bearer <token>" e refreshtoken — no nome que já existe (sem caixa), senão acrescentados. Sem
   * token novo, os mesmos cabeçalhos. */
  function comTokenNovo(cab, token, refresh) {
    if (!token && !refresh) return cab;
    // Só ATUALIZA o cabeçalho que a tela da Centi já manda (pelo nome, sem caixa) — NUNCA acrescenta um: a tela não manda
    // "token"/"Authorization" no operation (só Refreshtoken + Company + Month), e acrescentá-los fazia a Centi responder
    // "Usuário sem permissão!" na emissão do DFD (1.3.8 a 1.3.17).
    const novo = { ...cab };
    let mudou = false;
    const por = (re, valor) => {
      const k = Object.keys(novo).find((n) => re.test(n));
      if (k && novo[k] !== valor) {
        novo[k] = valor;
        mudou = true;
      }
    };
    if (token) {
      por(/^token$/i, token);
      por(/^authorization$/i, `Bearer ${token}`);
    }
    if (refresh) por(/^refreshtoken$/i, refresh);
    return mudou ? novo : cab;
  }

  /** A OPERAÇÃO "Emitir DFD" que a própria tela da Centi mandou (o corpo do operation, como texto ou objeto): só o que a
   * identifica — ModuleKey, Guid e o modelo de assinatura (IdPlanejamentoAssinaturaDFD). Outro operation → null. Nunca
   * guarda o planejamento nem os demais valores. */
  function operacaoDoCorpo(corpo) {
    let c = corpo;
    if (typeof c === "string") {
      try {
        c = JSON.parse(c);
      } catch {
        return null;
      }
    }
    if (!c || typeof c !== "object" || !Number.isInteger(c.ModuleKey) || c.ModuleKey <= 0 || !Array.isArray(c.Params)) return null;
    const guid = String(c.Guid ?? "").toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(guid)) return null;
    const p = (k) => c.Params.find((x) => x && x.Key === k);
    if (!p("IdComprasPlanejamento") || String(p("DFD")?.Value ?? "") !== "1") return null;
    const assinatura = String(p("IdPlanejamentoAssinaturaDFD")?.Value ?? "").replace(/\D/g, "");
    return { moduleKey: c.ModuleKey, guid, assinatura };
  }

  // GRAVADOR de receitas: a ESTRUTURA de um pedido que a tela da Centi fez — método, caminho, os NOMES dos parâmetros e dos
  // campos do corpo com o TIPO de cada um. Nunca um valor (nem token, senha, nome ou número): só a forma.
  const TIPOS = (v) => (v === null ? "nulo" : Array.isArray(v) ? "lista" : typeof v === "number" ? "número" : typeof v === "boolean" ? "sim/não" : typeof v === "string" ? "texto" : "objeto");
  function forma(v, prof) {
    if (prof > 4) return "…";
    if (Array.isArray(v)) return v.length ? [forma(v[0], prof + 1)] : [];
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v).slice(0, 60)) o[k] = forma(v[k], prof + 1);
      return o;
    }
    return TIPOS(v);
  }
  function estruturaDoPedido(url, metodo, corpo) {
    let u;
    try {
      u = new URL(String(url), "https://rioverde.centi.com.br");
    } catch {
      return null;
    }
    const i = u.pathname.indexOf("/wcf/");
    if (i < 0) return null;
    const caminho = u.pathname.slice(i + 5).replace(/\/\d+(?=\/|$)/g, "/{n}");
    const entidade = u.searchParams.get("entity");
    let c = corpo;
    if (typeof c === "string") {
      try {
        c = JSON.parse(c);
      } catch {
        c = c ? "texto (não JSON)" : undefined;
      }
    } else if (c != null && typeof c === "object" && !Array.isArray(c) && Object.getPrototypeOf(c) !== Object.prototype) c = "binário/formulário";
    return {
      metodo: String(metodo || "GET").toUpperCase(),
      caminho,
      entidade: entidade && /^\d{1,9}$/.test(entidade) ? entidade : null,
      parametros: [...new Set([...u.searchParams.keys()])].slice(0, 30),
      corpo: c === undefined ? null : typeof c === "string" ? c : forma(c, 0),
    };
  }

  globalThis[NOME] = Object.freeze({
    comTokenNovo,
    operacaoDoCorpo,
    renovarRastreio, estruturaDoPedido, validarPedido, conferirProtocolo, resumoProtocolo, jaAnexado, montarSalvar, corpoConfirmar, mensagens, conferirSalvo, tipoDoLoad, dicaCabecalhos, dicaTrilha, MODULO_PROTOCOLO, MODULOS_PROTOCOLO, MODULO_TIPO });
})();
