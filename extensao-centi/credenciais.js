// O BANNER flutuante das credenciais da Centi (janela da própria extensão): salvar UMA vez (cifrado no cofre — cofre.js)
// e entrar na hora pela aba da automação. Depois de entrar, fecha sozinho.
(() => {
  const C = globalThis.CofreCenti;
  const $ = (id) => document.getElementById(id);
  const quando = (ms) => new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const RESULTADO = { ok: "entrou", recusado: "senha recusada", bloqueio: "verificação pedida", "sem-resposta": "sem resposta da Centi", falha: "falhou" };

  function situacao(texto, classe) {
    const s = $("situacao");
    s.textContent = texto;
    s.className = `situacao ${classe ?? ""}`;
  }

  async function mostrar() {
    const c = await C.lerConfig();
    $("auto").checked = c.auto;
    $("esquecer").disabled = !c.tem;
    if (c.tem) {
      const cred = await C.credenciais().catch(() => null);
      if (cred && !$("usuario").value) $("usuario").value = cred.usuario;
      $("senha").placeholder = "•••••••• (salva — digite só para trocar)";
    } else $("senha").placeholder = "Senha da Centi";
    const ultima = c.ultima ? ` Última tentativa: ${quando(c.ultima.quando)} (${RESULTADO[c.ultima.resultado] ?? c.ultima.resultado}).` : "";
    if (!c.tem) situacao("Informe o usuário e a senha da Centi.", "alerta");
    else if (c.pausadoEm) situacao(`Pausado em ${quando(c.pausadoEm)}: ${c.motivo ?? ""}`, "erro");
    else if (!c.auto) situacao(`Credenciais salvas; login automático desligado.${ultima}`, "alerta");
    else situacao(`Pronto: entra sozinho quando a sessão cair.${ultima}`, "ok");
    return c;
  }

  $("form").addEventListener("submit", async (e) => {
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
      return situacao("Não consegui guardar as credenciais neste navegador.", "erro");
    }
    situacao("Salvo. Entrando na Centi pela aba da automação…");
    try {
      const r = await chrome.runtime.sendMessage({ tipo: "entrarAgora" });
      if (r?.ok) {
        situacao("Centi logada. Esta janela fecha sozinha.", "ok");
        setTimeout(() => window.close(), 1500);
        return;
      }
      situacao(r?.erro ?? "Não consegui entrar.", "erro");
    } catch {
      situacao("A extensão não respondeu.", "erro");
    }
    $("salvar").disabled = false;
    setTimeout(() => mostrar(), 2500);
  });
  $("auto").addEventListener("change", async () => {
    if ((await C.lerConfig()).tem) {
      await C.mudarAuto($("auto").checked);
      await mostrar();
    }
  });
  $("esquecer").addEventListener("click", async () => {
    if (!confirm("Esquecer o usuário e a senha da Centi neste navegador?")) return;
    await C.esquecer();
    $("usuario").value = "";
    $("senha").value = "";
    await mostrar();
  });
  mostrar().then((c) => (c.tem ? $("senha") : $("usuario")).focus());
})();
