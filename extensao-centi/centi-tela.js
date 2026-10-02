// A TELA PROTOCOLO da Centi (PO011), operada pela PRÓPRIA INTERFACE — como uma pessoa faria (mundo ISOLADO da aba da
// automação). Só LEITURA: abre a tela, lê o seletor "Departamentos", escolhe as repartições pedidas, clica na lupa, abre a
// aba "Em Análise" e lê a grade. NUNCA toca em Protocolar, Operações, Salvar, Excluir, Novo nem Tramitar (lista negra
// conferida antes de CADA clique). As peças recebem o documento/janela — testadas com um DOM falso.
(() => {
  const g = globalThis;
  if (g.__pcaCentiTela) return;

  const norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  const visivel = (el) => !!el && !el.hidden && !!(el.offsetWidth || el.offsetHeight || el.getClientRects?.().length);
  const todos = (raiz) => Array.from(raiz.querySelectorAll("*"));
  const texto = (el) => norm(el?.textContent);
  const attr = (el, n) => (typeof el?.getAttribute === "function" ? el.getAttribute(n) : null);
  /** Os elementos visíveis cujo texto (inteiro) casa — os mais PROFUNDOS (o rótulo, não o painel em volta). */
  function porTexto(raiz, teste) {
    const achados = todos(raiz).filter((el) => visivel(el) && teste(texto(el)));
    return achados.filter((el) => !achados.some((o) => o !== el && el.contains?.(o)));
  }

  // Rótulos que a automação NUNCA aciona (gravam, tramitam ou abrem operações).
  const PROIBIDO = /PROTOCOLAR|OPERAC|SALVAR|EXCLUIR|\bNOVO\b|TRAMIT|ENVIAR|ARQUIVAR|RECEBER PROTOCOLO|ASSINAR|APAGAR|REMOVER PROTOCOLO/;
  const ehBotao = (el) => el.tagName === "BUTTON" || el.tagName === "A" || attr(el, "role") === "button" || (el.tagName === "INPUT" && /^(button|submit)$/i.test(String(el.type ?? "")));
  /** Um botão/link só é acionado se o rótulo dele (texto, aria-label, title) não estiver na lista negra. */
  function seguro(el) {
    if (!ehBotao(el)) return true;
    return !PROIBIDO.test(`${texto(el).slice(0, 80)} ${norm(attr(el, "aria-label"))} ${norm(attr(el, "title"))} ${norm(el.value)}`);
  }

  function clicar(win, el) {
    if (!el) return false;
    if (!seguro(el)) throw new Error(`Bloqueado: a automação não aciona “${String(el.textContent ?? "").trim().slice(0, 40)}”.`);
    const M = win.MouseEvent ?? win.Event;
    for (const tipo of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new M(tipo, { bubbles: true, cancelable: true, button: 0 }));
    return true;
  }
  function tecla(win, el, key) {
    const K = win.KeyboardEvent ?? win.Event;
    el.dispatchEvent(new K("keydown", { bubbles: true, cancelable: true, key, code: key }));
  }
  /** Valor pelo setter NATIVO + o evento de digitação — o framework da tela percebe. */
  function digitar(win, el, v) {
    el.focus?.();
    let proto = Object.getPrototypeOf(el);
    let d = null;
    while (proto && !d) {
      d = Object.getOwnPropertyDescriptor(proto, "value") ?? null;
      proto = Object.getPrototypeOf(proto);
    }
    if (d?.set) d.set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
  }

  const pausa = (win, ms) => new Promise((ok) => win.setTimeout(ok, ms));
  /** Espera a condição (consultada a cada 250 ms) até o prazo; depois, o erro claro. */
  async function esperarAte(ctx, fn, erro, ms = ctx.prazo ?? 15000) {
    const fim = Date.now() + ms;
    for (;;) {
      const r = fn();
      if (r) return r;
      if (Date.now() > fim) throw new Error(erro);
      await pausa(ctx.win, ctx.passo ?? 250);
    }
  }

  // ---------------------------------------------------------------- A TELA
  /** O painel da Tela Protocolo: o título "Tela Protocolo" e, em volta dele, o campo dos departamentos. */
  function acharTela(doc) {
    for (const t of porTexto(doc, (s) => s === "TELA PROTOCOLO")) {
      let n = t.parentElement;
      for (let i = 0; i < 8 && n; i++, n = n.parentElement) if (campoDepartamentos(n)) return n;
    }
    return null;
  }
  /** O campo de digitar do seletor "Departamentos" (o placeholder some com algo escolhido — então o 1º combobox). */
  function campoDepartamentos(raiz) {
    const inputs = todos(raiz).filter((el) => el.tagName === "INPUT" && visivel(el));
    const porNome = inputs.find((i) => norm(attr(i, "placeholder")) === "DEPARTAMENTOS");
    if (porNome) return porNome;
    const temRotulo = porTexto(raiz, (s) => s === "DEPARTAMENTOS").length > 0;
    const combo = inputs.find((i) => attr(i, "role") === "combobox" || attr(i, "aria-autocomplete") === "list");
    if (combo && (temRotulo || todos(raiz).some((el) => /multiValue|multi-value/i.test(String(el.className ?? ""))))) return combo;
    return null;
  }

  async function abrirTela(ctx) {
    const { doc, win } = ctx;
    const ja = acharTela(doc);
    if (ja) return ja;
    // A aba "PO011 - Tela Protocolo" já aberta na Centi: um clique nela.
    const aba = porTexto(doc, (s) => /^PO011\b/.test(s) && s.length < 60)[0];
    if (aba) {
      clicar(win, aba);
      return esperarAte(ctx, () => acharTela(doc), "Abri a aba PO011, mas a Tela Protocolo não apareceu.");
    }
    // Senão, pela busca do menu ("Pesquisar...").
    const busca = todos(doc).find((el) => el.tagName === "INPUT" && visivel(el) && norm(attr(el, "placeholder")).startsWith("PESQUISAR"));
    if (!busca) throw new Error("Não achei a Tela Protocolo nem a busca do menu da Centi — abra o sistema Compras na aba da automação.");
    digitar(win, busca, "PO011");
    const item = await esperarAte(
      ctx,
      () => porTexto(doc, (s) => /TELA PROTOCOLO/.test(s) && s.length < 60).find((el) => el !== busca && el.tagName !== "INPUT"),
      "A busca do menu não mostrou a Tela Protocolo (PO011).",
    );
    clicar(win, item);
    return esperarAte(ctx, () => acharTela(doc), "Abri a PO011, mas a Tela Protocolo não apareceu.");
  }

  // ---------------------------------------------------------------- O SELETOR DE DEPARTAMENTOS
  const ehOpcao = (el) => attr(el, "role") === "option" || /-option-\d+$/.test(String(el.id ?? "")) || /(^|[\s-])option(\s|$)/i.test(String(el.className ?? ""));
  const opcoesVisiveis = (doc) => todos(doc).filter((el) => visivel(el) && ehOpcao(el));

  async function abrirSeletor(ctx, campo) {
    const { doc, win } = ctx;
    campo.focus?.();
    clicar(win, campo);
    try {
      return await esperarAte(ctx, () => opcoesVisiveis(doc).length && opcoesVisiveis(doc), "", 1500);
    } catch {
      tecla(win, campo, "ArrowDown");
      return esperarAte(ctx, () => opcoesVisiveis(doc).length && opcoesVisiveis(doc), "O seletor Departamentos não abriu a lista.");
    }
  }
  const fecharSeletor = (ctx, campo) => tecla(ctx.win, campo, "Escape");

  /** Os nomes que estão ESCOLHIDOS no seletor agora (os "chips"). */
  function escolhidos(painel) {
    const chips = todos(painel).filter((el) => /multiValue|multi-value/i.test(String(el.className ?? "")) && !/label|remove/i.test(String(el.className ?? "")));
    return chips.map((c) => String(c.textContent ?? "").replace(/×/g, "").trim()).filter(Boolean);
  }

  async function departamentos(ctx) {
    const painel = await abrirTela(ctx);
    const campo = campoDepartamentos(painel);
    if (!campo) throw new Error("Não achei o campo Departamentos na Tela Protocolo.");
    const opcoes = await abrirSeletor(ctx, campo);
    const nomes = [...new Set([...escolhidos(painel), ...opcoes.map((o) => String(o.textContent ?? "").trim())].filter(Boolean))];
    fecharSeletor(ctx, campo);
    return nomes;
  }

  async function escolherDepartamentos(ctx, painel, nomes) {
    const { win } = ctx;
    const campo = campoDepartamentos(painel);
    if (!campo) throw new Error("Não achei o campo Departamentos na Tela Protocolo.");
    // Tira o que estava escolhido (Backspace com o campo vazio remove o último chip).
    for (let i = 0; i < 40 && escolhidos(painel).length; i++) {
      campo.focus?.();
      tecla(win, campo, "Backspace");
      await pausa(win, 60);
    }
    const quer = nomes.map(norm);
    for (const alvo of quer) {
      const opcoes = await abrirSeletor(ctx, campo);
      const op = opcoes.find((o) => texto(o) === alvo);
      if (!op) {
        fecharSeletor(ctx, campo);
        throw new Error(`A repartição “${nomes[quer.indexOf(alvo)]}” não está mais na lista da Centi.`);
      }
      clicar(win, op);
      await esperarAte(ctx, () => escolhidos(painel).some((n) => norm(n) === alvo) || !campoDepartamentos(painel) || null, `Não consegui escolher “${nomes[quer.indexOf(alvo)]}”.`, 4000).catch(() => null);
    }
    fecharSeletor(ctx, campo);
    const agora = escolhidos(painel).map(norm);
    const faltam = quer.filter((q) => !agora.includes(q));
    if (agora.length && faltam.length) throw new Error(`Não consegui escolher: ${faltam.join(", ")}.`);
  }

  /** A LUPA ao lado do seletor: o 1º botão SÓ COM ÍCONE (sem texto) depois do campo, nunca um da lista negra. */
  function botaoPesquisar(painel) {
    const campo = campoDepartamentos(painel);
    const lista = todos(painel);
    const depois = campo ? lista.slice(lista.indexOf(campo)) : lista;
    return depois.find((el) => (el.tagName === "BUTTON" || attr(el, "role") === "button") && visivel(el) && !texto(el) && seguro(el)) ?? null;
  }

  // ---------------------------------------------------------------- A GRADE
  const RE_ABA = (rotulo) => new RegExp(`^${rotulo}( \\(\\d+\\))?$`);
  function abrirAba(ctx, rotulo) {
    const aba = porTexto(ctx.doc, (s) => RE_ABA(rotulo).test(s))[0];
    if (!aba) throw new Error(`Não achei a aba “${rotulo}”.`);
    clicar(ctx.win, aba);
  }
  /** O número da aba ("Em Análise (3)" → 3), ou null. */
  function contagemAba(doc, rotulo) {
    const aba = porTexto(doc, (s) => RE_ABA(rotulo).test(s))[0];
    const m = aba ? /\((\d+)\)$/.exec(texto(aba)) : null;
    return m ? Number(m[1]) : null;
  }

  const CAMPOS = { PROTOCOLO: "protocolo", ANO: "ano", DEPARTAMENTO: "departamento", INTERESSADO: "interessado", SOLICITANTE: "solicitante", NATUREZA: "natureza" };
  /** A grade visível: a linha do cabeçalho (com PROTOCOLO) e as linhas de dados com a MESMA forma. */
  function lerGrade(painel) {
    const rotulo = porTexto(painel, (s) => s === "PROTOCOLO")[0];
    if (!rotulo) return null;
    let cab = rotulo.parentElement;
    while (cab && cab.children.length < 3) cab = cab.parentElement;
    if (!cab) return null;
    const cabecalhos = Array.from(cab.children).map(texto);
    const linhas = todos(painel).filter(
      (el) => el !== cab && el.tagName === cab.tagName && el.children.length === cab.children.length && visivel(el) && !Array.from(el.children).some((c) => texto(c) === "PROTOCOLO"),
    );
    const registros = [];
    for (const l of linhas) {
      const celulas = Array.from(l.children).map((c) => String(c.textContent ?? "").replace(/\s+/g, " ").trim());
      const campos = {};
      cabecalhos.forEach((h, i) => {
        if (h) campos[h] = celulas[i] ?? "";
      });
      const r = { campos };
      for (const [h, chave] of Object.entries(CAMPOS)) r[chave] = campos[h] ?? "";
      if (/\d/.test(r.protocolo)) registros.push(r);
    }
    return { cabecalhos: cabecalhos.filter(Boolean), registros };
  }
  /** "Exibindo 12 registro(s)" / "Exibindo 1 a 100 de 230" → o total; "Nenhum resultado" → 0. */
  function totalDoRodape(painel) {
    const t = texto(painel);
    if (/NENHUM RESULTADO/.test(t)) return 0;
    const de = /EXIBINDO\s+\d+\s*(?:A|-)\s*\d+\s+DE\s+(\d+)/.exec(t);
    if (de) return Number(de[1]);
    const m = /EXIBINDO\s+(\d+)\s+REGISTRO/.exec(t);
    return m ? Number(m[1]) : null;
  }
  function botaoProxima(painel) {
    return (
      todos(painel).find((el) => {
        if (!visivel(el) || el.disabled || attr(el, "aria-disabled") === "true") return false;
        const r = `${norm(attr(el, "aria-label"))} ${norm(attr(el, "title"))}`;
        return /PROXIMA|NEXT/.test(r) || ["›", ">", "»"].includes(String(el.textContent ?? "").trim());
      }) ?? null
    );
  }

  async function emAnalise(ctx, nomes) {
    const { doc, win } = ctx;
    if (!Array.isArray(nomes) || !nomes.length || nomes.length > 50 || nomes.some((n) => typeof n !== "string" || !n.trim() || n.length > 120))
      throw new Error("Escolha de 1 a 50 repartições.");
    const painel = await abrirTela(ctx);
    await escolherDepartamentos(ctx, painel, nomes);
    const lupa = botaoPesquisar(painel);
    if (!lupa) throw new Error("Não achei o botão de pesquisar (lupa) da Tela Protocolo.");
    clicar(win, lupa);
    await pausa(win, ctx.passo ?? 250);
    await esperarAte(ctx, () => contagemAba(doc, "EM ANALISE") !== null || porTexto(doc, (s) => RE_ABA("EM ANALISE").test(s)).length > 0, "A pesquisa não terminou.");
    abrirAba(ctx, "EM ANALISE");
    const esperado = contagemAba(doc, "EM ANALISE");
    const registros = new Map();
    let cabecalhos = [];
    for (let pagina = 0; pagina < 50; pagina++) {
      let anterior = -1;
      let estavel = 0;
      // A grade carrega depois do clique: espera o cabeçalho e as linhas ficarem iguais em 2 leituras.
      const grade = await esperarAte(
        ctx,
        () => {
          const gr = lerGrade(painel);
          if (esperado === 0 && totalDoRodape(painel) === 0) return { cabecalhos: [], registros: [] };
          if (!gr) return null;
          if (gr.registros.length === anterior) estavel++;
          else {
            estavel = 0;
            anterior = gr.registros.length;
          }
          return estavel >= 2 && (gr.registros.length || totalDoRodape(painel) === 0) ? gr : null;
        },
        "A grade de “Em Análise” não carregou (não achei a coluna PROTOCOLO).",
      );
      if (grade.cabecalhos.length) cabecalhos = grade.cabecalhos;
      for (const r of grade.registros) registros.set(`${r.protocolo}|${r.ano}`, r);
      const total = totalDoRodape(painel) ?? esperado;
      if (total == null || registros.size >= total) break;
      const prox = botaoProxima(painel);
      if (!prox) break;
      clicar(win, prox);
      await pausa(win, (ctx.passo ?? 250) * 2);
    }
    const lista = [...registros.values()];
    return { protocolos: lista, total: esperado ?? totalDoRodape(painel) ?? lista.length, cabecalhos };
  }

  /** O ponto de entrada da ponte: "telaDepartamentos" | "telaEmAnalise". */
  async function executar(acao, dados, ctx) {
    try {
      if (acao === "telaDepartamentos") return { ok: true, departamentos: await departamentos(ctx) };
      if (acao === "telaEmAnalise") return { ok: true, ...(await emAnalise(ctx, dados?.departamentos)) };
      return { ok: false, erro: "Ação desconhecida." };
    } catch (e) {
      return { ok: false, erro: e?.message || "Falha na Tela Protocolo." };
    }
  }

  g.__pcaCentiTela = Object.freeze({ norm, seguro, acharTela, campoDepartamentos, botaoPesquisar, lerGrade, totalDoRodape, contagemAba, escolhidos, executar });
})();
