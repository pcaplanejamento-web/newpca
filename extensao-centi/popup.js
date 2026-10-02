// O POPUP da extensão (clicar no ícone): a situação da Centi, o que a automação está fazendo agora e INTERROMPER.
// Nunca lê nem mostra credenciais (o banner das credenciais é outra janela).
(() => {
  const $ = (id) => document.getElementById(id);
  const CENTI = {
    logada: ["Centi logada na aba da automação", "ok"],
    login: ["Centi na tela de login", "alerta"],
    semSessao: ["Centi aberta, aguardando a sessão", "alerta"],
    semAba: ["Aba da automação fechada", "erro"],
  };
  const ESTADO = { rodando: "Em andamento", concluido: "Concluído", interrompido: "Interrompido", parado: "Parou" };

  function mostrarAtividade(a) {
    $("atividade").hidden = !a;
    $("parar").hidden = a?.estado !== "rodando";
    $("parar").disabled = false;
    $("parar").textContent = "Interromper";
    if (!a) return;
    $("titulo").textContent = `${a.titulo} · ${ESTADO[a.estado] ?? a.estado}`;
    $("passo").textContent = `${a.passo}${a.total ? ` (${Math.min(a.feito, a.total)} de ${a.total})` : ""}`;
    $("barra").style.width = a.total ? `${Math.round((Math.min(a.feito, a.total) / a.total) * 100)}%` : "0";
    const ol = $("passos");
    ol.replaceChildren(
      ...(a.passos ?? []).slice(0, 10).map((p) => {
        const li = document.createElement("li");
        li.textContent = p.texto;
        return li;
      }),
    );
  }

  async function carregar() {
    const r = await chrome.runtime.sendMessage({ tipo: "estado" }).catch(() => null);
    if (!r?.ok) {
      $("centi").textContent = "A extensão não respondeu.";
      $("ponto").className = "p erro";
      return;
    }
    const [texto, cor] = CENTI[r.centi] ?? ["—", ""];
    const pausa = r.login?.pausado ? ` · login pausado: ${r.login.motivo ?? ""}` : !r.login?.credenciais ? " · sem login salvo" : "";
    $("centi").textContent = `${texto}${r.entidade ? ` (${r.entidade})` : ""}${pausa}`;
    $("ponto").className = `p ${r.login?.pausado ? "erro" : cor}`;
    mostrarAtividade(r.atividade ?? null);
  }

  $("parar").addEventListener("click", async () => {
    $("parar").disabled = true;
    $("parar").textContent = "Interrompendo…";
    await chrome.runtime.sendMessage({ tipo: "interromper" }).catch(() => {});
  });
  $("aba").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ tipo: "irParaAba" }).catch(() => {});
    window.close();
  });
  $("login").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ tipo: "credenciais" }).catch(() => {});
    window.close();
  });
  // Ao vivo: o andamento muda no armazenamento da sessão da extensão.
  chrome.storage.session.onChanged.addListener((m) => {
    if (m.atividade) mostrarAtividade(m.atividade.newValue ?? null);
  });
  carregar();
})();
