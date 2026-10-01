// Peças PURAS do ANEXO de PDFs num protocolo da Centi (testadas: tests/automacao-centi.test.ts). Roda na página da Centi
// ANTES do centi-main.js, que as usa: a ÚNICA gravação permitida é acrescentar UM documento novo ao protocolo que a própria
// Centi acabou de devolver (load) — o resto do protocolo vai exatamente como veio (o que a tela da Centi faz no Salvar).
// O nome leva a VERSÃO do protocolo: uma cópia antiga que ficou na aba (de uma versão anterior da extensão) nunca é
// reaproveitada pela nova.
(() => {
  const NOME = "__pcaCentiAnexo_p6";
  if (globalThis[NOME]) return;
  const MODULO_PROTOCOLO = 102907;
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
    if (!e || e.ModuleKey !== MODULO_PROTOCOLO || !Array.isArray(e.Fields)) return { erro: "A Centi não devolveu o protocolo — confira o Id." };
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
      ModuleKey: MODULO_DOCUMENTO,
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

  globalThis[NOME] = Object.freeze({ validarPedido, conferirProtocolo, resumoProtocolo, jaAnexado, montarSalvar, mensagens, conferirSalvo, tipoDoLoad, MODULO_PROTOCOLO, MODULO_TIPO });
})();
