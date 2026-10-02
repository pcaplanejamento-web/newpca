// A TELA PROTOCOLO da Centi (PO011), operada pela PRÓPRIA INTERFACE — como uma pessoa faria (mundo ISOLADO da aba da
// automação). Só LEITURA: abre a tela, lê o seletor "Departamentos", escolhe as repartições pedidas, clica na lupa, abre a
// aba "Em Análise" e lê a grade. NUNCA toca em Protocolar, Operações, Salvar, Excluir, Novo nem Tramitar (lista negra
// conferida antes de CADA clique). As peças recebem o documento/janela — testadas com um DOM falso.
(() => {
  const g = globalThis;
  // Uma versão por vez: a cópia mais NOVA substitui a que tenha ficado na aba (atualizar a extensão não deixa a velha).
  const VERSAO = 6;
  if (g.__pcaCentiTela && (g.__pcaCentiTela.versao ?? 1) >= VERSAO) return;

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

  /**
   * O MOUSE de verdade sobre o elemento: ponteiro + mouse, NO CENTRO dele (a grade da Centi — Wijmo FlexGrid — descobre a
   * célula pelas COORDENADAS do evento; em (0,0) o clique não acerta linha nenhuma). `duplo` = o duplo clique completo.
   */
  function mouse(win, el, duplo = false) {
    const b = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
    const x = b ? b.left + b.width / 2 : 0;
    const y = b ? b.top + b.height / 2 : 0;
    const M = win.MouseEvent ?? win.Event;
    const P = win.PointerEvent ?? M;
    const base = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: x, clientY: y, screenX: x, screenY: y };
    const ponteiro = { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true };
    for (const detail of duplo ? [1, 2] : [1]) {
      el.dispatchEvent(new P("pointerdown", { ...ponteiro, buttons: 1, detail }));
      el.dispatchEvent(new M("mousedown", { ...base, buttons: 1, detail }));
      el.dispatchEvent(new P("pointerup", { ...ponteiro, buttons: 0, detail }));
      el.dispatchEvent(new M("mouseup", { ...base, buttons: 0, detail }));
      el.dispatchEvent(new M("click", { ...base, buttons: 0, detail }));
    }
    if (duplo) el.dispatchEvent(new M("dblclick", { ...base, buttons: 0, detail: 2 }));
  }
  function clicar(win, el) {
    if (!el) return false;
    if (!seguro(el)) throw new Error(`Bloqueado: a automação não aciona “${String(el.textContent ?? "").trim().slice(0, 40)}”.`);
    mouse(win, el);
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
      const r = await fn();
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
    const temRotulo = porTexto(raiz, (s) => s === "DEPARTAMENTOS").length > 0 || todos(raiz).some((el) => /^remove\s/i.test(String(attr(el, "aria-label") ?? "")));
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
    const nomes = chips.map((c) => String(c.textContent ?? "").replace(/×/g, "").trim()).filter(Boolean);
    // Sem nomes de classe (build da Centi): o botão de tirar do react-select diz "Remove <nome>".
    if (!nomes.length)
      for (const el of todos(painel)) {
        const m = /^remove\s+(.+)$/i.exec(String(attr(el, "aria-label") ?? "").trim());
        if (m) nomes.push(m[1].trim());
      }
    return [...new Set(nomes)];
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
    const quer = nomes.map(norm);
    // Já escolhidas exatamente as pedidas: nada a mexer.
    const antes = escolhidos(painel).map(norm);
    if (antes.length === quer.length && quer.every((q) => antes.includes(q))) return;
    // Tira o que estava escolhido (Backspace com o campo vazio remove o último chip).
    for (let i = 0; i < 40 && escolhidos(painel).length; i++) {
      campo.focus?.();
      tecla(win, campo, "Backspace");
      await pausa(win, 60);
    }
    for (const alvo of quer) {
      if (escolhidos(painel).some((n) => norm(n) === alvo)) continue;
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
  const RE_ABA = (rotulo) => new RegExp(`^${rotulo}(\\s*\\(\\d+\\))?$`);
  function abrirAba(ctx, rotulo) {
    const aba = porTexto(ctx.doc, (s) => RE_ABA(rotulo).test(s))[0];
    if (!aba) throw new Error(`Não achei a aba “${rotulo}”.`);
    clicar(ctx.win, aba);
  }
  /** O número da aba ("Em Análise (3)" → 3; a aba sem número = 0), ou null sem a aba. */
  function contagemAba(doc, rotulo) {
    const aba = porTexto(doc, (s) => RE_ABA(rotulo).test(s))[0];
    if (!aba) return null;
    const m = /\((\d+)\)$/.exec(texto(aba));
    return m ? Number(m[1]) : 0;
  }

  const CAMPOS = {
    PROTOCOLO: "protocolo",
    ANO: "ano",
    DEPARTAMENTO: "departamento",
    INTERESSADO: "interessado",
    SOLICITANTE: "solicitante",
    NATUREZA: "natureza",
    "DATA DE ENTRADA": "entrada",
  };
  const RE_PROTOCOLO = /^\d[\d./-]*$/;
  const celula = (el) => String(el?.textContent ?? "").replace(/\s+/g, " ").trim();

  /**
   * O CABEÇALHO da grade: o MENOR ancestral comum dos rótulos visíveis PROTOCOLO, ANO e INTERESSADO (procurados no
   * documento inteiro — a grade fica fora do bloco dos filtros; o "Protocolo" do menu lateral não tem ANO/INTERESSADO).
   */
  function acharCabecalho(doc) {
    const anos = porTexto(doc, (s) => s === "ANO");
    const ints = porTexto(doc, (s) => s === "INTERESSADO");
    let melhor = null;
    for (const p of porTexto(doc, (s) => s === "PROTOCOLO")) {
      let n = p.parentElement;
      for (let i = 0; n && i < 10; i++, n = n.parentElement) {
        if (anos.some((x) => n.contains(x)) && ints.some((x) => n.contains(x))) {
          // Uma LINHA de cabeçalho: cada filho com um rótulo curto e os três rótulos em colunas diferentes.
          const filhos = Array.from(n.children);
          const col = (rot) => filhos.findIndex((f) => f === rot || f.contains?.(rot));
          const cols = [col(p), col(anos.find((x) => n.contains(x))), col(ints.find((x) => n.contains(x)))];
          const linha = new Set(cols).size === 3 && !cols.includes(-1) && filhos.every((f) => texto(f).length <= 40);
          const tam = todos(n).length;
          if (linha && (!melhor || tam < melhor.tam)) melhor = { cab: n, tam };
          break;
        }
      }
    }
    return melhor?.cab ?? null;
  }
  /** O rótulo de cada coluna = o texto do FILHO do cabeçalho (os ícones de ordenar/filtrar não têm texto). */
  const rotulosDe = (cab) => Array.from(cab.children).map(texto);

  /** Um protocolo da grade; `el` (não vai na resposta) = a célula do nº, para abrir o protocolo. */
  function registro(cabecalhos, celulas, els = []) {
    const campos = {};
    cabecalhos.forEach((h, i) => {
      if (h) campos[h] = celulas[i] ?? "";
    });
    const r = { campos };
    for (const [h, chave] of Object.entries(CAMPOS)) r[chave] = campos[h] ?? "";
    r.id = "";
    if (!RE_PROTOCOLO.test(r.protocolo)) return null;
    Object.defineProperty(r, "el", { value: els[cabecalhos.indexOf("PROTOCOLO")] ?? null, enumerable: false });
    return r;
  }

  /** Pela ESTRUTURA: as linhas com a mesma tag e o mesmo nº de filhos do cabeçalho, perto dele. */
  function porEstrutura(cab, cabecalhos) {
    let raiz = cab.parentElement;
    for (let i = 0; raiz && i < 8; i++, raiz = raiz.parentElement) {
      const linhas = todos(raiz).filter((el) => el !== cab && !cab.contains(el) && !el.contains?.(cab) && el.tagName === cab.tagName && el.children.length === cab.children.length && visivel(el));
      const regs = linhas.map((l) => registro(cabecalhos, Array.from(l.children).map(celula), Array.from(l.children))).filter(Boolean);
      if (regs.length) return regs;
    }
    return [];
  }

  /** Pela POSIÇÃO na tela: cada texto abaixo do cabeçalho vai à coluna sob a qual está; as linhas pela altura. */
  function porPosicao(doc, cab, cabecalhos) {
    const caixa = (el) => (typeof el?.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null);
    const cols = Array.from(cab.children).map((c) => caixa(c));
    if (!cols.some((c) => c && c.width > 0)) return [];
    const base = Math.max(...cols.filter(Boolean).map((c) => c.bottom));
    const folhas = [];
    for (const el of todos(doc.body ?? doc)) {
      if (el.children.length || cab.contains(el) || !visivel(el)) continue;
      const t = celula(el);
      if (!t) continue;
      const b = caixa(el);
      if (!b || b.top < base - 1) continue;
      const cx = (b.left + b.right) / 2;
      const i = cols.findIndex((c) => c && c.width > 0 && cx >= c.left && cx <= c.right);
      if (i >= 0) folhas.push({ i, t, el, cy: (b.top + b.bottom) / 2 });
    }
    folhas.sort((a, b) => a.cy - b.cy);
    const grupos = [];
    for (const f of folhas) {
      const g = grupos[grupos.length - 1];
      if (g && f.cy - g.cy <= 6) g.itens.push(f);
      else grupos.push({ cy: f.cy, itens: [f] });
    }
    return grupos
      .map((g) => {
        const cel = cabecalhos.map(() => "");
        const els = cabecalhos.map(() => null);
        for (const f of g.itens) {
          cel[f.i] = cel[f.i] ? `${cel[f.i]} ${f.t}` : f.t;
          els[f.i] ??= f.el;
        }
        return registro(cabecalhos, cel, els);
      })
      .filter(Boolean);
  }

  /** A grade visível: os rótulos das colunas e os protocolos (pela estrutura; sem linhas, pela posição). */
  function lerGrade(doc) {
    const cab = acharCabecalho(doc);
    if (!cab) return null;
    const cabecalhos = rotulosDe(cab);
    let registros = porEstrutura(cab, cabecalhos);
    if (!registros.length) registros = porPosicao(doc, cab, cabecalhos);
    return { cab, cabecalhos: cabecalhos.filter(Boolean), registros };
  }
  /** "Exibindo 12 registro(s)" / "Exibindo 1 a 100 de 230" → o total; "Nenhum resultado" → 0 (no bloco da grade). */
  function totalDoRodape(raiz) {
    if (!raiz) return null;
    let n = raiz;
    for (let i = 0; n && i < 10; i++, n = n.parentElement) {
      const t = texto(n);
      if (/EXIBINDO|NENHUM RESULTADO/.test(t)) {
        const de = /EXIBINDO\s+\d+\s*(?:A|-)\s*\d+\s+DE\s+(\d+)/.exec(t);
        if (de) return Number(de[1]);
        const m = /EXIBINDO\s+(\d+)\s+REGISTRO/.exec(t);
        if (m) return Number(m[1]);
        if (/NENHUM RESULTADO/.test(t)) return 0;
      }
    }
    return null;
  }
  function botaoProxima(raiz) {
    return (
      todos(raiz).find((el) => {
        if (!visivel(el) || el.disabled || attr(el, "aria-disabled") === "true") return false;
        const r = `${norm(attr(el, "aria-label"))} ${norm(attr(el, "title"))}`;
        return /PROXIMA|NEXT/.test(r) || ["›", ">", "»"].includes(String(el.textContent ?? "").trim());
      }) ?? null
    );
  }
  /** O bloco da grade (para o rodapé e a paginação): o ancestral do cabeçalho que tem o "Exibindo…". */
  function blocoDaGrade(cab, doc) {
    let n = cab;
    for (let i = 0; n && i < 10; i++, n = n.parentElement) if (/EXIBINDO|NENHUM RESULTADO/.test(texto(n))) return n;
    return doc.body ?? null;
  }

  /** A FORMA da tela (sem dados de sessão), para ajustar a leitura quando a Centi muda. */
  function diagnostico(doc, etapa, notas = []) {
    const forma = (el) => (el ? `${String(el.tagName ?? "").toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join(".")}` : ""}[${el.children?.length ?? 0}]` : "—");
    const l = [`etapa: ${etapa}`, ...notas];
    try {
      l.push(
        `rótulos: PROTOCOLO=${porTexto(doc, (s) => s === "PROTOCOLO").length} ANO=${porTexto(doc, (s) => s === "ANO").length} INTERESSADO=${porTexto(doc, (s) => s === "INTERESSADO").length}`,
      );
      l.push(`aba Em Análise: ${contagemAba(doc, "EM ANALISE")}`);
      const cab = acharCabecalho(doc);
      if (cab) {
        l.push(`cabeçalho: ${forma(cab)} colunas=${rotulosDe(cab).join("|")}`);
        let c = cab.parentElement;
        const sobe = [];
        for (let i = 0; c && i < 5; i++, c = c.parentElement) sobe.push(forma(c));
        l.push(`acima: ${sobe.join(" < ")}`);
        l.push(`rodapé: ${totalDoRodape(cab)}`);
        const g = lerGrade(doc);
        l.push(`lidos: ${g?.registros.length ?? 0}`);
      } else l.push("cabeçalho: não achado");
      const nums = todos(doc.body ?? doc)
        .filter((el) => visivel(el) && !el.children.length && /^\d{4,7}$/.test(celula(el)))
        .slice(0, 3);
      for (const n of nums) {
        const sobe = [];
        let c = n;
        for (let i = 0; c && i < 6; i++, c = c.parentElement) sobe.push(forma(c));
        l.push(`número ${celula(n)}: ${sobe.join(" < ")}`);
      }
    } catch (e) {
      l.push(`falha no diagnóstico: ${e?.message}`);
    }
    return l.join("\n").slice(0, 1800);
  }

  /** Escolhe as repartições, pesquisa (lupa) e abre a aba "Em Análise": devolve a contagem da aba. */
  async function irParaEmAnalise(ctx, nomes) {
    const { doc, win } = ctx;
    if (!Array.isArray(nomes) || !nomes.length || nomes.length > 50 || nomes.some((n) => typeof n !== "string" || !n.trim() || n.length > 120))
      throw new Error("Escolha de 1 a 50 repartições.");
    ctx.etapa = "abrir a Tela Protocolo";
    const painel = await abrirTela(ctx);
    ctx.etapa = "escolher as repartições";
    await escolherDepartamentos(ctx, painel, nomes);
    ctx.etapa = "pesquisar (lupa)";
    const lupa = botaoPesquisar(painel);
    if (!lupa) throw new Error("Não achei o botão de pesquisar (lupa) da Tela Protocolo.");
    clicar(win, lupa);
    await pausa(win, ctx.passo ?? 250);
    // A pesquisa termina quando a contagem da aba para de mudar (3 leituras iguais).
    let ultima;
    let iguais = 0;
    await esperarAte(
      ctx,
      () => {
        const c = contagemAba(doc, "EM ANALISE");
        if (c === null) return null;
        if (c === ultima) iguais++;
        else {
          iguais = 0;
          ultima = c;
        }
        return iguais >= 3 || null;
      },
      "A pesquisa não terminou (não achei a aba Em Análise).",
    );
    ctx.etapa = "abrir a aba Em Análise";
    abrirAba(ctx, "EM ANALISE");
    return contagemAba(doc, "EM ANALISE");
  }

  /** O elemento que ROLA as linhas da grade (o ancestral da 1ª linha com rolagem vertical), ou null. */
  function rolador(grade, win) {
    let n = grade.registros.find((r) => r.el)?.el ?? null;
    for (let i = 0; n && i < 10; i++, n = n.parentElement) {
      if (!(n.scrollHeight > n.clientHeight + 4)) continue;
      const oy = win.getComputedStyle?.(n)?.overflowY ?? "";
      if (/auto|scroll/.test(oy)) return n;
    }
    return null;
  }

  /**
   * Os protocolos pelos DADOS do controle da grade (a página inteira — a tela desenha só as linhas visíveis — e o Id de
   * cada um), lidos no script da página. `mostrar` = um nº de protocolo que a grade traz à vista. Sem o controle, null.
   */
  async function dadosDaGrade(ctx, mostrar) {
    if (typeof ctx.pagina !== "function") return null;
    const r = await ctx.pagina("grade", mostrar ? { mostrar: String(mostrar) } : null, 8000).catch(() => null);
    if (!r?.ok || !Array.isArray(r.colunas) || !Array.isArray(r.linhas)) return null;
    const cabecalhos = r.colunas.map((c) => norm(c));
    const registros = [];
    for (const l of r.linhas) {
      const reg = registro(cabecalhos, (Array.isArray(l?.valores) ? l.valores : []).map((v) => String(v ?? "").replace(/\s+/g, " ").trim()));
      if (!reg) continue;
      reg.id = String(l.id ?? "").replace(/\D/g, "").slice(0, 12);
      registros.push(reg);
    }
    ctx.chavesGrade = Array.isArray(r.chaves) ? r.chaves.slice(0, 40) : [];
    return { cab: acharCabecalho(ctx.doc), cabecalhos: cabecalhos.filter(Boolean), registros, completa: true };
  }

  /** Percorre as páginas da grade: `cada(grade)` recebe cada página lida; devolver true PARA. */
  async function percorrerGrade(ctx, esperado, cada) {
    const { doc, win } = ctx;
    ctx.etapa = "ler a grade";
    const unicos = new Set();
    let primeiroAntes = null;
    for (let pagina = 0; pagina < 50; pagina++) {
      let anterior = null;
      let estavel = 0;
      // A grade carrega depois do clique: espera a página ficar igual em 3 leituras (e, depois de "Próxima", ser OUTRA
      // página). Aba sem protocolos = espera curta (a contagem pode chegar atrasada) e termina vazia.
      const prazo = esperado === 0 ? Math.min(ctx.prazo ?? 15000, 3000) : undefined;
      const grade = await esperarAte(
        ctx,
        async () => {
          const gr = (await dadosDaGrade(ctx)) ?? lerGrade(doc);
          const n = gr ? gr.registros.length : -1;
          const marca = gr ? `${n}|${gr.registros[0]?.protocolo ?? ""}` : "-";
          if (marca === anterior) estavel++;
          else {
            estavel = 0;
            anterior = marca;
          }
          if (estavel < 2 || !gr) return null;
          if (n > 0 && gr.registros[0].protocolo !== primeiroAntes) return gr;
          if (n === 0 && gr.cab && totalDoRodape(gr.cab) === 0) return gr;
          return null;
        },
        "Não consegui ler os protocolos da aba Em Análise.",
        prazo,
      ).catch((e) => {
        if (esperado === 0) return { cab: null, cabecalhos: [], registros: [] };
        throw e;
      });
      const ver = (g) => {
        for (const r of g.registros) unicos.add(`${r.protocolo}|${r.ano}`);
        return cada(g) === true;
      };
      if (ver(grade)) return;
      if (!grade.cab) return;
      primeiroAntes = grade.registros[0]?.protocolo ?? null;
      // Sem os dados do controle, a tela desenha só as linhas VISÍVEIS: rola por dentro até o fim, lendo a cada passo.
      const sc = grade.completa ? null : rolador(grade, win);
      if (sc && sc.scrollTop > 0) {
        sc.scrollTop = 0;
        sc.dispatchEvent(new win.Event("scroll", { bubbles: true }));
        await pausa(win, (ctx.passo ?? 250) * 2);
        const g = lerGrade(doc);
        if (g && ver(g)) return;
      }
      for (let k = 0; sc && k < 400; k++) {
        const antes = sc.scrollTop;
        sc.scrollTop = antes + Math.max(40, Math.floor(sc.clientHeight * 0.8));
        sc.dispatchEvent(new win.Event("scroll", { bubbles: true }));
        if (sc.scrollTop <= antes) break;
        await pausa(win, (ctx.passo ?? 250) * 2);
        const g = lerGrade(doc);
        if (g && ver(g)) return;
      }
      const total = totalDoRodape(grade.cab) ?? esperado;
      if (total == null || unicos.size >= total) return;
      const prox = botaoProxima(blocoDaGrade(grade.cab, doc));
      if (!prox) return;
      clicar(win, prox);
      await pausa(win, (ctx.passo ?? 250) * 2);
    }
  }

  async function emAnalise(ctx, nomes) {
    const esperado = await irParaEmAnalise(ctx, nomes);
    const registros = new Map();
    let cabecalhos = [];
    await percorrerGrade(ctx, esperado, (grade) => {
      if (grade.cabecalhos.length) cabecalhos = grade.cabecalhos;
      // Só os dados (a célula da tela não vai na resposta).
      for (const r of grade.registros) registros.set(`${r.protocolo}|${r.ano}`, { ...r });
    });
    const lista = [...registros.values()];
    if (esperado && lista.length === 0) throw new Error(`A aba Em Análise indica ${esperado} protocolo(s), mas não consegui ler a grade.`);
    return { protocolos: lista, total: esperado || lista.length, cabecalhos };
  }

  // ---------------------------------------------------------------- UM PROTOCOLO: OS DADOS E O DOCUMENTO
  const soDigitos = (v) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const casaLinha = (r, protocolo, ano) => soDigitos(r.protocolo) === soDigitos(protocolo) && (!ano || !r.ano || soDigitos(r.ano) === soDigitos(ano));

  /** A célula do nº do protocolo NA TELA: a grade a traz à vista (pelo controle) e, sem ele, rola o corpo até achá-la. */
  async function celulaNaTela(ctx, protocolo, ano) {
    const { doc, win } = ctx;
    const naTela = () => lerGrade(doc)?.registros.find((r) => casaLinha(r, protocolo, ano) && r.el)?.el ?? null;
    await dadosDaGrade(ctx, soDigitos(protocolo));
    await pausa(win, ctx.passo ?? 250);
    let el = naTela();
    if (el) return el;
    const g0 = lerGrade(doc);
    const sc = g0 && rolador(g0, win);
    if (!sc) return null;
    sc.scrollTop = 0;
    for (let k = 0; k < 400 && !el; k++) {
      sc.dispatchEvent(new win.Event("scroll", { bubbles: true }));
      await pausa(win, (ctx.passo ?? 250) * 2);
      el = naTela();
      const antes = sc.scrollTop;
      if (!el) sc.scrollTop = antes + Math.max(40, Math.floor(sc.clientHeight * 0.8));
      if (!el && sc.scrollTop <= antes) break;
    }
    return el;
  }

  /** O protocolo na grade (a página à vista; senão pesquisa de novo e percorre as páginas) e a célula dele NA TELA. */
  async function acharLinha(ctx, protocolo, ano, nomes) {
    ctx.etapa = "achar o protocolo na grade";
    let reg = ((await dadosDaGrade(ctx)) ?? lerGrade(ctx.doc))?.registros.find((r) => casaLinha(r, protocolo, ano)) ?? null;
    if (!reg) {
      if (!Array.isArray(nomes) || !nomes.length) throw new Error(`O protocolo ${protocolo} não está na grade da Tela Protocolo — leia “Em Análise” de novo.`);
      const esperado = await irParaEmAnalise(ctx, nomes);
      await percorrerGrade(ctx, esperado, (grade) => {
        reg = grade.registros.find((r) => casaLinha(r, protocolo, ano)) ?? null;
        return !!reg;
      });
      if (!reg) throw new Error(`O protocolo ${protocolo}${ano ? `/${ano}` : ""} não está mais em “Em Análise” nas repartições escolhidas.`);
    }
    const el = reg.el ?? (await celulaNaTela(ctx, protocolo, ano));
    if (!el) throw new Error(`Achei o protocolo ${protocolo} na grade, mas a linha dele não apareceu na tela.`);
    return { reg, el };
  }

  /** O cadastro aberto do protocolo (o título "Protocolo - <Id>" com o botão Operações e os campos). */
  const RE_TITULO = /^PROTOCOLO - \d+$/;
  /** TODOS os cadastros de protocolo abertos (a Centi pode deixar mais de um). */
  function cadastrosAbertos(doc) {
    const out = [];
    for (const t of porTexto(doc, (s) => RE_TITULO.test(s))) {
      let n = t.parentElement;
      for (let i = 0; n && i < 10; i++, n = n.parentElement)
        if (porTexto(n, (s) => s === "OPERACOES").length && todos(n).some((el) => el.tagName === "INPUT" && visivel(el))) {
          if (!out.includes(n)) out.push(n);
          break;
        }
    }
    return out;
  }
  /** O cadastro aberto; com `protocolo`, SÓ o desse protocolo (o campo Protocolo confere) — nunca o de outro que ficou aberto. */
  function acharModal(doc, protocolo) {
    const abertos = cadastrosAbertos(doc);
    if (protocolo == null) return abertos[0] ?? null;
    return abertos.find((m) => soDigitos(valorDe(lerCadastro(m), "PROTOCOLO")) === soDigitos(protocolo)) ?? null;
  }

  const CAMPO = new Set(["INPUT", "TEXTAREA", "SELECT"]);
  /** Os elementos que SÃO ou CONTÊM um campo/botão (calculado uma vez por leitura — subindo de cada um até a raiz). */
  function comCampos(raiz, lista) {
    const set = new Set();
    for (const el of lista)
      if (CAMPO.has(el.tagName) || ehBotao(el)) for (let n = el; n && n !== raiz && !set.has(n); n = n.parentElement) set.add(n);
    return set;
  }
  /** O rótulo de um campo: o texto mais próximo ANTES dele que não é campo nem botão (o "*" de obrigatório sai). */
  function rotuloAntes(lista, i, ocupados) {
    for (let j = i - 1, k = 0; j >= 0 && k < 30; j--, k++) {
      const o = lista[j];
      if (ocupados.has(o)) continue;
      const t = celula(o).replace(/\*/g, "").replace(/\s+/g, " ").trim();
      if (t && t.length <= 60) return t;
    }
    return null;
  }
  /** TODOS os campos do cadastro como a Centi mostra: [{ rotulo, valor }] (os campos de um mesmo rótulo — código + nome
   * do interessado — juntos; o seletor, pelo texto escolhido). */
  function lerCadastro(modal) {
    const lista = todos(modal);
    const ocupados = comCampos(modal, lista);
    const posicao = new Map(lista.map((el, i) => [el, i]));
    const porRotulo = new Map();
    const usados = new Set();
    for (const el of lista) {
      if (!CAMPO.has(el.tagName) || !visivel(el) || /^(checkbox|radio|hidden|button|submit|file|image|password)$/i.test(String(el.type ?? ""))) continue;
      const combo = attr(el, "role") === "combobox" || attr(el, "aria-autocomplete") === "list";
      let caixa = el;
      if (combo)
        for (let n = el.parentElement, i = 0; n && n !== modal && i < 4; n = n.parentElement, i++)
          if (celula(n)) {
            caixa = n;
            break;
          }
      if (usados.has(caixa)) continue;
      usados.add(caixa);
      const valor = (String(el.value ?? "").trim() || (caixa !== el ? celula(caixa) : "")).slice(0, 2000);
      const rotulo = rotuloAntes(lista, posicao.get(caixa) ?? -1, ocupados);
      if (!rotulo) continue;
      const atual = porRotulo.get(rotulo);
      if (atual === undefined) porRotulo.set(rotulo, valor);
      else if (valor) porRotulo.set(rotulo, atual ? `${atual} ${valor}` : valor);
    }
    return [...porRotulo].slice(0, 80).map(([rotulo, valor]) => ({ rotulo, valor }));
  }
  const valorDe = (campos, rot) => campos.find((c) => norm(c.rotulo) === rot)?.valor ?? "";

  function botaoDe(el) {
    for (let n = el; n; n = n.parentElement) if (ehBotao(n)) return n;
    return null;
  }
  /** Clica só se o botão for EXATAMENTE o permitido (a exceção à lista negra: Operações → Emitir documentos). */
  function clicarSo(win, el, permitido) {
    const b = botaoDe(el) ?? el;
    const rot = texto(b) || norm(attr(b, "aria-label")) || norm(attr(b, "title"));
    if (!permitido.test(rot)) throw new Error(`Bloqueado: a automação não aciona “${String(b.textContent ?? "").trim().slice(0, 40)}”.`);
    const M = win.MouseEvent ?? win.Event;
    for (const tipo of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new M(tipo, { bubbles: true, cancelable: true, button: 0 }));
  }
  // O "fechar" de uma janela: o × (texto), o aria-label/title Fechar/Close ou a classe close/fechar/times — nunca o "×" de
  // um chip do seletor Departamentos (react-select) nem nada dentro da grade (Wijmo).
  const CLASSE_FECHAR = /(^|[\s_-])(close|fechar|times|btn-close)([\s_-]|$)/i;
  function ehFechar(el) {
    if (!visivel(el)) return false;
    const cls = String(attr(el, "class") ?? "");
    if (/indicator|multi-?value|multivalue|wj-/i.test(cls)) return false;
    const t = String(el.textContent ?? "").trim();
    return (
      (!el.children.length && /^[×✕✖X]$/.test(t)) ||
      /^(FECHAR|CLOSE)$/.test(norm(attr(el, "aria-label"))) ||
      /^(FECHAR|CLOSE)$/.test(norm(attr(el, "title"))) ||
      CLASSE_FECHAR.test(cls)
    );
  }
  /** Fecha UM cadastro: Escape e o "fechar" mais perto dele (subindo até a janela, sem chegar ao filtro nem à grade). */
  function fecharModal(ctx, modal) {
    try {
      tecla(ctx.win, ctx.doc.activeElement ?? ctx.doc.body ?? modal, "Escape");
      let n = modal;
      for (let i = 0; n && n !== ctx.doc.body && i < 12; i++, n = n.parentElement) {
        if (i > 0 && (campoDepartamentos(n) || todos(n).some((el) => /\bwj-control\b/.test(String(attr(el, "class") ?? ""))))) break;
        const x = todos(n).find((el) => ehFechar(el) && !el.closest?.(".wj-control"));
        if (x) {
          clicar(ctx.win, botaoDe(x) ?? x);
          return;
        }
      }
    } catch {}
  }
  /** Fecha TODOS os cadastros abertos (o novo só abre — e só é achado — sem o de outro protocolo na frente). */
  async function fecharCadastros(ctx) {
    for (let k = 0; k < 6; k++) {
      const abertos = cadastrosAbertos(ctx.doc);
      if (!abertos.length) return;
      for (const m of abertos) fecharModal(ctx, m);
      await pausa(ctx.win, ctx.passo ?? 400);
    }
  }

  // Os botões que podem CONFIRMAR a janela que a emissão abrir (nunca Sim, Salvar, Anexar, Assinar…).
  const CONFIRMA = /^(EMITIR|EMITIR DOCUMENTOS|PROCESSAR|GERAR|GERAR PDF|IMPRIMIR|VISUALIZAR|OK|CONFIRMAR)$/;
  const fontesVisiveis = (doc) =>
    todos(doc)
      .filter((el) => /^(IFRAME|EMBED|OBJECT)$/.test(el.tagName))
      .map((el) => attr(el, "src") || attr(el, "data") || "")
      .filter(Boolean);

  async function emitirDocumento(ctx, protocolo, ano, nomes) {
    const { doc, win } = ctx;
    if (!/^\d{1,12}$/.test(soDigitos(protocolo) || "x")) throw new Error("Protocolo inválido.");
    if (typeof ctx.pagina !== "function") throw new Error("Ponte com a página ausente — atualize a extensão.");
    ctx.etapa = "fechar os cadastros abertos";
    await fecharCadastros(ctx);
    const linha = await acharLinha(ctx, protocolo, ano, nomes);
    // Abre o cadastro do protocolo: a linha à vista e o DUPLO CLIQUE no centro da célula do nº (como a pessoa faz).
    ctx.etapa = "abrir o protocolo";
    linha.el.scrollIntoView?.({ block: "center" });
    await pausa(win, ctx.passo ?? 250);
    const alvo = lerGrade(doc)?.registros.find((r) => casaLinha(r, protocolo, ano) && r.el)?.el ?? linha.el;
    if (!seguro(alvo)) throw new Error("Bloqueado: a célula do protocolo não é um botão.");
    mouse(win, alvo, true);
    ctx.notas = [];
    const modal = await esperarAte(ctx, () => acharModal(doc, protocolo), "O cadastro do protocolo não abriu na Tela Protocolo.").catch((e) => {
      const b = typeof alvo.getBoundingClientRect === "function" ? alvo.getBoundingClientRect() : null;
      ctx.notas = [
        `célula: ${String(alvo.tagName ?? "").toLowerCase()}.${String(alvo.className ?? "").split(/\s+/).slice(0, 3).join(".")} em ${b ? `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}` : "?"}`,
        `cadastros abertos: ${porTexto(doc, (t) => RE_TITULO.test(t)).map((el) => texto(el)).slice(0, 3).join(" | ") || "nenhum"}`,
      ];
      throw e;
    });
    ctx.etapa = "ler o cadastro";
    const campos = lerCadastro(modal);
    const dados = { campos, id: soDigitos(valorDe(campos, "ID")) || linha.reg.id || null };
    // EMITIR DOCUMENTOS: Operações (do cadastro) → Emitir documentos; o PDF que a Centi gerar é capturado na página.
    ctx.etapa = "emitir documentos";
    const antes = new Set(todos(doc).filter((el) => ehBotao(el) && visivel(el)));
    const fontesAntes = new Set(fontesVisiveis(doc));
    const r0 = await ctx.pagina("captura", { acao: "iniciar" }, 5000);
    if (!r0?.ok) throw new Error(r0?.erro || "A página da Centi não respondeu — aperte F5 na aba.");
    try {
      if (!porTexto(doc, (s) => s === "EMITIR DOCUMENTOS").length) {
        const op = porTexto(modal, (s) => s === "OPERACOES")[0];
        if (!op) throw new Error("Não achei o botão Operações do protocolo.");
        clicarSo(win, op, /^OPERACOES$/);
      }
      const item = await esperarAte(ctx, () => porTexto(doc, (s) => s === "EMITIR DOCUMENTOS")[0], "O menu Operações não mostrou “Emitir documentos”.");
      clicarSo(win, item, /^EMITIR DOCUMENTOS$/);
      const clicados = new Set();
      const fim = Date.now() + (ctx.prazoEmissao ?? 120000);
      for (;;) {
        await pausa(win, ctx.passo ?? 400);
        const urls = fontesVisiveis(doc).filter((u) => !fontesAntes.has(u));
        const r = await ctx.pagina("captura", { acao: "ler", urls }, 30000);
        if (!r?.ok) throw new Error(r?.erro || "A página da Centi não respondeu — aperte F5 na aba.");
        if (r.pronto) {
          const arquivo = r.pdf ? { pdf: r.pdf } : r.resposta ? { resposta: r.resposta } : { link: r.link };
          // O operation que a tela usou: o sistema aprende a emissão "por código" (o parâmetro com o Id).
          return { dados, arquivo, operacao: r.operacao && typeof r.operacao === "object" ? r.operacao : null };
        }
        // A emissão abriu uma janela: o botão de confirmar (só os da lista; cada um uma vez).
        const novos = todos(doc).filter((el) => ehBotao(el) && visivel(el) && !antes.has(el));
        const confirmar = novos.find((el) => !clicados.has(el) && CONFIRMA.test(texto(el) || norm(attr(el, "aria-label"))) && seguro(el));
        if (confirmar && clicados.size < 3) {
          clicados.add(confirmar);
          clicar(win, confirmar);
        }
        if (Date.now() > fim) {
          ctx.notas = [
            `janela: ${novos.map((el) => texto(el) || norm(attr(el, "aria-label")) || "(ícone)").slice(0, 15).join(" | ") || "nenhum botão novo"}`,
            `capturado: ${JSON.stringify(r.vistos ?? {}).slice(0, 400)}`,
            ...(r.ultima ? [`última resposta: ${r.ultima.status} ${String(r.ultima.b64 ?? "").slice(0, 300)}`] : []),
          ];
          throw new Error("A Centi não entregou o PDF do “Emitir documentos”.");
        }
      }
    } finally {
      await ctx.pagina("captura", { acao: "parar" }, 5000).catch(() => null);
      fecharModal(ctx, modal);
      await fecharCadastros(ctx).catch(() => undefined);
    }
  }

  /** O ponto de entrada da ponte: "telaDepartamentos" | "telaEmAnalise" | "telaEmitir" (os dados e o documento de UM). */
  async function executar(acao, dados, ctx0) {
    const ctx = { ...ctx0 };
    try {
      if (acao === "telaDepartamentos") return { ok: true, departamentos: await departamentos(ctx) };
      if (acao === "telaEmAnalise") return { ok: true, ...(await emAnalise(ctx, dados?.departamentos)) };
      if (acao === "telaEmitir") return { ok: true, ...(await emitirDocumento(ctx, dados?.protocolo, dados?.ano, dados?.departamentos)) };
      return { ok: false, erro: "Ação desconhecida." };
    } catch (e) {
      return { ok: false, erro: e?.message || "Falha na Tela Protocolo.", diagnostico: diagnostico(ctx.doc, ctx.etapa ?? acao, [...(ctx.notas ?? []), ...(ctx.chavesGrade ? [`dados da grade: ${ctx.chavesGrade.join(", ").slice(0, 300) || "—"}`] : [])]) };
    }
  }

  g.__pcaCentiTela = Object.freeze({ versao: VERSAO, norm, diagnostico, acharCabecalho, seguro, acharTela, campoDepartamentos, botaoPesquisar, lerGrade, lerCadastro, totalDoRodape, contagemAba, escolhidos, executar });
})();
