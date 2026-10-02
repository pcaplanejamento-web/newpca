// Página de opções da extensão: o usuário e a senha da Centi (cifrados no cofre — cofre.js) e o login automático.
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
    $("testar").disabled = !c.tem || !!c.pausadoEm;
    if (c.tem) {
      const cred = await C.credenciais().catch(() => null);
      if (cred && !$("usuario").value) $("usuario").value = cred.usuario;
      $("senha").placeholder = "•••••••• (salva — digite só para trocar)";
    } else $("senha").placeholder = "Digite a senha da Centi";
    const ultima = c.ultima ? ` Última tentativa: ${quando(c.ultima.quando)} (${RESULTADO[c.ultima.resultado] ?? c.ultima.resultado}).` : "";
    if (!c.tem) situacao("Sem credenciais: o login automático não roda.", "alerta");
    else if (c.pausadoEm) situacao(`Pausado em ${quando(c.pausadoEm)}: ${c.motivo ?? ""}`, "erro");
    else if (!c.auto) situacao(`Credenciais salvas; login automático desligado.${ultima}`, "alerta");
    else situacao(`Pronto: entra sozinho quando a sessão cair.${ultima}`, "ok");
  }

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario = $("usuario").value.trim();
    let senha = $("senha").value;
    if (!senha) senha = (await C.credenciais().catch(() => null))?.senha ?? "";
    if (!usuario || !senha) return situacao("Informe o usuário e a senha.", "erro");
    try {
      await C.salvar(usuario, senha, $("auto").checked);
      $("senha").value = "";
      await mostrar();
    } catch {
      situacao("Não consegui guardar as credenciais neste navegador.", "erro");
    }
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
  $("testar").addEventListener("click", async () => {
    $("testar").disabled = true;
    situacao("Entrando na Centi…");
    try {
      const r = await chrome.runtime.sendMessage({ tipo: "entrarAgora" });
      if (r?.ok) situacao("Centi logada.", "ok");
      else situacao(r?.erro ?? "Não consegui entrar.", "erro");
    } catch {
      situacao("A extensão não respondeu.", "erro");
    }
    setTimeout(() => mostrar(), 2500);
  });
  mostrar();
})();
