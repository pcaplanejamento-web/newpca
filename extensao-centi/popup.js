// O POPUP da extensão (o DROPDOWN do ícone): a situação da Centi, o que a automação está fazendo agora, INTERROMPER e a
// SITUAÇÃO do login da Centi — o login fica SÓ no sistema PCA (cifrado no banco, na conta de cada ADM); aqui não se
// digita nem se guarda senha: "Configurar no sistema" abre a tela dele.
(() => {
  const $ = (id) => document.getElementById(id);
  const janela = new URLSearchParams(location.search).has("janela");
  if (janela) document.body.classList.add("janela");
  const CENTI = {
    logada: ["Centi logada na aba da automação", "ok"],
    login: ["Centi na tela de login", "alerta"],
    semSessao: ["Centi aberta, aguardando a sessão", "alerta"],
    semAba: ["Aba da automação fechada", "erro"],
  };
  const ESTADO = { rodando: "Em andamento", concluido: "Concluído", interrompido: "Interrompido", parado: "Parou" };

  // A PERMISSÃO de gravar na Centi (o serviço pede; só este painel da extensão responde — a página do sistema não o alcança).
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
    await chrome.runtime.sendMessage({ tipo: "confirmacao", pedido: pedidoAtual, sim }).catch(() => {});
    mostrarConfirmacao(null);
    if (janela && new URLSearchParams(location.search).has("confirmar")) window.close();
  }
  $("confSim").addEventListener("click", () => responderConfirmacao(true));
  $("confNao").addEventListener("click", () => responderConfirmacao(false));

  function mostrarAtividade(a) {
    $("atividade").hidden = !a;
    $("parar").hidden = a?.estado !== "rodando";
    $("parar").disabled = false;
    $("parar").textContent = "Interromper";
    if (!a) return;
    $("titulo").textContent = `${a.titulo} · ${ESTADO[a.estado] ?? a.estado}`;
    $("passo").textContent = `${a.passo}${a.total ? ` (${Math.min(a.feito, a.total)} de ${a.total})` : ""}`;
    $("barra").style.width = a.total ? `${Math.round((Math.min(a.feito, a.total) / a.total) * 100)}%` : "0";
    $("passos").replaceChildren(
      ...(a.passos ?? []).slice(0, 10).map((p) => {
        const li = document.createElement("li");
        li.textContent = p.texto;
        return li;
      }),
    );
  }

  function situacao(texto, classe) {
    $("situacao").textContent = texto;
    $("situacao").className = `msg ${classe ?? ""}`;
  }

  /** A situação do login (do sistema) — sem senha. */
  function mostrarLogin(r) {
    const l = r?.login ?? null;
    let texto = "Conferindo…";
    let classe = "";
    if (!l) texto = "Sem resposta do sistema PCA.";
    else if (l.semSistema) [texto, classe] = [l.erro ?? "Entre no sistema PCA neste navegador.", "alerta"];
    else if (!l.credenciais) [texto, classe] = ["Não configurado — salve o usuário e a senha da Centi no sistema.", "alerta"];
    else if (l.pausado) [texto, classe] = [`Pausado: ${l.motivo ?? "a Centi recusou o login"}. Salve de novo no sistema.`, "erro"];
    else if (!l.auto) [texto, classe] = ["Guardado no sistema; entrar sozinho está desligado.", "alerta"];
    else [texto, classe] = ["Guardado no sistema: a extensão entra sozinha quando a sessão cair.", "ok"];
    situacao(texto, classe);
    $("entrar").hidden = !(l?.credenciais && !l.pausado && r.centi !== "logada");
  }

  async function carregar() {
    const r = await chrome.runtime.sendMessage({ tipo: "estado" }).catch(() => null);
    if (!r?.ok) {
      $("centi").textContent = "A extensão não respondeu.";
      $("ponto").className = "p erro";
      mostrarLogin(null);
      return;
    }
    const [texto, cor] = CENTI[r.centi] ?? ["—", ""];
    const pausa = r.login?.pausado ? " · login pausado" : !r.login?.credenciais ? " · sem login salvo" : "";
    $("centi").textContent = `${texto}${r.entidade ? ` (${r.entidade})` : ""}${pausa}`;
    $("ponto").className = `p ${r.login?.pausado ? "erro" : cor}`;
    mostrarAtividade(r.atividade ?? null);
    mostrarLogin(r);
  }

  $("configurar").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ tipo: "configurarLogin" }).catch(() => {});
    window.close();
  });
  $("entrar").addEventListener("click", async () => {
    $("entrar").disabled = true;
    situacao("Entrando na Centi pela aba da automação…");
    const r = await chrome.runtime.sendMessage({ tipo: "entrarAgora" }).catch(() => null);
    $("entrar").disabled = false;
    if (r?.ok) situacao("Centi logada.", "ok");
    else situacao(r?.erro ?? "Não consegui entrar.", "erro");
    await carregar();
  });
  $("parar").addEventListener("click", async () => {
    $("parar").disabled = true;
    $("parar").textContent = "Interrompendo…";
    await chrome.runtime.sendMessage({ tipo: "interromper" }).catch(() => {});
  });
  $("aba").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ tipo: "irParaAba" }).catch(() => {});
    window.close();
  });
  // Ao vivo: o andamento muda no armazenamento da sessão da extensão.
  chrome.storage.session.onChanged.addListener((m) => {
    if (m.atividade) mostrarAtividade(m.atividade.newValue ?? null);
    if (m.confirmacao) mostrarConfirmacao(m.confirmacao.newValue ?? null);
  });
  carregar();
  chrome.storage.session
    .get("confirmacao")
    .then((x) => mostrarConfirmacao(x.confirmacao ?? null))
    .catch(() => {});
})();
