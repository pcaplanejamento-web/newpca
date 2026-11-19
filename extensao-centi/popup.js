// O POPUP da extensão (o banner do ícone) = os AJUSTES da Automação do sistema, com as MESMAS seções e peças (Login da
// Centi · Gravação na Centi + Histórico das execuções · Gravador de receitas · Emissão do DFD · Órgão na Centi · Avançado),
// mais a VERSÃO, a situação da Centi (deixada pronta ao abrir), o andamento e o Interromper. Tudo o que se muda aqui vai
// DIRETO ao sistema pelo serviço da extensão (as mesmas rotas da tela, por quem está logado) e fica salvo lá; nada fica
// guardado na extensão — a senha digitada só existe no campo até o envio.
(() => {
  const $ = (id) => document.getElementById(id);
  const janela = new URLSearchParams(location.search).has("janela");
  if (janela) document.body.classList.add("janela");
  const pedir = (m) => chrome.runtime.sendMessage(m).catch(() => null);
  const el = (tag, props = {}, filhos = []) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...filhos);
    return e;
  };

  // ---------------------------------------------------------------- A VERSÃO (e a nova, que o sistema recomenda)
  const manifesto = chrome.runtime.getManifest();
  const versao = manifesto.version;
  $("versao").textContent = `v${versao}`;
  // A logo do sistema (o ícone que o zip da extensão leva quando o ADM a definiu em Identidade).
  const icone = $("icone");
  const arquivoIcone = manifesto.icons?.["48"] ?? manifesto.icons?.["32"];
  if (arquivoIcone) {
    icone.addEventListener("load", () => {
      icone.hidden = false;
    });
    icone.addEventListener("error", () => icone.remove());
    icone.src = arquivoIcone;
  } else icone.remove();
  const partes = (v) => String(v ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const maisNova = (a, b) => {
    const [x, y] = [partes(a), partes(b)];
    for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
    return false;
  };
  function mostrarVersaoNova(recomendada) {
    const tem = !!recomendada && maisNova(recomendada, versao);
    $("nova").hidden = !tem;
    if (tem) {
      $("nova").textContent = `Nova ${recomendada}`;
      $("nova").title = `Há a versão ${recomendada} — com o atualizador instalado, ela entra sozinha (ou toque em Atualizar agora).`;
    }
  }

  // ---------------------------------------------------------------- PEÇAS: o Switch e o (?) dos Ajustes do sistema
  function switchDe(id, aoMudar) {
    const b = $(id);
    const linha = b.closest(".switch");
    const alternar = () => {
      if (!b.disabled) aoMudar(b.getAttribute("aria-checked") !== "true");
    };
    b.addEventListener("click", (e) => {
      e.preventDefault();
      alternar();
    });
    linha?.addEventListener("click", (e) => {
      if (e.target !== b) {
        e.preventDefault();
        alternar();
      }
    });
    return {
      definir(v, desligado = false) {
        b.setAttribute("aria-checked", String(!!v));
        b.disabled = desligado;
        linha?.classList.toggle("desligado", desligado);
      },
    };
  }
  $("ajudaLogin").addEventListener("click", () => {
    const aberta = $("ajudaLogin").getAttribute("aria-expanded") === "true";
    $("ajudaLogin").setAttribute("aria-expanded", String(!aberta));
    $("textoAjudaLogin").hidden = aberta;
  });

  // ---------------------------------------------------------------- A CENTI
  const CENTI = {
    logada: ["Centi pronta", "Logada na aba da automação", "ok"],
    login: ["Centi na tela de login", "Entrando com o login guardado…", "warn"],
    semSessao: ["Preparando a Centi", "Lendo a sessão na aba da automação…", "warn"],
    semAba: ["Aba da automação fechada", "Toque em Entrar agora para abrir", "danger"],
  };
  let aberta = null;
  function mostrarCenti(r) {
    if (!r?.ok) {
      $("centiTitulo").textContent = "A extensão não respondeu";
      $("centiDetalhe").textContent = "Feche e abra este painel de novo.";
      $("ponto").className = "ponto danger";
      $("entrar").hidden = true;
      return;
    }
    const l = r.login;
    let [titulo, detalhe, cor] = CENTI[r.centi] ?? ["Centi", "", ""];
    if (l?.semSistema) [titulo, detalhe, cor] = ["Sistema PCA desconectado", l.erro ?? "Entre no sistema PCA neste navegador.", "danger"];
    else if (r.centi === "login" && (!l?.credenciais || l.pausado || !l.auto))
      detalhe = !l?.credenciais ? "Salve o login abaixo para ela entrar sozinha" : l.pausado ? "Login pausado — confira e salve abaixo" : "Entrar sozinho está desligado";
    if (r.centi === "logada" && r.entidade) detalhe = `${detalhe} · órgão ${r.entidade}`;
    aberta = r.entidade ?? null;
    $("centiTitulo").textContent = titulo;
    $("centiDetalhe").textContent = detalhe;
    $("ponto").className = `ponto ${cor}${r.centi === "logada" || l?.semSistema ? "" : " vivo"}`;
    $("entrar").hidden = !(l?.credenciais && !l.pausado && !l.semSistema && r.centi !== "logada");
  }
  $("entrar").addEventListener("click", async () => {
    $("entrar").disabled = true;
    $("entrar").replaceChildren(el("span", { className: "gira" }), "Entrando…");
    const r = await pedir({ tipo: "entrarAgora" });
    $("entrar").disabled = false;
    $("entrar").textContent = "Entrar agora";
    if (!r?.ok) msg(r?.erro ?? "Não consegui entrar.", "danger");
    await carregar();
    acompanhar();
  });

  // ---------------------------------------------------------------- A PERMISSÃO de gravar na Centi
  // (o serviço pede; só este painel da extensão responde — a página do sistema não o alcança)
  let pedidoAtual = null;
  function mostrarConfirmacao(c) {
    const valida = !!c && typeof c.pedido === "string" && (!c.ate || c.ate > Date.now());
    pedidoAtual = valida ? c.pedido : null;
    $("confirmacao").hidden = !valida;
    if (!valida) return;
    $("confProtocolo").textContent = `${c.numero ?? ""}${c.ano ? `/${c.ano}` : ""}`;
    $("confId").textContent = c.id ?? "";
    $("confDescricao").textContent = c.descricao ?? "";
    $("confExecucao").textContent = `nº ${c.execucao ?? ""}`;
    $("confPrazo").textContent = c.ate ? `Sem resposta até ${new Date(c.ate).toLocaleTimeString("pt-BR", { timeStyle: "short" })}, não grava.` : "";
    $("confSim").disabled = false;
    $("confNao").disabled = false;
    $("confNao").focus();
  }
  async function responderConfirmacao(sim) {
    if (!pedidoAtual) return;
    $("confSim").disabled = true;
    $("confNao").disabled = true;
    await pedir({ tipo: "confirmacao", pedido: pedidoAtual, sim });
    mostrarConfirmacao(null);
    if (janela && new URLSearchParams(location.search).has("confirmar")) window.close();
  }
  $("confSim").addEventListener("click", () => responderConfirmacao(true));
  $("confNao").addEventListener("click", () => responderConfirmacao(false));

  // ---------------------------------------------------------------- O ANDAMENTO
  const ESTADO = { rodando: ["Em andamento", "blue"], concluido: ["Concluído", "emerald"], interrompido: ["Interrompido", "red"], parado: ["Parou", "amber"] };
  function mostrarAtividade(a) {
    $("atividade").hidden = !a;
    $("parar").hidden = a?.estado !== "rodando";
    $("parar").disabled = false;
    $("parar").textContent = "Interromper";
    if (!a) return;
    const [rotulo, cor] = ESTADO[a.estado] ?? [a.estado, ""];
    $("titulo").textContent = a.titulo ?? "";
    $("estadoLote").textContent = rotulo;
    $("estadoLote").className = `badge dot ${cor}`;
    $("passo").textContent = `${a.passo ?? ""}${a.total ? ` (${Math.min(a.feito, a.total)} de ${a.total})` : ""}`;
    $("barra").style.width = a.total ? `${Math.round((Math.min(a.feito, a.total) / a.total) * 100)}%` : "0";
    $("passos").replaceChildren(...(a.passos ?? []).slice(0, 10).map((p) => el("li", { textContent: p.texto })));
  }
  $("parar").addEventListener("click", async () => {
    $("parar").disabled = true;
    $("parar").textContent = "Interrompendo…";
    await pedir({ tipo: "interromper" });
  });

  // ---------------------------------------------------------------- LOGIN DA CENTI
  const dataHora = (iso) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  function haQuanto(iso) {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return "agora";
    if (s < 3600) return `há ${Math.round(s / 60)} min`;
    if (s < 86400) return `há ${Math.round(s / 3600)} h`;
    const d = Math.round(s / 86400);
    return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  }
  let login = null;
  let auto = true;
  let salvando = false;
  const autoSw = switchDe("auto", (v) => {
    auto = v;
    autoSw.definir(v);
    atualizarBotoes();
  });
  function msg(texto, cor) {
    $("msg").textContent = texto ?? "";
    $("msg").className = `msg ${cor ?? ""}`;
  }
  const mudou = () => !!$("usuario").value.trim() || !!$("senha").value || (login?.credenciais === true && (auto !== login.auto || login.pausado));
  const falta = () => !login?.credenciais && (!$("usuario").value.trim() || !$("senha").value);
  function atualizarBotoes() {
    $("salvar").disabled = salvando || !login || !!login.semSistema || login.disponivel === false || !mudou() || falta();
    $("salvarTexto").textContent = salvando ? "Salvando…" : login?.pausado ? "Salvar e retomar" : "Salvar";
  }
  function selo(texto, cor) {
    $("loginSelo").textContent = texto;
    $("loginSelo").className = `badge dot ${cor}`;
    $("loginSelo").title = texto;
  }
  function mostrarLogin(l) {
    login = l;
    const bloqueado = !l || !!l.semSistema || l.disponivel === false;
    for (const id of ["usuario", "senha", "olho"]) $(id).disabled = bloqueado;
    for (const id of ["usuario", "senha"]) $(id).closest(".caixa").classList.toggle("desligada", bloqueado);
    $("semChave").hidden = !(l && !l.semSistema && l.disponivel === false);
    if (!l) selo("A extensão não respondeu", "red");
    else if (l.semSistema) selo(l.erro ?? "Entre no sistema PCA neste navegador", "amber");
    else if (l.pausado) selo(`Pausado — ${l.motivo ?? "a Centi recusou a senha"}. Confira e salve para retomar.`, "amber");
    else if (l.ilegivel) selo("O login guardado não abre (a chave do sistema mudou) — salve de novo", "red");
    else if (l.credenciais)
      selo(`Guardado${l.atualizadoEm ? ` em ${dataHora(l.atualizadoEm)}` : ""}${l.ultimoUsoEm ? ` · usado ${haQuanto(l.ultimoUsoEm)}` : ""}`, "emerald");
    else selo("Não configurado", "amber");
    $("usuario").placeholder = l?.credenciais && l.usuario ? `${l.usuario} (guardado)` : "Usuário da Centi";
    $("senha").placeholder = l?.credenciais ? "•••••• (guardada)" : "Senha da Centi";
    $("remover").hidden = !l?.credenciais || !!l.semSistema;
    $("removerConfirma").hidden = true;
    if (l && !l.semSistema) auto = l.auto !== false;
    autoSw.definir(auto, bloqueado);
    atualizarBotoes();
    // O login da versão anterior da extensão: a PESSOA decide para qual conta ele vai (nunca sozinho).
    $("antigo").hidden = !l?.antigo;
    if (l?.antigo) $("antigoTexto").textContent = `Há um login da Centi da versão anterior nesta extensão. Enviar para a conta ${l.conta ?? "logada"} no sistema?`;
    mostrarVersaoNova(l?.recomendada ?? null);
  }
  $("usuario").addEventListener("input", atualizarBotoes);
  $("senha").addEventListener("input", atualizarBotoes);
  $("olho").addEventListener("click", () => {
    const ver = $("senha").type === "password";
    $("senha").type = ver ? "text" : "password";
    $("olho").setAttribute("aria-pressed", String(ver));
    $("olho").setAttribute("aria-label", ver ? "Esconder a senha" : "Mostrar a senha");
  });
  function limparCampos() {
    $("usuario").value = "";
    $("senha").value = "";
    $("senha").type = "password";
    $("olho").setAttribute("aria-pressed", "false");
    $("olho").setAttribute("aria-label", "Mostrar a senha");
  }
  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (salvando || $("salvar").disabled) return;
    salvando = true;
    atualizarBotoes();
    msg("Salvando no sistema…", "");
    const r = await pedir({ tipo: "salvarLogin", dados: { usuario: $("usuario").value.trim() || null, senha: $("senha").value || null, auto } });
    salvando = false;
    if (!r?.ok) {
      msg(r?.erro ?? "Não consegui salvar — tente de novo.", "danger");
      return atualizarBotoes();
    }
    limparCampos();
    mostrarLogin(r.login);
    msg(auto ? "Login da Centi salvo (cifrado). Entrando na Centi…" : "Login da Centi salvo (cifrado).", "ok");
    acompanhar();
  });
  $("remover").addEventListener("click", () => {
    $("removerConfirma").hidden = false;
    $("removerNao").focus();
  });
  $("removerNao").addEventListener("click", () => {
    $("removerConfirma").hidden = true;
  });
  $("removerSim").addEventListener("click", async () => {
    $("removerSim").disabled = true;
    const r = await pedir({ tipo: "removerLogin" });
    $("removerSim").disabled = false;
    if (!r?.ok) return msg(r?.erro ?? "Não consegui remover — tente de novo.", "danger");
    limparCampos();
    mostrarLogin(r.login);
    msg("Login da Centi removido.", "ok");
  });
  async function loginAntigo(enviar) {
    $("antigoEnviar").disabled = true;
    $("antigoDescartar").disabled = true;
    const r = await pedir({ tipo: "loginAntigo", enviar });
    $("antigoEnviar").disabled = false;
    $("antigoDescartar").disabled = false;
    if (!r?.ok) return msg(r?.erro ?? "Não consegui — tente de novo.", "danger");
    await carregar(true);
  }
  $("antigoEnviar").addEventListener("click", () => loginAntigo(true));
  $("antigoDescartar").addEventListener("click", () => loginAntigo(false));

  // ---------------------------------------------------------------- OS AJUSTES (no sistema — os mesmos da tela)
  let ajustes = null;
  let orgaos = [];
  const msgAjustes = (texto, cor) => {
    $("msgAjustes").textContent = texto ?? "";
    $("msgAjustes").className = `msg ${cor ?? ""}`;
  };
  async function mudarAjustes(corpo) {
    const r = await pedir({ tipo: "mudarAjustes", dados: corpo });
    if (!r?.ok) {
      msgAjustes(r?.erro ?? "Não consegui salvar no sistema — tente de novo.", "danger");
      await lerAjustes();
      return null;
    }
    msgAjustes("Salvo no sistema.", "ok");
    aplicarAjustes(r, false);
    return r;
  }
  const gravacaoSw = switchDe("gravacao", (v) => {
    if (v) return void mudarGravacao(true);
    $("gravacaoConfirma").hidden = false;
    $("gravacaoNao").focus();
  });
  async function mudarGravacao(ativa) {
    $("gravacaoConfirma").hidden = true;
    gravacaoSw.definir(ativa, true);
    const r = await mudarAjustes({ gravacao: ativa });
    if (r) msgAjustes(ativa ? "Gravação na Centi ligada." : "Gravação na Centi PAUSADA.", ativa ? "ok" : "warn");
  }
  $("gravacaoNao").addEventListener("click", () => {
    $("gravacaoConfirma").hidden = true;
  });
  $("gravacaoSim").addEventListener("click", () => void mudarGravacao(false));
  const switches = {
    valorReferencia: switchDe("valorReferencia", (v) => trocarAjuste("valorReferencia", v)),
    emitirData: switchDe("emitirData", (v) => trocarAjuste("emitirData", v)),
    descobrirEntidade: switchDe("descobrirEntidade", (v) => trocarAjuste("descobrirEntidade", v)),
  };
  function trocarAjuste(k, v) {
    if (!ajustes) return;
    ajustes.ajustes[k] = v;
    switches[k].definir(v);
    void mudarAjustes({ ajustes: { [k]: v } });
  }
  // Texto: grava 700 ms depois da última tecla (e ao sair do campo).
  function campoTexto(id, montar) {
    const i = $(id);
    let t = null;
    const enviar = () => {
      clearTimeout(t);
      t = null;
      const corpo = montar(i.value);
      if (corpo) void mudarAjustes(corpo);
    };
    i.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(enviar, 700);
    });
    i.addEventListener("blur", () => {
      if (t) enviar();
    });
  }
  campoTexto("entidades", (v) => ({ ajustes: { entidades: v.slice(0, 300) } }));
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function operacaoDosCampos() {
    const mk = Number($("moduleKey").value.trim());
    const guid = $("guid").value.trim();
    if (!Number.isInteger(mk) || mk <= 0 || !GUID.test(guid)) {
      msgAjustes("ModuleKey (número) e Guid válidos para salvar a operação.", "warn");
      return null;
    }
    return { operacao: { moduleKey: mk, guid: guid.toLowerCase() } };
  }
  campoTexto("moduleKey", operacaoDosCampos);
  campoTexto("guid", operacaoDosCampos);

  function aplicarAjustes(r, comOrgaos = true) {
    ajustes = { ...(ajustes ?? {}), ...r, ajustes: { ...r.ajustes } };
    if (comOrgaos && Array.isArray(r.orgaos)) orgaos = r.orgaos;
    const a = ajustes.ajustes;
    gravacaoSw.definir(r.gravacao !== false);
    $("gravacaoRotulo").textContent = r.gravacao === false ? "Pausada (freio de emergência)" : "Ligada";
    for (const k of Object.keys(switches)) switches[k].definir(a[k] === true);
    const foco = document.activeElement;
    for (const [id, v] of [
      ["entidades", a.entidades ?? ""],
      ["moduleKey", String(r.operacao?.moduleKey ?? "")],
      ["guid", r.operacao?.guid ?? ""],
    ]) {
      $(id).disabled = false;
      if (foco !== $(id)) $(id).value = v;
    }
    $("entidades").placeholder = aberta ? `vazio = 0 a 28 (aberta: ${aberta})` : "02:03:04";
    mostrarOrgaos();
    if (r.extensao) mostrarVersaoNova(r.extensao);
  }
  function mostrarOrgaos() {
    const lista = $("listaOrgaos");
    lista.hidden = !orgaos.length;
    const mapa = ajustes?.ajustes?.mapa ?? {};
    lista.replaceChildren(
      ...orgaos.map((o) => {
        const linha = el("div", { className: "orgao" }, [el("span", { className: "nome", textContent: o.nome, title: `${o.nome} · ${o.n} DFD(s)` })]);
        if (o.fixa) linha.append(el("span", { className: "fixa", textContent: o.fixa, title: "Cadastrado no órgão" }));
        else {
          const i = el("input", { className: "celula", placeholder: "auto", value: mapa[o.chave] ?? "", maxLength: 40 });
          i.setAttribute("aria-label", `Entidade da Centi de ${o.nome}`);
          i.addEventListener("change", () => void definirEntidade(o.chave, i.value));
          linha.append(i);
          if (aberta && mapa[o.chave] !== aberta) {
            const b = el("button", { className: "btn secundario mini", type: "button", textContent: aberta, title: "Usar o órgão aberto na Centi agora" });
            b.addEventListener("click", () => void definirEntidade(o.chave, aberta));
            linha.append(b);
          }
        }
        return linha;
      }),
    );
  }
  async function definirEntidade(orgao, entidade) {
    const r = await mudarAjustes({ entidade: { orgao, entidade: entidade.trim() } });
    if (r) mostrarOrgaos();
  }
  async function lerAjustes() {
    const r = await pedir({ tipo: "ajustes" });
    if (!r?.ok) {
      msgAjustes(r?.erro ?? "Não consegui ler os ajustes do sistema.", r?.semSistema ? "warn" : "danger");
      return;
    }
    msgAjustes("");
    aplicarAjustes(r);
  }

  // ---------------------------------------------------------------- HISTÓRICO DAS EXECUÇÕES
  const ROTULO_EXEC = {
    preparada: ["Preparada", ""],
    rodando: ["Rodando", "blue"],
    pausada: ["Pausada", "amber"],
    concluida: ["Concluída", "emerald"],
    falhou: ["Falhou", "red"],
    cancelada: ["Cancelada", ""],
    fila: ["Na fila", ""],
    executando: ["Executando", "blue"],
    ok: ["Feito", "emerald"],
    pulado: ["Pulado", "amber"],
  };
  const seloExec = (e) => {
    const [t, c] = ROTULO_EXEC[e] ?? [e, ""];
    return el("span", { className: `badge dot ${c}`, textContent: t });
  };
  const textoAlvo = (a) => {
    if (!a) return "—";
    const [, id, numero, ano, descricao] = a.split("|");
    return descricao ? `${descricao} → protocolo ${numero}${ano ? `/${ano}` : ""} (Id ${id})` : a;
  };
  let execucoes = [];
  let execAberta = null;
  $("historico").addEventListener("click", async () => {
    const abrir = $("painelHistorico").hidden;
    $("painelHistorico").hidden = !abrir;
    $("historico").setAttribute("aria-expanded", String(abrir));
    if (abrir) await lerExecucoes();
  });
  async function lerExecucoes() {
    $("detalheExecucao").hidden = true;
    $("listaExecucoes").hidden = false;
    $("listaExecucoes").replaceChildren(el("div", { className: "vazio", textContent: "Carregando…" }));
    const r = await pedir({ tipo: "execucoes" });
    if (!r?.ok) return $("listaExecucoes").replaceChildren(el("div", { className: "vazio", textContent: r?.erro ?? "Falha ao carregar o histórico." }));
    execucoes = r.execucoes ?? [];
    if (!execucoes.length) return $("listaExecucoes").replaceChildren(el("div", { className: "vazio", textContent: "Nenhuma execução ainda." }));
    $("listaExecucoes").replaceChildren(
      ...execucoes.slice(0, 50).map((e) => {
        const b = el("button", { className: "item", type: "button" }, [
          el("span", { className: "linha entre" }, [el("strong", { textContent: `Nº ${e.id} · ${e.receitaNome ?? e.receita}${e.ensaio ? " (ensaio)" : ""}` }), seloExec(e.estado)]),
          el("span", {
            className: "s",
            textContent: `${e.feitos}/${e.total} passos${e.falhas ? ` · ${e.falhas} falha(s)` : ""} · ${e.usuarioNome ?? "—"} · ${e.criadoEm ? dataHora(e.criadoEm) : "—"}`,
          }),
        ]);
        b.addEventListener("click", () => void abrirExecucao(e.id));
        return b;
      }),
    );
  }
  async function abrirExecucao(id) {
    execAberta = execucoes.find((e) => e.id === id) ?? null;
    if (!execAberta) return;
    $("listaExecucoes").hidden = true;
    $("detalheExecucao").hidden = false;
    $("execTitulo").textContent = `Execução ${id} · ${execAberta.receitaNome ?? execAberta.receita}`;
    $("execErro").textContent = execAberta.erro ?? "";
    $("execCancelar").hidden = !["rodando", "pausada", "preparada"].includes(execAberta.estado);
    $("listaPassos").replaceChildren(el("div", { className: "vazio", textContent: "Carregando…" }));
    const r = await pedir({ tipo: "execucao", id });
    const passos = r?.ok ? (r.passos ?? []) : [];
    if (!passos.length) return $("listaPassos").replaceChildren(el("div", { className: "vazio", textContent: "Sem passos." }));
    $("listaPassos").replaceChildren(
      ...passos.map((p) =>
        el("div", { className: "item" }, [
          el("span", { className: "linha entre" }, [el("strong", { textContent: `#${p.ordem}` }), seloExec(p.estado)]),
          el("span", { textContent: textoAlvo(p.alvo) }),
          ...(p.erro || p.resultado ? [el("span", { className: p.erro ? "msg danger" : "s", textContent: p.erro ?? p.resultado })] : []),
        ]),
      ),
    );
  }
  $("execVoltar").addEventListener("click", () => {
    $("detalheExecucao").hidden = true;
    $("listaExecucoes").hidden = false;
  });
  $("execCancelar").addEventListener("click", async () => {
    if (!execAberta) return;
    $("execCancelar").disabled = true;
    const r = await pedir({ tipo: "cancelarExecucao", id: execAberta.id });
    $("execCancelar").disabled = false;
    if (!r?.ok) return msgAjustes(r?.erro ?? "Falha ao cancelar.", "danger");
    msgAjustes(`Execução ${execAberta.id} cancelada — os passos que faltavam não rodam mais.`, "ok");
    await lerExecucoes();
  });

  // ---------------------------------------------------------------- GRAVADOR DE RECEITAS
  let gravando = false;
  let gravados = [];
  function mostrarGravador() {
    $("gravador").textContent = gravando ? "Parar e ver a gravação" : "Gravar uma ação na Centi";
    $("gravador").className = `btn ${gravando ? "perigo" : "secundario"}`;
  }
  const resumoCorpo = (c) => {
    if (c == null) return "—";
    const t = typeof c === "string" ? c : JSON.stringify(c);
    return t.length > 160 ? `${t.slice(0, 160)}…` : t;
  };
  $("gravador").addEventListener("click", async () => {
    $("gravador").disabled = true;
    const r = await pedir({ tipo: "gravador", acao: gravando ? "parar" : "iniciar" });
    $("gravador").disabled = false;
    if (!r?.ok) return msgAjustes(`Gravador: ${r?.erro ?? "a extensão não respondeu."}`, "danger");
    const parou = gravando;
    gravando = r.gravando === true;
    mostrarGravador();
    if (!parou) {
      $("painelGravacao").hidden = true;
      return msgAjustes("Gravando: faça a ação na tela da Centi e volte para parar.", "ok");
    }
    gravados = Array.isArray(r.passos) ? r.passos : [];
    $("painelGravacao").hidden = false;
    $("gravacaoTitulo").textContent = `Gravação da Centi — ${gravados.length} pedido(s)`;
    $("copiarGravacao").disabled = !gravados.length;
    $("listaGravacao").replaceChildren(
      ...(gravados.length
        ? gravados.map((p, i) =>
            el("div", { className: "item" }, [
              el("span", { className: "mono", textContent: `${i + 1}. ${p.metodo} ${p.caminho}${p.entidade ? ` · entity ${p.entidade}` : ""}` }),
              el("span", { className: "s", textContent: (p.parametros ?? []).join(", ") || "—" }),
              el("span", { className: "mono s", textContent: resumoCorpo(p.corpo) }),
            ]),
          )
        : [el("div", { className: "vazio", textContent: "Nada gravado — ligue o gravador e faça a ação na Centi." })]),
    );
  });
  $("copiarGravacao").addEventListener("click", async () => {
    const texto = JSON.stringify(
      gravados.map(({ em: _em, ...p }) => p),
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(texto);
      $("copiarGravacao").textContent = "Copiado!";
      setTimeout(() => {
        $("copiarGravacao").textContent = "Copiar a gravação";
      }, 1500);
    } catch {
      msgAjustes("Não consegui copiar.", "danger");
    }
  });

  // ---------------------------------------------------------------- ATUALIZAÇÃO AUTOMÁTICA (o atualizador local)
  $("ajudaAtual").addEventListener("click", () => {
    const aberta = $("ajudaAtual").getAttribute("aria-expanded") === "true";
    $("ajudaAtual").setAttribute("aria-expanded", String(!aberta));
    $("textoAjudaAtual").hidden = aberta;
  });
  const INSTALAR = "Na pasta da extensão, abra atualizador/instalar-windows.bat (Windows) ou atualizador/instalar-mac.command (Mac).";
  function mostrarAtualizacao(a) {
    const s = a?.situacao;
    const [texto, cor] =
      s === "emDia"
        ? ["Ativa", "emerald"]
        : s === "ausente"
          ? ["Instale o atualizador", "amber"]
          : s === "outraPasta"
            ? ["Atualizador em outra pasta", "amber"]
            : s === "atualizando" || s === "recarregar"
              ? ["Atualizando…", "blue"]
              : s === "ocupada"
                ? ["Espera a automação terminar", "blue"]
                : s === "semSistema"
                  ? ["Entre no sistema para conferir", "amber"]
                  : s === "falhou"
                    ? ["Falhou", "red"]
                    : ["Conferindo…", ""];
    $("atualSelo").textContent = texto;
    $("atualSelo").className = `badge dot ${cor}`;
    $("atualSelo").title = texto;
    const linhas = [];
    if (s === "ausente") linhas.push(INSTALAR);
    if (s === "outraPasta") linhas.push(`O atualizador foi instalado para outra pasta${a.pasta ? ` (${a.pasta})` : ""}. ${INSTALAR}`);
    if (s === "falhou" && a.erro) linhas.push(a.erro);
    if (a?.para && a?.de && a?.atualizadaEm) linhas.push(`Atualizada de ${a.de} para ${a.para} ${haQuanto(a.atualizadaEm)}.`);
    else if (a?.verificadaEm) linhas.push(`Conferida ${haQuanto(a.verificadaEm)}${a.publicada ? ` · publicada: ${a.publicada}` : ""}.`);
    $("atualTexto").textContent = linhas.join(" ");
    $("atualTexto").className = `texto-xs${s === "falhou" ? " danger" : ""}`;
    $("atualizarAgora").disabled = s === "atualizando" || s === "recarregar";
  }
  $("atualizarAgora").addEventListener("click", async () => {
    mostrarAtualizacao({ situacao: "atualizando" });
    const r = await pedir({ tipo: "atualizarAgora" });
    mostrarAtualizacao(r?.atualizacao ?? { situacao: "falhou", erro: r?.erro ?? "A extensão não respondeu." });
  });

  // ---------------------------------------------------------------- CARREGAR e ACOMPANHAR até a Centi ficar pronta
  async function carregar(fresco = false) {
    const r = await pedir({ tipo: "estado", fresco });
    mostrarCenti(r);
    if (!r?.ok) {
      mostrarLogin(null);
      return r;
    }
    mostrarAtividade(r.atividade ?? null);
    mostrarAtualizacao(r.atualizacao ?? null);
    // Não apaga o que a pessoa está digitando: só o selo, as dicas e o "entrar sozinho" mudam.
    if (!salvando) mostrarLogin(r.login);
    if (ajustes) $("entidades").placeholder = aberta ? `vazio = 0 a 28 (aberta: ${aberta})` : "02:03:04";
    return r;
  }
  let acompanhando = 0;
  /** Enquanto o painel está aberto e a Centi não está pronta, confere de novo a cada 3 s (até 1 min). */
  function acompanhar() {
    const vez = ++acompanhando;
    const fim = Date.now() + 60000;
    const passo = async () => {
      if (vez !== acompanhando || Date.now() > fim) return;
      const r = await carregar();
      if (r?.ok && r.centi !== "logada" && !r.login?.semSistema) setTimeout(passo, 3000);
    };
    setTimeout(passo, 3000);
  }
  $("aba").addEventListener("click", async () => {
    await pedir({ tipo: "irParaAba" });
    window.close();
  });
  // Ao vivo: o andamento e a confirmação mudam no armazenamento da sessão da extensão.
  chrome.storage.session.onChanged.addListener((m) => {
    if (m.atividade) mostrarAtividade(m.atividade.newValue ?? null);
    if (m.confirmacao) mostrarConfirmacao(m.confirmacao.newValue ?? null);
  });
  chrome.storage.local.onChanged?.addListener((m) => {
    if (m.atualizacao) mostrarAtualizacao(m.atualizacao.newValue ?? null);
  });
  mostrarGravador();
  carregar(true).then(async (r) => {
    if (r?.ok && r.centi !== "logada" && !r.login?.semSistema) acompanhar();
    void lerAjustes();
    // Uma gravação começada antes (aqui ou na tela do sistema) aparece como "Parar e ver a gravação".
    if (r?.centi === "logada") {
      const g = await pedir({ tipo: "gravador", acao: "consultar" });
      if (g?.ok) {
        gravando = g.gravando === true;
        mostrarGravador();
      }
    }
  });
  chrome.storage.session
    .get("confirmacao")
    .then((x) => mostrarConfirmacao(x.confirmacao ?? null))
    .catch(() => {});
})();
