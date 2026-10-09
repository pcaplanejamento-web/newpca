// O POPUP da extensão (o DROPDOWN do ícone): a situação da Centi, o que a automação está fazendo agora, INTERROMPER e o
// LOGIN da Centi (usuário e senha salvos uma vez, cifrados no cofre — cofre.js; e, se a pessoa marcar, guardados cifrados
// também no sistema PCA, para voltarem sozinhos depois de reinstalar a extensão).
(() => {
  const C = globalThis.CofreCenti;
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
  const quando = (ms) => new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

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

  // O formulário aparece sozinho sem login salvo ou com o login pausado; "Login da Centi" mostra/esconde.
  async function mostrarLogin(abrir) {
    let c = await C.lerConfig();
    // Sem login aqui (extensão reinstalada): o guardado no sistema volta sozinho.
    if (!c.tem && (await chrome.runtime.sendMessage({ tipo: "restaurarLogin" }).catch(() => null))?.ok) c = await C.lerConfig();
    const { credNoSistema } = await chrome.storage.local.get("credNoSistema");
    if (c.tem) $("noSistema").checked = credNoSistema === true;
    $("auto").checked = c.auto;
    $("esquecer").disabled = !c.tem;
    if (c.tem) {
      const cred = await C.credenciais().catch(() => null);
      if (cred && !$("usuario").value) $("usuario").value = cred.usuario;
      $("senha").placeholder = "•••••••• (salva — digite só para trocar)";
    } else $("senha").placeholder = "Senha da Centi";
    if (!c.tem) situacao("Informe o usuário e a senha da Centi.", "alerta");
    else if (c.pausadoEm) situacao(`Pausado em ${quando(c.pausadoEm)}: ${c.motivo ?? ""}`, "erro");
    else if (!c.auto) situacao("Salvo; login automático desligado.", "alerta");
    else situacao(`Salvo: entra sozinho quando a sessão cair${credNoSistema ? " · guardado também no sistema" : ""}.`, "ok");
    const ver = abrir ?? (janela || !c.tem || !!c.pausadoEm);
    $("login").hidden = !ver;
    if (ver) (c.tem ? $("senha") : $("usuario")).focus();
  }

  async function carregar() {
    const r = await chrome.runtime.sendMessage({ tipo: "estado" }).catch(() => null);
    if (!r?.ok) {
      $("centi").textContent = "A extensão não respondeu.";
      $("ponto").className = "p erro";
      return;
    }
    const [texto, cor] = CENTI[r.centi] ?? ["—", ""];
    const pausa = r.login?.pausado ? " · login pausado" : !r.login?.credenciais ? " · sem login salvo" : "";
    $("centi").textContent = `${texto}${r.entidade ? ` (${r.entidade})` : ""}${pausa}`;
    $("ponto").className = `p ${r.login?.pausado ? "erro" : cor}`;
    mostrarAtividade(r.atividade ?? null);
  }

  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario = $("usuario").value.trim();
    let senha = $("senha").value;
    if (!senha) senha = (await C.credenciais().catch(() => null))?.senha ?? "";
    if (!usuario || !senha) return situacao("Informe o usuário e a senha.", "erro");
    $("salvar").disabled = true;
    try {
      await C.salvar(usuario, senha, $("auto").checked);
      $("senha").value = "";
    } catch {
      $("salvar").disabled = false;
      return situacao("Não consegui guardar neste navegador.", "erro");
    }
    const guardar = await chrome.runtime.sendMessage({ tipo: "loginNoSistema", guardar: $("noSistema").checked }).catch(() => null);
    if ($("noSistema").checked && !guardar?.ok) situacao(`Salvo na extensão; não guardou no sistema: ${guardar?.erro ?? "sem resposta"}. Entrando na Centi…`, "alerta");
    else situacao("Salvo. Entrando na Centi pela aba da automação…");
    const r = await chrome.runtime.sendMessage({ tipo: "entrarAgora" }).catch(() => null);
    $("salvar").disabled = false;
    if (r?.ok) {
      situacao("Centi logada.", "ok");
      await carregar();
      if (janela) setTimeout(() => window.close(), 1200);
      return;
    }
    situacao(r?.erro ?? "Não consegui entrar.", "erro");
    await carregar();
  });
  $("auto").addEventListener("change", async () => {
    if ((await C.lerConfig()).tem) {
      await C.mudarAuto($("auto").checked);
      if ((await chrome.storage.local.get("credNoSistema")).credNoSistema) await chrome.runtime.sendMessage({ tipo: "loginNoSistema", guardar: true }).catch(() => null);
      await mostrarLogin(true);
    }
  });
  // Guardar/tirar do sistema na hora (com o login já salvo).
  $("noSistema").addEventListener("change", async () => {
    if (!(await C.lerConfig()).tem) return;
    const r = await chrome.runtime.sendMessage({ tipo: "loginNoSistema", guardar: $("noSistema").checked }).catch(() => null);
    if (!r?.ok) {
      $("noSistema").checked = !$("noSistema").checked;
      return situacao(`Sistema PCA: ${r?.erro ?? "sem resposta"}`, "erro");
    }
    await mostrarLogin(true);
  });
  $("esquecer").addEventListener("click", async () => {
    const { credNoSistema } = await chrome.storage.local.get("credNoSistema");
    if (!confirm(`Esquecer o usuário e a senha da Centi neste navegador${credNoSistema ? " e no sistema PCA" : ""}?`)) return;
    if (credNoSistema) {
      const r = await chrome.runtime.sendMessage({ tipo: "loginNoSistema", guardar: false }).catch(() => null);
      if (!r?.ok) return situacao(`Não consegui tirar do sistema PCA: ${r?.erro ?? "sem resposta"}`, "erro");
    }
    await C.esquecer();
    $("usuario").value = "";
    $("senha").value = "";
    await mostrarLogin(true);
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
  $("abrirLogin").addEventListener("click", () => mostrarLogin($("login").hidden));
  // Ao vivo: o andamento muda no armazenamento da sessão da extensão.
  chrome.storage.session.onChanged.addListener((m) => {
    if (m.atividade) mostrarAtividade(m.atividade.newValue ?? null);
  });
  carregar();
  mostrarLogin();
})();
